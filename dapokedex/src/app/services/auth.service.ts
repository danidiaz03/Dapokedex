import { Injectable, signal } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { environment } from '../../environments/environment';

const app = initializeApp(environment.firebase);

// En desarrollo (localhost) usamos un token de depuración en lugar de reCAPTCHA.
// El token real se genera en la consola del navegador la primera vez y se
// registra en Firebase Console → App Check → Apps → gestionar tokens de depuración.
if (!environment.production) {
  (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(environment.recaptchaSiteKey),
  isTokenAutoRefreshEnabled: true,
});

const auth = getAuth(app);

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  currentUser = signal<User | null>(null);

  constructor() {
    onAuthStateChanged(auth, (user) => {
      this.currentUser.set(user);
    });
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

  logout() {
    return signOut(auth);
  }

  isLoggedIn() {
    return this.currentUser() !== null;
  }
}
