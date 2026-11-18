// Reglas del progreso del entrenador: experiencia, niveles, retos diarios,
// racha de días y logros. Son funciones puras (sin Firebase ni Angular) para
// poder probarlas y ajustar el equilibrio del juego en un solo sitio.

import { TYPE_NAMES_ES } from '../pipes/type-name.pipe';

export interface TrainerProgress {
  xp: number;
  achievements: string[];
  shinies: number[];
  stats: {
    battlesWon: number;
    battlesPlayed: number;
    kos: number;
    guessesCorrect: number;
    bestGuessStreak: number;
  };
  /** Contadores del día para los retos diarios. */
  daily: { date: string; counters: Record<string, number>; rewarded: string[] };
  /** Días seguidos jugando. */
  streak: { lastDay: string; days: number };
}

export type GameEvent =
  | { type: 'visit' }
  | {
      type: 'battle';
      won: boolean;
      kos: number;
      /** Tipos de cada Pokémon capturado. */
      capturedTypes: string[][];
      shinies: number[];
    }
  | { type: 'guess'; correct: boolean; streak: number }
  | { type: 'daily-pokemon' };

export type Reward =
  | { kind: 'xp'; amount: number; reason: string }
  | { kind: 'level'; level: number; unlock?: string }
  | { kind: 'achievement'; id: string; title: string; icon: string }
  | { kind: 'challenge'; title: string; xp: number }
  | { kind: 'streak'; days: number; xp: number }
  | { kind: 'bonus'; text: string };

// ---------------------------------------------------------------------------
// Experiencia y niveles
// ---------------------------------------------------------------------------

export const XP = {
  battleWin: 100,
  battleLoss: 25,
  perKo: 15,
  newShiny: 200,
  guessCorrect: 10,
  dailyPokemon: 30,
  /** Extra por cada 5 aciertos seguidos en "Adivina el Pokémon". */
  guessStreakBonus: 25,
  challenge: 50,
  allChallenges: 100,
  /** XP por día de racha, con tope de 7 días. */
  streakPerDay: 10,
};

/** Probabilidad de que una victoria dé el doble de XP. */
export const SURPRISE_BONUS_CHANCE = 0.15;
/** Probabilidad de que un rival salga shiny (mucho más alta que en los juegos, a propósito). */
export const SHINY_CHANCE = 1 / 40;

/** XP total necesaria para alcanzar un nivel: 100, 300, 600, 1000... */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** Progreso dentro del nivel actual, de 0 a 1, para la barra de experiencia. */
export function levelProgress(xp: number): { level: number; current: number; needed: number } {
  const level = levelFromXp(xp);
  const base = xpForLevel(level);
  return { level, current: xp - base, needed: xpForLevel(level + 1) - base };
}

// ---------------------------------------------------------------------------
// Regiones: cada pocos niveles aparecen rivales de una generación nueva
// ---------------------------------------------------------------------------

export const REGIONS = [
  { level: 1, name: 'Kanto', lastId: 151 },
  { level: 3, name: 'Johto', lastId: 251 },
  { level: 5, name: 'Hoenn', lastId: 386 },
  { level: 7, name: 'Sinnoh', lastId: 493 },
  { level: 9, name: 'Teselia', lastId: 649 },
  { level: 11, name: 'Kalos', lastId: 721 },
  { level: 13, name: 'Alola', lastId: 809 },
  { level: 15, name: 'Galar', lastId: 905 },
  { level: 17, name: 'Paldea', lastId: 1025 },
];

/** Último número de Pokédex que puede salir como rival según el nivel. */
export function maxEnemyId(level: number): number {
  return REGIONS.filter((r) => r.level <= level).at(-1)!.lastId;
}

/** Cuántos Pokémon de cada región tiene la colección. */
export function regionCompletion(collection: number[]) {
  const owned = new Set(collection);
  return REGIONS.map((region, i) => {
    const firstId = i === 0 ? 1 : REGIONS[i - 1].lastId + 1;
    const total = region.lastId - firstId + 1;
    let count = 0;
    for (let id = firstId; id <= region.lastId; id++) if (owned.has(id)) count++;
    return { name: region.name, count, total, complete: count === total };
  });
}

export function nextRegion(level: number) {
  return REGIONS.find((r) => r.level > level);
}

// ---------------------------------------------------------------------------
// Retos diarios
// ---------------------------------------------------------------------------

export interface DailyChallenge {
  id: string;
  title: string;
  /** Contador de `daily.counters` que hace avanzar el reto. */
  counter: string;
  goal: number;
}

const CATCHABLE_TYPES = Object.keys(TYPE_NAMES_ES).filter((t) => t !== 'stellar');

/** Número pseudoaleatorio estable a partir de un texto (misma fecha → mismos retos). */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Los tres retos del día: iguales para todos los jugadores ese día. */
export function dailyChallenges(date: string): DailyChallenge[] {
  const rand = seededRandom(date);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  const type = pick(CATCHABLE_TYPES);
  const wins = pick([1, 2, 3]);
  const guesses = pick([5, 10, 15]);
  const kos = pick([5, 8, 12]);

  const battle = pick([
    {
      id: 'win',
      title: `Gana ${wins} ${wins === 1 ? 'batalla' : 'batallas'}`,
      counter: 'win',
      goal: wins,
    },
    { id: 'ko', title: `Derrota a ${kos} Pokémon rivales`, counter: 'ko', goal: kos },
  ]);
  return [
    battle,
    { id: 'guess', title: `Acierta ${guesses} siluetas`, counter: 'guess', goal: guesses },
    {
      id: 'catch',
      title: `Captura un Pokémon de tipo ${TYPE_NAMES_ES[type]}`,
      counter: `catch-${type}`,
      goal: 1,
    },
  ];
}

/** Pokémon del día: el mismo para todos los jugadores durante ese día. */
export function dailyPokemonId(date: string): number {
  return Math.floor(seededRandom(`pokemon-${date}`)() * 1025) + 1;
}

/** ¿Ya se ha capturado hoy el Pokémon del día? */
export function dailyPokemonClaimed(progress: TrainerProgress | null, today: string): boolean {
  return progress?.daily.date === today && progress.daily.rewarded.includes('daily-pokemon');
}

// ---------------------------------------------------------------------------
// Logros
// ---------------------------------------------------------------------------

interface AchievementContext {
  progress: TrainerProgress;
  level: number;
  collectionSize: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  check: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-win',
    title: 'Primera victoria',
    description: 'Gana tu primera batalla',
    icon: '🏆',
    check: (c) => c.progress.stats.battlesWon >= 1,
  },
  {
    id: 'wins-10',
    title: 'Entrenador curtido',
    description: 'Gana 10 batallas',
    icon: '⚔️',
    check: (c) => c.progress.stats.battlesWon >= 10,
  },
  {
    id: 'wins-50',
    title: 'As de los combates',
    description: 'Gana 50 batallas',
    icon: '👑',
    check: (c) => c.progress.stats.battlesWon >= 50,
  },
  {
    id: 'ko-100',
    title: 'Imparable',
    description: 'Derrota a 100 Pokémon rivales',
    icon: '💥',
    check: (c) => c.progress.stats.kos >= 100,
  },
  {
    id: 'collection-10',
    title: 'Coleccionista',
    description: 'Reúne 10 Pokémon',
    icon: '📦',
    check: (c) => c.collectionSize >= 10,
  },
  {
    id: 'collection-50',
    title: 'Gran coleccionista',
    description: 'Reúne 50 Pokémon',
    icon: '🎒',
    check: (c) => c.collectionSize >= 50,
  },
  {
    id: 'collection-151',
    title: 'Los 151 originales',
    description: 'Reúne 151 Pokémon',
    icon: '📕',
    check: (c) => c.collectionSize >= 151,
  },
  {
    id: 'collection-500',
    title: 'Maestro Pokémon',
    description: 'Reúne 500 Pokémon',
    icon: '🌟',
    check: (c) => c.collectionSize >= 500,
  },
  {
    id: 'first-shiny',
    title: '¡Brilla!',
    description: 'Captura tu primer Pokémon shiny',
    icon: '✨',
    check: (c) => c.progress.shinies.length >= 1,
  },
  {
    id: 'shiny-5',
    title: 'Cazador de shinies',
    description: 'Captura 5 Pokémon shiny',
    icon: '💎',
    check: (c) => c.progress.shinies.length >= 5,
  },
  {
    id: 'guess-streak-10',
    title: 'Ojo de halcón',
    description: 'Acierta 10 siluetas seguidas',
    icon: '👁️',
    check: (c) => c.progress.stats.bestGuessStreak >= 10,
  },
  {
    id: 'guess-streak-25',
    title: 'Profesor Pokémon',
    description: 'Acierta 25 siluetas seguidas',
    icon: '🎓',
    check: (c) => c.progress.stats.bestGuessStreak >= 25,
  },
  {
    id: 'guesses-100',
    title: 'Enciclopedia andante',
    description: 'Acierta 100 siluetas en total',
    icon: '📚',
    check: (c) => c.progress.stats.guessesCorrect >= 100,
  },
  {
    id: 'streak-3',
    title: 'Constante',
    description: 'Juega 3 días seguidos',
    icon: '🔥',
    check: (c) => c.progress.streak.days >= 3,
  },
  {
    id: 'streak-7',
    title: 'Una semana entera',
    description: 'Juega 7 días seguidos',
    icon: '📅',
    check: (c) => c.progress.streak.days >= 7,
  },
  {
    id: 'level-5',
    title: 'Rumbo a Hoenn',
    description: 'Alcanza el nivel 5',
    icon: '⭐',
    check: (c) => c.level >= 5,
  },
  {
    id: 'level-10',
    title: 'Veterano',
    description: 'Alcanza el nivel 10',
    icon: '🌠',
    check: (c) => c.level >= 10,
  },
  {
    id: 'level-17',
    title: 'Toda la Pokédex',
    description: 'Desbloquea Paldea (nivel 17)',
    icon: '🗺️',
    check: (c) => c.level >= 17,
  },
];

// ---------------------------------------------------------------------------
// Aplicar un evento
// ---------------------------------------------------------------------------

export function emptyProgress(): TrainerProgress {
  return {
    xp: 0,
    achievements: [],
    shinies: [],
    stats: { battlesWon: 0, battlesPlayed: 0, kos: 0, guessesCorrect: 0, bestGuessStreak: 0 },
    daily: { date: '', counters: {}, rewarded: [] },
    streak: { lastDay: '', days: 0 },
  };
}

/** Completa con valores por defecto un progreso guardado (o inexistente). */
export function normalizeProgress(raw: Partial<TrainerProgress> | undefined): TrainerProgress {
  const base = emptyProgress();
  return {
    ...base,
    ...raw,
    stats: { ...base.stats, ...raw?.stats },
    daily: { ...base.daily, ...raw?.daily },
    streak: { ...base.streak, ...raw?.streak },
    achievements: raw?.achievements ?? [],
    shinies: raw?.shinies ?? [],
  };
}

/** Fecha local en formato AAAA-MM-DD. */
export function dayKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

/**
 * Aplica un evento al progreso y devuelve el nuevo estado y las recompensas
 * a mostrar. `random` se inyecta para poder probar los bonus sorpresa.
 */
export function applyEvent(
  current: TrainerProgress,
  event: GameEvent,
  options: { today: string; collectionSize: number; random?: () => number },
): { progress: TrainerProgress; rewards: Reward[] } {
  const random = options.random ?? Math.random;
  const p: TrainerProgress = structuredClone(current);
  const rewards: Reward[] = [];
  const levelBefore = levelFromXp(p.xp);
  const gainXp = (amount: number, reason: string) => {
    p.xp += amount;
    rewards.push({ kind: 'xp', amount, reason });
  };

  // Los contadores diarios se reinician al cambiar de día.
  if (p.daily.date !== options.today) {
    p.daily = { date: options.today, counters: {}, rewarded: [] };
  }
  const count = (counter: string, amount = 1) => {
    p.daily.counters[counter] = (p.daily.counters[counter] ?? 0) + amount;
  };

  // Racha de días: se cuenta con cualquier actividad, una vez al día.
  if (p.streak.lastDay !== options.today) {
    p.streak.days = p.streak.lastDay === previousDay(options.today) ? p.streak.days + 1 : 1;
    p.streak.lastDay = options.today;
    const xp = Math.min(p.streak.days, 7) * XP.streakPerDay;
    p.xp += xp;
    rewards.push({ kind: 'streak', days: p.streak.days, xp });
  }

  if (event.type === 'battle') {
    p.stats.battlesPlayed++;
    p.stats.kos += event.kos;
    count('ko', event.kos);
    if (event.kos > 0) gainXp(event.kos * XP.perKo, `${event.kos} rivales derrotados`);

    if (event.won) {
      p.stats.battlesWon++;
      count('win');
      const surprise = random() < SURPRISE_BONUS_CHANCE;
      gainXp(XP.battleWin * (surprise ? 2 : 1), 'Victoria');
      if (surprise) rewards.push({ kind: 'bonus', text: '¡Bonus sorpresa! XP de victoria x2' });

      for (const types of event.capturedTypes) types.forEach((t) => count(`catch-${t}`));
      for (const id of event.shinies) {
        if (!p.shinies.includes(id)) {
          p.shinies.push(id);
          gainXp(XP.newShiny, '¡Shiny capturado!');
        }
      }
    } else {
      gainXp(XP.battleLoss, 'Experiencia de combate');
    }
  }

  if (event.type === 'guess' && event.correct) {
    p.stats.guessesCorrect++;
    p.stats.bestGuessStreak = Math.max(p.stats.bestGuessStreak, event.streak);
    count('guess');
    p.xp += XP.guessCorrect;
    if (event.streak > 0 && event.streak % 5 === 0) {
      gainXp(XP.guessStreakBonus, `Racha de ${event.streak} aciertos`);
    }
  }

  if (event.type === 'daily-pokemon' && !p.daily.rewarded.includes('daily-pokemon')) {
    p.daily.rewarded.push('daily-pokemon');
    gainXp(XP.dailyPokemon, 'Pokémon del día');
  }

  // Retos diarios completados con este evento.
  const challenges = dailyChallenges(options.today);
  for (const c of challenges) {
    if (!p.daily.rewarded.includes(c.id) && (p.daily.counters[c.counter] ?? 0) >= c.goal) {
      p.daily.rewarded.push(c.id);
      p.xp += XP.challenge;
      rewards.push({ kind: 'challenge', title: c.title, xp: XP.challenge });
      if (challenges.every((ch) => p.daily.rewarded.includes(ch.id))) {
        gainXp(XP.allChallenges, '¡Todos los retos del día!');
      }
    }
  }

  // Subidas de nivel (puede haber varias de golpe).
  const levelAfter = levelFromXp(p.xp);
  for (let level = levelBefore + 1; level <= levelAfter; level++) {
    const region = REGIONS.find((r) => r.level === level);
    rewards.push({ kind: 'level', level, unlock: region?.name });
  }

  // Logros nuevos.
  const ctx = { progress: p, level: levelAfter, collectionSize: options.collectionSize };
  for (const a of ACHIEVEMENTS) {
    if (!p.achievements.includes(a.id) && a.check(ctx)) {
      p.achievements.push(a.id);
      rewards.push({ kind: 'achievement', id: a.id, title: a.title, icon: a.icon });
    }
  }

  return { progress: p, rewards };
}

// ---------------------------------------------------------------------------
// Ranking semanal
// ---------------------------------------------------------------------------

/** Semana ISO (empieza el lunes) en formato "2026-W47". */
export function weekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  // El jueves de la semana determina a qué año pertenece.
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Inicio del próximo lunes (hora local): cuando se reinicia el ranking semanal. */
export function nextWeekStart(date = new Date()): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysUntilMonday = (8 - next.getDay()) % 7 || 7;
  next.setDate(next.getDate() + daysUntilMonday);
  return next;
}

/** XP total que suman unas recompensas (para el ranking). */
export function xpFromRewards(rewards: Reward[]): number {
  return rewards.reduce((sum, r) => {
    if (r.kind === 'xp') return sum + r.amount;
    if (r.kind === 'streak' || r.kind === 'challenge') return sum + r.xp;
    return sum;
  }, 0);
}
