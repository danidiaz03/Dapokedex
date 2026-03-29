import { Component, OnInit } from '@angular/core';
import { PokemonService } from '../../services/pokemon';
import { PokemonListResponse, PokemonResult } from '../../interfaces/pokemon';
import { signal } from '@angular/core';

@Component({
  selector: 'app-pokemon-list',
  imports: [],
  templateUrl: './pokemon-list.html',
  styleUrl: './pokemon-list.css',
})
export class PokemonList implements OnInit {
  public pokemons = signal<PokemonResult[]>([]);
  public isLoading = signal(true);

  public nextUrl = signal<string | null>(null);
  public previousUrl = signal<string | null>(null);

  constructor(private pokemonService: PokemonService) {}

  ngOnInit(): void {
    this.pokemonService.getPokemonList().subscribe({
      next: (data) => {
        this.pokemons.set(data.results);
        this.nextUrl.set(data.next);
        this.previousUrl.set(data.previous);
        this.isLoading.set(false);
      },
    });
  }

  goTo(url: string | null) {
    if (!url) return;
    this.isLoading.set(true);
    this.pokemonService.getPokemonByUrl(url).subscribe({
      next: (data) => {
        this.pokemons.set(data.results);
        this.nextUrl.set(data.next);
        this.previousUrl.set(data.previous);
        this.isLoading.set(false);
      },
    });
  }
  getSpriteUrl(url: string): string {
    const id = url.split('/').filter(Boolean).pop();
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  }
}
