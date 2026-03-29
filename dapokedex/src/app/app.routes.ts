import { Routes } from '@angular/router';
import { PokemonList } from './pages/pokemon-list/pokemon-list';
import { PokemonView } from './pages/pokemon-view/pokemon-view';

export const routes: Routes = [
  { path: '', component: PokemonList },
  { path: 'pokemon/:name', component: PokemonView },
];
