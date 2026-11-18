import { Pipe, PipeTransform, inject } from '@angular/core';
import { PokemonService } from '../services/pokemon';

/**
 * Muestra el nombre oficial en español de un Pokémon ({{ p.name | nombre: p.id }}).
 * Es impuro porque los nombres llegan de forma asíncrona tras la primera carga;
 * la transformación es solo una búsqueda en un objeto, así que es barata.
 */
@Pipe({ name: 'nombre', pure: false })
export class PokemonNamePipe implements PipeTransform {
  private service = inject(PokemonService);

  constructor() {
    this.service.loadSpeciesNames();
  }

  transform(name: string | null | undefined, id?: number | null): string {
    if (!name) return '';
    return this.service.displayName(name, id ?? undefined);
  }
}
