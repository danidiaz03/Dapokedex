import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { PokemonEvolution } from './pokemon-evolution';
import { EvolutionNode } from '../../interfaces/pokemon';

const node = (
  id: number,
  name: string,
  evolves_to: EvolutionNode[] = [],
  detail: EvolutionNode['evolution_details'][number] | null = null,
): EvolutionNode => ({
  species: { name, url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` },
  evolution_details: detail ? [detail] : [],
  evolves_to,
});

function createComponent(chain: EvolutionNode, pokemonId: number) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(PokemonEvolution);
  fixture.componentRef.setInput('evolution', { chain });
  fixture.componentRef.setInput('pokemonId', pokemonId);
  return fixture.componentInstance;
}

describe('PokemonEvolution', () => {
  it('agrupa una cadena lineal por etapas con su requisito', () => {
    const chain = node(1, 'bulbasaur', [
      node(2, 'ivysaur', [node(3, 'venusaur', [], { min_level: 32 })], { min_level: 16 }),
    ]);
    const stages = createComponent(chain, 2).stages();

    expect(stages.map((s) => s.map((p) => p.name))).toEqual([
      ['bulbasaur'],
      ['ivysaur'],
      ['venusaur'],
    ]);
    expect(stages.map((s) => s[0].requirement)).toEqual(['Base', 'Nv. 16', 'Nv. 32']);
  });

  it('muestra todas las ramas de una evolución ramificada', () => {
    const chain = node(133, 'eevee', [
      node(134, 'vaporeon', [], { min_level: null, trigger: { name: 'use-item' } }),
      node(196, 'espeon', [], {
        min_level: null,
        min_happiness: 160,
        trigger: { name: 'level-up' },
      }),
    ]);
    const stages = createComponent(chain, 133).stages();

    expect(stages.length).toBe(2);
    expect(stages[1].map((p) => p.requirement)).toEqual(['Objeto', 'Amistad alta']);
  });

  it('no falla con Pokémon que no evolucionan', () => {
    const stages = createComponent(node(128, 'tauros'), 128).stages();
    expect(stages).toEqual([[expect.objectContaining({ id: 128, requirement: 'Base' })]]);
  });
});
