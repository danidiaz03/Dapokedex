import { Component, Injector, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './componentes/header/header';
import { Footer } from './componentes/footer/footer';
import { RewardToasts } from './componentes/reward-toasts/reward-toasts';
import { ConsoleControls } from './componentes/console-controls/console-controls';
import { BootScreen } from './componentes/boot-screen/boot-screen';
import { SeoService } from './services/seo.service';
import { AnalyticsService } from './services/analytics.service';
import { CookieBanner } from './componentes/cookie-banner/cookie-banner';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, RewardToasts, ConsoleControls, BootScreen, CookieBanner],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  // Se crean al arrancar: robots/canonical por ruta y la analítica con consentimiento.
  private seo = inject(SeoService);
  private analytics = inject(AnalyticsService);
  protected readonly title = signal('dapokedex');
  private auth = inject(AuthService);
  private injector = inject(Injector);

  constructor() {
    // Con sesión se cargan los amigos (solicitudes pendientes, conectados).
    // Se importa en diferido para que Firestore no entre en la carga inicial.
    let loaded = false;
    effect(() => {
      const uid = this.auth.currentUser()?.uid;
      if (!uid && !loaded) return;
      loaded = true;
      import('./services/social.service').then(({ SocialService }) => {
        const service = this.injector.get(SocialService);
        if (uid)
          service.start(uid).catch((e) => console.warn('No se pudieron cargar los amigos', e));
        else service.stop();
      });
    });
  }
}
