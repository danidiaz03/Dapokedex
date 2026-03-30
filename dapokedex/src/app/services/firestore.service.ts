import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { environment } from '../../environments/environment';

const app = initializeApp(environment.firebase);
const db = getFirestore(app);

@Injectable({
  providedIn: 'root',
})
export class FirestoreService {
  private getUserDoc(userId: string) {
    return doc(db, 'users', userId);
  }

  async getFavorites(userId: string): Promise<number[]> {
    const docSnap = await getDoc(this.getUserDoc(userId));
    return docSnap.exists() ? (docSnap.data()['favorites'] ?? []) : [];
  }

  async addFavorite(userId: string, pokemonId: number) {
    const ref = this.getUserDoc(userId);
    const docSnap = await getDoc(ref);
    if (docSnap.exists()) {
      await updateDoc(ref, { favorites: arrayUnion(pokemonId) });
    } else {
      await setDoc(ref, { favorites: [pokemonId] });
    }
  }

  async removeFavorite(userId: string, pokemonId: number) {
    await updateDoc(this.getUserDoc(userId), {
      favorites: arrayRemove(pokemonId),
    });
  }

  async getStarter(userId: string): Promise<number | null> {
    const docSnap = await getDoc(this.getUserDoc(userId));
    return docSnap.exists() ? (docSnap.data()['starter'] ?? null) : null;
  }

  async setStarter(userId: string, pokemonId: number) {
    const ref = this.getUserDoc(userId);
    const docSnap = await getDoc(ref);
    if (docSnap.exists()) {
      await updateDoc(ref, { starter: pokemonId, collection: [pokemonId] });
    } else {
      await setDoc(ref, { favorites: [], starter: pokemonId, collection: [pokemonId] });
    }
  }

  async getCollection(userId: string): Promise<number[]> {
    const docSnap = await getDoc(this.getUserDoc(userId));
    return docSnap.exists() ? (docSnap.data()['collection'] ?? []) : [];
  }

  async addToCollection(userId: string, pokemonId: number) {
    const ref = this.getUserDoc(userId);
    const docSnap = await getDoc(ref);
    if (docSnap.exists()) {
      await updateDoc(ref, { collection: arrayUnion(pokemonId) });
    } else {
      await setDoc(ref, { favorites: [], collection: [pokemonId] });
    }
  }
  async getTeam(userId: string): Promise<number[]> {
    const docSnap = await getDoc(this.getUserDoc(userId));
    return docSnap.exists() ? (docSnap.data()['team'] ?? []) : [];
  }

  async addToTeam(userId: string, pokemonId: number): Promise<void> {
    const ref = this.getUserDoc(userId);
    const docSnap = await getDoc(ref);
    const team = docSnap.exists() ? (docSnap.data()['team'] ?? []) : [];

    if (team.length >= 6) throw new Error('El equipo ya tiene 6 Pokémon');
    if (team.includes(pokemonId)) throw new Error('Este Pokémon ya está en el equipo');

    if (docSnap.exists()) {
      await updateDoc(ref, { team: arrayUnion(pokemonId) });
    } else {
      await setDoc(ref, { favorites: [], collection: [], team: [pokemonId] });
    }
  }

  async removeFromTeam(userId: string, pokemonId: number): Promise<void> {
    await updateDoc(this.getUserDoc(userId), {
      team: arrayRemove(pokemonId),
    });
  }
}
