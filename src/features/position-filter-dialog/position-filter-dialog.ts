import { NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { pieceAssetPath } from '../../core/board-assets';
import { FILES, pieceName } from '../../core/board-position';
import { BoardOrientation } from '../../core/chess-models';
import {
  describePattern,
  EMPTY_MARK,
  PatternMark,
  PositionPattern,
} from '../../core/position-pattern';

/** What the dialog opens with: the pattern in force, and the side to view from. */
export interface PositionFilterDialogData {
  readonly pattern: PositionPattern;
  readonly orientation: BoardOrientation;
}

interface PaletteSide {
  readonly label: string;
  readonly pieces: readonly PatternMark[];
}

interface BoardSquare {
  readonly square: string;
  readonly light: boolean;
  readonly piece: PatternMark | null;
  readonly label: string;
  /** Rank number to print, on the left file only; empty elsewhere. */
  readonly rankLabel: string;
  /** File letter to print, on the bottom rank only; empty elsewhere. */
  readonly fileLabel: string;
}

/** A press on a piece that may become a drag: where it came from, and whether it has moved yet. */
interface PendingDrag {
  readonly piece: PatternMark;
  /** The square it was picked up from; null for a piece taken from the palette. */
  readonly source: string | null;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
}

/** How far a press must travel before it counts as a drag rather than a tap. */
const DRAG_THRESHOLD = 5;

/**
 * Builds a position pattern on an empty board: drag pieces from the palette
 * onto squares, or — by keyboard or tap — select a piece and then a square.
 * Closes with the pattern on Apply, and with nothing on Cancel.
 */
@Component({
  selector: 'app-position-filter-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './position-filter-dialog.html',
  styleUrl: './position-filter-dialog.scss',
})
export class PositionFilterDialog {
  private readonly data = inject<PositionFilterDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<PositionFilterDialog, PositionPattern>);
  private readonly document = inject(DOCUMENT);

  protected readonly palette: readonly PaletteSide[] = [
    { label: 'White pieces', pieces: ['K', 'Q', 'R', 'B', 'N', 'P'] },
    { label: 'Black pieces', pieces: ['k', 'q', 'r', 'b', 'n', 'p'] },
    // Dropped like a piece, an X asks for the square to be empty.
    { label: 'Empty square', pieces: [EMPTY_MARK] },
  ];

  protected readonly pattern = signal<PositionPattern>({ ...this.data.pattern });
  /** The palette piece the next selected square receives; null when none is picked. */
  protected readonly selected = signal<PatternMark | null>(null);
  /** The piece following the pointer while a drag is under way. */
  protected readonly ghost = signal<{ piece: PatternMark; x: number; y: number } | null>(null);

  private drag: PendingDrag | null = null;

  protected readonly summary = computed(
    () => describePattern(this.pattern()) || 'No pieces placed. Apply to show every line.',
  );

  protected readonly squares = computed<BoardSquare[]>(() => {
    const pattern = this.pattern();
    const black = this.data.orientation === 'black';
    const ranks = black ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    const files = black ? [...FILES].reverse() : [...FILES];
    return ranks.flatMap((rank, row) =>
      files.map((file, col) => {
        const square = `${file}${rank}`;
        const piece = pattern[square] ?? null;
        return {
          square,
          // a1 is dark: a light square's file index and rank sum to an even number.
          light: (FILES.indexOf(file) + rank) % 2 === 0,
          piece,
          label: piece ? `${square}, ${this.name(piece).toLowerCase()}` : `${square}, not in the filter`,
          rankLabel: col === 0 ? String(rank) : '',
          fileLabel: row === 7 ? file : '',
        };
      }),
    );
  });

  protected isEmptyMark(mark: PatternMark): boolean {
    return mark === EMPTY_MARK;
  }

  /** A piece's image; the X for an empty square is drawn, not an image. */
  protected asset(piece: PatternMark): string {
    return piece === EMPTY_MARK ? '' : pieceAssetPath(piece);
  }

  protected name(piece: PatternMark): string {
    const name = piece === EMPTY_MARK ? 'must be empty' : pieceName(piece);
    return `${name[0].toUpperCase()}${name.slice(1)}`;
  }

  /** Picks a palette piece for the next square, or puts it back when picked already. */
  protected choose(piece: PatternMark): void {
    this.selected.update((current) => (current === piece ? null : piece));
  }

  /**
   * A selected square takes the picked piece, or gives it back when it already
   * holds it. With no piece picked, it is emptied.
   */
  protected activate(square: string): void {
    const piece = this.selected();
    const current = this.pattern()[square];
    this.place(square, piece && piece !== current ? piece : null);
  }

  /** Keyboard presses arrive as clicks with no pointer detail; pointer taps are handled on release. */
  protected onPaletteClick(event: MouseEvent, piece: PatternMark): void {
    if (event.detail === 0) {
      this.choose(piece);
    }
  }

  protected onSquareClick(event: MouseEvent, square: string): void {
    if (event.detail === 0) {
      this.activate(square);
    }
  }

  protected onPointerDown(event: PointerEvent, piece: PatternMark | null, source: string | null): void {
    if (event.button !== 0) {
      return;
    }
    const target = event.currentTarget as HTMLElement;
    // Keep receiving the drag wherever the pointer goes.
    target.setPointerCapture?.(event.pointerId);
    // An empty square can't be dragged, but a tap on it still selects it.
    this.drag = piece
      ? { piece, source, startX: event.clientX, startY: event.clientY, moved: false }
      : null;
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) {
      return;
    }
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD
    ) {
      return;
    }
    drag.moved = true;
    this.ghost.set({ piece: drag.piece, x: event.clientX, y: event.clientY });
  }

  /** A press on a square that never moved is a tap, and selects the square. */
  protected onSquarePointerUp(event: PointerEvent, square: string): void {
    if (event.button === 0 && !this.endDrag(event)) {
      this.activate(square);
    }
  }

  /** A press on a palette piece that never moved is a tap, and picks the piece. */
  protected onPalettePointerUp(event: PointerEvent, piece: PatternMark): void {
    if (event.button === 0 && !this.endDrag(event)) {
      this.choose(piece);
    }
  }

  /**
   * Ends a press, dropping a dragged piece on the square under the pointer —
   * off the board, a piece taken from a square is removed. Returns false when
   * the press never became a drag.
   */
  private endDrag(event: PointerEvent): boolean {
    const drag = this.drag;
    this.drag = null;
    if (!drag?.moved) {
      return false;
    }
    this.ghost.set(null);
    const square = this.squareAt(event.clientX, event.clientY);
    this.pattern.update((pattern) => {
      const next = { ...pattern };
      if (drag.source) {
        delete next[drag.source];
      }
      if (square) {
        next[square] = drag.piece;
      }
      return next;
    });
    return true;
  }

  protected onPointerCancel(): void {
    this.drag = null;
    this.ghost.set(null);
  }

  protected clear(): void {
    this.pattern.set({});
    this.selected.set(null);
  }

  protected apply(): void {
    this.dialogRef.close(this.pattern());
  }

  private place(square: string, piece: PatternMark | null): void {
    this.pattern.update((pattern) => {
      const next = { ...pattern };
      if (piece) {
        next[square] = piece;
      } else {
        delete next[square];
      }
      return next;
    });
  }

  private squareAt(x: number, y: number): string | null {
    const element = this.document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-square]');
    return element?.dataset['square'] ?? null;
  }
}
