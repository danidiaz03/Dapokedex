import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

import {
  PokemonDetail,
  PokemonDetailPage,
  PokemonListResponse,
  pokemonSpecies,
  pokemonEvolutionChain,
} from '../interfaces/pokemon';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PokemonService {
  private apiUrl = 'https://pokeapi.co/api/v2';
  constructor(private http: HttpClient) {}

  public getPokemonList(offset = 0, limit = 24): Observable<PokemonListResponse> {
    return this.http.get<PokemonListResponse>(
      `${this.apiUrl}/pokemon?offset=${offset}&limit=${limit}`,
    );
  }
  public getPokemonByUrl(url: string): Observable<PokemonListResponse> {
    return this.http.get<PokemonListResponse>(url);
  }
  public getPokemonDetail(url: string): Observable<PokemonDetail> {
    return this.http.get<PokemonDetail>(url);
  }
  public getAllPokemonNames(): Observable<PokemonListResponse> {
    return this.http.get<PokemonListResponse>(`${this.apiUrl}/pokemon?limit=1302&offset=0`);
  }

  public getPokemonDetailbyName(nombre: string) {
    return this.http.get<PokemonDetailPage>(`${this.apiUrl}/pokemon/${nombre}`);
  }
  public getPokemonSpeciesbyName(nombre: string) {
    return this.http.get<pokemonSpecies>(`${this.apiUrl}/pokemon-species/${nombre}`);
  }
  public getEvolutionChainByUrl(url: string) {
    return this.http.get<pokemonEvolutionChain>(url);
  }

  
}
