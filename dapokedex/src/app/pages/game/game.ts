import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';

const STARTERS = [
  { id: 1, name: 'Bulbasaur' },
  { id: 4, name: 'Charmander' },
  { id: 7, name: 'Squirtle' },
];

@Component({
  selector: 'app-game',
  imports: [],
  templateUrl: './game.html',
  styleUrl: './game.css',
})
export class Game implements OnInit {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  private router = inject(Router);

  starters = STARTERS;
  hasStarter = signal(false);
  loading = signal(true);
  selectedStarter = signal<number | null>(null);
  collection = signal<any[]>([]);

  getSpriteUrl(id: number): string {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  }

  async ngOnInit() {
    const userId = this.authService.currentUser()?.uid;
    if (!userId) return;

    const starter = await this.firestoreService.getStarter(userId);
    if (starter) {
      this.hasStarter.set(true);
      const collectionIds = await this.firestoreService.getCollection(userId);
      const pokemons = await Promise.all(
        collectionIds.map((id) =>
          fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then((r) => r.json()),
        ),
      );
      this.collection.set(pokemons);
    }

    this.loading.set(false);
  }

  selectStarter(id: number) {
    this.selectedStarter.set(id);
  }

  async confirmStarter() {
    const userId = this.authService.currentUser()?.uid;
    const starterId = this.selectedStarter();
    if (!userId || !starterId) return;

    await this.firestoreService.setStarter(userId, starterId);
    this.hasStarter.set(true);
    const collectionIds = await this.firestoreService.getCollection(userId);
    const pokemons = await Promise.all(
      collectionIds.map((id) =>
        fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then((r) => r.json()),
      ),
    );
    this.collection.set(pokemons);
  }

  selectForBattle(pokemonId: number) {
    this.router.navigate(['/game/battle'], { queryParams: { pokemonId } });
  }
}
