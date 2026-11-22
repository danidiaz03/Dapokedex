import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { FirestoreService } from '../../../services/firestore.service';
import { PokemonService, getArtworkUrl, playPokemonCry } from '../../../services/pokemon';
import { PokemonDetailPage } from '../../../interfaces/pokemon';
import { TypeNamePipe } from '../../../pipes/type-name.pipe';
import { PokemonNamePipe } from '../../../pipes/pokemon-name.pipe';
import { ProgressService } from '../../../services/progress.service';
import { KeyboardService } from '../../../services/keyboard.service';
import { EvolutionService } from '../../../services/evolution.service';
import { baseStatTotal, pickBalancedEnemies } from '../../../game/matchmaking';
import { EvolveDialog } from '../../../componentes/evolve-dialog/evolve-dialog';
import {
  EvolutionOption,
  MAX_LEVEL,
  availableEvolutions,
  battleXp,
  pokemonLevel,
} from '../../../game/pokemon-levels';
import {
  Action,
  BattleEvent,
  BattleMove,
  BattleState,
  Combatant,
  STATUS_LABEL,
  SideKey,
  StatKey,
  activeOf,
  allowedMoves,
  beginBattle,
  weatherOf,
  chooseEnemyAction,
  chooseEnemyReplacement,
  createCombatant,
  hasAlive,
  hasUsableMoves,
  isSupportedMove,
  resolveTurn,
  switchIn,
  toBattleMove,
} from '../../../game/battle-engine';
import {
  HELD_ITEMS,
  SIMULATED_ABILITIES,
  TYPE_BOOST_ITEMS,
  WEATHER_ABILITIES,
  WEATHER_ROCKS,
  WEATHER_TEXT,
} from '../../../game/battle-data';
import {
  Reward,
  SHINY_CHANCE,
  levelFromXp,
  maxEnemyId,
  xpFromRewards,
} from '../../../game/progress';

const SHINY_ARTWORK_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny';

/** Cómo ha crecido cada Pokémon del equipo tras la batalla. */
interface TeamGrowth {
  id: number;
  name: string;
  xp: number;
  gained: number;
  levelBefore: number;
  levelAfter: number;
  evolutions: EvolutionOption[];
}

type BattlePhase = 'preview' | 'battle' | 'select-pokemon' | 'result';

// Cuántos movimientos del Pokémon consultamos para elegir 4 que tengan sentido.
const MOVE_SAMPLE_SIZE = 18;
// Candidatos consultados por cada rival para poder elegir uno equilibrado.
const CANDIDATES_PER_ENEMY = 5;

const STAGE_SHORT: Partial<Record<StatKey, string>> = {
  attack: 'Ata',
  defense: 'Def',
  specialAttack: 'At.Esp',
  specialDefense: 'Df.Esp',
  speed: 'Vel',
  accuracy: 'Prec',
  evasion: 'Eva',
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Elige al azar según los pesos. */
function weighted<T>(options: [T, number][]): T {
  const total = options.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [value, w] of options) {
    r -= w;
    if (r <= 0) return value;
  }
  return options[options.length - 1][0];
}

@Component({
  selector: 'app-battle',
  imports: [TypeNamePipe, PokemonNamePipe, EvolveDialog, NgTemplateOutlet],
  templateUrl: './battle.html',
  styleUrl: './battle.css',
})
export class Battle implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  private pokemonService = inject(PokemonService);
  private router = inject(Router);
  private keyboard = inject(KeyboardService);
  private unregisterKeys?: () => void;
  private progressService = inject(ProgressService);
  private evolutionService = inject(EvolutionService);

  /** Estado completo del combate; todo lo demás se deriva de aquí. */
  state = signal<BattleState | null>(null);
  playerTeam = computed(() => this.state()?.player.team ?? []);
  enemyTeam = computed(() => this.state()?.enemy.team ?? []);
  activePokemon = computed(() => {
    const s = this.state();
    return s ? activeOf(s, 'player') : null;
  });
  activeEnemy = computed(() => {
    const s = this.state();
    return s ? activeOf(s, 'enemy') : null;
  });

  phase = signal<BattlePhase>('preview');
  /** Mientras se reproducen los sucesos de un turno no se puede elegir nada. */
  busy = signal(false);
  /** Lista de Pokémon abierta para cambiar voluntariamente. */
  switching = signal(false);
  isPlayerTurn = computed(() => this.phase() === 'battle' && !this.busy());
  message = signal('');

  playerWon = signal(false);
  loading = signal(true);
  loadError = signal('');
  newCaptures = signal<number[]>([]);

  playerShaking = signal(false);
  enemyShaking = signal(false);
  playerFlashing = signal(false);
  enemyFlashing = signal(false);
  playerFainting = signal(false);
  enemyFainting = signal(false);
  /** Recompensas de la última batalla para el resumen final. */
  rewards = signal<Reward[]>([]);
  rewardXp = signal(0);
  /** Experiencia de cada Pokémon del equipo (para su nivel). */
  teamXp = signal<Record<number, number>>({});
  teamGrowth = signal<TeamGrowth[]>([]);
  evolving = signal<TeamGrowth | null>(null);
  /** Rivales derrotados por cada Pokémon del jugador en esta batalla. */
  private koBy = new Map<number, number>();

  private audioCtx: AudioContext | null = null;
  /** Cambia al salir o reiniciar: la reproducción en curso se detiene sola. */
  private run = 0;
  private destroyed = false;

  statusText(p: Combatant): string {
    return p.status ? STATUS_LABEL[p.status] : '';
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.run++;
    this.unregisterKeys?.();
    this.audioCtx?.close().catch(() => {});
  }

  async ngOnInit() {
    this.unregisterKeys = this.keyboard.register(
      (e) => this.onKey(e),
      [
        { keys: ['A'], label: 'Empezar / nueva batalla (Intro)' },
        { keys: ['1', '2', '3', '4'], label: 'Movimiento' },
        { keys: ['C'], label: 'Cambiar de Pokémon' },
        { keys: ['1', '…', '6'], label: 'Elegir Pokémon' },
      ],
      'Batalla',
    );
    await this.loadBattle();
  }

  /* ------------------------------------------------------------------ */
  /* Teclado                                                             */
  /* ------------------------------------------------------------------ */

  private onKey(e: KeyboardEvent): boolean {
    const phase = this.phase();
    const n = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1;
    if (e.key === 'Enter' || e.key === ' ') {
      if (this.loading()) return false;
      if (phase === 'preview') {
        this.startBattle();
        return true;
      }
      if (phase === 'result') {
        this.newBattle();
        return true;
      }
      return false;
    }
    if (phase === 'battle' && e.key.toLowerCase() === 'c') {
      if (this.isPlayerTurn()) this.switching.update((v) => !v);
      return true;
    }
    if (phase === 'battle' && this.switching() && e.key === 'Escape') {
      this.switching.set(false);
      return true;
    }
    if (n < 0) return false;
    if (phase === 'battle') {
      if (!this.isPlayerTurn()) return true;
      if (this.switching()) {
        this.switchTo(n);
        return true;
      }
      const pokemon = this.activePokemon()!;
      if (!hasUsableMoves(pokemon)) {
        this.useStruggle();
        return true;
      }
      if (allowedMoves(pokemon).includes(n)) this.useMove(n);
      return true;
    }
    if (phase === 'select-pokemon') {
      this.selectNextPokemon(n);
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Preparación                                                         */
  /* ------------------------------------------------------------------ */

  private async loadBattle() {
    this.pokemonService.loadSpeciesNames();
    this.loading.set(true);
    this.loadError.set('');

    const userId = (await this.authService.waitForUser())?.uid;
    if (!userId) return;

    // El equipo se lee de Firestore: antes se tomaba de ?team= en la URL y se
    // podía combatir (y capturar) con cualquier Pokémon editando el enlace.
    const userData = await this.firestoreService.getUserData(userId);
    const teamIds = userData.team;
    this.teamXp.set(userData.pokemonXp);
    if (teamIds.length === 0) {
      this.router.navigate(['/game']);
      return;
    }

    try {
      // Cuanto más nivel tiene el entrenador, de más regiones salen los rivales.
      const progress = await this.progressService.load().catch(() => null);
      const maxId = maxEnemyId(levelFromXp(progress?.xp ?? 0));
      const ownedShinies = progress?.shinies ?? [];
      // Se consultan varios candidatos y se quedan los de fuerza parecida a la
      // del equipo; las peticiones a PokeAPI quedan en caché para otras batallas.
      const candidateIds = this.generateEnemyIds(
        teamIds.length * CANDIDATES_PER_ENEMY,
        teamIds,
        maxId,
      );
      const [playerData, candidates] = await Promise.all([
        this.pokemonService.getPokemons(teamIds),
        this.pokemonService.getPokemons(candidateIds),
      ]);
      const enemyIds = pickBalancedEnemies(
        candidates.map((c) => ({ id: c.id, bst: baseStatTotal(c.stats) })),
        playerData.map((p) => baseStatTotal(p.stats)),
        teamIds.length,
      );
      const enemyData = enemyIds.map((id) => candidates.find((c) => c.id === id)!);

      // Los rivales tienen el nivel medio de tu equipo (±1): subir de nivel a
      // tus Pokémon los hace más fuertes, como en los juegos.
      const levels = teamIds.map((id) => this.pokemonLevel(id));
      const avg = Math.round(levels.reduce((a, b) => a + b, 0) / levels.length);
      const enemyLevel = () =>
        Math.max(2, Math.min(MAX_LEVEL, avg + Math.floor(Math.random() * 3) - 1));

      const [player, enemy] = await Promise.all([
        // Los shinies capturados aparecen brillantes en tu equipo.
        Promise.all(
          playerData.map((d) =>
            this.toCombatant(d, this.pokemonLevel(d.id), ownedShinies.includes(d.id)),
          ),
        ),
        Promise.all(
          enemyData.map((d) => this.toCombatant(d, enemyLevel(), Math.random() < SHINY_CHANCE)),
        ),
      ]);

      this.state.set({
        player: { team: player, active: 0 },
        enemy: { team: enemy, active: 0 },
        turn: 0,
        weather: null,
      });
    } catch {
      this.loadError.set(
        'No se pudo preparar la batalla. Revisa tu conexión e inténtalo de nuevo.',
      );
    }
    this.loading.set(false);
  }

  generateEnemyIds(count: number, exclude: number[] = [], maxId = 151): number[] {
    const ids: number[] = [];
    count = Math.min(count, maxId - exclude.length);
    while (ids.length < count) {
      const id = Math.floor(Math.random() * maxId) + 1;
      if (!ids.includes(id) && !exclude.includes(id)) ids.push(id);
    }
    return ids;
  }

  /**
   * Elige 4 movimientos con sentido: ataques potentes de tipos distintos
   * (mejor si son de su tipo) y, a veces, uno de estado que el motor sabe aplicar.
   */
  private async pickMoves(data: PokemonDetailPage, types: string[]): Promise<BattleMove[]> {
    const sample = [...data.moves].sort(() => Math.random() - 0.5).slice(0, MOVE_SAMPLE_SIZE);
    const moves = (
      await Promise.all(
        sample.map((m) =>
          this.pokemonService
            .getMove(m.move.url)
            .then((d) => {
              const move = toBattleMove(d);
              return isSupportedMove(move, d.meta?.category?.name) ? move : null;
            })
            .catch(() => null),
        ),
      )
    ).filter((m): m is BattleMove => m !== null);

    const attacks = moves
      .filter((m) => m.damageClass !== 'status' && !m.ohko)
      .map((m) => ({
        m,
        score:
          Math.min(m.power, 130) *
            ((m.accuracy ?? 100) / 100) *
            (types.includes(m.type) ? 1.5 : 1) +
          (m.priority > 0 ? 15 : 0),
      }))
      .sort((a, b) => b.score - a.score);
    const statusMoves = moves.filter((m) => m.damageClass === 'status');

    const chosen: BattleMove[] = [];
    // Primero el mejor ataque de cada tipo para tener cobertura.
    for (const { m } of attacks) {
      if (chosen.length >= 3) break;
      if (!chosen.some((c) => c.type === m.type)) chosen.push(m);
    }
    if (statusMoves.length && Math.random() < 0.7) {
      chosen.push(statusMoves[Math.floor(Math.random() * statusMoves.length)]);
    }
    for (const { m } of attacks) {
      if (chosen.length >= 4) break;
      if (!chosen.includes(m)) chosen.push(m);
    }
    for (const m of moves) {
      if (chosen.length >= 4) break;
      if (!chosen.includes(m)) chosen.push(m);
    }
    return chosen.slice(0, 4);
  }

  /**
   * Habilidad del Pokémon: una de las suyas, con preferencia por las que tienen
   * efecto en combate; la oculta sale de vez en cuando.
   */
  private async pickAbility(data: PokemonDetailPage): Promise<{ key: string; name: string }> {
    const normal = data.abilities.filter((a) => !a.is_hidden);
    const hidden = data.abilities.filter((a) => a.is_hidden);
    const pool = hidden.length && Math.random() < 0.2 ? hidden : normal.length ? normal : hidden;
    if (!pool.length) return { key: '', name: '' };
    const useful = pool.filter((a) => SIMULATED_ABILITIES.has(a.ability.name));
    const list = useful.length && Math.random() < 0.75 ? useful : pool;
    const chosen = list[Math.floor(Math.random() * list.length)].ability;
    const name = await firstValueFrom(this.pokemonService.getAbility(chosen.url))
      .then((d) => d.names.find((n) => n.language.name === 'es')?.name)
      .catch(() => undefined);
    return { key: chosen.name, name: name ?? chosen.name.replace(/-/g, ' ') };
  }

  /** Objeto equipado, elegido según el estilo del Pokémon. */
  private async pickItem(
    types: string[],
    stat: (name: string) => number,
    moves: BattleMove[],
    ability: string,
  ): Promise<{ key: string; name: string; sprite: string }> {
    const hasStatus = moves.some((m) => m.damageClass === 'status');
    const physical = stat('attack') >= stat('special-attack');
    const stabType = moves.find((m) => m.damageClass !== 'status' && types.includes(m.type))?.type;
    const booster = Object.entries(TYPE_BOOST_ITEMS).find(([, t]) => t === stabType)?.[0];
    const weather =
      WEATHER_ABILITIES[ability] ?? moves.map((m) => m.weather).find((w) => w) ?? null;
    const rock = Object.entries(WEATHER_ROCKS).find(([, w]) => w === weather)?.[0];

    const options: [string, number][] = [
      [types.includes('poison') ? 'black-sludge' : 'leftovers', 3],
      ['sitrus-berry', 3],
      ['life-orb', 2],
      ['expert-belt', 1],
      ['lum-berry', 1],
      ['focus-sash', stat('defense') + stat('special-defense') < 130 ? 2 : 0.5],
      ['quick-claw', 0.5],
      ['scope-lens', 0.5],
      ['shell-bell', 0.5],
      ['oran-berry', 0.5],
      [physical ? 'muscle-band' : 'wise-glasses', 0.5],
      ['rocky-helmet', stat('defense') >= 100 ? 1.5 : 0.3],
    ];
    if (!hasStatus) {
      options.push(
        [physical ? 'choice-band' : 'choice-specs', 1.5],
        ['choice-scarf', 1],
        ['assault-vest', 1],
      );
    }
    if (booster) options.push([booster, 2]);
    if (rock) options.push([rock, 3]);
    const key = weighted(options.filter(([k]) => HELD_ITEMS.includes(k)));
    const data = await firstValueFrom(
      this.pokemonService.getItem(`https://pokeapi.co/api/v2/item/${key}`),
    ).catch(() => null);
    return {
      key,
      name: data?.names.find((n) => n.language.name === 'es')?.name ?? key.replace(/-/g, ' '),
      sprite: data?.sprites.default ?? '',
    };
  }

  private async toCombatant(
    data: PokemonDetailPage,
    level: number,
    shiny: boolean,
  ): Promise<Combatant> {
    const stat = (name: string) => data.stats.find((s) => s.stat.name === name)?.base_stat ?? 50;
    const types = data.types.map((t) => t.type.name);
    const [moves, ability] = await Promise.all([
      this.pickMoves(data, types),
      this.pickAbility(data),
    ]);
    const item = await this.pickItem(types, stat, moves, ability.key);
    return createCombatant({
      id: data.id,
      // Nombre oficial en español para los mensajes del combate.
      name: this.pokemonService.displayName(data.name, data.id),
      level,
      types,
      sprite: shiny ? `${SHINY_ARTWORK_URL}/${data.id}.png` : getArtworkUrl(data.id),
      shiny,
      base: {
        hp: stat('hp'),
        attack: stat('attack'),
        defense: stat('defense'),
        specialAttack: stat('special-attack'),
        specialDefense: stat('special-defense'),
        speed: stat('speed'),
      },
      moves,
      ability: ability.key,
      abilityName: ability.name,
      item: item.key,
      itemName: item.name,
      itemSprite: item.sprite,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Combate                                                             */
  /* ------------------------------------------------------------------ */

  async startBattle() {
    const s = this.state();
    if (!s || this.phase() !== 'preview') return;
    this.phase.set('battle');
    this.busy.set(true);
    const run = this.run;
    const enemy = activeOf(s, 'enemy');
    const player = activeOf(s, 'player');

    this.playCry(enemy.id);
    await this.say(
      enemy.shiny
        ? `✨ ¡El rival saca a ${enemy.name}! ¡Es shiny!`
        : `¡El rival saca a ${enemy.name}!`,
      run,
    );
    this.playCry(player.id);
    await this.say(`¡Adelante, ${player.name}!`, run);
    if (run !== this.run) return;
    // Habilidades de entrada: Intimidación, Llovizna, Sequía…
    const entry = beginBattle(this.state()!);
    await this.play(entry.events, run, entry.state);
    if (run !== this.run) return;
    this.busy.set(false);
  }

  useMove(index: number) {
    this.act({ kind: 'move', index });
  }

  useStruggle() {
    this.act({ kind: 'struggle' });
  }

  toggleSwitch() {
    if (this.isPlayerTurn()) this.switching.update((v) => !v);
  }

  /** Cambio voluntario: gasta el turno y el rival ataca al que entra. */
  switchTo(index: number) {
    const s = this.state();
    const target = s?.player.team[index];
    if (!s || !target || target.fainted || index === s.player.active) return;
    this.switching.set(false);
    this.act({ kind: 'switch', index });
  }

  private async act(action: Action) {
    const s = this.state();
    if (!s || !this.isPlayerTurn()) return;
    this.busy.set(true);
    this.switching.set(false);
    const run = this.run;

    await this.runTurn(action, run);
  }

  private async runTurn(action: Action, run: number) {
    const s = this.state()!;
    const { state, events } = resolveTurn(s, action, chooseEnemyAction(s));
    await this.play(events, run, state);
    if (run !== this.run) return;
    await this.afterTurn(run);
  }

  /** Tras el turno: fin del combate o sustitución de los debilitados. */
  private async afterTurn(run: number) {
    let s = this.state()!;
    if (!hasAlive(s, 'enemy')) return this.endBattle(true);
    if (!hasAlive(s, 'player')) return this.endBattle(false);

    if (activeOf(s, 'enemy').fainted) {
      const next = switchIn(s, 'enemy', chooseEnemyReplacement(s));
      await this.play(next.events, run, next.state);
      if (run !== this.run) return;
      s = this.state()!;
    }

    if (activeOf(s, 'player').fainted) {
      const alive = s.player.team.map((p, i) => ({ p, i })).filter(({ p }) => !p.fainted);
      if (alive.length === 1) {
        const next = switchIn(s, 'player', alive[0].i);
        await this.play(next.events, run, next.state);
      } else {
        this.phase.set('select-pokemon');
        this.message.set('¿Qué Pokémon sacas ahora?');
        this.busy.set(false);
        return;
      }
    }
    if (run !== this.run) return;
    // Tras un Hiperrayo el Pokémon no puede elegir: el turno pasa solo.
    if (activeOf(this.state()!, 'player').recharging) {
      await this.runTurn({ kind: 'move', index: 0 }, run);
      return;
    }
    this.busy.set(false);
  }

  /** Sustituto del Pokémon debilitado del jugador. */
  async selectNextPokemon(index: number) {
    const s = this.state();
    const target = s?.player.team[index];
    if (!s || this.phase() !== 'select-pokemon' || !target || target.fainted) return;
    this.phase.set('battle');
    this.busy.set(true);
    const run = this.run;
    const next = switchIn(s, 'player', index);
    await this.play(next.events, run, next.state);
    if (run !== this.run) return;
    this.busy.set(false);
  }

  /** Reproduce los sucesos de un turno uno a uno, con texto, animaciones y sonido. */
  private async play(events: BattleEvent[], run: number, final: BattleState) {
    for (const e of events) {
      if (run !== this.run) return;
      if (e.koBy) this.koBy.set(e.koBy, (this.koBy.get(e.koBy) ?? 0) + 1);
      this.animateEvent(e);
      // La barra de PS baja justo después de que el golpe empiece.
      if (e.anim === 'hit' || e.anim === 'crit') await wait(180);
      this.state.set(e.state);
      if (e.anim === 'switch' && e.side) this.playCry(activeOf(e.state, e.side).id);
      if (e.text) await this.say(e.text, run);
      else await wait(e.anim === 'heal' ? 500 : 420);
    }
    // El estado final incluye lo que no genera mensaje (p. ej. tener que recargar).
    if (run === this.run) this.state.set(final);
  }

  private animateEvent(e: BattleEvent) {
    const side = e.side as SideKey | undefined;
    if (!side) return;
    const flag = (kind: 'shake' | 'flash' | 'faint', s: SideKey) =>
      ({
        shake: s === 'player' ? this.playerShaking : this.enemyShaking,
        flash: s === 'player' ? this.playerFlashing : this.enemyFlashing,
        faint: s === 'player' ? this.playerFainting : this.enemyFainting,
      })[kind];
    const pulse = (kind: 'shake' | 'flash' | 'faint', s: SideKey, ms: number) => {
      const f = flag(kind, s);
      f.set(false);
      requestAnimationFrame(() => f.set(true));
      setTimeout(() => f.set(false), ms);
    };
    switch (e.anim) {
      case 'attack':
        pulse('flash', side, 300);
        break;
      case 'hit':
      case 'crit':
        pulse('shake', side, 500);
        this.playHitSound(e.anim === 'crit' ? 2 : (e.effectiveness ?? 1));
        break;
      case 'faint':
        pulse('faint', side, 900);
        break;
    }
  }

  /** Escribe un mensaje letra a letra y espera a que dé tiempo a leerlo. */
  private async say(text: string, run: number) {
    for (let i = 1; i <= text.length; i += 2) {
      if (run !== this.run) return;
      this.message.set(text.slice(0, i));
      await wait(22);
    }
    this.message.set(text);
    await wait(Math.min(1600, 650 + text.length * 14));
  }

  /* ------------------------------------------------------------------ */
  /* Fin                                                                 */
  /* ------------------------------------------------------------------ */

  async endBattle(won: boolean) {
    this.playerWon.set(won);
    this.phase.set('result');
    this.busy.set(false);

    if (won) {
      const userId = this.authService.currentUser()?.uid;
      if (userId) {
        const enemyIds = this.enemyTeam().map((p) => p.id);
        const collection = await this.firestoreService.getCollection(userId);
        this.newCaptures.set(enemyIds.filter((id) => !collection.includes(id)));
        // Una sola escritura con todos los capturados en lugar de una por Pokémon.
        await this.firestoreService.addToCollection(userId, ...enemyIds);
      }
    }

    // Experiencia, retos diarios y logros: también se gana algo al perder.
    const enemies = this.enemyTeam();
    const rewards = await this.progressService
      .record({
        type: 'battle',
        won,
        kos: enemies.filter((p) => p.fainted).length,
        capturedTypes: won ? enemies.map((p) => p.types) : [],
        shinies: won ? enemies.filter((p) => p.shiny).map((p) => p.id) : [],
      })
      .catch(() => [] as Reward[]);
    this.rewards.set(rewards);
    this.rewardXp.set(xpFromRewards(rewards));
    await this.growTeam(won);
  }

  /** Reparte experiencia al equipo y comprueba quién puede evolucionar. */
  private async growTeam(won: boolean) {
    const userId = this.authService.currentUser()?.uid;
    if (!userId) return;
    const before = this.teamXp();
    const gains: Record<number, number> = {};
    for (const p of this.playerTeam()) gains[p.id] = battleXp(won, this.koBy.get(p.id) ?? 0);

    try {
      await this.firestoreService.addPokemonXp(userId, gains);
    } catch {
      return;
    }

    const growth = await Promise.all(
      this.playerTeam().map(async (p) => {
        const xp = (before[p.id] ?? 0) + gains[p.id];
        const options = await this.evolutionService.optionsFor(p.id);
        return {
          id: p.id,
          name: p.name,
          xp,
          gained: gains[p.id],
          levelBefore: pokemonLevel(before[p.id] ?? 0),
          levelAfter: pokemonLevel(xp),
          evolutions: availableEvolutions(options, xp),
        };
      }),
    );
    this.teamXp.set({ ...before, ...Object.fromEntries(growth.map((g) => [g.id, g.xp])) });
    this.teamGrowth.set(growth);
  }

  /** Tras evolucionar, el Pokémon se muestra con su nueva forma en el resumen. */
  onEvolved(from: TeamGrowth, toId: number) {
    this.teamGrowth.update((list) =>
      list.map((g) =>
        g.id === from.id
          ? {
              ...g,
              id: toId,
              name: g.evolutions.find((e) => e.id === toId)?.name ?? g.name,
              evolutions: [],
            }
          : g,
      ),
    );
  }

  /** Recompensas destacadas (no de XP) para el resumen de la batalla. */
  highlightRewards(): string[] {
    return this.rewards().flatMap((r) => {
      if (r.kind === 'level')
        return [`⭐ ¡Nivel ${r.level}!${r.unlock ? ` Desbloqueas ${r.unlock}` : ''}`];
      if (r.kind === 'achievement') return [`${r.icon} Logro: ${r.title}`];
      if (r.kind === 'challenge') return [`✅ Reto completado: ${r.title}`];
      if (r.kind === 'bonus') return [`🎁 ${r.text}`];
      return [];
    });
  }

  /** Reinicia la batalla con el mismo equipo y un rival nuevo. */
  async newBattle() {
    this.run++;
    this.state.set(null);
    this.message.set('');
    this.busy.set(false);
    this.switching.set(false);
    this.newCaptures.set([]);
    this.teamGrowth.set([]);
    this.evolving.set(null);
    this.koBy.clear();
    this.rewards.set([]);
    this.rewardXp.set(0);
    this.playerWon.set(false);
    this.phase.set('preview');
    await this.loadBattle();
  }

  goBack() {
    this.router.navigate(['/game']);
  }

  /* ------------------------------------------------------------------ */
  /* Ayudas para la plantilla                                            */
  /* ------------------------------------------------------------------ */

  hasUsableMoves(p: Combatant): boolean {
    return hasUsableMoves(p);
  }

  canUseMove(p: Combatant, index: number): boolean {
    return allowedMoves(p).includes(index);
  }

  /** Tiempo actual para la cabecera del campo, p. ej. "☔ Lluvia · 3". */
  weatherChip(): { icon: string; name: string; turns: number; kind: string } | null {
    const s = this.state();
    const kind = s ? weatherOf(s) : null;
    if (!s || !kind) return null;
    return { ...WEATHER_TEXT[kind], turns: s.weather!.turns, kind };
  }

  /** Por qué hay movimientos bloqueados (objeto Elección o Chaleco Asalto). */
  lockNote(p: Combatant): string {
    if (p.choiceLock !== null) return `Atado a ${p.moves[p.choiceLock]?.name} por ${p.itemName}`;
    if (p.item === 'assault-vest' && p.moves.some((m) => m.damageClass === 'status'))
      return `${p.itemName}: no puede usar movimientos de estado`;
    return '';
  }

  /** Cambios de características activos, p. ej. "Ata +2". */
  stageChips(p: Combatant): { label: string; up: boolean }[] {
    return (Object.keys(STAGE_SHORT) as StatKey[])
      .filter((k) => p.stages[k] !== 0)
      .map((k) => ({
        label: `${STAGE_SHORT[k]} ${p.stages[k] > 0 ? '+' : '−'}${Math.abs(p.stages[k])}`,
        up: p.stages[k] > 0,
      }));
  }

  canSwitch(): boolean {
    const s = this.state();
    return !!s && s.player.team.some((p, i) => !p.fainted && i !== s.player.active);
  }

  isNewCapture(pokemonId: number): boolean {
    return this.newCaptures().includes(pokemonId);
  }

  pokemonSprite(id: number): string {
    return getArtworkUrl(id);
  }

  pokemonLevel(id: number): number {
    return pokemonLevel(this.teamXp()[id] ?? 0);
  }

  getHpPercent(pokemon: Combatant): number {
    return Math.max(0, Math.ceil((pokemon.hp / pokemon.maxHp) * 100));
  }

  getHpClass(pokemon: Combatant): string {
    const pct = this.getHpPercent(pokemon);
    if (pct > 50) return 'high';
    if (pct > 20) return 'mid';
    return 'low';
  }

  playCry(pokemonId: number) {
    if (!this.destroyed) playPokemonCry(pokemonId);
  }

  playHitSound(effectiveness: number) {
    // Un único AudioContext reutilizado: los navegadores limitan cuántos se pueden crear.
    try {
      this.audioCtx ??= new AudioContext();
    } catch {
      return;
    }
    const ctx = this.audioCtx;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const [from, to, gain, duration] =
      effectiveness >= 2
        ? [300, 80, 0.4, 0.3]
        : effectiveness === 0
          ? [100, 100, 0.2, 0.15]
          : [200, 60, 0.3, 0.2];

    oscillator.frequency.setValueAtTime(from, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  }
}
