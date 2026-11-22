/**
 * Preparación de equipos: naturalezas, IV, la configuración de cada Pokémon
 * (movimientos y habilidad) y los equipos guardados con nombre.
 *
 * La naturaleza y los IV no se guardan: salen de un hash de tu cuenta y del
 * Pokémon, así que tu Pikachu siempre es el mismo y el de otro jugador no.
 */
import { Ivs, NatureStat } from './battle-engine';

export interface Nature {
  key: string;
  name: string;
  up: NatureStat | null;
  down: NatureStat | null;
}

const A: NatureStat = 'attack';
const D: NatureStat = 'defense';
const SA: NatureStat = 'specialAttack';
const SD: NatureStat = 'specialDefense';
const S: NatureStat = 'speed';

/** Las 25 naturalezas en el orden oficial; las 5 neutras no cambian nada. */
export const NATURES: Nature[] = [
  { key: 'hardy', name: 'Fuerte', up: null, down: null },
  { key: 'lonely', name: 'Huraña', up: A, down: D },
  { key: 'brave', name: 'Audaz', up: A, down: S },
  { key: 'adamant', name: 'Firme', up: A, down: SA },
  { key: 'naughty', name: 'Pícara', up: A, down: SD },
  { key: 'bold', name: 'Osada', up: D, down: A },
  { key: 'docile', name: 'Dócil', up: null, down: null },
  { key: 'relaxed', name: 'Plácida', up: D, down: S },
  { key: 'impish', name: 'Agitada', up: D, down: SA },
  { key: 'lax', name: 'Floja', up: D, down: SD },
  { key: 'timid', name: 'Miedosa', up: S, down: A },
  { key: 'hasty', name: 'Activa', up: S, down: D },
  { key: 'serious', name: 'Seria', up: null, down: null },
  { key: 'jolly', name: 'Alegre', up: S, down: SA },
  { key: 'naive', name: 'Ingenua', up: S, down: SD },
  { key: 'modest', name: 'Modesta', up: SA, down: A },
  { key: 'mild', name: 'Afable', up: SA, down: D },
  { key: 'quiet', name: 'Mansa', up: SA, down: S },
  { key: 'bashful', name: 'Tímida', up: null, down: null },
  { key: 'rash', name: 'Alocada', up: SA, down: SD },
  { key: 'calm', name: 'Serena', up: SD, down: A },
  { key: 'gentle', name: 'Amable', up: SD, down: D },
  { key: 'sassy', name: 'Grosera', up: SD, down: S },
  { key: 'careful', name: 'Cauta', up: SD, down: SA },
  { key: 'quirky', name: 'Rara', up: null, down: null },
];

export const STAT_LABEL: Record<'hp' | NatureStat, string> = {
  hp: 'PS',
  attack: 'Ataque',
  defense: 'Defensa',
  specialAttack: 'At. Esp.',
  specialDefense: 'Def. Esp.',
  speed: 'Velocidad',
};

/** FNV-1a de 32 bits: rápido y estable entre navegadores. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Naturaleza fija de un Pokémon de un jugador. */
export function natureFor(uid: string, pokemonId: number): Nature {
  return NATURES[hash(`${uid}:${pokemonId}:nature`) % NATURES.length];
}

/** IV fijos (0–31) de un Pokémon de un jugador. */
export function ivsFor(uid: string, pokemonId: number): Ivs {
  const iv = (stat: string) => hash(`${uid}:${pokemonId}:${stat}`) % 32;
  return {
    hp: iv('hp'),
    attack: iv('attack'),
    defense: iv('defense'),
    specialAttack: iv('specialAttack'),
    specialDefense: iv('specialDefense'),
    speed: iv('speed'),
  };
}

export function randomNature(rng: () => number = Math.random): Nature {
  return NATURES[Math.floor(rng() * NATURES.length)];
}

export function randomIvs(rng: () => number = Math.random): Ivs {
  const iv = () => Math.floor(rng() * 32);
  return {
    hp: iv(),
    attack: iv(),
    defense: iv(),
    specialAttack: iv(),
    specialDefense: iv(),
    speed: iv(),
  };
}

/** Suma de IV en porcentaje, para mostrar lo "bueno" que ha salido. */
export function ivPercent(ivs: Ivs): number {
  const total = Object.values(ivs).reduce((a, b) => a + b, 0);
  return Math.round((total / (31 * 6)) * 100);
}

/** Configuración elegida para un Pokémon: sus 4 movimientos y su habilidad. */
export interface Build {
  moves: string[];
  ability: string;
}
export type Builds = Record<number, Build>;

export interface SavedTeam {
  id: string;
  name: string;
  members: number[];
}

export const MAX_SAVED_TEAMS = 5;
export const MAX_TEAM = 6;
export const MAX_MOVES = 4;
const KEY_PATTERN = /^[a-z0-9-]{1,40}$/;

/** Limpia las configuraciones leídas de Firestore. */
export function normalizeBuilds(raw: unknown): Builds {
  const builds: Builds = {};
  if (!raw || typeof raw !== 'object') return builds;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = value as Partial<Build> | null;
    if (!v || !Array.isArray(v.moves)) continue;
    const moves = [...new Set(v.moves.filter((m) => typeof m === 'string' && KEY_PATTERN.test(m)))];
    if (moves.length === 0) continue;
    builds[Number(id)] = {
      moves: moves.slice(0, MAX_MOVES),
      ability: typeof v.ability === 'string' && KEY_PATTERN.test(v.ability) ? v.ability : '',
    };
  }
  return builds;
}

/** Limpia los equipos guardados: solo Pokémon de tu colección, sin repetir. */
export function normalizeTeams(raw: unknown, collection: number[]): SavedTeam[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is SavedTeam => !!t && typeof t === 'object' && typeof t.id === 'string')
    .map((t) => ({
      id: t.id,
      name: (typeof t.name === 'string' ? t.name : '').trim().slice(0, 24) || 'Equipo',
      members: [
        ...new Set(
          (Array.isArray(t.members) ? t.members : []).filter((id) => collection.includes(id)),
        ),
      ].slice(0, MAX_TEAM),
    }))
    .slice(0, MAX_SAVED_TEAMS);
}

export function newTeamId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Mueve un miembro del equipo una posición (el primero es el que sale). */
export function moveMember(members: number[], index: number, delta: -1 | 1): number[] {
  const to = index + delta;
  if (to < 0 || to >= members.length) return members;
  const next = [...members];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
