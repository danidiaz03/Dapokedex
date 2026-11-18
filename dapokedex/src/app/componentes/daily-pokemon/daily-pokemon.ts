import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ProgressService } from '../../services/progress.service';
import { PokemonService, getArtworkUrl } from '../../services/pokemon';
import { PokemonNamePipe } from '../../pipes/pokemon-name.pipe';
import { TypeNamePipe } from '../../pipes/type-name.pipe';
import { XP, dailyPokemonClaimed, dailyPokemonId, dayKey } from '../../game/progress';

/** Tarjeta del Pokémon del día: igual para todos, se puede capturar una vez al día. */
@Component({
  selector: 'app-daily-pokemon',
  imports: [RouterLink, PokemonNamePipe, TypeNamePipe],
  templateUrl: './daily-pokemon.html',
  styleUrl: './daily-pokemon.css',
})
export class DailyPokemon implements OnInit {
  private auth = inject(AuthService);
  private progress = inject(ProgressService);
  private pokemonService = inject(PokemonService);
  private router = inject(Router);

  readonly today = dayKey();
  readonly id = dailyPokemonId(this.today);
  readonly img = getArtworkUrl(this.id);
  readonly xp = XP.dailyPokemon;

  name = signal('');
  types = signal<string[]>([]);
  claiming = signal(false);
  user = this.auth.currentUser;
  claimed = computed(() => dailyPokemonClaimed(this.progress.progress(), this.today));

  async ngOnInit() {
    try {
      const pokemon = await this.pokemonService.getPokemon(this.id);
      this.name.set(pokemon.name);
      this.types.set(pokemon.types.map((t) => t.type.name));
    } catch {
      this.name.set(`#${this.id}`);
    }
    if (await this.auth.waitForUser()) this.progress.load().catch(() => {});
  }

  async claim() {
    if (!this.user()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.claiming.set(true);
    try {
      await this.progress.claimDailyPokemon(this.id);
    } finally {
      this.claiming.set(false);
    }
  }
}
