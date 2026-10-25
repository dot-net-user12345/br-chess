import { effect, Injectable, signal } from '@angular/core';
import {
  ARROW_STYLES,
  ArrowStyle,
  DEFAULT_ARROW_STYLE,
  DEFAULT_DRAWING_COLOR,
  DEFAULT_OUTLINE_PIECE,
  DEFAULT_SQUARE_MARK,
  DRAWING_COLORS,
  DrawingColor,
  OUTLINE_PIECES,
  OutlinePiece,
  ARROW_LABEL_MAX_LENGTH,
  sanitizeArrowLabel,
  SQUARE_MARKS,
  SquareMark,
  SquareMarkKind,
} from '../../core/board-drawing';

const COLOR_KEY = 'br-chess-drawing-color';
const ARROW_STYLE_KEY = 'br-chess-drawing-arrow-style';
const SQUARE_MARK_KEY = 'br-chess-drawing-square-mark';
const OUTLINE_PIECE_KEY = 'br-chess-drawing-outline-piece';

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

  /**
   * The number new solid arrows carry; '' for none. Not stored, so a number
   * doesn't linger into a later visit and turn up on arrows unasked.
   */
  readonly arrowLabel = signal('');

  /** Whether each numbered arrow drawn moves the number on by one. Not stored either. */
  readonly autoIncrement = signal(false);

  /** The piece last picked for an outline, kept while another mark is in use. */
  readonly outlinePiece = signal<OutlinePiece>(
    read(OUTLINE_PIECE_KEY, OUTLINE_PIECES, DEFAULT_OUTLINE_PIECE),
  );

  constructor() {
    effect(() => store(COLOR_KEY, this.color()));
    effect(() => store(ARROW_STYLE_KEY, this.arrowStyle()));
    effect(() => store(SQUARE_MARK_KEY, this.squareMark()));
    effect(() => store(OUTLINE_PIECE_KEY, this.outlinePiece()));
  }

  /** Sets the arrow number from what was typed, keeping its digits only; returns what was kept. */
  setArrowLabel(text: string): string {
    const label = sanitizeArrowLabel(text);
    this.arrowLabel.set(label);
    return label;
  }

  /** Turns auto-increment on or off; turned on with no number, it starts counting at 1. */
  setAutoIncrement(on: boolean): void {
    this.autoIncrement.set(on);
    if (on && !this.arrowLabel()) {
      this.arrowLabel.set('1');
    }
  }

  /**
   * Moves the arrow number on by one after it has been used, while
   * auto-increment is on. It stops at the largest number that fits.
   */
  advanceArrowLabel(): void {
    const label = this.arrowLabel();
    if (!this.autoIncrement() || !label) {
      return;
    }
    const next = String(Number(label) + 1);
    if (next.length <= ARROW_LABEL_MAX_LENGTH) {
      this.arrowLabel.set(next);
    }
  }

  /** Picks a kind of mark; a piece outline is drawn as the piece last picked. */
  setMarkKind(kind: SquareMarkKind): void {
    this.squareMark.set(kind === 'outline' ? `outline-${this.outlinePiece()}` : kind);
  }

  /** Picks the piece to outline, and outlines with it. */
  setOutlinePiece(piece: OutlinePiece): void {
    this.outlinePiece.set(piece);
    this.squareMark.set(`outline-${piece}`);
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
