import { Component, inject, OnDestroy, OnInit, signal, WritableSignal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { FirestoreService } from '../../../services/firestore.service';
import { PokemonService, getArtworkUrl } from '../../../services/pokemon';
import { PokemonDetailPage, PokemonMove } from '../../../interfaces/pokemon';

interface BattleMove {
  name: string;
  power: number;
  type: string;
  damageClass: string;
  accuracy: number | null;
  pp: number;
  maxPp: number;
}

interface BattlePokemon {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  types: string[];
  moves: BattleMove[];
  sprite: string;
  fainted: boolean;
}

interface BattleLogEntry {
  id: number;
  text: string;
  visible: boolean;
}

type BattlePhase = 'preview' | 'battle' | 'select-pokemon' | 'result';
type Side = 'player' | 'enemy';

// Movimiento de emergencia cuando no quedan PP (equivalente a "Forcejeo").
const STRUGGLE: BattleMove = {
  name: 'Forcejeo',
  power: 50,
  type: 'normal',
  damageClass: 'physical',
  accuracy: null,
  pp: 1,
  maxPp: 1,
};

// Cuántos movimientos del Pokémon consultamos para elegir 4 que hagan daño.
const MOVE_SAMPLE_SIZE = 16;
const TURN_DELAY = 3000;

@Component({
  selector: 'app-battle',
  imports: [],
  templateUrl: './battle.html',
  styleUrl: './battle.css',
})
export class Battle implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  private pokemonService = inject(PokemonService);
  private router = inject(Router);

  playerTeam = signal<BattlePokemon[]>([]);
  enemyTeam = signal<BattlePokemon[]>([]);
  activePokemon = signal<BattlePokemon | null>(null);
  activeEnemy = signal<BattlePokemon | null>(null);
  battleLogs = signal<BattleLogEntry[]>([]);
  phase = signal<BattlePhase>('preview');
  isPlayerTurn = signal(true);
  playerWon = signal(false);
  loading = signal(true);
  loadError = signal('');
  newCaptures = signal<number[]>([]);

  playerShaking = signal(false);
  enemyShaking = signal(false);
  playerFlashing = signal(false);
  enemyFlashing = signal(false);

  private logCounter = 0;
  private audioCtx: AudioContext | null = null;
  // Guardamos todos los timers para cancelarlos al salir de la batalla; antes
  // el turno del rival seguía ejecutándose aunque ya hubieras cambiado de página.
  private timeouts = new Set<ReturnType<typeof setTimeout>>();
  private intervals = new Set<ReturnType<typeof setInterval>>();

  private schedule(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      fn();
    }, ms);
    this.timeouts.add(id);
  }

  ngOnDestroy() {
    this.timeouts.forEach(clearTimeout);
    this.intervals.forEach(clearInterval);
    this.audioCtx?.close().catch(() => {});
  }

  playCry(pokemonId: number) {
    const audio = new Audio(
      `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${pokemonId}.ogg`,
    );
    audio.volume = 0.5;
    audio.play().catch(() => {});
  }

  playHitSound(effectiveness: number) {
    // Un único AudioContext reutilizado: los navegadores limitan cuántos se
    // pueden crear y antes se creaba uno nuevo en cada golpe.
    this.audioCtx ??= new AudioContext();
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

  private animate(flag: WritableSignal<boolean>, ms: number) {
    flag.set(true);
    this.schedule(() => flag.set(false), ms);
  }

  typewriterLog(text: string) {
    const id = this.logCounter++;
    this.battleLogs.update((logs) => [...logs, { id, text: '', visible: true }]);

    let i = 0;
    const interval = setInterval(() => {
      i++;
      this.battleLogs.update((logs) =>
        logs.map((l) => (l.id === id ? { ...l, text: text.slice(0, i) } : l)),
      );
      if (i >= text.length) {
        clearInterval(interval);
        this.intervals.delete(interval);
        this.schedule(() => {
          this.battleLogs.update((logs) =>
            logs.map((l) => (l.id === id ? { ...l, visible: false } : l)),
          );
        }, 2500);
        this.schedule(() => {
          this.battleLogs.update((logs) => logs.filter((l) => l.id !== id));
        }, 3500);
      }
    }, 30);
    this.intervals.add(interval);
  }

  async ngOnInit() {
    await this.loadBattle();
  }

  private async loadBattle() {
    this.loading.set(true);
    this.loadError.set('');

    const userId = (await this.authService.waitForUser())?.uid;
    if (!userId) return;

    // El equipo se lee de Firestore: antes se tomaba de ?team= en la URL y se
    // podía combatir (y capturar) con cualquier Pokémon editando el enlace.
    const teamIds = await this.firestoreService.getTeam(userId);
    if (teamIds.length === 0) {
      this.router.navigate(['/game']);
      return;
    }

    try {
      const enemyIds = this.generateEnemyIds(teamIds.length, teamIds);
      const [playerData, enemyData] = await Promise.all([
        this.pokemonService.getPokemons(teamIds),
        this.pokemonService.getPokemons(enemyIds),
      ]);

      const [playerTeam, enemyTeam] = await Promise.all([
        Promise.all(playerData.map((d) => this.mapPokemon(d))),
        Promise.all(enemyData.map((d) => this.mapPokemon(d))),
      ]);

      this.playerTeam.set(playerTeam);
      this.enemyTeam.set(enemyTeam);
    } catch {
      this.loadError.set(
        'No se pudo preparar la batalla. Revisa tu conexión e inténtalo de nuevo.',
      );
    }
    this.loading.set(false);
  }

  generateEnemyIds(count: number, exclude: number[] = []): number[] {
    const ids: number[] = [];
    while (ids.length < count) {
      const id = Math.floor(Math.random() * 151) + 1;
      if (!ids.includes(id) && !exclude.includes(id)) ids.push(id);
    }
    return ids;
  }

  private toBattleMove(data: PokemonMove): BattleMove {
    const spanishName = data.names?.find((n) => n.language.name === 'es')?.name;
    return {
      name: spanishName ?? data.name.replace(/-/g, ' '),
      power: data.power ?? 0,
      type: data.type.name,
      damageClass: data.damage_class.name,
      accuracy: data.accuracy,
      pp: data.pp,
      maxPp: data.pp,
    };
  }

  /**
   * Elige 4 movimientos útiles. Antes se cogían los 4 primeros de la lista,
   * que muchas veces eran de estado y no hacían daño. Ahora se priorizan los
   * movimientos con potencia y los del mismo tipo que el Pokémon (STAB).
   */
  private async pickMoves(data: PokemonDetailPage, types: string[]): Promise<BattleMove[]> {
    const sample = [...data.moves].sort(() => Math.random() - 0.5).slice(0, MOVE_SAMPLE_SIZE);

    const moves = (
      await Promise.all(
        sample.map((m) =>
          this.pokemonService
            .getMove(m.move.url)
            .then((d) => this.toBattleMove(d))
            .catch(() => null),
        ),
      )
    ).filter((m): m is BattleMove => m !== null);

    const score = (m: BattleMove) =>
      (m.power > 0 ? 1000 : 0) + (types.includes(m.type) ? 100 : 0) + Math.min(m.power, 120);

    return moves.sort((a, b) => score(b) - score(a)).slice(0, 4);
  }

  async mapPokemon(data: PokemonDetailPage): Promise<BattlePokemon> {
    const getStat = (name: string) => data.stats.find((s) => s.stat.name === name)?.base_stat ?? 50;
    const types = data.types.map((t) => t.type.name);

    return {
      id: data.id,
      name: data.name,
      hp: getStat('hp'),
      maxHp: getStat('hp'),
      attack: getStat('attack'),
      defense: getStat('defense'),
      specialAttack: getStat('special-attack'),
      specialDefense: getStat('special-defense'),
      speed: getStat('speed'),
      types,
      moves: await this.pickMoves(data, types),
      sprite: getArtworkUrl(data.id),
      fainted: false,
    };
  }

  startBattle() {
    const player = this.playerTeam()[0];
    const enemy = this.enemyTeam()[0];
    this.activePokemon.set(player);
    this.activeEnemy.set(enemy);
    this.phase.set('battle');

    this.playCry(player.id);
    this.schedule(() => this.playCry(enemy.id), 800);

    const playerFirst = this.playerGoesFirst();
    this.typewriterLog(`¡${playerFirst ? player.name : enemy.name} es más rápido y ataca primero!`);
    this.startRound(playerFirst);
  }

  /** El Pokémon con más velocidad ataca primero; en caso de empate, al azar. */
  private playerGoesFirst(): boolean {
    const playerSpeed = this.activePokemon()!.speed;
    const enemySpeed = this.activeEnemy()!.speed;
    if (playerSpeed === enemySpeed) return Math.random() > 0.5;
    return playerSpeed > enemySpeed;
  }

  private startRound(playerFirst = this.playerGoesFirst()) {
    if (playerFirst) {
      this.isPlayerTurn.set(true);
    } else {
      this.isPlayerTurn.set(false);
      this.schedule(() => this.enemyTurn(), TURN_DELAY);
    }
  }

  async getTypeEffectiveness(moveType: string, defenderTypes: string[]): Promise<number> {
    const data = await this.pokemonService.getType(moveType);
    let multiplier = 1;

    for (const defType of defenderTypes) {
      if (data.damage_relations.double_damage_to.some((t) => t.name === defType)) multiplier *= 2;
      if (data.damage_relations.half_damage_to.some((t) => t.name === defType)) multiplier *= 0.5;
      if (data.damage_relations.no_damage_to.some((t) => t.name === defType)) multiplier *= 0;
    }

    return multiplier;
  }

  // Nivel usado en la fórmula de daño. Como la vida y los stats usan el
  // stat base del Pokémon, un nivel bajo (p. ej. 5) hace un daño ridículo
  // frente a esa vida. 50 da combates de 2-4 turnos por Pokémon.
  private readonly BATTLE_LEVEL = 50;

  calculateDamage(
    attacker: BattlePokemon,
    defender: BattlePokemon,
    move: BattleMove,
    effectiveness: number,
  ): number {
    if (move.power === 0) return 0;
    // Un movimiento inmune (eficacia 0) no debe hacer daño alguno.
    if (effectiveness === 0) return 0;

    const attackStat = move.damageClass === 'special' ? attacker.specialAttack : attacker.attack;
    const defenseStat = move.damageClass === 'special' ? defender.specialDefense : defender.defense;
    const random = 0.85 + Math.random() * 0.15;
    // STAB: bonus x1.5 si el tipo del movimiento coincide con un tipo del atacante.
    const stab = attacker.types.includes(move.type) ? 1.5 : 1;

    const base =
      (((2 * this.BATTLE_LEVEL) / 5 + 2) * attackStat * move.power) / (defenseStat * 50) + 2;

    const damage = Math.floor(base * stab * effectiveness * random);

    return Math.max(1, damage);
  }

  /** Movimientos con PP disponibles; si no queda ninguno se usa Forcejeo. */
  hasUsableMoves(pokemon: BattlePokemon): boolean {
    return pokemon.moves.some((m) => m.pp > 0);
  }

  useStruggle() {
    this.useMove(STRUGGLE);
  }

  async useMove(move: BattleMove) {
    if (!this.isPlayerTurn() || this.phase() !== 'battle') return;
    if (move !== STRUGGLE && move.pp <= 0) return;
    this.isPlayerTurn.set(false);

    const { defenderFainted } = await this.performAttack('player', move);
    if (this.phase() !== 'battle') return;

    if (defenderFainted) {
      this.schedule(() => {
        this.typewriterLog(`¡${this.activeEnemy()!.name} se debilitó!`);
        this.schedule(() => this.checkNextEnemy(), 2500);
      }, 2000);
      return;
    }

    this.schedule(() => this.enemyTurn(), TURN_DELAY);
  }

  async enemyTurn() {
    if (this.phase() !== 'battle') return;
    const enemy = this.activeEnemy()!;

    // La IA elige al azar entre sus movimientos con daño y PP restantes.
    const usable = enemy.moves.filter((m) => m.pp > 0 && m.power > 0);
    const fallback = enemy.moves.filter((m) => m.pp > 0);
    const pool = usable.length > 0 ? usable : fallback;
    const move = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : STRUGGLE;

    const { defenderFainted } = await this.performAttack('enemy', move);
    if (this.phase() !== 'battle') return;

    if (defenderFainted) {
      this.schedule(() => {
        this.typewriterLog(`¡${this.activePokemon()!.name} se debilitó!`);
        this.schedule(() => this.checkNextPlayer(), 2500);
      }, 2000);
      return;
    }

    this.schedule(() => this.isPlayerTurn.set(true), TURN_DELAY);
  }

  /**
   * Resuelve un ataque completo: gasta PP, comprueba la precisión, calcula
   * el daño y actualiza los signals del atacante y el defensor sin mutarlos.
   */
  private async performAttack(side: Side, move: BattleMove): Promise<{ defenderFainted: boolean }> {
    const attackerSignal = side === 'player' ? this.activePokemon : this.activeEnemy;
    const defenderSignal = side === 'player' ? this.activeEnemy : this.activePokemon;
    const attackerTeam = side === 'player' ? this.playerTeam : this.enemyTeam;
    const defenderTeam = side === 'player' ? this.enemyTeam : this.playerTeam;

    let attacker = attackerSignal()!;
    const defender = defenderSignal()!;

    if (move !== STRUGGLE) {
      attacker = {
        ...attacker,
        moves: attacker.moves.map((m) => (m === move ? { ...m, pp: m.pp - 1 } : m)),
      };
      attackerSignal.set(attacker);
      this.updateTeamPokemon(attackerTeam, attacker);
    }

    if (move.power === 0) {
      this.typewriterLog(`¡${attacker.name} usó ${move.name}! Pero no hizo daño.`);
      return { defenderFainted: false };
    }

    const hits = move.accuracy === null || Math.random() * 100 < move.accuracy;
    if (!hits) {
      this.typewriterLog(`¡${attacker.name} usó ${move.name}! Pero falló.`);
      return { defenderFainted: false };
    }

    this.animate(side === 'player' ? this.playerFlashing : this.enemyFlashing, 300);
    this.schedule(
      () => this.animate(side === 'player' ? this.enemyShaking : this.playerShaking, 500),
      200,
    );

    const effectiveness = await this.getTypeEffectiveness(move.type, defender.types);
    this.playHitSound(effectiveness);
    const damage = this.calculateDamage(attacker, defender, move, effectiveness);
    const newHp = Math.max(0, defender.hp - damage);

    let log = `¡${attacker.name} usó ${move.name}! ${defender.name} perdió ${damage} PS.`;
    if (effectiveness >= 2) log += ' ¡Es muy eficaz!';
    else if (effectiveness < 1 && effectiveness > 0) log += ' No es muy eficaz...';
    else if (effectiveness === 0)
      log = `¡${attacker.name} usó ${move.name}! No afecta a ${defender.name}...`;

    // Forcejeo hace al atacante un cuarto del daño causado.
    if (move === STRUGGLE && damage > 0) {
      const recoil = Math.max(1, Math.floor(damage / 4));
      attacker = { ...attacker, hp: Math.max(1, attacker.hp - recoil) };
      attackerSignal.set(attacker);
      this.updateTeamPokemon(attackerTeam, attacker);
      log += ` ${attacker.name} también se hizo daño.`;
    }

    const updatedDefender = { ...defender, hp: newHp, fainted: newHp <= 0 };
    defenderSignal.set(updatedDefender);
    this.updateTeamPokemon(defenderTeam, updatedDefender);
    this.typewriterLog(log);

    return { defenderFainted: updatedDefender.fainted };
  }

  updateTeamPokemon(teamSignal: WritableSignal<BattlePokemon[]>, updated: BattlePokemon) {
    teamSignal.update((team) => team.map((p) => (p.id === updated.id ? updated : p)));
  }

  checkNextEnemy() {
    const nextEnemy = this.enemyTeam().find((p) => !p.fainted);
    if (!nextEnemy) {
      this.endBattle(true);
      return;
    }
    this.activeEnemy.set(nextEnemy);
    this.playCry(nextEnemy.id);
    this.typewriterLog(`¡El rival saca a ${nextEnemy.name}!`);
    this.startRound();
  }

  checkNextPlayer() {
    const alivePlayers = this.playerTeam().filter((p) => !p.fainted);
    if (alivePlayers.length === 0) {
      this.endBattle(false);
      return;
    }
    // Si solo queda uno, entra directamente sin pasar por la pantalla de selección.
    if (alivePlayers.length === 1) {
      this.selectNextPokemon(alivePlayers[0]);
      return;
    }
    this.phase.set('select-pokemon');
    this.typewriterLog('Elige tu siguiente Pokémon.');
  }

  selectNextPokemon(pokemon: BattlePokemon) {
    if (pokemon.fainted) return;
    this.activePokemon.set(pokemon);
    this.playCry(pokemon.id);
    this.typewriterLog(`¡${pokemon.name} entra en batalla!`);
    this.phase.set('battle');
    this.startRound();
  }

  async endBattle(won: boolean) {
    this.playerWon.set(won);
    this.phase.set('result');

    if (won) {
      this.typewriterLog('¡Ganaste la batalla!');
      const userId = this.authService.currentUser()?.uid;
      if (userId) {
        const enemyIds = this.enemyTeam().map((p) => p.id);
        const collection = await this.firestoreService.getCollection(userId);
        this.newCaptures.set(enemyIds.filter((id) => !collection.includes(id)));
        // Una sola escritura con todos los capturados en lugar de una por Pokémon.
        await this.firestoreService.addToCollection(userId, ...enemyIds);
      }
    } else {
      this.typewriterLog('¡Perdiste la batalla!');
    }
  }

  isNewCapture(pokemonId: number): boolean {
    return this.newCaptures().includes(pokemonId);
  }

  getHpPercent(pokemon: BattlePokemon): number {
    return Math.floor((pokemon.hp / pokemon.maxHp) * 100);
  }

  getHpClass(pokemon: BattlePokemon): string {
    const pct = this.getHpPercent(pokemon);
    if (pct > 50) return 'high';
    if (pct > 20) return 'mid';
    return 'low';
  }

  goBack() {
    this.router.navigate(['/game']);
  }

  /** Reinicia la batalla con el mismo equipo y un rival nuevo. */
  async newBattle() {
    this.timeouts.forEach(clearTimeout);
    this.intervals.forEach(clearInterval);
    this.timeouts.clear();
    this.intervals.clear();
    this.battleLogs.set([]);
    this.activePokemon.set(null);
    this.activeEnemy.set(null);
    this.newCaptures.set([]);
    this.playerWon.set(false);
    this.phase.set('preview');
    await this.loadBattle();
  }
}
