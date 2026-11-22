/**
 * Motor de combate con las reglas de los juegos principales (5.ª gen. en
 * adelante): turnos simultáneos ordenados por prioridad y velocidad, fórmula
 * de daño real, golpes críticos, precisión, problemas de estado, cambios de
 * características, cambios de Pokémon y efectos de los movimientos.
 *
 * Todo es puro: cada función recibe un estado y devuelve uno nuevo junto con
 * la lista de sucesos que la pantalla reproduce uno a uno. El azar entra por
 * `rng` para poder probarlo.
 */

import {
  ABSORB_ABILITIES,
  CLEAR_BODY,
  CONTACT_STATUS_ABILITIES,
  INTIMIDATE_BLOCK,
  PINCH_ABILITIES,
  SPEED_WEATHER,
  STATUS_BERRIES,
  STATUS_BLOCKING_ABILITIES,
  TYPE_BOOST_ITEMS,
  WEATHER_ABILITIES,
  WEATHER_MOVES,
  WEATHER_ROCKS,
  WEATHER_TEXT,
  Weather,
} from './battle-data';

export type { Weather } from './battle-data';
export type Rng = () => number;
export type SideKey = 'player' | 'enemy';
export type StatKey =
  | 'attack'
  | 'defense'
  | 'specialAttack'
  | 'specialDefense'
  | 'speed'
  | 'accuracy'
  | 'evasion';
/** Problemas de estado principales: quemado, envenenado, gravemente envenenado, paralizado, dormido, congelado. */
export type Status = 'brn' | 'psn' | 'tox' | 'par' | 'slp' | 'frz';
export type DamageClass = 'physical' | 'special' | 'status';

export interface BattleMove {
  /** Nombre en inglés de PokeAPI (para casos especiales como Tóxico). */
  key: string;
  name: string;
  power: number;
  type: string;
  damageClass: DamageClass;
  accuracy: number | null;
  pp: number;
  maxPp: number;
  priority: number;
  /** A quién afectan los cambios de características y el estado. */
  effectTarget: 'user' | 'opponent';
  ailment: Status | 'confusion' | null;
  /** Probabilidad en %; 100 en los movimientos de estado puros. */
  ailmentChance: number;
  statChanges: { stat: StatKey; change: number }[];
  statChance: number;
  critRate: number;
  /** % del daño que se recupera (positivo) o se recibe de retroceso (negativo). */
  drain: number;
  /** % de los PS máximos que se curan. */
  healing: number;
  flinchChance: number;
  minHits: number;
  maxHits: number;
  ohko: boolean;
  /** El usuario se debilita al usarlo (Autodestrucción, Explosión). */
  selfKo: boolean;
  /** El usuario pierde el turno siguiente para recuperarse (Hiperrayo…). */
  recharge: boolean;
  /** Tiempo que provoca (Danza Lluvia, Día Soleado…). */
  weather: Weather | null;
}

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export interface Combatant {
  id: number;
  name: string;
  level: number;
  types: string[];
  sprite: string;
  shiny: boolean;
  maxHp: number;
  hp: number;
  stats: Omit<BaseStats, 'hp'>;
  moves: BattleMove[];
  fainted: boolean;
  status: Status | null;
  /** Turnos que le quedan dormido. */
  sleepTurns: number;
  /** Contador del envenenamiento grave (n/16 cada turno). */
  toxicCounter: number;
  /** Turnos que le quedan confuso (0 = no lo está). */
  confusion: number;
  /** Pierde el próximo turno por haber usado un movimiento de recarga. */
  recharging: boolean;
  /** Habilidad (clave de PokeAPI) y su nombre en español. */
  ability: string;
  abilityName: string;
  /** Objeto equipado; null si no lleva o ya lo ha gastado. */
  item: string | null;
  itemName: string;
  itemSprite: string;
  /** Movimiento al que le ata un objeto Elección. */
  choiceLock: number | null;
  /** Absorbe Fuego activado: sus ataques de Fuego pegan más. */
  flashFire: boolean;
  stages: Record<StatKey, number>;
}

export interface BattleSide {
  team: Combatant[];
  active: number;
}

export interface BattleState {
  player: BattleSide;
  enemy: BattleSide;
  turn: number;
  weather?: { kind: Weather; turns: number } | null;
}

export type Action =
  | { kind: 'move'; index: number }
  | { kind: 'struggle' }
  | { kind: 'switch'; index: number };

export type Anim = 'attack' | 'hit' | 'crit' | 'miss' | 'status' | 'heal' | 'faint' | 'switch';

export interface BattleEvent {
  text: string;
  /** Estado de la batalla justo después de este suceso. */
  state: BattleState;
  side?: SideKey;
  anim?: Anim;
  effectiveness?: number;
  /** Pokémon del jugador que ha debilitado a un rival (para repartir XP). */
  koBy?: number;
}

/* ------------------------------------------------------------------ */
/* Tabla de tipos (6.ª gen. en adelante)                               */
/* ------------------------------------------------------------------ */

const CHART: Record<string, Record<string, number>> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: {
    fire: 0.5,
    water: 2,
    grass: 0.5,
    poison: 0.5,
    ground: 2,
    flying: 0.5,
    bug: 0.5,
    rock: 2,
    dragon: 0.5,
    steel: 0.5,
  },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: {
    normal: 2,
    ice: 2,
    poison: 0.5,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 2,
    ghost: 0,
    dark: 2,
    steel: 2,
    fairy: 0.5,
  },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: {
    fire: 0.5,
    grass: 2,
    fighting: 0.5,
    poison: 0.5,
    flying: 0.5,
    psychic: 2,
    ghost: 0.5,
    dark: 2,
    steel: 0.5,
    fairy: 0.5,
  },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

export function typeEffectiveness(moveType: string, defenderTypes: string[]): number {
  const row = CHART[moveType];
  if (!row) return 1;
  return defenderTypes.reduce((m, t) => m * (row[t] ?? 1), 1);
}

/* ------------------------------------------------------------------ */
/* Características                                                     */
/* ------------------------------------------------------------------ */

/** IV fijos a 31 y sin EV, como un Pokémon "perfecto" recién capturado. */
const IV = 31;

export function calcHp(base: number, level: number): number {
  return Math.floor(((2 * base + IV) * level) / 100) + level + 10;
}

export function calcStat(base: number, level: number): number {
  return Math.floor(((2 * base + IV) * level) / 100) + 5;
}

export const EMPTY_STAGES: Record<StatKey, number> = {
  attack: 0,
  defense: 0,
  specialAttack: 0,
  specialDefense: 0,
  speed: 0,
  accuracy: 0,
  evasion: 0,
};

export function createCombatant(input: {
  id: number;
  name: string;
  level: number;
  types: string[];
  sprite: string;
  shiny: boolean;
  base: BaseStats;
  moves: BattleMove[];
  ability?: string;
  abilityName?: string;
  item?: string | null;
  itemName?: string;
  itemSprite?: string;
}): Combatant {
  const { base, level } = input;
  const maxHp = calcHp(base.hp, level);
  return {
    id: input.id,
    name: input.name,
    level,
    types: input.types,
    sprite: input.sprite,
    shiny: input.shiny,
    maxHp,
    hp: maxHp,
    stats: {
      attack: calcStat(base.attack, level),
      defense: calcStat(base.defense, level),
      specialAttack: calcStat(base.specialAttack, level),
      specialDefense: calcStat(base.specialDefense, level),
      speed: calcStat(base.speed, level),
    },
    moves: input.moves,
    fainted: false,
    status: null,
    sleepTurns: 0,
    toxicCounter: 0,
    confusion: 0,
    recharging: false,
    ability: input.ability ?? '',
    abilityName: input.abilityName ?? '',
    item: input.item ?? null,
    itemName: input.itemName ?? '',
    itemSprite: input.itemSprite ?? '',
    choiceLock: null,
    flashFire: false,
    stages: { ...EMPTY_STAGES },
  };
}

/** Multiplicador de una etapa de característica (−6 a +6). */
export function stageMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

/** Multiplicador de etapa para precisión y evasión. */
export function accuracyMultiplier(stage: number): number {
  return stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage);
}

export function effectiveSpeed(p: Combatant, weather: Weather | null = null): number {
  let speed = p.stats.speed * stageMultiplier(p.stages.speed);
  if (weather && SPEED_WEATHER[p.ability]?.includes(weather)) speed *= 2;
  if (p.item === 'choice-scarf') speed *= 1.5;
  return Math.floor(p.status === 'par' ? speed / 2 : speed);
}

export const STAT_NAMES: Record<StatKey, string> = {
  attack: 'Ataque',
  defense: 'Defensa',
  specialAttack: 'Ataque Especial',
  specialDefense: 'Defensa Especial',
  speed: 'Velocidad',
  accuracy: 'Precisión',
  evasion: 'Evasión',
};

export const STATUS_LABEL: Record<Status, string> = {
  brn: 'QUE',
  psn: 'ENV',
  tox: 'TÓX',
  par: 'PAR',
  slp: 'DOR',
  frz: 'CNG',
};

/** Tipos que no pueden sufrir cada estado. */
const STATUS_IMMUNE: Record<Status, string[]> = {
  brn: ['fire'],
  psn: ['poison', 'steel'],
  tox: ['poison', 'steel'],
  par: ['electric'],
  slp: [],
  frz: ['ice'],
};

/* ------------------------------------------------------------------ */
/* Movimientos especiales                                              */
/* ------------------------------------------------------------------ */

export const STRUGGLE: BattleMove = {
  key: 'struggle',
  name: 'Forcejeo',
  power: 50,
  type: 'typeless',
  damageClass: 'physical',
  accuracy: null,
  pp: 1,
  maxPp: 1,
  priority: 0,
  effectTarget: 'opponent',
  ailment: null,
  ailmentChance: 0,
  statChanges: [],
  statChance: 0,
  critRate: 0,
  drain: 0,
  healing: 0,
  flinchChance: 0,
  minHits: 1,
  maxHits: 1,
  ohko: false,
  selfKo: false,
  recharge: false,
  weather: null,
};

/* ------------------------------------------------------------------ */
/* Utilidades de estado                                                */
/* ------------------------------------------------------------------ */

const clone = (s: BattleState): BattleState => structuredClone(s);
export const activeOf = (s: BattleState, side: SideKey): Combatant => s[side].team[s[side].active];
const other = (side: SideKey): SideKey => (side === 'player' ? 'enemy' : 'player');

export function hasAlive(s: BattleState, side: SideKey): boolean {
  return s[side].team.some((p) => !p.fainted);
}

/**
 * Movimientos que se pueden elegir: con PP, sin los de estado si lleva Chaleco
 * Asalto y solo el bloqueado si lleva un objeto Elección.
 */
export function allowedMoves(p: Combatant): number[] {
  if (p.choiceLock !== null && p.moves[p.choiceLock]) {
    return p.moves[p.choiceLock].pp > 0 ? [p.choiceLock] : [];
  }
  return p.moves
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.pp > 0 && !(p.item === 'assault-vest' && m.damageClass === 'status'))
    .map(({ i }) => i);
}

export function hasUsableMoves(p: Combatant): boolean {
  return allowedMoves(p).length > 0;
}

export function weatherOf(s: BattleState): Weather | null {
  return s.weather?.kind ?? null;
}

/** Si el movimiento tiene un efecto secundario (lo que potencia Potencia Bruta). */
function hasSecondary(move: BattleMove): boolean {
  return (
    move.damageClass !== 'status' &&
    (move.ailmentChance > 0 ||
      move.flinchChance > 0 ||
      (move.statChance > 0 && move.effectTarget === 'opponent'))
  );
}

/**
 * Desde qué lado se cuentan los mensajes. En los combates en línea los dos
 * jugadores resuelven el mismo turno, pero cada uno lo lee como "su" lado.
 * Se fija al empezar cada función pública; todo el motor es síncrono.
 */
let viewer: SideKey = 'player';

/** Nombre con "el rival" delante para distinguir a quién le pasa cada cosa. */
function who(s: BattleState, side: SideKey): string {
  const p = activeOf(s, side);
  return side !== viewer ? `el ${p.name} rival` : p.name;
}

/* ------------------------------------------------------------------ */
/* Turno                                                               */
/* ------------------------------------------------------------------ */

interface TurnCtx {
  state: BattleState;
  events: BattleEvent[];
  rng: Rng;
  /** Quién ya ha actuado este turno (para el retroceso). */
  acted: Set<SideKey>;
  flinched: Set<SideKey>;
}

/** Ajusta "el Gyarados rival": mayúscula al inicio y contracciones "al" y "del". */
export function tidy(text: string): string {
  return text
    .replace(/(^|[¡¿] ?)el /g, (_m, pre: string) => `${pre}El `)
    .replace(/\b([Aa]) el /g, '$1l ')
    .replace(/\b([Dd])e el /g, '$1el ');
}

function emit(ctx: TurnCtx, text: string, extra: Omit<BattleEvent, 'text' | 'state'> = {}) {
  ctx.events.push({ text: tidy(text), state: clone(ctx.state), ...extra });
}

function actionPriority(s: BattleState, side: SideKey, action: Action): number {
  if (action.kind === 'switch') return 10;
  if (action.kind === 'struggle') return 0;
  return activeOf(s, side).moves[action.index]?.priority ?? 0;
}

/**
 * Resuelve un turno completo: primero los cambios, luego los movimientos por
 * prioridad y velocidad, y al final los daños de estado.
 */
export function resolveTurn(
  state: BattleState,
  playerAction: Action,
  enemyAction: Action,
  rng: Rng = Math.random,
  view: SideKey = 'player',
): { state: BattleState; events: BattleEvent[] } {
  viewer = view;
  const ctx: TurnCtx = {
    state: clone(state),
    events: [],
    rng,
    acted: new Set(),
    flinched: new Set(),
  };
  ctx.state.turn += 1;
  const weather = weatherOf(ctx.state);

  const actions: [SideKey, Action][] = [
    ['player', validAction(ctx.state, 'player', playerAction)],
    ['enemy', validAction(ctx.state, 'enemy', enemyAction)],
  ];
  // Garra Rápida: a veces deja actuar primero dentro de la misma prioridad.
  const quick = new Set<SideKey>();
  for (const [side] of actions) {
    if (activeOf(ctx.state, side).item === 'quick-claw' && rng() < 0.2) quick.add(side);
  }
  actions.sort(([sa, a], [sb, b]) => {
    const pa = actionPriority(ctx.state, sa, a);
    const pb = actionPriority(ctx.state, sb, b);
    if (pa !== pb) return pb - pa;
    const qa = quick.has(sa) ? 1 : 0;
    const qb = quick.has(sb) ? 1 : 0;
    if (qa !== qb) return qb - qa;
    const va = effectiveSpeed(activeOf(ctx.state, sa), weather);
    const vb = effectiveSpeed(activeOf(ctx.state, sb), weather);
    if (va !== vb) return vb - va;
    return rng() < 0.5 ? -1 : 1;
  });

  for (const [side, action] of actions) {
    if (activeOf(ctx.state, side).fainted) continue;
    if (quick.has(side) && action.kind !== 'switch') {
      emit(
        ctx,
        `¡${activeOf(ctx.state, side).itemName} de ${who(ctx.state, side)} le permite actuar primero!`,
        { side },
      );
    }
    if (action.kind === 'switch') {
      doSwitch(ctx, side, action.index);
    } else {
      const user = activeOf(ctx.state, side);
      const move = action.kind === 'struggle' ? STRUGGLE : user.moves[action.index];
      if (move) useMove(ctx, side, move, action.kind === 'move' ? action.index : -1);
    }
    ctx.acted.add(side);
    if (activeOf(ctx.state, other(side)).fainted && !hasAlive(ctx.state, other(side))) break;
  }

  endOfTurn(ctx);
  return { state: ctx.state, events: ctx.events };
}

/** Corrige una acción imposible (bloqueo de Elección, sin PP…). */
function validAction(s: BattleState, side: SideKey, action: Action): Action {
  if (action.kind !== 'move') return action;
  const allowed = allowedMoves(activeOf(s, side));
  if (allowed.includes(action.index)) return action;
  return allowed.length ? { kind: 'move', index: allowed[0] } : { kind: 'struggle' };
}

/** Efectos de entrada de los dos primeros Pokémon (Intimidación, Llovizna…). */
export function beginBattle(
  state: BattleState,
  rng: Rng = Math.random,
  view: SideKey = 'player',
): { state: BattleState; events: BattleEvent[] } {
  viewer = view;
  const ctx: TurnCtx = {
    state: clone(state),
    events: [],
    rng,
    acted: new Set(),
    flinched: new Set(),
  };
  const weather = weatherOf(ctx.state);
  const order = (['player', 'enemy'] as SideKey[]).sort(
    (a, b) =>
      effectiveSpeed(activeOf(ctx.state, b), weather) -
      effectiveSpeed(activeOf(ctx.state, a), weather),
  );
  for (const side of order) onEntry(ctx, side);
  return { state: ctx.state, events: ctx.events };
}

/** Saca a otro Pokémon: se pierden los cambios de características y la confusión. */
export function switchIn(
  state: BattleState,
  side: SideKey,
  index: number,
  rng: Rng = Math.random,
  view: SideKey = 'player',
): { state: BattleState; events: BattleEvent[] } {
  viewer = view;
  const ctx: TurnCtx = {
    state: clone(state),
    events: [],
    rng,
    acted: new Set(),
    flinched: new Set(),
  };
  doSwitch(ctx, side, index);
  return { state: ctx.state, events: ctx.events };
}

function doSwitch(ctx: TurnCtx, side: SideKey, index: number) {
  const s = ctx.state[side];
  const target = s.team[index];
  if (!target || target.fainted || index === s.active) return;
  const leaving = s.team[s.active];
  if (!leaving.fainted) {
    leaving.stages = { ...EMPTY_STAGES };
    leaving.confusion = 0;
    leaving.recharging = false;
    leaving.choiceLock = null;
    leaving.flashFire = false;
    if (leaving.status === 'tox') leaving.toxicCounter = 1;
    // Cura Natural y Regeneración actúan al retirarse.
    if (leaving.ability === 'natural-cure') leaving.status = null;
    if (leaving.ability === 'regenerator') {
      leaving.hp = Math.min(leaving.maxHp, leaving.hp + Math.floor(leaving.maxHp / 3));
    }
    emit(
      ctx,
      side === viewer ? `¡Vuelve, ${leaving.name}!` : `El rival retira a ${leaving.name}.`,
      { side, anim: 'switch' },
    );
  }
  s.active = index;
  emit(ctx, side === viewer ? `¡Adelante, ${target.name}!` : `¡El rival saca a ${target.name}!`, {
    side,
    anim: 'switch',
  });
  onEntry(ctx, side);
}

/** Habilidades que actúan al entrar en combate. */
function onEntry(ctx: TurnCtx, side: SideKey) {
  const p = activeOf(ctx.state, side);
  const foeSide = other(side);
  const foe = activeOf(ctx.state, foeSide);
  if (p.ability === 'intimidate' && !foe.fainted) {
    emit(ctx, `¡${p.abilityName} de ${who(ctx.state, side)}!`, { side, anim: 'status' });
    if (INTIMIDATE_BLOCK.includes(foe.ability)) {
      emit(ctx, `¡${foe.abilityName} de ${who(ctx.state, foeSide)} lo impide!`, { side: foeSide });
    } else {
      changeStage(ctx, foeSide, 'attack', -1, side);
    }
  }
  const weather = WEATHER_ABILITIES[p.ability];
  if (weather && weatherOf(ctx.state) !== weather) {
    emit(ctx, `¡${p.abilityName} de ${who(ctx.state, side)}!`, { side, anim: 'status' });
    setWeather(ctx, weather, p);
  }
}

function setWeather(ctx: TurnCtx, kind: Weather, user: Combatant): boolean {
  if (weatherOf(ctx.state) === kind) return false;
  const turns = user.item && WEATHER_ROCKS[user.item] === kind ? 8 : 5;
  ctx.state.weather = { kind, turns };
  emit(ctx, WEATHER_TEXT[kind].start, { anim: 'status' });
  return true;
}

/** Comprueba si el Pokémon puede moverse este turno (sueño, congelación, parálisis, confusión). */
function canAct(ctx: TurnCtx, side: SideKey): boolean {
  const p = activeOf(ctx.state, side);
  const name = who(ctx.state, side);

  if (p.recharging) {
    p.recharging = false;
    emit(ctx, `¡${name} necesita recuperarse!`, { side, anim: 'status' });
    return false;
  }
  if (p.status === 'slp') {
    if (p.sleepTurns <= 0) {
      p.status = null;
      emit(ctx, `¡${name} se despertó!`, { side, anim: 'status' });
    } else {
      p.sleepTurns -= 1;
      emit(ctx, `${name} está dormido como un tronco.`, { side, anim: 'status' });
      return false;
    }
  }
  if (p.status === 'frz') {
    if (ctx.rng() < 0.2) {
      p.status = null;
      emit(ctx, `¡${name} se descongeló!`, { side, anim: 'status' });
    } else {
      emit(ctx, `${name} está congelado y no puede moverse.`, { side, anim: 'status' });
      return false;
    }
  }
  if (ctx.flinched.has(side)) {
    emit(ctx, `¡${name} retrocedió y no pudo moverse!`, { side, anim: 'status' });
    return false;
  }
  if (p.confusion > 0) {
    p.confusion -= 1;
    if (p.confusion === 0) {
      emit(ctx, `¡${name} ya no está confuso!`, { side, anim: 'status' });
    } else {
      emit(ctx, `${name} está confuso…`, { side, anim: 'status' });
      if (ctx.rng() < 1 / 3) {
        // Se golpea a sí mismo con un ataque físico de 40 de potencia y sin tipo.
        const dmg = baseDamage(p, p, 40, 'physical', ctx.rng, false);
        applyDamage(ctx, side, dmg);
        emit(ctx, `¡Está tan confuso que se hirió a sí mismo!`, { side, anim: 'hit' });
        faintCheck(ctx, side);
        return false;
      }
    }
  }
  if (p.status === 'par' && ctx.rng() < 0.25) {
    emit(ctx, `¡${name} está paralizado! No puede moverse.`, { side, anim: 'status' });
    return false;
  }
  return true;
}

function useMove(ctx: TurnCtx, side: SideKey, move: BattleMove, index: number) {
  const user = activeOf(ctx.state, side);
  if (!canAct(ctx, side)) return;
  if (user.fainted) return;

  // Gasta PP aunque luego falle.
  if (index >= 0) user.moves[index].pp = Math.max(0, user.moves[index].pp - 1);
  // Los objetos Elección atan al primer movimiento usado hasta retirarse.
  if (index >= 0 && user.item?.startsWith('choice-')) user.choiceLock = index;

  const name = who(ctx.state, side);
  if (move === STRUGGLE) emit(ctx, `¡A ${name} no le quedan movimientos!`, { side });
  emit(ctx, `¡${name} usó ${move.name}!`, { side, anim: 'attack' });
  try {
    resolveMove(ctx, side, move);
  } finally {
    const self = activeOf(ctx.state, side);
    if (move.selfKo && !self.fainted) {
      self.hp = 0;
      faintCheck(ctx, side);
    } else if (move.recharge && !self.fainted) {
      self.recharging = true;
    }
  }
}

function resolveMove(ctx: TurnCtx, side: SideKey, move: BattleMove) {
  const user = activeOf(ctx.state, side);
  const foeSide = other(side);
  const foe = activeOf(ctx.state, foeSide);
  const weather = weatherOf(ctx.state);
  const targetsFoe =
    !move.weather && (move.damageClass !== 'status' || move.effectTarget === 'opponent');

  // Precisión (los movimientos sobre uno mismo no fallan).
  let accuracy = move.accuracy;
  if (['thunder', 'hurricane'].includes(move.key)) {
    if (weather === 'rain') accuracy = null;
    else if (weather === 'sun') accuracy = 50;
  }
  if (move.key === 'blizzard' && (weather === 'hail' || weather === 'snow')) accuracy = null;
  if (user.ability === 'no-guard' || foe.ability === 'no-guard') accuracy = null;
  if (targetsFoe && accuracy !== null) {
    const stage = Math.max(-6, Math.min(6, user.stages.accuracy - foe.stages.evasion));
    let chance = accuracy * accuracyMultiplier(stage);
    if (user.ability === 'compound-eyes') chance *= 1.3;
    if (user.ability === 'hustle' && move.damageClass === 'physical') chance *= 0.8;
    if (ctx.rng() * 100 >= chance) {
      emit(ctx, `¡Pero falló!`, { side, anim: 'miss' });
      return;
    }
  }

  if (move.weather) {
    if (!setWeather(ctx, move.weather, user)) emit(ctx, `¡Pero falló!`, { side });
    return;
  }

  // Habilidades que anulan el ataque (Levitación, Absorbe Agua…).
  if (targetsFoe && move !== STRUGGLE && absorbedByAbility(ctx, foeSide, move)) return;

  if (move.ohko) {
    if (foe.ability === 'sturdy') {
      emit(ctx, `¡${who(ctx.state, foeSide)} aguanta gracias a ${foe.abilityName}!`, {
        side: foeSide,
      });
      return;
    }
    if (user.level < foe.level || typeEffectiveness(move.type, foe.types) === 0) {
      emit(ctx, `¡No afecta a ${who(ctx.state, foeSide)}!`, { side: foeSide });
      return;
    }
    applyDamage(ctx, foeSide, foe.hp);
    emit(ctx, `¡Fulminado de un golpe!`, { side: foeSide, anim: 'crit' });
    faintCheck(ctx, foeSide, side);
    return;
  }

  if (move.damageClass === 'status') {
    applySecondary(ctx, side, move, true);
    if (move.healing > 0) heal(ctx, side, Math.floor((user.maxHp * move.healing) / 100));
    return;
  }

  // Movimiento de daño, con posibles golpes múltiples.
  const effectiveness = move === STRUGGLE ? 1 : typeEffectiveness(move.type, foe.types);
  if (effectiveness === 0) {
    emit(ctx, `No afecta a ${who(ctx.state, foeSide)}…`, { side: foeSide, effectiveness: 0 });
    return;
  }
  if (foe.ability === 'wonder-guard' && effectiveness <= 1 && move !== STRUGGLE) {
    emit(ctx, `¡${foe.abilityName} protege a ${who(ctx.state, foeSide)}!`, { side: foeSide });
    return;
  }
  const hits =
    user.ability === 'skill-link' && move.maxHits > 1 ? move.maxHits : rollHits(move, ctx.rng);
  const critBonus = (user.ability === 'super-luck' ? 1 : 0) + (user.item === 'scope-lens' ? 1 : 0);
  const critImmune = foe.ability === 'battle-armor' || foe.ability === 'shell-armor';
  let total = 0;
  let landed = 0;
  for (let i = 0; i < hits; i++) {
    const target = activeOf(ctx.state, foeSide);
    if (target.fainted) break;
    const crit = !critImmune && rollCrit(move.critRate + critBonus, ctx.rng);
    let dmg = damage(user, target, move, effectiveness, crit, ctx.rng, weather);
    // Banda Aguante y Robustez: con los PS al máximo se aguanta con 1 PS.
    let endured = '';
    if (target.hp === target.maxHp && dmg >= target.hp) {
      if (target.item === 'focus-sash') {
        endured = `¡${who(ctx.state, foeSide)} resistió gracias a ${target.itemName}!`;
        target.item = null;
        dmg = target.hp - 1;
      } else if (target.ability === 'sturdy') {
        endured = `¡${who(ctx.state, foeSide)} aguantó el golpe gracias a ${target.abilityName}!`;
        dmg = target.hp - 1;
      }
    }
    total += applyDamage(ctx, foeSide, dmg);
    landed++;
    emit(ctx, crit ? `¡Un golpe crítico!` : '', {
      side: foeSide,
      anim: crit ? 'crit' : 'hit',
      effectiveness,
    });
    if (endured) emit(ctx, endured, { side: foeSide });
  }
  // Los sucesos sin texto solo animan el golpe y bajan la barra de PS.
  if (effectiveness > 1) emit(ctx, `¡Es muy eficaz!`, { side: foeSide });
  else if (effectiveness < 1) emit(ctx, `No es muy eficaz…`, { side: foeSide });
  if (hits > 1) emit(ctx, `¡Golpeó ${landed} veces!`, { side: foeSide });

  // Absorción o retroceso.
  const sheerForce = user.ability === 'sheer-force' && hasSecondary(move);
  if (move === STRUGGLE) {
    recoil(ctx, side, Math.max(1, Math.floor(user.maxHp / 4)));
  } else if (move.drain > 0 && total > 0) {
    const amount = Math.max(1, Math.floor((total * move.drain) / 100));
    if (heal(ctx, side, amount, false))
      emit(ctx, `¡${who(ctx.state, foeSide)} ha perdido energía!`, { side, anim: 'heal' });
  } else if (move.drain < 0 && total > 0 && user.ability !== 'rock-head') {
    recoil(ctx, side, Math.max(1, Math.floor((total * -move.drain) / 100)));
  }

  // Contacto (los ataques físicos): Piel Tosca, Casco Dentado, Elec. Estática…
  if (move.damageClass === 'physical' && landed > 0) contactEffects(ctx, side, foeSide);

  const self = activeOf(ctx.state, side);
  if (!self.fainted && total > 0) {
    if (self.item === 'life-orb' && !sheerForce) {
      applyDamage(ctx, side, Math.max(1, Math.floor(self.maxHp / 10)));
      emit(ctx, `${who(ctx.state, side)} pierde algo de vida por ${self.itemName}.`, {
        side,
        anim: 'hit',
      });
    } else if (self.item === 'shell-bell' && self.hp < self.maxHp) {
      heal(ctx, side, Math.max(1, Math.floor(total / 8)), false);
      emit(ctx, `${who(ctx.state, side)} recupera PS con ${self.itemName}.`, { side });
    }
  }

  const foeFainted = faintCheck(ctx, foeSide, side);
  if (activeOf(ctx.state, side).fainted) faintCheck(ctx, side);
  checkBerry(ctx, side);
  if (foeFainted) {
    if (user.ability === 'moxie' && !activeOf(ctx.state, side).fainted) {
      emit(ctx, `¡${user.abilityName} de ${who(ctx.state, side)}!`, { side });
      changeStage(ctx, side, 'attack', 1, side);
    }
    return;
  }
  checkBerry(ctx, foeSide);
  if (sheerForce) return;

  // Retroceso del rival (solo si aún no ha actuado este turno).
  const chanceMul = user.ability === 'serene-grace' ? 2 : 1;
  if (
    move.flinchChance > 0 &&
    !ctx.acted.has(foeSide) &&
    activeOf(ctx.state, foeSide).ability !== 'inner-focus' &&
    ctx.rng() * 100 < move.flinchChance * chanceMul
  ) {
    ctx.flinched.add(foeSide);
  }
  applySecondary(ctx, side, move, false, chanceMul);
}

/** Habilidades del defensor que anulan el ataque y lo aprovechan. */
function absorbedByAbility(ctx: TurnCtx, foeSide: SideKey, move: BattleMove): boolean {
  const foe = activeOf(ctx.state, foeSide);
  const rule = ABSORB_ABILITIES[foe.ability];
  if (!rule || rule.type !== move.type) return false;
  const name = who(ctx.state, foeSide);
  if (rule.effect === 'immune') {
    emit(ctx, `¡${foe.abilityName} hace que no afecte a ${name}!`, { side: foeSide });
  } else if (rule.effect === 'heal') {
    if (foe.hp < foe.maxHp) {
      foe.hp = Math.min(foe.maxHp, foe.hp + Math.floor(foe.maxHp / 4));
      emit(ctx, `¡${name} recuperó PS gracias a ${foe.abilityName}!`, {
        side: foeSide,
        anim: 'heal',
      });
    } else {
      emit(ctx, `¡${foe.abilityName} hace que no afecte a ${name}!`, { side: foeSide });
    }
  } else if (rule.effect === 'flash') {
    foe.flashFire = true;
    emit(ctx, `¡${foe.abilityName} de ${name} potenció sus ataques de tipo fuego!`, {
      side: foeSide,
      anim: 'status',
    });
  } else {
    emit(ctx, `¡${foe.abilityName} de ${name}!`, { side: foeSide });
    changeStage(ctx, foeSide, rule.stat!, 1, foeSide);
  }
  return true;
}

/** Efectos al golpear con contacto: habilidades del defensor y Casco Dentado. */
function contactEffects(ctx: TurnCtx, side: SideKey, foeSide: SideKey) {
  const user = activeOf(ctx.state, side);
  const foe = activeOf(ctx.state, foeSide);
  if (user.fainted) return;
  if (foe.ability === 'rough-skin' || foe.ability === 'iron-barbs') {
    applyDamage(ctx, side, Math.max(1, Math.floor(user.maxHp / 8)));
    emit(
      ctx,
      `¡${foe.abilityName} de ${who(ctx.state, foeSide)} hiere a ${who(ctx.state, side)}!`,
      {
        side,
        anim: 'hit',
      },
    );
  }
  if (foe.item === 'rocky-helmet' && !user.fainted) {
    applyDamage(ctx, side, Math.max(1, Math.floor(user.maxHp / 6)));
    emit(ctx, `¡${foe.itemName} de ${who(ctx.state, foeSide)} hiere a ${who(ctx.state, side)}!`, {
      side,
      anim: 'hit',
    });
  }
  const status = CONTACT_STATUS_ABILITIES[foe.ability];
  if (status && user.hp > 0 && ctx.rng() < 0.3) inflict(ctx, side, status, '', false);
}

/** Bayas que se comen solas al bajar de la mitad de PS. */
function checkBerry(ctx: TurnCtx, side: SideKey) {
  const p = activeOf(ctx.state, side);
  if (p.fainted || p.hp > p.maxHp / 2) return;
  const amount =
    p.item === 'sitrus-berry' ? Math.floor(p.maxHp / 4) : p.item === 'oran-berry' ? 10 : 0;
  if (!amount) return;
  const name = p.itemName;
  p.item = null;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  emit(ctx, `¡${who(ctx.state, side)} se comió su ${name} y recuperó PS!`, { side, anim: 'heal' });
}

/** Bayas que curan problemas de estado. */
function checkStatusBerry(ctx: TurnCtx, side: SideKey) {
  const p = activeOf(ctx.state, side);
  const cures = p.item ? STATUS_BERRIES[p.item] : undefined;
  if (!cures) return;
  const cureStatus = p.status && cures.includes(p.status);
  const cureConfusion = p.confusion > 0 && cures.includes('confusion');
  if (!cureStatus && !cureConfusion) return;
  if (cureStatus) p.status = null;
  if (cureConfusion) p.confusion = 0;
  const name = p.itemName;
  p.item = null;
  emit(ctx, `¡${who(ctx.state, side)} se comió su ${name} y se curó!`, { side, anim: 'heal' });
}

function rollHits(move: BattleMove, rng: Rng): number {
  if (move.maxHits <= 1) return 1;
  if (move.minHits === 2 && move.maxHits === 5) {
    // Reparto oficial: 35 % dos y tres golpes, 15 % cuatro y cinco.
    const r = rng();
    return r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.85 ? 4 : 5;
  }
  return move.minHits + Math.floor(rng() * (move.maxHits - move.minHits + 1));
}

function rollCrit(critRate: number, rng: Rng): boolean {
  const chances = [1 / 24, 1 / 8, 1 / 2, 1];
  return rng() < chances[Math.min(3, Math.max(0, critRate))];
}

function baseDamage(
  attacker: Combatant,
  defender: Combatant,
  power: number,
  cls: DamageClass,
  rng: Rng,
  crit: boolean,
  mods: { aMul: number; dMul: number; critMul: number } = { aMul: 1, dMul: 1, critMul: 1.5 },
): number {
  const physical = cls === 'physical';
  let aStage = physical ? attacker.stages.attack : attacker.stages.specialAttack;
  let dStage = physical ? defender.stages.defense : defender.stages.specialDefense;
  // El crítico ignora las bajadas del atacante y las subidas del defensor.
  if (crit) {
    aStage = Math.max(0, aStage);
    dStage = Math.min(0, dStage);
  }
  const a =
    (physical ? attacker.stats.attack : attacker.stats.specialAttack) *
    stageMultiplier(aStage) *
    mods.aMul;
  const d =
    (physical ? defender.stats.defense : defender.stats.specialDefense) *
    stageMultiplier(dStage) *
    mods.dMul;
  const base =
    Math.floor(
      Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * power * a) / Math.max(1, d)) / 50,
    ) + 2;
  const random = (85 + Math.floor(rng() * 16)) / 100;
  return Math.floor(base * random * (crit ? mods.critMul : 1));
}

/** Daño de un golpe según la fórmula oficial. */
export function damage(
  attacker: Combatant,
  defender: Combatant,
  move: BattleMove,
  effectiveness: number,
  crit: boolean,
  rng: Rng,
  weather: Weather | null = null,
): number {
  const physical = move.damageClass === 'physical';
  const item = attacker.item ?? '';

  // Potencia: habilidades y objetos que refuerzan el ataque.
  let power = move.power;
  if (attacker.ability === 'technician' && power <= 60) power *= 1.5;
  if (PINCH_ABILITIES[attacker.ability] === move.type && attacker.hp <= attacker.maxHp / 3)
    power *= 1.5;
  if (attacker.flashFire && move.type === 'fire') power *= 1.5;
  if (attacker.ability === 'sheer-force' && hasSecondary(move)) power *= 1.3;
  if (TYPE_BOOST_ITEMS[item] === move.type) power *= 1.2;
  if ((item === 'muscle-band' && physical) || (item === 'wise-glasses' && !physical)) power *= 1.1;
  if (defender.ability === 'thick-fat' && (move.type === 'fire' || move.type === 'ice'))
    power *= 0.5;

  // Características: Potencia, Agallas, Cinta y Gafas Elección, Chaleco Asalto…
  let aMul = 1;
  let dMul = 1;
  if (physical) {
    if (attacker.ability === 'huge-power' || attacker.ability === 'pure-power') aMul *= 2;
    if (attacker.ability === 'hustle') aMul *= 1.5;
    if (attacker.ability === 'guts' && attacker.status) aMul *= 1.5;
    if (item === 'choice-band') aMul *= 1.5;
    if (defender.ability === 'marvel-scale' && defender.status) dMul *= 1.5;
    if (weather === 'snow' && defender.types.includes('ice')) dMul *= 1.5;
  } else {
    if (item === 'choice-specs') aMul *= 1.5;
    if (defender.item === 'assault-vest') dMul *= 1.5;
    if (weather === 'sand' && defender.types.includes('rock')) dMul *= 1.5;
  }
  const critMul = attacker.ability === 'sniper' ? 2.25 : 1.5;

  let dmg = baseDamage(
    attacker,
    defender,
    Math.max(1, Math.floor(power)),
    move.damageClass,
    rng,
    crit,
    { aMul, dMul, critMul },
  );
  // Tiempo: la lluvia potencia el Agua y frena el Fuego; el sol, al revés.
  if (weather === 'rain' || weather === 'sun') {
    const boosted = weather === 'rain' ? 'water' : 'fire';
    const weakened = weather === 'rain' ? 'fire' : 'water';
    if (move.type === boosted) dmg = Math.floor(dmg * 1.5);
    else if (move.type === weakened) dmg = Math.floor(dmg * 0.5);
  }
  if (attacker.types.includes(move.type))
    dmg = Math.floor(dmg * (attacker.ability === 'adaptability' ? 2 : 1.5));
  dmg = Math.floor(dmg * effectiveness);
  if (attacker.status === 'brn' && physical && attacker.ability !== 'guts')
    dmg = Math.floor(dmg / 2);
  if (effectiveness > 1 && (defender.ability === 'filter' || defender.ability === 'solid-rock'))
    dmg = Math.floor(dmg * 0.75);
  if (effectiveness > 1 && item === 'expert-belt') dmg = Math.floor(dmg * 1.2);
  if (defender.ability === 'multiscale' && defender.hp === defender.maxHp)
    dmg = Math.floor(dmg / 2);
  if (item === 'life-orb') dmg = Math.floor(dmg * 1.3);
  return Math.max(1, dmg);
}

function applyDamage(ctx: TurnCtx, side: SideKey, amount: number): number {
  const p = activeOf(ctx.state, side);
  const dealt = Math.min(p.hp, amount);
  p.hp -= dealt;
  return dealt;
}

function recoil(ctx: TurnCtx, side: SideKey, amount: number) {
  applyDamage(ctx, side, amount);
  emit(ctx, `${who(ctx.state, side)} también se ha hecho daño.`, { side, anim: 'hit' });
}

function heal(ctx: TurnCtx, side: SideKey, amount: number, announce = true): boolean {
  const p = activeOf(ctx.state, side);
  if (p.hp >= p.maxHp) {
    if (announce) emit(ctx, `¡Los PS de ${who(ctx.state, side)} ya están al máximo!`, { side });
    return false;
  }
  p.hp = Math.min(p.maxHp, p.hp + amount);
  if (announce) emit(ctx, `${who(ctx.state, side)} recuperó salud.`, { side, anim: 'heal' });
  else emit(ctx, '', { side, anim: 'heal' });
  return true;
}

function faintCheck(ctx: TurnCtx, side: SideKey, by?: SideKey): boolean {
  const p = activeOf(ctx.state, side);
  if (p.hp > 0 || p.fainted) return p.fainted;
  p.fainted = true;
  p.status = null;
  p.confusion = 0;
  p.recharging = false;
  emit(ctx, `¡${who(ctx.state, side)} se debilitó!`, {
    side,
    anim: 'faint',
    koBy: by === viewer && side !== viewer ? activeOf(ctx.state, viewer).id : undefined,
  });
  return true;
}

/** Estado y cambios de características que provoca un movimiento. */
function applySecondary(
  ctx: TurnCtx,
  side: SideKey,
  move: BattleMove,
  isStatusMove: boolean,
  chanceMul = 1,
) {
  const targetSide = move.effectTarget === 'user' ? side : other(side);
  const target = activeOf(ctx.state, targetSide);
  if (target.fainted) return;
  let didSomething = false;

  if (move.ailment) {
    const chance = isStatusMove ? 100 : move.ailmentChance * chanceMul;
    if (chance > 0 && ctx.rng() * 100 < chance) {
      didSomething = inflict(ctx, targetSide, move.ailment, move.key, isStatusMove) || didSomething;
    }
  }

  if (move.statChanges.length) {
    const chance = isStatusMove || move.statChance === 0 ? 100 : move.statChance * chanceMul;
    if (ctx.rng() * 100 < chance) {
      for (const { stat, change } of move.statChanges) {
        didSomething = changeStage(ctx, targetSide, stat, change, side) || didSomething;
      }
    }
  }

  if (isStatusMove && !didSomething && move.healing === 0) {
    emit(ctx, `¡Pero no tuvo efecto!`, { side: targetSide });
  }
}

function inflict(
  ctx: TurnCtx,
  side: SideKey,
  ailment: Status | 'confusion',
  moveKey: string,
  announceFail: boolean,
): boolean {
  const p = activeOf(ctx.state, side);
  const name = who(ctx.state, side);
  const blocked = STATUS_BLOCKING_ABILITIES[p.ability];
  const kind = ailment === 'psn' && moveKey === 'toxic' ? 'tox' : ailment;
  if (blocked?.includes(kind)) {
    if (announceFail) emit(ctx, `¡${p.abilityName} protege a ${name}!`, { side });
    return false;
  }
  if (ailment === 'confusion') {
    if (p.confusion > 0) {
      if (announceFail) emit(ctx, `${name} ya está confuso.`, { side });
      return false;
    }
    p.confusion = 2 + Math.floor(ctx.rng() * 4);
    emit(ctx, `¡${name} se encuentra confuso!`, { side, anim: 'status' });
    checkStatusBerry(ctx, side);
    return true;
  }
  const status: Status = ailment === 'psn' && moveKey === 'toxic' ? 'tox' : ailment;
  if (p.status) {
    if (announceFail) emit(ctx, `${name} ya tiene un problema de estado.`, { side });
    return false;
  }
  if (STATUS_IMMUNE[status].some((t) => p.types.includes(t))) {
    if (announceFail) emit(ctx, `No afecta a ${name}…`, { side });
    return false;
  }
  p.status = status;
  if (status === 'slp') p.sleepTurns = 1 + Math.floor(ctx.rng() * 3);
  if (status === 'tox') p.toxicCounter = 1;
  const text: Record<Status, string> = {
    brn: `¡${name} se ha quemado!`,
    psn: `¡${name} ha sido envenenado!`,
    tox: `¡${name} ha sido gravemente envenenado!`,
    par: `¡${name} está paralizado! Puede que no se mueva.`,
    slp: `¡${name} se ha dormido!`,
    frz: `¡${name} se ha congelado!`,
  };
  emit(ctx, text[status], { side, anim: 'status' });
  checkStatusBerry(ctx, side);
  return true;
}

function changeStage(
  ctx: TurnCtx,
  side: SideKey,
  stat: StatKey,
  change: number,
  bySide: SideKey = side,
): boolean {
  const p = activeOf(ctx.state, side);
  const name = who(ctx.state, side);
  // Cuerpo Puro y similares impiden que el rival te baje las características.
  if (
    change < 0 &&
    bySide !== side &&
    (CLEAR_BODY.includes(p.ability) ||
      (p.ability === 'hyper-cutter' && stat === 'attack') ||
      (p.ability === 'keen-eye' && stat === 'accuracy'))
  ) {
    emit(ctx, `¡${p.abilityName} de ${name} evita que baje su ${STAT_NAMES[stat]}!`, { side });
    return false;
  }
  const before = p.stages[stat];
  const after = Math.max(-6, Math.min(6, before + change));
  if (after === before) {
    emit(ctx, `¡${STAT_NAMES[stat]} de ${name} no puede ${change > 0 ? 'subir' : 'bajar'} más!`, {
      side,
    });
    return false;
  }
  p.stages[stat] = after;
  const amount = Math.abs(after - before);
  const verb = change > 0 ? 'subió' : 'bajó';
  const extra = amount >= 3 ? ' muchísimo' : amount === 2 ? ' mucho' : '';
  emit(ctx, `¡${STAT_NAMES[stat]} de ${name} ${verb}${extra}!`, { side, anim: 'status' });
  return true;
}

/**
 * Final del turno, del más rápido al más lento: tiempo atmosférico, Restos,
 * quemadura y veneno, y habilidades como Impulso o Mudar.
 */
function endOfTurn(ctx: TurnCtx) {
  const weather = ctx.state.weather;
  const order: SideKey[] = (['player', 'enemy'] as SideKey[]).sort(
    (a, b) =>
      effectiveSpeed(activeOf(ctx.state, b), weatherOf(ctx.state)) -
      effectiveSpeed(activeOf(ctx.state, a), weatherOf(ctx.state)),
  );

  if (weather) {
    weather.turns -= 1;
    if (weather.turns <= 0) {
      ctx.state.weather = null;
      emit(ctx, WEATHER_TEXT[weather.kind].end);
    } else {
      emit(ctx, WEATHER_TEXT[weather.kind].keep);
      for (const side of order) weatherEffect(ctx, side, weather.kind);
    }
  }

  for (const side of order) {
    const p = activeOf(ctx.state, side);
    if (p.fainted) continue;
    const name = who(ctx.state, side);

    if (p.item === 'leftovers' && p.hp < p.maxHp) {
      heal(ctx, side, Math.max(1, Math.floor(p.maxHp / 16)), false);
      emit(ctx, `${name} recuperó unos pocos PS con ${p.itemName}.`, { side });
    } else if (p.item === 'black-sludge') {
      if (p.types.includes('poison')) {
        if (p.hp < p.maxHp) {
          heal(ctx, side, Math.max(1, Math.floor(p.maxHp / 16)), false);
          emit(ctx, `${name} recuperó unos pocos PS con ${p.itemName}.`, { side });
        }
      } else {
        applyDamage(ctx, side, Math.max(1, Math.floor(p.maxHp / 8)));
        emit(ctx, `${p.itemName} hiere a ${name}.`, { side, anim: 'hit' });
      }
    }

    if (p.status === 'brn') {
      applyDamage(ctx, side, Math.max(1, Math.floor(p.maxHp / 16)));
      emit(ctx, `${name} se resiente de la quemadura.`, { side, anim: 'hit' });
    } else if (p.status === 'psn') {
      applyDamage(ctx, side, Math.max(1, Math.floor(p.maxHp / 8)));
      emit(ctx, `El veneno resta PS a ${name}.`, { side, anim: 'hit' });
    } else if (p.status === 'tox') {
      applyDamage(ctx, side, Math.max(1, Math.floor((p.maxHp * p.toxicCounter) / 16)));
      p.toxicCounter = Math.min(15, p.toxicCounter + 1);
      emit(ctx, `El veneno resta PS a ${name}.`, { side, anim: 'hit' });
    }
    if (faintCheck(ctx, side, other(side))) continue;
    checkBerry(ctx, side);

    if (p.ability === 'speed-boost' && p.stages.speed < 6) {
      emit(ctx, `¡${p.abilityName} de ${name}!`, { side });
      changeStage(ctx, side, 'speed', 1, side);
    }
    if (p.ability === 'shed-skin' && p.status && ctx.rng() < 1 / 3) {
      p.status = null;
      emit(ctx, `¡${p.abilityName} de ${name} le curó el problema de estado!`, {
        side,
        anim: 'heal',
      });
    }
  }
}

/** Daño o curación que provoca el tiempo a cada Pokémon. */
function weatherEffect(ctx: TurnCtx, side: SideKey, kind: Weather) {
  const p = activeOf(ctx.state, side);
  if (p.fainted) return;
  const name = who(ctx.state, side);
  if (kind === 'sand') {
    const immune =
      p.types.some((t) => ['rock', 'ground', 'steel'].includes(t)) ||
      ['sand-veil', 'sand-rush', 'overcoat'].includes(p.ability);
    if (!immune) {
      applyDamage(ctx, side, Math.max(1, Math.floor(p.maxHp / 16)));
      emit(ctx, `La tormenta de arena zarandea a ${name}.`, { side, anim: 'hit' });
    }
  } else if (kind === 'hail' && !p.types.includes('ice')) {
    if (!['overcoat', 'ice-body', 'snow-cloak', 'slush-rush'].includes(p.ability)) {
      applyDamage(ctx, side, Math.max(1, Math.floor(p.maxHp / 16)));
      emit(ctx, `El granizo golpea a ${name}.`, { side, anim: 'hit' });
    }
  }
  const heals =
    (kind === 'rain' && (p.ability === 'rain-dish' || p.ability === 'dry-skin')) ||
    ((kind === 'hail' || kind === 'snow') && p.ability === 'ice-body');
  if (heals && p.hp < p.maxHp) {
    heal(ctx, side, Math.max(1, Math.floor(p.maxHp / 16)), false);
    emit(ctx, `${name} recuperó PS gracias a ${p.abilityName}.`, { side });
  }
  faintCheck(ctx, side, other(side));
}

/* ------------------------------------------------------------------ */
/* Inteligencia del rival                                              */
/* ------------------------------------------------------------------ */

/** Daño medio esperado de un movimiento (sin críticos), para la IA. */
export function expectedDamage(
  attacker: Combatant,
  defender: Combatant,
  move: BattleMove,
  weather: Weather | null = null,
): number {
  if (move.damageClass === 'status' || move.power === 0) return 0;
  const eff = typeEffectiveness(move.type, defender.types);
  if (eff === 0) return 0;
  if (ABSORB_ABILITIES[defender.ability]?.type === move.type) return 0;
  if (defender.ability === 'wonder-guard' && eff <= 1) return 0;
  const mid = () => 0.5;
  const hits = move.maxHits > 1 ? (move.minHits + move.maxHits) / 2 : 1;
  const acc = move.accuracy === null ? 1 : move.accuracy / 100;
  return damage(attacker, defender, move, eff, false, mid, weather) * hits * acc;
}

/**
 * El rival puntúa sus opciones como lo haría un entrenador: busca rematar,
 * prefiere movimientos eficaces, usa estados si el objetivo no tiene ninguno
 * y se cura cuando va mal. Un poco de azar para que no sea predecible.
 */
export function chooseEnemyAction(state: BattleState, rng: Rng = Math.random): Action {
  const me = activeOf(state, 'enemy');
  const foe = activeOf(state, 'player');
  if (!hasUsableMoves(me)) return { kind: 'struggle' };
  const weather = weatherOf(state);
  const allowed = allowedMoves(me);

  const scored = me.moves
    .map((move, index) => ({ move, index }))
    .filter(({ index }) => allowed.includes(index))
    .map(({ move, index }) => {
      let score: number;
      if (move.weather) {
        // Cambiar el tiempo compensa si favorece a sus ataques.
        const favours: Record<string, string> = { rain: 'water', sun: 'fire' };
        const helps = me.moves.some((m) => m.type === favours[move.weather!]);
        score = weather !== move.weather && helps && me.hp / me.maxHp > 0.5 ? 28 : 2;
      } else if (move.damageClass !== 'status') {
        const dmg = expectedDamage(me, foe, move, weather);
        score = (dmg / foe.maxHp) * 100;
        if (dmg >= foe.hp) score += 60 + move.priority * 20;
        // Autodestruirse solo compensa si es para rematar; recargar, menos.
        if (move.selfKo) score *= dmg >= foe.hp && me.hp / me.maxHp < 0.35 ? 1 : 0.2;
        if (move.recharge) score *= dmg >= foe.hp ? 1 : 0.7;
      } else if (move.healing > 0) {
        score = me.hp / me.maxHp < 0.45 ? 70 : 2;
      } else if (move.ailment && move.effectTarget === 'opponent') {
        const blocked =
          move.ailment === 'confusion'
            ? foe.confusion > 0
            : foe.status !== null ||
              STATUS_IMMUNE[
                move.ailment === 'psn' && move.key === 'toxic' ? 'tox' : move.ailment
              ].some((t) => foe.types.includes(t));
        score = blocked ? 0 : move.ailment === 'slp' || move.ailment === 'par' ? 45 : 35;
      } else if (move.statChanges.length) {
        const onSelf = move.effectTarget === 'user';
        const stages = move.statChanges.map((c) => (onSelf ? me : foe).stages[c.stat]);
        const room = onSelf ? stages.every((s) => s < 2) : stages.every((s) => s > -2);
        score = room && me.hp / me.maxHp > 0.6 ? 30 : 3;
      } else {
        score = 1;
      }
      return { index, score: score * (0.85 + rng() * 0.3) };
    })
    .sort((a, b) => b.score - a.score);

  // Uno de cada diez turnos elige otro movimiento al azar.
  const pick = rng() < 0.1 ? scored[Math.floor(rng() * scored.length)] : scored[0];
  return { kind: 'move', index: pick.index };
}

/** Siguiente Pokémon del rival: el que mejor pega al Pokémon del jugador. */
export function chooseEnemyReplacement(state: BattleState): number {
  const foe = activeOf(state, 'player');
  let best = -1;
  let bestScore = -1;
  state.enemy.team.forEach((p, i) => {
    if (p.fainted) return;
    const score = Math.max(0, ...p.moves.map((m) => expectedDamage(p, foe, m, weatherOf(state))));
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/* ------------------------------------------------------------------ */
/* Conversión desde PokeAPI                                            */
/* ------------------------------------------------------------------ */

const AILMENTS: Record<string, Status | 'confusion'> = {
  paralysis: 'par',
  sleep: 'slp',
  freeze: 'frz',
  burn: 'brn',
  poison: 'psn',
  confusion: 'confusion',
};

const STAT_KEYS: Record<string, StatKey> = {
  attack: 'attack',
  defense: 'defense',
  'special-attack': 'specialAttack',
  'special-defense': 'specialDefense',
  speed: 'speed',
  accuracy: 'accuracy',
  evasion: 'evasion',
};

const SELF_TARGETS = ['user', 'user-and-allies', 'users-field', 'all-allies', 'user-or-ally'];

/** Datos de un movimiento de PokeAPI que necesita el motor. */
export interface ApiMove {
  name: string;
  power: number | null;
  accuracy: number | null;
  pp: number;
  priority?: number;
  type: { name: string };
  damage_class: { name: string };
  names?: { name: string; language: { name: string } }[];
  target?: { name: string };
  stat_changes?: { change: number; stat: { name: string } }[];
  meta?: {
    category?: { name: string };
    ailment: { name: string };
    ailment_chance: number;
    crit_rate: number;
    drain: number;
    healing: number;
    flinch_chance: number;
    stat_chance: number;
    min_hits: number | null;
    max_hits: number | null;
  } | null;
}

export function toBattleMove(data: ApiMove): BattleMove {
  const meta = data.meta;
  const category = meta?.category?.name ?? '';
  const cls = (data.damage_class.name as DamageClass) ?? 'physical';
  const onSelf =
    category === 'damage-raise' ||
    category === 'heal' ||
    (cls === 'status' && SELF_TARGETS.includes(data.target?.name ?? ''));
  return {
    key: data.name,
    name: data.names?.find((n) => n.language.name === 'es')?.name ?? data.name.replace(/-/g, ' '),
    power: data.power ?? 0,
    type: data.type.name,
    damageClass: cls,
    accuracy: data.accuracy,
    pp: data.pp,
    maxPp: data.pp,
    priority: data.priority ?? 0,
    effectTarget: onSelf ? 'user' : 'opponent',
    ailment: AILMENTS[meta?.ailment?.name ?? ''] ?? null,
    ailmentChance: meta?.ailment_chance ?? 0,
    statChanges: (data.stat_changes ?? [])
      .filter((c) => STAT_KEYS[c.stat.name])
      .map((c) => ({ stat: STAT_KEYS[c.stat.name], change: c.change })),
    statChance: meta?.stat_chance ?? 0,
    critRate: meta?.crit_rate ?? 0,
    drain: meta?.drain ?? 0,
    healing: meta?.healing ?? 0,
    flinchChance: meta?.flinch_chance ?? 0,
    minHits: meta?.min_hits ?? 1,
    maxHits: meta?.max_hits ?? 1,
    ohko: category === 'ohko',
    selfKo: SELF_KO.includes(data.name),
    recharge: RECHARGE.includes(data.name),
    weather: WEATHER_MOVES[data.name] ?? null,
  };
}

const SELF_KO = ['self-destruct', 'explosion', 'misty-explosion'];
const RECHARGE = [
  'hyper-beam',
  'giga-impact',
  'blast-burn',
  'hydro-cannon',
  'frenzy-plant',
  'rock-wrecker',
  'roar-of-time',
  'eternabeam',
  'prismatic-laser',
  'meteor-assault',
];

/**
 * Movimientos con mecánicas que el motor no simula (cargar un turno, quedarse
 * bloqueado, daño fijo o variable, depender de lo que haga el rival…). Usados
 * como un ataque normal serían demasiado fuertes o no tendrían sentido.
 */
const UNSUPPORTED = new Set([
  'solar-beam',
  'solar-blade',
  'sky-attack',
  'skull-bash',
  'razor-wind',
  'freeze-shock',
  'ice-burn',
  'meteor-beam',
  'electro-shot',
  'dig',
  'fly',
  'dive',
  'bounce',
  'phantom-force',
  'shadow-force',
  'sky-drop',
  'focus-punch',
  'outrage',
  'thrash',
  'petal-dance',
  'raging-fury',
  'uproar',
  'rollout',
  'ice-ball',
  'future-sight',
  'doom-desire',
  'bide',
  'counter',
  'mirror-coat',
  'metal-burst',
  'comeuppance',
  'endeavor',
  'final-gambit',
  'last-resort',
  'belch',
  'dream-eater',
  'snore',
  'sleep-talk',
  'fake-out',
  'first-impression',
  'sucker-punch',
  'thunderclap',
  'burn-up',
  'double-shock',
  'steel-beam',
  'mind-blown',
  'chloroblast',
  'beat-up',
  'present',
  'magnitude',
  'natural-gift',
  'fling',
  'spit-up',
  'trump-card',
  'synchronoise',
  'rage',
  'fury-cutter',
  'echoed-voice',
  'round',
  'retaliate',
  'stomping-tantrum',
  'payback',
  'revenge',
  'avalanche',
  'assurance',
  'hex',
  'venoshock',
  'brine',
  'facade',
  'acrobatics',
  'hyperspace-fury',
  'shell-trap',
  'steel-roller',
  'poltergeist',
  'eruption',
  'water-spout',
  'dragon-energy',
  'reversal',
  'flail',
  'low-kick',
  'grass-knot',
  'heavy-slam',
  'heat-crash',
  'gyro-ball',
  'electro-ball',
  'punishment',
  'return',
  'frustration',
  'hidden-power',
  'weather-ball',
  'terrain-pulse',
  'struggle',
  'rest',
  'self-destruct-z',
  'focus-energy',
  'relic-song',
  'pollen-puff',
  'false-swipe',
  'hold-back',
  'super-fang',
  'nature-power',
  'u-turn',
  'volt-switch',
  'flip-turn',
  'parting-shot',
  'baton-pass',
  'teleport',
  'roar',
  'whirlwind',
  'dragon-tail',
  'circle-throw',
  'perish-song',
  'destiny-bond',
  'curse',
  'pain-split',
  'belly-drum',
  'fillet-away',
  'clangorous-soul',
  'shed-tail',
  'substitute',
  'protect',
  'detect',
  'endure',
  'spiky-shield',
  'kings-shield',
  'baneful-bunker',
  'obstruct',
  'silk-trap',
  'burning-bulwark',
  'swagger',
  'flatter',
  'yawn',
  'leech-seed',
]);

/**
 * Si el motor sabe aplicar el movimiento: los de daño con potencia fija y los
 * de estado que provocan un problema de estado, cambian características o curan.
 */
export function isSupportedMove(m: BattleMove, category = ''): boolean {
  if (UNSUPPORTED.has(m.key)) return false;
  if (m.ohko || m.weather) return true;
  if (m.damageClass !== 'status') return m.power > 0;
  if (!['ailment', 'net-good-stats', 'heal'].includes(category)) return false;
  return m.ailment !== null || m.statChanges.length > 0 || m.healing > 0;
}
