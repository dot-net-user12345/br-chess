import { Injectable } from '@angular/core';
import { Chess } from 'chess.js';
import { BoardSquares, GamePosition, PgnParseResult, PieceCode } from './chess-models';

const PIECE_CODES = new Set<PieceCode>(['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p']);

@Injectable({ providedIn: 'root' })
export class ChessService {
  /**
   * Parses a PGN string into the ordered list of board positions it produces.
   * The starting position is always included as ply 0, followed by one position
   * per half-move. Invalid PGN yields `valid: false` with a readable message.
   */
  parsePgn(pgn: string): PgnParseResult {
    const trimmed = pgn.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: 'Enter a PGN to preview the game.', positions: [] };
    }

    const game = new Chess();
    try {
      game.loadPgn(trimmed);
    } catch (err) {
      return { valid: false, error: this.describeError(err), positions: [] };
    }

    const history = game.history({ verbose: true });
    if (history.length === 0) {
      return { valid: false, error: 'No moves were found in this PGN.', positions: [] };
    }

    const start = new Chess();
    const positions: GamePosition[] = [
      { ply: 0, moveNumber: 0, color: null, san: null, fen: start.fen() },
    ];
    history.forEach((move, index) => {
      positions.push({
        ply: index + 1,
        moveNumber: Math.floor(index / 2) + 1,
        color: move.color === 'w' ? 'white' : 'black',
        san: move.san,
        fen: move.after,
      });
    });

    return { valid: true, error: null, positions };
  }

  /**
   * Converts the board portion of a FEN string into an 8x8 grid, rank 8 first
   * and file a first, so it can be laid out directly in a template.
   */
  fenToSquares(fen: string): BoardSquares {
    const placement = fen.split(' ', 1)[0];
    return placement.split('/').map((rank) => {
      const squares: (PieceCode | null)[] = [];
      for (const char of rank) {
        const emptyCount = Number(char);
        if (Number.isInteger(emptyCount)) {
          for (let i = 0; i < emptyCount; i++) {
            squares.push(null);
          }
        } else if (PIECE_CODES.has(char as PieceCode)) {
          squares.push(char as PieceCode);
        }
      }
      return squares;
    });
  }

  private describeError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    // chess.js messages are verbose; keep them but front them with clear context.
    return `Invalid PGN: ${raw}`;
  }
}
