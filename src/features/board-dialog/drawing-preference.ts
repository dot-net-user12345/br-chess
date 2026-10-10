import { effect, Injectable, signal } from '@angular/core';
import {
  ARROW_STYLES,
  ArrowStyle,
  DEFAULT_ARROW_STYLE,
  DEFAULT_DRAWING_COLOR,
  DEFAULT_SQUARE_MARK,
  DRAWING_COLORS,
  DrawingColor,
  SQUARE_MARKS,
  SquareMark,
} from '../../core/board-drawing';

const COLOR_KEY = 'br-chess-drawing-color';
const ARROW_STYLE_KEY = 'br-chess-drawing-arrow-style';
const SQUARE_MARK_KEY = 'br-chess-drawing-square-mark';

/**
 * How the right mouse button draws on the large board view: the color, the
 * shaft style of new arrows, and the mark a clicked square gets. Shared
 * app-wide and kept in local storage, so the choices survive closing the
 * dialog and reloading the page.
 */
@Injectable({ providedIn: 'root' })
export class DrawingPreference {
  readonly color = signal<DrawingColor>(
    read(COLOR_KEY, DRAWING_COLORS, DEFAULT_DRAWING_COLOR),
  );

  readonly arrowStyle = signal<ArrowStyle>(
    read(ARROW_STYLE_KEY, ARROW_STYLES, DEFAULT_ARROW_STYLE),
  );

  readonly squareMark = signal<SquareMark>(
    read(SQUARE_MARK_KEY, SQUARE_MARKS, DEFAULT_SQUARE_MARK),
  );

  constructor() {
    effect(() => store(COLOR_KEY, this.color()));
    effect(() => store(ARROW_STYLE_KEY, this.arrowStyle()));
    effect(() => store(SQUARE_MARK_KEY, this.squareMark()));
  }
}

/** The stored choice when it's still one of `allowed`, else `fallback`. */
function read<T extends string>(key: string, allowed: Record<T, unknown>, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored && stored in allowed ? (stored as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, blocked); the choice then lasts the session.
  }
}
