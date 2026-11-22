import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PokemonService, getArtworkUrl } from './pokemon';
import { PokemonDetailPage } from '../interfaces/pokemon';
import {
  BattleMove,
  Combatant,
  Ivs,
  createCombatant,
  isSupportedMove,
  toBattleMove,
} from '../game/battle-engine';
import {
  HELD_ITEMS,
  SIMULATED_ABILITIES,
  TYPE_BOOST_ITEMS,
  WEATHER_ABILITIES,
  WEATHER_ROCKS,
} from '../game/battle-data';
import { Build, Nature, randomIvs, randomNature } from '../game/builds';

const SHINY_ARTWORK_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny';

// Cuántos movimientos del Pokémon consultamos para elegir 4 que tengan sentido.
const MOVE_SAMPLE_SIZE = 18;

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

/**
 * Crea los combatientes a partir de PokeAPI: movimientos, habilidad, objeto,
 * naturaleza e IV. Lo usan la batalla, el combate en línea y la preparación
 * de equipos.
 */
@Injectable({ providedIn: 'root' })
export class CombatantBuilder {
  private pokemonService = inject(PokemonService);

  /**
   * Elige 4 movimientos con sentido: ataques potentes de tipos distintos
   * (mejor si son de su tipo) y, a veces, uno de estado que el motor sabe aplicar.
   */
  async pickMoves(data: PokemonDetailPage, types: string[]): Promise<BattleMove[]> {
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
  async pickAbility(data: PokemonDetailPage): Promise<{ key: string; name: string }> {
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
  async itemInfo(key: string): Promise<{ key: string; name: string; sprite: string }> {
    const data = await firstValueFrom(
      this.pokemonService.getItem(`https://pokeapi.co/api/v2/item/${key}`),
    ).catch(() => null);
    return {
      key,
      name: data?.names.find((n) => n.language.name === 'es')?.name ?? key.replace(/-/g, ' '),
      sprite: data?.sprites.default ?? '',
    };
  }

  async pickItem(
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
    return this.itemInfo(weighted(options.filter(([k]) => HELD_ITEMS.includes(k))));
  }

  /**
   * Convierte un Pokémon de PokeAPI en combatiente. Con `build` usa los
   * movimientos y la habilidad elegidos; sin él, unos al azar con sentido.
   */
  async toCombatant(
    data: PokemonDetailPage,
    level: number,
    shiny: boolean,
    /** 'random' elige uno a su medida; una clave equipa ese; null, ninguno. */
    itemChoice: string | null,
    opts: { build?: Build; nature?: Nature; ivs?: Ivs } = {},
  ): Promise<Combatant> {
    const stat = (name: string) => data.stats.find((s) => s.stat.name === name)?.base_stat ?? 50;
    const types = data.types.map((t) => t.type.name);
    const chosen = opts.build ? await this.buildMoves(opts.build.moves) : [];
    const learnable = new Set(data.moves.map((m) => m.move.name));
    const validMoves = chosen.filter((m) => learnable.has(m.key));
    const ownAbility = data.abilities.some((a) => a.ability.name === opts.build?.ability);
    const [moves, ability] = await Promise.all([
      validMoves.length ? Promise.resolve(validMoves) : this.pickMoves(data, types),
      ownAbility ? this.abilityInfo(opts.build!.ability) : this.pickAbility(data),
    ]);
    const item =
      itemChoice === 'random'
        ? await this.pickItem(types, stat, moves, ability.key)
        : itemChoice
          ? await this.itemInfo(itemChoice)
          : { key: null, name: '', sprite: '' };
    const nature = opts.nature ?? randomNature();
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
      ivs: opts.ivs ?? randomIvs(),
      nature: { up: nature.up, down: nature.down },
    });
  }

  /** Movimientos elegidos, en el orden en que se eligieron. */
  private async buildMoves(keys: string[]): Promise<BattleMove[]> {
    const moves = await Promise.all(keys.map((k) => this.move(k)));
    return moves.filter((m): m is BattleMove => !!m);
  }

  /** Un movimiento por su clave de PokeAPI, si el motor sabe simularlo. */
  async move(key: string): Promise<BattleMove | null> {
    try {
      const d = await this.pokemonService.getMove(key);
      const move = toBattleMove(d);
      return isSupportedMove(move, d.meta?.category?.name) ? move : null;
    } catch {
      return null;
    }
  }

  /** Todos los movimientos que puede aprender y que el combate sabe simular. */
  async learnableMoves(data: PokemonDetailPage): Promise<BattleMove[]> {
    const keys = [...new Set(data.moves.map((m) => m.move.name))];
    const moves = await Promise.all(keys.map((k) => this.move(k)));
    return moves
      .filter((m): m is BattleMove => !!m && !m.ohko)
      .sort((a, b) => b.power - a.power || a.name.localeCompare(b.name));
  }

  /** Nombre en español de una habilidad. */
  async abilityInfo(key: string): Promise<{ key: string; name: string }> {
    const name = await firstValueFrom(
      this.pokemonService.getAbility(`https://pokeapi.co/api/v2/ability/${key}/`),
    )
      .then((d) => d.names.find((n) => n.language.name === 'es')?.name)
      .catch(() => undefined);
    return { key, name: name ?? key.replace(/-/g, ' ') };
  }
}
