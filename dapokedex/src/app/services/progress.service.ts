import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { FirestoreService } from './firestore.service';
import { RewardFeedService } from './reward-feed.service';
import { ItemService } from './item.service';
import { achievementItem, challengeItem, levelItem } from '../game/bag';
import {
  GameEvent,
  Reward,
  TrainerProgress,
  applyEvent,
  dayKey,
  levelProgress,
  levelFromXp,
  normalizeProgress,
  trainerTitle,
  weekKey,
  DAILY_POKEMON_REASON,
} from '../game/progress';

/** Antigüedad máxima de la copia local del progreso antes de volver a leerlo. */
const CACHE_MAX_AGE_MS = 60_000;

/** Guarda el progreso del entrenador en Firestore y anuncia las recompensas. */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private auth = inject(AuthService);
  private firestore = inject(FirestoreService);
  private feed = inject(RewardFeedService);
  private items = inject(ItemService);

  readonly progress = signal<TrainerProgress | null>(null);
  readonly collectionSize = signal(0);
  readonly level = computed(() => levelProgress(this.progress()?.xp ?? 0));

  // Los eventos se procesan en cola: en "Adivina el Pokémon" se responde muy
  // rápido y dos escrituras simultáneas se pisarían la una a la otra.
  private queue: Promise<unknown> = Promise.resolve();

  // Último estado leído de Firestore. Los aciertos de "Adivina el Pokémon"
  // reutilizan esta copia en vez de leer el documento entero en cada respuesta.
  private cache: {
    uid: string;
    progress: TrainerProgress;
    collectionSize: number;
    at: number;
  } | null = null;

  async load(): Promise<TrainerProgress | null> {
    const userId = (await this.auth.waitForUser())?.uid;
    if (!userId) return null;
    return (await this.read(userId)).progress;
  }

  /** Captura el Pokémon del día: lo añade a la colección y da XP una vez al día. */
  async claimDailyPokemon(pokemonId: number): Promise<boolean> {
    const userId = (await this.auth.waitForUser())?.uid;
    if (!userId) return false;
    const rewards = await this.record({ type: 'daily-pokemon' });
    if (!rewards.some((r) => r.kind === 'xp' && r.reason === DAILY_POKEMON_REASON)) return false;
    await this.firestore.addToCollection(userId, pokemonId);
    this.collectionSize.update((n) => n + 1);
    if (this.cache) this.cache.collectionSize++;
    return true;
  }

  /** Aplica un evento de juego, lo guarda y muestra las recompensas. */
  record(event: GameEvent): Promise<Reward[]> {
    const task = this.queue.then(() => this.apply(event));
    this.queue = task.catch(() => []);
    return task;
  }

  private async read(userId: string) {
    const data = await this.firestore.getUserData(userId);
    const progress = normalizeProgress(data.progress as Partial<TrainerProgress>);
    this.cache = { uid: userId, progress, collectionSize: data.collection.length, at: Date.now() };
    this.progress.set(progress);
    this.collectionSize.set(data.collection.length);
    return this.cache;
  }

  /**
   * Las batallas cambian la colección y deben leer el documento; el resto de
   * eventos usan la copia si es reciente (por si hay otra pestaña jugando).
   */
  private async current(userId: string, event: GameEvent) {
    const fresh =
      this.cache?.uid === userId &&
      event.type !== 'battle' &&
      Date.now() - this.cache.at < CACHE_MAX_AGE_MS;
    return fresh ? this.cache! : this.read(userId);
  }

  private async apply(event: GameEvent): Promise<Reward[]> {
    const userId = (await this.auth.waitForUser())?.uid;
    if (!userId) return [];

    const { progress: before, collectionSize } = await this.current(userId, event);
    const { progress, rewards } = applyEvent(before, event, {
      today: dayKey(),
      collectionSize,
    });
    rewards.push(...(await this.itemRewards(userId, rewards)));

    if (rewards.length > 0 || event.type !== 'visit') {
      await this.firestore.saveProgress(userId, progress);
    }
    this.cache = { uid: userId, progress, collectionSize, at: this.cache?.at ?? Date.now() };
    this.progress.set(progress);
    this.feed.show(rewards);

    // Se usa la diferencia real de XP: algunas ganancias (cada acierto) no
    // generan un aviso propio y antes se quedaban fuera del ranking semanal.
    const gained = progress.xp - before.xp;
    if (gained > 0) {
      this.firestore
        .addLeaderboardXp(userId, {
          name: this.trainerName(),
          title: trainerTitle(progress.achievements),
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
   * Objetos que acompañan a las recompensas: subir de nivel, completar un
   * reto diario o desbloquear un logro también llenan la mochila.
   */
  private async itemRewards(userId: string, rewards: Reward[]): Promise<Reward[]> {
    const found: { key: string; reason: string }[] = [];
    for (const r of rewards) {
      if (r.kind === 'level') found.push({ key: levelItem(r.level), reason: `Nivel ${r.level}` });
      if (r.kind === 'challenge') found.push({ key: challengeItem(), reason: r.title });
      if (r.kind === 'achievement') found.push({ key: achievementItem(), reason: r.title });
    }
    if (found.length === 0) return [];
    try {
      await this.firestore.addItems(
        userId,
        found.map((f) => f.key),
      );
    } catch {
      return [];
    }
    return Promise.all(
      found.map(async (f) => ({
        kind: 'item' as const,
        key: f.key,
        name: await this.items.name(f.key),
        reason: f.reason,
      })),
    );
  }

  /** Avisa de objetos conseguidos fuera de los eventos de progreso (botín de combate). */
  async announceItems(keys: string[], reason: string): Promise<Reward[]> {
    const rewards = await Promise.all(
      keys.map(async (key) => ({
        kind: 'item' as const,
        key,
        name: await this.items.name(key),
        reason,
      })),
    );
    this.feed.show(rewards);
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
