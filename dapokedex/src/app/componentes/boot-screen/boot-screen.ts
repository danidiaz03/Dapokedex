import {
  Component,
  DOCUMENT,
  OnDestroy,
  OnInit,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { KeyboardService } from '../../services/keyboard.service';
import { GENERATIONS, LAST_NATIONAL_DEX } from '../../services/pokemon';

const SEEN_KEY = 'dapokedex.arranque';
const SOUND_KEY = 'dapokedex.sonido';
const SPRITE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
/** Un Pokémon inicial de cada región para los huecos que se van llenando. */
const BOOT_SPRITES = [1, 152, 252, 387, 495, 650];

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento (modo privado...): el arranque volverá a salir, no pasa nada.
  }
}

/**
 * Arranque del "Dapokedex PC" la primera vez que se entra, como al encender
 * un juego: indexa las cajas, llena unos huecos y espera a que se pulse una
 * tecla. Se puede saltar en cualquier momento.
 */
@Component({
  selector: 'app-boot-screen',
  templateUrl: './boot-screen.html',
  styleUrl: './boot-screen.css',
})
export class BootScreen implements OnInit, OnDestroy {
  private document = inject(DOCUMENT);
  private keyboard = inject(KeyboardService);

  visible = signal(false);
  phase = signal<'indexando' | 'titulo'>('indexando');
  box = signal(0);
  count = signal(0);
  filled = signal(0);
  sound = signal(readStorage(SOUND_KEY) !== 'no');

  readonly generations = GENERATIONS;
  readonly sprites = BOOT_SPRITES.map((id) => `${SPRITE_URL}/${id}.png`);
  readonly total = LAST_NATIONAL_DEX;

  private timers: ReturnType<typeof setTimeout>[] = [];
  private onKey = (e: KeyboardEvent) => {
    if (!this.visible()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.close();
  };

  constructor() {
    // "Ver arranque otra vez" desde la ayuda de controles.
    effect(() => {
      if (this.keyboard.bootRequests() > 0) untracked(() => this.show());
    });
  }

  ngOnInit() {
    if (readStorage(SEEN_KEY) !== 'visto') this.show();
    // Se registra en fase de captura para que ninguna otra tecla actúe mientras tanto.
    this.document.addEventListener('keydown', this.onKey, true);
  }

  ngOnDestroy() {
    this.timers.forEach(clearTimeout);
    this.document.removeEventListener('keydown', this.onKey, true);
  }

  /** Vuelve a mostrar el arranque (desde la ayuda o el pie). */
  show() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.visible.set(true);
    this.box.set(0);
    this.count.set(0);
    this.filled.set(0);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      this.phase.set('titulo');
      return;
    }
    this.phase.set('indexando');
    const steps = GENERATIONS.length;
    for (let i = 1; i <= steps; i++) {
      this.timers.push(
        setTimeout(
          () => {
            this.box.set(i);
            this.count.set(Math.round((this.total * i) / steps));
            this.filled.set(
              Math.min(this.sprites.length, Math.ceil((i * this.sprites.length) / steps)),
            );
          },
          300 + i * 330,
        ),
      );
    }
    this.timers.push(setTimeout(() => this.phase.set('titulo'), 300 + (steps + 1) * 330));
  }

  close() {
    if (!this.visible()) return;
    this.timers.forEach(clearTimeout);
    this.visible.set(false);
    writeStorage(SEEN_KEY, 'visto');
    if (this.sound()) this.jingle();
  }

  toggleSound(event: Event) {
    event.stopPropagation();
    this.sound.update((v) => !v);
    writeStorage(SOUND_KEY, this.sound() ? 'si' : 'no');
  }

  boxName(): string {
    return GENERATIONS[Math.max(0, this.box() - 1)].label.split('· ')[1] ?? '';
  }

  /** Melodía de 8 bits al empezar; solo suena tras la primera interacción. */
  private jingle() {
    try {
      const ctx = new AudioContext();
      [523, 659, 784, 1047, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = ctx.currentTime + i * 0.09;
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.14);
      });
      setTimeout(() => ctx.close(), 1200);
    } catch {
      // Sin audio: el arranque sigue funcionando.
    }
  }
}
