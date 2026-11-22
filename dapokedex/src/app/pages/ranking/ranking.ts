import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import {
  FirestoreService,
  LeaderboardEntry,
  LeaderboardId,
} from '../../services/firestore.service';
import { nextWeekStart, weekKey } from '../../game/progress';
import { SocialService } from '../../services/social.service';
import { SocialState } from '../../services/social-state';

type Board = 'week' | 'alltime' | 'friends';

const MEDALS = ['🥇', '🥈', '🥉'];

@Component({
  selector: 'app-ranking',
  imports: [RouterLink],
  templateUrl: './ranking.html',
  styleUrl: './ranking.css',
})
export class Ranking implements OnInit, OnDestroy {
  private firestore = inject(FirestoreService);
  private auth = inject(AuthService);
  private social = inject(SocialService);
  private route = inject(ActivatedRoute);
  socialState = inject(SocialState);

  board = signal<Board>('week');
  entries = signal<LeaderboardEntry[]>([]);
  myRank = signal<{ rank: number; xp: number; total: number } | null>(null);
  loading = signal(true);
  error = signal(false);
  userId = signal<string | null>(null);
  now = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;

  /** ¿El usuario aparece en la lista visible? Si no, se muestra su posición aparte. */
  inTop = computed(() => this.entries().some((e) => e.uid === this.userId()));

  /** Cuenta atrás hasta el reinicio del lunes. */
  countdown = computed(() => {
    const ms = Math.max(0, nextWeekStart(new Date(this.now())).getTime() - this.now());
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return days > 0 ? `${days} d ${hours} h` : `${hours} h ${minutes} min`;
  });

  async ngOnInit() {
    this.userId.set((await this.auth.waitForUser())?.uid ?? null);
    if (this.route.snapshot.queryParamMap.get('tabla') === 'amigos') this.board.set('friends');
    this.timer = setInterval(() => this.now.set(Date.now()), 60000);
    await this.load();
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  medal(index: number): string {
    return MEDALS[index] ?? `${index + 1}`;
  }

  async setBoard(board: Board) {
    if (board === this.board()) return;
    this.board.set(board);
    await this.load();
  }

  async load() {
    if (this.board() === 'friends') return this.loadFriends();
    const id: LeaderboardId = this.board() === 'week' ? `week-${weekKey()}` : 'alltime';
    this.loading.set(true);
    this.error.set(false);
    try {
      const uid = this.userId();
      const [entries, rank] = await Promise.all([
        this.firestore.getLeaderboard(id),
        uid ? this.firestore.getLeaderboardRank(id, uid) : Promise.resolve(null),
      ]);
      // Si mientras tanto se cambió de pestaña, se descarta esta respuesta.
      if ((this.board() === 'week' ? `week-${weekKey()}` : 'alltime') !== id) return;
      this.entries.set(entries);
      this.myRank.set(rank);
    } catch (e) {
      console.warn('No se pudo cargar el ranking', e);
      this.error.set(true);
    }
    this.loading.set(false);
  }

  /** Clasificación entre amigos: tú y tus amigos ordenados por XP total. */
  private async loadFriends() {
    const uid = this.userId();
    this.loading.set(true);
    this.error.set(false);
    this.myRank.set(null);
    try {
      if (!uid) throw new Error('Sin sesión');
      await this.social.start(uid);
      const ids = await this.social.getFriendIds(uid);
      const profiles = await this.social.getProfiles([uid, ...ids]);
      if (this.board() !== 'friends') return;
      this.entries.set(
        profiles
          .map((p) => ({ uid: p.uid, name: p.username, title: p.title, xp: p.xp, level: p.level }))
          .sort((a, b) => b.xp - a.xp),
      );
    } catch (e) {
      console.warn('No se pudo cargar la clasificación de amigos', e);
      this.error.set(true);
    }
    this.loading.set(false);
  }
}
