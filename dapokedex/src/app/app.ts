import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './componentes/header/header';
import { Footer } from './componentes/footer/footer';
import { RewardToasts } from './componentes/reward-toasts/reward-toasts';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, RewardToasts],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('dapokedex');
}
