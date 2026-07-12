import { describe, expect, it } from 'vitest';
import { ChessService } from './chess-service';
import { comparisonIndex, divergentPlies } from './move-comparison';

const chess = new ChessService();
const positions = (pgn: string) => chess.parsePgn(pgn).positions;

describe('comparisonIndex', () => {
  it('compares against the previous entry, or the next one when first', () => {
    expect(comparisonIndex(0, 3)).toBe(1);
    expect(comparisonIndex(1, 3)).toBe(0);
    expect(comparisonIndex(2, 3)).toBe(1);
  });

  it('returns -1 when there is nothing to compare against', () => {
    expect(comparisonIndex(0, 1)).toBe(-1);
  });
});

describe('divergentPlies', () => {
  it('flags the first two half-moves that differ from the reference line', () => {
    const a = positions('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6');
    const b = positions('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6');
    expect([...divergentPlies(b, a)]).toEqual([5, 6]);
  });

  it('flags a single divergence when only one move differs', () => {
    const a = positions('1. e4 e5 2. Nf3 Nf6');
    const b = positions('1. e4 e5 2. Nf3 Nc6');
    expect([...divergentPlies(b, a)]).toEqual([4]);
  });

  it('treats moves the shorter reference never reaches as divergent', () => {
    const a = positions('1. e4 e5');
    const b = positions('1. e4 e5 2. Nf3 Nc6');
    expect([...divergentPlies(b, a)]).toEqual([3, 4]);
  });

  it('finds nothing when the lines are identical', () => {
    const a = positions('1. e4 e5 2. Nf3 Nc6');
    expect(divergentPlies(a, a).size).toBe(0);
  });
});
