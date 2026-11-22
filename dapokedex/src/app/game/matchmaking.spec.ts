import { DIFFICULTY, baseStatTotal, pickBalancedEnemies } from './matchmaking';

describe('pickBalancedEnemies', () => {
  const candidates = [
    { id: 3, bst: 525 }, // Venusaur
    { id: 10, bst: 195 }, // Caterpie
    { id: 16, bst: 251 }, // Pidgey
    { id: 19, bst: 253 }, // Rattata
    { id: 150, bst: 680 }, // Mewtwo
    { id: 129, bst: 200 }, // Magikarp
  ];

  it('elige rivales con una fuerza parecida a la del equipo', () => {
    const ids = pickBalancedEnemies(candidates, [230, 240], 2);
    expect(ids.sort((a, b) => a - b)).toEqual([16, 19]);
  });

  it('no repite rivales ni devuelve más de los pedidos', () => {
    const ids = pickBalancedEnemies([...candidates, { id: 16, bst: 251 }], [500], 3);
    expect(new Set(ids).size).toBe(3);
  });

  it('apunta un poco por encima de la media del equipo', () => {
    expect(DIFFICULTY).toBeGreaterThan(1);
    expect(baseStatTotal([{ base_stat: 45 }, { base_stat: 49 }])).toBe(94);
  });
});
