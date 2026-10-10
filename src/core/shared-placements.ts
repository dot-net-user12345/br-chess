import { comparePlacements, pieceName, placements } from './board-position';
import { PieceCode } from './chess-models';
import { formatMove, isSameMove } from './line-search';
import { AnalysisLine } from './move-analysis';

/** The move to study: one half-move, named the way the move filter names it. */
export interface PlacementQuery {
  /** Full-move number, 1-based. */
  readonly moveNumber: number;
  /** The move as typed, e.g. `Nf3`; read as forgivingly as the move filter. */
  readonly san: string;
  /** Which side plays it. */
  readonly color: 'white' | 'black';
}

/** One piece standing on one square, with the wording the result list uses. */
export interface SharedPlacement {
  readonly square: string;
  readonly piece: PieceCode;
  /** `White knight on f3`. */
  readonly text: string;
}

/** What the lines playing one move share, and what only they have. */
export interface SharedPlacementResult {
  /** The move as the app writes it, e.g. `3. Nf3` or `3… Nf6`. */
  readonly label: string;
  /** Labels of the lines that play the move, in file order. */
  readonly matching: readonly string[];
  /** Lines that don't play it, and how many of those reach that point at all. */
  readonly others: number;
  readonly othersAtMove: number;
  /** Every piece/square that all the matching lines have in place at that move. */
  readonly common: readonly SharedPlacement[];
  /** Those of {@link common} that no other line has at the same point in the game. */
  readonly unique: readonly SharedPlacement[];
  /** The first matching line's board at that move, for a preview; '' when none match. */
  readonly fen: string;
  /** A sentence introducing the result, for the panel heading. */
  readonly summary: string;
}

/**
 * What the lines that play one particular move have in common, and which of
 * those things belong to them alone.
 *
 * Every line that plays `query.san` as the given side's move `query.moveNumber`
 * is taken, and the pieces standing on the same squares in all of their boards
 * at that move are collected. Those are then narrowed to the ones no other line
 * has — compared at the same point in its own game, so a piece counts as shared
 * only when another line has it there after the same number of half-moves.
 *
 * Lines too short to reach that point can't conflict: they have no board there.
 */
export function sharedPlacements(
  query: PlacementQuery,
  lines: readonly AnalysisLine[],
): SharedPlacementResult {
  // Positions run from the starting board, so White's move n is ply 2n-1.
  const ply = query.moveNumber * 2 - (query.color === 'black' ? 0 : 1);
  const matchingLines: AnalysisLine[] = [];
  const otherLines: AnalysisLine[] = [];
  for (const line of lines) {
    const position = line.positions[ply];
    const plays =
      !!position &&
      position.san !== null &&
      position.color === query.color &&
      isSameMove(query.san, position.san);
    (plays ? matchingLines : otherLines).push(line);
  }

  // Named after the move as the lines actually spell it, so a forgiving `nc6`
  // comes back as `3… Nc6`; only an unmatched query is echoed as typed.
  const label =
    matchingLines.length > 0 ? formatMove(matchingLines[0].positions[ply]) : formatQuery(query);
  const othersAtMove = otherLines.filter((line) => !!line.positions[ply]).length;
  const empty = {
    label,
    matching: [],
    others: otherLines.length,
    othersAtMove,
    common: [],
    unique: [],
    fen: '',
  };
  if (matchingLines.length === 0 || query.moveNumber < 1) {
    return { ...empty, summary: `No line plays ${label}.` };
  }

  const boards = matchingLines.map((line) => placements(line.positions[ply].fen));
  // Step 1: the pieces every matching line has on the same square at that move.
  const common: SharedPlacement[] = [];
  for (const [square, piece] of boards[0]) {
    if (boards.every((board) => board.get(square) === piece)) {
      common.push({ square, piece, text: describe(piece, square) });
    }
  }
  common.sort(comparePlacements);

  // Step 2: of those, the ones no other line has on that square at that point.
  const otherBoards = otherLines
    .map((line) => line.positions[ply])
    .filter((position) => !!position)
    .map((position) => placements(position.fen));
  const unique = common.filter((placement) =>
    otherBoards.every((board) => board.get(placement.square) !== placement.piece),
  );

  const matching = matchingLines.map((line) => line.label);
  return {
    label,
    matching,
    others: otherLines.length,
    othersAtMove,
    common,
    unique,
    fen: matchingLines[0].positions[ply].fen,
    summary: summarize(
      label,
      matching.length,
      lines.length,
      common.length,
      unique.length,
      othersAtMove,
    ),
  };
}

/** `3. Nf3` for White, `3… Nf6` for Black — the app's own spelling of a move. */
function formatQuery(query: PlacementQuery): string {
  const separator = query.color === 'black' ? '…' : '.';
  return `${query.moveNumber}${separator} ${query.san.trim()}`;
}

/** `White knight on f3`. */
function describe(piece: PieceCode, square: string): string {
  const name = pieceName(piece);
  return `${name[0].toUpperCase()}${name.slice(1)} on ${square}`;
}

/** One sentence placing the result: how many lines, how much they share, how much is theirs alone. */
function summarize(
  label: string,
  matching: number,
  total: number,
  common: number,
  unique: number,
  othersAtMove: number,
): string {
  const pieces = (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'}`;
  const lines = `${matching} of ${total} ${total === 1 ? 'line' : 'lines'} play ${label}`;
  if (othersAtMove === 0) {
    return `${lines}, and no other line reaches that move, so all ${pieces(common)} they share are theirs alone.`;
  }
  if (unique === 0) {
    return `${lines}, sharing ${pieces(common)} on the same squares, but another line matches every one of them at that point.`;
  }
  return `${lines}. Of the ${pieces(common)} they all share, ${unique} ${unique === 1 ? 'is' : 'are'} unique to them — no other line has ${unique === 1 ? 'it' : 'them'} there.`;
}
