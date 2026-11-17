import { Injectable } from '@angular/core';
import { getFirestore, doc, getDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { firebaseApp } from '../firebase';

// Firestore se inicializa aquí y no en firebase.ts para que solo se descargue
// con las páginas que lo usan (todas cargadas en diferido).
const db = getFirestore(firebaseApp);

export interface UserData {
  favorites: number[];
  starter: number | null;
  collection: number[];
  team: number[];
}

export const MAX_TEAM_SIZE = 6;

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

  async removeFromTeam(userId: string, pokemonId: number): Promise<void> {
    await this.merge(userId, { team: arrayRemove(pokemonId) });
  }
}
