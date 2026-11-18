import { Component, inject } from '@angular/core';
import { RewardFeedService } from '../../services/reward-feed.service';

/** Avisos de recompensa (XP, logros, retos) y celebración de subida de nivel. */
@Component({
  selector: 'app-reward-toasts',
  templateUrl: './reward-toasts.html',
  styleUrl: './reward-toasts.css',
})
export class RewardToasts {
  feed = inject(RewardFeedService);
  readonly confetti = Array.from({ length: 36 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 9) * 0.12,
    color: ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'][i % 6],
  }));
}
