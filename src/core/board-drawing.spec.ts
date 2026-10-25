import {
  arrowColor,
  arrowStyle,
  drawingKey,
  EMPTY_DRAWING,
  gridIndex,
  isEmptyDrawing,
  sanitizeArrowLabel,
  outlinePiece,
  squareAt,
  squareMarkKind,
  squareColor,
  squareMark,
  toggleArrow,
  toggleSquare,
} from './board-drawing';

describe('board drawing', () => {
  it('finds the square under a point from either side of the board', () => {
    // Top-left corner: a8 for White, h1 for Black.
    expect(squareAt(0.01, 0.01, 'white')).toBe('a8');
    expect(squareAt(0.01, 0.01, 'black')).toBe('h1');
    // Bottom-right corner: h1 for White, a8 for Black.
    expect(squareAt(0.99, 0.99, 'white')).toBe('h1');
    expect(squareAt(0.99, 0.99, 'black')).toBe('a8');
    expect(squareAt(4.5 / 8, 4.5 / 8, 'white')).toBe('e4');
    expect(squareAt(1.2, 0.5, 'white')).toBeNull();
  });

  it('maps a square to its cell in the rendered grid, round-tripping squareAt', () => {
    for (const orientation of ['white', 'black'] as const) {
      for (const square of ['a1', 'e4', 'h8', 'c6']) {
        const index = gridIndex(square, orientation) as number;
        const x = ((index % 8) + 0.5) / 8;
        const y = (Math.floor(index / 8) + 0.5) / 8;
        expect(squareAt(x, y, orientation)).toBe(square);
      }
    }
    expect(gridIndex('z9', 'white')).toBeNull();
  });

  it('toggles squares and arrows on and off', () => {
    const marked = toggleSquare(EMPTY_DRAWING, 'e4');
    expect(marked.squares).toEqual(['e4']);
    expect(toggleSquare(marked, 'e4').squares).toEqual([]);

    const arrowed = toggleArrow(EMPTY_DRAWING, 'g1', 'f3');
    expect(arrowed.arrows).toEqual([{ from: 'g1', to: 'f3' }]);
    // The reverse arrow is a different arrow; the same one again removes it.
    expect(toggleArrow(arrowed, 'f3', 'g1').arrows).toHaveLength(2);
    expect(isEmptyDrawing(toggleArrow(arrowed, 'g1', 'f3'))).toBe(true);
  });

  it('keys a drawing the same whatever order its marks were made in', () => {
    const a = toggleArrow(toggleSquare(toggleSquare(EMPTY_DRAWING, 'e4'), 'd5'), 'g1', 'f3');
    const b = toggleSquare(toggleArrow(toggleSquare(EMPTY_DRAWING, 'd5'), 'g1', 'f3'), 'e4');
    expect(drawingKey(a)).toBe(drawingKey(b));
    expect(drawingKey(EMPTY_DRAWING)).toBe('');
  });

  it('recolors a mark drawn in another color, and clears one drawn in the same color', () => {
    const green = toggleSquare(EMPTY_DRAWING, 'e4', 'green');
    expect(squareColor(green, 'e4')).toBe('green');

    const recolored = toggleSquare(green, 'e4', 'blue');
    expect(recolored.squares).toEqual(['e4']);
    expect(squareColor(recolored, 'e4')).toBe('blue');

    const cleared = toggleSquare(recolored, 'e4', 'blue');
    expect(cleared.squares).toEqual([]);
    // No leftover color map once nothing non-default is colored.
    expect(cleared.squareColors).toBeUndefined();

    const red = toggleArrow(EMPTY_DRAWING, 'g1', 'f3', 'red');
    const yellow = toggleArrow(red, 'g1', 'f3', 'yellow');
    expect(yellow.arrows).toHaveLength(1);
    expect(arrowColor(yellow.arrows[0])).toBe('yellow');
    expect(toggleArrow(yellow, 'g1', 'f3', 'yellow').arrows).toEqual([]);
  });

  it('keeps default purple marks in their original, color-free form', () => {
    const purple = toggleArrow(toggleSquare(EMPTY_DRAWING, 'e4'), 'g1', 'f3');
    expect(purple).toEqual({ squares: ['e4'], arrows: [{ from: 'g1', to: 'f3' }] });
    // So images rendered before colors existed keep their key.
    expect(drawingKey(purple)).toBe('e4/g1f3');
    expect(drawingKey(toggleSquare(purple, 'e4', 'green'))).toBe('e4:green/g1f3');
  });

  it('marks a square with an X, keeping it apart from a tinted one', () => {
    const crossed = toggleSquare(EMPTY_DRAWING, 'e4', 'red', 'cross');
    expect(crossed.squares).toEqual(['e4']);
    expect(squareMark(crossed, 'e4')).toBe('cross');
    expect(crossed.squareMarks).toEqual({ e4: 'cross' });

    // Same square and color, other mark: re-marked, not cleared.
    const tinted = toggleSquare(crossed, 'e4', 'red');
    expect(tinted.squares).toEqual(['e4']);
    expect(squareMark(tinted, 'e4')).toBe('fill');
    // No leftover mark map once nothing non-default is marked.
    expect(tinted.squareMarks).toBeUndefined();

    // Marked again exactly as it is: cleared, maps and all.
    const cleared = toggleSquare(crossed, 'e4', 'red', 'cross');
    expect(cleared.squares).toEqual([]);
    expect(cleared.squareColors).toBeUndefined();
    expect(cleared.squareMarks).toBeUndefined();

    // An X keys apart from a tint, so each renders its own image.
    expect(drawingKey(toggleSquare(EMPTY_DRAWING, 'e4', 'purple', 'cross'))).toBe('e4~cross/');
    expect(drawingKey(toggleSquare(EMPTY_DRAWING, 'e4', 'red', 'cross'))).toBe('e4:red~cross/');
  });

  it('marks a square with a piece outline, telling the pieces apart', () => {
    const knight = toggleSquare(EMPTY_DRAWING, 'f3', 'grey', 'outline-N');
    expect(squareMark(knight, 'f3')).toBe('outline-N');
    expect(squareColor(knight, 'f3')).toBe('grey');
    expect(outlinePiece('outline-N')).toBe('N');
    expect(outlinePiece('cross')).toBeNull();
    expect(squareMarkKind('outline-N')).toBe('outline');
    expect(squareMarkKind('fill')).toBe('fill');

    // Another piece re-marks the square; the same one again clears it.
    const bishop = toggleSquare(knight, 'f3', 'grey', 'outline-B');
    expect(squareMark(bishop, 'f3')).toBe('outline-B');
    expect(toggleSquare(bishop, 'f3', 'grey', 'outline-B').squares).toEqual([]);

    // Each piece keys its own image.
    expect(drawingKey(knight)).toBe('f3:grey~outline-N/');
  });

  it('puts a number on a solid arrow only, keeping its digits', () => {
    const one = toggleArrow(EMPTY_DRAWING, 'g1', 'f3', 'purple', 'solid', '1');
    expect(one.arrows).toEqual([{ from: 'g1', to: 'f3', label: '1' }]);
    expect(drawingKey(one)).toBe('/g1f3#1');

    // Another number redraws the arrow; the same one again removes it.
    const two = toggleArrow(one, 'g1', 'f3', 'purple', 'solid', '2');
    expect(two.arrows).toEqual([{ from: 'g1', to: 'f3', label: '2' }]);
    expect(toggleArrow(two, 'g1', 'f3', 'purple', 'solid', '2').arrows).toEqual([]);

    // A dashed link takes no number, and only digits are kept, three at most.
    expect(toggleArrow(EMPTY_DRAWING, 'g1', 'f3', 'red', 'dashed', '4').arrows[0].label).toBeUndefined();
    expect(sanitizeArrowLabel('a1b2c3d4')).toBe('123');
  });

  it('restyles a line between an arrow and a dashed link, in any color', () => {
    const dashed = toggleArrow(EMPTY_DRAWING, 'g1', 'f3', 'red', 'dashed');
    expect(dashed.arrows).toEqual([{ from: 'g1', to: 'f3', color: 'red', style: 'dashed' }]);
    expect(arrowStyle(dashed.arrows[0])).toBe('dashed');

    // Same squares and color, other style: the one arrow is restyled, not removed.
    const solid = toggleArrow(dashed, 'g1', 'f3', 'red');
    expect(solid.arrows).toHaveLength(1);
    expect(arrowStyle(solid.arrows[0])).toBe('solid');
    expect(solid.arrows[0].style).toBeUndefined();

    // Drawn again exactly as it is: removed.
    expect(toggleArrow(solid, 'g1', 'f3', 'red').arrows).toEqual([]);
    expect(toggleArrow(dashed, 'g1', 'f3', 'red', 'dashed').arrows).toEqual([]);

    // A dashed link keys apart from the arrow, so each renders its own image.
    expect(drawingKey(toggleArrow(EMPTY_DRAWING, 'g1', 'f3', 'purple', 'dashed'))).toBe(
      '/g1f3~dashed',
    );
    expect(drawingKey(solid)).toBe('/g1f3:red');
  });
});
