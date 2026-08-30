import { describe, expect, it } from 'vitest';
import { ChessService } from './chess-service';
import { findMatchingPosition, formatMove, parsePlyQuery } from './line-search';

const chess = new ChessService();
const positions = (pgn: string) => chess.parsePgn(pgn).positions;

/** The move a query finds in `pgn`, in the app's notation, or null when none. */
function find(query: string, pgn: string): string | null {
  const parsed = parsePlyQuery(query);
  if (!parsed) {
    return null;
  }
  const position = findMatchingPosition(positions(pgn), parsed);
  return position ? formatMove(position) : null;
}

const RUY_LOPEZ = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7';
const LONDON = '1. d4 d5 2. Bf4 Nf6 3. e3 e6 4. Nf3 Bd6 5. Bg3 O-O';

describe('parsePlyQuery', () => {
  it('reads a move number and a move', () => {
    const query = parsePlyQuery('2. Bf4');
    expect(query?.moveNumber).toBe(2);
    expect(query?.label).toBe('2. Bf4');
  });

  it('treats a plain dot as a separator, matching either side', () => {
    expect(parsePlyQuery('2. Bf4')?.color).toBeNull();
  });

  it('narrows to Black for an ellipsis, written either way', () => {
    expect(parsePlyQuery('7... Na6')?.color).toBe('black');
    expect(parsePlyQuery('7… Na6')?.color).toBe('black');
    expect(parsePlyQuery('7… Na6')?.label).toBe('7… Na6');
  });

  it('accepts a move on its own, matching any move number', () => {
    const query = parsePlyQuery('Bf4');
    expect(query?.moveNumber).toBeNull();
    expect(query?.label).toBe('Bf4');
  });

  it('tolerates missing and repeated spacing', () => {
    expect(parsePlyQuery('7.Na6')?.moveNumber).toBe(7);
    expect(parsePlyQuery('  7   Na6 ')?.moveNumber).toBe(7);
  });

  it('rejects text that does not name a move yet', () => {
    expect(parsePlyQuery('')).toBeNull();
    expect(parsePlyQuery('7')).toBeNull();
    expect(parsePlyQuery('7.')).toBeNull();
    expect(parsePlyQuery('zz9')).toBeNull();
  });
});

describe('findMatchingPosition', () => {
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
