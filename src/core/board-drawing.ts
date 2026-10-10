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

/**
 * How an arrow's shaft is drawn: `solid` is the full-width line, `dashed` a
 * thinner broken one for a lighter, secondary mark in the same colors.
 */
export type ArrowStyle = 'solid' | 'dashed';

/** The style an arrow has when none is recorded — every arrow drawn before styles existed. */
export const DEFAULT_ARROW_STYLE: ArrowStyle = 'solid';

/** Each arrow style's name, for the style picker. */
export const ARROW_STYLES: Readonly<Record<ArrowStyle, { readonly label: string }>> = {
  solid: { label: 'Solid' },
  dashed: { label: 'Thin dashed' },
};

export const ARROW_STYLE_ORDER: readonly ArrowStyle[] = ['solid', 'dashed'];

/**
 * How a marked square is drawn: `fill` tints the whole square, `cross` lays an
 * X over it — both in the chosen color.
 */
export type SquareMark = 'fill' | 'cross';

/** The mark a square has when none is recorded — every square marked before marks existed. */
export const DEFAULT_SQUARE_MARK: SquareMark = 'fill';

/** Each square mark's name, for the mark picker. */
export const SQUARE_MARKS: Readonly<Record<SquareMark, { readonly label: string }>> = {
  fill: { label: 'Fill' },
  cross: { label: 'X' },
};

export const SQUARE_MARK_ORDER: readonly SquareMark[] = ['fill', 'cross'];

/** A user-drawn arrow between two squares, e.g. `{ from: 'e2', to: 'e4' }`. */
export interface BoardArrow {
  readonly from: string;
  readonly to: string;
  /** Absent for the default purple. */
  readonly color?: DrawingColor;
  /** Absent for the default solid shaft. */
  readonly style?: ArrowStyle;
}

/** What the user has drawn on one move's board: marked squares and arrows. */
export interface BoardDrawing {
  /** Every marked square, whether it's tinted or crossed with an X. */
  readonly squares: readonly string[];
  readonly arrows: readonly BoardArrow[];
  /** Each colored square's color, where it isn't the default purple. */
  readonly squareColors?: Readonly<Record<string, DrawingColor>>;
  /** Each marked square's mark, where it isn't the default fill. */
  readonly squareMarks?: Readonly<Record<string, SquareMark>>;
}

export const EMPTY_DRAWING: BoardDrawing = { squares: [], arrows: [] };

export function isEmptyDrawing(drawing: BoardDrawing | null | undefined): boolean {
  return !drawing || (drawing.squares.length === 0 && drawing.arrows.length === 0);
}

/** The color a colored square is drawn in. */
export function squareColor(drawing: BoardDrawing, square: string): DrawingColor {
  return drawing.squareColors?.[square] ?? DEFAULT_DRAWING_COLOR;
}

/** The mark a marked square is drawn with. */
export function squareMark(drawing: BoardDrawing, square: string): SquareMark {
  return drawing.squareMarks?.[square] ?? DEFAULT_SQUARE_MARK;
}

/** The color an arrow is drawn in. */
export function arrowColor(arrow: BoardArrow): DrawingColor {
  return arrow.color ?? DEFAULT_DRAWING_COLOR;
}

/** The shaft style an arrow is drawn with. */
export function arrowStyle(arrow: BoardArrow): ArrowStyle {
  return arrow.style ?? DEFAULT_ARROW_STYLE;
}

/**
 * Marks `square` in `color` with `mark`. Clears it when it already carries that
 * exact mark, and re-marks it when it differs in either color or mark.
 */
export function toggleSquare(
  drawing: BoardDrawing,
  square: string,
  color: DrawingColor = DEFAULT_DRAWING_COLOR,
  mark: SquareMark = DEFAULT_SQUARE_MARK,
): BoardDrawing {
  const marked = drawing.squares.includes(square);
  const { [square]: _previousColor, ...otherColors } = drawing.squareColors ?? {};
  const { [square]: _previousMark, ...otherMarks } = drawing.squareMarks ?? {};
  if (marked && squareColor(drawing, square) === color && squareMark(drawing, square) === mark) {
    return withSquareMarks(
      withSquareColors(
        { ...drawing, squares: drawing.squares.filter((s) => s !== square) },
        otherColors,
      ),
      otherMarks,
    );
  }
  // The default color and mark are left out, so a square marked the plain way
  // keeps the spelling it had before either option existed.
  return withSquareMarks(
    withSquareColors(
      { ...drawing, squares: marked ? drawing.squares : [...drawing.squares, square] },
      color === DEFAULT_DRAWING_COLOR ? otherColors : { ...otherColors, [square]: color },
    ),
    mark === DEFAULT_SQUARE_MARK ? otherMarks : { ...otherMarks, [square]: mark },
  );
}

/**
 * Draws the arrow in `color` and `style`. Removes it when that arrow is already
 * drawn exactly that way, and restyles it when it differs in either.
 */
export function toggleArrow(
  drawing: BoardDrawing,
  from: string,
  to: string,
  color: DrawingColor = DEFAULT_DRAWING_COLOR,
  style: ArrowStyle = DEFAULT_ARROW_STYLE,
): BoardDrawing {
  const existing = drawing.arrows.find((a) => a.from === from && a.to === to);
  const others = drawing.arrows.filter((a) => a !== existing);
  if (existing && arrowColor(existing) === color && arrowStyle(existing) === style) {
    return { ...drawing, arrows: others };
  }
  // Default color and style are left out, so an arrow drawn the plain way keeps
  // the spelling it had before either option existed.
  const arrow: BoardArrow = {
    from,
    to,
    ...(color === DEFAULT_DRAWING_COLOR ? {} : { color }),
    ...(style === DEFAULT_ARROW_STYLE ? {} : { style }),
  };
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

/** Sets the square-mark map, leaving the field out entirely when it's empty. */
function withSquareMarks(
  drawing: BoardDrawing,
  squareMarks: Record<string, SquareMark>,
): BoardDrawing {
  const { squareMarks: _dropped, ...rest } = drawing;
  return Object.keys(squareMarks).length > 0 ? { ...rest, squareMarks } : rest;
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
  const styleSuffix = (style: ArrowStyle) => (style === DEFAULT_ARROW_STYLE ? '' : `~${style}`);
  const markSuffix = (mark: SquareMark) => (mark === DEFAULT_SQUARE_MARK ? '' : `~${mark}`);
  const squares = drawing.squares
    .map(
      (square) =>
        `${square}${suffix(squareColor(drawing, square))}${markSuffix(squareMark(drawing, square))}`,
    )
    .sort()
    .join(',');
  const arrows = drawing.arrows
    .map((a) => `${a.from}${a.to}${suffix(arrowColor(a))}${styleSuffix(arrowStyle(a))}`)
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
