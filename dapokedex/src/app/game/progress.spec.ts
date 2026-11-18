import {
  ACHIEVEMENTS,
  XP,
  applyEvent,
  dailyChallenges,
  dailyPokemonClaimed,
  dailyPokemonId,
  emptyProgress,
  levelFromXp,
  levelProgress,
  maxEnemyId,
  nextWeekStart,
  normalizeProgress,
  regionCompletion,
  trainerTitle,
  weekKey,
  xpForLevel,
  xpFromRewards,
} from './progress';

const today = '2026-11-18';
const noLuck = () => 0.99;
const options = { today, collectionSize: 0, random: noLuck };

describe('niveles', () => {
  it('sigue una curva creciente', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(299)).toBe(2);
    expect(levelFromXp(300)).toBe(3);
  });

  it('calcula el progreso dentro del nivel', () => {
    expect(levelProgress(400)).toEqual({ level: 3, current: 100, needed: 300 });
  });

  it('desbloquea regiones de rivales según el nivel', () => {
    expect(maxEnemyId(1)).toBe(151);
    expect(maxEnemyId(4)).toBe(251);
    expect(maxEnemyId(30)).toBe(1025);
  });
});

describe('retos diarios', () => {
  it('son los mismos para una misma fecha y cambian con el día', () => {
    expect(dailyChallenges(today)).toEqual(dailyChallenges(today));
    const days = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'];
    const titles = new Set(
      days.map((d) =>
        dailyChallenges(d)
          .map((c) => c.title)
          .join(),
      ),
    );
    expect(titles.size).toBeGreaterThan(1);
  });

  it('se recompensan una sola vez al completarlos', () => {
    const guess = dailyChallenges(today).find((c) => c.id === 'guess')!;
    let progress = emptyProgress();
    let completions = 0;
    for (let i = 1; i <= guess.goal + 3; i++) {
      const result = applyEvent(progress, { type: 'guess', correct: true, streak: i }, options);
      progress = result.progress;
      completions += result.rewards.filter((r) => r.kind === 'challenge').length;
    }
    expect(completions).toBe(1);
  });
});

describe('applyEvent', () => {
  it('da XP por victoria y por rivales derrotados, y desbloquea el primer logro', () => {
    const { progress, rewards } = applyEvent(
      emptyProgress(),
      { type: 'battle', won: true, kos: 3, capturedTypes: [], shinies: [] },
      options,
    );
    expect(progress.stats.battlesWon).toBe(1);
    expect(progress.xp).toBeGreaterThanOrEqual(XP.battleWin + 3 * XP.perKo);
    expect(rewards).toContainEqual(
      expect.objectContaining({ kind: 'achievement', id: 'first-win' }),
    );
  });

  it('a veces duplica la XP de victoria', () => {
    const { rewards } = applyEvent(
      emptyProgress(),
      { type: 'battle', won: true, kos: 0, capturedTypes: [], shinies: [] },
      { ...options, random: () => 0 },
    );
    expect(rewards).toContainEqual(expect.objectContaining({ kind: 'bonus' }));
    expect(rewards).toContainEqual({ kind: 'xp', amount: XP.battleWin * 2, reason: 'Victoria' });
  });

  it('anuncia la subida de nivel y la región desbloqueada', () => {
    const start = { ...emptyProgress(), xp: 290 };
    const { rewards } = applyEvent(
      start,
      { type: 'battle', won: true, kos: 0, capturedTypes: [], shinies: [] },
      options,
    );
    expect(rewards).toContainEqual({ kind: 'level', level: 3, unlock: 'Johto' });
  });

  it('solo cuenta cada shiny una vez', () => {
    const event = { type: 'battle' as const, won: true, kos: 0, capturedTypes: [], shinies: [25] };
    const first = applyEvent(emptyProgress(), event, options).progress;
    const second = applyEvent(first, event, options).progress;
    expect(second.shinies).toEqual([25]);
  });

  it('mantiene la racha en días seguidos y la reinicia si se salta uno', () => {
    let p = applyEvent(
      emptyProgress(),
      { type: 'visit' },
      { ...options, today: '2026-11-17' },
    ).progress;
    p = applyEvent(p, { type: 'visit' }, { ...options, today: '2026-11-18' }).progress;
    expect(p.streak.days).toBe(2);
    p = applyEvent(p, { type: 'visit' }, { ...options, today: '2026-11-18' }).progress;
    expect(p.streak.days).toBe(2);
    p = applyEvent(p, { type: 'visit' }, { ...options, today: '2026-11-20' }).progress;
    expect(p.streak.days).toBe(1);
  });

  it('no modifica el progreso recibido', () => {
    const start = emptyProgress();
    applyEvent(start, { type: 'guess', correct: true, streak: 1 }, options);
    expect(start).toEqual(emptyProgress());
  });
});

describe('normalizeProgress', () => {
  it('rellena los campos que faltan en datos antiguos', () => {
    const p = normalizeProgress({ xp: 50, stats: { battlesWon: 2 } as never });
    expect(p.xp).toBe(50);
    expect(p.stats.battlesWon).toBe(2);
    expect(p.stats.kos).toBe(0);
    expect(p.achievements).toEqual([]);
  });
});

describe('ranking semanal', () => {
  it('calcula la semana ISO, también en el cambio de año', () => {
    expect(weekKey(new Date(2026, 10, 18))).toBe('2026-W47');
    expect(weekKey(new Date(2026, 10, 16))).toBe('2026-W47');
    expect(weekKey(new Date(2026, 10, 15))).toBe('2026-W46');
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-W53');
  });

  it('el reinicio es el próximo lunes', () => {
    const next = nextWeekStart(new Date(2026, 10, 18, 15, 30));
    expect([next.getDate(), next.getDay(), next.getHours()]).toEqual([23, 1, 0]);
    expect(nextWeekStart(new Date(2026, 10, 16, 9)).getDate()).toBe(23);
  });

  it('suma la XP de todas las recompensas', () => {
    expect(
      xpFromRewards([
        { kind: 'xp', amount: 100, reason: 'Victoria' },
        { kind: 'streak', days: 2, xp: 20 },
        { kind: 'challenge', title: 'Reto', xp: 50 },
        { kind: 'level', level: 3 },
      ]),
    ).toBe(170);
  });
});

describe('Pokémon del día', () => {
  it('es estable durante el día y válido', () => {
    const id = dailyPokemonId(today);
    expect(dailyPokemonId(today)).toBe(id);
    expect(id).toBeGreaterThanOrEqual(1);
    expect(id).toBeLessThanOrEqual(1025);
  });

  it('solo da la recompensa una vez al día', () => {
    const first = applyEvent(emptyProgress(), { type: 'daily-pokemon' }, options);
    const second = applyEvent(first.progress, { type: 'daily-pokemon' }, options);
    expect(first.rewards).toContainEqual({
      kind: 'xp',
      amount: XP.dailyPokemon,
      reason: 'Pokémon del día',
    });
    expect(second.rewards.some((r) => r.kind === 'xp')).toBe(false);
    expect(dailyPokemonClaimed(second.progress, today)).toBe(true);
    expect(dailyPokemonClaimed(second.progress, '2026-11-19')).toBe(false);
  });
});

describe('regionCompletion', () => {
  it('cuenta por región y marca las completas', () => {
    const kanto = Array.from({ length: 151 }, (_, i) => i + 1);
    const result = regionCompletion([...kanto, 152, 152, 10034]);
    expect(result[0]).toEqual({ name: 'Kanto', count: 151, total: 151, complete: true });
    expect(result[1]).toEqual({ name: 'Johto', count: 1, total: 100, complete: false });
    expect(result.reduce((sum, r) => sum + r.total, 0)).toBe(1025);
  });
});

describe('trainerTitle', () => {
  it('usa el logro más difícil conseguido', () => {
    expect(trainerTitle([])).toBe('Novato');
    expect(trainerTitle(['first-win'])).toBe('Primera victoria');
    expect(trainerTitle(['first-win', 'first-shiny', 'wins-10'])).toBe('¡Brilla!');
  });

  it('tiene en cuenta todos los logros', () => {
    expect(ACHIEVEMENTS.every((a) => trainerTitle([a.id]) === a.title)).toBe(true);
  });
});
