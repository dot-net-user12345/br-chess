import { fileLabels, moveArrowGeometry, rankLabels, squareCenter } from './board-assets';

/** Distance between two points, in board units. */
function gap(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('drawn line geometry', () => {
  it('draws the solid style as an arrow from the square center into a head', () => {
    const arrow = moveArrowGeometry('e2', 'e4');
    expect(arrow.shaftFrom).toEqual(squareCenter('e2'));
    expect(arrow.head).toHaveLength(3);
    // The head's tip sits on the square it points at.
    expect(arrow.head[0]).toEqual(squareCenter('e4'));
    // The shaft stops short of the tip, so a round cap can't poke through it.
    expect(gap(arrow.shaftTo, squareCenter('e4'))).toBeGreaterThan(0.2);
    expect(arrow.dash).toEqual([]);
    expect(arrow.markers).toEqual([]);
    expect(arrow.marker).toBeNull();
  });

  it('draws the dashed style headless, ringed at both square centers', () => {
    const link = moveArrowGeometry('g1', 'f3', 'dashed');
    expect(link.head).toEqual([]);
    expect(link.dash.length).toBeGreaterThan(0);
    // A marker on each end square's center, so the link points neither way.
    expect(link.markers).toEqual([squareCenter('g1'), squareCenter('f3')]);

    const marker = link.marker;
    expect(marker).not.toBeNull();
    const clearance = (marker?.ringRadius ?? 0) + (marker?.ringWidth ?? 0) / 2;
    // Both ends stop outside their ring, so no dash runs into one.
    expect(gap(link.shaftFrom, squareCenter('g1'))).toBeGreaterThan(clearance);
    expect(gap(link.shaftTo, squareCenter('f3'))).toBeGreaterThan(clearance);
    // The shaft still runs most of the way between the two squares.
    expect(gap(link.shaftFrom, link.shaftTo)).toBeGreaterThan(
      gap(squareCenter('g1'), squareCenter('f3')) / 2,
    );
    // Thinner than the arrow, and the dot sits inside the ring.
    expect(link.strokeWidth).toBeLessThan(moveArrowGeometry('g1', 'f3').strokeWidth);
    expect(marker?.dotRadius ?? 0).toBeLessThan(marker?.ringRadius ?? 0);
  });
});

describe('board coordinates', () => {
  it('reads the files and ranks from the viewer side of the board', () => {
    // White sees a–h left to right and 8–1 top to bottom; Black sees both reversed.
    expect(fileLabels('white').join('')).toBe('abcdefgh');
    expect(rankLabels('white').join('')).toBe('87654321');
    expect(fileLabels('black').join('')).toBe('hgfedcba');
    expect(rankLabels('black').join('')).toBe('12345678');
  });

  it('keeps the labels a fresh array, so reversing one cannot leak', () => {
    const first = fileLabels('black').join('');
    expect(fileLabels('black').join('')).toBe(first);
    expect(fileLabels('white').join('')).toBe('abcdefgh');
  });
});
