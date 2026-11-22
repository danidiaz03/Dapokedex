import {
  CONSUMABLE_ITEMS,
  RARE_ITEMS,
  available,
  battleDrops,
  canEquip,
  consumedItems,
  itemDescription,
  levelItem,
  normalizeBag,
  normalizeHeld,
} from './bag';
import { HELD_ITEMS } from './battle-data';

const fixed = (v: number) => () => v;

describe('mochila', () => {
  it('descarta objetos desconocidos y cantidades raras al leer', () => {
    expect(
      normalizeBag({ leftovers: 2, 'master-ball': 5, 'oran-berry': -3, 'life-orb': 500 }),
    ).toEqual({ leftovers: 2, 'life-orb': 99 });
    expect(normalizeBag(null)).toEqual({});
  });

  it('no deja equipar más unidades de las que hay', () => {
    const bag = { leftovers: 1 };
    const held = normalizeHeld({ 1: 'leftovers', 2: 'leftovers' }, bag);
    expect(Object.keys(held)).toEqual(['1']);
    expect(available(bag, held, 'leftovers')).toBe(0);
    expect(canEquip(bag, held, 2, 'leftovers')).toBe(false);
    // El que ya lo lleva puede "volver a ponérselo".
    expect(canEquip(bag, held, 1, 'leftovers')).toBe(true);
  });

  it('el rival solo suelta objetos si pierde', () => {
    expect(battleDrops(false, ['leftovers'], fixed(0))).toEqual([]);
    // Con el azar a 0 suelta todo y además se encuentra una baya.
    const drops = battleDrops(true, ['leftovers', null, 'life-orb'], fixed(0));
    expect(drops.slice(0, 2)).toEqual(['leftovers', 'life-orb']);
    expect(drops).toHaveLength(3);
    expect(battleDrops(true, ['leftovers'], fixed(0.99))).toEqual([]);
  });

  it('cada 5 niveles el premio es un objeto raro', () => {
    expect(RARE_ITEMS).toContain(levelItem(10, fixed(0)));
    expect(RARE_ITEMS).not.toContain(levelItem(7, fixed(0)));
  });

  it('solo se gastan las bayas y la Banda Aguante usadas', () => {
    const held = { 1: 'sitrus-berry', 2: 'leftovers', 3: 'focus-sash', 4: 'oran-berry' };
    const team = [
      { id: 1, item: null },
      { id: 2, item: null },
      { id: 3, item: null },
      { id: 4, item: 'oran-berry' },
    ];
    expect(consumedItems(held, team)).toEqual([
      { id: 1, key: 'sitrus-berry' },
      { id: 3, key: 'focus-sash' },
    ]);
  });

  it('todos los objetos tienen descripción y los gastables existen', () => {
    for (const key of HELD_ITEMS) expect(itemDescription(key)).not.toBe('');
    for (const key of CONSUMABLE_ITEMS) expect(HELD_ITEMS).toContain(key);
  });
});
