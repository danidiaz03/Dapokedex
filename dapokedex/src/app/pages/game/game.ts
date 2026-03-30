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
  team = signal<any[]>([]);

  getSpriteUrl(id: number): string {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  }

  async ngOnInit() {
    const userId = this.authService.currentUser()?.uid;
    if (!userId) return;

    const starter = await this.firestoreService.getStarter(userId);
    if (starter) {
      this.hasStarter.set(true);
      await this.loadTeam(userId);
    }

    this.loading.set(false);
  }

  async loadTeam(userId: string) {
    const teamIds = await this.firestoreService.getTeam(userId);
    if (teamIds.length === 0) return;

    const pokemons = await Promise.all(
      teamIds.map((id) => fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then((r) => r.json())),
    );
    this.team.set(pokemons);
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
    await this.loadTeam(userId);
  }

  startBattle() {
    const teamIds = this.team()
      .map((p) => p.id)
      .join(',');
    this.router.navigate(['/game/battle'], { queryParams: { team: teamIds } });
  }

  goToCollection() {
    this.router.navigate(['/collection']);
  }
}
