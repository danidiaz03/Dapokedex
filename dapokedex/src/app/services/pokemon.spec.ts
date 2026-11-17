import { cleanFlavorText, getArtworkUrl, getIdFromUrl, pickLocalized } from './pokemon';

describe('helpers de PokemonService', () => {
  it('extrae el id de una URL de PokeAPI', () => {
    expect(getIdFromUrl('https://pokeapi.co/api/v2/pokemon/25/')).toBe(25);
    expect(getIdFromUrl('https://pokeapi.co/api/v2/pokemon-species/133')).toBe(133);
  });

  it('genera la URL del artwork oficial', () => {
    expect(getArtworkUrl(6)).toMatch(/official-artwork\/6\.png$/);
  });
});

describe('textos localizados de PokeAPI', () => {
  const entries = [
    { text: 'old es', language: { name: 'es' } },
    { text: 'english', language: { name: 'en' } },
    { text: 'new es', language: { name: 'es' } },
  ];

  it('prioriza el texto en español más reciente', () => {
    expect(pickLocalized(entries)?.text).toBe('new es');
  });

  it('usa el inglés si no hay español', () => {
    expect(pickLocalized([entries[1]])?.text).toBe('english');
  });

  it('limpia saltos de línea y caracteres de control', () => {
    expect(cleanFlavorText('Escupe\nfuego\f muy­caliente')).toBe('Escupe fuego muy caliente');
  });
});
