import { BoardOrientation } from './chess-models';

/**
 * The colors a user can draw with. Orange is deliberately absent: it's the
 * move arrow's color, so a drawn arrow could be mistaken for the move itself.
 */
export type DrawingColor = 'purple' | 'green' | 'red' | 'blue' | 'yellow';

/** The color a mark has when none is recorded — every mark drawn before colors existed. */
export const DEFAULT_DRAWING_COLOR: DrawingColor = 'purple';

/** Each drawing color's name and its shades, shared by the live board and the exported PNG. */
export const DRAWING_COLORS: Readonly<
  Record<DrawingColor, { readonly label: string; readonly arrow: string; readonly fill: string }>
> = {
  purple: { label: 'Purple', arrow: 'rgba(123, 31, 162, 0.85)', fill: 'rgba(123, 31, 162, 0.55)' },
  green: { label: 'Green', arrow: 'rgba(21, 120, 27, 0.85)', fill: 'rgba(56, 142, 60, 0.6)' },
  red: { label: 'Red', arrow: 'rgba(198, 40, 40, 0.85)', fill: 'rgba(211, 47, 47, 0.55)' },
  blue: { label: 'Blue', arrow: 'rgba(21, 101, 192, 0.85)', fill: 'rgba(30, 136, 229, 0.55)' },
  yellow: { label: 'Yellow', arrow: 'rgba(230, 190, 0, 0.9)', fill: 'rgba(253, 216, 53, 0.65)' },
};

export const DRAWING_COLOR_ORDER: readonly DrawingColor[] = [
  'purple',
  'green',
  'red',
  'blue',
  'yellow',
];

/** A user-drawn arrow between two squares, e.g. `{ from: 'e2', to: 'e4' }`. */
export interface BoardArrow {
  readonly from: string;
  readonly to: string;
  /** Absent for the default purple. */
  readonly color?: DrawingColor;
}

/** What the user has drawn on one move's board: colored squares and arrows. */
export interface BoardDrawing {
  readonly squares: readonly string[];
  readonly arrows: readonly BoardArrow[];
  /** Each colored square's color, where it isn't the default purple. */
  readonly squareColors?: Readonly<Record<string, DrawingColor>>;
}

export const EMPTY_DRAWING: BoardDrawing = { squares: [], arrows: [] };

export function isEmptyDrawing(drawing: BoardDrawing | null | undefined): boolean {
  return !drawing || (drawing.squares.length === 0 && drawing.arrows.length === 0);
}

/** The color a colored square is drawn in. */
export function squareColor(drawing: BoardDrawing, square: string): DrawingColor {
  return drawing.squareColors?.[square] ?? DEFAULT_DRAWING_COLOR;
}

/** The color an arrow is drawn in. */
export function arrowColor(arrow: BoardArrow): DrawingColor {
  return arrow.color ?? DEFAULT_DRAWING_COLOR;
}

/**
 * Colors `square` in `color`. Clears it when it's already that color, and
 * recolors it when it's another.
 */
export function toggleSquare(
  drawing: BoardDrawing,
  square: string,
  color: DrawingColor = DEFAULT_DRAWING_COLOR,
): BoardDrawing {
  const marked = drawing.squares.includes(square);
  const { [square]: _previous, ...otherColors } = drawing.squareColors ?? {};
  if (marked && squareColor(drawing, square) === color) {
    return withSquareColors(
      { ...drawing, squares: drawing.squares.filter((s) => s !== square) },
      otherColors,
    );
  }
  return withSquareColors(
    { ...drawing, squares: marked ? drawing.squares : [...drawing.squares, square] },
    color === DEFAULT_DRAWING_COLOR ? otherColors : { ...otherColors, [square]: color },
  );
}

/**
 * Draws the arrow in `color`. Removes it when that arrow is already drawn in
 * that color, and recolors it when it's drawn in another.
 */
export function toggleArrow(
  drawing: BoardDrawing,
  from: string,
  to: string,
  color: DrawingColor = DEFAULT_DRAWING_COLOR,
): BoardDrawing {
  const existing = drawing.arrows.find((a) => a.from === from && a.to === to);
  const others = drawing.arrows.filter((a) => a !== existing);
  if (existing && arrowColor(existing) === color) {
    return { ...drawing, arrows: others };
  }
  const arrow: BoardArrow = color === DEFAULT_DRAWING_COLOR ? { from, to } : { from, to, color };
  return { ...drawing, arrows: [...others, arrow] };
}

/** Sets the square-color map, leaving the field out entirely when it's empty. */
function withSquareColors(
  drawing: BoardDrawing,
  squareColors: Record<string, DrawingColor>,
): BoardDrawing {
  const { squareColors: _dropped, ...rest } = drawing;
  return Object.keys(squareColors).length > 0 ? { ...rest, squareColors } : rest;
}

/**
 * A stable signature of a drawing — the same marks in any order give the same
 * key — used to name its rendered image. '' for an empty drawing.
 */
export function drawingKey(drawing: BoardDrawing | null | undefined): string {
  if (isEmptyDrawing(drawing) || !drawing) {
    return '';
  }
  // Default-colored marks keep their pre-color spelling, so images already
  // rendered for them are still found.
  const suffix = (color: DrawingColor) => (color === DEFAULT_DRAWING_COLOR ? '' : `:${color}`);
  const squares = drawing.squares
    .map((square) => `${square}${suffix(squareColor(drawing, square))}`)
    .sort()
    .join(',');
  const arrows = drawing.arrows
    .map((a) => `${a.from}${a.to}${suffix(arrowColor(a))}`)
    .sort()
    .join(',');
  return `${squares}/${arrows}`;
}

/**
 * The square under a point on the board, given as fractions (0–1) of the
 * board's width and height from its top-left corner. Null off the board.
 */
export function squareAt(x: number, y: number, orientation: BoardOrientation): string | null {
  const col = Math.floor(x * 8);
  const row = Math.floor(y * 8);
  if (col < 0 || col > 7 || row < 0 || row > 7) {
    return null;
  }
  // White sees file a on the left and rank 8 on top; black sees it rotated 180°.
  const file = orientation === 'black' ? 7 - col : col;
  const rank = orientation === 'black' ? row + 1 : 8 - row;
  return `${String.fromCharCode('a'.charCodeAt(0) + file)}${rank}`;
}

/**
 * Index of `square` in the board's rendered 64-cell grid (row by row from the
 * top-left as the viewer sees it). Null for anything that isn't a square.
 */
export function gridIndex(square: string, orientation: BoardOrientation): number | null {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  if (square.length !== 2 || file < 0 || file > 7 || !Number.isInteger(rank) || rank < 1 || rank > 8) {
    return null;
  }
  const whiteIndex = (8 - rank) * 8 + file;
  return orientation === 'black' ? 63 - whiteIndex : whiteIndex;
}
