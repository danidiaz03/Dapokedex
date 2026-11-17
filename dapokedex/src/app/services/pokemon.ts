import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, Observable, shareReplay } from 'rxjs';

import {
  PokemonDetail,
  PokemonDetailPage,
  PokemonListResponse,
  PokemonMove,
  PokemonType,
  PokemonGeneration,
  PokemonAbility,
  PokemonItem,
  pokemonSpecies,
  pokemonEvolutionChain,
} from '../interfaces/pokemon';

const ARTWORK_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';

/** URL del artwork oficial a partir del id del Pokémon. */
export function getArtworkUrl(id: number | string): string {
  return `${ARTWORK_URL}/${id}.png`;
}

/** Extrae el id numérico de una URL de PokeAPI (…/pokemon/25/ → 25). */
export function getIdFromUrl(url: string): number {
  return Number(url.split('/').filter(Boolean).pop());
}

@Injectable({
  providedIn: 'root',
})
export class PokemonService {
  private http = inject(HttpClient);
  private apiUrl = 'https://pokeapi.co/api/v2';

  // PokeAPI es estática: cacheamos cada petición para no repetirla al navegar
  // entre páginas (listado → detalle → colección → batalla...).
  private cache = new Map<string, Observable<unknown>>();

  private getCached<T>(url: string): Observable<T> {
    if (!this.cache.has(url)) {
      const request$ = this.http.get<T>(url).pipe(shareReplay(1));
      this.cache.set(url, request$);
      // Si la petición falla la quitamos de la caché para poder reintentar.
      request$.subscribe({ error: () => this.cache.delete(url) });
    }
    return this.cache.get(url) as Observable<T>;
  }

  public getPokemonList(offset = 0, limit = 24): Observable<PokemonListResponse> {
    return this.getCached<PokemonListResponse>(
      `${this.apiUrl}/pokemon?offset=${offset}&limit=${limit}`,
    );
  }
  public getPokemonByUrl(url: string): Observable<PokemonListResponse> {
    return this.getCached<PokemonListResponse>(url);
  }
  public getPokemonDetail(url: string): Observable<PokemonDetail> {
    return this.getCached<PokemonDetail>(url);
  }
  public getAllPokemonNames(): Observable<PokemonListResponse> {
    // limit alto para traer siempre todos aunque PokeAPI añada nuevos Pokémon.
    return this.getCached<PokemonListResponse>(`${this.apiUrl}/pokemon?limit=100000&offset=0`);
  }

  public getPokemonDetailbyName(nombre: string | number) {
    return this.getCached<PokemonDetailPage>(`${this.apiUrl}/pokemon/${nombre}`);
  }
  public getPokemonSpeciesbyName(nombre: string | number) {
    return this.getCached<pokemonSpecies>(`${this.apiUrl}/pokemon-species/${nombre}`);
  }
  public getSpeciesByUrl(url: string) {
    return this.getCached<pokemonSpecies>(url);
  }
  public getEvolutionChainByUrl(url: string) {
    return this.getCached<pokemonEvolutionChain>(url);
  }

  // Versiones basadas en Promise para las páginas que trabajan con async/await.
  public getPokemon(idOrName: number | string): Promise<PokemonDetailPage> {
    return firstValueFrom(this.getPokemonDetailbyName(idOrName));
  }

  public getPokemons(ids: number[]): Promise<PokemonDetailPage[]> {
    return Promise.all(ids.map((id) => this.getPokemon(id)));
  }

  public getMove(nameOrUrl: string): Promise<PokemonMove> {
    const url = nameOrUrl.startsWith('http') ? nameOrUrl : `${this.apiUrl}/move/${nameOrUrl}`;
    return firstValueFrom(this.getCached<PokemonMove>(url));
  }

  public getItem(url: string): Observable<PokemonItem> {
    return this.getCached<PokemonItem>(url);
  }

  public getAbility(url: string): Observable<PokemonAbility> {
    return this.getCached<PokemonAbility>(url);
  }

  public getType(name: string): Promise<PokemonType> {
    return firstValueFrom(this.getTypeDetail(name));
  }

  public getTypeDetail(name: string): Observable<PokemonType> {
    return this.getCached<PokemonType>(`${this.apiUrl}/type/${name}`);
  }

  public getGeneration(id: number): Observable<PokemonGeneration> {
    return this.getCached<PokemonGeneration>(`${this.apiUrl}/generation/${id}`);
  }

  /** Construye la URL del endpoint /pokemon a partir del id. */
  public getPokemonUrl(id: number): string {
    return `${this.apiUrl}/pokemon/${id}/`;
  }
}

/** Devuelve el texto en español de una lista localizada de PokeAPI, o en inglés como respaldo. */
export function pickLocalized<T extends { language: { name: string } }>(
  entries: T[] | undefined,
): T | undefined {
  if (!entries) return undefined;
  return (
    [...entries].reverse().find((e) => e.language.name === 'es') ??
    [...entries].reverse().find((e) => e.language.name === 'en')
  );
}

/** Limpia los saltos de línea y caracteres de control de los textos de la Pokédex. */
export function cleanFlavorText(text: string): string {
  return text
    .replace(/[\f\n\r\u00ad]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Generaciones con su región, para los filtros del listado. */
export const GENERATIONS = [
  { id: 1, label: 'I · Kanto' },
  { id: 2, label: 'II · Johto' },
  { id: 3, label: 'III · Hoenn' },
  { id: 4, label: 'IV · Sinnoh' },
  { id: 5, label: 'V · Teselia' },
  { id: 6, label: 'VI · Kalos' },
  { id: 7, label: 'VII · Alola' },
  { id: 8, label: 'VIII · Galar' },
  { id: 9, label: 'IX · Paldea' },
];

/** Las formas alternativas (megas, regionales...) tienen ids a partir de 10001. */
export const FORMS_ID_START = 10001;
