import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { switchMap } from 'rxjs';
import { PokemonDetailPage, pokemonEvolutionChain, pokemonSpecies } from '../../interfaces/pokemon';
import { PokemonService } from '../../services/pokemon';
import { PokemonEvolution } from '../../componentes/pokemon-evolution/pokemon-evolution';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';

type Tab = 'about' | 'stats' | 'evolution';

const STAT_LABELS: Record<string, string> = {
  hp: 'PS',
  attack: 'Ataque',
  defense: 'Defensa',
  'special-attack': 'At. Esp.',
  'special-defense': 'Def. Esp.',
  speed: 'Velocidad',
};

// Referencia para las barras: casi ningún stat base supera 180, y así los
// valores altos (Blissey 255 PS) ya no desbordan la barra.
const STAT_BAR_MAX = 180;
// Último Pokémon con número de Pokédex nacional (las formas tienen ids > 10000).
const LAST_NATIONAL_DEX = 1025;

@Component({
  selector: 'app-pokemon-view',
  imports: [PokemonEvolution, RouterLink],
  templateUrl: './pokemon-view.html',
  styleUrl: './pokemon-view.css',
})
export class PokemonView implements OnInit {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  private route = inject(ActivatedRoute);
  private service = inject(PokemonService);
  private title = inject(Title);
  private destroyRef = inject(DestroyRef);

  public pokemonName = signal('');
  public activeTab = signal<Tab>('stats');
  public pokemonDetail = signal<PokemonDetailPage | null>(null);
  public species = signal<pokemonSpecies | null>(null);
  public pokeEvolution = signal<pokemonEvolutionChain | null>(null);
  public isFavorite = signal(false);
  public notFound = signal(false);

  public statTotal = computed(
    () => this.pokemonDetail()?.stats.reduce((sum, s) => sum + s.base_stat, 0) ?? 0,
  );

  /** Descripción de la Pokédex en español (o en inglés si no hay traducción). */
  public description = computed(() => {
    const entries = this.species()?.flavor_text_entries ?? [];
    const entry =
      entries.find((e) => e.language.name === 'es') ??
      entries.find((e) => e.language.name === 'en');
    return entry?.flavor_text.replace(/[\f\n\r­]+/g, ' ') ?? '';
  });

  public genus = computed(
    () => this.species()?.genera.find((g) => g.language.name === 'es')?.genus ?? '',
  );

  public previousId = computed(() => {
    const id = this.pokemonDetail()?.id ?? 0;
    return id > 1 && id <= LAST_NATIONAL_DEX ? id - 1 : null;
  });

  public nextId = computed(() => {
    const id = this.pokemonDetail()?.id ?? 0;
    return id > 0 && id < LAST_NATIONAL_DEX ? id + 1 : null;
  });

  statLabel(name: string): string {
    return STAT_LABELS[name] ?? name;
  }

  statPercent(value: number): number {
    return Math.min(100, (value / STAT_BAR_MAX) * 100);
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
    if ((tab === 'evolution' || tab === 'about') && this.species() === null) {
      this.loadSpecies();
    }
  }

  ngOnInit(): void {
    // switchMap cancela la petición anterior si se navega rápido entre Pokémon.
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const name = params.get('name') ?? '';
          this.pokemonName.set(name);
          this.pokemonDetail.set(null);
          this.species.set(null);
          this.pokeEvolution.set(null);
          this.notFound.set(false);
          this.activeTab.set('stats');
          this.isFavorite.set(false);
          return this.service.getPokemonDetailbyName(name.toLowerCase());
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: async (data) => {
          this.pokemonDetail.set(data);
          this.title.setTitle(`${this.capitalize(data.name)} · Dapokedex`);

          const userId = (await this.authService.waitForUser())?.uid;
          if (userId) {
            const favs = await this.firestoreService.getFavorites(userId);
            this.isFavorite.set(favs.includes(data.id));
          }
        },
        error: () => this.notFound.set(true),
      });
  }

  async toggleFavorite(): Promise<void> {
    const userId = this.authService.currentUser()?.uid;
    const pokemonId = this.pokemonDetail()?.id;
    if (!userId || !pokemonId) return;

    const wasFavorite = this.isFavorite();
    this.isFavorite.set(!wasFavorite);
    try {
      if (wasFavorite) await this.firestoreService.removeFavorite(userId, pokemonId);
      else await this.firestoreService.addFavorite(userId, pokemonId);
    } catch {
      this.isFavorite.set(wasFavorite);
    }
  }

  playCry(): void {
    const id = this.pokemonDetail()?.id;
    if (!id) return;
    const audio = new Audio(
      `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`,
    );
    audio.volume = 0.5;
    audio.play().catch(() => {});
  }

  loadSpecies() {
    // Usamos la URL de la especie del propio Pokémon: el nombre de la ruta puede
    // ser una forma (p. ej. deoxys-normal) que no existe como especie.
    const speciesUrl = this.pokemonDetail()?.species.url;
    if (!speciesUrl) return;
    this.service
      .getSpeciesByUrl(speciesUrl)
      .pipe(
        switchMap((species) => {
          this.species.set(species);
          return this.service.getEvolutionChainByUrl(species.evolution_chain.url);
        }),
      )
      .subscribe({
        next: (response) => this.pokeEvolution.set(response),
      });
  }

  private capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
}
