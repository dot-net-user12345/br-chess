import { PieceCode } from './chess-models';

/** File letters, a→h, indexed by file number. */
export const FILES = 'abcdefgh';

/** Each piece letter spelled out, keyed by its uppercase (White) spelling. */
export const PIECE_NAMES: Readonly<Record<string, string>> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
  P: 'pawn',
};

/** The order pieces are listed in, strongest first, for stable reading order. */
const PIECE_ORDER = 'KQRBNP';

/** `black pawn` — a FEN letter spelled out with its color. */
export function pieceName(piece: PieceCode): string {
  const white = piece === piece.toUpperCase();
  return `${white ? 'white' : 'black'} ${PIECE_NAMES[piece.toUpperCase()]}`;
}

/** Every occupied square of a FEN's board, as `e4` paired with its piece letter. */
export function placements(fen: string): ReadonlyMap<string, PieceCode> {
  const squares = new Map<string, PieceCode>();
  fen
    .split(' ', 1)[0]
    .split('/')
    .forEach((rank, index) => {
      let file = 0;
      for (const char of rank) {
        const empty = Number(char);
        if (Number.isInteger(empty)) {
          file += empty;
        } else {
          squares.set(`${FILES[file]}${8 - index}`, char as PieceCode);
          file++;
        }
      }
    });
  return squares;
}

/**
 * Reading order for a list of placements: White's pieces before Black's, each
 * side strongest piece first, and same pieces by square.
 */
export function comparePlacements(
  a: { readonly piece: PieceCode; readonly square: string },
  b: { readonly piece: PieceCode; readonly square: string },
): number {
  const white = (piece: PieceCode) => (piece === piece.toUpperCase() ? 0 : 1);
  return (
    white(a.piece) - white(b.piece) ||
    PIECE_ORDER.indexOf(a.piece.toUpperCase()) - PIECE_ORDER.indexOf(b.piece.toUpperCase()) ||
    a.square.localeCompare(b.square)
  );
}
