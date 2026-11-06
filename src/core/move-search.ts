import { BoardOrientation, GamePosition, PgnParseResult } from './chess-models';
import { matchesPattern, PositionPattern } from './position-pattern';
import { NodeId, PgnEntry, PgnGridFileNode } from './workspace-models';

/** One half-move of a line: the ply it reaches and how it is written. */
export interface SearchMove {
  readonly ply: number;
  readonly san: string;
}

/** One line of one pgn-grid file, parsed, that a search looks through. */
export interface SearchLine {
  readonly fileId: NodeId;
  readonly entryId: string;
  /** `Openings/London › Line 3` — the file's path and the line's label. */
  readonly title: string;
  /** Side the line's file is viewed from. */
  readonly orientation: BoardOrientation;
  readonly positions: readonly GamePosition[];
  readonly moves: readonly SearchMove[];
  readonly entry: PgnEntry;
}

/**
 * Every line of `files` that parses and has at least one move, by file path
 * then line order.
 */
export function searchLines(
  files: readonly PgnGridFileNode[],
  pathOf: (id: NodeId) => string,
  parsePgn: (pgn: string) => PgnParseResult,
): SearchLine[] {
  return files
    .map((file) => ({ file, path: pathOf(file.id) }))
    .sort((a, b) => a.path.localeCompare(b.path))
    .flatMap(({ file, path }) =>
      file.content.entries.flatMap((entry, index) => {
        const result = parsePgn(entry.pgn);
        if (!result.valid || result.positions.length < 2) {
          return [];
        }
        return [
          {
            fileId: file.id,
            entryId: entry.id,
            title: lineTitle(path, entry, index),
            orientation: file.content.orientation ?? 'white',
            positions: result.positions,
            moves: result.positions.flatMap((p) => (p.san ? [{ ply: p.ply, san: p.san }] : [])),
            entry,
          },
        ];
      }),
    );
}

/** `Openings/London › Line 3` — a line's file path and its label, or its number when unlabeled. */
export function lineTitle(path: string, entry: PgnEntry, index: number): string {
  return `${path} › ${entry.label || `Line ${index + 1}`}`;
}

/**
 * The board a line reaches after opening with `sans`, when it does; none
 * otherwise.
 */
export function pgnMatches(line: SearchLine, sans: readonly string[]): GamePosition[] {
  // Positions run from the starting board, so move i is position i + 1.
  return sans.length > 0 && sans.every((san, i) => line.positions[i + 1]?.san === san)
    ? [line.positions[sans.length]]
    : [];
}

/**
 * The line's moves where the pattern's pieces come into place — the first of
 * each run of matching moves, so a position held for many moves shows once
 * rather than at every move.
 */
export function patternMatches(line: SearchLine, pattern: PositionPattern): GamePosition[] {
  return firstOfRuns(line, (fen) => matchesPattern(fen, pattern));
}

/**
 * The line's moves whose board is the FEN's board — piece placement only, so
 * side to move, castling and counters don't have to agree. The first of each
 * run, as for a pattern.
 */
export function fenMatches(line: SearchLine, fen: string): GamePosition[] {
  const board = boardPart(fen);
  return board ? firstOfRuns(line, (other) => boardPart(other) === board) : [];
}

/** The piece-placement field of a FEN, e.g. `rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR`. */
export function boardPart(fen: string): string {
  return fen.trim().split(/\s+/, 1)[0] ?? '';
}

/** `5. Qd2` for White, `5… O-O` for Black — how the app captions a move. */
export function moveLabel(position: GamePosition): string {
  if (position.san === null) {
    return 'Start';
  }
  return position.color === 'white'
    ? `${position.moveNumber}. ${position.san}`
    : `${position.moveNumber}… ${position.san}`;
}

function firstOfRuns(line: SearchLine, matches: (fen: string) => boolean): GamePosition[] {
  const found: GamePosition[] = [];
  let previous = false;
  for (const position of line.positions) {
    const match = position.ply > 0 && matches(position.fen);
    if (match && !previous) {
      found.push(position);
    }
    previous = match;
  }
  return found;
}
