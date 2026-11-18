import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of, switchMap } from 'rxjs';
import { PokemonDetailPage, PokemonType } from '../../interfaces/pokemon';
import { PokemonService } from '../../services/pokemon';
import { TypeNamePipe } from '../../pipes/type-name.pipe';
import { PokemonNamePipe } from '../../pipes/pokemon-name.pipe';

const STAT_LABELS: Record<string, string> = {
  hp: 'PS',
  attack: 'Ataque',
  defense: 'Defensa',
  'special-attack': 'At. Esp.',
  'special-defense': 'Def. Esp.',
  speed: 'Velocidad',
};
const STAT_BAR_MAX = 180;

interface Side {
  pokemon: PokemonDetailPage | null;
  types: PokemonType[];
  error: boolean;
}

/**
 * Multiplicador del mejor ataque con STAB de `attacker` contra `defender`
 * (p. ej. Blastoise contra Charizard: Agua x2).
 */
export function bestMultiplier(attackerTypes: string[], defender: PokemonType[]): number {
  return Math.max(
    ...attackerTypes.map((attacking) =>
      defender.reduce((mult, { damage_relations: r }) => {
        if (r.no_damage_from.some((t) => t.name === attacking)) return 0;
        if (r.double_damage_from.some((t) => t.name === attacking)) return mult * 2;
        if (r.half_damage_from.some((t) => t.name === attacking)) return mult * 0.5;
        return mult;
      }, 1),
    ),
  );
}

@Component({
  selector: 'app-compare',
  imports: [RouterLink, TypeNamePipe, PokemonNamePipe],
  templateUrl: './compare.html',
  styleUrl: './compare.css',
})
export class Compare {
  private service = inject(PokemonService);
  private router = inject(Router);

  /** Query params ?a=...&b=... (withComponentInputBinding). */
  a = input<string>('');
  b = input<string>('');

  /** Lista de nombres para el autocompletado de los buscadores. */
  names = toSignal(
    this.service.getAllPokemonNames().pipe(
      map((res) => res.results.map((r) => r.name)),
      catchError(() => of([] as string[])),
    ),
    { initialValue: [] as string[] },
  );

  left = toSignal(toObservable(this.a).pipe(switchMap((n) => this.loadSide(n))));
  right = toSignal(toObservable(this.b).pipe(switchMap((n) => this.loadSide(n))));

  draftA = signal('');
  draftB = signal('');

  /** Filas de estadísticas con los dos valores y quién gana. */
  stats = computed(() => {
    const a = this.left()?.pokemon;
    const b = this.right()?.pokemon;
    if (!a || !b) return [];
    return a.stats.map((s, i) => {
      const other = b.stats[i]?.base_stat ?? 0;
      return {
        label: STAT_LABELS[s.stat.name] ?? s.stat.name,
        a: s.base_stat,
        b: other,
        aPct: Math.min(100, (s.base_stat / STAT_BAR_MAX) * 100),
        bPct: Math.min(100, (other / STAT_BAR_MAX) * 100),
        winner: s.base_stat === other ? null : s.base_stat > other ? 'a' : 'b',
      };
    });
  });

  totals = computed(() => {
    const sum = (p?: PokemonDetailPage | null) =>
      p?.stats.reduce((acc, s) => acc + s.base_stat, 0) ?? 0;
    return { a: sum(this.left()?.pokemon), b: sum(this.right()?.pokemon) };
  });

  /** Cómo le pegan los ataques con STAB de cada uno al otro. */
  typeAdvantage = computed(() => {
    const l = this.left();
    const r = this.right();
    if (!l?.pokemon || !r?.pokemon || !l.types.length || !r.types.length) return null;
    return {
      aToB: bestMultiplier(
        l.pokemon.types.map((t) => t.type.name),
        r.types,
      ),
      bToA: bestMultiplier(
        r.pokemon.types.map((t) => t.type.name),
        l.types,
      ),
    };
  });

  formatMultiplier(m: number): string {
    if (m === 0.25) return 'x¼';
    if (m === 0.5) return 'x½';
    return `x${m}`;
  }

  choose(side: 'a' | 'b', value: string) {
    const name = value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return;
    this.router.navigate([], {
      queryParams: { [side]: name },
      queryParamsHandling: 'merge',
    });
  }

  swap() {
    this.router.navigate([], { queryParams: { a: this.b(), b: this.a() } });
  }

  private loadSide(name: string) {
    if (!name) return of<Side>({ pokemon: null, types: [], error: false });
    return this.service.getPokemonDetailbyName(name.toLowerCase()).pipe(
      switchMap((pokemon) =>
        combineLatest(pokemon.types.map((t) => this.service.getTypeDetail(t.type.name))).pipe(
          map((types) => ({ pokemon, types, error: false })),
          catchError(() => of({ pokemon, types: [], error: false })),
        ),
      ),
      catchError(() => of<Side>({ pokemon: null, types: [], error: true })),
    );
  }
}
