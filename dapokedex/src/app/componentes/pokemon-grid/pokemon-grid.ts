import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PokemonNamePipe } from '../../pipes/pokemon-name.pipe';

export interface GridPokemon {
  id: number;
  name: string;
  /** Etiqueta opcional, p. ej. "Oculta" en la página de una habilidad. */
  badge?: string;
}

const SPRITE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

/** Rejilla compacta de Pokémon con sprite, número y nombre, enlazados a su ficha. */
@Component({
  selector: 'app-pokemon-grid',
  imports: [RouterLink, PokemonNamePipe],
  templateUrl: './pokemon-grid.html',
  styleUrl: './pokemon-grid.css',
})
export class PokemonGrid {
  pokemons = input.required<GridPokemon[]>();

  sprite(id: number): string {
    return `${SPRITE_URL}/${id}.png`;
  }
}
