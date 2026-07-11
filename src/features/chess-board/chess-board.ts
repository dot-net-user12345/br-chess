import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { ChessService } from '../../core/chess-service';
import { PieceCode } from '../../core/chess-models';

interface RenderedSquare {
  readonly light: boolean;
  readonly piece: PieceCode | null;
  readonly asset: string | null;
  readonly label: string;
}

const PIECE_ASSETS: Record<PieceCode, string> = {
  K: 'klt45',
  Q: 'qlt45',
  R: 'rlt45',
  B: 'blt45',
  N: 'nlt45',
  P: 'plt45',
  k: 'kdt45',
  q: 'qdt45',
  r: 'rdt45',
  b: 'bdt45',
  n: 'ndt45',
  p: 'pdt45',
};

const PIECE_NAMES: Record<string, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

/** Renders a single chess position (from a FEN) as an 8x8 grid of piece images. */
@Component({
  selector: 'app-chess-board',
  imports: [NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chess-board', '[attr.aria-label]': 'ariaLabel()', role: 'img' },
  template: `
    @for (square of squares(); track $index) {
      <span
        class="square"
        [class.light]="square.light"
        [class.dark]="!square.light"
        aria-hidden="true"
      >
        @if (square.asset) {
          <img [ngSrc]="square.asset" width="45" height="45" [alt]="square.label" />
        }
      </span>
    }
  `,
  styleUrl: './chess-board.scss',
})
export class ChessBoard {
  private readonly chess = inject(ChessService);

  readonly fen = input.required<string>();
  readonly caption = input<string>('');

  protected readonly ariaLabel = computed(() => this.caption() || 'Chess position');

  protected readonly squares = computed<RenderedSquare[]>(() => {
    const rows = this.chess.fenToSquares(this.fen());
    const result: RenderedSquare[] = [];
    rows.forEach((rank, rankIndex) => {
      rank.forEach((piece, fileIndex) => {
        result.push({
          light: (rankIndex + fileIndex) % 2 === 0,
          piece,
          asset: piece ? `assets/pieces/Chess_${PIECE_ASSETS[piece]}.svg` : null,
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
