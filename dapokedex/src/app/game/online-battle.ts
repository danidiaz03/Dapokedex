/**
 * Combate en línea entre amigos. No hay servidor que arbitre: la partida se
 * guarda como la lista de decisiones de los dos jugadores y cada navegador
 * la reproduce con el mismo motor y la misma semilla, así que los dos ven
 * exactamente el mismo combate.
 *
 * El estado "canónico" siempre tiene al anfitrión (quien reta) como 'player'
 * y al invitado como 'enemy'. El invitado lo ve dado la vuelta con mirror().
 */
import {
  Action,
  BattleEvent,
  BattleState,
  Combatant,
  Rng,
  SideKey,
  activeOf,
  allowedMoves,
  beginBattle,
  hasAlive,
  resolveTurn,
  switchIn,
} from './battle-engine';

export type Role = 'host' | 'guest';

/** Una decisión ya resuelta: un turno normal o la sustitución de debilitados. */
export type LogEntry =
  | { t: 'turn'; h: Action; g: Action }
  | { t: 'replace'; h: number | null; g: number | null };

/** Lo que tiene que decidir cada jugador ahora mismo. */
export type Need = 'action' | 'replace' | null;

export type Outcome = Role | 'draw' | null;

/** Tiempo para decidir cada turno antes de que el rival pueda reclamar la victoria. */
export const TURN_MS = 90_000;
/** Margen extra por si el reloj de un jugador va un poco adelantado. */
export const CLAIM_GRACE_MS = 10_000;
export { CHALLENGE_TTL_MS } from './social';

export const sideOf = (role: Role): SideKey => (role === 'host' ? 'player' : 'enemy');
export const otherRole = (role: Role): Role => (role === 'host' ? 'guest' : 'host');

/** Generador pseudoaleatorio con semilla (mulberry32): mismo número, misma secuencia. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Azar de cada paso: depende de la semilla de la partida y del número de paso. */
export function rngFor(seed: number, step: number): Rng {
  return seededRng((seed ^ Math.imul(step + 1, 0x9e3779b1)) >>> 0);
}

export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function initialState(hostTeam: Combatant[], guestTeam: Combatant[]): BattleState {
  return {
    player: { team: structuredClone(hostTeam), active: 0 },
    enemy: { team: structuredClone(guestTeam), active: 0 },
    turn: 0,
    weather: null,
  };
}

/** Efectos de entrada del principio (Intimidación, Llovizna…). Es el paso 0. */
export function begin(
  state: BattleState,
  seed: number,
  view: SideKey,
): { state: BattleState; events: BattleEvent[] } {
  return beginBattle(state, rngFor(seed, 0), view);
}

/** Aplica la decisión número `index` del registro (los pasos empiezan en 1). */
export function applyEntry(
  state: BattleState,
  entry: LogEntry,
  seed: number,
  index: number,
  view: SideKey,
): { state: BattleState; events: BattleEvent[] } {
  const rng = rngFor(seed, index + 1);
  if (entry.t === 'turn') return resolveTurn(state, entry.h, entry.g, rng, view);
  let current = state;
  const events: BattleEvent[] = [];
  for (const [side, pick] of [
    ['player', entry.h],
    ['enemy', entry.g],
  ] as [SideKey, number | null][]) {
    if (pick === null) continue;
    const next = switchIn(current, side, pick, rng, view);
    current = next.state;
    events.push(...next.events);
  }
  return { state: current, events };
}

/** Reconstruye la partida entera sin animaciones (al entrar o recargar). */
export function replay(
  hostTeam: Combatant[],
  guestTeam: Combatant[],
  seed: number,
  log: LogEntry[],
  view: SideKey,
): BattleState {
  let state = begin(initialState(hostTeam, guestTeam), seed, view).state;
  log.forEach((entry, i) => {
    state = applyEntry(state, entry, seed, i, view).state;
  });
  return state;
}

export function outcome(state: BattleState): Outcome {
  const host = hasAlive(state, 'player');
  const guest = hasAlive(state, 'enemy');
  if (!host && !guest) return 'draw';
  if (!guest) return 'host';
  if (!host) return 'guest';
  return null;
}

/** Qué le toca decidir a un jugador según el estado. */
export function needOf(state: BattleState, role: Role): Need {
  if (outcome(state)) return null;
  const side = sideOf(role);
  const foe = sideOf(otherRole(role));
  const mine = activeOf(state, side);
  // Si hay algún debilitado, primero se sustituye; el otro jugador espera.
  if (mine.fainted) return 'replace';
  if (activeOf(state, foe).fainted) return null;
  return 'action';
}

/** Pokémon que puede sacar un jugador para sustituir al debilitado. */
export function replacementOptions(state: BattleState, role: Role): number[] {
  const side = state[sideOf(role)];
  return side.team.map((p, i) => (!p.fainted && i !== side.active ? i : -1)).filter((i) => i >= 0);
}

/**
 * Decisión automática cuando no hay nada que elegir: tras Hiperrayo el
 * Pokémon recarga y, si solo queda un Pokémon, sale ese.
 */
export function autoChoice(state: BattleState, role: Role): Action | number | null {
  const need = needOf(state, role);
  if (need === 'replace') {
    const options = replacementOptions(state, role);
    return options.length === 1 ? options[0] : null;
  }
  if (need === 'action') {
    const p = activeOf(state, sideOf(role));
    if (p.recharging) return { kind: 'move', index: 0 };
    if (allowedMoves(p).length === 0) {
      // Sin PP: Forcejeo, salvo que pueda cambiar de Pokémon.
      const canSwitch = state[sideOf(role)].team.some(
        (q, i) => !q.fainted && i !== state[sideOf(role)].active,
      );
      return canSwitch ? null : { kind: 'struggle' };
    }
  }
  return null;
}

/**
 * Con las decisiones pendientes de los dos, la entrada que se añade al
 * registro (o null si aún falta alguien por decidir).
 */
export function completeEntry(
  state: BattleState,
  pending: { host?: Action | number | null; guest?: Action | number | null },
): LogEntry | null {
  const hn = needOf(state, 'host');
  const gn = needOf(state, 'guest');
  if (hn === 'replace' || gn === 'replace') {
    const h = hn === 'replace' ? pending.host : null;
    const g = gn === 'replace' ? pending.guest : null;
    if (hn === 'replace' && typeof h !== 'number') return null;
    if (gn === 'replace' && typeof g !== 'number') return null;
    return { t: 'replace', h: h as number | null, g: g as number | null };
  }
  if (hn === 'action' && gn === 'action') {
    const h = pending.host;
    const g = pending.guest;
    if (!h || typeof h === 'number' || !g || typeof g === 'number') return null;
    return { t: 'turn', h, g };
  }
  return null;
}

/** Da la vuelta al estado para que el invitado se vea abajo como 'player'. */
export function mirror(state: BattleState): BattleState {
  return { ...state, player: state.enemy, enemy: state.player };
}

/** Lo mismo para los sucesos: estado y lado al revés. */
export function mirrorEvent(e: BattleEvent): BattleEvent {
  return {
    ...e,
    state: mirror(e.state),
    side: e.side ? (e.side === 'player' ? 'enemy' : 'player') : undefined,
  };
}
