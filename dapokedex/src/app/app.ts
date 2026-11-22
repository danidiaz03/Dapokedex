import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './componentes/header/header';
import { Footer } from './componentes/footer/footer';
import { RewardToasts } from './componentes/reward-toasts/reward-toasts';
import { ConsoleControls } from './componentes/console-controls/console-controls';
import { BootScreen } from './componentes/boot-screen/boot-screen';
import { SeoService } from './services/seo.service';
import { AnalyticsService } from './services/analytics.service';
import { CookieBanner } from './componentes/cookie-banner/cookie-banner';

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
}
