import { BattleMove, Combatant, STRUGGLE, createCombatant } from './battle-engine';
import {
  LogEntry,
  applyEntry,
  autoChoice,
  begin,
  completeEntry,
  initialState,
  mirror,
  needOf,
  outcome,
  replay,
  rngFor,
  seededRng,
} from './online-battle';

function move(partial: Partial<BattleMove> = {}): BattleMove {
  return {
    ...STRUGGLE,
    key: 'tackle',
    name: 'Placaje',
    type: 'normal',
    power: 40,
    accuracy: 90,
    pp: 35,
    maxPp: 35,
    critRate: 0,
    ...partial,
  };
}

function mon(id: number, hp = 80, speed = 80): Combatant {
  return createCombatant({
    id,
    name: `P${id}`,
    level: 50,
    types: ['normal'],
    sprite: '',
    shiny: false,
    base: { hp, attack: 90, defense: 70, specialAttack: 70, specialDefense: 70, speed },
    moves: [move(), move({ key: 'slam', name: 'Atizar', power: 80, accuracy: 75 })],
  });
}

const host = () => [mon(1), mon(2)];
const guest = () => [mon(3, 90, 70), mon(4)];

describe('combate en línea', () => {
  it('el generador con semilla repite la misma secuencia', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const xs = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(rngFor(42, 1)()).not.toBe(rngFor(42, 2)());
  });

  it('los dos jugadores obtienen el mismo combate', () => {
    const log: LogEntry[] = [];
    let state = begin(initialState(host(), guest()), 7, 'player').state;
    for (let i = 0; i < 40 && !outcome(state); i++) {
      const pending = {
        host:
          autoChoice(state, 'host') ??
          (needOf(state, 'host') === 'replace' ? 1 : { kind: 'move' as const, index: i % 2 }),
        guest:
          autoChoice(state, 'guest') ??
          (needOf(state, 'guest') === 'replace' ? 1 : { kind: 'move' as const, index: 0 }),
      };
      const entry = completeEntry(state, pending);
      expect(entry).not.toBeNull();
      state = applyEntry(state, entry!, 7, log.length, 'player').state;
      log.push(entry!);
    }
    expect(outcome(state)).not.toBeNull();

    const hostView = replay(host(), guest(), 7, log, 'player');
    const guestView = replay(host(), guest(), 7, log, 'enemy');
    // Los textos cambian según quién mira, pero el estado es idéntico.
    expect(JSON.stringify(guestView)).toBe(JSON.stringify(hostView));
    expect(JSON.stringify(hostView)).toBe(JSON.stringify(state));
  });

  it('cuenta los mensajes desde el lado de cada jugador', () => {
    const start = begin(initialState(host(), guest()), 3, 'player').state;
    const entry: LogEntry = {
      t: 'turn',
      h: { kind: 'move', index: 0 },
      g: { kind: 'move', index: 0 },
    };
    const asHost = applyEntry(start, entry, 3, 0, 'player').events.map((e) => e.text);
    const asGuest = applyEntry(start, entry, 3, 0, 'enemy').events.map((e) => e.text);
    expect(asHost.some((t) => t.includes('P3 rival'))).toBe(true);
    expect(asGuest.some((t) => t.includes('P1 rival'))).toBe(true);
    expect(asGuest.some((t) => t.includes('P3 rival'))).toBe(false);
  });

  it('espera a que los dos decidan antes de resolver el turno', () => {
    const state = initialState(host(), guest());
    expect(completeEntry(state, { host: { kind: 'move', index: 0 } })).toBeNull();
    expect(
      completeEntry(state, { host: { kind: 'move', index: 0 }, guest: { kind: 'move', index: 1 } }),
    ).toEqual({ t: 'turn', h: { kind: 'move', index: 0 }, g: { kind: 'move', index: 1 } });
  });

  it('solo sustituye quien tiene el Pokémon debilitado', () => {
    const state = initialState(host(), guest());
    state.enemy.team[0].fainted = true;
    state.enemy.team[0].hp = 0;
    expect(needOf(state, 'guest')).toBe('replace');
    expect(needOf(state, 'host')).toBeNull();
    expect(autoChoice(state, 'guest')).toBe(1);
    expect(completeEntry(state, { guest: 1 })).toEqual({ t: 'replace', h: null, g: 1 });
  });

  it('da la vuelta al estado para el invitado', () => {
    const state = initialState(host(), guest());
    const m = mirror(state);
    expect(m.player.team[0].id).toBe(3);
    expect(m.enemy.team[0].id).toBe(1);
  });

  it('detecta el ganador', () => {
    const state = initialState(host(), guest());
    state.enemy.team.forEach((p) => (p.fainted = true));
    expect(outcome(state)).toBe('host');
  });
});
