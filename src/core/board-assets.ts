import { ArrowStyle, DEFAULT_ARROW_STYLE, OutlinePiece } from './board-drawing';
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

/**
 * Each piece's outline as SVG path data, in the 45×45 units of the bundled
 * piece images — the strokes of the light pieces, so a dashed trace of them
 * reads as the piece. The knight's small filled eye and nostril are left out:
 * dashed, they would only be specks.
 */
export const PIECE_OUTLINES: Readonly<Record<OutlinePiece, readonly string[]>> = {
  K: [
    'M22.5 11.63V6M20 8h5',
    'M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5',
    'M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7',
    'M12.5 30c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0',
  ],
  Q: [
    'M9 26C17.5 24.5 30 24.5 36 26L38.5 13.5 31 25 30.7 10.9 25.5 24.5 22.5 10 19.5 24.5 14.3 10.9 14 25 6.5 13.5 9 26z',
    'M9 26C9 28 10.5 28 11.5 30 12.5 31.5 12.5 31 12 33.5 10.5 34.5 11 36 11 36 9.5 37.5 11 38.5 11 38.5 17.5 39.5 27.5 39.5 34 38.5 34 38.5 35.5 37.5 34 36 34 36 34.5 34.5 33 33.5 32.5 31 32.5 31.5 33.5 30 34.5 28 36 28 36 26 27.5 24.5 17.5 24.5 9 26z',
    'M11.5 30C15 29 30 29 33.5 30',
    'M12 33.5C18 32.5 27 32.5 33 33.5',
    'M8 12A2 2 0 1 1 4 12 2 2 0 1 1 8 12z',
    'M16 9A2 2 0 1 1 12 9 2 2 0 1 1 16 9z',
    'M24.5 8A2 2 0 1 1 20.5 8 2 2 0 1 1 24.5 8z',
    'M33 9A2 2 0 1 1 29 9 2 2 0 1 1 33 9z',
    'M41 12A2 2 0 1 1 37 12 2 2 0 1 1 41 12z',
  ],
  R: [
    'M9 39.3H36V36.3H9z',
    'M12 36.3V32.3H33V36.3z',
    'M11 14.3V9.3H15V11.3H20V9.3H25V11.3H30V9.3H34V14.3',
    'M34 14.3L31 17.3H14L11 14.3',
    'M31 17.3V29.8H14V17.3',
    'M31 29.8L32.5 32.3H12.5L14 29.8',
    'M11 14.3H34',
  ],
  B: [
    'M9 36.6C12.39 35.63 19.11 37.03 22.5 34.6 25.89 37.03 32.61 35.63 36 36.6 36 36.6 37.65 37.14 39 38.6 38.32 39.57 37.35 39.59 36 39.1 32.61 38.13 25.89 39.56 22.5 38.1 19.11 39.56 12.39 38.13 9 39.1 7.65 39.59 6.68 39.57 6 38.6 7.35 37.14 9 36.6 9 36.6z',
    'M15 32.6C17.5 35.1 27.5 35.1 30 32.6 30.5 31.1 30 30.6 30 30.6 30 28.1 27.5 26.6 27.5 26.6 33 25.1 33.5 15.1 22.5 11.1 11.5 15.1 12 25.1 17.5 26.6 17.5 26.6 15 28.1 15 30.6 15 30.6 14.5 31.1 15 32.6z',
    'M25 8.6A2.5 2.5 0 1 1 20 8.6 2.5 2.5 0 1 1 25 8.6z',
    'M17.5 26.6H27.5M15 30.6H30M22.5 16.1V21.1M20 18.6H25',
  ],
  N: [
    'M22 10.3C32.5 11.3 38.5 18.3 38 39.3H15C15 30.3 25 32.8 23 18.3',
    'M24 18.3C24.38 21.21 18.45 25.67 16 27.3 13 29.3 13.18 31.64 11 31.3 9.958 30.36 12.41 28.26 11 28.3 10 28.3 11.19 29.53 10 30.3 9 30.3 5.997 31.3 6 26.3 6 24.3 12 14.3 12 14.3 12 14.3 13.89 12.4 14 10.8 13.27 9.806 13.5 8.8 13.5 7.8 14.5 6.8 16.5 10.3 16.5 10.3H18.5C18.5 10.3 19.28 8.308 21 7.3 22 7.3 22 10.3 22 10.3',
  ],
  P: [
    'M22.5 9C20.29 9 18.5 10.79 18.5 13 18.5 13.89 18.79 14.71 19.28 15.38 17.33 16.5 16 18.59 16 21 16 23.03 16.94 24.84 18.41 26.03 15.41 27.09 11 31.58 11 39.5H34C34 31.58 29.59 27.09 26.59 26.03 28.06 24.84 29 23.03 29 21 29 18.59 27.67 16.5 25.72 15.38 26.21 14.71 26.5 13.89 26.5 13 26.5 10.79 24.71 9 22.5 9z',
  ],
};

/** The outline paths' coordinate size, and their dashed stroke in those units. */
export const PIECE_OUTLINE_SIZE = 45;
export const PIECE_OUTLINE_STROKE = 2;
export const PIECE_OUTLINE_DASH: readonly number[] = [3, 2];

/** A point in board units, where 1 unit = 1 square and (0,0) is the top-left corner. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A radio-button end marker — an outer ring with a filled dot inside it — that
 * caps a line in place of an arrowhead. Sizes in board units.
 */
export interface LineMarker {
  readonly ringRadius: number;
  readonly ringWidth: number;
  readonly dotRadius: number;
}

/** Drawn-line geometry, expressed in board units (1 unit = 1 square). */
export interface MoveArrow {
  readonly shaftFrom: Point;
  readonly shaftTo: Point;
  /** The arrowhead's three corners; empty when the line has no head. */
  readonly head: readonly Point[];
  readonly strokeWidth: number;
  /**
   * Dash/gap lengths for the shaft, in board units; empty for an unbroken one.
   * Scale each entry the same way as the stroke width.
   */
  readonly dash: readonly number[];
  /** Points to cap with {@link marker}; empty when the line ends in a head. */
  readonly markers: readonly Point[];
  /** How each end marker is drawn; null for a line that has none. */
  readonly marker: LineMarker | null;
}

// Line proportions, as fractions of one square, per style. The solid line is an
// arrow: a thick shaft into a head. The dashed one is slimmer and headless,
// ringed at both ends instead, so it links two squares without pointing either
// way and reads as a lighter, secondary mark beside an arrow of the same color.
const LINE_PROPORTIONS: Readonly<
  Record<
    ArrowStyle,
    {
      readonly headLength: number;
      readonly headWidth: number;
      readonly strokeWidth: number;
      readonly dash: readonly number[];
      readonly marker: LineMarker | null;
    }
  >
> = {
  solid: { headLength: 0.4, headWidth: 0.44, strokeWidth: 0.16, dash: [], marker: null },
  dashed: {
    headLength: 0,
    headWidth: 0,
    strokeWidth: 0.07,
    dash: [0.2, 0.13],
    marker: { ringRadius: 0.13, ringWidth: 0.045, dotRadius: 0.055 },
  },
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
  const { headLength, headWidth, strokeWidth, dash, marker } = LINE_PROPORTIONS[style];
  const a = squareCenter(from);
  const b = squareCenter(to);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  if (marker) {
    // Headless: the line runs from marker to marker, stopping clear of both
    // rings so the dashes never run into them.
    const gap = marker.ringRadius + marker.ringWidth / 2 + strokeWidth;
    return {
      shaftFrom: { x: a.x + gap * cos, y: a.y + gap * sin },
      shaftTo: { x: b.x - gap * cos, y: b.y - gap * sin },
      head: [],
      strokeWidth,
      dash,
      markers: [a, b],
      marker,
    };
  }
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
    markers: [],
    marker: null,
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
