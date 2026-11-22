import { Injectable, computed, signal } from '@angular/core';
import { FriendRequest } from '../game/social';

/** Reto o combate en línea visto desde fuera de la partida. */
export interface ChallengeInfo {
  id: string;
  /** Nombre del otro jugador. */
  opponent: string;
  createdAt: number;
}

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
  /** Retos a combate recibidos y sin responder. */
  readonly challenges = signal<ChallengeInfo[]>([]);
  /** Combates en línea empezados y sin terminar. */
  readonly activeBattles = signal<ChallengeInfo[]>([]);

  /** Solicitudes y retos sin responder (para el aviso de la cabecera). */
  readonly pendingCount = computed(() => this.incoming().length + this.challenges().length);

  reset() {
    this.username.set(undefined);
    this.incoming.set([]);
    this.outgoing.set([]);
    this.friendIds.set([]);
    this.challenges.set([]);
    this.activeBattles.set([]);
  }
}
