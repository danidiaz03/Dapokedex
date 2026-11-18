import {
  XP,
  applyEvent,
  dailyChallenges,
  emptyProgress,
  levelFromXp,
  levelProgress,
  maxEnemyId,
  normalizeProgress,
  xpForLevel,
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
