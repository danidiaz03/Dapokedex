import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EvolutionNode, LocalizedName, pokemonEvolutionChain } from '../../interfaces/pokemon';
import { PokemonService, getArtworkUrl, getIdFromUrl, pickLocalized } from '../../services/pokemon';
import { TypeNamePipe } from '../../pipes/type-name.pipe';
import { RequirementPart, describeEvolution, pickEvolutionDetail } from './evolution-requirements';

interface EvolutionStep {
  id: number;
  name: string;
  img: string;
  requirement: string;
  parts: RequirementPart[];
  types: string[];
}

type Resource = { name: string; url: string };

@Component({
  selector: 'app-pokemon-evolution',
  imports: [RouterLink, TypeNamePipe],
  templateUrl: './pokemon-evolution.html',
  styleUrl: './pokemon-evolution.css',
})
export class PokemonEvolution {
  private service = inject(PokemonService);

  evolution = input.required<pokemonEvolutionChain>();
  pokemonId = input.required<number>();

  /** Nombres en español de especies, objetos y movimientos, indexados por URL. */
  private names = signal<Record<string, string>>({});
  /** Tipos de cada especie de la cadena, indexados por id. */
  private types = signal<Record<number, string[]>>({});

  constructor() {
    // Las traducciones y los tipos llegan después: la cadena se pinta al
    // momento con los nombres en inglés y se completa al cargar.
    effect(() => this.loadExtras(this.evolution().chain));
  }

  /**
   * Agrupa la cadena por etapas. Cada etapa puede tener varias ramas
   * (p. ej. Eevee → Vaporeon/Jolteon/Flareon...).
   */
  stages = computed<EvolutionStep[][]>(() => {
    const names = this.names();
    const types = this.types();
    const translate = (r: Resource) => names[r.url] ?? r.name.replace(/-/g, ' ');

    const stages: EvolutionStep[][] = [];
    let current: EvolutionNode[] = [this.evolution().chain];
    let depth = 0;

    while (current.length > 0) {
      stages.push(
        current.map((node) => {
          const id = getIdFromUrl(node.species.url);
          const parts =
            depth === 0
              ? [{ text: 'Base' }]
              : describeEvolution(pickEvolutionDetail(node.evolution_details), translate);
          return {
            id,
            name: translate(node.species),
            img: getArtworkUrl(id),
            parts,
            requirement: parts.map((p) => p.text).join(' · '),
            types: types[id] ?? [],
          };
        }),
      );
      current = current.flatMap((node) => node.evolves_to);
      depth++;
    }
    return stages;
  });

  private async loadExtras(chain: EvolutionNode) {
    const species: Resource[] = [];
    const items: Resource[] = [];
    const moves: Resource[] = [];

    const walk = (node: EvolutionNode) => {
      species.push(node.species);
      const detail = pickEvolutionDetail(node.evolution_details);
      if (detail?.item) items.push(detail.item);
      if (detail?.held_item) items.push(detail.held_item);
      if (detail?.known_move) moves.push(detail.known_move);
      if (detail?.trade_species) species.push(detail.trade_species);
      if (detail?.party_species) species.push(detail.party_species);
      node.evolves_to.forEach(walk);
    };
    walk(chain);

    const settle = <T>(promise: Promise<T>) => promise.catch(() => null);

    const [speciesData, itemData, moveData, pokemonData] = await Promise.all([
      Promise.all(species.map((s) => settle(firstValueFrom(this.service.getSpeciesByUrl(s.url))))),
      Promise.all(items.map((i) => settle(firstValueFrom(this.service.getItem(i.url))))),
      Promise.all(moves.map((m) => settle(this.service.getMove(m.url)))),
      Promise.all(this.collectIds(chain).map((id) => settle(this.service.getPokemon(id)))),
    ]);

    // Si mientras tanto se ha cambiado a otra cadena, no pisamos sus datos.
    if (this.evolution().chain !== chain) return;

    const names: Record<string, string> = {};
    const add = (resources: Resource[], data: ({ names: LocalizedName[] } | null)[]) =>
      resources.forEach((r, i) => {
        const name = pickLocalized(data[i]?.names)?.name;
        if (name) names[r.url] = name;
      });
    add(species, speciesData);
    add(items, itemData);
    add(moves, moveData);
    this.names.set(names);

    const types: Record<number, string[]> = {};
    for (const pokemon of pokemonData) {
      if (pokemon) types[pokemon.id] = pokemon.types.map((t) => t.type.name);
    }
    this.types.set(types);
  }

  private collectIds(node: EvolutionNode): number[] {
    return [getIdFromUrl(node.species.url), ...node.evolves_to.flatMap((n) => this.collectIds(n))];
  }
}
