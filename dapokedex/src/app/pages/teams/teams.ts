import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { FirestoreService, MAX_TEAM_SIZE } from '../../services/firestore.service';
import { PokemonService, getArtworkUrl } from '../../services/pokemon';
import { CombatantBuilder } from '../../services/combatant-builder.service';
import { ItemService } from '../../services/item.service';
import { PokemonDetailPage } from '../../interfaces/pokemon';
import { TypeNamePipe } from '../../pipes/type-name.pipe';
import { BattleMove, NatureStat, calcHp, calcStat } from '../../game/battle-engine';
import { Bag, Held, available, itemDescription } from '../../game/bag';
import { pokemonLevel } from '../../game/pokemon-levels';
import {
  Build,
  Builds,
  MAX_MOVES,
  MAX_SAVED_TEAMS,
  Nature,
  STAT_LABEL,
  SavedTeam,
  ivPercent,
  ivsFor,
  moveMember,
  natureFor,
  newTeamId,
} from '../../game/builds';

const SPRITE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

const STAT_KEYS: ('hp' | NatureStat)[] = [
  'hp',
  'attack',
  'defense',
  'specialAttack',
  'specialDefense',
  'speed',
];
const API_STAT: Record<'hp' | NatureStat, string> = {
  hp: 'hp',
  attack: 'attack',
  defense: 'defense',
  specialAttack: 'special-attack',
  specialDefense: 'special-defense',
  speed: 'speed',
};

/** Qué equipo se está editando: el principal o uno guardado. */
type Editing = 'main' | string;

interface StatRow {
  key: 'hp' | NatureStat;
  label: string;
  base: number;
  iv: number;
  value: number;
  mark: 'up' | 'down' | null;
}

/**
 * Preparación de equipos: el equipo principal y hasta 5 guardados, con el
 * orden, los movimientos, la habilidad y el objeto de cada Pokémon.
 */
@Component({
  selector: 'app-teams',
  imports: [FormsModule, RouterLink, TypeNamePipe],
  templateUrl: './teams.html',
  styleUrl: './teams.css',
})
export class Teams implements OnInit {
  private auth = inject(AuthService);
  private firestore = inject(FirestoreService);
  private pokemon = inject(PokemonService);
  private builder = inject(CombatantBuilder);
  items = inject(ItemService);

  readonly maxTeam = MAX_TEAM_SIZE;
  readonly maxSaved = MAX_SAVED_TEAMS;
  readonly maxMoves = MAX_MOVES;

  uid = '';
  loading = signal(true);
  error = signal('');
  notice = signal('');

  collection = signal<number[]>([]);
  details = signal<Record<number, PokemonDetailPage>>({});
  xp = signal<Record<number, number>>({});
  mainTeam = signal<number[]>([]);
  savedTeams = signal<SavedTeam[]>([]);
  builds = signal<Builds>({});
  bag = signal<Bag>({});
  held = signal<Held>({});

  editing = signal<Editing>('main');
  members = computed(() =>
    this.editing() === 'main'
      ? this.mainTeam()
      : (this.savedTeams().find((t) => t.id === this.editing())?.members ?? []),
  );
  editingTeam = computed(() => this.savedTeams().find((t) => t.id === this.editing()) ?? null);

  // Selector de Pokémon para añadir.
  picking = signal(false);
  pickSearch = signal('');
  pickable = computed(() => {
    const term = this.pickSearch().trim().toLowerCase();
    const inTeam = new Set(this.members());
    return this.collection()
      .filter((id) => !inTeam.has(id))
      .filter((id) => !term || this.nameOf(id).toLowerCase().includes(term) || `${id}` === term)
      .slice(0, 120);
  });

  // Pokémon abierto en el editor.
  selected = signal<number | null>(null);
  learnable = signal<BattleMove[]>([]);
  loadingMoves = signal(false);
  abilities = signal<{ key: string; name: string; hidden: boolean }[]>([]);
  draftMoves = signal<string[]>([]);
  draftAbility = signal('');
  moveSearch = signal('');
  moveType = signal('');
  saving = signal(false);

  selectedData = computed(() => {
    const id = this.selected();
    return id ? (this.details()[id] ?? null) : null;
  });
  nature = computed<Nature | null>(() => {
    const id = this.selected();
    return id ? natureFor(this.uid, id) : null;
  });
  ivTotal = computed(() => {
    const id = this.selected();
    return id ? ivPercent(ivsFor(this.uid, id)) : 0;
  });
  statRows = computed<StatRow[]>(() => {
    const id = this.selected();
    const data = this.selectedData();
    if (!id || !data) return [];
    const ivs = ivsFor(this.uid, id);
    const nature = natureFor(this.uid, id);
    const level = this.level(id);
    return STAT_KEYS.map((key) => {
      const base = data.stats.find((s) => s.stat.name === API_STAT[key])?.base_stat ?? 50;
      const mark =
        key !== 'hp' && nature.up === key && nature.down !== key
          ? 'up'
          : key !== 'hp' && nature.down === key && nature.up !== key
            ? 'down'
            : null;
      const mult = mark === 'up' ? 1.1 : mark === 'down' ? 0.9 : 1;
      return {
        key,
        label: STAT_LABEL[key],
        base,
        iv: ivs[key],
        value: key === 'hp' ? calcHp(base, level, ivs.hp) : calcStat(base, level, ivs[key], mult),
        mark,
      };
    });
  });
  chosenMoves = computed(() =>
    this.draftMoves()
      .map((k) => this.learnable().find((m) => m.key === k))
      .filter((m): m is BattleMove => !!m),
  );
  emptyMoveSlots = computed(() => Array.from({ length: MAX_MOVES - this.draftMoves().length }));
  moveTypes = computed(() => [...new Set(this.learnable().map((m) => m.type))].sort());
  filteredMoves = computed(() => {
    const term = this.moveSearch().trim().toLowerCase();
    return this.learnable().filter(
      (m) =>
        (!this.moveType() || m.type === this.moveType()) &&
        (!term || m.name.toLowerCase().includes(term)),
    );
  });
  buildChanged = computed(() => {
    const id = this.selected();
    if (!id) return false;
    const saved = this.builds()[id];
    return (
      JSON.stringify(saved?.moves ?? []) !== JSON.stringify(this.draftMoves()) ||
      (saved?.ability ?? '') !== this.draftAbility()
    );
  });

  /** Objetos que se le pueden equipar (solo en el equipo principal). */
  itemOptions = computed(() => {
    const id = this.selected();
    if (!id) return [];
    return Object.keys(this.bag())
      .filter((k) => this.held()[id] === k || available(this.bag(), this.held(), k) > 0)
      .sort((a, b) => this.items.label(a).localeCompare(this.items.label(b)));
  });

  async ngOnInit() {
    const user = await this.auth.waitForUser();
    if (!user) return;
    this.uid = user.uid;
    this.pokemon.loadSpeciesNames();
    try {
      const data = await this.firestore.getUserData(user.uid);
      this.collection.set(data.collection);
      this.xp.set(data.pokemonXp);
      this.mainTeam.set(data.team);
      this.savedTeams.set(data.savedTeams);
      this.builds.set(data.builds);
      this.bag.set(data.bag);
      this.held.set(data.held);
      const list = await this.pokemon.getPokemons(data.collection);
      this.details.set(Object.fromEntries(list.map((p) => [p.id, p])));
    } catch (e) {
      console.warn(e);
      this.error.set('No se pudieron cargar tus Pokémon. Revisa tu conexión.');
    }
    this.loading.set(false);
  }

  // --- Ayudas -------------------------------------------------------------

  nameOf(id: number): string {
    const d = this.details()[id];
    return d ? this.pokemon.displayName(d.name, id) : `#${id}`;
  }

  sprite(id: number): string {
    return `${SPRITE_URL}/${id}.png`;
  }

  artwork(id: number): string {
    return getArtworkUrl(id);
  }

  level(id: number): number {
    return pokemonLevel(this.xp()[id] ?? 0);
  }

  natureOf(id: number): Nature {
    return natureFor(this.uid, id);
  }

  natureShort(n: Nature): string {
    if (!n.up) return `${n.name} · neutra`;
    return `${n.name} · +${STAT_LABEL[n.up]} −${STAT_LABEL[n.down!]}`;
  }

  statLabel(key: NatureStat): string {
    return STAT_LABEL[key];
  }

  isConfigured(id: number): boolean {
    return !!this.builds()[id];
  }

  itemDescription(key: string): string {
    return itemDescription(key);
  }

  statWidth(value: number): number {
    return Math.min(100, Math.round((value / 400) * 100));
  }

  private flash(text: string) {
    this.notice.set(text);
    setTimeout(() => this.notice() === text && this.notice.set(''), 2500);
  }

  // --- Equipos ------------------------------------------------------------

  edit(team: Editing) {
    this.editing.set(team);
    this.selected.set(null);
    this.picking.set(false);
  }

  /** Guarda la nueva lista de miembros del equipo que se está editando. */
  private async setMembers(members: number[]) {
    const editing = this.editing();
    try {
      if (editing === 'main') {
        this.mainTeam.set(members);
        await this.firestore.setTeam(this.uid, members);
        // Los que salen del equipo principal sueltan su objeto.
        this.held.update((h) =>
          Object.fromEntries(Object.entries(h).filter(([id]) => members.includes(Number(id)))),
        );
      } else {
        const teams = this.savedTeams().map((t) => (t.id === editing ? { ...t, members } : t));
        this.savedTeams.set(teams);
        await this.firestore.saveTeams(this.uid, teams);
      }
    } catch (e) {
      console.warn(e);
      this.error.set('No se pudo guardar el equipo.');
    }
  }

  add(id: number) {
    if (this.members().length >= MAX_TEAM_SIZE) return;
    this.setMembers([...this.members(), id]);
    this.picking.set(false);
    this.pickSearch.set('');
  }

  remove(id: number) {
    if (this.selected() === id) this.selected.set(null);
    this.setMembers(this.members().filter((m) => m !== id));
  }

  shift(index: number, delta: -1 | 1) {
    this.setMembers(moveMember(this.members(), index, delta));
  }

  async newTeam() {
    if (this.savedTeams().length >= MAX_SAVED_TEAMS) return;
    const team: SavedTeam = {
      id: newTeamId(),
      name: `Equipo ${this.savedTeams().length + 1}`,
      members: [...this.mainTeam()],
    };
    const teams = [...this.savedTeams(), team];
    this.savedTeams.set(teams);
    this.edit(team.id);
    await this.firestore
      .saveTeams(this.uid, teams)
      .catch(() => this.error.set('No se pudo crear.'));
  }

  async rename(name: string) {
    const id = this.editing();
    const clean = name.trim().slice(0, 24);
    if (id === 'main' || !clean) return;
    const teams = this.savedTeams().map((t) => (t.id === id ? { ...t, name: clean } : t));
    this.savedTeams.set(teams);
    await this.firestore.saveTeams(this.uid, teams).catch(() => {});
  }

  confirmDelete = signal(false);

  async deleteTeam() {
    const id = this.editing();
    if (id === 'main') return;
    if (!this.confirmDelete()) {
      this.confirmDelete.set(true);
      setTimeout(() => this.confirmDelete.set(false), 4000);
      return;
    }
    this.confirmDelete.set(false);
    const teams = this.savedTeams().filter((t) => t.id !== id);
    this.savedTeams.set(teams);
    this.edit('main');
    await this.firestore.saveTeams(this.uid, teams).catch(() => {});
  }

  /** Pasa un equipo guardado a ser el principal (el que se usa contra la máquina). */
  async useAsMain() {
    const team = this.editingTeam();
    if (!team || team.members.length === 0) return;
    this.mainTeam.set(team.members);
    await this.firestore.setTeam(this.uid, team.members).catch(() => {});
    this.held.update((h) =>
      Object.fromEntries(Object.entries(h).filter(([id]) => team.members.includes(Number(id)))),
    );
    this.flash(`«${team.name}» es ahora tu equipo principal.`);
  }

  // --- Editor de un Pokémon -------------------------------------------------

  async open(id: number) {
    if (this.selected() === id) {
      this.selected.set(null);
      return;
    }
    this.selected.set(id);
    this.moveSearch.set('');
    this.moveType.set('');
    const build = this.builds()[id];
    this.draftMoves.set(build?.moves ?? []);
    this.draftAbility.set(build?.ability ?? '');
    const data = this.details()[id];
    if (!data) return;

    this.abilities.set(
      data.abilities.map((a) => ({
        key: a.ability.name,
        name: a.ability.name.replace(/-/g, ' '),
        hidden: a.is_hidden,
      })),
    );
    Promise.all(data.abilities.map((a) => this.builder.abilityInfo(a.ability.name))).then(
      (names) => {
        if (this.selected() !== id) return;
        this.abilities.update((list) =>
          list.map((a) => ({ ...a, name: names.find((n) => n.key === a.key)?.name ?? a.name })),
        );
      },
    );

    this.learnable.set([]);
    this.loadingMoves.set(true);
    const moves = await this.builder.learnableMoves(data);
    if (this.selected() !== id) return;
    this.learnable.set(moves);
    this.loadingMoves.set(false);
  }

  toggleMove(key: string) {
    const moves = this.draftMoves();
    if (moves.includes(key)) this.draftMoves.set(moves.filter((m) => m !== key));
    else if (moves.length < MAX_MOVES) this.draftMoves.set([...moves, key]);
  }

  async saveBuild() {
    const id = this.selected();
    if (!id || this.draftMoves().length === 0) return;
    const build: Build = { moves: this.draftMoves(), ability: this.draftAbility() };
    this.saving.set(true);
    try {
      await this.firestore.saveBuild(this.uid, id, build);
      this.builds.update((b) => ({ ...b, [id]: build }));
      this.flash(`${this.nameOf(id)} está listo para combatir.`);
    } catch (e) {
      console.warn(e);
      this.error.set('No se pudo guardar la configuración.');
    }
    this.saving.set(false);
  }

  /** Vuelve a elegir movimientos y habilidad al azar en cada combate. */
  async resetBuild() {
    const id = this.selected();
    if (!id) return;
    await this.firestore.resetBuild(this.uid, id).catch(() => {});
    this.builds.update((b) => {
      const next = { ...b };
      delete next[id];
      return next;
    });
    this.draftMoves.set([]);
    this.draftAbility.set('');
  }

  async equip(key: string) {
    const id = this.selected();
    if (!id || this.editing() !== 'main') return;
    const value = key || null;
    try {
      await this.firestore.equipItem(this.uid, id, value);
      this.held.update((h) => {
        const next = { ...h };
        if (value) next[id] = value;
        else delete next[id];
        return next;
      });
    } catch {
      this.error.set('No se pudo equipar el objeto.');
    }
  }
}
