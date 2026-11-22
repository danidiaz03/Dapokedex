import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ProgressService } from '../../../services/progress.service';
import { KeyboardService } from '../../../services/keyboard.service';
import {
  GENERATIONS,
  PokemonService,
  LAST_NATIONAL_DEX,
  getArtworkUrl,
  pickLocalized,
  playPokemonCry,
} from '../../../services/pokemon';

interface GuessOption {
  id: number;
  name: string;
}

const BEST_STREAK_KEY = 'dapokedex-guess-best-streak';
// Rango de números de Pokédex de cada generación, para jugar solo con una.
const GENERATION_RANGES: Record<number, [number, number]> = {
  1: [1, 151],
  2: [152, 251],
  3: [252, 386],
  4: [387, 493],
  5: [494, 649],
  6: [650, 721],
  7: [722, 809],
  8: [810, 905],
  9: [906, LAST_NATIONAL_DEX],
};

@Component({
  selector: 'app-guess',
  imports: [RouterLink],
  templateUrl: './guess.html',
  styleUrl: './guess.css',
})
export class Guess implements OnInit, OnDestroy {
  private pokemonService = inject(PokemonService);
  private progressService = inject(ProgressService);
  private keyboard = inject(KeyboardService);
  private unregisterKeys?: () => void;

  readonly generations = GENERATIONS;
  generation = signal<number | null>(1);
  answer = signal<GuessOption | null>(null);
  options = signal<GuessOption[]>([]);
  selected = signal<number | null>(null);
  loading = signal(true);
  error = signal(false);
  streak = signal(0);
  bestStreak = signal(this.readBestStreak());
  rounds = signal(0);
  hits = signal(0);

  private nextRoundTimer?: ReturnType<typeof setTimeout>;
  private roundRequest = 0;

  ngOnInit() {
    this.newRound();
    // Las opciones se eligen con 1-4 (tienen prioridad sobre las secciones).
    this.unregisterKeys = this.keyboard.register(
      (e) => this.onKey(e),
      [
        { keys: ['1', '2', '3', '4'], label: 'Elegir respuesta' },
        { keys: ['C'], label: 'Pista: grito' },
        { keys: ['N'], label: 'Saltar' },
      ],
      'Adivina el Pokémon',
    );
  }

  ngOnDestroy() {
    clearTimeout(this.nextRoundTimer);
    this.unregisterKeys?.();
  }

  private onKey(e: KeyboardEvent): boolean {
    const key = e.key.toLowerCase();
    if (/^[1-4]$/.test(key)) {
      const option = this.options()[Number(key) - 1];
      if (option && !this.loading()) this.choose(option);
      return true;
    }
    if (key === 'c') {
      this.playCry();
      return true;
    }
    if (key === 'n' && !this.loading()) {
      this.newRound();
      return true;
    }
    return false;
  }

  get revealed(): boolean {
    return this.selected() !== null;
  }

  get artwork(): string {
    const answer = this.answer();
    return answer ? getArtworkUrl(answer.id) : '';
  }

  setGeneration(value: string) {
    this.generation.set(value ? Number(value) : null);
    this.streak.set(0);
    this.newRound();
  }

  private randomIds(count: number): number[] {
    const [min, max] = GENERATION_RANGES[this.generation() ?? 0] ?? [1, LAST_NATIONAL_DEX];
    const ids = new Set<number>();
    while (ids.size < count) ids.add(min + Math.floor(Math.random() * (max - min + 1)));
    return [...ids];
  }

  /** Nombre en español de la especie (cacheado por PokemonService). */
  private async getName(id: number): Promise<string> {
    const species = await firstValueFrom(this.pokemonService.getPokemonSpeciesbyName(id));
    return pickLocalized(species.names)?.name ?? species.name;
  }

  async newRound() {
    clearTimeout(this.nextRoundTimer);
    const request = ++this.roundRequest;
    this.loading.set(true);
    this.error.set(false);
    this.selected.set(null);

    try {
      const ids = this.randomIds(4);
      const names = await Promise.all(ids.map((id) => this.getName(id)));
      if (request !== this.roundRequest) return;

      const options = ids.map((id, i) => ({ id, name: names[i] }));
      this.answer.set(options[0]);
      this.options.set(options.sort(() => Math.random() - 0.5));
    } catch {
      if (request === this.roundRequest) this.error.set(true);
    }
    if (request === this.roundRequest) this.loading.set(false);
  }

  choose(option: GuessOption) {
    if (this.revealed || !this.answer()) return;
    this.selected.set(option.id);
    this.rounds.update((n) => n + 1);

    if (option.id === this.answer()!.id) {
      this.hits.update((n) => n + 1);
      this.streak.update((n) => n + 1);
      if (this.streak() > this.bestStreak()) {
        this.bestStreak.set(this.streak());
        this.saveBestStreak(this.streak());
      }
      // Cada acierto suma XP y avanza el reto diario de siluetas.
      this.progressService
        .record({ type: 'guess', correct: true, streak: this.streak() })
        .catch(() => {});
    } else {
      this.streak.set(0);
    }
    this.playCry();
    this.nextRoundTimer = setTimeout(() => this.newRound(), 2500);
  }

  playCry() {
    const answer = this.answer();
    if (!answer) return;
    playPokemonCry(answer.id);
  }

  optionState(option: GuessOption): 'correct' | 'wrong' | '' {
    if (!this.revealed) return '';
    if (option.id === this.answer()?.id) return 'correct';
    if (option.id === this.selected()) return 'wrong';
    return '';
  }

  // La mejor racha es una comodidad por navegador; si el almacenamiento no
  // está disponible el juego funciona igual.
  private readBestStreak(): number {
    try {
      return Number(localStorage.getItem(BEST_STREAK_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  private saveBestStreak(value: number) {
    try {
      localStorage.setItem(BEST_STREAK_KEY, String(value));
    } catch {}
  }
}
