import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { PokemonService, getArtworkUrl } from '../../services/pokemon';
import { TypeNamePipe } from '../../pipes/type-name.pipe';
import { PokemonNamePipe } from '../../pipes/pokemon-name.pipe';
import { ProgressService } from '../../services/progress.service';
import { DailyPokemon } from '../../componentes/daily-pokemon/daily-pokemon';
import {
  ACHIEVEMENTS,
  dailyChallenges,
  dayKey,
  nextRegion,
  maxEnemyId,
  REGIONS,
} from '../../game/progress';

const STARTERS = [
  { id: 1, name: 'Bulbasaur' },
  { id: 4, name: 'Charmander' },
  { id: 7, name: 'Squirtle' },
];

@Component({
  selector: 'app-game',
  imports: [TypeNamePipe, RouterLink, PokemonNamePipe, DailyPokemon],
  templateUrl: './game.html',
  styleUrl: './game.css',
})
export class Game implements OnInit {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  private pokemonService = inject(PokemonService);
  private router = inject(Router);
  private progressService = inject(ProgressService);

  starters = STARTERS;

  // Progreso del entrenador
  progress = this.progressService.progress;
  level = this.progressService.level;
  xpPercent = computed(() => {
    const l = this.level();
    return Math.min(100, (l.current / l.needed) * 100);
  });
  region = computed(() => REGIONS.filter((r) => r.level <= this.level().level).at(-1)!);
  nextRegion = computed(() => nextRegion(this.level().level));
  maxEnemyId = computed(() => maxEnemyId(this.level().level));

  /** Retos de hoy con su avance. */
  challenges = computed(() => {
    const today = dayKey();
    const daily = this.progress()?.daily;
    const counters = daily?.date === today ? daily.counters : {};
    const rewarded = daily?.date === today ? daily.rewarded : [];
    return dailyChallenges(today).map((c) => {
      const value = Math.min(counters[c.counter] ?? 0, c.goal);
      return { ...c, value, percent: (value / c.goal) * 100, done: rewarded.includes(c.id) };
    });
  });
  challengesDone = computed(() => this.challenges().filter((c) => c.done).length);

  achievements = computed(() => {
    const unlocked = new Set(this.progress()?.achievements ?? []);
    return ACHIEVEMENTS.map((a) => ({ ...a, unlocked: unlocked.has(a.id) }));
  });
  achievementsUnlocked = computed(() => this.achievements().filter((a) => a.unlocked).length);
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

    // Cargamos el progreso y contamos la visita para la racha de días.
    this.progressService
      .load()
      .then(() => this.progressService.record({ type: 'visit' }))
      .catch((error) => console.warn('No se pudo cargar el progreso', error));

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
