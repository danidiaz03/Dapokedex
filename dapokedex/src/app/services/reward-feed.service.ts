import { Injectable, signal } from '@angular/core';
import { Reward } from '../game/progress';

export interface Toast {
  id: number;
  tone: 'xp' | 'level' | 'achievement' | 'challenge' | 'bonus' | 'streak';
  icon: string;
  title: string;
  text?: string;
}

const TOAST_DURATION = 4000;
const LEVEL_DURATION = 5500;

/** Cola de avisos de recompensa que se muestran encima de cualquier página. */
@Injectable({ providedIn: 'root' })
export class RewardFeedService {
  readonly toasts = signal<Toast[]>([]);
  /** Nivel recién alcanzado, para la celebración a pantalla completa. */
  readonly levelUp = signal<{ level: number; unlock?: string } | null>(null);
  private nextId = 0;
  private pending = 0;
  private levelUpTimer?: ReturnType<typeof setTimeout>;
  private audio: AudioContext | null = null;

  show(rewards: Reward[]): void {
    // La XP suelta se agrupa en un único aviso para no saturar la pantalla.
    const xp = rewards.filter((r) => r.kind === 'xp');
    const total = xp.reduce((sum, r) => sum + r.amount, 0);
    if (total > 0) {
      this.push({
        tone: 'xp',
        icon: '⚡',
        title: `+${total} XP`,
        text: xp.map((r) => r.reason).join(' · '),
      });
    }

    for (const r of rewards) {
      if (r.kind === 'streak') {
        this.push({
          tone: 'streak',
          icon: '🔥',
          title: r.days === 1 ? '¡Primer día de racha!' : `¡${r.days} días seguidos!`,
          text: `+${r.xp} XP por volver`,
        });
      }
      if (r.kind === 'bonus') this.push({ tone: 'bonus', icon: '🎁', title: r.text });
      if (r.kind === 'item') {
        this.push({ tone: 'bonus', icon: '🎒', title: `¡Conseguiste ${r.name}!`, text: r.reason });
      }
      if (r.kind === 'challenge') {
        this.push({
          tone: 'challenge',
          icon: '✅',
          title: 'Reto diario completado',
          text: `${r.title} · +${r.xp} XP`,
        });
      }
      if (r.kind === 'achievement') {
        this.push({
          tone: 'achievement',
          icon: r.icon,
          title: '¡Logro desbloqueado!',
          text: r.title,
        });
      }
      if (r.kind === 'level') {
        this.levelUp.set({ level: r.level, unlock: r.unlock });
        this.chime([523, 659, 784, 1047]);
        // Si ya había una celebración, su temporizador no debe cerrar esta.
        clearTimeout(this.levelUpTimer);
        this.levelUpTimer = setTimeout(() => this.levelUp.set(null), LEVEL_DURATION);
      }
    }
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(toast: Omit<Toast, 'id'>): void {
    const id = this.nextId++;
    // Se escalonan un poco para que se lean como una sucesión de premios.
    const delay = this.pending++ * 400;
    setTimeout(() => {
      this.pending--;
      this.toasts.update((list) => [...list, { ...toast, id }]);
      this.chime(
        toast.tone === 'achievement' ? [784, 1047, 1319] : toast.tone === 'xp' ? [880] : [659, 880],
      );
      setTimeout(() => this.dismiss(id), TOAST_DURATION);
    }, delay);
  }

  /** Pequeña melodía con Web Audio (sin descargar archivos de sonido). */
  private chime(notes: number[]): void {
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + i * 0.09;
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    } catch {
      // Sin audio disponible (navegador antiguo o bloqueado): solo visual.
    }
  }
}
