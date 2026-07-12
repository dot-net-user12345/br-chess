import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { ChessService } from '../../core/chess-service';
import { PieceCode } from '../../core/chess-models';
import {
  DIVERGENT_MOVE_COLOR,
  moveArrowGeometry,
  MOVE_ARROW_COLOR,
  pieceAssetPath,
} from '../../core/board-assets';

interface RenderedSquare {
  readonly light: boolean;
  readonly piece: PieceCode | null;
  readonly asset: string | null;
  readonly label: string;
}

interface RenderedArrow {
  readonly shaftFrom: { readonly x: number; readonly y: number };
  readonly shaftTo: { readonly x: number; readonly y: number };
  readonly headPoints: string;
  readonly strokeWidth: number;
}

const PIECE_NAMES: Record<string, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

/**
 * Renders a single chess position (from a FEN) as an 8x8 grid of piece images,
 * with an optional move arrow from the `from` square to the `to` square.
 */
@Component({
  selector: 'app-chess-board',
  imports: [NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'chess-board',
    '[class.chess-board--divergent]': 'highlighted()',
    '[style.--board-highlight-color]': 'highlighted() ? divergentColor : null',
    '[attr.aria-label]': 'ariaLabel()',
    role: 'img',
  },
  template: `
    @for (square of squares(); track $index) {
      <span
        class="square"
        [class.light]="square.light"
        [class.dark]="!square.light"
        [class.square--destination]="$index === destinationIndex()"
        aria-hidden="true"
      >
        @if (square.asset) {
          <img [ngSrc]="square.asset" width="45" height="45" [alt]="square.label" />
        }
      </span>
    }
    @if (arrow(); as arrow) {
      <svg class="chess-board__arrow" viewBox="0 0 8 8" aria-hidden="true">
        <line
          [attr.x1]="arrow.shaftFrom.x"
          [attr.y1]="arrow.shaftFrom.y"
          [attr.x2]="arrow.shaftTo.x"
          [attr.y2]="arrow.shaftTo.y"
          [attr.stroke]="arrowColor()"
          [attr.stroke-width]="arrow.strokeWidth"
          stroke-linecap="round"
        />
        <polygon [attr.points]="arrow.headPoints" [attr.fill]="arrowColor()" />
      </svg>
    }
  `,
  styleUrl: './chess-board.scss',
})
export class ChessBoard {
  private readonly chess = inject(ChessService);

  readonly fen = input.required<string>();
  readonly caption = input<string>('');
  /** Move origin square (e.g. `e2`); pair with `to` to draw the move arrow. */
  readonly from = input<string | null>(null);
  /** Move destination square (e.g. `e4`); pair with `from` to draw the move arrow. */
  readonly to = input<string | null>(null);
  /** When true, draws the move in the divergent color with a matching outline. */
  readonly highlighted = input<boolean>(false);

  protected readonly divergentColor = DIVERGENT_MOVE_COLOR;

  protected readonly arrowColor = computed(() =>
    this.highlighted() ? DIVERGENT_MOVE_COLOR : MOVE_ARROW_COLOR,
  );

  /**
   * Grid index of the move's destination square, but only when highlighted — so
   * a differing move's landing square gets an inner glow. Null otherwise.
   */
  protected readonly destinationIndex = computed<number | null>(() => {
    const to = this.to();
    if (!to || !this.highlighted()) {
      return null;
    }
    const file = to.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = Number(to[1]);
    if (file < 0 || file > 7 || !Number.isInteger(rank) || rank < 1 || rank > 8) {
      return null;
    }
    // Grid is rank 8 first (top), file a first (left), matching fenToSquares.
    return (8 - rank) * 8 + file;
  });

  protected readonly ariaLabel = computed(() => {
    const base = this.caption() || 'Chess position';
    return this.highlighted() ? `${base} (differs from compared line)` : base;
  });

  protected readonly arrow = computed<RenderedArrow | null>(() => {
    const from = this.from();
    const to = this.to();
    if (!from || !to) {
      return null;
    }
    const geometry = moveArrowGeometry(from, to);
    return {
      shaftFrom: geometry.shaftFrom,
      shaftTo: geometry.shaftTo,
      headPoints: geometry.head.map((point) => `${point.x},${point.y}`).join(' '),
      strokeWidth: geometry.strokeWidth,
    };
  });

  protected readonly squares = computed<RenderedSquare[]>(() => {
    const rows = this.chess.fenToSquares(this.fen());
    const result: RenderedSquare[] = [];
    rows.forEach((rank, rankIndex) => {
      rank.forEach((piece, fileIndex) => {
        result.push({
          light: (rankIndex + fileIndex) % 2 === 0,
          piece,
          asset: piece ? pieceAssetPath(piece) : null,
          label: piece ? this.describe(piece) : '',
        });
      });
    });
    return result;
  });

  private describe(piece: PieceCode): string {
    const color = piece === piece.toUpperCase() ? 'White' : 'Black';
    return `${color} ${PIECE_NAMES[piece.toLowerCase()]}`;
  }
}
