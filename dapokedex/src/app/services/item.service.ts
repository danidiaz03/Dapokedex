import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PokemonService } from './pokemon';
import { itemSprite } from '../game/bag';

/** Nombres en español de los objetos, leídos de PokeAPI y guardados en memoria. */
@Injectable({ providedIn: 'root' })
export class ItemService {
  private pokemon = inject(PokemonService);
  private names = signal<Record<string, string>>({});
  private requested = new Set<string>();

  /** Nombre para mostrar; si aún no ha llegado, uno provisional a partir de la clave. */
  label(key: string): string {
    this.load(key);
    return this.names()[key] ?? key.replace(/-/g, ' ');
  }

  async name(key: string): Promise<string> {
    await this.load(key);
    return this.names()[key] ?? key.replace(/-/g, ' ');
  }

  sprite(key: string): string {
    return itemSprite(key);
  }

  private async load(key: string): Promise<void> {
    if (this.requested.has(key)) return;
    this.requested.add(key);
    const data = await firstValueFrom(
      this.pokemon.getItem(`https://pokeapi.co/api/v2/item/${key}`),
    ).catch(() => null);
    const es = data?.names.find((n) => n.language.name === 'es')?.name;
    if (es) this.names.update((n) => ({ ...n, [key]: es }));
  }
}
