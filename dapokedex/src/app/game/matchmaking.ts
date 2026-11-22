// Emparejamiento de rivales: en lugar de sacarlos totalmente al azar (un
// Caterpie contra un Venusaur), se eligen con una fuerza parecida a la del
// equipo del jugador, medida como la suma de estadísticas base.

export interface Candidate {
  id: number;
  /** Suma de las seis estadísticas base. */
  bst: number;
}

/** Un poco por encima de tu equipo para que ganar cueste algo. */
export const DIFFICULTY = 1.05;

export function baseStatTotal(stats: { base_stat: number }[]): number {
  return stats.reduce((sum, s) => sum + s.base_stat, 0);
}

/** Elige los `count` candidatos más cercanos a la fuerza objetivo y los baraja. */
export function pickBalancedEnemies(
  candidates: Candidate[],
  teamBst: number[],
  count: number,
  random: () => number = Math.random,
): number[] {
  if (teamBst.length === 0) return candidates.slice(0, count).map((c) => c.id);
  const target = (teamBst.reduce((a, b) => a + b, 0) / teamBst.length) * DIFFICULTY;
  const unique = [...new Map(candidates.map((c) => [c.id, c])).values()];
  const chosen = unique
    .sort((a, b) => Math.abs(a.bst - target) - Math.abs(b.bst - target))
    .slice(0, count);
  // Barajado de Fisher-Yates para que el orden de salida no sea siempre el mismo.
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen.map((c) => c.id);
}
