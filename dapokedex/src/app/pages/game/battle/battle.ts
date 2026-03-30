import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { FirestoreService } from '../../../services/firestore.service';

interface BattleMove {
  name: string;
  power: number;
  type: string;
  damageClass: string;
  accuracy: number | null;
  pp: number;
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

@Component({
  selector: 'app-battle',
  imports: [],
  templateUrl: './battle.html',
  styleUrl: './battle.css',
})
export class Battle implements OnInit {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  playerTeam = signal<BattlePokemon[]>([]);
  enemyTeam = signal<BattlePokemon[]>([]);
  activePokemon = signal<BattlePokemon | null>(null);
  activeEnemy = signal<BattlePokemon | null>(null);
  battleLogs = signal<BattleLogEntry[]>([]);
  phase = signal<BattlePhase>('preview');
  isPlayerTurn = signal(true);
  playerWon = signal(false);
  loading = signal(true);

  playerShaking = signal(false);
  enemyShaking = signal(false);
  playerFlashing = signal(false);
  enemyFlashing = signal(false);

  private logCounter = 0;

  playCry(pokemonId: number) {
    const audio = new Audio(
      `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${pokemonId}.ogg`,
    );
    audio.volume = 0.5;
    audio.play().catch(() => {});
  }

  playHitSound(effectiveness: number) {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (effectiveness >= 2) {
      oscillator.frequency.setValueAtTime(300, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } else if (effectiveness === 0) {
      oscillator.frequency.setValueAtTime(100, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.15);
    } else {
      oscillator.frequency.setValueAtTime(200, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.2);
    }
  }

  shakePlayer() {
    this.playerShaking.set(true);
    setTimeout(() => this.playerShaking.set(false), 500);
  }

  shakeEnemy() {
    this.enemyShaking.set(true);
    setTimeout(() => this.enemyShaking.set(false), 500);
  }

  flashPlayer() {
    this.playerFlashing.set(true);
    setTimeout(() => this.playerFlashing.set(false), 300);
  }

  flashEnemy() {
    this.enemyFlashing.set(true);
    setTimeout(() => this.enemyFlashing.set(false), 300);
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
        setTimeout(() => {
          this.battleLogs.update((logs) =>
            logs.map((l) => (l.id === id ? { ...l, visible: false } : l)),
          );
        }, 2500);
        setTimeout(() => {
          this.battleLogs.update((logs) => logs.filter((l) => l.id !== id));
        }, 3500);
      }
    }, 30);
  }

  async ngOnInit() {
    const teamParam = this.route.snapshot.queryParams['team'];
    if (!teamParam) {
      this.router.navigate(['/game']);
      return;
    }

    const teamIds = teamParam.split(',').map(Number);
    const enemyIds = this.generateEnemyIds(teamIds.length);

    const [playerData, enemyData] = await Promise.all([
      Promise.all(
        teamIds.map((id: number) =>
          fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then((r) => r.json()),
        ),
      ),
      Promise.all(
        enemyIds.map((id: number) =>
          fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then((r) => r.json()),
        ),
      ),
    ]);

    const [playerTeam, enemyTeam] = await Promise.all([
      Promise.all(playerData.map((d: any) => this.mapPokemon(d))),
      Promise.all(enemyData.map((d: any) => this.mapPokemon(d))),
    ]);

    this.playerTeam.set(playerTeam);
    this.enemyTeam.set(enemyTeam);
    this.loading.set(false);
  }

  generateEnemyIds(count: number): number[] {
    const ids: number[] = [];
    while (ids.length < count) {
      const id = Math.floor(Math.random() * 151) + 1;
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  async getMoveData(moveName: string): Promise<BattleMove> {
    const data = await fetch(`https://pokeapi.co/api/v2/move/${moveName}`).then((r) => r.json());
    return {
      name: data.name,
      power: data.power ?? 0,
      type: data.type.name,
      damageClass: data.damage_class.name,
      accuracy: data.accuracy,
      pp: data.pp,
    };
  }

  async mapPokemon(data: any): Promise<BattlePokemon> {
    const getStat = (name: string) =>
      data.stats.find((s: any) => s.stat.name === name)?.base_stat ?? 50;

    const moves = await Promise.all(
      data.moves.slice(0, 4).map((m: any) => this.getMoveData(m.move.name)),
    );

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
      types: data.types.map((t: any) => t.type.name),
      moves,
      sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${data.id}.png`,
      fainted: false,
    };
  }

  startBattle() {
    const playerFirst = Math.random() > 0.5;
    this.isPlayerTurn.set(playerFirst);
    this.activePokemon.set(this.playerTeam()[0]);
    this.activeEnemy.set(this.enemyTeam()[0]);
    this.phase.set('battle');

    this.playCry(this.playerTeam()[0].id);
    setTimeout(() => this.playCry(this.enemyTeam()[0].id), 800);

    this.typewriterLog(
      playerFirst
        ? `¡${this.playerTeam()[0].name} sale primero!`
        : `¡${this.enemyTeam()[0].name} sale primero!`,
    );

    if (!playerFirst) {
      setTimeout(() => this.enemyTurn(), 3000);
    }
  }

  async getTypeEffectiveness(moveType: string, defenderTypes: string[]): Promise<number> {
    const data = await fetch(`https://pokeapi.co/api/v2/type/${moveType}`).then((r) => r.json());
    let multiplier = 1;

    for (const defType of defenderTypes) {
      if (data.damage_relations.double_damage_to.some((t: any) => t.name === defType))
        multiplier *= 2;
      if (data.damage_relations.half_damage_to.some((t: any) => t.name === defType))
        multiplier *= 0.5;
      if (data.damage_relations.no_damage_to.some((t: any) => t.name === defType)) multiplier *= 0;
    }

    return multiplier;
  }

  calculateDamage(
    attacker: BattlePokemon,
    defender: BattlePokemon,
    move: BattleMove,
    effectiveness: number,
  ): number {
    if (move.power === 0) return 0;

    const attackStat = move.damageClass === 'special' ? attacker.specialAttack : attacker.attack;
    const defenseStat = move.damageClass === 'special' ? defender.specialDefense : defender.defense;
    const random = 0.85 + Math.random() * 0.15;

    const damage = Math.floor(
      ((((2 * 5) / 5 + 2) * attackStat * move.power) / (defenseStat * 50) + 2) *
        effectiveness *
        random,
    );

    return Math.max(1, damage);
  }

  async useMove(move: BattleMove) {
    if (!this.isPlayerTurn() || this.phase() !== 'battle') return;

    const player = this.activePokemon()!;
    const enemy = this.activeEnemy()!;

    this.isPlayerTurn.set(false);

    if (move.power === 0) {
      this.typewriterLog(`¡${player.name} usó ${move.name}! Pero no hizo daño.`);
      setTimeout(() => this.enemyTurn(), 3000);
      return;
    }

    this.flashPlayer();
    setTimeout(() => this.shakeEnemy(), 200);

    const effectiveness = await this.getTypeEffectiveness(move.type, enemy.types);
    this.playHitSound(effectiveness);
    const damage = this.calculateDamage(player, enemy, move, effectiveness);
    const newHp = Math.max(0, enemy.hp - damage);

    let log = `¡${player.name} usó ${move.name}! ${enemy.name} perdió ${damage} HP.`;
    if (effectiveness >= 2) log += ' ¡Es muy eficaz!';
    else if (effectiveness < 1 && effectiveness > 0) log += ' No es muy eficaz...';
    else if (effectiveness === 0) log = `¡No afecta a ${enemy.name}!`;

    const updatedEnemy = { ...enemy, hp: newHp };
    this.activeEnemy.set(updatedEnemy);
    this.updateTeamPokemon(this.enemyTeam, updatedEnemy);
    this.typewriterLog(log);

    if (newHp <= 0) {
      updatedEnemy.fainted = true;
      setTimeout(() => {
        this.typewriterLog(`¡${enemy.name} se debilitó!`);
        setTimeout(() => this.checkNextEnemy(), 2500);
      }, 2000);
      return;
    }

    setTimeout(() => this.enemyTurn(), 3000);
  }

  updateTeamPokemon(teamSignal: any, updated: BattlePokemon) {
    teamSignal.update((team: BattlePokemon[]) =>
      team.map((p) => (p.id === updated.id ? updated : p)),
    );
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
    this.isPlayerTurn.set(true);
  }

  async enemyTurn() {
    if (this.phase() !== 'battle') return;

    const player = this.activePokemon()!;
    const enemy = this.activeEnemy()!;

    const availableMoves = enemy.moves.filter((m) => m.power > 0);
    const move =
      availableMoves.length > 0
        ? availableMoves[Math.floor(Math.random() * availableMoves.length)]
        : enemy.moves[0];

    if (move.power === 0) {
      this.typewriterLog(`¡${enemy.name} usó ${move.name}! Pero no hizo daño.`);
      setTimeout(() => this.isPlayerTurn.set(true), 3000);
      return;
    }

    this.flashEnemy();
    setTimeout(() => this.shakePlayer(), 200);

    const effectiveness = await this.getTypeEffectiveness(move.type, player.types);
    this.playHitSound(effectiveness);
    const damage = this.calculateDamage(enemy, player, move, effectiveness);
    const newHp = Math.max(0, player.hp - damage);

    let log = `¡${enemy.name} usó ${move.name}! ${player.name} perdió ${damage} HP.`;
    if (effectiveness >= 2) log += ' ¡Es muy eficaz!';
    else if (effectiveness < 1 && effectiveness > 0) log += ' No es muy eficaz...';
    else if (effectiveness === 0) log = `¡No afecta a ${player.name}!`;

    const updatedPlayer = { ...player, hp: newHp };
    this.activePokemon.set(updatedPlayer);
    this.updateTeamPokemon(this.playerTeam, updatedPlayer);
    this.typewriterLog(log);

    if (newHp <= 0) {
      updatedPlayer.fainted = true;
      setTimeout(() => {
        this.typewriterLog(`¡${player.name} se debilitó!`);
        setTimeout(() => this.checkNextPlayer(), 2500);
      }, 2000);
      return;
    }

    setTimeout(() => this.isPlayerTurn.set(true), 3000);
  }

  checkNextPlayer() {
    const alivePlayers = this.playerTeam().filter((p) => !p.fainted);
    if (alivePlayers.length === 0) {
      this.endBattle(false);
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
    this.isPlayerTurn.set(false);
    setTimeout(() => this.enemyTurn(), 3000);
  }

  async endBattle(won: boolean) {
    this.playerWon.set(won);
    this.phase.set('result');

    if (won) {
      this.typewriterLog('¡Ganaste la batalla!');
      const userId = this.authService.currentUser()?.uid;
      if (userId) {
        for (const pokemon of this.enemyTeam()) {
          await this.firestoreService.addToCollection(userId, pokemon.id);
        }
      }
    } else {
      this.typewriterLog('¡Perdiste la batalla!');
    }
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

  newBattle() {
    this.router.navigate(['/game']);
  }
}
