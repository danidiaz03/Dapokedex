import { Injectable, signal } from '@angular/core';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { auth } from '../firebase';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  currentUser = signal<User | null>(auth.currentUser);
  /** false hasta que Firebase resuelve la sesión guardada (evita parpadeos en la UI). */
  authReady = signal(false);

  constructor() {
    onAuthStateChanged(auth, (user) => {
      this.currentUser.set(user);
      this.authReady.set(true);
    });
  }

  /**
   * Espera a que Firebase resuelva la sesión persistida y devuelve el usuario.
   * Al recargar la página `currentUser()` es null durante unos milisegundos,
   * así que las páginas deben usar esto en vez de leer el signal directamente.
   */
  async waitForUser(): Promise<User | null> {
    await auth.authStateReady();
    this.currentUser.set(auth.currentUser);
    return auth.currentUser;
  }

  loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  }

  loginWithEmail(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  registerWithEmail(email: string, password: string) {
    return createUserWithEmailAndPassword(auth, email, password);
  }

  resetPassword(email: string) {
    return sendPasswordResetEmail(auth, email);
  }

  logout() {
    return signOut(auth);
  }

  isLoggedIn() {
    return this.currentUser() !== null;
  }
}
