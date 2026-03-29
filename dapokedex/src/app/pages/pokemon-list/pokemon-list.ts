import { Component, OnInit, signal, computed } from '@angular/core';
import { PokemonService } from '../../services/pokemon';
import { PokemonMiniatureDetail, PokemonResult } from '../../interfaces/pokemon';
import { RouterLink } from "@angular/router";

@Component({
  selector: 'app-pokemon-list',
  imports: [RouterLink],
  templateUrl: './pokemon-list.html',
  styleUrl: './pokemon-list.css',
})
export class PokemonList implements OnInit {
  public pokemons = signal<PokemonMiniatureDetail[]>([]);
  public isLoading = signal(true);
  public nextUrl = signal<string | null>(null);
  public previousUrl = signal<string | null>(null);
  public searchTerm = signal('');
  public allPokemons = signal<PokemonResult[]>([]);
  public searchResults = signal<PokemonMiniatureDetail[]>([]);

  public filteredPokemons = computed(() => {
    if (!this.searchTerm()) return this.pokemons();
    return this.searchResults();
  });

  constructor(private pokemonService: PokemonService) {}

  ngOnInit(): void {
    this.pokemonService.getAllPokemonNames().subscribe({
      next: (data) => {
        this.allPokemons.set(data.results);
      },
    });

    this.pokemonService.getPokemonList().subscribe({
      next: (data) => {
        this.nextUrl.set(data.next);
        this.previousUrl.set(data.previous);

        const miniatures: PokemonMiniatureDetail[] = [];

        data.results.forEach((result) => {
          this.pokemonService.getPokemonDetail(result.url).subscribe({
            next: (detail) => {
              miniatures.push({
                id: detail.id,
                name: detail.name,
                img: this.getSpriteUrl(result.url),
                types: detail.types,
              });

              if (miniatures.length === data.results.length) {
                this.pokemons.set(miniatures);
                this.isLoading.set(false);
              }
            },
          });
        });
      },
    });
  }

  goTo(url: string | null): void {
    if (!url) return;
    this.isLoading.set(true);

    this.pokemonService.getPokemonByUrl(url).subscribe({
      next: (data) => {
        this.nextUrl.set(data.next);
        this.previousUrl.set(data.previous);

        const miniatures: PokemonMiniatureDetail[] = [];

        data.results.forEach((result) => {
          this.pokemonService.getPokemonDetail(result.url).subscribe({
            next: (detail) => {
              miniatures.push({
                id: detail.id,
                name: detail.name,
                img: this.getSpriteUrl(result.url),
                types: detail.types,
              });

              if (miniatures.length === data.results.length) {
                this.pokemons.set(miniatures);
                this.isLoading.set(false);
              }
            },
          });
        });
      },
    });
  }

  getSpriteUrl(url: string): string {
    const id = url.split('/').filter(Boolean).pop();
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  }

  onSearch(term: string): void {
    this.searchTerm.set(term);
    if (!term) return;

    const matches = this.allPokemons().filter((p) => p.name.includes(term.toLowerCase()));

    const miniatures: PokemonMiniatureDetail[] = [];

    matches.forEach((result) => {
      this.pokemonService.getPokemonDetail(result.url).subscribe({
        next: (detail) => {
          miniatures.push({
            id: detail.id,
            name: detail.name,
            img: this.getSpriteUrl(result.url),
            types: detail.types,
          });

          if (miniatures.length === matches.length) {
            this.searchResults.set(miniatures);
          }
        },
      });
    });
  }
}
