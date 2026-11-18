import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FirebaseError } from 'firebase/app';
import { AuthService } from '../../services/auth.service';

// Mensajes claros según el código de error de Firebase en vez de uno genérico.
const ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'El email no tiene un formato válido.',
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/user-not-found': 'No existe ninguna cuenta con ese email.',
  'auth/wrong-password': 'Email o contraseña incorrectos.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  'auth/network-request-failed': 'Error de conexión. Comprueba tu red.',
  'auth/operation-not-allowed': 'Este método de inicio de sesión no está activado en Firebase.',
  'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase Authentication.',
  'auth/popup-blocked':
    'El navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes.',
};

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = '';
  password = '';
  isRegister = signal(false);
  isLoading = signal(false);
  errorMessage = signal('');
  infoMessage = signal('');
  showPassword = signal(false);

  /**
   * Vuelve a la página desde la que se pidió iniciar sesión (?returnUrl=...).
   * Solo se aceptan rutas internas para no permitir redirecciones a otros dominios.
   */
  private goBack() {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    const safe = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//');
    this.router.navigateByUrl(safe ? returnUrl : '/');
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof FirebaseError)) return fallback;
    // Si App Check rechaza la petición no es culpa de la contraseña: lo decimos
    // claramente en vez de mostrar "Email o contraseña incorrectos".
    if (error.code.includes('app-check') || error.code.includes('appCheck')) {
      return 'No se pudo verificar la app (App Check). Si estás en local, registra el token de depuración en Firebase Console.';
    }
    if (!(error.code in ERROR_MESSAGES))
      console.error('Error de autenticación:', error.code, error);
    return ERROR_MESSAGES[error.code] ?? fallback;
  }

  async loginWithGoogle() {
    this.resetMessages();
    this.isLoading.set(true);
    try {
      await this.authService.loginWithGoogle();
      this.goBack();
    } catch (error) {
      // Cerrar la ventana de Google no es un error que haya que mostrar.
      if (error instanceof FirebaseError && error.code === 'auth/popup-closed-by-user') return;
      this.errorMessage.set(this.getErrorMessage(error, 'Error al iniciar sesión con Google.'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async submitForm() {
    if (this.isLoading()) return;
    this.resetMessages();
    this.isLoading.set(true);
    try {
      if (this.isRegister()) {
        await this.authService.registerWithEmail(this.email.trim(), this.password);
      } else {
        await this.authService.loginWithEmail(this.email.trim(), this.password);
      }
      this.goBack();
    } catch (error) {
      this.errorMessage.set(
        this.getErrorMessage(
          error,
          this.isRegister()
            ? 'Error al registrarse. Comprueba los datos.'
            : 'Email o contraseña incorrectos.',
        ),
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  async resetPassword() {
    this.resetMessages();
    if (!this.email.trim()) {
      this.errorMessage.set('Escribe tu email para enviarte el enlace de recuperación.');
      return;
    }
    try {
      await this.authService.resetPassword(this.email.trim());
      this.infoMessage.set('Te hemos enviado un email para restablecer la contraseña.');
    } catch (error) {
      this.errorMessage.set(this.getErrorMessage(error, 'No se pudo enviar el email.'));
    }
  }

  toggleMode() {
    this.isRegister.update((v) => !v);
    this.resetMessages();
  }

  private resetMessages() {
    this.errorMessage.set('');
    this.infoMessage.set('');
  }
}
