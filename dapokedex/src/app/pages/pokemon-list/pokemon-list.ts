import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Observable,
  Subject,
  Subscription,
  catchError,
  debounceTime,
  forkJoin,
  map,
  of,
  switchMap,
} from 'rxjs';
import {
  FORMS_ID_START,
  GENERATIONS,
  PokemonService,
  getArtworkUrl,
  getIdFromUrl,
  normalizeSearch,
} from '../../services/pokemon';
import { PokemonMiniatureDetail, PokemonResult } from '../../interfaces/pokemon';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { ALL_TYPES, TypeNamePipe } from '../../pipes/type-name.pipe';
import { PokemonNamePipe } from '../../pipes/pokemon-name.pipe';

const PAGE_SIZE = 24;
// Máximo de resultados de búsqueda a cargar: buscar "a" coincidía con cientos
// de Pokémon y se lanzaba una petición de detalle por cada uno.
const MAX_SEARCH_RESULTS = 24;

// Último Pokémon con número de Pokédex nacional (las formas tienen ids > 10000).
const LAST_NATIONAL_DEX = 1025;

@Component({
  selector: 'app-pokemon-list',
  imports: [RouterLink, TypeNamePipe, PokemonNamePipe],
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

  // Filtros (también se guardan en la URL: ?type=fire&gen=1)
  public readonly types = ALL_TYPES;
  public readonly generations = GENERATIONS;
  public typeFilter = signal('');
  public genFilter = signal<number | null>(null);
  public hasFilters = computed(() => !!this.typeFilter() || this.genFilter() !== null);
  /** Lista completa que cumple los filtros, o null si no hay filtros activos. */
  private filteredBase = signal<PokemonResult[] | null>(null);
  private loadSub?: Subscription;

  public totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / PAGE_SIZE)));

  public filteredPokemons = computed(() => {
    if (!this.searchTerm()) return this.pokemons();
    return this.searchResults();
  });

  /** Tarjetas de carga mientras llega la primera página o una búsqueda. */
  public readonly skeletons = Array.from({ length: 12 }, (_, i) => i);
  public showSkeletons = computed(() =>
    this.searchTerm()
      ? this.isSearching() && this.searchResults().length === 0
      : this.isLoading() && this.pokemons().length === 0,
  );

  private search$ = new Subject<string>();

  async ngOnInit(): Promise<void> {
    this.pokemonService.loadSpeciesNames();
    this.pokemonService.getAllPokemonNames().subscribe({
      next: (data) => this.allPokemons.set(data.results),
    });

    // La página vive en la URL (?page=3) para conservarla al volver del detalle.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const page = Math.max(1, Number(params.get('page')) || 1);
      const gen = Number(params.get('gen'));
      const type = params.get('type') ?? '';
      this.typeFilter.set(ALL_TYPES.includes(type) ? type : '');
      this.genFilter.set(GENERATIONS.some((g) => g.id === gen) ? gen : null);
      this.loadPage(page);
      if (this.searchTerm()) this.search$.next(this.searchTerm());
    });

    this.search$
      .pipe(
        map((term) => term.trim().toLowerCase()),
        debounceTime(300),
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

    const offset = (page - 1) * PAGE_SIZE;
    // Sin filtros paginamos en PokeAPI; con filtros obtenemos la lista completa
    // (endpoints /type y /generation) y paginamos en el cliente.
    const pageResults$: Observable<PokemonResult[]> = this.hasFilters()
      ? this.getFilteredList().pipe(
          map((list) => {
            this.filteredBase.set(list);
            this.totalCount.set(list.length);
            return list.slice(offset, offset + PAGE_SIZE);
          }),
        )
      : this.pokemonService.getPokemonList(offset, PAGE_SIZE).pipe(
          map((data) => {
            this.filteredBase.set(null);
            this.totalCount.set(data.count);
            return data.results;
          }),
        );

    this.loadSub?.unsubscribe();
    this.loadSub = pageResults$.pipe(switchMap((results) => this.toMiniatures(results))).subscribe({
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

  /** Intersección de los Pokémon del tipo y la generación elegidos, ordenados por número. */
  private getFilteredList(): Observable<PokemonResult[]> {
    const sources: Observable<PokemonResult[]>[] = [];
    const type = this.typeFilter();
    const gen = this.genFilter();

    if (type) {
      sources.push(
        this.pokemonService.getTypeDetail(type).pipe(map((d) => d.pokemon.map((p) => p.pokemon))),
      );
    }
    if (gen !== null) {
      sources.push(
        this.pokemonService.getGeneration(gen).pipe(
          map((d) =>
            d.pokemon_species.map((s) => ({
              name: s.name,
              url: this.pokemonService.getPokemonUrl(getIdFromUrl(s.url)),
            })),
          ),
        ),
      );
    }

    return forkJoin(sources).pipe(
      map((lists) => {
        const [first, ...rest] = lists.map((list) =>
          list.filter((p) => getIdFromUrl(p.url) < FORMS_ID_START),
        );
        const restIds = rest.map((list) => new Set(list.map((p) => getIdFromUrl(p.url))));
        return first
          .filter((p) => restIds.every((ids) => ids.has(getIdFromUrl(p.url))))
          .sort((a, b) => getIdFromUrl(a.url) - getIdFromUrl(b.url));
      }),
    );
  }

  setTypeFilter(type: string): void {
    this.updateFilters({ type: type || null });
  }

  setGenFilter(gen: string): void {
    this.updateFilters({ gen: gen ? Number(gen) : null });
  }

  clearFilters(): void {
    this.updateFilters({ type: null, gen: null });
  }

  private updateFilters(params: { type?: string | null; gen?: number | null }): void {
    this.router.navigate([], {
      queryParams: { ...params, page: null },
      queryParamsHandling: 'merge',
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
    // Se puede buscar por nombre (en inglés o en español, sin importar tildes ni
    // signos) o por número de Pokédex, dentro de los filtros activos.
    const source = this.filteredBase() ?? this.allPokemons();
    const query = normalizeSearch(term);
    const names = this.pokemonService.speciesNames();
    const matches = source.filter((p) => {
      const id = getIdFromUrl(p.url);
      if (String(id) === term) return true;
      if (!query) return false;
      return (
        normalizeSearch(p.name).includes(query) ||
        (!!names[id] && normalizeSearch(names[id]).includes(query))
      );
    });
    this.searchMatches.set(matches.length);
    return this.toMiniatures(matches.slice(0, MAX_SEARCH_RESULTS)).pipe(catchError(() => of([])));
  }

  isFavorite(pokemonId: number): boolean {
    return this.favorites().includes(pokemonId);
  }

  async toggleFavorite(event: Event, pokemonId: number): Promise<void> {
    event.stopPropagation();
    const userId = this.authService.currentUser()?.uid;
    // Sin sesión, guardar favoritos lleva a iniciar sesión.
    if (!userId) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

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

  /** Abre la ficha de un Pokémon al azar de la Pokédex nacional. */
  openRandom(): void {
    const id = Math.floor(Math.random() * LAST_NATIONAL_DEX) + 1;
    this.router.navigate(['/pokemon', id]);
  }

  /** Permite abrir la ficha con Enter cuando la tarjeta tiene el foco. */
  openPokemon(name: string): void {
    this.router.navigate(['/pokemon', name]);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.router.navigate([], {
      queryParams: { page: page === 1 ? null : page },
      queryParamsHandling: 'merge',
    });
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
