import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private router = inject(Router);
  private auth = inject(AuthService);

  user = this.auth.currentUser;
  authReady = this.auth.authReady;

  /** "Tipos" enlaza a /tipo/fire pero debe marcarse activo en cualquier tipo. */
  inTypes = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/tipo')),
    ),
    { initialValue: this.router.url.startsWith('/tipo') },
  );
}
