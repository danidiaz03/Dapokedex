import { Component, computed, input } from '@angular/core';

const SPRITE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

/** Avatar de un entrenador: el primer Pokémon de su equipo dentro de un hueco de caja. */
@Component({
  selector: 'app-trainer-avatar',
  template: `
    <span class="avatar" [class.avatar--online]="online()" [style.--size.px]="size()">
      @if (sprite(); as src) {
        <img [src]="src" alt="" loading="lazy" />
      } @else {
        <span class="avatar__vacio" aria-hidden="true">?</span>
      }
      @if (online()) {
        <span class="avatar__punto" aria-hidden="true"></span>
      }
    </span>
  `,
  styles: `
    .avatar {
      position: relative;
      display: inline-grid;
      place-items: center;
      width: var(--size);
      height: var(--size);
      flex: none;
      border-radius: 12px;
      background: var(--hueco);
      box-shadow: inset 0 -3px 0 var(--hueco-borde);
    }
    img {
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
    }
    .avatar__vacio {
      font: 400 20px var(--px);
      color: var(--tinta-suave);
    }
    .avatar__punto {
      position: absolute;
      right: -3px;
      bottom: -3px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--ok);
      border: 3px solid #fff;
    }
  `,
})
export class TrainerAvatar {
  team = input<number[]>([]);
  online = input(false);
  size = input(48);

  sprite = computed(() => {
    const id = this.team()[0];
    return id ? `${SPRITE_URL}/${id}.png` : null;
  });
}
