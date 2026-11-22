import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { GLOBAL_HINTS, KeyboardService, SECTIONS } from '../../services/keyboard.service';

/** Barra de mandos tipo consola y ventana de ayuda con todos los controles. */
@Component({
  selector: 'app-console-controls',
  templateUrl: './console-controls.html',
  styleUrl: './console-controls.css',
})
export class ConsoleControls {
  keyboard = inject(KeyboardService);
  readonly globalHints = GLOBAL_HINTS;
  readonly sections = SECTIONS;
  private dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  constructor() {
    // La ayuda recibe el foco al abrirse para que lectores de pantalla la anuncien.
    effect(() => {
      if (this.keyboard.helpOpen()) queueMicrotask(() => this.dialog()?.nativeElement.focus());
    });
  }
}
