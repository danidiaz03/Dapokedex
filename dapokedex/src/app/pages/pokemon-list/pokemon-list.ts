import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Observable,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  switchMap,
} from 'rxjs';
import { PokemonService, getArtworkUrl, getIdFromUrl } from '../../services/pokemon';
import { PokemonMiniatureDetail, PokemonResult } from '../../interfaces/pokemon';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { TypeNamePipe } from '../../pipes/type-name.pipe';

const PAGE_SIZE = 24;
// Máximo de resultados de búsqueda a cargar: buscar "a" coincidía con cientos
// de Pokémon y se lanzaba una petición de detalle por cada uno.
const MAX_SEARCH_RESULTS = 24;

@Component({
  selector: 'app-pokemon-list',
  imports: [RouterLink, TypeNamePipe],
  templateUrl: './pokemon-list.html',
  styleUrl: './pokemon-list.css',
})
export class PokemonList implements OnInit {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  private pokemonService = inject(PokemonService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  public pokemons = signal<PokemonMiniatureDetail[]>([]);
  public isLoading = signal(true);
  public hasError = signal(false);
  public page = signal(1);
  public totalCount = signal(0);
  public searchTerm = signal('');
  public isSearching = signal(false);
  public searchMatches = signal(0);
  public allPokemons = signal<PokemonResult[]>([]);
  public searchResults = signal<PokemonMiniatureDetail[]>([]);
  public favorites = signal<number[]>([]);

  public totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / PAGE_SIZE)));

  public filteredPokemons = computed(() => {
    if (!this.searchTerm()) return this.pokemons();
    return this.searchResults();
  });

  private search$ = new Subject<string>();

  async ngOnInit(): Promise<void> {
    this.pokemonService.getAllPokemonNames().subscribe({
      next: (data) => this.allPokemons.set(data.results),
    });

    // La página vive en la URL (?page=3) para conservarla al volver del detalle.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const page = Math.max(1, Number(params.get('page')) || 1);
      this.loadPage(page);
    });

    this.search$
      .pipe(
        map((term) => term.trim().toLowerCase()),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => this.searchPokemons(term)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        this.searchResults.set(results);
        this.isSearching.set(false);
      });

    const userId = (await this.authService.waitForUser())?.uid;
    if (userId) {
      const favs = await this.firestoreService.getFavorites(userId);
      this.favorites.set(favs);
    }
  }

  private loadPage(page: number): void {
    this.page.set(page);
    this.isLoading.set(true);
    this.hasError.set(false);

    this.pokemonService
      .getPokemonList((page - 1) * PAGE_SIZE, PAGE_SIZE)
      .pipe(
        switchMap((data) => {
          this.totalCount.set(data.count);
          return this.toMiniatures(data.results);
        }),
      )
      .subscribe({
        next: (miniatures) => {
          this.pokemons.set(miniatures);
          this.isLoading.set(false);
        },
        error: () => {
          this.hasError.set(true);
          this.isLoading.set(false);
        },
      });
  }

  /** forkJoin mantiene el orden original, a diferencia de ir haciendo push al llegar. */
  private toMiniatures(results: PokemonResult[]): Observable<PokemonMiniatureDetail[]> {
    if (results.length === 0) return of([]);
    return forkJoin(
      results.map((result) =>
        this.pokemonService.getPokemonDetail(result.url).pipe(
          map((detail) => ({
            id: detail.id,
            name: detail.name,
            img: getArtworkUrl(getIdFromUrl(result.url)),
            types: detail.types,
          })),
        ),
      ),
    );
  }

  private searchPokemons(term: string): Observable<PokemonMiniatureDetail[]> {
    if (!term) {
      this.searchMatches.set(0);
      return of([]);
    }
    // Se puede buscar por nombre o por número de Pokédex.
    const matches = this.allPokemons().filter(
      (p) => p.name.includes(term) || String(getIdFromUrl(p.url)) === term,
    );
    this.searchMatches.set(matches.length);
    return this.toMiniatures(matches.slice(0, MAX_SEARCH_RESULTS)).pipe(catchError(() => of([])));
  }

  isFavorite(pokemonId: number): boolean {
    return this.favorites().includes(pokemonId);
  }

  async toggleFavorite(event: Event, pokemonId: number): Promise<void> {
    event.stopPropagation();
    const userId = this.authService.currentUser()?.uid;
    if (!userId) return;

    // Actualización optimista: el corazón cambia al instante y se revierte si falla.
    const previous = this.favorites();
    const wasFavorite = this.isFavorite(pokemonId);
    this.favorites.set(
      wasFavorite ? previous.filter((id) => id !== pokemonId) : [...previous, pokemonId],
    );

    try {
      if (wasFavorite) await this.firestoreService.removeFavorite(userId, pokemonId);
      else await this.firestoreService.addFavorite(userId, pokemonId);
    } catch {
      this.favorites.set(previous);
    }
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.router.navigate([], { queryParams: { page: page === 1 ? null : page } });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  retry(): void {
    this.loadPage(this.page());
  }

  onSearch(term: string): void {
    this.searchTerm.set(term.trim());
    if (term.trim()) this.isSearching.set(true);
    this.search$.next(term);
  }
}
