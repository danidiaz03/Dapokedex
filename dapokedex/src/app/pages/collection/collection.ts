import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';

@Component({
  selector: 'app-collection',
  imports: [],
  templateUrl: './collection.html',
  styleUrl: './collection.css',
})
export class Collection implements OnInit {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  private router = inject(Router);

  pokemons = signal<any[]>([]);
  filteredPokemons = signal<any[]>([]);
  teamIds = signal<number[]>([]);
  loading = signal(true);
  searchTerm = signal('');
  selectedType = signal('');
  teamError = signal('');

  get types(): string[] {
    const all = this.pokemons().flatMap((p) => p.types.map((t: any) => t.type.name));
    return [...new Set(all)].sort();
  }

  async ngOnInit() {
    await this.waitForUser();

    const userId = this.authService.currentUser()?.uid;
    if (!userId) return;

    const [collectionIds, teamIds] = await Promise.all([
      this.firestoreService.getCollection(userId),
      this.firestoreService.getTeam(userId),
    ]);

    const pokemons = await Promise.all(
      collectionIds.map((id) =>
        fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then((r) => r.json()),
      ),
    );

    this.pokemons.set(pokemons);
    this.filteredPokemons.set(pokemons);
    this.teamIds.set(teamIds);
    this.loading.set(false);
  }

  waitForUser(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.authService.currentUser() !== null) resolve();
        else setTimeout(check, 100);
      };
      check();
    });
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
