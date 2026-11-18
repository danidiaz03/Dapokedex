import {
  SPECIAL_EVOLUTION_LEVEL,
  availableEvolutions,
  battleXp,
  nextEvolutions,
  pokemonLevel,
  pokemonLevelPercent,
} from './pokemon-levels';
import { EvolutionDetail, EvolutionNode } from '../interfaces/pokemon';

const node = (
  id: number,
  name: string,
  evolves_to: EvolutionNode[] = [],
  detail?: Partial<EvolutionDetail>,
): EvolutionNode => ({
  species: { name, url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` },
  evolution_details: detail ? [{ min_level: null, ...detail }] : [],
  evolves_to,
});

const charmander = node(4, 'charmander', [
  node(
    5,
    'charmeleon',
    [node(6, 'charizard', [], { min_level: 36, trigger: { name: 'level-up' } })],
    {
      min_level: 16,
      trigger: { name: 'level-up' },
    },
  ),
]);

const eevee = node(133, 'eevee', [
  node(134, 'vaporeon', [], { trigger: { name: 'use-item' } }),
  node(196, 'espeon', [], { trigger: { name: 'level-up' }, min_happiness: 160 }),
]);

describe('nivel de los Pokémon', () => {
  it('empieza en 5 y sube cada 100 XP', () => {
    expect(pokemonLevel(0)).toBe(5);
    expect(pokemonLevel(99)).toBe(5);
    expect(pokemonLevel(1100)).toBe(16);
    expect(pokemonLevel(10 ** 9)).toBe(100);
    expect(pokemonLevelPercent(250)).toBe(50);
  });

  it('da más XP al ganar y por cada rival derrotado', () => {
    expect(battleXp(true, 2)).toBeGreaterThan(battleXp(true, 0));
    expect(battleXp(true, 0)).toBeGreaterThan(battleXp(false, 0));
  });
});

describe('evoluciones', () => {
  it('usa el nivel de PokeAPI en las evoluciones por nivel', () => {
    expect(nextEvolutions(charmander, 4)).toEqual([
      { id: 5, name: 'charmeleon', level: 16, special: false },
    ]);
    expect(nextEvolutions(charmander, 5)[0].level).toBe(36);
    expect(nextEvolutions(charmander, 6)).toEqual([]);
  });

  it('simula con un nivel fijo las evoluciones por objeto o amistad', () => {
    const options = nextEvolutions(eevee, 133);
    expect(options.map((o) => o.id)).toEqual([134, 196]);
    expect(options.every((o) => o.special && o.level === SPECIAL_EVOLUTION_LEVEL)).toBe(true);
  });

  it('solo ofrece las evoluciones alcanzadas', () => {
    const options = nextEvolutions(charmander, 4);
    expect(availableEvolutions(options, 1000)).toEqual([]);
    expect(availableEvolutions(options, 1100).map((o) => o.id)).toEqual([5]);
  });
});
