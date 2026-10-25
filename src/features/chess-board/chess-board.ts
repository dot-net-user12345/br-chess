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
  arrowLabelBadge,
  DIVERGENT_MOVE_COLOR,
  fileLabels,
  flipPoint,
  moveArrowGeometry,
  MOVE_ARROW_COLOR,
  pieceAssetPath,
  PIECE_OUTLINE_DASH,
  PIECE_OUTLINE_SIZE,
  PIECE_OUTLINE_STROKE,
  PIECE_OUTLINES,
  Point,
  rankLabels,
  squareCrossGeometry,
} from '../../core/board-assets';
import {
  arrowColor as drawnArrowColor,
  arrowLabel as drawnArrowLabel,
  arrowStyle as drawnArrowStyle,
  ArrowStyle,
  BoardDrawing,
  DEFAULT_ARROW_STYLE,
  DEFAULT_DRAWING_COLOR,
  DEFAULT_SQUARE_MARK,
  DRAWING_COLORS,
  DrawingColor,
  EMPTY_DRAWING,
  gridIndex,
  outlinePiece,
  squareAt,
  squareColor,
  squareMark,
  SquareMark,
  toggleArrow,
  toggleSquare,
} from '../../core/board-drawing';

interface RenderedSquare {
  readonly light: boolean;
  readonly piece: PieceCode | null;
  readonly asset: string | null;
  readonly label: string;
  /** Rank number to print, on the left file only; empty elsewhere. */
  readonly rankLabel: string;
  /** File letter to print, on the bottom rank only; empty elsewhere. */
  readonly fileLabel: string;
}

interface RenderedArrow {
  readonly shaftFrom: { readonly x: number; readonly y: number };
  readonly shaftTo: { readonly x: number; readonly y: number };
  /** '' when the line is headless and ringed at both ends instead. */
  readonly headPoints: string;
  readonly strokeWidth: number;
  /** `stroke-dasharray` for a broken shaft; null when the shaft is unbroken. */
  readonly dashArray: string | null;
  /** Dashes keep square ends so they stay distinct; a solid shaft is rounded. */
  readonly lineCap: 'round' | 'butt';
  /** Centers of the ringed end markers; empty for an arrow. */
  readonly markers: readonly { readonly cx: number; readonly cy: number }[];
  readonly ringRadius: number;
  readonly ringWidth: number;
  readonly dotRadius: number;
}

/** A user-drawn arrow, ready to render in its own color. */
interface DrawnArrow extends RenderedArrow {
  readonly color: string;
  /** The number on the shaft, drawn in a disc of the arrow's color; null for none. */
  readonly badge: {
    readonly cx: number;
    readonly cy: number;
    readonly r: number;
    readonly fontSize: number;
    readonly text: string;
    readonly textColor: string;
  } | null;
}

/** A piece's dashed outline over a square, ready to render. */
interface RenderedOutline {
  /** Places and scales the 45-unit outline onto its square of the 8×8 board. */
  readonly transform: string;
  readonly paths: readonly string[];
  readonly color: string;
}

/** An X over a square, ready to render: two strokes in the square's color. */
interface RenderedCross {
  readonly lines: readonly {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  }[];
  readonly strokeWidth: number;
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
 * labeled with its rank and file coordinates, with an optional move arrow from
 * the `from` square to the `to` square, and
 * any user drawing (marked squares and lines) laid over it. When `drawable`,
 * right-clicking a square marks it — tinted or crossed with an X — and
 * right-dragging draws a line between two squares, either an arrow or a
 * headless dashed link ringed at both ends.
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
        @if (square.rankLabel) {
          <span class="square__coord square__coord--rank">{{ square.rankLabel }}</span>
        }
        @if (square.fileLabel) {
          <span class="square__coord square__coord--file">{{ square.fileLabel }}</span>
        }
        @if (square.asset) {
          <img [ngSrc]="square.asset" width="45" height="45" [alt]="square.label" />
        }
      </span>
    }
    @if (arrow() || drawnArrows().length > 0 || crosses().length > 0 || outlines().length > 0) {
      <svg class="chess-board__arrow" viewBox="0 0 8 8" aria-hidden="true">
        @for (cross of crosses(); track $index) {
          @for (stroke of cross.lines; track $index) {
            <line
              [attr.x1]="stroke.x1"
              [attr.y1]="stroke.y1"
              [attr.x2]="stroke.x2"
              [attr.y2]="stroke.y2"
              [attr.stroke]="cross.color"
              [attr.stroke-width]="cross.strokeWidth"
              stroke-linecap="round"
            />
          }
        }
        @for (outline of outlines(); track $index) {
          <g
            [attr.transform]="outline.transform"
            fill="none"
            [attr.stroke]="outline.color"
            [attr.stroke-width]="outlineStroke"
            [attr.stroke-dasharray]="outlineDash"
            stroke-linecap="butt"
            stroke-linejoin="round"
          >
            @for (path of outline.paths; track $index) {
              <path [attr.d]="path" />
            }
          </g>
        }
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
            [attr.stroke-dasharray]="drawn.dashArray"
            [attr.stroke-linecap]="drawn.lineCap"
          />
          @if (drawn.headPoints) {
            <polygon [attr.points]="drawn.headPoints" [attr.fill]="drawn.color" />
          }
          <!-- Headless lines end in a ring with a dot inside it, at both ends. -->
          @for (marker of drawn.markers; track $index) {
            <circle
              [attr.cx]="marker.cx"
              [attr.cy]="marker.cy"
              [attr.r]="drawn.ringRadius"
              fill="none"
              [attr.stroke]="drawn.color"
              [attr.stroke-width]="drawn.ringWidth"
            />
            <circle
              [attr.cx]="marker.cx"
              [attr.cy]="marker.cy"
              [attr.r]="drawn.dotRadius"
              [attr.fill]="drawn.color"
            />
          }
          @if (drawn.badge; as badge) {
            <circle [attr.cx]="badge.cx" [attr.cy]="badge.cy" [attr.r]="badge.r" [attr.fill]="drawn.color" />
            <text
              [attr.x]="badge.cx"
              [attr.y]="badge.cy"
              [attr.font-size]="badge.fontSize"
              [attr.fill]="badge.textColor"
              text-anchor="middle"
              dominant-baseline="central"
              font-weight="700"
              font-family="system-ui, sans-serif"
            >
              {{ badge.text }}
            </text>
          }
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
  /** The shaft style new arrows are drawn with. */
  readonly drawArrowStyle = input<ArrowStyle>(DEFAULT_ARROW_STYLE);
  /** The number new solid arrows carry on their shaft; '' for none. */
  readonly drawArrowLabel = input<string>('');
  /** The mark a right-clicked square is given: a fill or an X. */
  readonly drawSquareMark = input<SquareMark>(DEFAULT_SQUARE_MARK);

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

  /** The fill of each square the user tinted, by grid index. X-marked squares aren't tinted. */
  protected readonly markedFills = computed(() => {
    const fills = new Map<number, string>();
    const drawing = this.drawing();
    for (const square of drawing?.squares ?? []) {
      const index = gridIndex(square, this.orientation());
      if (drawing && index !== null && squareMark(drawing, square) === 'fill') {
        fills.set(index, DRAWING_COLORS[squareColor(drawing, square)].fill);
      }
    }
    return fills;
  });

  /** The X over each square the user marked with one, drawn over the pieces. */
  protected readonly crosses = computed<RenderedCross[]>(() => {
    const drawing = this.drawing();
    const crosses: RenderedCross[] = [];
    for (const square of drawing?.squares ?? []) {
      if (!drawing || squareMark(drawing, square) !== 'cross') {
        continue;
      }
      const geometry = squareCrossGeometry(square);
      // From black's side the board is rotated 180°, so mirror every point.
      const orient = (point: Point) => (this.orientation() === 'black' ? flipPoint(point) : point);
      crosses.push({
        lines: geometry.lines.map(([a, b]) => {
          const from = orient(a);
          const to = orient(b);
          return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
        }),
        strokeWidth: geometry.strokeWidth,
        color: DRAWING_COLORS[squareColor(drawing, square)].arrow,
      });
    }
    return crosses;
  });

  protected readonly outlineStroke = PIECE_OUTLINE_STROKE;
  protected readonly outlineDash = PIECE_OUTLINE_DASH.join(' ');

  /**
   * The dashed piece outline on each square the user marked with one. Upright
   * from either side: it is placed on the square as the viewer sees it, never
   * rotated with the board.
   */
  protected readonly outlines = computed<RenderedOutline[]>(() => {
    const drawing = this.drawing();
    const outlines: RenderedOutline[] = [];
    for (const square of drawing?.squares ?? []) {
      const piece = drawing ? outlinePiece(squareMark(drawing, square)) : null;
      const index = gridIndex(square, this.orientation());
      if (!drawing || !piece || index === null) {
        continue;
      }
      outlines.push({
        transform: `translate(${index % 8} ${Math.floor(index / 8)}) scale(${1 / PIECE_OUTLINE_SIZE})`,
        paths: PIECE_OUTLINES[piece],
        color: DRAWING_COLORS[squareColor(drawing, square)].arrow,
      });
    }
    return outlines;
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
    const drawn = (
      from: string,
      to: string,
      style: ArrowStyle,
      color: DrawingColor,
      label: string,
    ): DrawnArrow => {
      const arrow = this.renderArrow(from, to, style);
      const text = style === 'solid' ? label : '';
      const badge = text ? arrowLabelBadge(arrow.shaftFrom, arrow.shaftTo, text) : null;
      return {
        ...arrow,
        color: DRAWING_COLORS[color].arrow,
        badge: badge && {
          cx: badge.center.x,
          cy: badge.center.y,
          r: badge.radius,
          fontSize: badge.fontSize,
          text,
          textColor: DRAWING_COLORS[color].text,
        },
      };
    };
    const arrows = (this.drawing()?.arrows ?? []).map((a) =>
      drawn(a.from, a.to, drawnArrowStyle(a), drawnArrowColor(a), drawnArrowLabel(a)),
    );
    const from = this.dragFrom();
    const over = this.dragOver();
    if (from && over && from !== over) {
      arrows.push(
        drawn(from, over, this.drawArrowStyle(), this.drawColor(), this.drawArrowLabel()),
      );
    }
    return arrows;
  });

  protected readonly squares = computed<RenderedSquare[]>(() => {
    const rows = this.chess.fenToSquares(this.fen());
    const orientation = this.orientation();
    const files = fileLabels(orientation);
    const ranks = rankLabels(orientation);
    const result: Omit<RenderedSquare, 'rankLabel' | 'fileLabel'>[] = [];
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
    const oriented = orientation === 'black' ? result.reverse() : result;
    // Coordinates go on the board's near edges as the viewer sees them: numbers
    // down the left file, letters along the bottom rank.
    return oriented.map((square, index) => ({
      ...square,
      rankLabel: index % 8 === 0 ? ranks[index / 8] : '',
      fileLabel: index >= 56 ? files[index - 56] : '',
    }));
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
        ? toggleSquare(drawing, from, this.drawColor(), this.drawSquareMark())
        : toggleArrow(
            drawing,
            from,
            to,
            this.drawColor(),
            this.drawArrowStyle(),
            this.drawArrowLabel(),
          ),
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

  private renderArrow(from: string, to: string, style?: ArrowStyle): RenderedArrow {
    const geometry = moveArrowGeometry(from, to, style);
    // From black's side the board is rotated 180°, so mirror every arrow point.
    const orient = (point: Point) =>
      this.orientation() === 'black' ? flipPoint(point) : point;
    // The viewBox is 8x8, so board units are already the SVG's own units.
    return {
      shaftFrom: orient(geometry.shaftFrom),
      shaftTo: orient(geometry.shaftTo),
      headPoints: geometry.head.map(orient).map((point) => `${point.x},${point.y}`).join(' '),
      strokeWidth: geometry.strokeWidth,
      dashArray: geometry.dash.length > 0 ? geometry.dash.join(' ') : null,
      lineCap: geometry.dash.length > 0 ? 'butt' : 'round',
      markers: geometry.markers.map(orient).map((point) => ({ cx: point.x, cy: point.y })),
      ringRadius: geometry.marker?.ringRadius ?? 0,
      ringWidth: geometry.marker?.ringWidth ?? 0,
      dotRadius: geometry.marker?.dotRadius ?? 0,
    };
  }

  private describe(piece: PieceCode): string {
    const color = piece === piece.toUpperCase() ? 'White' : 'Black';
    return `${color} ${PIECE_NAMES[piece.toLowerCase()]}`;
  }
}
