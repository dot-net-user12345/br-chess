import { TestBed } from '@angular/core/testing';

import { ChessService } from './chess-service';

describe('ChessService', () => {
  let service: ChessService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ChessService);
  });

  it('parses a valid PGN into start + one position per half-move', () => {
    const result = service.parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');

    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
    // start position + 6 half-moves
    expect(result.positions.length).toBe(7);
    expect(result.positions[0].san).toBeNull();
    expect(result.positions[1].san).toBe('e4');
    expect(result.positions[1].color).toBe('white');
    expect(result.positions[2].color).toBe('black');
    expect(result.positions[6].moveNumber).toBe(3);
  });

  it('rejects invalid PGN with a message', () => {
    const result = service.parsePgn('1. e4 zzz nonsense');

    expect(result.valid).toBe(false);
    expect(result.positions.length).toBe(0);
    expect(result.error).toBeTruthy();
  });

  it('treats empty input as incomplete', () => {
    const result = service.parsePgn('   ');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Enter a PGN');
  });

  it('renders moves back into numbered PGN move text', () => {
    expect(service.toMoveText(['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3');
    expect(service.toMoveText(['e4'])).toBe('1. e4');
    expect(service.toMoveText([])).toBe('');
  });

  it('renders move text that parses back to the same moves', () => {
    const source = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6';
    // The moves up to White's third, as the board dialog's copy-PGN builds them.
    const sans = service
      .parsePgn(source)
      .positions.slice(1, 6)
      .map((position) => position.san as string);

    const moveText = service.toMoveText(sans);

    expect(moveText).toBe('1. e4 e5 2. Nf3 Nc6 3. Bb5');
    const reparsed = service.parsePgn(moveText);
    expect(reparsed.valid).toBe(true);
    expect(reparsed.positions.slice(1).map((position) => position.san)).toEqual(sans);
  });

  it('converts a FEN into an 8x8 grid with pieces in the right corners', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const board = service.fenToSquares(start);

    expect(board.length).toBe(8);
    expect(board.every((rank) => rank.length === 8)).toBe(true);
    // rank 8 (top) is black back rank, rank 1 (bottom) is white back rank
    expect(board[0][0]).toBe('r');
    expect(board[0][4]).toBe('k');
    expect(board[7][4]).toBe('K');
    // middle is empty
    expect(board[3][3]).toBeNull();
  });
});
