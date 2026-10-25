import { comparePlacements, FILES, pieceName, placements } from './board-position';
import { PieceCode } from './chess-models';

/** The mark for a square that must be empty. */
export const EMPTY_MARK = 'x';

/** What a pattern asks of one square: a particular piece, or {@link EMPTY_MARK} for none. */
export type PatternMark = PieceCode | typeof EMPTY_MARK;

/**
 * What a board must have on some of its squares, keyed by square, e.g.
 * `{ f3: 'N', e5: 'p', d4: 'x' }` — a piece on each, or nothing on an `x`.
 */
export type PositionPattern = Readonly<Record<string, PatternMark>>;

/** Whether a FEN's board has every piece of the pattern on its square, and nothing on its `x`s. */
export function matchesPattern(fen: string, pattern: PositionPattern): boolean {
  const board = placements(fen);
  return Object.entries(pattern).every(([square, mark]) =>
    mark === EMPTY_MARK ? !board.has(square) : board.get(square) === mark,
  );
}

/**
 * The pattern as a FEN's piece-placement field, e.g. `8/8/8/8/8/5N2/8/8`. Only
 * the board part: the pattern has no side to move, and its pieces needn't make
 * a legal position. A square that must be empty is written `x`, which no real
 * FEN has.
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

/**
 * The pattern in reading order, pieces first, e.g.
 * `White knight on f3, black pawn on e5, d4 empty`.
 */
export function describePattern(pattern: PositionPattern): string {
  const entries = Object.entries(pattern);
  const pieces = entries
    .flatMap(([square, mark]) => (mark === EMPTY_MARK ? [] : [{ square, piece: mark }]))
    .sort(comparePlacements)
    .map(({ square, piece }) => `${pieceName(piece)} on ${square}`);
  const empty = entries
    .flatMap(([square, mark]) => (mark === EMPTY_MARK ? [square] : []))
    .sort()
    .map((square) => `${square} empty`);
  const text = [...pieces, ...empty].join(', ');
  // A sentence capital for a piece's color; a square name stays lowercase.
  return pieces.length > 0 ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}
