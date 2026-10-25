import { describePattern, matchesPattern, patternToFen } from './position-pattern';

describe('position pattern', () => {
  const afterNf3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

  it('matches only a board with every piece on its square', () => {
    expect(matchesPattern(afterNf3, {})).toBe(true);
    expect(matchesPattern(afterNf3, { f3: 'N', e5: 'p' })).toBe(true);
    expect(matchesPattern(afterNf3, { f3: 'N', e5: 'P' })).toBe(false);
    expect(matchesPattern(afterNf3, { f3: 'N', c6: 'n' })).toBe(false);
  });

  it('matches an x only on an empty square', () => {
    expect(matchesPattern(afterNf3, { e2: 'x', g1: 'x' })).toBe(true);
    expect(matchesPattern(afterNf3, { f3: 'N', e2: 'x' })).toBe(true);
    expect(matchesPattern(afterNf3, { f3: 'x' })).toBe(false);
  });

  it('writes the board part of a FEN, legal or not', () => {
    expect(patternToFen({})).toBe('8/8/8/8/8/8/8/8');
    expect(patternToFen({ f3: 'N', e5: 'p' })).toBe('8/8/8/4p3/8/5N2/8/8');
    expect(patternToFen({ a8: 'K', h8: 'K', d1: 'q', e1: 'q' })).toBe('K6K/8/8/8/8/8/8/3qq3');
    expect(patternToFen({ f3: 'N', e2: 'x', h2: 'x' })).toBe('8/8/8/8/8/5N2/4x2x/8');
  });

  it('describes the pieces in reading order', () => {
    expect(describePattern({})).toBe('');
    expect(describePattern({ e5: 'p', f3: 'N', e4: 'P' })).toBe(
      'White knight on f3, white pawn on e4, black pawn on e5',
    );
    expect(describePattern({ e2: 'x', f3: 'N', d2: 'x' })).toBe(
      'White knight on f3, d2 empty, e2 empty',
    );
  });
});
