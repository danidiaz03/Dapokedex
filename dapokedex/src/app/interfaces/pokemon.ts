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
  moves: { move: { name: string; url: string } }[];
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
}

export interface PokemonMove {
  name: string;
  power: number | null;
  accuracy: number | null;
  pp: number;
  type: { name: string };
  damage_class: { name: string };
}

export interface PokemonType {
  name: string;
  damage_relations: {
    double_damage_to: { name: string }[];
    half_damage_to: { name: string }[];
    no_damage_to: { name: string }[];
  };
}

/** Nodo recursivo de una cadena evolutiva (admite ramificaciones como Eevee). */
export interface EvolutionNode {
  species: { name: string; url: string };
  evolution_details: { min_level: number | null; trigger?: { name: string } }[];
  evolves_to: EvolutionNode[];
}
export interface pokemonEvolutionChain {
  chain: EvolutionNode;
}
