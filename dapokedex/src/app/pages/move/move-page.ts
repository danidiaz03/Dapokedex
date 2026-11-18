import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { catchError, from, map, of, switchMap } from 'rxjs';
import { PokemonMove } from '../../interfaces/pokemon';
import {
  FORMS_ID_START,
  PokemonService,
  cleanFlavorText,
  formatPokemonName,
  getIdFromUrl,
  pickLocalized,
} from '../../services/pokemon';
import { TypeNamePipe } from '../../pipes/type-name.pipe';
import { PokemonGrid } from '../../componentes/pokemon-grid/pokemon-grid';
import {
  AILMENT_LABELS,
  DAMAGE_CLASS_LABELS,
  STAT_LABELS,
  generationNumber,
} from '../../shared/labels';

@Component({
  selector: 'app-move-page',
  imports: [RouterLink, TypeNamePipe, PokemonGrid],
  templateUrl: './move-page.html',
  styleUrl: '../ability/detail-page.css',
})
export class MovePage {
  private service = inject(PokemonService);
  private title = inject(Title);

  /** Parámetro :name de la ruta. */
  name = input.required<string>();

  private state = toSignal(
    toObservable(this.name).pipe(
      switchMap((name) =>
        from(this.service.getMove(name.toLowerCase())).pipe(
          map((move) => ({ move: move as PokemonMove | null, error: false })),
          catchError(() => of({ move: null, error: true })),
        ),
      ),
    ),
  );

  move = computed(() => this.state()?.move ?? null);
  notFound = computed(() => this.state()?.error ?? false);

  displayName = computed(() => {
    const move = this.move();
    if (!move) return formatPokemonName(this.name());
    const name = pickLocalized(move.names)?.name ?? formatPokemonName(move.name);
    this.title.setTitle(`${name} · Dapokedex`);
    return name;
  });

  description = computed(() => {
    const text = pickLocalized(this.move()?.flavor_text_entries)?.flavor_text;
    return text ? cleanFlavorText(text) : '';
  });

  damageClass = computed(() => {
    const dc = this.move()?.damage_class.name ?? '';
    return DAMAGE_CLASS_LABELS[dc] ?? dc;
  });

  generation = computed(() => generationNumber(this.move()?.generation?.name));

  /** Efectos secundarios descritos en español a partir de los datos de "meta". */
  effects = computed<string[]>(() => {
    const move = this.move();
    const meta = move?.meta;
    if (!move) return [];
    const effects: string[] = [];

    if (meta?.min_hits && meta.max_hits) {
      effects.push(
        meta.min_hits === meta.max_hits
          ? `Golpea ${meta.min_hits} veces seguidas.`
          : `Golpea de ${meta.min_hits} a ${meta.max_hits} veces seguidas.`,
      );
    }
    const ailment = meta?.ailment.name;
    if (ailment && ailment !== 'none' && AILMENT_LABELS[ailment]) {
      const chance = meta!.ailment_chance;
      effects.push(
        chance > 0 && chance < 100
          ? `${chance}% de probabilidad de ${AILMENT_LABELS[ailment]} al objetivo.`
          : `Puede ${AILMENT_LABELS[ailment]} al objetivo.`,
      );
    }
    if (meta?.flinch_chance) {
      effects.push(`${meta.flinch_chance}% de probabilidad de hacer retroceder al objetivo.`);
    }
    if (meta?.drain && meta.drain > 0) {
      effects.push(`Recupera el ${meta.drain}% del daño causado.`);
    }
    if (meta?.drain && meta.drain < 0) {
      effects.push(`El usuario recibe el ${-meta.drain}% del daño causado como retroceso.`);
    }
    if (meta?.healing && meta.healing > 0) {
      effects.push(`Recupera el ${meta.healing}% de los PS máximos.`);
    }
    if (meta?.crit_rate) effects.push('Índice de golpe crítico elevado.');

    for (const change of move.stat_changes ?? []) {
      const stat = STAT_LABELS[change.stat.name] ?? change.stat.name;
      const amount = Math.abs(change.change);
      const verb = change.change > 0 ? 'Sube' : 'Baja';
      const prefix = meta?.stat_chance ? `${meta.stat_chance}% de probabilidad: ` : '';
      effects.push(`${prefix}${verb} ${amount} ${amount === 1 ? 'nivel' : 'niveles'} ${stat}.`);
    }
    if (move.priority) {
      effects.push(
        move.priority > 0
          ? `Prioridad +${move.priority}: suele atacar primero.`
          : `Prioridad ${move.priority}: suele atacar el último.`,
      );
    }
    return effects;
  });

  /** Pokémon que pueden aprenderlo (sin formas alternativas). */
  learnedBy = computed(() =>
    (this.move()?.learned_by_pokemon ?? [])
      .map((p) => ({ id: getIdFromUrl(p.url), name: p.name }))
      .filter((p) => p.id < FORMS_ID_START)
      .sort((a, b) => a.id - b.id),
  );
}
