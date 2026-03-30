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
}

interface BattleLogEntry {
  id: number;
  text: string;
  visible: boolean;
}

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

  playerPokemon = signal<BattlePokemon | null>(null);
  enemyPokemon = signal<BattlePokemon | null>(null);
  battleLogs = signal<BattleLogEntry[]>([]);
  isPlayerTurn = signal(true);
  battleOver = signal(false);
  playerWon = signal(false);
  loading = signal(true);
  private logCounter = 0;

  addLog(text: string) {
    const id = this.logCounter++;
    this.battleLogs.update((logs) => [...logs, { id, text, visible: true }]);

    setTimeout(() => {
      this.battleLogs.update((logs) =>
        logs.map((l) => (l.id === id ? { ...l, visible: false } : l)),
      );
    }, 2500);

    setTimeout(() => {
      this.battleLogs.update((logs) => logs.filter((l) => l.id !== id));
    }, 3500);
  }

  async ngOnInit() {
    const userId = this.authService.currentUser()?.uid;
    if (!userId) return;

    const pokemonId = this.route.snapshot.queryParams['pokemonId'];
    let selectedId = pokemonId;

    if (!selectedId) {
      const starterId = await this.firestoreService.getStarter(userId);
      if (!starterId) {
        this.router.navigate(['/game']);
        return;
      }
      selectedId = starterId;
    }

    const [playerData, enemyData] = await Promise.all([
      fetch(`https://pokeapi.co/api/v2/pokemon/${selectedId}`).then((r) => r.json()),
      fetch(`https://pokeapi.co/api/v2/pokemon/${this.getRandomEnemyId()}`).then((r) => r.json()),
    ]);

    const [player, enemy] = await Promise.all([
      this.mapPokemon(playerData),
      this.mapPokemon(enemyData),
    ]);

    this.playerPokemon.set(player);
    this.enemyPokemon.set(enemy);
    this.addLog(`¡Un ${enemyData.name} salvaje apareció!`);
    this.loading.set(false);
  }

  getRandomEnemyId(): number {
    return Math.floor(Math.random() * 151) + 1;
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
    };
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
    if (!this.isPlayerTurn() || this.battleOver()) return;

    const player = this.playerPokemon()!;
    const enemy = this.enemyPokemon()!;

    if (move.power === 0) {
      this.addLog(`¡${player.name} usó ${move.name}! Pero no hizo daño.`);
      this.isPlayerTurn.set(false);
      setTimeout(() => this.enemyTurn(), 1200);
      return;
    }

    const effectiveness = await this.getTypeEffectiveness(move.type, enemy.types);
    const damage = this.calculateDamage(player, enemy, move, effectiveness);
    const newHp = Math.max(0, enemy.hp - damage);

    let log = `¡${player.name} usó ${move.name}! ${enemy.name} perdió ${damage} HP.`;
    if (effectiveness >= 2) log += ' ¡Es muy eficaz!';
    else if (effectiveness < 1 && effectiveness > 0) log += ' No es muy eficaz...';
    else if (effectiveness === 0) log = `¡No afecta a ${enemy.name}!`;

    this.enemyPokemon.set({ ...enemy, hp: newHp });
    this.addLog(log);

    if (newHp <= 0) {
      this.addLog(`¡${enemy.name} se debilitó! ¡Ganaste!`);
      this.battleOver.set(true);
      this.playerWon.set(true);
      await this.firestoreService.addToCollection(this.authService.currentUser()!.uid, enemy.id);
      return;
    }

    this.isPlayerTurn.set(false);
    setTimeout(() => this.enemyTurn(), 1200);
  }

  async enemyTurn() {
    const player = this.playerPokemon()!;
    const enemy = this.enemyPokemon()!;

    const availableMoves = enemy.moves.filter((m) => m.power > 0);
    const move =
      availableMoves.length > 0
        ? availableMoves[Math.floor(Math.random() * availableMoves.length)]
        : enemy.moves[0];

    if (move.power === 0) {
      this.addLog(`¡${enemy.name} usó ${move.name}! Pero no hizo daño.`);
      this.isPlayerTurn.set(true);
      return;
    }

    const effectiveness = await this.getTypeEffectiveness(move.type, player.types);
    const damage = this.calculateDamage(enemy, player, move, effectiveness);
    const newHp = Math.max(0, player.hp - damage);

    let log = `¡${enemy.name} usó ${move.name}! ${player.name} perdió ${damage} HP.`;
    if (effectiveness >= 2) log += ' ¡Es muy eficaz!';
    else if (effectiveness < 1 && effectiveness > 0) log += ' No es muy eficaz...';
    else if (effectiveness === 0) log = `¡No afecta a ${player.name}!`;

    this.playerPokemon.set({ ...player, hp: newHp });
    this.addLog(log);

    if (newHp <= 0) {
      this.addLog(`¡${player.name} se debilitó! Perdiste...`);
      this.battleOver.set(true);
      this.playerWon.set(false);
      return;
    }

    this.isPlayerTurn.set(true);
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
    this.router.navigate(['/collection']);
  }

  newBattle() {
    this.loading.set(true);
    this.battleOver.set(false);
    this.playerWon.set(false);
    this.isPlayerTurn.set(true);
    this.playerPokemon.set(null);
    this.enemyPokemon.set(null);
    this.battleLogs.set([]);
    this.ngOnInit();
  }
}
