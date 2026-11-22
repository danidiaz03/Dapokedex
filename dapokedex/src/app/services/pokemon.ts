import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, firstValueFrom, map, Observable, of, shareReplay } from 'rxjs';

import { FORMS_ID_START } from '../shared/pokedex';
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

// PokeAPI también ofrece GraphQL: permite traer los 1025 nombres en español en
// una sola petición en lugar de pedir /pokemon-species uno a uno.
const GRAPHQL_URL = 'https://graphql.pokeapi.co/v1beta2';
const SPANISH_LANGUAGE_ID = 7;
const SPECIES_NAMES_QUERY = `{ pokemonspeciesname(where: {language_id: {_eq: ${SPANISH_LANGUAGE_ID}}}) { name pokemon_species_id } }`;

interface SpeciesNamesResponse {
  data?: { pokemonspeciesname: { name: string; pokemon_species_id: number }[] };
}

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

  /** Nombres oficiales en español indexados por número de Pokédex. */
  public readonly speciesNames = signal<Record<number, string>>({});
  private speciesNamesRequested = false;

  /** Descarga los nombres en español una sola vez por sesión. */
  public loadSpeciesNames(): void {
    if (this.speciesNamesRequested) return;
    this.speciesNamesRequested = true;
    this.http
      .post<SpeciesNamesResponse>(GRAPHQL_URL, { query: SPECIES_NAMES_QUERY })
      .pipe(
        map((res) => {
          const names: Record<number, string> = {};
          for (const n of res.data?.pokemonspeciesname ?? []) names[n.pokemon_species_id] = n.name;
          return names;
        }),
        // Si GraphQL falla seguimos con los nombres de la API REST formateados.
        catchError(() => {
          this.speciesNamesRequested = false;
          return of({});
        }),
      )
      .subscribe((names) => this.speciesNames.set(names));
  }

  /** Nombre para mostrar: el oficial en español o el de la API formateado. */
  public displayName(name: string, id?: number): string {
    const official = id && id < FORMS_ID_START ? this.speciesNames()[id] : undefined;
    return official ?? formatPokemonName(name);
  }

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

/** "mr-mime" → "Mr Mime", "charizard-mega-x" → "Charizard Mega X". */
export function formatPokemonName(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Normaliza para buscar sin tildes, mayúsculas ni signos ("Mr. Mime" = "mr-mime"). */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9♀♂]/g, '');
}

/** Limpia los saltos de línea y caracteres de control de los textos de la Pokédex. */
export function cleanFlavorText(text: string): string {
  return text
    .replace(/[\f\n\r\u00ad]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reproduce el grito de un Pokémon; si el navegador lo bloquea, no hace nada. */
export function playPokemonCry(id: number, volume = 0.5): void {
  const audio = new Audio(
    `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`,
  );
  audio.volume = volume;
  audio.play().catch(() => {});
}

// Se reexportan para no cambiar los imports existentes.
export { FORMS_ID_START, GENERATIONS, LAST_NATIONAL_DEX } from '../shared/pokedex';
