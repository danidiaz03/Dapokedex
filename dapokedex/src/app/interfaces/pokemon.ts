export interface PokemonListResponse {
  count: number;
  next: string;
  previous: string | null;
  results: PokemonResult[];
}

export interface PokemonResult {
  name: string;
  url: string;
}
export interface PokemonMiniatureDetail {
  id: number;
  name: string;
  img: string;
  types: {
    type: {
      name: string;
      url: string;
    };
  }[];
}

export interface PokemonDetail {
  id: number;
  name: string;
  abilities: {
    ability: {
      name: string;
    };
  }[];
  types: {
    type: {
      name: string;
      url: string;
    };
  }[];
}
export interface PokemonDetailPage {
  id: number;
  name: string;
  base_experience: number | null;
  abilities: {
    is_hidden: boolean;
    ability: {
      name: string;
      url: string;
    };
  }[];
  types: {
    type: {
      name: string;
      url: string;
    };
  }[];
  sprites: {
    front_default: string;
    other: {
      'official-artwork': {
        front_default: string;
        front_shiny: string;
      };
    };
  };
  stats: {
    base_stat: number;
    effort: number;
    stat: {
      name: string;
      url: string;
    };
  }[];
  species: { name: string; url: string };
  moves: {
    move: { name: string; url: string };
    version_group_details: {
      level_learned_at: number;
      move_learn_method: { name: string };
      version_group: { name: string; url: string };
    }[];
  }[];
  weight: number;
  height: number;
}

export interface pokemonSpecies {
  id: number;
  name: string;
  evolution_chain: {
    url: string;
  };
  flavor_text_entries: {
    flavor_text: string;
    language: { name: string };
    version: { name: string };
  }[];
  genera: { genus: string; language: { name: string } }[];
  names: LocalizedName[];
  capture_rate: number;
  base_happiness: number | null;
  /** Probabilidad de ser hembra en octavos; -1 si no tiene género. */
  gender_rate: number;
  is_legendary: boolean;
  is_mythical: boolean;
  is_baby: boolean;
  habitat: { name: string } | null;
  generation: { name: string; url: string };
  egg_groups: { name: string }[];
  varieties: { is_default: boolean; pokemon: { name: string; url: string } }[];
}

export interface LocalizedName {
  name: string;
  language: { name: string };
}

export interface PokemonAbility {
  id?: number;
  name: string;
  names: LocalizedName[];
  flavor_text_entries: { flavor_text: string; language: { name: string } }[];
  generation?: { name: string; url: string };
  pokemon?: { is_hidden: boolean; pokemon: { name: string; url: string } }[];
}

export interface PokemonMove {
  name: string;
  power: number | null;
  accuracy: number | null;
  pp: number;
  type: { name: string };
  damage_class: { name: string };
  names: { name: string; language: { name: string } }[];
  id?: number;
  priority?: number;
  effect_chance?: number | null;
  generation?: { name: string; url: string };
  flavor_text_entries?: { flavor_text: string; language: { name: string } }[];
  learned_by_pokemon?: { name: string; url: string }[];
  stat_changes?: { change: number; stat: { name: string } }[];
  target?: { name: string };
  meta?: {
    category?: { name: string };
    ailment: { name: string };
    ailment_chance: number;
    crit_rate: number;
    drain: number;
    healing: number;
    flinch_chance: number;
    stat_chance: number;
    min_hits: number | null;
    max_hits: number | null;
  } | null;
}

export interface PokemonType {
  name: string;
  damage_relations: {
    double_damage_to: { name: string }[];
    half_damage_to: { name: string }[];
    no_damage_to: { name: string }[];
    double_damage_from: { name: string }[];
    half_damage_from: { name: string }[];
    no_damage_from: { name: string }[];
  };
  pokemon: { pokemon: { name: string; url: string } }[];
}

export interface PokemonGeneration {
  id: number;
  name: string;
  pokemon_species: { name: string; url: string }[];
}

/** Nodo recursivo de una cadena evolutiva (admite ramificaciones como Eevee). */
type NamedResource = { name: string; url: string };

/** Condiciones de una evolución. PokeAPI devuelve null en las que no aplican. */
export interface EvolutionDetail {
  min_level: number | null;
  min_happiness?: number | null;
  min_affection?: number | null;
  min_beauty?: number | null;
  trigger?: { name: string };
  item?: NamedResource | null;
  held_item?: NamedResource | null;
  known_move?: NamedResource | null;
  known_move_type?: NamedResource | null;
  location?: NamedResource | null;
  party_species?: NamedResource | null;
  party_type?: NamedResource | null;
  trade_species?: NamedResource | null;
  gender?: number | null;
  time_of_day?: string;
  needs_overworld_rain?: boolean;
  turn_upside_down?: boolean;
  near_special_rock?: boolean;
  relative_physical_stats?: number | null;
  is_default?: boolean;
}

export interface EvolutionNode {
  species: { name: string; url: string };
  evolution_details: EvolutionDetail[];
  evolves_to: EvolutionNode[];
}

export interface PokemonItem {
  name: string;
  names: LocalizedName[];
  sprites: { default: string | null };
}
export interface pokemonEvolutionChain {
  chain: EvolutionNode;
}
