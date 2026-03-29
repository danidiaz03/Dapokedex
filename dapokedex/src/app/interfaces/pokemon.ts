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
  weight: string;
  height: number;
}

export interface pokemonSpecies {
  evolution_chain: {
    url: string;
  };
}
export interface pokemonEvolutionChain {
  chain: {
    evolution_details: {
      min_level: number;
    }[];
    species: { name: string; url: string };
    evolves_to: {
      species: { name: string; url: string };
      evolves_to: {
        species: { name: string; url: string };
        evolves_to: any[];
        evolution_details: {
          min_level: number;
        }[];
      }[];
      evolution_details: {
        min_level: number;
      }[];
    }[];
  };
}
