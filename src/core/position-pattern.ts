import { comparePlacements, FILES, pieceName, placements } from './board-position';
import { PieceCode } from './chess-models';

/** Pieces a board must have in place, keyed by square, e.g. `{ f3: 'N', e5: 'p' }`. */
export type PositionPattern = Readonly<Record<string, PieceCode>>;

/** Whether a FEN's board has every piece of the pattern on its square. */
export function matchesPattern(fen: string, pattern: PositionPattern): boolean {
  const board = placements(fen);
  return Object.entries(pattern).every(([square, piece]) => board.get(square) === piece);
}

/**
 * The pattern as a FEN's piece-placement field, e.g. `8/8/8/8/8/5N2/8/8`. Only
 * the board part: the pattern has no side to move, and its pieces needn't make
 * a legal position.
 */
export function patternToFen(pattern: PositionPattern): string {
  const ranks: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let text = '';
    let empty = 0;
    for (const file of FILES) {
      const piece = pattern[`${file}${rank}`];
      if (piece) {
        text += (empty || '') + piece;
        empty = 0;
      } else {
        empty++;
      }
    }
    ranks.push(text + (empty || ''));
  }
  return ranks.join('/');
}

/** The pattern's pieces in reading order, e.g. `White knight on f3, black pawn on e5`. */
export function describePattern(pattern: PositionPattern): string {
  const text = Object.entries(pattern)
    .map(([square, piece]) => ({ square, piece }))
    .sort(comparePlacements)
    .map(({ square, piece }) => `${pieceName(piece)} on ${square}`)
    .join(', ');
  return text && `${text[0].toUpperCase()}${text.slice(1)}`;
}
