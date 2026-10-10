import { ArrowStyle, DEFAULT_ARROW_STYLE } from './board-drawing';
import { BoardOrientation, PieceCode } from './chess-models';

/** Maps each FEN piece code to its bundled SVG asset basename. */
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

/** Board square fill colors, matching `chess-board.scss`. */
export const LIGHT_SQUARE = '#f0d9b5';
export const DARK_SQUARE = '#b58863';

/** Rendered pixel size of one square (and each piece asset). */
export const SQUARE_SIZE = 45;

/** Fill/stroke color for the move arrow drawn on generated board images. */
export const MOVE_ARROW_COLOR = 'rgba(255, 145, 0, 0.85)';

/**
 * Arrow, outline, and drop-shadow color marking a move that diverges from the
 * line a PGN is compared against. Shared by the live board and the exported PNG.
 */
export const DIVERGENT_MOVE_COLOR = 'rgba(142, 36, 170, 0.9)';

/**
 * Distinct highlight colors for the Differences panel — one per comparison,
 * cycled when there are more comparisons than colors. Deliberately excludes the
 * purple {@link DIVERGENT_MOVE_COLOR} used inside the PGN containers.
 */
export const COMPARISON_PALETTE = [
  'rgba(0, 150, 136, 0.9)', // teal
  'rgba(245, 124, 0, 0.9)', // orange
  'rgba(216, 27, 96, 0.9)', // pink
  'rgba(30, 136, 229, 0.9)', // blue
  'rgba(67, 160, 71, 0.9)', // green
  'rgba(229, 57, 53, 0.9)', // red
];

/** Path to the piece image for a FEN piece code, relative to the app root. */
export function pieceAssetPath(piece: PieceCode): string {
  return `assets/pieces/Chess_${PIECE_ASSETS[piece]}.svg`;
}

/** A point in board units, where 1 unit = 1 square and (0,0) is the top-left corner. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Move-arrow geometry, expressed in board units (1 unit = 1 square). */
export interface MoveArrow {
  readonly shaftFrom: Point;
  readonly shaftTo: Point;
  readonly head: readonly [Point, Point, Point];
  readonly strokeWidth: number;
  /**
   * Dash/gap lengths for the shaft, in board units; empty for an unbroken one.
   * Scale each entry the same way as the stroke width.
   */
  readonly dash: readonly number[];
}

// Arrow proportions, as fractions of one square, per shaft style. The dashed
// arrow is slimmer in every part, so it reads as a lighter, secondary mark
// beside a solid one of the same color.
const ARROW_PROPORTIONS: Readonly<
  Record<
    ArrowStyle,
    {
      readonly headLength: number;
      readonly headWidth: number;
      readonly strokeWidth: number;
      readonly dash: readonly number[];
    }
  >
> = {
  solid: { headLength: 0.4, headWidth: 0.44, strokeWidth: 0.16, dash: [] },
  dashed: { headLength: 0.28, headWidth: 0.26, strokeWidth: 0.07, dash: [0.2, 0.13] },
};

/** Center of an algebraic square (e.g. `e4`) in board units, a1 bottom-left. */
export function squareCenter(square: string): Point {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  return { x: file + 0.5, y: 8 - rank + 0.5 };
}

/**
 * Mirrors a point across the board's center — the 180° rotation that turns a
 * white-perspective coordinate into its black-perspective one. Board units, so
 * the board spans 0–8 on each axis. Idempotent inverse of itself.
 */
export function flipPoint(point: Point): Point {
  return { x: 8 - point.x, y: 8 - point.y };
}

/**
 * Arrow geometry from one square to another, in board units. Shared by the live
 * SVG board and the canvas image renderer so both draw an identical arrow; each
 * caller scales the units to its own pixel/viewBox size.
 */
export function moveArrowGeometry(
  from: string,
  to: string,
  style: ArrowStyle = DEFAULT_ARROW_STYLE,
): MoveArrow {
  const { headLength, headWidth, strokeWidth, dash } = ARROW_PROPORTIONS[style];
  const a = squareCenter(from);
  const b = squareCenter(to);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    shaftFrom: a,
    // Stop the shaft where the head begins so a round line cap won't poke through it.
    shaftTo: { x: b.x - headLength * 0.85 * cos, y: b.y - headLength * 0.85 * sin },
    head: [
      b,
      {
        x: b.x - headLength * cos + (headWidth / 2) * sin,
        y: b.y - headLength * sin - (headWidth / 2) * cos,
      },
      {
        x: b.x - headLength * cos - (headWidth / 2) * sin,
        y: b.y - headLength * sin + (headWidth / 2) * cos,
      },
    ],
    strokeWidth,
    dash,
  };
}

/** The two strokes of an X over one square, in board units. */
export interface SquareCross {
  readonly lines: readonly [readonly [Point, Point], readonly [Point, Point]];
  readonly strokeWidth: number;
}

// Cross proportions, as fractions of one square: how far each arm stops short
// of the square's corner, and how thick the strokes are.
const CROSS_INSET = 0.22;
const CROSS_STROKE_WIDTH = 0.11;

/**
 * The X drawn over a square, in board units. Shared by the live SVG board and
 * the canvas image renderer so both draw an identical cross.
 */
export function squareCrossGeometry(square: string): SquareCross {
  const { x, y } = squareCenter(square);
  const reach = 0.5 - CROSS_INSET;
  return {
    lines: [
      [
        { x: x - reach, y: y - reach },
        { x: x + reach, y: y + reach },
      ],
      [
        { x: x - reach, y: y + reach },
        { x: x + reach, y: y - reach },
      ],
    ],
    strokeWidth: CROSS_STROKE_WIDTH,
  };
}

/** File letters, a→h, and rank numbers as the grid stores them, 8 down to 1. */
const FILE_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANK_NUMBERS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

/** File letters from left to right, as the given side sees the board. */
export function fileLabels(orientation: BoardOrientation): readonly string[] {
  return orientation === 'black' ? [...FILE_LETTERS].reverse() : FILE_LETTERS;
}

/** Rank numbers from top to bottom, as the given side sees the board. */
export function rankLabels(orientation: BoardOrientation): readonly string[] {
  return orientation === 'black' ? [...RANK_NUMBERS].reverse() : RANK_NUMBERS;
}

/**
 * Color of the rank/file coordinates drawn inside the board's edge squares: a
 * partly transparent black, so the labels sit back behind the position while
 * still clearing WCAG AA on both square colors (13:1 over {@link LIGHT_SQUARE},
 * 4.7:1 over {@link DARK_SQUARE}). The alpha is as low as that allows — any
 * fainter drops the dark squares under 4.5:1, and the conventional
 * light-on-dark label never reaches it (white on {@link DARK_SQUARE} is 3.1:1).
 */
export const COORDINATE_COLOR = 'rgba(0, 0, 0, 0.7)';

/** Coordinate text size and corner inset, as fractions of one square. */
export const COORDINATE_FONT_SCALE = 0.24;
export const COORDINATE_INSET = 0.06;
