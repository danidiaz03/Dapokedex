import { Injectable, inject } from '@angular/core';
import {
  DocumentSnapshot,
  Unsubscribe,
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { firebaseApp } from '../firebase';
import { SocialState } from './social-state';
import { Action, BattleState, Combatant } from '../game/battle-engine';
import {
  CLAIM_GRACE_MS,
  LogEntry,
  Outcome,
  Role,
  TURN_MS,
  completeEntry,
  newSeed,
  otherRole,
} from '../game/online-battle';

const db = getFirestore(firebaseApp);

export type MatchStatus = 'pending' | 'active' | 'finished' | 'declined' | 'cancelled';
export type FinishReason = 'ko' | 'forfeit' | 'timeout';
export type Choice = Action | number;

export interface Match {
  id: string;
  host: string;
  guest: string;
  hostName: string;
  guestName: string;
  status: MatchStatus;
  seed: number;
  hostTeam: Combatant[] | null;
  guestTeam: Combatant[] | null;
  log: LogEntry[];
  pending: { host?: Choice | null; guest?: Choice | null };
  /** Hasta cuándo (ms) hay para decidir antes de poder reclamar la victoria. */
  deadline: number;
  winner: Outcome;
  reason: FinishReason | null;
  createdAt: number;
}

const millis = (v: unknown) =>
  v && typeof (v as { toMillis?: unknown }).toMillis === 'function'
    ? (v as { toMillis: () => number }).toMillis()
    : Date.now();

function toMatch(snap: DocumentSnapshot): Match | null {
  if (!snap.exists()) return null;
  const d = snap.data({ serverTimestamps: 'estimate' });
  return {
    id: snap.id,
    host: d['host'],
    guest: d['guest'],
    hostName: d['hostName'] ?? '',
    guestName: d['guestName'] ?? '',
    status: d['status'],
    seed: d['seed'] ?? 0,
    hostTeam: d['hostTeam'] ?? null,
    guestTeam: d['guestTeam'] ?? null,
    log: d['log'] ?? [],
    pending: d['pending'] ?? {},
    deadline: d['deadline'] ?? 0,
    winner: d['winner'] ?? null,
    reason: d['reason'] ?? null,
    createdAt: millis(d['createdAt']),
  };
}

/** Firestore no admite undefined: se limpia el objeto pasándolo por JSON. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Error cuando el registro ha avanzado mientras decidías (se reintenta al sincronizar). */
export class OutOfSyncError extends Error {}

/**
 * Partidas en línea entre amigos (colección battles). Cada jugador solo
 * escribe su equipo y sus decisiones; el combate lo reproduce cada navegador.
 */
@Injectable({ providedIn: 'root' })
export class OnlineBattleService {
  private state = inject(SocialState);

  private ref(id: string) {
    return doc(db, 'battles', id);
  }

  /** Reta a un amigo. Devuelve el id de la partida. */
  async challenge(me: string, friend: { uid: string; username: string }): Promise<string> {
    const myName = this.state.username();
    if (!myName) throw new Error('Elige antes tu nombre de entrenador.');
    const ref = await addDoc(collection(db, 'battles'), {
      host: me,
      guest: friend.uid,
      hostName: myName,
      guestName: friend.username,
      status: 'pending',
      seed: newSeed(),
      hostTeam: null,
      guestTeam: null,
      log: [],
      pending: {},
      deadline: Date.now() + TURN_MS,
      winner: null,
      reason: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  watch(id: string, cb: (match: Match | null) => void, onError: (e: unknown) => void): Unsubscribe {
    return onSnapshot(this.ref(id), (s) => cb(toMatch(s)), onError);
  }

  /** Guarda el equipo con el que juega cada uno (solo una vez). */
  async setTeam(id: string, role: Role, team: Combatant[]): Promise<void> {
    await updateDoc(this.ref(id), {
      [role === 'host' ? 'hostTeam' : 'guestTeam']: plain(team),
      updatedAt: serverTimestamp(),
    });
  }

  /** El invitado acepta: empieza el reloj del primer turno. */
  async accept(id: string, team: Combatant[]): Promise<void> {
    await runTransaction(db, async (tx) => {
      const match = toMatch(await tx.get(this.ref(id)));
      if (!match || match.status !== 'pending') throw new Error('El reto ya no está disponible.');
      tx.update(this.ref(id), {
        guestTeam: plain(team),
        status: 'active',
        deadline: Date.now() + TURN_MS,
        updatedAt: serverTimestamp(),
      });
    });
  }

  async decline(id: string): Promise<void> {
    await this.closePending(id, 'declined');
  }

  async cancel(id: string): Promise<void> {
    await this.closePending(id, 'cancelled');
  }

  private async closePending(id: string, status: 'declined' | 'cancelled') {
    await runTransaction(db, async (tx) => {
      const match = toMatch(await tx.get(this.ref(id)));
      if (!match || match.status !== 'pending') return;
      tx.update(this.ref(id), { status, updatedAt: serverTimestamp() });
    });
  }

  /**
   * Envía la decisión del jugador. Si el rival ya había decidido, añade el
   * turno resuelto al registro; `state` es el estado tras `appliedLog` pasos.
   */
  async submit(
    id: string,
    role: Role,
    choice: Choice,
    state: BattleState,
    appliedLog: number,
  ): Promise<void> {
    await runTransaction(db, async (tx) => {
      const match = toMatch(await tx.get(this.ref(id)));
      if (!match || match.status !== 'active') throw new Error('La partida ha terminado.');
      if (match.log.length !== appliedLog) throw new OutOfSyncError();
      const pending = { ...match.pending, [role]: choice };
      const entry = completeEntry(state, pending);
      const changes = plain(
        entry
          ? { log: [...match.log, entry], pending: {}, deadline: Date.now() + TURN_MS }
          : { pending },
      );
      tx.update(this.ref(id), { ...changes, updatedAt: serverTimestamp() });
    });
  }

  /** Cierra la partida con su resultado (cualquiera de los dos puede hacerlo). */
  async finish(id: string, winner: Outcome, reason: FinishReason): Promise<void> {
    await runTransaction(db, async (tx) => {
      const match = toMatch(await tx.get(this.ref(id)));
      if (!match || match.status !== 'active') return;
      tx.update(this.ref(id), {
        status: 'finished',
        winner,
        reason,
        updatedAt: serverTimestamp(),
      });
    });
  }

  async forfeit(id: string, role: Role): Promise<void> {
    await this.finish(id, otherRole(role), 'forfeit');
  }

  /** Si el rival no decide a tiempo, se puede reclamar la victoria. */
  canClaim(match: Match, role: Role, now = Date.now()): boolean {
    return (
      match.status === 'active' &&
      now > match.deadline + CLAIM_GRACE_MS &&
      match.pending[otherRole(role)] == null
    );
  }
}
