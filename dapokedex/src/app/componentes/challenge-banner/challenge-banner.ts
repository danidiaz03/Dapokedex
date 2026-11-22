import { Component, Injector, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SocialState } from '../../services/social-state';
import { KeyboardService } from '../../services/keyboard.service';

/**
 * Aviso flotante cuando un amigo te reta a un combate, estés donde estés.
 * Se oculta en la propia pantalla del combate.
 */
@Component({
  selector: 'app-challenge-banner',
  imports: [RouterLink],
  template: `
    @if (shown(); as c) {
      <div class="reto" role="alert">
        <p class="reto__texto">
          ⚔️ <strong>{{ c.opponent }}</strong> te reta a un combate
        </p>
        <div class="reto__botones">
          <button class="btn-caja" type="button" (click)="decline(c.id)" [disabled]="busy()">
            Rechazar
          </button>
          <a
            class="btn-caja btn-caja--accion"
            [routerLink]="['/combate', c.id]"
            [queryParams]="{ aceptar: 1 }"
            >Aceptar</a
          >
        </div>
      </div>
    }
  `,
  styles: `
    .reto {
      position: fixed;
      left: 50%;
      bottom: 72px;
      transform: translateX(-50%);
      z-index: 60;
      width: min(520px, calc(100vw - 32px));
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      padding: 12px 14px;
      border-radius: 14px;
      background: var(--tinta);
      color: var(--blanco);
      box-shadow:
        0 0 0 3px var(--marco),
        0 10px 30px rgba(0, 0, 0, 0.35);
      animation: entra 0.3s ease-out;
    }
    .reto__texto {
      font: 400 16px/1.3 var(--px);
    }
    .reto__texto strong {
      color: var(--marco);
      font-weight: 400;
    }
    .reto__botones {
      display: flex;
      gap: 8px;
      margin-left: auto;
    }
    @keyframes entra {
      from {
        transform: translate(-50%, 20px);
        opacity: 0;
      }
    }
    @media (max-width: 992px) {
      .reto {
        bottom: 84px;
      }
    }
  `,
})
export class ChallengeBanner {
  private state = inject(SocialState);
  private keyboard = inject(KeyboardService);
  private injector = inject(Injector);
  busy = signal(false);

  shown = computed(() => {
    if (this.keyboard.currentPath().startsWith('/combate')) return null;
    return this.state.challenges()[0] ?? null;
  });

  async decline(id: string) {
    this.busy.set(true);
    try {
      // Se carga en diferido para no meter Firestore en la carga inicial.
      const { OnlineBattleService } = await import('../../services/online-battle.service');
      await this.injector.get(OnlineBattleService).decline(id);
    } catch (e) {
      console.warn('No se pudo rechazar el reto', e);
    }
    this.busy.set(false);
  }
}
