import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './guards/auth-guard';

// Cada página se carga bajo demanda (lazy loading) para reducir el bundle
// inicial: antes todo, incluida la batalla, se descargaba al abrir la web.
export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · Dapokedex',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginComponent),
  },
  {
    path: '',
    title: 'Pokédex · Dapokedex',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/pokemon-list/pokemon-list').then((m) => m.PokemonList),
  },
  {
    path: 'pokemon/:name',
    title: 'Pokémon · Dapokedex',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/pokemon-view/pokemon-view').then((m) => m.PokemonView),
  },
  {
    path: 'account',
    title: 'Mi cuenta · Dapokedex',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/account/account').then((m) => m.Account),
  },
  {
    path: 'game',
    title: 'Juego · Dapokedex',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/game/game').then((m) => m.Game),
  },
  {
    path: 'game/battle',
    title: 'Batalla · Dapokedex',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/game/battle/battle').then((m) => m.Battle),
  },
  {
    path: 'collection',
    title: 'Mi colección · Dapokedex',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/collection/collection').then((m) => m.Collection),
  },
  { path: '**', redirectTo: '' },
];
