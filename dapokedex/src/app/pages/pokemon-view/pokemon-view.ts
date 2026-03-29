import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PokemonDetailPage, pokemonEvolutionChain } from '../../interfaces/pokemon';
import { PokemonService } from '../../services/pokemon';
import { PokemonEvolution } from '../../componentes/pokemon-evolution/pokemon-evolution';

@Component({
  selector: 'app-pokemon-view',
  imports: [PokemonEvolution],
  templateUrl: './pokemon-view.html',
  styleUrl: './pokemon-view.css',
})
export class PokemonView implements OnInit {
  public pokemonName = signal('');

  public activeTab = signal<'about' | 'stats' | 'evolution' | 'moves'>('stats');

  public pokemonDetail = signal<PokemonDetailPage | null>(null);

  public pokeEvolution = signal<pokemonEvolutionChain | null>(null);

  constructor(
    private route: ActivatedRoute,
    private service: PokemonService,
  ) {}

  setTab(tab: 'about' | 'stats' | 'evolution' | 'moves'): void {
    this.activeTab.set(tab);
    if (tab === 'evolution' && this.pokeEvolution() === null) {
      this.loadEvolution();
    }
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const name = params.get('name');
      this.pokemonName.set(name ?? '');
      this.pokemonDetail.set(null);
      this.pokeEvolution.set(null);
      this.activeTab.set('stats');

      this.service.getPokemonDetailbyName(this.pokemonName()).subscribe({
        next: (data) => {
          this.pokemonDetail.set(data);
          console.log(this.pokemonDetail());
        },
      });
    });
  }

  loadEvolution() {
    this.service.getPokemonSpeciesbyName(this.pokemonName()).subscribe({
      next: (data) => {
        console.log(data);
        const evolutionChain = data.evolution_chain.url;
        this.service.getEvolutionChainByUrl(evolutionChain).subscribe({
          next: (response) => {
            console.log(response);
            this.pokeEvolution.set(response);
          },
        });
      },
    });
  }
}
