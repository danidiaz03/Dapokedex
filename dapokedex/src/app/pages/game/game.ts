import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { PokemonService, getArtworkUrl } from '../../services/pokemon';
import { TypeNamePipe } from '../../pipes/type-name.pipe';
import { PokemonNamePipe } from '../../pipes/pokemon-name.pipe';

const STARTERS = [
  { id: 1, name: 'Bulbasaur' },
  { id: 4, name: 'Charmander' },
  { id: 7, name: 'Squirtle' },
];

@Component({
  selector: 'app-game',
  imports: [TypeNamePipe, RouterLink, PokemonNamePipe],
  templateUrl: './game.html',
  styleUrl: './game.css',
})
export class Game implements OnInit {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  private pokemonService = inject(PokemonService);
  private router = inject(Router);

  starters = STARTERS;
  hasStarter = signal(false);
  loading = signal(true);
  selectedStarter = signal<number | null>(null);
  team = signal<any[]>([]);

  getSpriteUrl(id: number): string {
    return getArtworkUrl(id);
  }

  async ngOnInit() {
    const userId = (await this.authService.waitForUser())?.uid;
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

    const pokemons = await this.pokemonService.getPokemons(teamIds);
    this.team.set(pokemons);
  }

  // Los ids de los iniciales son 1, 4 y 7, así que no se pueden usar como índice.
  selectedStarterName = computed(
    () => this.starters.find((s) => s.id === this.selectedStarter())?.name ?? '',
  );

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
    // La batalla lee el equipo directamente de Firestore.
    this.router.navigate(['/game/battle']);
  }

  goToCollection() {
    this.router.navigate(['/collection']);
  }
}
