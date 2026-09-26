import {
  drawingKey,
  EMPTY_DRAWING,
  gridIndex,
  isEmptyDrawing,
  squareAt,
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
});
