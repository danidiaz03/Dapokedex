import { calcStat, createCombatant } from './battle-engine';
import {
  NATURES,
  hash,
  ivsFor,
  moveMember,
  natureFor,
  normalizeBuilds,
  normalizeTeams,
} from './builds';

describe('preparación de equipos', () => {
  it('tiene las 25 naturalezas, 5 de ellas neutras', () => {
    expect(NATURES.length).toBe(25);
    expect(NATURES.filter((n) => !n.up).length).toBe(5);
  });

  it('la naturaleza y los IV son siempre los mismos para el mismo Pokémon', () => {
    expect(natureFor('abc', 25)).toBe(natureFor('abc', 25));
    expect(ivsFor('abc', 25)).toEqual(ivsFor('abc', 25));
    expect(hash('abc:25')).not.toBe(hash('abd:25'));
    const ivs = ivsFor('abc', 25);
    expect(Object.values(ivs).every((v) => v >= 0 && v <= 31)).toBe(true);
  });

  it('aplica la naturaleza y los IV con la fórmula oficial', () => {
    expect(calcStat(100, 50, 31, 1.1)).toBe(132);
    expect(calcStat(100, 50, 31, 0.9)).toBe(108);
    expect(calcStat(100, 50, 0, 1)).toBe(105);
    const c = createCombatant({
      id: 1,
      name: 'X',
      level: 50,
      types: ['normal'],
      sprite: '',
      shiny: false,
      base: {
        hp: 100,
        attack: 100,
        defense: 100,
        specialAttack: 100,
        specialDefense: 100,
        speed: 100,
      },
      moves: [],
      ivs: { hp: 31, attack: 31, defense: 31, specialAttack: 31, specialDefense: 31, speed: 31 },
      nature: { up: 'speed', down: 'attack' },
    });
    expect(c.stats.speed).toBe(132);
    expect(c.stats.attack).toBe(108);
    expect(c.stats.defense).toBe(120);
  });

  it('limpia las configuraciones guardadas', () => {
    const builds = normalizeBuilds({
      25: {
        moves: ['thunderbolt', 'quick-attack', 'thunderbolt', 'BAD KEY', 'iron-tail', 'surf'],
        ability: 'static',
      },
      4: { moves: [], ability: 'blaze' },
      7: null,
    });
    expect(builds[25].moves).toEqual(['thunderbolt', 'quick-attack', 'iron-tail', 'surf']);
    expect(builds[4]).toBeUndefined();
    expect(builds[7]).toBeUndefined();
  });

  it('limpia los equipos guardados', () => {
    const teams = normalizeTeams(
      [
        { id: 'a', name: '  Lluvia ', members: [1, 2, 2, 99, 3, 4, 5, 6, 7] },
        'x',
        { name: 'sin id' },
      ],
      [1, 2, 3, 4, 5, 6, 7],
    );
    expect(teams).toEqual([{ id: 'a', name: 'Lluvia', members: [1, 2, 3, 4, 5, 6] }]);
  });

  it('cambia el orden del equipo', () => {
    expect(moveMember([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveMember([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
});
