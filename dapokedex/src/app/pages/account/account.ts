import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { PokemonService } from '../../services/pokemon';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [],
  templateUrl: './account.html',
  styleUrl: './account.css',
})
export class Account implements OnInit {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  private router = inject(Router);

  user = this.authService.currentUser;
  favorites = signal<any[]>([]);
  loading = signal(true);

  async ngOnInit() {
    const userId = this.user()?.uid;
    if (!userId) return;

    const favoriteIds = await this.firestoreService.getFavorites(userId);

    const pokemons = await Promise.all(
      favoriteIds.map((id) =>
        fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then((r) => r.json()),
      ),
    );

    this.favorites.set(pokemons);
    this.loading.set(false);
  }

  async logout() {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  goToPokemon(name: string) {
    this.router.navigate(['/pokemon', name]);
  }
  async removeFavorite(event: Event, pokemonId: number) {
    event.stopPropagation();
    const userId = this.user()?.uid;
    if (!userId) return;

    await this.firestoreService.removeFavorite(userId, pokemonId);
    this.favorites.set(this.favorites().filter((p) => p.id !== pokemonId));
  }
}
