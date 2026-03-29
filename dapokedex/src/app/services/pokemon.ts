import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

import { PokemonDetail, PokemonListResponse } from '../interfaces/pokemon';
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
}
