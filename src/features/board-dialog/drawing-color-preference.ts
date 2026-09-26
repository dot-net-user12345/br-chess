import { effect, Injectable, signal } from '@angular/core';
import { DEFAULT_DRAWING_COLOR, DRAWING_COLORS, DrawingColor } from '../../core/board-drawing';

const STORAGE_KEY = 'br-chess-drawing-color';

/**
 * The color the right mouse button draws in on the large board view. Shared
 * app-wide and kept in local storage, so the choice survives closing the
 * dialog and reloading the page.
 */
@Injectable({ providedIn: 'root' })
export class DrawingColorPreference {
  readonly color = signal<DrawingColor>(readStored());

  constructor() {
    effect(() => {
      const color = this.color();
      try {
        localStorage.setItem(STORAGE_KEY, color);
      } catch {
        // Storage can be unavailable (private mode, blocked); the choice then lasts the session.
      }
    });
  }
}

function readStored(): DrawingColor {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && stored in DRAWING_COLORS ? (stored as DrawingColor) : DEFAULT_DRAWING_COLOR;
  } catch {
    return DEFAULT_DRAWING_COLOR;
  }
}
