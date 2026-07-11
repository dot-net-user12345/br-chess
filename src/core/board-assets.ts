import { PieceCode } from './chess-models';

/** Maps each FEN piece code to its bundled SVG asset basename. */
const PIECE_ASSETS: Record<PieceCode, string> = {
  K: 'klt45',
  Q: 'qlt45',
  R: 'rlt45',
  B: 'blt45',
  N: 'nlt45',
  P: 'plt45',
  k: 'kdt45',
  q: 'qdt45',
  r: 'rdt45',
  b: 'bdt45',
  n: 'ndt45',
  p: 'pdt45',
};

/** Board square fill colors, matching `chess-board.scss`. */
export const LIGHT_SQUARE = '#f0d9b5';
export const DARK_SQUARE = '#b58863';

/** Rendered pixel size of one square (and each piece asset). */
export const SQUARE_SIZE = 45;

/** Path to the piece image for a FEN piece code, relative to the app root. */
export function pieceAssetPath(piece: PieceCode): string {
  return `assets/pieces/Chess_${PIECE_ASSETS[piece]}.svg`;
}
