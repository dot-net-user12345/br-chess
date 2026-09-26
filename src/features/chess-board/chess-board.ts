import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { ChessService } from '../../core/chess-service';
import { BoardOrientation, PieceCode } from '../../core/chess-models';
import {
  DIVERGENT_MOVE_COLOR,
  flipPoint,
  moveArrowGeometry,
  MOVE_ARROW_COLOR,
  pieceAssetPath,
  Point,
} from '../../core/board-assets';
import {
  arrowColor as drawnArrowColor,
  BoardDrawing,
  DEFAULT_DRAWING_COLOR,
  DRAWING_COLORS,
  DrawingColor,
  EMPTY_DRAWING,
  gridIndex,
  squareAt,
  squareColor,
  toggleArrow,
  toggleSquare,
} from '../../core/board-drawing';

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

/** A user-drawn arrow, ready to render in its own color. */
interface DrawnArrow extends RenderedArrow {
  readonly color: string;
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
 * with an optional move arrow from the `from` square to the `to` square, and
 * any user drawing (colored squares and arrows) laid over it. When `drawable`,
 * right-clicking a square colors it and right-dragging draws an arrow.
 */
@Component({
  selector: 'app-chess-board',
  imports: [NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'chess-board',
    '[class.chess-board--divergent]': 'highlighted()',
    '[class.chess-board--drawable]': 'drawable()',
    '[style.--board-highlight-color]': 'highlighted() ? highlightHue() : null',
    '[attr.aria-label]': 'ariaLabel()',
    role: 'img',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'dragFrom.set(null)',
    '(contextmenu)': 'onContextMenu($event)',
  },
  template: `
    @for (square of squares(); track $index) {
      <span
        class="square"
        [class.light]="square.light"
        [class.dark]="!square.light"
        [class.square--destination]="$index === destinationIndex()"
        [class.square--marked]="markedFills().has($index)"
        [style.--square-fill]="markedFills().get($index)"
        aria-hidden="true"
      >
        @if (square.asset) {
          <img [ngSrc]="square.asset" width="45" height="45" [alt]="square.label" />
        }
      </span>
    }
    @if (arrow() || drawnArrows().length > 0) {
      <svg class="chess-board__arrow" viewBox="0 0 8 8" aria-hidden="true">
        @if (arrow(); as arrow) {
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
        }
        @for (drawn of drawnArrows(); track $index) {
          <line
            [attr.x1]="drawn.shaftFrom.x"
            [attr.y1]="drawn.shaftFrom.y"
            [attr.x2]="drawn.shaftTo.x"
            [attr.y2]="drawn.shaftTo.y"
            [attr.stroke]="drawn.color"
            [attr.stroke-width]="drawn.strokeWidth"
            stroke-linecap="round"
          />
          <polygon [attr.points]="drawn.headPoints" [attr.fill]="drawn.color" />
        }
      </svg>
    }
  `,
  styleUrl: './chess-board.scss',
})
export class ChessBoard {
  private readonly chess = inject(ChessService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly fen = input.required<string>();
  readonly caption = input<string>('');
  /** Move origin square (e.g. `e2`); pair with `to` to draw the move arrow. */
  readonly from = input<string | null>(null);
  /** Move destination square (e.g. `e4`); pair with `from` to draw the move arrow. */
  readonly to = input<string | null>(null);
  /** When true, draws the move in the highlight color with a matching outline. */
  readonly highlighted = input<boolean>(false);
  /** Overrides the highlight color; defaults to the divergent purple. */
  readonly highlightColor = input<string | null>(null);
  /** Side to view the board from; `black` rotates the whole board 180°. */
  readonly orientation = input<BoardOrientation>('white');
  /** The user's colored squares and arrows for this position. */
  readonly drawing = input<BoardDrawing | null>(null);
  /** Lets the user draw with the right mouse button: click a square, drag an arrow. */
  readonly drawable = input<boolean>(false);
  /** The color new squares and arrows are drawn in. */
  readonly drawColor = input<DrawingColor>(DEFAULT_DRAWING_COLOR);

  /** Emits the whole updated drawing after each right-click or right-drag. */
  readonly drawingChange = output<BoardDrawing>();

  /** Square a right-drag started on; null when no drag is under way. */
  protected readonly dragFrom = signal<string | null>(null);
  /** Square the pointer is over during a right-drag, for the preview arrow. */
  private readonly dragOver = signal<string | null>(null);

  /** Resolved highlight color: the override when set, else the divergent purple. */
  protected readonly highlightHue = computed(() => this.highlightColor() ?? DIVERGENT_MOVE_COLOR);

  protected readonly arrowColor = computed(() =>
    this.highlighted() ? this.highlightHue() : MOVE_ARROW_COLOR,
  );

  /**
   * Grid index of the move's destination square, but only when highlighted — so
   * a differing move's landing square gets an inner glow. Null otherwise.
   */
  protected readonly destinationIndex = computed<number | null>(() => {
    const to = this.to();
    return to && this.highlighted() ? gridIndex(to, this.orientation()) : null;
  });

  /** The fill of each square the user colored, by grid index. */
  protected readonly markedFills = computed(() => {
    const fills = new Map<number, string>();
    const drawing = this.drawing();
    for (const square of drawing?.squares ?? []) {
      const index = gridIndex(square, this.orientation());
      if (drawing && index !== null) {
        fills.set(index, DRAWING_COLORS[squareColor(drawing, square)].fill);
      }
    }
    return fills;
  });

  protected readonly ariaLabel = computed(() => {
    const base = this.caption() || 'Chess position';
    return this.highlighted() ? `${base} (differs from compared line)` : base;
  });

  protected readonly arrow = computed<RenderedArrow | null>(() => {
    const from = this.from();
    const to = this.to();
    return from && to ? this.renderArrow(from, to) : null;
  });

  /** The user's arrows, plus a preview of the one being dragged. */
  protected readonly drawnArrows = computed<DrawnArrow[]>(() => {
    const arrows = (this.drawing()?.arrows ?? []).map((a) => ({
      ...this.renderArrow(a.from, a.to),
      color: DRAWING_COLORS[drawnArrowColor(a)].arrow,
    }));
    const from = this.dragFrom();
    const over = this.dragOver();
    if (from && over && from !== over) {
      arrows.push({
        ...this.renderArrow(from, over),
        color: DRAWING_COLORS[this.drawColor()].arrow,
      });
    }
    return arrows;
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
    // Black views the board rotated 180°: reversing the rank-8-first, file-a-first
    // grid yields rank-1-first, file-h-first, and each square keeps its own color.
    return this.orientation() === 'black' ? result.reverse() : result;
  });

  protected onPointerDown(event: PointerEvent): void {
    if (!this.drawable() || event.button !== 2) {
      return;
    }
    const square = this.squareUnder(event);
    if (!square) {
      return;
    }
    event.preventDefault();
    // Keep receiving the drag even if the pointer leaves the board.
    this.host.nativeElement.setPointerCapture?.(event.pointerId);
    this.dragFrom.set(square);
    this.dragOver.set(square);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragFrom()) {
      this.dragOver.set(this.squareUnder(event));
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    const from = this.dragFrom();
    if (!from || event.button !== 2) {
      return;
    }
    this.dragFrom.set(null);
    this.dragOver.set(null);
    const to = this.squareUnder(event);
    if (!to) {
      return;
    }
    const drawing = this.drawing() ?? EMPTY_DRAWING;
    // Released where it started: a click, which colors the square. Otherwise an arrow.
    this.drawingChange.emit(
      to === from
        ? toggleSquare(drawing, from, this.drawColor())
        : toggleArrow(drawing, from, to, this.drawColor()),
    );
  }

  /** The right mouse button draws on a drawable board, so its menu stays shut. */
  protected onContextMenu(event: MouseEvent): void {
    if (this.drawable()) {
      event.preventDefault();
    }
  }

  private squareUnder(event: PointerEvent): string | null {
    const rect = this.host.nativeElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    return squareAt(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
      this.orientation(),
    );
  }

  private renderArrow(from: string, to: string): RenderedArrow {
    const geometry = moveArrowGeometry(from, to);
    // From black's side the board is rotated 180°, so mirror every arrow point.
    const orient = (point: Point) =>
      this.orientation() === 'black' ? flipPoint(point) : point;
    return {
      shaftFrom: orient(geometry.shaftFrom),
      shaftTo: orient(geometry.shaftTo),
      headPoints: geometry.head.map(orient).map((point) => `${point.x},${point.y}`).join(' '),
      strokeWidth: geometry.strokeWidth,
    };
  }

  private describe(piece: PieceCode): string {
    const color = piece === piece.toUpperCase() ? 'White' : 'Black';
    return `${color} ${PIECE_NAMES[piece.toLowerCase()]}`;
  }
}
