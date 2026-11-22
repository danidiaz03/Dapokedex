import { Component, computed, inject, input, signal, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { OnlineBattleService } from '../../services/online-battle.service';
import { AuthService } from '../../services/auth.service';
import { SocialService } from '../../services/social.service';
import { SocialState } from '../../services/social-state';
import { PokemonNamePipe } from '../../pipes/pokemon-name.pipe';
import { PokemonService } from '../../services/pokemon';
import {
  PublicProfile,
  isOnline,
  lastSeenLabel,
  normalizeUsername,
  relationWith,
} from '../../game/social';
import { TrainerAvatar } from '../../componentes/trainer-avatar/trainer-avatar';
import { levelProgress } from '../../game/progress';

const SPRITE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

/** Perfil público de un entrenador (/entrenador/:username). */
@Component({
  selector: 'app-trainer',
  imports: [RouterLink, TrainerAvatar, PokemonNamePipe],
  templateUrl: './trainer.html',
  styleUrl: './trainer.css',
})
export class Trainer {
  private auth = inject(AuthService);
  private social = inject(SocialService);
  private pokemon = inject(PokemonService);
  private battles = inject(OnlineBattleService);
  private router = inject(Router);
  state = inject(SocialState);

  /** Viene de la ruta gracias a withComponentInputBinding. */
  username = input<string>('');

  profile = signal<PublicProfile | null>(null);
  loading = signal(true);
  uid = signal<string | null>(null);
  busy = signal(false);
  confirmRemove = signal(false);
  message = signal('');

  relation = computed(() => {
    const p = this.profile();
    if (!p) return 'none';
    return relationWith(
      this.uid() ?? '',
      p.uid,
      this.state.friendIds(),
      this.state.incoming(),
      this.state.outgoing(),
    );
  });
  online = computed(() => isOnline(this.profile()?.lastSeen ?? 0));
  seen = computed(() => lastSeenLabel(this.profile()?.lastSeen ?? 0));
  level = computed(() => levelProgress(this.profile()?.xp ?? 0));

  constructor() {
    effect(() => {
      this.load(normalizeUsername(this.username()));
    });
  }

  private async load(name: string) {
    this.loading.set(true);
    this.confirmRemove.set(false);
    this.message.set('');
    const user = await this.auth.waitForUser();
    this.uid.set(user?.uid ?? null);
    if (user) this.social.start(user.uid).catch(() => {});
    try {
      const p = await this.social.getProfileByUsername(name);
      if (normalizeUsername(this.username()) !== name) return;
      this.profile.set(p);
      if (p) {
        // Los nombres en español de su equipo.
        this.pokemon.loadSpeciesNames();
        document.title = `${p.username} · Dapokedex`;
      }
    } catch (e) {
      console.warn('No se pudo cargar el perfil', e);
      this.profile.set(null);
    }
    this.loading.set(false);
  }

  sprite(id: number) {
    return `${SPRITE_URL}/${id}.png`;
  }

  private async run(action: () => Promise<void>, done: string) {
    this.busy.set(true);
    this.message.set('');
    try {
      await action();
      this.message.set(done);
    } catch (e) {
      console.warn(e);
      this.message.set('No se pudo completar. Inténtalo de nuevo.');
    }
    this.busy.set(false);
  }

  add() {
    const p = this.profile();
    if (!p) return;
    const reverse = this.relation() === 'incoming';
    this.run(
      () => this.social.sendRequest(p),
      reverse ? `Ahora eres amigo de ${p.username}.` : 'Solicitud enviada.',
    );
  }

  challenge() {
    const p = this.profile();
    const uid = this.uid();
    if (!p || !uid) return;
    this.run(async () => {
      const id = await this.battles.challenge(uid, p);
      this.router.navigate(['/combate', id]);
    }, '');
  }

  cancel() {
    const p = this.profile();
    const r = this.state.outgoing().find((x) => x.to === p?.uid);
    if (r) this.run(() => this.social.dismiss(r), 'Solicitud cancelada.');
  }

  remove() {
    const p = this.profile();
    if (!p) return;
    if (!this.confirmRemove()) {
      this.confirmRemove.set(true);
      return;
    }
    this.confirmRemove.set(false);
    this.run(() => this.social.removeFriend(p.uid), `Ya no eres amigo de ${p.username}.`);
  }
}
