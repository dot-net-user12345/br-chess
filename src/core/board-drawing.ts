import { BoardOrientation } from './chess-models';

/** A user-drawn arrow between two squares, e.g. `{ from: 'e2', to: 'e4' }`. */
export interface BoardArrow {
  readonly from: string;
  readonly to: string;
}

/** What the user has drawn on one move's board: colored squares and arrows. */
export interface BoardDrawing {
  readonly squares: readonly string[];
  readonly arrows: readonly BoardArrow[];
}

/** Arrow color for user drawings, shared by the live board and the exported PNG. */
export const DRAWING_ARROW_COLOR = 'rgba(123, 31, 162, 0.85)';

/** Fill laid over a user-colored square, beneath its piece. */
export const DRAWING_SQUARE_FILL = 'rgba(123, 31, 162, 0.55)';

export const EMPTY_DRAWING: BoardDrawing = { squares: [], arrows: [] };

export function isEmptyDrawing(drawing: BoardDrawing | null | undefined): boolean {
  return !drawing || (drawing.squares.length === 0 && drawing.arrows.length === 0);
}

/** Colors `square`, or clears it when it's already colored. */
export function toggleSquare(drawing: BoardDrawing, square: string): BoardDrawing {
  return {
    ...drawing,
    squares: drawing.squares.includes(square)
      ? drawing.squares.filter((s) => s !== square)
      : [...drawing.squares, square],
  };
}

/** Draws the arrow, or removes it when the same arrow is already drawn. */
export function toggleArrow(drawing: BoardDrawing, from: string, to: string): BoardDrawing {
  const exists = drawing.arrows.some((a) => a.from === from && a.to === to);
  return {
    ...drawing,
    arrows: exists
      ? drawing.arrows.filter((a) => a.from !== from || a.to !== to)
      : [...drawing.arrows, { from, to }],
  };
}

/**
 * A stable signature of a drawing — the same marks in any order give the same
 * key — used to name its rendered image. '' for an empty drawing.
 */
export function drawingKey(drawing: BoardDrawing | null | undefined): string {
  if (isEmptyDrawing(drawing) || !drawing) {
    return '';
  }
  const squares = [...drawing.squares].sort().join(',');
  const arrows = drawing.arrows
    .map((a) => `${a.from}${a.to}`)
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
