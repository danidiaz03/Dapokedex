import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { KeyboardService, SECTIONS } from '../../services/keyboard.service';
import { SocialState } from '../../services/social-state';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private auth = inject(AuthService);
  keyboard = inject(KeyboardService);

  readonly sections = SECTIONS;
  user = this.auth.currentUser;
  authReady = this.auth.authReady;
  /** Solicitudes de amistad sin responder. */
  pending = inject(SocialState).pendingCount;

  /** Sección activa del menú (Tipos se marca en cualquier tipo, no solo en Fuego). */
  activeIndex = computed(() => this.keyboard.sectionIndex(this.keyboard.currentPath()));
  inTypes = computed(() => this.keyboard.currentPath().startsWith('/tipo'));
}
