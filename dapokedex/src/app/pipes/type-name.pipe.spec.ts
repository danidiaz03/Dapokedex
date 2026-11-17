import { ALL_TYPES, TypeNamePipe } from './type-name.pipe';

describe('TypeNamePipe', () => {
  const pipe = new TypeNamePipe();

  it('traduce los tipos al español', () => {
    expect(pipe.transform('fire')).toBe('Fuego');
    expect(pipe.transform('dark')).toBe('Siniestro');
  });

  it('devuelve el valor original si no conoce el tipo', () => {
    expect(pipe.transform('unknown')).toBe('unknown');
    expect(pipe.transform(null)).toBe('');
  });

  it('expone los 18 tipos jugables', () => {
    expect(ALL_TYPES.length).toBe(18);
  });
});
