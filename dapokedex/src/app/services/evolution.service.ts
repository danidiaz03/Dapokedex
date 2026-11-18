import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PokemonService } from './pokemon';
import { EvolutionOption, nextEvolutions } from '../game/pokemon-levels';

/** Consulta a PokeAPI las evoluciones posibles de una especie. */
@Injectable({ providedIn: 'root' })
export class EvolutionService {
  private pokemon = inject(PokemonService);

  async optionsFor(speciesId: number): Promise<EvolutionOption[]> {
    try {
      const species = await firstValueFrom(this.pokemon.getPokemonSpeciesbyName(speciesId));
      if (!species.evolution_chain) return [];
      const chain = await firstValueFrom(
        this.pokemon.getEvolutionChainByUrl(species.evolution_chain.url),
      );
      return nextEvolutions(chain.chain, speciesId);
    } catch {
      return [];
    }
  }
}
