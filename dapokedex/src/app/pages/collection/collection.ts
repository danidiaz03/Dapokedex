import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { PokemonService } from '../../services/pokemon';
import { TypeNamePipe } from '../../pipes/type-name.pipe';
import { PokemonNamePipe } from '../../pipes/pokemon-name.pipe';
import { EvolutionService } from '../../services/evolution.service';
import { EvolveDialog } from '../../componentes/evolve-dialog/evolve-dialog';
import {
  EvolutionOption,
  availableEvolutions,
  pokemonLevel,
  pokemonLevelPercent,
} from '../../game/pokemon-levels';
import { regionCompletion } from '../../game/progress';

@Component({
  selector: 'app-collection',
  imports: [TypeNamePipe, PokemonNamePipe, EvolveDialog],
  templateUrl: './collection.html',
  styleUrl: './collection.css',
})
export class Collection implements OnInit {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  private pokemonService = inject(PokemonService);
  private router = inject(Router);
  private evolutionService = inject(EvolutionService);

  pokemons = signal<any[]>([]);
  filteredPokemons = signal<any[]>([]);
  teamIds = signal<number[]>([]);
  loading = signal(true);
  searchTerm = signal('');
  selectedType = signal('');
  teamError = signal('');
  pokemonXp = signal<Record<number, number>>({});
  collectionIds = signal<number[]>([]);
  regions = computed(() => regionCompletion(this.collectionIds()));
  dexCount = computed(() => this.regions().reduce((sum, r) => sum + r.count, 0));
  dexPercent = computed(() => Math.round((this.dexCount() / 1025) * 1000) / 10);
  /** Evoluciones ya disponibles por id de Pokémon. */
  evolutions = signal<Record<number, EvolutionOption[]>>({});
  evolving = signal<{ id: number; name: string; options: EvolutionOption[] } | null>(null);

  get types(): string[] {
    const all = this.pokemons().flatMap((p) => p.types.map((t: any) => t.type.name));
    return [...new Set(all)].sort();
  }

  async ngOnInit() {
    const userId = (await this.authService.waitForUser())?.uid;
    if (!userId) return;

    await this.load(userId);
  }

  private async load(userId: string) {
    const data = await this.firestoreService.getUserData(userId);
    const pokemons = await this.pokemonService.getPokemons(data.collection);

    this.pokemons.set(pokemons);
    this.teamIds.set(data.team);
    this.pokemonXp.set(data.pokemonXp);
    this.collectionIds.set(data.collection);
    this.applyFilters();
    this.loading.set(false);
    this.loadEvolutions(data.pokemonXp);
  }

  /** Solo se consulta PokeAPI para los Pokémon con experiencia suficiente. */
  private async loadEvolutions(xp: Record<number, number>) {
    const candidates = Object.entries(xp)
      .map(([id, value]) => ({ id: Number(id), xp: value }))
      .filter((p) => pokemonLevel(p.xp) > 5);
    const result: Record<number, EvolutionOption[]> = {};
    await Promise.all(
      candidates.map(async (p) => {
        const options = availableEvolutions(await this.evolutionService.optionsFor(p.id), p.xp);
        if (options.length) result[p.id] = options;
      }),
    );
    this.evolutions.set(result);
  }

  level(id: number): number {
    return pokemonLevel(this.pokemonXp()[id] ?? 0);
  }

  levelPercent(id: number): number {
    return pokemonLevelPercent(this.pokemonXp()[id] ?? 0);
  }

  openEvolution(pokemon: { id: number; name: string }) {
    const options = this.evolutions()[pokemon.id];
    if (options) this.evolving.set({ id: pokemon.id, name: pokemon.name, options });
  }

  async onEvolutionClosed() {
    this.evolving.set(null);
    const userId = this.authService.currentUser()?.uid;
    if (userId) await this.load(userId);
  }

  onSearch(term: string) {
    this.searchTerm.set(term);
    this.applyFilters();
  }

  onTypeFilter(type: string) {
    this.selectedType.set(type);
    this.applyFilters();
  }

  applyFilters() {
    let result = this.pokemons();
    if (this.searchTerm()) {
      result = result.filter((p) => p.name.includes(this.searchTerm().toLowerCase()));
    }
    if (this.selectedType()) {
      result = result.filter((p) => p.types.some((t: any) => t.type.name === this.selectedType()));
    }
    this.filteredPokemons.set(result);
  }

  isInTeam(pokemonId: number): boolean {
    return this.teamIds().includes(pokemonId);
  }

  async toggleTeam(pokemonId: number) {
    const userId = this.authService.currentUser()?.uid;
    if (!userId) return;
    this.teamError.set('');

    try {
      if (this.isInTeam(pokemonId)) {
        await this.firestoreService.removeFromTeam(userId, pokemonId);
        this.teamIds.set(this.teamIds().filter((id) => id !== pokemonId));
      } else {
        await this.firestoreService.addToTeam(userId, pokemonId);
        this.teamIds.set([...this.teamIds(), pokemonId]);
      }
    } catch (e: any) {
      this.teamError.set(e.message);
      setTimeout(() => this.teamError.set(''), 3000);
    }
  }

  goToGame() {
    this.router.navigate(['/game']);
  }
}
