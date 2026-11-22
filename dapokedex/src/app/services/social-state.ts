import { Injectable, computed, signal } from '@angular/core';
import { FriendRequest } from '../game/social';

/**
 * Estado de amigos que necesitan la cabecera y el resto de la web. No usa
 * Firestore para no meterlo en la carga inicial: lo rellena SocialService,
 * que se descarga en diferido cuando hay sesión.
 */
@Injectable({ providedIn: 'root' })
export class SocialState {
  /** undefined mientras se carga; null si aún no ha elegido nombre de usuario. */
  readonly username = signal<string | null | undefined>(undefined);
  readonly incoming = signal<FriendRequest[]>([]);
  readonly outgoing = signal<FriendRequest[]>([]);
  readonly friendIds = signal<string[]>([]);

  /** Solicitudes recibidas sin responder (para el aviso de la cabecera). */
  readonly pendingCount = computed(() => this.incoming().length);

  reset() {
    this.username.set(undefined);
    this.incoming.set([]);
    this.outgoing.set([]);
    this.friendIds.set([]);
  }
}
