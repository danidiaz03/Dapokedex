import { Component, OnDestroy, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { RewardFeedService } from '../../services/reward-feed.service';
import { PokemonService, getArtworkUrl, playPokemonCry } from '../../services/pokemon';
import { EvolutionOption } from '../../game/pokemon-levels';
import { PokemonNamePipe } from '../../pipes/pokemon-name.pipe';

type Phase = 'choose' | 'evolving' | 'done' | 'error';

const EVOLUTION_ANIMATION_MS = 3600;

/**
 * Pantalla de evolución: si hay varias opciones (Eevee) deja elegir, guarda
 * el cambio en Firestore y muestra la animación clásica de destellos.
 */
@Component({
  selector: 'app-evolve-dialog',
  imports: [PokemonNamePipe],
  templateUrl: './evolve-dialog.html',
  styleUrl: './evolve-dialog.css',
})
export class EvolveDialog implements OnDestroy {
  private auth = inject(AuthService);
  private firestore = inject(FirestoreService);
  private feed = inject(RewardFeedService);
  private pokemonService = inject(PokemonService);

  pokemonId = input.required<number>();
  pokemonName = input.required<string>();
  options = input.required<EvolutionOption[]>();

  evolved = output<number>();
  closed = output<void>();

  phase = signal<Phase>('choose');
  target = signal<EvolutionOption | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  fromImg = computed(() => getArtworkUrl(this.pokemonId()));
  toImg = computed(() => (this.target() ? getArtworkUrl(this.target()!.id) : ''));

  img(id: number): string {
    return getArtworkUrl(id);
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
  }

  async evolve(option: EvolutionOption) {
    const userId = this.auth.currentUser()?.uid;
    if (!userId || this.phase() === 'evolving') return;
    this.target.set(option);
    this.phase.set('evolving');
    try {
      // Se guarda mientras se reproduce la animación.
      await Promise.all([
        this.firestore.evolvePokemon(userId, this.pokemonId(), option.id),
        new Promise((resolve) => (this.timer = setTimeout(resolve, EVOLUTION_ANIMATION_MS))),
      ]);
      this.phase.set('done');
      this.playCry(option.id);
      const from = this.pokemonService.displayName(this.pokemonName(), this.pokemonId());
      const to = this.pokemonService.displayName(option.name, option.id);
      this.feed.show([{ kind: 'bonus', text: `¡${from} ha evolucionado a ${to}!` }]);
      this.evolved.emit(option.id);
    } catch {
      this.phase.set('error');
    }
  }

  private playCry(id: number) {
    playPokemonCry(id);
  }
}
