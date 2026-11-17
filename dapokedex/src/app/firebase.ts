import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { environment } from '../environments/environment';

// Punto único de inicialización de Firebase. Antes cada servicio llamaba a
// initializeApp por su cuenta y App Check solo se activaba si AuthService
// se cargaba antes que FirestoreService.
export const firebaseApp = initializeApp(environment.firebase);

// En desarrollo (localhost) usamos un token de depuración en lugar de reCAPTCHA.
// El token real se genera en la consola del navegador la primera vez y se
// registra en Firebase Console → App Check → Apps → gestionar tokens de depuración.
if (!environment.production) {
  (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

initializeAppCheck(firebaseApp, {
  provider: new ReCaptchaV3Provider(environment.recaptchaSiteKey),
  isTokenAutoRefreshEnabled: true,
});

export const auth = getAuth(firebaseApp);
