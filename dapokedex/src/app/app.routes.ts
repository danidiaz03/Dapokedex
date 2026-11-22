import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './guards/auth-guard';

// Cada página se carga bajo demanda (lazy loading) para reducir el bundle
// inicial: antes todo, incluida la batalla, se descargaba al abrir la web.
// La Pokédex (listado, fichas, tipos y comparador) es pública para que se pueda
// compartir; la cuenta solo hace falta para favoritos, colección y juego.
// Las páginas públicas (listado, fichas, tipos, comparador, movimientos y
// habilidades) ponen su título y descripción con SeoService.
export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · Dapokedex',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () => import('./pages/pokemon-list/pokemon-list').then((m) => m.PokemonList),
  },
  {
    path: 'pokemon/:name',
    loadComponent: () => import('./pages/pokemon-view/pokemon-view').then((m) => m.PokemonView),
  },
  {
    path: 'tipo/:name',
    loadComponent: () => import('./pages/type/type-page').then((m) => m.TypePage),
  },
  {
    path: 'movimiento/:name',
    loadComponent: () => import('./pages/move/move-page').then((m) => m.MovePage),
  },
  {
    path: 'habilidad/:name',
    loadComponent: () => import('./pages/ability/ability-page').then((m) => m.AbilityPage),
  },
  {
    path: 'privacidad',
    loadComponent: () => import('./pages/privacy/privacy').then((m) => m.Privacy),
  },
  {
    path: 'comparar',
    loadComponent: () => import('./pages/compare/compare').then((m) => m.Compare),
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
    path: 'game/guess',
    title: 'Adivina el Pokémon · Dapokedex',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/game/guess/guess').then((m) => m.Guess),
  },
  {
    path: 'ranking',
    title: 'Ranking · Dapokedex',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/ranking/ranking').then((m) => m.Ranking),
  },
  {
    path: 'amigos',
    title: 'Amigos · Dapokedex',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/friends/friends').then((m) => m.Friends),
  },
  {
    path: 'entrenador/:username',
    title: 'Entrenador · Dapokedex',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/trainer/trainer').then((m) => m.Trainer),
  },
  {
    path: 'collection',
    title: 'Mi colección · Dapokedex',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/collection/collection').then((m) => m.Collection),
  },
  { path: '**', redirectTo: '' },
];
