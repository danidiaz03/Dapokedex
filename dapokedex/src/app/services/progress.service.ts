import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { FirestoreService } from './firestore.service';
import { RewardFeedService } from './reward-feed.service';
import {
  GameEvent,
  Reward,
  TrainerProgress,
  applyEvent,
  dayKey,
  levelProgress,
  levelFromXp,
  normalizeProgress,
  weekKey,
  xpFromRewards,
} from '../game/progress';

/** Guarda el progreso del entrenador en Firestore y anuncia las recompensas. */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private auth = inject(AuthService);
  private firestore = inject(FirestoreService);
  private feed = inject(RewardFeedService);

  readonly progress = signal<TrainerProgress | null>(null);
  readonly collectionSize = signal(0);
  readonly level = computed(() => levelProgress(this.progress()?.xp ?? 0));

  // Los eventos se procesan en cola: en "Adivina el Pokémon" se responde muy
  // rápido y dos escrituras simultáneas se pisarían la una a la otra.
  private queue: Promise<unknown> = Promise.resolve();

  async load(): Promise<TrainerProgress | null> {
    const userId = (await this.auth.waitForUser())?.uid;
    if (!userId) return null;
    const data = await this.firestore.getUserData(userId);
    const progress = normalizeProgress(data.progress as Partial<TrainerProgress>);
    this.progress.set(progress);
    this.collectionSize.set(data.collection.length);
    return progress;
  }

  /** Captura el Pokémon del día: lo añade a la colección y da XP una vez al día. */
  async claimDailyPokemon(pokemonId: number): Promise<boolean> {
    const userId = (await this.auth.waitForUser())?.uid;
    if (!userId) return false;
    const rewards = await this.record({ type: 'daily-pokemon' });
    if (!rewards.some((r) => r.kind === 'xp' && r.reason === 'Pokémon del día')) return false;
    await this.firestore.addToCollection(userId, pokemonId);
    this.collectionSize.update((n) => n + 1);
    return true;
  }

  /** Aplica un evento de juego, lo guarda y muestra las recompensas. */
  record(event: GameEvent): Promise<Reward[]> {
    const task = this.queue.then(() => this.apply(event));
    this.queue = task.catch(() => []);
    return task;
  }

  private async apply(event: GameEvent): Promise<Reward[]> {
    const userId = (await this.auth.waitForUser())?.uid;
    if (!userId) return [];

    const data = await this.firestore.getUserData(userId);
    const current = normalizeProgress(data.progress as Partial<TrainerProgress>);
    const { progress, rewards } = applyEvent(current, event, {
      today: dayKey(),
      collectionSize: data.collection.length,
    });

    if (rewards.length > 0 || event.type !== 'visit') {
      await this.firestore.saveProgress(userId, progress);
    }
    this.progress.set(progress);
    this.collectionSize.set(data.collection.length);
    this.feed.show(rewards);

    // El ranking no debe romper el juego si falla (sin conexión, reglas...).
    const gained = xpFromRewards(rewards);
    if (gained > 0) {
      this.firestore
        .addLeaderboardXp(userId, {
          name: this.trainerName(),
          level: levelFromXp(progress.xp),
          gained,
          totalXp: progress.xp,
          week: weekKey(),
        })
        .catch((error) => console.warn('No se pudo actualizar el ranking', error));
    }
    return rewards;
  }

  /**
   * Nombre público en el ranking: solo el nombre de pila de la cuenta, nunca
   * el email, para no exponer datos personales.
   */
  trainerName(): string {
    const user = this.auth.currentUser();
    const first = user?.displayName?.trim().split(/\s+/)[0];
    return first || `Entrenador ${user?.uid.slice(0, 4).toUpperCase() ?? ''}`.trim();
  }
}
