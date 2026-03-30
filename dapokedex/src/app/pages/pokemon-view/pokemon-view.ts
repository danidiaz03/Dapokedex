import { Component, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PokemonDetailPage, pokemonEvolutionChain } from '../../interfaces/pokemon';
import { PokemonService } from '../../services/pokemon';
import { PokemonEvolution } from '../../componentes/pokemon-evolution/pokemon-evolution';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';

@Component({
  selector: 'app-pokemon-view',
  imports: [PokemonEvolution],
  templateUrl: './pokemon-view.html',
  styleUrl: './pokemon-view.css',
})
export class PokemonView implements OnInit {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);

  public pokemonName = signal('');
  public activeTab = signal<'about' | 'stats' | 'evolution' | 'moves'>('stats');
  public pokemonDetail = signal<PokemonDetailPage | null>(null);
  public pokeEvolution = signal<pokemonEvolutionChain | null>(null);
  public isFavorite = signal(false);

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

  async ngOnInit(): Promise<void> {
    this.route.paramMap.subscribe(async (params) => {
      const name = params.get('name');
      this.pokemonName.set(name ?? '');
      this.pokemonDetail.set(null);
      this.pokeEvolution.set(null);
      this.activeTab.set('stats');
      this.isFavorite.set(false);

      this.service.getPokemonDetailbyName(this.pokemonName()).subscribe({
        next: async (data) => {
          this.pokemonDetail.set(data);

          const userId = this.authService.currentUser()?.uid;
          if (userId) {
            const favs = await this.firestoreService.getFavorites(userId);
            this.isFavorite.set(favs.includes(data.id));
          }
        },
      });
    });
  }

  async toggleFavorite(): Promise<void> {
    const userId = this.authService.currentUser()?.uid;
    const pokemonId = this.pokemonDetail()?.id;
    if (!userId || !pokemonId) return;

    if (this.isFavorite()) {
      await this.firestoreService.removeFavorite(userId, pokemonId);
      this.isFavorite.set(false);
    } else {
      await this.firestoreService.addFavorite(userId, pokemonId);
      this.isFavorite.set(true);
    }
  }

  loadEvolution() {
    this.service.getPokemonSpeciesbyName(this.pokemonName()).subscribe({
      next: (data) => {
        const evolutionChain = data.evolution_chain.url;
        this.service.getEvolutionChainByUrl(evolutionChain).subscribe({
          next: (response) => {
            this.pokeEvolution.set(response);
          },
        });
      },
    });
  }
}
