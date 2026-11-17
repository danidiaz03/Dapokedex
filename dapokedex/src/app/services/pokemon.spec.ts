import { getArtworkUrl, getIdFromUrl } from './pokemon';

describe('helpers de PokemonService', () => {
  it('extrae el id de una URL de PokeAPI', () => {
    expect(getIdFromUrl('https://pokeapi.co/api/v2/pokemon/25/')).toBe(25);
    expect(getIdFromUrl('https://pokeapi.co/api/v2/pokemon-species/133')).toBe(133);
  });

  it('genera la URL del artwork oficial', () => {
    expect(getArtworkUrl(6)).toMatch(/official-artwork\/6\.png$/);
  });
});
