import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  isRegister = false;
  errorMessage = '';

  async loginWithGoogle() {
    try {
      await this.authService.loginWithGoogle();
      this.router.navigate(['/']);
    } catch (error) {
      this.errorMessage = 'Error al iniciar sesión con Google';
    }
  }

  async submitForm() {
    try {
      if (this.isRegister) {
        await this.authService.registerWithEmail(this.email, this.password);
      } else {
        await this.authService.loginWithEmail(this.email, this.password);
      }
      this.router.navigate(['/']);
    } catch (error) {
      this.errorMessage = this.isRegister
        ? 'Error al registrarse. Comprueba los datos.'
        : 'Email o contraseña incorrectos.';
    }
  }

  toggleMode() {
    this.isRegister = !this.isRegister;
    this.errorMessage = '';
  }
}
