import { Component, computed, effect, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { PokemonAbility } from '../../interfaces/pokemon';
import {
  FORMS_ID_START,
  PokemonService,
  cleanFlavorText,
  formatPokemonName,
  getIdFromUrl,
  pickLocalized,
} from '../../services/pokemon';
import { PokemonGrid } from '../../componentes/pokemon-grid/pokemon-grid';
import { SeoService } from '../../services/seo.service';
import { generationNumber } from '../../shared/labels';

const ABILITY_URL = 'https://pokeapi.co/api/v2/ability';

@Component({
  selector: 'app-ability-page',
  imports: [RouterLink, PokemonGrid],
  templateUrl: './ability-page.html',
  styleUrl: '../../shared/detail-page.css',
})
export class AbilityPage {
  private service = inject(PokemonService);
  private seo = inject(SeoService);

  /** Parámetro :name de la ruta. */
  name = input.required<string>();

  private state = toSignal(
    toObservable(this.name).pipe(
      switchMap((name) =>
        this.service.getAbility(`${ABILITY_URL}/${name.toLowerCase()}`).pipe(
          map((ability) => ({ ability: ability as PokemonAbility | null, error: false })),
          catchError(() => of({ ability: null, error: true })),
        ),
      ),
    ),
  );

  ability = computed(() => this.state()?.ability ?? null);
  notFound = computed(() => this.state()?.error ?? false);

  displayName = computed(() => {
    const ability = this.ability();
    if (!ability) return formatPokemonName(this.name());
    return pickLocalized(ability.names)?.name ?? formatPokemonName(ability.name);
  });

  constructor() {
    effect(() => {
      const item = this.ability();
      if (!item) return;
      this.seo.setPage({
        title: `${this.displayName()} (habilidad Pokémon)`,
        description: this.description() || `Habilidad ${this.displayName()}: descripción y Pokémon que la tienen.`,
        path: `/habilidad/${item.name}`,
      });
    });
  }

  description = computed(() => {
    const text = pickLocalized(this.ability()?.flavor_text_entries)?.flavor_text;
    return text ? cleanFlavorText(text) : '';
  });

  generation = computed(() => generationNumber(this.ability()?.generation?.name));

  /** Pokémon con esta habilidad; los que la tienen como oculta van marcados. */
  pokemons = computed(() =>
    (this.ability()?.pokemon ?? [])
      .map((p) => ({
        id: getIdFromUrl(p.pokemon.url),
        name: p.pokemon.name,
        badge: p.is_hidden ? 'Oculta' : undefined,
      }))
      .filter((p) => p.id < FORMS_ID_START)
      .sort((a, b) => a.id - b.id),
  );
}
