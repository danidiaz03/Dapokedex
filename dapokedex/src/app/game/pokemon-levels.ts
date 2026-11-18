// Nivel de los Pokémon de la colección y cuándo pueden evolucionar.
// Cada Pokémon del equipo gana experiencia en las batallas; al llegar al
// nivel que indica PokeAPI evoluciona. Las evoluciones que en los juegos no
// van por nivel (piedras, intercambio, amistad...) se simulan con un nivel fijo.

import { EvolutionNode } from '../interfaces/pokemon';
import { getIdFromUrl } from '../services/pokemon';
import { pickEvolutionDetail } from '../componentes/pokemon-evolution/evolution-requirements';

export const START_LEVEL = 5;
export const MAX_LEVEL = 100;
export const XP_PER_LEVEL = 100;
/** Nivel para evoluciones con piedra, intercambio, amistad u otras condiciones. */
export const SPECIAL_EVOLUTION_LEVEL = 30;

export const POKEMON_XP = {
  win: 60,
  loss: 20,
  perKo: 25,
};

export function pokemonLevel(xp: number): number {
  return Math.min(MAX_LEVEL, START_LEVEL + Math.floor(Math.max(0, xp) / XP_PER_LEVEL));
}

/** Progreso hacia el siguiente nivel, de 0 a 100. */
export function pokemonLevelPercent(xp: number): number {
  if (pokemonLevel(xp) >= MAX_LEVEL) return 100;
  return ((Math.max(0, xp) % XP_PER_LEVEL) / XP_PER_LEVEL) * 100;
}

/** XP que gana un Pokémon del equipo en una batalla. */
export function battleXp(won: boolean, kos: number): number {
  return (won ? POKEMON_XP.win : POKEMON_XP.loss) + kos * POKEMON_XP.perKo;
}

export interface EvolutionOption {
  id: number;
  name: string;
  level: number;
  /** true si en los juegos no evoluciona por nivel y aquí se simula. */
  special: boolean;
}

function findNode(node: EvolutionNode, speciesId: number): EvolutionNode | null {
  if (getIdFromUrl(node.species.url) === speciesId) return node;
  for (const child of node.evolves_to) {
    const found = findNode(child, speciesId);
    if (found) return found;
  }
  return null;
}

/** Evoluciones siguientes de una especie (varias en Eevee, Tyrogue...). */
export function nextEvolutions(chain: EvolutionNode, speciesId: number): EvolutionOption[] {
  const node = findNode(chain, speciesId);
  if (!node) return [];
  return node.evolves_to.map((child) => {
    const detail = pickEvolutionDetail(child.evolution_details);
    const byLevel = detail?.trigger?.name === 'level-up' && !!detail.min_level;
    return {
      id: getIdFromUrl(child.species.url),
      name: child.species.name,
      level: byLevel
        ? detail!.min_level!
        : Math.max(SPECIAL_EVOLUTION_LEVEL, detail?.min_level ?? 0),
      special: !byLevel,
    };
  });
}

/** Evoluciones ya disponibles con la experiencia actual. */
export function availableEvolutions(options: EvolutionOption[], xp: number): EvolutionOption[] {
  const level = pokemonLevel(xp);
  return options.filter((o) => level >= o.level);
}
