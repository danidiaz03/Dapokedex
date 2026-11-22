import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { PokemonType } from '../../interfaces/pokemon';
import { FORMS_ID_START, PokemonService, getIdFromUrl } from '../../services/pokemon';
import { ALL_TYPES, TYPE_NAMES_ES, TypeNamePipe } from '../../pipes/type-name.pipe';
import { SeoService } from '../../services/seo.service';
import { PokemonGrid } from '../../componentes/pokemon-grid/pokemon-grid';

interface Relation {
  label: string;
  types: string[];
  tone: 'weak' | 'resist' | 'immune';
}

@Component({
  selector: 'app-type-page',
  imports: [RouterLink, TypeNamePipe, PokemonGrid],
  templateUrl: './type-page.html',
  styleUrl: './type-page.css',
})
export class TypePage {
  private service = inject(PokemonService);
  private seo = inject(SeoService);

  /** Parámetro :name de la ruta (withComponentInputBinding). */
  name = input.required<string>();

  readonly allTypes = ALL_TYPES;

  private state = toSignal(
    toObservable(this.name).pipe(
      tap((name) => {
        const type = TYPE_NAMES_ES[name] ?? name;
        this.seo.setPage({
          title: `Tipo ${type}: fortalezas, debilidades y Pokémon`,
          description: `Contra qué tipos es eficaz el tipo ${type}, a cuáles resiste y la lista de todos los Pokémon de tipo ${type}.`,
          path: `/tipo/${name}`,
        });
      }),
      switchMap((name) =>
        this.service.getTypeDetail(name).pipe(
          map((type) => ({ type, error: false })),
          catchError(() => of({ type: null as PokemonType | null, error: true })),
        ),
      ),
    ),
  );

  type = computed(() => this.state()?.type ?? null);
  notFound = computed(() => this.state()?.error ?? false);
  loading = computed(() => !this.state());

  /** Contra qué tipos es eficaz al atacar. */
  attack = computed<Relation[]>(() => {
    const r = this.type()?.damage_relations;
    if (!r) return [];
    return this.relations([
      { label: 'Súper eficaz contra (x2)', list: r.double_damage_to, tone: 'resist' },
      { label: 'Poco eficaz contra (x½)', list: r.half_damage_to, tone: 'weak' },
      { label: 'Sin efecto contra (x0)', list: r.no_damage_to, tone: 'immune' },
    ]);
  });

  /** Qué tipos le hacen más o menos daño al defender. */
  defense = computed<Relation[]>(() => {
    const r = this.type()?.damage_relations;
    if (!r) return [];
    return this.relations([
      { label: 'Débil frente a (x2)', list: r.double_damage_from, tone: 'weak' },
      { label: 'Resiste (x½)', list: r.half_damage_from, tone: 'resist' },
      { label: 'Inmune a (x0)', list: r.no_damage_from, tone: 'immune' },
    ]);
  });

  /** Pokémon de este tipo, sin formas alternativas para no repetir especies. */
  pokemons = computed(() =>
    (this.type()?.pokemon ?? [])
      .map(({ pokemon }) => {
        const id = getIdFromUrl(pokemon.url);
        return { id, name: pokemon.name };
      })
      .filter((p) => p.id < FORMS_ID_START)
      .sort((a, b) => a.id - b.id),
  );

  private relations(
    groups: { label: string; list: { name: string }[]; tone: Relation['tone'] }[],
  ): Relation[] {
    return groups
      .map((g) => ({
        label: g.label,
        tone: g.tone,
        // PokeAPI incluye el tipo "stellar", que no es un tipo de Pokémon.
        types: g.list.map((t) => t.name).filter((t) => ALL_TYPES.includes(t)),
      }))
      .filter((g) => g.types.length > 0);
  }
}
