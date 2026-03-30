import { Routes } from '@angular/router';
import { PokemonList } from './pages/pokemon-list/pokemon-list';
import { PokemonView } from './pages/pokemon-view/pokemon-view';
import { LoginComponent } from './pages/login/login';
import { Account } from './pages/account/account';
import { Game } from './pages/game/game';
import { Battle } from './pages/game/battle/battle';
import { authGuard } from './guards/auth-guard';
import { Collection } from './pages/collection/collection';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: PokemonList, canActivate: [authGuard] },
  { path: 'pokemon/:name', component: PokemonView, canActivate: [authGuard] },
  { path: 'account', component: Account, canActivate: [authGuard] },
  { path: 'game', component: Game, canActivate: [authGuard] },
  { path: 'game/battle', component: Battle, canActivate: [authGuard] },
  { path: 'collection', component: Collection, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
