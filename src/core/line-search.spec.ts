import { describe, expect, it } from 'vitest';
import { ChessService } from './chess-service';
import { findMatchingSpan, formatSpan, parseMoveQuery } from './line-search';

const chess = new ChessService();
const positions = (pgn: string) => chess.parsePgn(pgn).positions;

/** Where a query matches in `pgn`, in the app's notation, or null when it doesn't. */
function find(query: string, pgn: string): string | null {
  const parsed = parseMoveQuery(query);
  if (!parsed) {
    return null;
  }
  const span = findMatchingSpan(positions(pgn), parsed);
  return span ? formatSpan(span) : null;
}

const RUY_LOPEZ = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7';
const LONDON = '1. d4 d5 2. Bf4 Nf6 3. e3 e6 4. Nf3 Bd6 5. Bg3 O-O';

describe('parseMoveQuery', () => {
  it('reads a move number and a move', () => {
    const query = parseMoveQuery('2. Bf4');
    expect(query?.moveNumber).toBe(2);
    expect(query?.moves.length).toBe(1);
    expect(query?.label).toBe('2. Bf4');
  });

  it('treats a plain dot as a separator, matching either side', () => {
    expect(parseMoveQuery('2. Bf4')?.color).toBeNull();
  });

  it('narrows to Black for an ellipsis, written either way', () => {
    expect(parseMoveQuery('7... Na6')?.color).toBe('black');
    expect(parseMoveQuery('7… Na6')?.color).toBe('black');
    expect(parseMoveQuery('7… Na6')?.label).toBe('7… Na6');
  });

  it('accepts a move on its own, matching any move number', () => {
    const query = parseMoveQuery('Bf4');
    expect(query?.moveNumber).toBeNull();
    expect(query?.label).toBe('Bf4');
  });

  it('reads a run of moves, anchored by its leading number', () => {
    const query = parseMoveQuery('1. e4 e5 2. Nf3');
    expect(query?.moveNumber).toBe(1);
    expect(query?.moves.length).toBe(3);
    expect(query?.label).toBe('1. e4 e5 2. Nf3');
  });

  it('numbers a run that opens on a Black move', () => {
    expect(parseMoveQuery('2... Nc6 3. Bb5')?.label).toBe('2… Nc6 3. Bb5');
  });

  it('tolerates missing and repeated spacing', () => {
    expect(parseMoveQuery('7.Na6')?.moveNumber).toBe(7);
    expect(parseMoveQuery('  7   Na6 ')?.moveNumber).toBe(7);
    expect(parseMoveQuery('1.e4 e5 2.Nf3')?.moves.length).toBe(3);
  });

  it('strips headers, comments, variations, glyphs and the result', () => {
    const pgn =
      '[Event "Casual"]\n[White "Me"]\n\n1. e4 {best by test} e5 $1 2. Nf3 (2. f4 exf4) Nc6 1-0';
    expect(parseMoveQuery(pgn)?.label).toBe('1. e4 e5 2. Nf3 Nc6');
  });

  it('rejects text that does not name a move yet', () => {
    expect(parseMoveQuery('')).toBeNull();
    expect(parseMoveQuery('7')).toBeNull();
    expect(parseMoveQuery('7.')).toBeNull();
    expect(parseMoveQuery('zz9')).toBeNull();
  });

  it('rejects a run containing something that is not a move', () => {
    expect(parseMoveQuery('1. e4 e5 2. Nf3 zzz')).toBeNull();
  });
});

describe('findMatchingSpan', () => {
  it('finds a move played at the given move number', () => {
    expect(find('2. Bf4', LONDON)).toBe('2. Bf4');
    expect(find('3. Bb5', RUY_LOPEZ)).toBe('3. Bb5');
  });

  it('finds a Black move written with the same dot notation', () => {
    expect(find('4. Nf6', RUY_LOPEZ)).toBe('4… Nf6');
  });

  it('restricts to Black when the query uses an ellipsis', () => {
    expect(find('4… Nf6', RUY_LOPEZ)).toBe('4… Nf6');
    expect(find('4… Ba4', RUY_LOPEZ)).toBeNull();
  });

  it('finds the first occurrence when no move number is given', () => {
    expect(find('Nf3', RUY_LOPEZ)).toBe('2. Nf3');
  });

  it('does not match the right move at the wrong move number', () => {
    expect(find('3. Bf4', LONDON)).toBeNull();
  });

  it('is forgiving about the case of the piece letter', () => {
    expect(find('2. bf4', LONDON)).toBe('2. Bf4');
    expect(find('2. NF3', RUY_LOPEZ)).toBe('2. Nf3');
  });

  it('keeps pawn and piece readings apart', () => {
    expect(find('1. d4', LONDON)).toBe('1. d4');
    expect(find('1. e4', RUY_LOPEZ)).toBe('1. e4');
  });

  it('matches castling however it is written', () => {
    expect(find('5. O-O', RUY_LOPEZ)).toBe('5. O-O');
    expect(find('5. 0-0', RUY_LOPEZ)).toBe('5. O-O');
    expect(find('5. o-o', RUY_LOPEZ)).toBe('5. O-O');
  });

  it('ignores check and annotation marks on either side', () => {
    const check = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#';
    expect(find('4. Qxf7', check)).toBe('4. Qxf7#');
    expect(find('4. Qxf7#', check)).toBe('4. Qxf7#');
    expect(find('4. Qxf7!!', check)).toBe('4. Qxf7#');
  });

  it('finds nothing in a line that never plays the move', () => {
    expect(find('7. Na6', LONDON)).toBeNull();
  });
});

describe('findMatchingSpan across a run of moves', () => {
  it('matches a partial PGN and reports the span it covers', () => {
    expect(find('1. e4 e5 2. Nf3', RUY_LOPEZ)).toBe('1. e4 – 2. Nf3');
  });

  it('matches a whole pasted PGN against the line it came from', () => {
    expect(find(RUY_LOPEZ, RUY_LOPEZ)).toBe('1. e4 – 5… Be7');
  });

  it('requires the moves to be played back to back', () => {
    // The line plays e4, e5 and Bb5, but not with Bb5 immediately after e5.
    expect(find('1. e4 e5 2. Bb5', RUY_LOPEZ)).toBeNull();
  });

  it('requires the run to start where the leading number says', () => {
    expect(find('2. e4 e5 Nf3', RUY_LOPEZ)).toBeNull();
  });

  it('matches a run anywhere in the line when no number anchors it', () => {
    expect(find('Nf3 Nc6 Bb5', RUY_LOPEZ)).toBe('2. Nf3 – 3. Bb5');
  });

  it('anchors a run to Black when the query uses an ellipsis', () => {
    expect(find('2… Nc6 3. Bb5', RUY_LOPEZ)).toBe('2… Nc6 – 3. Bb5');
    expect(find('2. Nc6 3. Bb5', LONDON)).toBeNull();
  });

  it('does not match a run that runs off the end of a line', () => {
    expect(find('5. O-O Be7 6. Re1', RUY_LOPEZ)).toBeNull();
  });

  it('tells apart lines that share an opening but diverge', () => {
    const italian = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5';
    expect(find('1. e4 e5 2. Nf3 Nc6', italian)).toBe('1. e4 – 2… Nc6');
    expect(find('3. Bb5', italian)).toBeNull();
    expect(find('3. Bc4', italian)).toBe('3. Bc4');
  });
});
