import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SeoPage {
  title: string;
  description: string;
  /** Ruta canónica, p. ej. /pokemon/charizard (sin dominio ni parámetros). */
  path?: string;
  /** Imagen para la vista previa al compartir (URL absoluta). */
  image?: string;
}

const SITE_NAME = 'Dapokedex';
const DEFAULT_IMAGE = `${environment.siteUrl}/icon-512.png`;
const DEFAULT_DESCRIPTION =
  'Pokédex en español con los 1025 Pokémon: estadísticas, evoluciones, movimientos y tipos, ' +
  'comparador y un juego para coleccionarlos.';

/** Rutas privadas o sin contenido propio: no deben aparecer en Google. */
const NOINDEX_PREFIXES = ['/login', '/account', '/collection', '/game', '/ranking'];

/**
 * Etiquetas para buscadores y redes sociales: título, descripción, URL
 * canónica, Open Graph y robots. Cada página llama a setPage() cuando tiene
 * sus datos; al navegar se ponen unos valores por defecto.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private title = inject(Title);
  private meta = inject(Meta);
  private document = inject(DOCUMENT);
  private router = inject(Router);

  constructor() {
    // Al empezar cada navegación se ponen valores por defecto; la página que
    // se abre los sustituye con setPage() cuando tiene sus datos.
    this.router.events
      .pipe(filter((e) => e instanceof NavigationStart))
      .subscribe((e) => {
        const path = e.url.split(/[?#]/)[0];
        const noindex = NOINDEX_PREFIXES.some((p) => path.startsWith(p));
        this.meta.updateTag({
          name: 'robots',
          content: noindex ? 'noindex, nofollow' : 'index, follow',
        });
        this.meta.updateTag({ name: 'description', content: DEFAULT_DESCRIPTION });
        this.setCanonical(path);
        this.updateSocial({ title: SITE_NAME, description: DEFAULT_DESCRIPTION, path });
      });
  }

  setPage(page: SeoPage): void {
    const title = page.title.endsWith(SITE_NAME) ? page.title : `${page.title} · ${SITE_NAME}`;
    const description = page.description.slice(0, 160);
    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    const path = page.path ?? this.router.url.split(/[?#]/)[0];
    this.setCanonical(path);
    this.updateSocial({ title, description, path, image: page.image });
  }

  private updateSocial(page: SeoPage): void {
    const url = environment.siteUrl + (page.path ?? '/');
    const image = page.image ?? DEFAULT_IMAGE;
    const tags: [string, string][] = [
      ['og:title', page.title],
      ['og:description', page.description],
      ['og:url', url],
      ['og:image', image],
      ['og:site_name', SITE_NAME],
      ['og:locale', 'es_ES'],
    ];
    for (const [property, content] of tags) this.meta.updateTag({ property, content });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: page.title });
    this.meta.updateTag({ name: 'twitter:description', content: page.description });
    this.meta.updateTag({ name: 'twitter:image', content: image });
  }

  private setCanonical(path: string): void {
    let link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }
    link.href = environment.siteUrl + path;
  }
}
