import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { forkJoin, of, switchMap } from 'rxjs';
import { PokemonDetailPage, pokemonEvolutionChain, pokemonSpecies } from '../../interfaces/pokemon';
import {
  PokemonService,
  cleanFlavorText,
  getIdFromUrl,
  pickLocalized,
} from '../../services/pokemon';
import { PokemonEvolution } from '../../componentes/pokemon-evolution/pokemon-evolution';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { ALL_TYPES, TypeNamePipe } from '../../pipes/type-name.pipe';
import { PokemonNamePipe } from '../../pipes/pokemon-name.pipe';

type Tab = 'about' | 'stats' | 'evolution' | 'moves';
type MoveMethod = 'level-up' | 'machine' | 'egg' | 'tutor';

interface AbilityInfo {
  name: string;
  description: string;
  hidden: boolean;
}

interface MoveRow {
  level: number;
  name: string;
  type: string;
  damageClass: string;
  power: number | null;
  accuracy: number | null;
  pp: number;
}

interface TypeMatchup {
  label: string;
  types: string[];
  tone: 'weak' | 'resist' | 'immune';
}

const STAT_LABELS: Record<string, string> = {
  hp: 'PS',
  attack: 'Ataque',
  defense: 'Defensa',
  'special-attack': 'At. Esp.',
  'special-defense': 'Def. Esp.',
  speed: 'Velocidad',
};

export const MOVE_METHODS: { id: MoveMethod; label: string }[] = [
  { id: 'level-up', label: 'Por nivel' },
  { id: 'machine', label: 'MT' },
  { id: 'egg', label: 'Huevo' },
  { id: 'tutor', label: 'Tutor' },
];

const VERSION_GROUPS: Record<string, string> = {
  champions: 'Pokémon Champions',
  'legends-za': 'Leyendas: Z-A',
  'scarlet-violet': 'Escarlata y Púrpura',
  'legends-arceus': 'Leyendas: Arceus',
  'brilliant-diamond-and-shining-pearl': 'Diamante Brillante y Perla Reluciente',
  'sword-shield': 'Espada y Escudo',
  'lets-go-pikachu-lets-go-eevee': "Let's Go, Pikachu! y Let's Go, Eevee!",
  'ultra-sun-ultra-moon': 'Ultrasol y Ultraluna',
  'sun-moon': 'Sol y Luna',
  'omega-ruby-alpha-sapphire': 'Rubí Omega y Zafiro Alfa',
  'x-y': 'X e Y',
  'black-2-white-2': 'Negro 2 y Blanco 2',
  'black-white': 'Negro y Blanco',
};

const HABITATS: Record<string, string> = {
  cave: 'Cueva',
  forest: 'Bosque',
  grassland: 'Pradera',
  mountain: 'Montaña',
  rare: 'Raro',
  'rough-terrain': 'Terreno escabroso',
  sea: 'Mar',
  urban: 'Ciudad',
  'waters-edge': 'Orilla del agua',
};

const EGG_GROUPS: Record<string, string> = {
  monster: 'Monstruo',
  water1: 'Agua 1',
  water2: 'Agua 2',
  water3: 'Agua 3',
  bug: 'Bicho',
  flying: 'Volador',
  ground: 'Campo',
  fairy: 'Hada',
  plant: 'Planta',
  humanshape: 'Humanoide',
  mineral: 'Mineral',
  indeterminate: 'Amorfo',
  ditto: 'Ditto',
  dragon: 'Dragón',
  'no-eggs': 'Desconocido',
};

// Referencia para las barras: casi ningún stat base supera 180, y así los
// valores altos (Blissey 255 PS) ya no desbordan la barra.
const STAT_BAR_MAX = 180;
// Último Pokémon con número de Pokédex nacional (las formas tienen ids > 10000).
const LAST_NATIONAL_DEX = 1025;

@Component({
  selector: 'app-pokemon-view',
  imports: [PokemonEvolution, RouterLink, TypeNamePipe, PokemonNamePipe],
  templateUrl: './pokemon-view.html',
  styleUrl: './pokemon-view.css',
})
export class PokemonView implements OnInit {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  private route = inject(ActivatedRoute);
  private service = inject(PokemonService);
  private title = inject(Title);
  private destroyRef = inject(DestroyRef);

  public pokemonName = signal('');
  public activeTab = signal<Tab>('stats');
  public pokemonDetail = signal<PokemonDetailPage | null>(null);
  public species = signal<pokemonSpecies | null>(null);
  public pokeEvolution = signal<pokemonEvolutionChain | null>(null);
  public abilities = signal<AbilityInfo[]>([]);
  public matchups = signal<TypeMatchup[]>([]);
  public isFavorite = signal(false);
  public notFound = signal(false);
  public showShiny = signal(false);

  // Movimientos
  public readonly moveMethods = MOVE_METHODS;
  public moveMethod = signal<MoveMethod>('level-up');
  public moveRows = signal<MoveRow[]>([]);
  public movesLoading = signal(false);
  private movesRequest = 0;

  /**
   * Juego más reciente en el que el Pokémon aprende movimientos por nivel.
   * Algunos grupos nuevos de PokeAPI solo traen MT o tutores y dejarían la
   * tabla vacía, así que se prioriza el último con aprendizaje por nivel.
   */
  public latestVersionGroup = computed(() => {
    let latest = { id: 0, name: '' };
    let latestAny = { id: 0, name: '' };
    for (const m of this.pokemonDetail()?.moves ?? []) {
      for (const d of m.version_group_details) {
        const id = getIdFromUrl(d.version_group.url);
        if (id > latestAny.id) latestAny = { id, name: d.version_group.name };
        if (d.move_learn_method.name === 'level-up' && id > latest.id) {
          latest = { id, name: d.version_group.name };
        }
      }
    }
    return latest.id > 0 ? latest : latestAny;
  });

  public versionGroupLabel = computed(() => {
    const name = this.latestVersionGroup().name;
    return VERSION_GROUPS[name] ?? name.replace(/-/g, ' ');
  });

  /** Cuántos movimientos aprende por cada método en ese juego. */
  public moveCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const entry of this.movesFor(null)) counts[entry.method] = (counts[entry.method] ?? 0) + 1;
    return counts;
  });

  public statTotal = computed(
    () => this.pokemonDetail()?.stats.reduce((sum, s) => sum + s.base_stat, 0) ?? 0,
  );

  public artwork = computed(() => {
    const art = this.pokemonDetail()?.sprites.other['official-artwork'];
    if (!art) return '';
    return this.showShiny() && art.front_shiny ? art.front_shiny : art.front_default;
  });

  /** Descripción de la Pokédex en español (o en inglés si no hay traducción). */
  public description = computed(() => {
    const entry = pickLocalized(this.species()?.flavor_text_entries);
    return entry ? cleanFlavorText(entry.flavor_text) : '';
  });

  public genus = computed(() => pickLocalized(this.species()?.genera)?.genus ?? '');

  /** Etiqueta especial para legendarios, singulares y bebés. */
  public rarity = computed(() => {
    const s = this.species();
    if (s?.is_mythical) return 'Singular';
    if (s?.is_legendary) return 'Legendario';
    if (s?.is_baby) return 'Bebé';
    return '';
  });

  public gender = computed(() => {
    const rate = this.species()?.gender_rate;
    if (rate === undefined) return '';
    if (rate === -1) return 'Sin género';
    const female = (rate / 8) * 100;
    return `♂ ${100 - female}% · ♀ ${female}%`;
  });

  public habitat = computed(() => {
    const habitat = this.species()?.habitat?.name;
    return habitat ? (HABITATS[habitat] ?? habitat) : '';
  });

  public eggGroups = computed(
    () => this.species()?.egg_groups.map((g) => EGG_GROUPS[g.name] ?? g.name) ?? [],
  );

  /** Formas alternativas: megaevoluciones, formas regionales, Gigamax... */
  public varieties = computed(() => {
    const species = this.species();
    if (!species || species.varieties.length < 2) return [];
    return species.varieties.map((v) => ({
      name: v.pokemon.name,
      label: v.is_default
        ? 'Normal'
        : v.pokemon.name.replace(`${species.name}-`, '').replace(/-/g, ' '),
    }));
  });

  public previousId = computed(() => {
    const id = this.dexNumber();
    return id > 1 && id <= LAST_NATIONAL_DEX ? id - 1 : null;
  });

  public nextId = computed(() => {
    const id = this.dexNumber();
    return id > 0 && id < LAST_NATIONAL_DEX ? id + 1 : null;
  });

  /** Número de Pokédex nacional (para las formas, el de su especie). */
  public dexNumber = computed(() => this.species()?.id ?? this.pokemonDetail()?.id ?? 0);

  constructor() {
    // El título se actualiza también cuando llegan los nombres en español.
    effect(() => {
      const data = this.pokemonDetail();
      if (data) this.title.setTitle(`${this.service.displayName(data.name, data.id)} · Dapokedex`);
    });
  }

  statLabel(name: string): string {
    return STAT_LABELS[name] ?? name;
  }

  statPercent(value: number): number {
    return Math.min(100, (value / STAT_BAR_MAX) * 100);
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'moves' && this.moveRows().length === 0) this.loadMoves();
  }

  setMoveMethod(method: MoveMethod): void {
    this.moveMethod.set(method);
    this.loadMoves();
  }

  /** Movimientos del Pokémon en el juego más reciente, filtrados por método. */
  private movesFor(method: MoveMethod | null) {
    const versionGroup = this.latestVersionGroup().name;
    const result: { url: string; level: number; method: string }[] = [];
    for (const m of this.pokemonDetail()?.moves ?? []) {
      const detail = m.version_group_details.find(
        (d) =>
          d.version_group.name === versionGroup &&
          (method === null || d.move_learn_method.name === method),
      );
      if (detail) {
        result.push({
          url: m.move.url,
          level: detail.level_learned_at,
          method: detail.move_learn_method.name,
        });
      }
    }
    return result;
  }

  /** Carga los datos (tipo, potencia, precisión...) de los movimientos del método elegido. */
  async loadMoves() {
    const request = ++this.movesRequest;
    const entries = this.movesFor(this.moveMethod());
    this.movesLoading.set(true);

    const rows = await Promise.all(
      entries.map(async (entry) => {
        try {
          const move = await this.service.getMove(entry.url);
          return {
            level: entry.level,
            name: pickLocalized(move.names)?.name ?? move.name.replace(/-/g, ' '),
            type: move.type.name,
            damageClass: move.damage_class.name,
            power: move.power,
            accuracy: move.accuracy,
            pp: move.pp,
          } as MoveRow;
        } catch {
          return null;
        }
      }),
    );

    // Si el usuario cambió de pestaña o de Pokémon mientras cargaba, descartamos.
    if (request !== this.movesRequest) return;
    this.moveRows.set(
      rows
        .filter((r): r is MoveRow => r !== null)
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    );
    this.movesLoading.set(false);
  }

  ngOnInit(): void {
    // switchMap cancela la petición anterior si se navega rápido entre Pokémon.
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const name = params.get('name') ?? '';
          this.pokemonName.set(name);
          this.pokemonDetail.set(null);
          this.species.set(null);
          this.pokeEvolution.set(null);
          this.abilities.set([]);
          this.matchups.set([]);
          this.notFound.set(false);
          this.showShiny.set(false);
          this.moveRows.set([]);
          this.moveMethod.set('level-up');
          this.movesRequest++;
          this.isFavorite.set(false);
          return this.service.getPokemonDetailbyName(name.toLowerCase());
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: async (data) => {
          this.pokemonDetail.set(data);
          this.loadSpecies(data);
          this.loadAbilities(data);
          this.loadMatchups(data.types.map((t) => t.type.name));

          const userId = (await this.authService.waitForUser())?.uid;
          if (userId) {
            const favs = await this.firestoreService.getFavorites(userId);
            this.isFavorite.set(favs.includes(data.id));
          }
        },
        error: () => this.notFound.set(true),
      });
  }

  async toggleFavorite(): Promise<void> {
    const userId = this.authService.currentUser()?.uid;
    const pokemonId = this.pokemonDetail()?.id;
    if (!userId || !pokemonId) return;

    const wasFavorite = this.isFavorite();
    this.isFavorite.set(!wasFavorite);
    try {
      if (wasFavorite) await this.firestoreService.removeFavorite(userId, pokemonId);
      else await this.firestoreService.addFavorite(userId, pokemonId);
    } catch {
      this.isFavorite.set(wasFavorite);
    }
  }

  playCry(): void {
    const id = this.pokemonDetail()?.id;
    if (!id) return;
    const audio = new Audio(
      `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`,
    );
    audio.volume = 0.5;
    audio.play().catch(() => {});
  }

  private loadSpecies(data: PokemonDetailPage) {
    // Usamos la URL de la especie del propio Pokémon: el nombre de la ruta puede
    // ser una forma (p. ej. deoxys-normal) que no existe como especie.
    this.service
      .getSpeciesByUrl(data.species.url)
      .pipe(
        switchMap((species) => {
          this.species.set(species);
          return species.evolution_chain
            ? this.service.getEvolutionChainByUrl(species.evolution_chain.url)
            : of(null);
        }),
      )
      .subscribe({ next: (chain) => this.pokeEvolution.set(chain) });
  }

  /** Nombre y descripción de cada habilidad en español. */
  private loadAbilities(data: PokemonDetailPage) {
    if (data.abilities.length === 0) return;
    forkJoin(data.abilities.map((a) => this.service.getAbility(a.ability.url))).subscribe({
      next: (abilities) =>
        this.abilities.set(
          abilities.map((ability, i) => {
            const flavor = pickLocalized(ability.flavor_text_entries)?.flavor_text;
            return {
              name: pickLocalized(ability.names)?.name ?? ability.name.replace(/-/g, ' '),
              description: flavor ? cleanFlavorText(flavor) : '',
              hidden: data.abilities[i].is_hidden,
            };
          }),
        ),
      // Si falla mostramos al menos los nombres que vienen en el propio Pokémon.
      error: () =>
        this.abilities.set(
          data.abilities.map((a) => ({
            name: a.ability.name.replace(/-/g, ' '),
            description: '',
            hidden: a.is_hidden,
          })),
        ),
    });
  }

  /**
   * Calcula cuánto daño recibe el Pokémon de cada tipo combinando las
   * relaciones de daño de sus tipos (p. ej. Charizard recibe x4 de Roca).
   */
  private async loadMatchups(defenderTypes: string[]) {
    try {
      const typeData = await Promise.all(defenderTypes.map((t) => this.service.getType(t)));
      const multipliers = ALL_TYPES.map((attacking) => {
        let multiplier = 1;
        for (const { damage_relations: r } of typeData) {
          if (r.double_damage_from.some((t) => t.name === attacking)) multiplier *= 2;
          if (r.half_damage_from.some((t) => t.name === attacking)) multiplier *= 0.5;
          if (r.no_damage_from.some((t) => t.name === attacking)) multiplier *= 0;
        }
        return { type: attacking, multiplier };
      });

      const group = (value: number) =>
        multipliers.filter((m) => m.multiplier === value).map((m) => m.type);

      const matchups: TypeMatchup[] = [
        { label: 'Muy débil (x4)', types: group(4), tone: 'weak' as const },
        { label: 'Débil (x2)', types: group(2), tone: 'weak' as const },
        { label: 'Resistente (x½)', types: group(0.5), tone: 'resist' as const },
        { label: 'Muy resistente (x¼)', types: group(0.25), tone: 'resist' as const },
        { label: 'Inmune (x0)', types: group(0), tone: 'immune' as const },
      ].filter((m) => m.types.length > 0);

      this.matchups.set(matchups);
    } catch {
      this.matchups.set([]);
    }
  }
}
