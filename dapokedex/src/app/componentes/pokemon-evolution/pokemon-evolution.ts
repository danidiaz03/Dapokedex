import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EvolutionNode, pokemonEvolutionChain } from '../../interfaces/pokemon';
import { getArtworkUrl, getIdFromUrl } from '../../services/pokemon';

interface EvolutionStep {
  id: number;
  name: string;
  img: string;
  requirement: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  'use-item': 'Objeto',
  trade: 'Intercambio',
  'level-up': 'Subir nivel',
  shed: 'Muda',
  spin: 'Girar',
  'three-critical-hits': '3 críticos',
  'take-damage': 'Daño',
  other: 'Especial',
};

@Component({
  selector: 'app-pokemon-evolution',
  imports: [RouterLink],
  templateUrl: './pokemon-evolution.html',
  styleUrl: './pokemon-evolution.css',
})
export class PokemonEvolution {
  evolution = input.required<pokemonEvolutionChain>();
  pokemonId = input.required<number>();

  /**
   * Agrupa la cadena por etapas. Cada etapa puede tener varias ramas
   * (p. ej. Eevee → Vaporeon/Jolteon/Flareon...). Antes solo se mostraba
   * la primera rama y la vista fallaba con Pokémon sin evolución.
   */
  stages = computed<EvolutionStep[][]>(() => {
    const stages: EvolutionStep[][] = [];
    let current: EvolutionNode[] = [this.evolution().chain];
    let depth = 0;

    while (current.length > 0) {
      stages.push(current.map((node) => this.toStep(node, depth)));
      current = current.flatMap((node) => node.evolves_to);
      depth++;
    }
    return stages;
  });

  private toStep(node: EvolutionNode, depth: number): EvolutionStep {
    const id = getIdFromUrl(node.species.url);
    return {
      id,
      name: node.species.name,
      img: getArtworkUrl(id),
      requirement: depth === 0 ? 'Base' : this.getRequirement(node),
    };
  }

  private getRequirement(node: EvolutionNode): string {
    const detail = node.evolution_details[0];
    if (!detail) return '—';
    if (detail.min_level) return `Nv. ${detail.min_level}`;
    return TRIGGER_LABELS[detail.trigger?.name ?? 'other'] ?? 'Especial';
  }
}
