/** A single saved text container: its source PGN plus the derived game data. */
export interface SavedContainer {
  readonly pgn: string;
  /** SAN of every half-move, in order. */
  readonly moves: readonly string[];
  /** FEN of every position, starting position first. */
  readonly positions: readonly string[];
}

/** The full page serialized for saving. */
export interface SavedPage {
  readonly title: string;
  readonly createdAt: string;
  readonly containers: readonly SavedContainer[];
}
