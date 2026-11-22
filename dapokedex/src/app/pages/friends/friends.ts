import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { OnlineBattleService } from '../../services/online-battle.service';
import { AuthService } from '../../services/auth.service';
import { SocialService, UsernameTakenError } from '../../services/social.service';
import { SocialState } from '../../services/social-state';
import {
  FriendRequest,
  PublicProfile,
  Relation,
  isOnline,
  isValidUsername,
  lastSeenLabel,
  normalizeUsername,
  relationWith,
  sortFriends,
  suggestUsername,
} from '../../game/social';
import { TrainerAvatar } from '../../componentes/trainer-avatar/trainer-avatar';

/** Cada cuánto se refresca quién está conectado mientras la página está abierta. */
const REFRESH_MS = 60_000;

@Component({
  selector: 'app-friends',
  imports: [FormsModule, RouterLink, TrainerAvatar],
  templateUrl: './friends.html',
  styleUrl: './friends.css',
})
export class Friends implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private social = inject(SocialService);
  private battles = inject(OnlineBattleService);
  private router = inject(Router);
  state = inject(SocialState);

  uid = signal<string | null>(null);
  now = signal(Date.now());

  // Elegir o cambiar el nombre de usuario.
  editingName = signal(false);
  nameDraft = signal('');
  nameError = signal('');
  savingName = signal(false);

  // Buscador.
  searchText = signal('');
  results = signal<PublicProfile[]>([]);
  searching = signal(false);
  searched = signal(false);

  friends = signal<PublicProfile[]>([]);
  loadingFriends = signal(true);
  busy = signal<string | null>(null);
  message = signal('');
  copied = signal(false);

  sortedFriends = computed(() => sortFriends(this.friends(), this.now()));
  onlineCount = computed(
    () => this.friends().filter((f) => isOnline(f.lastSeen, this.now())).length,
  );
  shareLink = computed(() => `${location.origin}/entrenador/${this.state.username() ?? ''}`);
  draftValid = computed(() => isValidUsername(this.nameDraft()));

  private timer?: ReturnType<typeof setInterval>;
  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Cuando cambia la lista de amigos (aceptas a alguien, te borran) se
    // vuelven a leer sus perfiles.
    effect(() => {
      const ids = this.state.friendIds();
      this.loadFriends(ids);
    });
  }

  async ngOnInit() {
    const user = await this.auth.waitForUser();
    this.uid.set(user?.uid ?? null);
    if (user) {
      await this.social.start(user.uid);
      this.nameDraft.set(suggestUsername(user.displayName, user.uid));
    }
    this.timer = setInterval(() => {
      this.now.set(Date.now());
      this.loadFriends(this.state.friendIds());
    }, REFRESH_MS);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
    clearTimeout(this.searchTimer);
  }

  private async loadFriends(ids: string[]) {
    try {
      this.friends.set(ids.length ? await this.social.getProfiles(ids) : []);
    } catch (e) {
      console.warn('No se pudieron cargar los amigos', e);
    }
    this.loadingFriends.set(false);
  }

  // --- Nombre de usuario ---------------------------------------------------

  onNameInput(value: string) {
    this.nameDraft.set(normalizeUsername(value));
    this.nameError.set('');
  }

  startEditing() {
    this.nameDraft.set(this.state.username() ?? '');
    this.nameError.set('');
    this.editingName.set(true);
  }

  async saveName() {
    if (!this.draftValid() || this.savingName()) return;
    this.savingName.set(true);
    this.nameError.set('');
    try {
      await this.social.claimUsername(this.nameDraft());
      this.editingName.set(false);
    } catch (e) {
      this.nameError.set(
        e instanceof UsernameTakenError
          ? e.message
          : 'No se pudo guardar el nombre. Inténtalo de nuevo.',
      );
      if (!(e instanceof UsernameTakenError)) console.warn(e);
    }
    this.savingName.set(false);
  }

  // --- Buscar --------------------------------------------------------------

  onSearch(value: string) {
    const text = normalizeUsername(value);
    this.searchText.set(text);
    clearTimeout(this.searchTimer);
    if (text.length < 2) {
      this.results.set([]);
      this.searched.set(false);
      return;
    }
    this.searchTimer = setTimeout(() => this.runSearch(text), 300);
  }

  private async runSearch(text: string) {
    this.searching.set(true);
    try {
      const found = await this.social.search(text);
      if (this.searchText() === text) {
        this.results.set(found);
        this.searched.set(true);
      }
    } catch (e) {
      console.warn('No se pudo buscar', e);
    }
    this.searching.set(false);
  }

  relation(p: PublicProfile): Relation {
    return relationWith(
      this.uid() ?? '',
      p.uid,
      this.state.friendIds(),
      this.state.incoming(),
      this.state.outgoing(),
    );
  }

  // --- Acciones ------------------------------------------------------------

  private async run(key: string, action: () => Promise<void>, done: string) {
    this.busy.set(key);
    this.message.set('');
    try {
      await action();
      this.message.set(done);
    } catch (e) {
      console.warn(e);
      this.message.set('No se pudo completar. Inténtalo de nuevo.');
    }
    this.busy.set(null);
  }

  add(p: PublicProfile) {
    const reverse = this.relation(p) === 'incoming';
    this.run(
      p.uid,
      () => this.social.sendRequest(p),
      reverse ? `Ahora eres amigo de ${p.username}.` : `Solicitud enviada a ${p.username}.`,
    );
  }

  accept(r: FriendRequest) {
    this.run(r.id, () => this.social.accept(r), `Ahora eres amigo de ${r.fromName}.`);
  }

  dismiss(r: FriendRequest, incoming: boolean) {
    this.run(
      r.id,
      () => this.social.dismiss(r),
      incoming ? 'Solicitud rechazada.' : 'Solicitud cancelada.',
    );
  }

  incomingFrom(p: PublicProfile): FriendRequest | undefined {
    return this.state.incoming().find((r) => r.from === p.uid);
  }

  /** Reta a un amigo y abre la pantalla de espera del combate. */
  challenge(f: PublicProfile) {
    const uid = this.uid();
    if (!uid) return;
    this.run(
      f.uid,
      async () => {
        const id = await this.battles.challenge(uid, f);
        this.router.navigate(['/combate', id]);
      },
      '',
    );
  }

  declineChallenge(id: string) {
    this.run(id, () => this.battles.decline(id), 'Reto rechazado.');
  }

  async copyLink() {
    try {
      await navigator.clipboard.writeText(this.shareLink());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.message.set(this.shareLink());
    }
  }

  async share() {
    const url = this.shareLink();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Dapokedex',
          text: `Agrégame como amigo en Dapokedex: soy ${this.state.username()}`,
          url,
        });
        return;
      } catch (e) {
        // Si el jugador cierra el menú de compartir no se hace nada más.
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await this.copyLink();
  }

  online(p: PublicProfile) {
    return isOnline(p.lastSeen, this.now());
  }

  seen(p: PublicProfile) {
    return lastSeenLabel(p.lastSeen, this.now());
  }
}
