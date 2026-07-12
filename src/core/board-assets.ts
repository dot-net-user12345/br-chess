import { PieceCode } from './chess-models';

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
}

// Arrow proportions, as fractions of one square.
const ARROW_HEAD_LENGTH = 0.4;
const ARROW_HEAD_WIDTH = 0.44;
const ARROW_STROKE_WIDTH = 0.16;

/** Center of an algebraic square (e.g. `e4`) in board units, a1 bottom-left. */
export function squareCenter(square: string): Point {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  return { x: file + 0.5, y: 8 - rank + 0.5 };
}

/**
 * Arrow geometry from one square to another, in board units. Shared by the live
 * SVG board and the canvas image renderer so both draw an identical arrow; each
 * caller scales the units to its own pixel/viewBox size.
 */
export function moveArrowGeometry(from: string, to: string): MoveArrow {
  const a = squareCenter(from);
  const b = squareCenter(to);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    shaftFrom: a,
    // Stop the shaft where the head begins so a round line cap won't poke through it.
    shaftTo: { x: b.x - ARROW_HEAD_LENGTH * 0.85 * cos, y: b.y - ARROW_HEAD_LENGTH * 0.85 * sin },
    head: [
      b,
      {
        x: b.x - ARROW_HEAD_LENGTH * cos + (ARROW_HEAD_WIDTH / 2) * sin,
        y: b.y - ARROW_HEAD_LENGTH * sin - (ARROW_HEAD_WIDTH / 2) * cos,
      },
      {
        x: b.x - ARROW_HEAD_LENGTH * cos - (ARROW_HEAD_WIDTH / 2) * sin,
        y: b.y - ARROW_HEAD_LENGTH * sin + (ARROW_HEAD_WIDTH / 2) * cos,
      },
    ],
    strokeWidth: ARROW_STROKE_WIDTH,
  };
}
