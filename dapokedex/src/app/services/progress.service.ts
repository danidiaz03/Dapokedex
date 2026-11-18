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
  normalizeProgress,
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
    return rewards;
  }
}
