import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { LAST_NATIONAL_DEX } from '../shared/pokedex';

/** Una tecla que se muestra en la barra de mandos o en la ayuda. */
export interface KeyHint {
  keys: string[];
  label: string;
}

/** Devuelve true si ha gestionado la tecla (y así no la procesa nadie más). */
export type KeyHandler = (event: KeyboardEvent) => boolean;

/** Secciones del menú, en el orden de las teclas 1–6. */
export const SECTIONS = [
  { path: '/', label: 'Cajas' },
  { path: '/tipo/fire', label: 'Tipos', match: '/tipo' },
  { path: '/comparar', label: 'Comparar' },
  { path: '/game', label: 'Juego' },
  { path: '/collection', label: 'Colección' },
  { path: '/ranking', label: 'Ranking' },
];

export const GLOBAL_HINTS: KeyHint[] = [
  { keys: ['1', '…', '6'], label: 'Ir a una sección' },
  { keys: ['['], label: 'Sección anterior' },
  { keys: [']'], label: 'Sección siguiente' },
  { keys: ['M'], label: 'Cambiar entre Pokédex y Juego' },
  { keys: ['R'], label: 'Pokémon aleatorio' },
  { keys: ['/'], label: 'Buscar' },
  { keys: ['?'], label: 'Ver los controles' },
  { keys: ['Esc'], label: 'Volver / cerrar' },
];

/**
 * Controles de teclado de toda la web, como los de una consola. Hay atajos
 * globales (secciones, modo, ayuda) y cada página registra los suyos mientras
 * está abierta; la página tiene prioridad sobre los globales.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardService {
  private router = inject(Router);
  private document = inject(DOCUMENT);

  /** Pistas de la página actual para la barra de mandos. */
  readonly pageHints = signal<KeyHint[]>([]);
  /** Nombre de la vista actual que se muestra en la barra. */
  readonly viewName = signal('');
  readonly helpOpen = signal(false);
  /** Se incrementa para volver a mostrar la pantalla de arranque. */
  readonly bootRequests = signal(0);
  readonly currentPath = signal('/');

  private handlers: KeyHandler[] = [];

  constructor() {
    this.document.addEventListener('keydown', (e) => this.onKey(e));
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.currentPath.set(this.router.url.split('?')[0]));
  }

  /** Registra los mandos de una página; devuelve la función para quitarlos. */
  register(handler: KeyHandler, hints: KeyHint[] = [], viewName = ''): () => void {
    this.handlers.push(handler);
    this.pageHints.set(hints);
    this.viewName.set(viewName);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
      if (this.handlers.length === 0) {
        this.pageHints.set([]);
        this.viewName.set('');
      }
    };
  }

  /** Índice de la sección activa en el menú (o -1). */
  sectionIndex(path = this.currentPath()): number {
    return SECTIONS.findIndex((s) =>
      s.path === '/' ? path === '/' : path.startsWith(s.match ?? s.path),
    );
  }

  goToSection(index: number) {
    const section = SECTIONS[(index + SECTIONS.length) % SECTIONS.length];
    this.router.navigateByUrl(section.path);
  }

  private isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return (
      el.isContentEditable ||
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT'
    );
  }

  private onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;

    // Escribiendo en un campo solo cuenta Escape, para salir de él.
    if (this.isTyping(e.target)) {
      if (e.key === 'Escape') (e.target as HTMLElement).blur();
      return;
    }

    if (this.helpOpen()) {
      if (e.key === 'Escape' || e.key === '?' || e.key.toLowerCase() === 'h') {
        this.helpOpen.set(false);
        e.preventDefault();
      }
      return;
    }

    // Primero la página abierta: puede usar las mismas teclas con otro sentido.
    for (const handler of [...this.handlers].reverse()) {
      if (handler(e)) {
        e.preventDefault();
        return;
      }
    }

    if (this.handleGlobal(e)) e.preventDefault();
  }

  private handleGlobal(e: KeyboardEvent): boolean {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (/^[1-6]$/.test(key)) {
      this.goToSection(Number(key) - 1);
      return true;
    }
    switch (key) {
      case '[':
        this.goToSection(Math.max(this.sectionIndex(), 0) - 1);
        return true;
      case ']':
        this.goToSection(this.sectionIndex() + 1);
        return true;
      case 'm':
        this.router.navigateByUrl(this.currentPath().startsWith('/game') ? '/' : '/game');
        return true;
      case 'r':
        this.router.navigate(['/pokemon', Math.floor(Math.random() * LAST_NATIONAL_DEX) + 1]);
        return true;
      case '/': {
        const search = this.document.querySelector<HTMLInputElement>('[data-search]');
        if (!search) return false;
        search.focus();
        return true;
      }
      case '?':
      case 'h':
        this.helpOpen.set(true);
        return true;
      case 'Escape':
        if (this.currentPath() === '/') return false;
        history.back();
        return true;
    }
    return false;
  }
}
