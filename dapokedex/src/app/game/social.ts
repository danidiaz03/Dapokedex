/**
 * Lógica pura de amigos: nombres de usuario, ids de amistad y estado de
 * conexión. Sin Firestore para poder probarla sin red.
 */

/** Mismo patrón que valida firestore.rules: minúsculas, números y _, de 3 a 16. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,16}$/;

/** Se considera conectado a quien ha dado señales en los últimos 5 minutos. */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/** Cada cuánto se avisa de que se sigue conectado mientras la web está visible. */
export const HEARTBEAT_MS = 4 * 60 * 1000;

export const MAX_TEAM_SHOWN = 6;

/** Un reto a combate sin respuesta caduca a los 10 minutos. */
export const CHALLENGE_TTL_MS = 10 * 60_000;

/** Perfil público: lo único de un jugador que pueden ver los demás. */
export interface PublicProfile {
  uid: string;
  username: string;
  title: string;
  level: number;
  xp: number;
  team: number[];
  collectionCount: number;
  achievements: number;
  /** Milisegundos; 0 si nunca se ha conectado. */
  lastSeen: number;
}

export interface FriendRequest {
  id: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  createdAt: number;
}

export type Relation = 'self' | 'friend' | 'incoming' | 'outgoing' | 'none';

export function isValidUsername(name: string): boolean {
  return USERNAME_PATTERN.test(name);
}

/** Limpia lo que escribe el jugador: minúsculas, sin acentos ni espacios. */
export function normalizeUsername(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 16);
}

/** Propuesta de nombre a partir del nombre de la cuenta. */
export function suggestUsername(displayName: string | null | undefined, uid: string): string {
  const base = normalizeUsername(displayName?.trim().split(/\s+/)[0] ?? '');
  const tail = uid
    .slice(0, 4)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const name = base.length >= 3 ? base : `entrenador_${tail}`;
  return normalizeUsername(name);
}

/** Id del documento de amistad: los dos uid ordenados, igual para ambos. */
export function friendshipId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/** Id de una solicitud: quién la envía y a quién. */
export function requestId(from: string, to: string): string {
  return `${from}_${to}`;
}

export function isOnline(lastSeen: number, now = Date.now()): boolean {
  return lastSeen > 0 && now - lastSeen < ONLINE_WINDOW_MS;
}

/** "En línea", "Hace 12 min", "Hace 3 h", "Hace 2 días". */
export function lastSeenLabel(lastSeen: number, now = Date.now()): string {
  if (!lastSeen) return 'Sin conexión';
  if (isOnline(lastSeen, now)) return 'En línea';
  const minutes = Math.floor((now - lastSeen) / 60000);
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Hace 1 día' : `Hace ${days} días`;
}

/** Qué relación tiene el jugador con otro, para decidir qué botón mostrar. */
export function relationWith(
  me: string,
  other: string,
  friends: string[],
  incoming: FriendRequest[],
  outgoing: FriendRequest[],
): Relation {
  if (me === other) return 'self';
  if (friends.includes(other)) return 'friend';
  if (incoming.some((r) => r.from === other)) return 'incoming';
  if (outgoing.some((r) => r.to === other)) return 'outgoing';
  return 'none';
}

/** Amigos ordenados: primero los conectados y, dentro de cada grupo, por XP. */
export function sortFriends(list: PublicProfile[], now = Date.now()): PublicProfile[] {
  return [...list].sort(
    (a, b) =>
      Number(isOnline(b.lastSeen, now)) - Number(isOnline(a.lastSeen, now)) ||
      b.xp - a.xp ||
      a.username.localeCompare(b.username),
  );
}
