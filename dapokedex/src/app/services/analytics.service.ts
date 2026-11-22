import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '../../environments/environment';

type Consent = 'aceptado' | 'rechazado';
const CONSENT_KEY = 'dapokedex.consentimiento';

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function readConsent(): Consent | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === 'aceptado' || value === 'rechazado' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Google Analytics 4 con consentimiento previo. El script de Google no se
 * descarga hasta que el visitante acepta, así que sin aceptar no se envía nada
 * ni se crean cookies de analítica. Las páginas se miden a mano porque la web
 * es una SPA y no recarga al navegar.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private document = inject(DOCUMENT);
  private router = inject(Router);

  /** Si hay un ID de Analytics configurado; sin él no hay banner ni medición. */
  readonly enabled = !!environment.gaMeasurementId;
  readonly consent = signal<Consent | null>(this.enabled ? readConsent() : 'rechazado');
  private loaded = false;

  constructor() {
    if (this.consent() === 'aceptado') this.load();
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        // Se espera un poco para que la página haya puesto ya su título.
        setTimeout(() => this.pageView(), 600);
      });
  }

  accept(): void {
    this.save('aceptado');
    this.load();
    this.pageView();
  }

  reject(): void {
    this.save('rechazado');
    // Si ya estaba cargado, se le indica a Google que deje de medir.
    window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  }

  /** Vuelve a mostrar el banner (enlace "Configurar cookies" del pie). */
  reopen(): void {
    if (this.enabled) this.consent.set(null);
  }

  private save(value: Consent): void {
    this.consent.set(value);
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // Sin almacenamiento la elección dura solo esta visita.
    }
  }

  private load(): void {
    if (!this.enabled || this.loaded) return;
    this.loaded = true;
    const id = environment.gaMeasurementId;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // gtag necesita recibir el objeto arguments tal cual.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments);
    };
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    window.gtag('js', new Date());
    window.gtag('config', id, { send_page_view: false, anonymize_ip: true });
    const script = this.document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    this.document.head.appendChild(script);
  }

  private pageView(): void {
    if (!this.loaded || this.consent() !== 'aceptado') return;
    window.gtag?.('event', 'page_view', {
      page_title: this.document.title,
      page_location: location.href,
      page_path: location.pathname,
    });
  }
}
