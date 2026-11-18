import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Antes se registraba un onAuthStateChanged en cada navegación y nunca se
// desuscribía; authStateReady() resuelve una sola vez y no deja listeners vivos.
export const authGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const user = await inject(AuthService).waitForUser();
  // Guardamos la ruta pedida para volver a ella después de iniciar sesión.
  return user ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

// Evita que un usuario ya autenticado vuelva a ver la pantalla de login.
export const guestGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const user = await inject(AuthService).waitForUser();
  return user ? router.createUrlTree(['/']) : true;
};
