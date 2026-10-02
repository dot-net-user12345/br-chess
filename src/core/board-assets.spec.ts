import { fileLabels, rankLabels } from './board-assets';

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
