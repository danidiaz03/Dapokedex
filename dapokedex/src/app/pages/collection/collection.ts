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
  loading = signal(true);

  async ngOnInit() {
    await this.waitForUser();

    const userId = this.authService.currentUser()?.uid;
    if (!userId) return;

    const collectionIds = await this.firestoreService.getCollection(userId);

    const pokemons = await Promise.all(
      collectionIds.map((id) =>
        fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then((r) => r.json()),
      ),
    );

    this.pokemons.set(pokemons);
    this.loading.set(false);
  }

  waitForUser(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.authService.currentUser() !== null) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  selectForBattle(pokemonId: number) {
    this.router.navigate(['/game/battle'], { queryParams: { pokemonId } });
  }

  goBack() {
    this.router.navigate(['/game']);
  }
}
