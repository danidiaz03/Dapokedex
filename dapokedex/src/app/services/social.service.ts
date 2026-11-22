import { DOCUMENT, Injectable, effect, inject } from '@angular/core';
import {
  DocumentSnapshot,
  QueryDocumentSnapshot,
  Unsubscribe,
  collection,
  deleteDoc,
  doc,
  documentId,
  endAt,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAt,
  where,
  writeBatch,
} from 'firebase/firestore';
import { firebaseApp } from '../firebase';
import { FirestoreService } from './firestore.service';
import { ChallengeInfo, SocialState } from './social-state';
import { levelFromXp, normalizeProgress, trainerTitle } from '../game/progress';
import {
  CHALLENGE_TTL_MS,
  FriendRequest,
  HEARTBEAT_MS,
  MAX_TEAM_SHOWN,
  PublicProfile,
  friendshipId,
  isValidUsername,
  requestId,
} from '../game/social';

const db = getFirestore(firebaseApp);

/** Firestore admite como mucho 30 valores en un filtro "in". */
const IN_LIMIT = 30;

const millis = (value: unknown): number =>
  value && typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ? (value as { toMillis: () => number }).toMillis()
    : 0;

function toProfile(snap: DocumentSnapshot | QueryDocumentSnapshot): PublicProfile | null {
  if (!snap.exists()) return null;
  const d = snap.data({ serverTimestamps: 'estimate' });
  return {
    uid: snap.id,
    username: d['username'] ?? '',
    title: d['title'] ?? '',
    level: d['level'] ?? 1,
    xp: d['xp'] ?? 0,
    team: Array.isArray(d['team']) ? d['team'] : [],
    collectionCount: d['collectionCount'] ?? 0,
    achievements: d['achievements'] ?? 0,
    lastSeen: millis(d['lastSeen']),
  };
}

function toRequest(snap: QueryDocumentSnapshot): FriendRequest {
  const d = snap.data({ serverTimestamps: 'estimate' });
  return {
    id: snap.id,
    from: d['from'],
    to: d['to'],
    fromName: d['fromName'] ?? '',
    toName: d['toName'] ?? '',
    createdAt: millis(d['createdAt']),
  };
}

export class UsernameTakenError extends Error {
  constructor() {
    super('Ese nombre ya lo usa otro entrenador.');
  }
}

/**
 * Amigos: perfil público, solicitudes y amistades. Se carga en diferido
 * (desde App al iniciar sesión) para no meter Firestore en la carga inicial.
 */
@Injectable({ providedIn: 'root' })
export class SocialService {
  private firestore = inject(FirestoreService);
  private state = inject(SocialState);
  private document = inject(DOCUMENT);

  private uid: string | null = null;
  private listeners: Unsubscribe[] = [];
  private heartbeat?: ReturnType<typeof setInterval>;
  private publishTimer?: ReturnType<typeof setTimeout>;
  private lastPublish = 0;
  private onVisible = () => {
    if (this.document.visibilityState === 'visible' && Date.now() - this.lastPublish > HEARTBEAT_MS)
      this.schedulePublish(0);
  };

  constructor() {
    // Cuando cambian los datos del jugador (equipo, colección, XP) se
    // actualiza su perfil público, agrupando los cambios seguidos.
    effect(() => {
      if (this.firestore.changes() > 0) this.schedulePublish(3000);
    });
  }

  /** Empieza a escuchar solicitudes y amistades del jugador que ha entrado. */
  async start(uid: string): Promise<void> {
    if (this.uid === uid) return;
    this.stop();
    this.uid = uid;

    const profile = await getDoc(doc(db, 'profiles', uid)).catch(() => null);
    if (this.uid !== uid) return;
    this.state.username.set(profile?.exists() ? (profile.get('username') ?? null) : null);

    this.listeners.push(
      onSnapshot(query(collection(db, 'friendRequests'), where('to', '==', uid)), (s) =>
        this.state.incoming.set(s.docs.map(toRequest).sort((a, b) => b.createdAt - a.createdAt)),
      ),
      onSnapshot(query(collection(db, 'friendRequests'), where('from', '==', uid)), (s) =>
        this.state.outgoing.set(s.docs.map(toRequest)),
      ),
      onSnapshot(query(collection(db, 'friendships'), where('users', 'array-contains', uid)), (s) =>
        this.state.friendIds.set(
          s.docs.map((d) => (d.get('users') as string[]).find((u) => u !== uid) ?? ''),
        ),
      ),
    );

    // Retos recibidos (caducan a los 10 minutos) y combates en curso.
    const fresh = (createdAt: number) => Date.now() - createdAt < CHALLENGE_TTL_MS;
    const battles = collection(db, 'battles');
    this.listeners.push(
      onSnapshot(
        query(battles, where('guest', '==', uid), where('status', '==', 'pending')),
        (s) =>
          this.state.challenges.set(
            s.docs
              .map((d) => ({
                id: d.id,
                opponent: d.get('hostName') ?? '',
                createdAt: millis(d.get('createdAt')) || Date.now(),
              }))
              .filter((c) => fresh(c.createdAt))
              .sort((a, b) => b.createdAt - a.createdAt),
          ),
        () => this.state.challenges.set([]),
      ),
    );
    const active: Record<'host' | 'guest', ChallengeInfo[]> = { host: [], guest: [] };
    for (const role of ['host', 'guest'] as const) {
      this.listeners.push(
        onSnapshot(
          query(battles, where(role, '==', uid), where('status', '==', 'active')),
          (s) => {
            active[role] = s.docs.map((d) => ({
              id: d.id,
              opponent: d.get(role === 'host' ? 'guestName' : 'hostName') ?? '',
              createdAt: millis(d.get('createdAt')),
            }));
            this.state.activeBattles.set([...active.host, ...active.guest]);
          },
          () => {},
        ),
      );
    }

    if (this.state.username()) this.schedulePublish(0);
    this.heartbeat = setInterval(() => {
      if (this.document.visibilityState === 'visible') this.schedulePublish(0);
    }, HEARTBEAT_MS);
    this.document.addEventListener('visibilitychange', this.onVisible);
  }

  stop(): void {
    this.listeners.forEach((u) => u());
    this.listeners = [];
    clearInterval(this.heartbeat);
    clearTimeout(this.publishTimer);
    this.document.removeEventListener('visibilitychange', this.onVisible);
    this.uid = null;
    this.state.reset();
  }

  private schedulePublish(delay: number) {
    if (!this.uid || !this.state.username()) return;
    clearTimeout(this.publishTimer);
    this.publishTimer = setTimeout(() => {
      this.publish().catch((e) => console.warn('No se pudo actualizar el perfil', e));
    }, delay);
  }

  /** Datos del perfil público sacados del documento privado del jugador. */
  private async buildProfile(uid: string, username: string) {
    const data = await this.firestore.getUserData(uid);
    const progress = normalizeProgress(data.progress as never);
    return {
      username,
      title: trainerTitle(progress.achievements),
      level: Math.min(100, levelFromXp(progress.xp)),
      xp: progress.xp,
      team: data.team.slice(0, MAX_TEAM_SHOWN),
      collectionCount: data.collection.length,
      achievements: progress.achievements.length,
      lastSeen: serverTimestamp(),
    };
  }

  /** Publica el perfil y marca al jugador como conectado. */
  async publish(): Promise<void> {
    const uid = this.uid;
    const username = this.state.username();
    if (!uid || !username) return;
    this.lastPublish = Date.now();
    await setDoc(doc(db, 'profiles', uid), await this.buildProfile(uid, username));
  }

  /**
   * Reserva un nombre de usuario y publica el perfil. Si ya tenía otro, lo
   * suelta en la misma escritura para que nadie se quede con los dos.
   */
  async claimUsername(name: string): Promise<void> {
    const uid = this.uid;
    if (!uid) throw new Error('Inicia sesión para elegir un nombre.');
    if (!isValidUsername(name)) throw new Error('Usa de 3 a 16 letras, números o _.');
    const previous = this.state.username();
    if (previous === name) return;

    const taken = await getDoc(doc(db, 'usernames', name));
    if (taken.exists() && taken.get('uid') !== uid) throw new UsernameTakenError();

    const batch = writeBatch(db);
    if (!taken.exists()) batch.set(doc(db, 'usernames', name), { uid });
    batch.set(doc(db, 'profiles', uid), await this.buildProfile(uid, name));
    if (previous) batch.delete(doc(db, 'usernames', previous));
    try {
      await batch.commit();
    } catch (e) {
      // Si otro lo reservó justo entre la comprobación y la escritura.
      const now = await getDoc(doc(db, 'usernames', name)).catch(() => null);
      if (now?.exists() && now.get('uid') !== uid) throw new UsernameTakenError();
      throw e;
    }
    this.lastPublish = Date.now();
    this.state.username.set(name);
  }

  async getProfile(uid: string): Promise<PublicProfile | null> {
    return toProfile(await getDoc(doc(db, 'profiles', uid)));
  }

  async getProfileByUsername(name: string): Promise<PublicProfile | null> {
    if (!isValidUsername(name)) return null;
    const ref = await getDoc(doc(db, 'usernames', name));
    if (!ref.exists()) return null;
    return this.getProfile(ref.get('uid'));
  }

  /** Perfiles cuyo nombre empieza por lo que se ha escrito. */
  async search(prefix: string): Promise<PublicProfile[]> {
    if (prefix.length < 2) return [];
    const snap = await getDocs(
      query(
        collection(db, 'profiles'),
        orderBy('username'),
        startAt(prefix),
        endAt(prefix + ''),
        limit(10),
      ),
    );
    return snap.docs.map(toProfile).filter((p): p is PublicProfile => !!p);
  }

  /** Perfiles de varios jugadores (por ejemplo, todos tus amigos). */
  async getProfiles(uids: string[]): Promise<PublicProfile[]> {
    const ids = [...new Set(uids.filter(Boolean))];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += IN_LIMIT) chunks.push(ids.slice(i, i + IN_LIMIT));
    const snaps = await Promise.all(
      chunks.map((c) => getDocs(query(collection(db, 'profiles'), where(documentId(), 'in', c)))),
    );
    return snaps.flatMap((s) => s.docs.map(toProfile)).filter((p): p is PublicProfile => !!p);
  }

  /** Uids de los amigos leídos ahora mismo (sin esperar a la escucha en vivo). */
  async getFriendIds(uid: string): Promise<string[]> {
    const snap = await getDocs(
      query(collection(db, 'friendships'), where('users', 'array-contains', uid)),
    );
    return snap.docs.map((d) => (d.get('users') as string[]).find((u) => u !== uid) ?? '');
  }

  /**
   * Envía una solicitud. Si el otro ya te había enviado una, se acepta
   * directamente en vez de crear una segunda.
   */
  async sendRequest(to: PublicProfile): Promise<void> {
    const uid = this.uid;
    const me = this.state.username();
    if (!uid || !me) throw new Error('Elige antes tu nombre de entrenador.');
    const reverse = this.state.incoming().find((r) => r.from === to.uid);
    if (reverse) return this.accept(reverse);
    await setDoc(doc(db, 'friendRequests', requestId(uid, to.uid)), {
      from: uid,
      to: to.uid,
      fromName: me,
      toName: to.username,
      createdAt: serverTimestamp(),
    });
  }

  /** Acepta una solicitud: crea la amistad y borra la solicitud a la vez. */
  async accept(request: FriendRequest): Promise<void> {
    const uid = this.uid;
    if (!uid || request.to !== uid) return;
    const users = [request.from, uid].sort();
    const batch = writeBatch(db);
    batch.set(doc(db, 'friendships', friendshipId(request.from, uid)), {
      users,
      since: serverTimestamp(),
    });
    batch.delete(doc(db, 'friendRequests', request.id));
    await batch.commit();
  }

  /** Rechaza una solicitud recibida o cancela una enviada. */
  async dismiss(request: FriendRequest): Promise<void> {
    await deleteDoc(doc(db, 'friendRequests', request.id));
  }

  async removeFriend(otherUid: string): Promise<void> {
    if (!this.uid) return;
    await deleteDoc(doc(db, 'friendships', friendshipId(this.uid, otherUid)));
  }
}
