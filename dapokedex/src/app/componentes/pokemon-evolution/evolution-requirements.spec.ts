import { describeEvolution, pickEvolutionDetail } from './evolution-requirements';
import { EvolutionDetail } from '../../interfaces/pokemon';

const res = (name: string) => ({ name, url: `https://pokeapi.co/api/v2/x/${name}/` });
const detail = (d: Partial<EvolutionDetail>): EvolutionDetail => ({ min_level: null, ...d });
const texts = (d: EvolutionDetail) => describeEvolution(d).map((p) => p.text);

describe('describeEvolution', () => {
  it('describe piedras evolutivas con su icono', () => {
    const [part] = describeEvolution(
      detail({ trigger: { name: 'use-item' }, item: res('water-stone') }),
      () => 'Piedra Agua',
    );
    expect(part.text).toBe('Piedra Agua');
    expect(part.icon).toContain('/items/water-stone.png');
  });

  it('combina amistad y momento del día (Espeon / Umbreon)', () => {
    expect(texts(detail({ min_happiness: 160, time_of_day: 'night' }))).toEqual([
      'Amistad alta',
      'De noche',
    ]);
  });

  it('describe intercambios con objeto equipado (Scizor)', () => {
    expect(texts(detail({ trigger: { name: 'trade' }, held_item: res('metal-coat') }))).toEqual([
      'Intercambio',
      'Equipado con metal coat',
    ]);
  });

  it('traduce el tipo de movimiento requerido (Sylveon)', () => {
    expect(texts(detail({ known_move_type: res('fairy'), min_happiness: 160 }))).toEqual([
      'Amistad alta',
      'Con un movimiento de tipo Hada',
    ]);
  });

  it('usa el disparador si no hay condiciones concretas', () => {
    expect(texts(detail({ trigger: { name: 'shed' } }))).toEqual(['Hueco libre en el equipo']);
  });

  it('elige la condición marcada por defecto entre las de cada juego', () => {
    const old = detail({ location: res('eterna-forest') });
    const current = detail({ item: res('leaf-stone'), is_default: true });
    expect(pickEvolutionDetail([old, current, old])).toBe(current);
  });
});
