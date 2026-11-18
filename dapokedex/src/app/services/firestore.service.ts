import { Injectable } from '@angular/core';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  getCountFromServer,
  increment,
  serverTimestamp,
  writeBatch,
  deleteField,
} from 'firebase/firestore';
import { firebaseApp } from '../firebase';

// Firestore se inicializa aquí y no en firebase.ts para que solo se descargue
// con las páginas que lo usan (todas cargadas en diferido).
const db = getFirestore(firebaseApp);

export interface UserData {
  favorites: number[];
  starter: number | null;
  collection: number[];
  team: number[];
  /** Progreso del entrenador sin normalizar (ver game/progress.ts). */
  progress?: Record<string, unknown>;
  /** Experiencia de cada Pokémon de la colección, por id. */
  pokemonXp: Record<number, number>;
}

export const MAX_TEAM_SIZE = 6;

export interface LeaderboardEntry {
  uid: string;
  name: string;
  xp: number;
  level: number;
}

/** Ranking de la semana ("week-2026-W47") o de siempre ("alltime"). */
export type LeaderboardId = `week-${string}` | 'alltime';

@Injectable({
  providedIn: 'root',
})
export class FirestoreService {
  private getUserDoc(userId: string) {
    return doc(db, 'users', userId);
  }

  /** Lee el documento del usuario una sola vez con todos sus campos normalizados. */
  async getUserData(userId: string): Promise<UserData> {
    const docSnap = await getDoc(this.getUserDoc(userId));
    const data = docSnap.exists() ? docSnap.data() : {};
    return {
      favorites: data['favorites'] ?? [],
      starter: data['starter'] ?? null,
      collection: data['collection'] ?? [],
      team: data['team'] ?? [],
      progress: data['progress'],
      pokemonXp: data['pokemonXp'] ?? {},
    };
  }

  // setDoc con merge crea el documento si no existe y si existe solo toca los
  // campos indicados, así nos ahorramos la lectura previa en cada escritura.
  private merge(userId: string, data: Record<string, unknown>) {
    return setDoc(this.getUserDoc(userId), data, { merge: true });
  }

  async getFavorites(userId: string): Promise<number[]> {
    return (await this.getUserData(userId)).favorites;
  }

  async addFavorite(userId: string, pokemonId: number) {
    await this.merge(userId, { favorites: arrayUnion(pokemonId) });
  }

  async removeFavorite(userId: string, pokemonId: number) {
    await this.merge(userId, { favorites: arrayRemove(pokemonId) });
  }

  async getStarter(userId: string): Promise<number | null> {
    return (await this.getUserData(userId)).starter;
  }

  /** Guarda el inicial y lo añade directamente a la colección y al equipo. */
  async setStarter(userId: string, pokemonId: number) {
    await this.merge(userId, {
      starter: pokemonId,
      collection: arrayUnion(pokemonId),
      team: arrayUnion(pokemonId),
    });
  }

  async getCollection(userId: string): Promise<number[]> {
    return (await this.getUserData(userId)).collection;
  }

  async addToCollection(userId: string, ...pokemonIds: number[]) {
    if (pokemonIds.length === 0) return;
    await this.merge(userId, { collection: arrayUnion(...pokemonIds) });
  }

  async getTeam(userId: string): Promise<number[]> {
    return (await this.getUserData(userId)).team;
  }

  async addToTeam(userId: string, pokemonId: number): Promise<void> {
    const team = await this.getTeam(userId);

    if (team.length >= MAX_TEAM_SIZE)
      throw new Error(`El equipo ya tiene ${MAX_TEAM_SIZE} Pokémon`);
    if (team.includes(pokemonId)) throw new Error('Este Pokémon ya está en el equipo');

    await this.merge(userId, { team: arrayUnion(pokemonId) });
  }

  /**
   * Sustituye el campo progress completo. Con merge normal Firestore fusionaría
   * los mapas anidados y no se borrarían los contadores de días anteriores.
   */
  async saveProgress(userId: string, progress: object): Promise<void> {
    await setDoc(this.getUserDoc(userId), { progress }, { mergeFields: ['progress'] });
  }

  /** Suma experiencia a varios Pokémon a la vez (increment evita pisar datos). */
  async addPokemonXp(userId: string, gains: Record<number, number>): Promise<void> {
    const pokemonXp: Record<string, unknown> = {};
    for (const [id, xp] of Object.entries(gains)) pokemonXp[id] = increment(xp);
    await this.merge(userId, { pokemonXp });
  }

  /**
   * Evoluciona un Pokémon: ocupa su sitio en el equipo, se añade a la
   * colección y hereda su experiencia. La forma anterior sigue en la colección.
   */
  async evolvePokemon(userId: string, fromId: number, toId: number): Promise<void> {
    const data = await this.getUserData(userId);
    const xp = data.pokemonXp[fromId] ?? 0;
    const team = data.team.map((id) => (id === fromId ? toId : id));
    await this.merge(userId, {
      team: [...new Set(team)],
      collection: arrayUnion(toId),
      pokemonXp: { [toId]: xp, [fromId]: deleteField() },
    });
  }

  async removeFromTeam(userId: string, pokemonId: number): Promise<void> {
    await this.merge(userId, { team: arrayRemove(pokemonId) });
  }

  // --- Ranking -------------------------------------------------------------
  // Cada ranking es leaderboard/{id}/players/{uid}: solo nombre, nivel y XP,
  // para no exponer el documento del usuario (favoritos, colección...).

  private players(board: LeaderboardId) {
    return collection(db, 'leaderboard', board, 'players');
  }

  /** Suma XP a la semana actual y actualiza el total histórico en una sola escritura. */
  async addLeaderboardXp(
    userId: string,
    data: { name: string; level: number; gained: number; totalXp: number; week: string },
  ): Promise<void> {
    const batch = writeBatch(db);
    const common = { name: data.name, level: data.level, updatedAt: serverTimestamp() };
    batch.set(
      doc(this.players(`week-${data.week}`), userId),
      { ...common, xp: increment(data.gained) },
      { merge: true },
    );
    batch.set(
      doc(this.players('alltime'), userId),
      { ...common, xp: data.totalXp },
      { merge: true },
    );
    await batch.commit();
  }

  async getLeaderboard(board: LeaderboardId, size = 50): Promise<LeaderboardEntry[]> {
    const snap = await getDocs(query(this.players(board), orderBy('xp', 'desc'), limit(size)));
    return snap.docs.map((d) => ({
      uid: d.id,
      name: d.get('name') ?? 'Entrenador',
      xp: d.get('xp') ?? 0,
      level: d.get('level') ?? 1,
    }));
  }

  /** Posición del usuario (aunque no esté en el top) contando quién tiene más XP. */
  async getLeaderboardRank(
    board: LeaderboardId,
    userId: string,
  ): Promise<{ rank: number; xp: number; total: number } | null> {
    const mine = await getDoc(doc(this.players(board), userId));
    if (!mine.exists()) return null;
    const xp = mine.get('xp') ?? 0;
    const [above, total] = await Promise.all([
      getCountFromServer(query(this.players(board), where('xp', '>', xp))),
      getCountFromServer(this.players(board)),
    ]);
    return { rank: above.data().count + 1, xp, total: total.data().count };
  }
}
