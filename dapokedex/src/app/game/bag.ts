import { HELD_ITEMS, STATUS_BERRIES, TYPE_BOOST_ITEMS, WEATHER_ROCKS } from './battle-data';

/**
 * Mochila del entrenador: cuántas unidades tiene de cada objeto y qué objeto
 * lleva equipado cada Pokémon. Las unidades equipadas cuentan dentro del total.
 */
export type Bag = Record<string, number>;
export type Held = Record<number, string>;

export const MAX_PER_ITEM = 99;

/** Objetos que se gastan al usarse en combate. */
export const CONSUMABLE_ITEMS = new Set<string>([
  'sitrus-berry',
  'oran-berry',
  'focus-sash',
  ...Object.keys(STATUS_BERRIES),
]);

/** Rareza: decide de dónde sale cada objeto. */
export const COMMON_ITEMS = ['oran-berry', 'sitrus-berry', ...Object.keys(STATUS_BERRIES)];
export const UNCOMMON_ITEMS = [
  'leftovers',
  'black-sludge',
  'muscle-band',
  'wise-glasses',
  'quick-claw',
  'scope-lens',
  'shell-bell',
  'rocky-helmet',
  'expert-belt',
  ...Object.keys(TYPE_BOOST_ITEMS),
  ...Object.keys(WEATHER_ROCKS),
];
export const RARE_ITEMS = [
  'life-orb',
  'focus-sash',
  'choice-band',
  'choice-specs',
  'choice-scarf',
  'assault-vest',
];

/** Lo que trae la mochila la primera vez, para poder probar los objetos. */
export const STARTER_KIT: Bag = { 'oran-berry': 3, 'sitrus-berry': 1, leftovers: 1 };

/** Probabilidad de que un rival derrotado suelte el objeto que llevaba. */
export const DROP_CHANCE = 0.35;
/** Probabilidad de encontrar una baya tras ganar un combate. */
export const FIND_BERRY_CHANCE = 0.3;

export function itemSprite(key: string): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${key}.png`;
}

/** Limpia lo leído de Firestore: solo objetos conocidos y cantidades válidas. */
export function normalizeBag(raw: unknown): Bag {
  const bag: Bag = {};
  if (!raw || typeof raw !== 'object') return bag;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!HELD_ITEMS.includes(key) || typeof value !== 'number') continue;
    const n = Math.min(MAX_PER_ITEM, Math.max(0, Math.floor(value)));
    if (n > 0) bag[key] = n;
  }
  return bag;
}

/** Equipados que siguen siendo válidos (objeto conocido y con unidades suficientes). */
export function normalizeHeld(raw: unknown, bag: Bag): Held {
  const held: Held = {};
  if (!raw || typeof raw !== 'object') return held;
  const used: Record<string, number> = {};
  for (const [id, key] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== 'string' || !HELD_ITEMS.includes(key)) continue;
    if ((used[key] ?? 0) >= (bag[key] ?? 0)) continue;
    used[key] = (used[key] ?? 0) + 1;
    held[Number(id)] = key;
  }
  return held;
}

/** Unidades libres de un objeto (las que no lleva ningún Pokémon). */
export function available(bag: Bag, held: Held, key: string): number {
  const equipped = Object.values(held).filter((k) => k === key).length;
  return Math.max(0, (bag[key] ?? 0) - equipped);
}

export function canEquip(bag: Bag, held: Held, pokemonId: number, key: string): boolean {
  if (held[pokemonId] === key) return true;
  return available(bag, held, key) > 0;
}

const pick = <T>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)];

/**
 * Objetos que se ganan al terminar un combate: el rival puede soltar el que
 * llevaba si no lo gastó, y a veces se encuentra una baya.
 */
export function battleDrops(
  won: boolean,
  enemyItems: (string | null)[],
  rng: () => number = Math.random,
): string[] {
  if (!won) return [];
  const drops = enemyItems.filter(
    (k): k is string => !!k && HELD_ITEMS.includes(k) && rng() < DROP_CHANCE,
  );
  if (rng() < FIND_BERRY_CHANCE) drops.push(pick(COMMON_ITEMS, rng));
  return drops.slice(0, 3);
}

/** Premio por subir de nivel: cada 5 niveles uno raro, si no uno poco común. */
export function levelItem(level: number, rng: () => number = Math.random): string {
  return level % 5 === 0 ? pick(RARE_ITEMS, rng) : pick(UNCOMMON_ITEMS, rng);
}

/** Premio por un reto diario: una baya. */
export function challengeItem(rng: () => number = Math.random): string {
  return pick(COMMON_ITEMS, rng);
}

/** Premio por un logro: un objeto raro. */
export function achievementItem(rng: () => number = Math.random): string {
  return pick(RARE_ITEMS, rng);
}

/** Objetos gastados por el equipo del jugador en un combate. */
export function consumedItems(
  held: Held,
  finalTeam: { id: number; item: string | null }[],
): { id: number; key: string }[] {
  return finalTeam
    .filter((p) => held[p.id] && !p.item && CONSUMABLE_ITEMS.has(held[p.id]))
    .map((p) => ({ id: p.id, key: held[p.id] }));
}

const TYPE_ES: Record<string, string> = {
  fire: 'Fuego',
  water: 'Agua',
  electric: 'Eléctrico',
  grass: 'Planta',
  ice: 'Hielo',
  fighting: 'Lucha',
  poison: 'Veneno',
  ground: 'Tierra',
  flying: 'Volador',
  psychic: 'Psíquico',
  bug: 'Bicho',
  rock: 'Roca',
  ghost: 'Fantasma',
  dragon: 'Dragón',
  dark: 'Siniestro',
  steel: 'Acero',
  normal: 'Normal',
  fairy: 'Hada',
};

const DESCRIPTIONS: Record<string, string> = {
  leftovers: 'Recupera 1/16 de los PS al final de cada turno.',
  'black-sludge': 'Cura 1/16 de los PS a los tipo Veneno; a los demás les hace daño.',
  'sitrus-berry': 'Se come sola con la mitad de PS o menos y cura un 25 %. Se gasta.',
  'oran-berry': 'Se come sola con la mitad de PS o menos y cura 10 PS. Se gasta.',
  'lum-berry': 'Cura cualquier problema de estado o la confusión. Se gasta.',
  'cheri-berry': 'Cura la parálisis. Se gasta.',
  'chesto-berry': 'Despierta al Pokémon dormido. Se gasta.',
  'pecha-berry': 'Cura el envenenamiento. Se gasta.',
  'rawst-berry': 'Cura las quemaduras. Se gasta.',
  'aspear-berry': 'Descongela al Pokémon. Se gasta.',
  'persim-berry': 'Cura la confusión. Se gasta.',
  'choice-band': 'Ataque ×1,5, pero solo puede usar el primer movimiento que elija.',
  'choice-specs': 'Ataque Especial ×1,5, pero solo puede usar el primer movimiento que elija.',
  'choice-scarf': 'Velocidad ×1,5, pero solo puede usar el primer movimiento que elija.',
  'life-orb': 'Sus ataques hacen un 30 % más de daño a cambio de un 10 % de sus PS.',
  'focus-sash': 'Con los PS al máximo, aguanta con 1 PS un golpe que lo debilitaría. Se gasta.',
  'expert-belt': 'Los ataques muy eficaces hacen un 20 % más de daño.',
  'muscle-band': 'Los ataques físicos hacen un 10 % más de daño.',
  'wise-glasses': 'Los ataques especiales hacen un 10 % más de daño.',
  'assault-vest': 'Defensa Especial ×1,5, pero no puede usar movimientos de estado.',
  'rocky-helmet': 'Quien le golpee con un ataque físico pierde 1/6 de sus PS.',
  'quick-claw': 'A veces le permite atacar primero.',
  'scope-lens': 'Aumenta la probabilidad de golpe crítico.',
  'shell-bell': 'Recupera 1/8 del daño que causa.',
  'damp-rock': 'La lluvia que provoca dura 8 turnos en vez de 5.',
  'heat-rock': 'El sol que provoca dura 8 turnos en vez de 5.',
  'smooth-rock': 'La tormenta de arena que provoca dura 8 turnos en vez de 5.',
  'icy-rock': 'El granizo que provoca dura 8 turnos en vez de 5.',
};

/** Qué hace cada objeto en combate, en una línea. */
export function itemDescription(key: string): string {
  const type = TYPE_BOOST_ITEMS[key];
  if (type) return `Los ataques de tipo ${TYPE_ES[type]} hacen un 20 % más de daño.`;
  return DESCRIPTIONS[key] ?? '';
}
