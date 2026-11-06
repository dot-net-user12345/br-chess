import { describe, expect, it } from 'vitest';
import { ChessService } from './chess-service';
import {
  boardPart,
  fenMatches,
  moveLabel,
  patternMatches,
  pgnMatches,
  searchLines,
} from './move-search';
import { PgnGridFileNode } from './workspace-models';

const chess = new ChessService();

function file(id: string, pgns: string[]): PgnGridFileNode {
  return {
    id,
    name: id,
    kind: 'file',
    fileType: 'pgn-grid',
    parentId: null,
    ownerId: '',
    createdAt: '',
    updatedAt: '',
    content: { entries: pgns.map((pgn, i) => ({ id: `${id}-${i}`, pgn })) },
  };
}

const lines = searchLines(
  [file('London', ['1. d4 Nf6 2. Bf4 g6 3. e3 Bg7', 'not a pgn']), file('Italian', ['1. e4 e5'])],
  (id) => `Openings/${id}`,
  (pgn) => chess.parsePgn(pgn),
);

describe('searchLines', () => {
  it('keeps the lines that parse, by path, titled with their path and number', () => {
    expect(lines.map((line) => line.title)).toEqual([
      'Openings/Italian › Line 1',
      'Openings/London › Line 1',
    ]);
    expect(lines[1].orientation).toBe('white');
  });
});

describe('pgnMatches', () => {
  it('finds the board after the moves a line opens with', () => {
    const london = lines[1];
    expect(pgnMatches(london, ['d4', 'Nf6', 'Bf4']).map(moveLabel)).toEqual(['2. Bf4']);
    expect(pgnMatches(london, ['e4'])).toEqual([]);
  });
});

describe('patternMatches', () => {
  it('finds where the pieces first come into place', () => {
    expect(patternMatches(lines[1], { f4: 'B', g7: 'b' }).map(moveLabel)).toEqual(['3… Bg7']);
  });
});

describe('fenMatches', () => {
  it('matches on the board alone, ignoring side to move and counters', () => {
    const afterE4 = chess.parsePgn('1. e4').positions[1].fen;
    const board = boardPart(afterE4);
    expect(fenMatches(lines[0], `${board} w - - 0 99`).map(moveLabel)).toEqual(['1. e4']);
    expect(fenMatches(lines[0], board).map((p) => p.ply)).toEqual([1]);
    expect(fenMatches(lines[0], '')).toEqual([]);
  });
});
