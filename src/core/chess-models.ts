/** A single square's occupant, using FEN piece letters (upper = white, lower = black). */
export type PieceCode = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

/** An 8x8 board, rank 8 (top) first, file a (left) first. `null` is an empty square. */
export type BoardSquares = ReadonlyArray<ReadonlyArray<PieceCode | null>>;

/** One position in a game's progression: the board after a given half-move. */
export interface GamePosition {
  /** 0 for the starting position, then 1..n for each half-move. */
  readonly ply: number;
  /** Full-move number this position belongs to (1-based). 0 for the start. */
  readonly moveNumber: number;
  /** Side that just moved to reach this position, or null for the start. */
  readonly color: 'white' | 'black' | null;
  /** SAN of the move that produced this position, or null for the start. */
  readonly san: string | null;
  /** Origin square of the move (e.g. `e2`), or null for the start. */
  readonly from: string | null;
  /** Destination square of the move (e.g. `e4`), or null for the start. */
  readonly to: string | null;
  /** Full FEN of the position. */
  readonly fen: string;
}

/** Result of parsing a PGN string. */
export interface PgnParseResult {
  readonly valid: boolean;
  /** Human-readable reason the PGN is invalid, when `valid` is false. */
  readonly error: string | null;
  /** Every position from the start through the final move. Empty when invalid. */
  readonly positions: readonly GamePosition[];
}
