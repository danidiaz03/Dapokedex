/**
 * Datos de habilidades, objetos y clima que usa el motor de combate.
 * Solo están las habilidades y objetos con efecto simulado; el resto se
 * muestra pero no hace nada en combate (como Presión fuera de los PP).
 */

export type Weather = 'rain' | 'sun' | 'sand' | 'hail' | 'snow';

export const WEATHER_TEXT: Record<
  Weather,
  { start: string; keep: string; end: string; icon: string; name: string }
> = {
  rain: {
    start: '¡Empezó a llover!',
    keep: 'Sigue lloviendo.',
    end: 'Ha dejado de llover.',
    icon: '☔',
    name: 'Lluvia',
  },
  sun: {
    start: '¡El sol empezó a brillar con fuerza!',
    keep: 'El sol brilla con fuerza.',
    end: 'El sol ya no brilla tanto.',
    icon: '☀️',
    name: 'Sol intenso',
  },
  sand: {
    start: '¡Se ha desatado una tormenta de arena!',
    keep: 'La tormenta de arena sigue azotando.',
    end: 'La tormenta de arena ha amainado.',
    icon: '🌪️',
    name: 'Tormenta de arena',
  },
  hail: {
    start: '¡Empezó a granizar!',
    keep: 'Sigue granizando.',
    end: 'Ha dejado de granizar.',
    icon: '🧊',
    name: 'Granizo',
  },
  snow: {
    start: '¡Empezó a nevar!',
    keep: 'Sigue nevando.',
    end: 'Ha dejado de nevar.',
    icon: '❄️',
    name: 'Nieve',
  },
};

/** Movimientos que cambian el tiempo. */
export const WEATHER_MOVES: Record<string, Weather> = {
  'rain-dance': 'rain',
  'sunny-day': 'sun',
  sandstorm: 'sand',
  hail: 'hail',
  snowscape: 'snow',
};

/** Habilidades que cambian el tiempo al entrar en combate. */
export const WEATHER_ABILITIES: Record<string, Weather> = {
  drizzle: 'rain',
  drought: 'sun',
  'sand-stream': 'sand',
  'snow-warning': 'snow',
};

/** Rocas que alargan el tiempo de 5 a 8 turnos. */
export const WEATHER_ROCKS: Record<string, Weather> = {
  'damp-rock': 'rain',
  'heat-rock': 'sun',
  'smooth-rock': 'sand',
  'icy-rock': 'hail',
};

/** Habilidades que doblan la velocidad con un tiempo concreto. */
export const SPEED_WEATHER: Record<string, Weather[]> = {
  'swift-swim': ['rain'],
  chlorophyll: ['sun'],
  'sand-rush': ['sand'],
  'slush-rush': ['hail', 'snow'],
};

/** Habilidades que potencian un tipo con un tercio o menos de PS. */
export const PINCH_ABILITIES: Record<string, string> = {
  blaze: 'fire',
  torrent: 'water',
  overgrow: 'grass',
  swarm: 'bug',
};

/** Habilidades que anulan un tipo de ataque y lo aprovechan. */
export const ABSORB_ABILITIES: Record<
  string,
  {
    type: string;
    effect: 'heal' | 'boost' | 'flash' | 'immune';
    stat?: 'attack' | 'specialAttack' | 'speed';
  }
> = {
  levitate: { type: 'ground', effect: 'immune' },
  'water-absorb': { type: 'water', effect: 'heal' },
  'volt-absorb': { type: 'electric', effect: 'heal' },
  'dry-skin': { type: 'water', effect: 'heal' },
  'flash-fire': { type: 'fire', effect: 'flash' },
  'sap-sipper': { type: 'grass', effect: 'boost', stat: 'attack' },
  'lightning-rod': { type: 'electric', effect: 'boost', stat: 'specialAttack' },
  'storm-drain': { type: 'water', effect: 'boost', stat: 'specialAttack' },
  'motor-drive': { type: 'electric', effect: 'boost', stat: 'speed' },
};

/** Habilidades que impiden sufrir un problema de estado. */
export const STATUS_BLOCKING_ABILITIES: Record<string, string[]> = {
  limber: ['par'],
  insomnia: ['slp'],
  'vital-spirit': ['slp'],
  'sweet-veil': ['slp'],
  immunity: ['psn', 'tox'],
  'pastel-veil': ['psn', 'tox'],
  'water-veil': ['brn'],
  'water-bubble': ['brn'],
  'magma-armor': ['frz'],
  'own-tempo': ['confusion'],
  oblivious: [],
  comatose: ['par', 'slp', 'psn', 'tox', 'brn', 'frz'],
  'purifying-salt': ['par', 'slp', 'psn', 'tox', 'brn', 'frz'],
};

/** Habilidades que provocan un estado al atacante que les golpea con un ataque físico. */
export const CONTACT_STATUS_ABILITIES: Record<string, 'par' | 'brn' | 'psn'> = {
  static: 'par',
  'flame-body': 'brn',
  'poison-point': 'psn',
};

/** Habilidades que impiden que el rival baje las características. */
export const CLEAR_BODY = ['clear-body', 'white-smoke', 'full-metal-body'];
/** Habilidades que bloquean Intimidación. */
export const INTIMIDATE_BLOCK = [
  ...CLEAR_BODY,
  'hyper-cutter',
  'inner-focus',
  'own-tempo',
  'oblivious',
  'scrappy',
];

/** Habilidades con efecto en combate (las demás se muestran pero no actúan). */
export const SIMULATED_ABILITIES = new Set<string>([
  ...Object.keys(WEATHER_ABILITIES),
  ...Object.keys(SPEED_WEATHER),
  ...Object.keys(PINCH_ABILITIES),
  ...Object.keys(ABSORB_ABILITIES),
  ...Object.keys(STATUS_BLOCKING_ABILITIES),
  ...Object.keys(CONTACT_STATUS_ABILITIES),
  ...INTIMIDATE_BLOCK,
  'intimidate',
  'huge-power',
  'pure-power',
  'guts',
  'hustle',
  'technician',
  'adaptability',
  'sheer-force',
  'thick-fat',
  'wonder-guard',
  'multiscale',
  'filter',
  'solid-rock',
  'sturdy',
  'rough-skin',
  'iron-barbs',
  'speed-boost',
  'shed-skin',
  'natural-cure',
  'regenerator',
  'inner-focus',
  'keen-eye',
  'compound-eyes',
  'no-guard',
  'serene-grace',
  'skill-link',
  'rock-head',
  'rain-dish',
  'ice-body',
  'marvel-scale',
  'super-luck',
  'sniper',
  'battle-armor',
  'shell-armor',
  'moxie',
  'sand-veil',
  'overcoat',
]);

/** Objetos que potencian un tipo un 20 %. */
export const TYPE_BOOST_ITEMS: Record<string, string> = {
  charcoal: 'fire',
  'mystic-water': 'water',
  magnet: 'electric',
  'miracle-seed': 'grass',
  'never-melt-ice': 'ice',
  'black-belt': 'fighting',
  'poison-barb': 'poison',
  'soft-sand': 'ground',
  'sharp-beak': 'flying',
  'twisted-spoon': 'psychic',
  'silver-powder': 'bug',
  'hard-stone': 'rock',
  'spell-tag': 'ghost',
  'dragon-fang': 'dragon',
  'black-glasses': 'dark',
  'metal-coat': 'steel',
  'silk-scarf': 'normal',
  'fairy-feather': 'fairy',
};

/** Bayas que curan un problema de estado. */
export const STATUS_BERRIES: Record<string, string[]> = {
  'lum-berry': ['par', 'slp', 'psn', 'tox', 'brn', 'frz', 'confusion'],
  'cheri-berry': ['par'],
  'chesto-berry': ['slp'],
  'pecha-berry': ['psn', 'tox'],
  'rawst-berry': ['brn'],
  'aspear-berry': ['frz'],
  'persim-berry': ['confusion'],
};

/**
 * Objetos que pueden llevar los Pokémon en combate. Si añades uno, añádelo
 * también a heldItems() en firestore.rules o no se podrá guardar en la mochila.
 */
export const HELD_ITEMS = [
  'leftovers',
  'black-sludge',
  'sitrus-berry',
  'oran-berry',
  'choice-band',
  'choice-specs',
  'choice-scarf',
  'life-orb',
  'focus-sash',
  'expert-belt',
  'muscle-band',
  'wise-glasses',
  'assault-vest',
  'rocky-helmet',
  'quick-claw',
  'scope-lens',
  'shell-bell',
  ...Object.keys(TYPE_BOOST_ITEMS),
  ...Object.keys(STATUS_BERRIES),
  ...Object.keys(WEATHER_ROCKS),
];
