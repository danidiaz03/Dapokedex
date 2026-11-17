import { Pipe, PipeTransform } from '@angular/core';

/** Nombres oficiales en español de los 18 tipos (PokeAPI los devuelve en inglés). */
export const TYPE_NAMES_ES: Record<string, string> = {
  normal: 'Normal',
  fire: 'Fuego',
  water: 'Agua',
  grass: 'Planta',
  electric: 'Eléctrico',
  ice: 'Hielo',
  fighting: 'Lucha',
  poison: 'Veneno',
  ground: 'Tierra',
  flying: 'Volador',
  psychic: 'Psíquico',
  bug: 'Bicho',
  rock: 'Roca',
  ghost: 'Fantasma',
  dragon: 'Dragón',
  dark: 'Siniestro',
  steel: 'Acero',
  fairy: 'Hada',
  stellar: 'Astral',
};

export const ALL_TYPES = Object.keys(TYPE_NAMES_ES).filter((t) => t !== 'stellar');

@Pipe({ name: 'tipo' })
export class TypeNamePipe implements PipeTransform {
  transform(type: string | null | undefined): string {
    if (!type) return '';
    return TYPE_NAMES_ES[type] ?? type;
  }
}
