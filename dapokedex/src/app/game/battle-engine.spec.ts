import {
  BattleMove,
  allowedMoves,
  beginBattle,
  BattleState,
  Combatant,
  STRUGGLE,
  calcHp,
  calcStat,
  chooseEnemyAction,
  chooseEnemyReplacement,
  createCombatant,
  damage,
  effectiveSpeed,
  isSupportedMove,
  resolveTurn,
  stageMultiplier,
  toBattleMove,
  tidy,
  typeEffectiveness,
} from './battle-engine';

/** Azar fijo: siempre devuelve el mismo valor. */
const fixed = (v: number) => () => v;
/** Azar en secuencia, repitiendo el último valor. */
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

function move(partial: Partial<BattleMove>): BattleMove {
  return {
    ...STRUGGLE,
    key: 'tackle',
    name: 'Placaje',
    type: 'normal',
    power: 40,
    accuracy: 100,
    pp: 35,
    maxPp: 35,
    ...partial,
  };
}

function mon(partial: Partial<Combatant> & { base?: Partial<Record<string, number>> } = {}) {
  const base = {
    hp: 80,
    attack: 80,
    defense: 80,
    specialAttack: 80,
    specialDefense: 80,
    speed: 80,
  };
  const c = createCombatant({
    id: partial.id ?? 1,
    name: partial.name ?? 'Prueba',
    level: partial.level ?? 50,
    types: partial.types ?? ['normal'],
    sprite: '',
    shiny: false,
    base: { ...base, ...(partial.base ?? {}) },
    moves: partial.moves ?? [move({})],
  });
  return { ...c, ...partial, base: undefined } as Combatant;
}

function battle(player: Combatant[], enemy: Combatant[]): BattleState {
  return {
    player: { team: player, active: 0 },
    enemy: { team: enemy, active: 0 },
    turn: 0,
    weather: null,
  };
}

describe('textos', () => {
  it('escribe bien al rival', () => {
    expect(tidy('¡el Gyarados rival usó Surf!')).toBe('¡El Gyarados rival usó Surf!');
    expect(tidy('No afecta a el Gyarados rival…')).toBe('No afecta al Gyarados rival…');
    expect(tidy('¡Ataque de el Gyarados rival bajó!')).toBe('¡Ataque del Gyarados rival bajó!');
    expect(tidy('¡A el Gyarados rival no le quedan movimientos!')).toBe(
      '¡Al Gyarados rival no le quedan movimientos!',
    );
  });
});

describe('tabla de tipos', () => {
  it('combina los dos tipos del defensor', () => {
    expect(typeEffectiveness('electric', ['water', 'flying'])).toBe(4);
    expect(typeEffectiveness('ground', ['flying'])).toBe(0);
    expect(typeEffectiveness('fire', ['water', 'rock'])).toBe(0.25);
    expect(typeEffectiveness('typeless', ['ghost'])).toBe(1);
  });
});

describe('características', () => {
  it('usa la fórmula oficial con IV 31 y sin EV', () => {
    // Charizard a nivel 50: 153 PS y 104 de Velocidad.
    expect(calcHp(78, 50)).toBe(153);
    expect(calcStat(100, 50)).toBe(120);
  });

  it('aplica las etapas y la parálisis a la velocidad', () => {
    expect(stageMultiplier(2)).toBe(2);
    expect(stageMultiplier(-1)).toBeCloseTo(2 / 3);
    const p = mon({ base: { speed: 100 } });
    expect(effectiveSpeed({ ...p, status: 'par' })).toBe(60);
  });
});

describe('daño', () => {
  it('aplica STAB, eficacia y crítico', () => {
    const atk = mon({ types: ['fire'] });
    const def = mon();
    const flame = move({ type: 'fire', power: 90, damageClass: 'special' });
    const normal = damage(atk, def, flame, 1, false, fixed(0.999));
    expect(damage(atk, def, flame, 2, false, fixed(0.999))).toBe(normal * 2);
    expect(damage(atk, def, flame, 1, true, fixed(0.999))).toBeGreaterThan(normal);
    const noStab = damage(mon(), def, flame, 1, false, fixed(0.999));
    expect(normal).toBeGreaterThan(noStab);
  });

  it('la quemadura reduce a la mitad el daño físico', () => {
    const atk = mon();
    const def = mon();
    const tackle = move({ power: 80 });
    const sano = damage(atk, def, tackle, 1, false, fixed(0.5));
    const quemado = damage({ ...atk, status: 'brn' }, def, tackle, 1, false, fixed(0.5));
    expect(quemado).toBe(Math.max(1, Math.floor(sano / 2)));
  });
});

describe('orden del turno', () => {
  it('ataca primero el más rápido', () => {
    const lento = mon({ id: 1, name: 'Lento', base: { speed: 30 } });
    const rapido = mon({ id: 2, name: 'Rápido', base: { speed: 120 } });
    const { events } = resolveTurn(
      battle([lento], [rapido]),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    const usos = events.filter((e) => e.text.includes('usó'));
    expect(usos[0].text).toContain('Rápido');
  });

  it('la prioridad gana a la velocidad', () => {
    const quick = move({ key: 'quick-attack', name: 'Ataque Rápido', priority: 1 });
    const lento = mon({ id: 1, name: 'Lento', base: { speed: 30 }, moves: [quick] });
    const rapido = mon({ id: 2, name: 'Rápido', base: { speed: 120 } });
    const { events } = resolveTurn(
      battle([lento], [rapido]),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(events.find((e) => e.text.includes('usó'))!.text).toContain('Lento');
  });

  it('cambiar de Pokémon va antes que cualquier ataque', () => {
    const a = mon({ id: 1, name: 'Uno', base: { speed: 10 } });
    const b = mon({ id: 2, name: 'Dos' });
    const rival = mon({ id: 3, name: 'Rival', base: { speed: 200 } });
    const { state, events } = resolveTurn(
      battle([a, b], [rival]),
      { kind: 'switch', index: 1 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(events[0].text).toContain('Vuelve');
    expect(state.player.active).toBe(1);
    // El ataque del rival lo recibe el Pokémon que acaba de entrar.
    expect(state.player.team[1].hp).toBeLessThan(state.player.team[1].maxHp);
    expect(state.player.team[0].hp).toBe(state.player.team[0].maxHp);
  });

  it('el segundo no actúa si el primero lo debilita', () => {
    const fuerte = mon({
      id: 1,
      name: 'Fuerte',
      base: { speed: 200 },
      moves: [move({ power: 250 })],
    });
    const debil = mon({ id: 2, name: 'Débil', level: 5 });
    const { state, events } = resolveTurn(
      battle([fuerte], [debil]),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(state.enemy.team[0].fainted).toBe(true);
    expect(events.filter((e) => e.text.includes('usó'))).toHaveLength(1);
    expect(events.some((e) => e.koBy === 1)).toBe(true);
  });
});

describe('efectos', () => {
  it('un movimiento de estado paraliza y el eléctrico es inmune', () => {
    const onda = move({
      key: 'thunder-wave',
      name: 'Onda Trueno',
      damageClass: 'status',
      power: 0,
      ailment: 'par',
      type: 'electric',
    });
    const user = mon({ id: 1, moves: [onda], base: { speed: 200 } });
    const { state } = resolveTurn(
      battle([user], [mon({ id: 2 })]),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(state.enemy.team[0].status).toBe('par');

    const inmune = resolveTurn(
      battle([user], [mon({ id: 2, types: ['electric'] })]),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(inmune.state.enemy.team[0].status).toBeNull();
  });

  it('Tóxico envenena gravemente y el daño crece cada turno', () => {
    const toxico = move({
      key: 'toxic',
      name: 'Tóxico',
      damageClass: 'status',
      power: 0,
      ailment: 'psn',
      type: 'poison',
    });
    const user = mon({ id: 1, moves: [toxico], base: { speed: 200, hp: 255 } });
    const rival = mon({ id: 2, moves: [move({ power: 1 })], base: { hp: 255 } });
    let s = battle([user], [rival]);
    s = resolveTurn(s, { kind: 'move', index: 0 }, { kind: 'move', index: 0 }, fixed(0.5)).state;
    const tras1 = s.enemy.team[0].hp;
    expect(s.enemy.team[0].status).toBe('tox');
    s = resolveTurn(s, { kind: 'move', index: 0 }, { kind: 'move', index: 0 }, fixed(0.5)).state;
    const perdida1 = s.enemy.team[0].maxHp - tras1;
    const perdida2 = tras1 - s.enemy.team[0].hp;
    expect(perdida2).toBeGreaterThan(perdida1);
  });

  it('Danza Espada sube dos etapas el Ataque del usuario', () => {
    const danza = move({
      key: 'swords-dance',
      name: 'Danza Espada',
      damageClass: 'status',
      power: 0,
      accuracy: null,
      effectTarget: 'user',
      statChanges: [{ stat: 'attack', change: 2 }],
    });
    const user = mon({ id: 1, moves: [danza] });
    const { state, events } = resolveTurn(
      battle([user], [mon({ id: 2 })]),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(state.player.team[0].stages.attack).toBe(2);
    expect(events.some((e) => e.text.includes('subió mucho'))).toBe(true);
  });

  it('el sueño impide atacar hasta despertar', () => {
    const dormido = mon({ id: 1, name: 'Dormilón', status: 'slp', sleepTurns: 1 });
    const { events } = resolveTurn(
      battle([dormido], [mon({ id: 2 })]),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(events.some((e) => e.text.includes('dormido'))).toBe(true);
    expect(events.some((e) => e.text.includes('Dormilón usó'))).toBe(false);
  });

  it('falla si no supera la precisión', () => {
    const fallon = move({ accuracy: 50 });
    const { state, events } = resolveTurn(
      battle([mon({ id: 1, moves: [fallon], base: { speed: 200 } })], [mon({ id: 2 })]),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      seq(0.9, 0.9),
    );
    expect(events.some((e) => e.text.includes('falló'))).toBe(true);
    expect(state.enemy.team[0].hp).toBe(state.enemy.team[0].maxHp);
  });

  it('Forcejeo quita un cuarto de los PS máximos al usuario', () => {
    const user = mon({ id: 1, moves: [move({ pp: 0 })], base: { speed: 200 } });
    const { state } = resolveTurn(
      battle([user], [mon({ id: 2, moves: [move({ power: 1 })] })]),
      { kind: 'struggle' },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    const p = state.player.team[0];
    expect(p.maxHp - p.hp).toBeGreaterThanOrEqual(Math.floor(p.maxHp / 4));
  });

  it('Autodestrucción debilita al usuario aunque falle', () => {
    const boom = move({ key: 'self-destruct', name: 'Autodestrucción', power: 200, selfKo: true });
    const { state } = resolveTurn(
      battle(
        [mon({ id: 1, moves: [boom], base: { speed: 200 } }), mon({ id: 3 })],
        [mon({ id: 2, types: ['ghost'] })],
      ),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(state.player.team[0].fainted).toBe(true);
  });

  it('tras Hiperrayo pierde el turno siguiente', () => {
    const hiper = move({ key: 'hyper-beam', name: 'Hiperrayo', power: 150, recharge: true });
    const user = mon({ id: 1, name: 'Usuario', moves: [hiper], base: { speed: 200, hp: 255 } });
    let s = battle(
      [user],
      [mon({ id: 2, moves: [move({ power: 1 })], base: { hp: 255, defense: 255 } })],
    );
    s = resolveTurn(s, { kind: 'move', index: 0 }, { kind: 'move', index: 0 }, fixed(0.5)).state;
    expect(s.player.team[0].recharging).toBe(true);
    const { state, events } = resolveTurn(
      s,
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(events.some((e) => e.text.includes('necesita recuperarse'))).toBe(true);
    expect(state.player.team[0].moves[0].pp).toBe(s.player.team[0].moves[0].pp);
    expect(state.player.team[0].recharging).toBe(false);
  });

  it('gasta PP al usar un movimiento', () => {
    const { state } = resolveTurn(
      battle([mon({ id: 1 })], [mon({ id: 2 })]),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(state.player.team[0].moves[0].pp).toBe(34);
  });
});

describe('IA del rival', () => {
  it('elige el movimiento más eficaz', () => {
    const rival = mon({
      id: 2,
      types: ['water'],
      moves: [move({ name: 'Placaje' }), move({ name: 'Surf', type: 'water', power: 90 })],
    });
    const jugador = mon({ id: 1, types: ['fire'] });
    const action = chooseEnemyAction(battle([jugador], [rival]), fixed(0.5));
    expect(action).toEqual({ kind: 'move', index: 1 });
  });

  it('saca al Pokémon que mejor pega al del jugador', () => {
    const fuego = mon({ id: 1, types: ['fire'] });
    const planta = mon({ id: 2, types: ['grass'], moves: [move({ type: 'grass', power: 90 })] });
    const agua = mon({ id: 3, types: ['water'], moves: [move({ type: 'water', power: 90 })] });
    const caido = { ...mon({ id: 4 }), fainted: true };
    expect(chooseEnemyReplacement(battle([fuego], [caido, planta, agua]))).toBe(2);
  });
});

describe('conversión desde PokeAPI', () => {
  it('reconoce efectos sobre el usuario y sobre el rival', () => {
    const swords = toBattleMove({
      name: 'swords-dance',
      power: null,
      accuracy: null,
      pp: 20,
      type: { name: 'normal' },
      damage_class: { name: 'status' },
      target: { name: 'user' },
      stat_changes: [{ change: 2, stat: { name: 'attack' } }],
      meta: {
        category: { name: 'net-good-stats' },
        ailment: { name: 'none' },
        ailment_chance: 0,
        crit_rate: 0,
        drain: 0,
        healing: 0,
        flinch_chance: 0,
        stat_chance: 0,
        min_hits: null,
        max_hits: null,
      },
    });
    expect(swords.effectTarget).toBe('user');
    expect(isSupportedMove(swords, 'net-good-stats')).toBe(true);

    const closeCombat = toBattleMove({
      name: 'close-combat',
      power: 120,
      accuracy: 100,
      pp: 5,
      type: { name: 'fighting' },
      damage_class: { name: 'physical' },
      target: { name: 'selected-pokemon' },
      stat_changes: [{ change: -1, stat: { name: 'defense' } }],
      meta: {
        category: { name: 'damage-raise' },
        ailment: { name: 'none' },
        ailment_chance: 0,
        crit_rate: 0,
        drain: 0,
        healing: 0,
        flinch_chance: 0,
        stat_chance: 100,
        min_hits: null,
        max_hits: null,
      },
    });
    expect(closeCombat.effectTarget).toBe('user');
    expect(closeCombat.statChanges).toEqual([{ stat: 'defense', change: -1 }]);
  });

  it('descarta movimientos que el motor no sabe aplicar', () => {
    const sismico = toBattleMove({
      name: 'seismic-toss',
      power: null,
      accuracy: 100,
      pp: 20,
      type: { name: 'fighting' },
      damage_class: { name: 'physical' },
    });
    expect(isSupportedMove(sismico, 'damage')).toBe(false);
  });
});

describe('tiempo atmosférico', () => {
  const danzaLluvia = move({
    key: 'rain-dance',
    name: 'Danza Lluvia',
    damageClass: 'status',
    power: 0,
    accuracy: null,
    type: 'water',
    weather: 'rain',
  });

  it('Danza Lluvia trae lluvia 5 turnos y potencia el Agua', () => {
    const user = mon({ id: 1, moves: [danzaLluvia], base: { speed: 200 } });
    const { state, events } = resolveTurn(
      battle([user], [mon({ id: 2, moves: [move({ power: 1 })] })]),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(state.weather).toEqual({ kind: 'rain', turns: 4 });
    expect(events.some((e) => e.text === '¡Empezó a llover!')).toBe(true);

    const surf = move({ type: 'water', power: 90, damageClass: 'special' });
    const atk = mon({ types: ['water'] });
    const seco = damage(atk, mon(), surf, 1, false, fixed(0.5));
    expect(damage(atk, mon(), surf, 1, false, fixed(0.5), 'rain')).toBe(Math.floor(seco * 1.5));
  });

  it('la tormenta de arena daña a quien no es Roca, Tierra ni Acero', () => {
    const s = battle(
      [mon({ id: 1, types: ['fire'], moves: [move({ power: 1 })] })],
      [mon({ id: 2, types: ['rock'], moves: [move({ power: 1 })] })],
    );
    s.weather = { kind: 'sand', turns: 5 };
    const { state } = resolveTurn(
      s,
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    const fuego = state.player.team[0];
    const roca = state.enemy.team[0];
    expect(fuego.maxHp - fuego.hp).toBeGreaterThanOrEqual(Math.floor(fuego.maxHp / 16));
    expect(roca.maxHp - roca.hp).toBeLessThan(Math.floor(roca.maxHp / 16));
  });

  it('Llovizna pone lluvia al entrar y Nado Rápido dobla la velocidad', () => {
    const kyogre = mon({ id: 1, ability: 'drizzle', abilityName: 'Llovizna' });
    const { state } = beginBattle(battle([kyogre], [mon({ id: 2 })]));
    expect(state.weather?.kind).toBe('rain');
    const nadador = mon({ ability: 'swift-swim', base: { speed: 80 } });
    expect(effectiveSpeed(nadador, 'rain')).toBe(effectiveSpeed(nadador) * 2);
  });
});

describe('habilidades', () => {
  it('Intimidación baja el Ataque del rival al entrar', () => {
    const { state, events } = beginBattle(
      battle(
        [mon({ id: 1, ability: 'intimidate', abilityName: 'Intimidación' })],
        [mon({ id: 2 })],
      ),
    );
    expect(state.enemy.team[0].stages.attack).toBe(-1);
    expect(events[0].text).toBe('¡Intimidación de Prueba!');
  });

  it('Levitación anula los ataques de Tierra', () => {
    const terremoto = move({ type: 'ground', power: 100 });
    const { state } = resolveTurn(
      battle(
        [mon({ id: 1, moves: [terremoto], base: { speed: 200 } })],
        [
          mon({
            id: 2,
            ability: 'levitate',
            abilityName: 'Levitación',
            moves: [move({ power: 1 })],
          }),
        ],
      ),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(state.enemy.team[0].hp).toBe(state.enemy.team[0].maxHp);
  });

  it('Absorbe Agua cura en vez de recibir daño', () => {
    const surf = move({ type: 'water', power: 90 });
    const s = battle(
      [mon({ id: 1, moves: [surf], base: { speed: 200 } })],
      [
        mon({
          id: 2,
          ability: 'water-absorb',
          abilityName: 'Absorbe Agua',
          moves: [move({ power: 1 })],
        }),
      ],
    );
    s.enemy.team[0].hp = 50;
    const { state } = resolveTurn(
      s,
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(state.enemy.team[0].hp).toBeGreaterThan(50);
  });

  it('Robustez aguanta con 1 PS un golpe que debilitaría', () => {
    const golpe = move({ power: 250 });
    const { state } = resolveTurn(
      battle(
        [mon({ id: 1, moves: [golpe], base: { speed: 200 } })],
        [
          mon({
            id: 2,
            level: 5,
            ability: 'sturdy',
            abilityName: 'Robustez',
            moves: [move({ power: 1 })],
          }),
        ],
      ),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(state.enemy.team[0].hp).toBe(1);
  });

  it('Potencia dobla el daño físico y Cuerpo Puro evita bajadas', () => {
    const atk = mon();
    const fuerte = mon({ ability: 'huge-power' });
    const golpe = move({ power: 80 });
    expect(damage(fuerte, mon(), golpe, 1, false, fixed(0.5))).toBeGreaterThan(
      damage(atk, mon(), golpe, 1, false, fixed(0.5)) * 1.8,
    );
    const { state } = beginBattle(
      battle(
        [mon({ id: 1, ability: 'intimidate', abilityName: 'Intimidación' })],
        [mon({ id: 2, ability: 'clear-body', abilityName: 'Cuerpo Puro' })],
      ),
    );
    expect(state.enemy.team[0].stages.attack).toBe(0);
  });
});

describe('objetos', () => {
  it('Restos recupera 1/16 de los PS al final del turno', () => {
    const s = battle(
      [mon({ id: 1, item: 'leftovers', itemName: 'Restos', moves: [move({ power: 1 })] })],
      [mon({ id: 2, moves: [move({ power: 1 })] })],
    );
    s.player.team[0].hp = 50;
    const { state, events } = resolveTurn(
      s,
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(events.some((e) => e.text.includes('Restos'))).toBe(true);
    expect(state.player.team[0].hp).toBeGreaterThanOrEqual(
      50 - 2 + Math.floor(s.player.team[0].maxHp / 16) - 1,
    );
  });

  it('Banda Aguante salva de un golpe con los PS al máximo y se gasta', () => {
    const { state } = resolveTurn(
      battle(
        [mon({ id: 1, moves: [move({ power: 250 })], base: { speed: 200 } })],
        [
          mon({
            id: 2,
            level: 5,
            item: 'focus-sash',
            itemName: 'Banda Aguante',
            moves: [move({ power: 1 })],
          }),
        ],
      ),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(state.enemy.team[0].hp).toBe(1);
    expect(state.enemy.team[0].item).toBeNull();
  });

  it('Baya Zidra cura al bajar de la mitad', () => {
    const s = battle(
      [mon({ id: 1, moves: [move({ power: 60 })], base: { speed: 200 } })],
      [mon({ id: 2, item: 'sitrus-berry', itemName: 'Baya Zidra', moves: [move({ power: 1 })] })],
    );
    s.enemy.team[0].hp = Math.floor(s.enemy.team[0].maxHp * 0.55);
    const { state, events } = resolveTurn(
      s,
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(events.some((e) => e.text.includes('Baya Zidra'))).toBe(true);
    expect(state.enemy.team[0].item).toBeNull();
  });

  it('Cinta Elección ata al primer movimiento usado', () => {
    const user = mon({
      id: 1,
      item: 'choice-band',
      itemName: 'Cinta Elección',
      moves: [move({ name: 'Uno' }), move({ name: 'Dos' })],
      base: { hp: 255 },
    });
    let s = battle([user], [mon({ id: 2, moves: [move({ power: 1 })], base: { hp: 255 } })]);
    s = resolveTurn(s, { kind: 'move', index: 0 }, { kind: 'move', index: 0 }, fixed(0.5)).state;
    expect(allowedMoves(s.player.team[0])).toEqual([0]);
    const { events } = resolveTurn(
      s,
      { kind: 'move', index: 1 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    expect(events.some((e) => e.text.includes('usó Uno'))).toBe(true);
    expect(events.some((e) => e.text.includes('usó Dos'))).toBe(false);
  });

  it('Vidasfera pega más fuerte pero quita un 10 % de PS', () => {
    const golpe = move({ power: 80 });
    expect(damage(mon({ item: 'life-orb' }), mon(), golpe, 1, false, fixed(0.5))).toBeGreaterThan(
      damage(mon(), mon(), golpe, 1, false, fixed(0.5)),
    );
    const { state } = resolveTurn(
      battle(
        [
          mon({
            id: 1,
            item: 'life-orb',
            itemName: 'Vidasfera',
            moves: [golpe],
            base: { speed: 200 },
          }),
        ],
        [mon({ id: 2, moves: [move({ power: 1 })], base: { hp: 255 } })],
      ),
      { kind: 'move', index: 0 },
      { kind: 'move', index: 0 },
      fixed(0.5),
    );
    const p = state.player.team[0];
    expect(p.maxHp - p.hp).toBeGreaterThanOrEqual(Math.floor(p.maxHp / 10));
  });
});
