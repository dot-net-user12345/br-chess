import { GamePosition } from './chess-models';

/**
 * A move query the user typed — a single move like `7. Na6`, or a run of them
 * pasted as a partial PGN like `1. e4 e5 2. Nf3` — parsed into what a line must
 * play to count as a match.
 */
export interface MoveQuery {
  /** Move number the run must start at; null lets it start anywhere. */
  readonly moveNumber: number | null;
  /** Side that must play the first move; null matches either. */
  readonly color: 'white' | 'black' | null;
  /** One entry per move, holding the SAN spellings that count as that move. */
  readonly moves: readonly ReadonlySet<string>[];
  /** The query echoed back in the app's notation, e.g. `1. e4 e5 2. Nf3`. */
  readonly label: string;
}

/** Where a query matched within a line: its first and last matched moves. */
export interface MoveSpan {
  readonly start: GamePosition;
  readonly end: GamePosition;
}

/** A move number with its optional separator, and any move glued onto it. */
const NUMBERED_TOKEN = /^(\d+)(\.{1,3}|…)?(.*)$/;

/** Strict SAN: castling, a piece move, or a pawn move/capture/promotion. */
const SAN_PATTERN =
  /^(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?)$/;

/**
 * Parses a search query into a {@link MoveQuery}, or null when it doesn't name
 * a move yet (empty, a bare move number, or something that isn't valid SAN).
 *
 * Several moves are matched as a consecutive run, so a partial PGN finds the
 * lines that play it. A leading move number anchors the run there; without one
 * it matches wherever it occurs. A dot is read as a plain separator, so
 * `7. Na6` finds the move whichever side played it, while `7... Na6` (or
 * `7… Na6`) narrows it to Black, matching how moves are captioned elsewhere.
 */
export function parseMoveQuery(text: string): MoveQuery | null {
  const tokens = cleanQuery(text).split(' ').filter(Boolean);
  const moves: ReadonlySet<string>[] = [];
  const sans: string[] = [];
  let moveNumber: number | null = null;
  let color: 'white' | 'black' | null = null;

  for (const token of tokens) {
    const parts = NUMBERED_TOKEN.exec(token);
    // Digits only open a move number when a separator or the token's end
    // follows them, so castling written `0-0` is still read as a move.
    const numbered = parts && (!!parts[2] || parts[3] === '') ? parts : null;
    const move = numbered ? numbered[3] : token;
    if (numbered && moves.length === 0 && moveNumber === null) {
      // Only the number before the first move anchors the run; later ones, as
      // in `1. e4 e5 2. Nf3`, are just separators between the moves.
      moveNumber = Number(numbered[1]);
      color = numbered[2] && numbered[2] !== '.' ? 'black' : null;
    }
    if (move.length === 0) {
      continue;
    }
    const candidates = sanCandidates(move);
    if (candidates.length === 0) {
      return null;
    }
    moves.push(new Set(candidates));
    sans.push(candidates[0]);
  }

  if (moves.length === 0) {
    return null;
  }
  return { moveNumber, color, moves, label: labelFor(moveNumber, color, sans) };
}

/**
 * Where a line first plays the query's moves back to back, or null when it
 * never does.
 */
export function findMatchingSpan(
  positions: readonly GamePosition[],
  query: MoveQuery,
): MoveSpan | null {
  const lastPly = positions.length - 1;
  for (const start of startPlies(query, lastPly)) {
    if (matchesAt(positions, query, start)) {
      return { start: positions[start], end: positions[start + query.moves.length - 1] };
    }
  }
  return null;
}

/** A move in the app's notation: `7. Na6` for White, `7… Na6` for Black. */
export function formatMove(position: GamePosition): string {
  if (position.san === null) {
    return 'Start';
  }
  return position.color === 'white'
    ? `${position.moveNumber}. ${position.san}`
    : `${position.moveNumber}… ${position.san}`;
}

/** A matched run as `7. Na6`, or `1. e4 – 2. Nf3` when it spans several moves. */
export function formatSpan(span: MoveSpan): string {
  if (span.start.ply === span.end.ply) {
    return formatMove(span.start);
  }
  return `${formatMove(span.start)} – ${formatMove(span.end)}`;
}

/** The plies the run could start at, in the order they should be tried. */
function startPlies(query: MoveQuery, lastPly: number): number[] {
  if (query.moveNumber === null) {
    return Array.from({ length: lastPly }, (_, i) => i + 1);
  }
  const white = query.moveNumber * 2 - 1;
  if (query.color === 'black') {
    return [white + 1];
  }
  if (query.color === 'white') {
    return [white];
  }
  return [white, white + 1];
}

/** Whether the line plays every queried move in order, starting at `start`. */
function matchesAt(positions: readonly GamePosition[], query: MoveQuery, start: number): boolean {
  return query.moves.every((sans, offset) => {
    const position = positions[start + offset];
    return !!position && position.san !== null && sans.has(bareSan(position.san));
  });
}

/**
 * Reduces pasted PGN to bare move text: headers, comments, variations, glyphs
 * and result tokens all go, leaving single-spaced moves and move numbers.
 */
function cleanQuery(text: string): string {
  let cleaned = text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ');
  // Variations nest, so strip the innermost brackets until none are left.
  for (let previous = ''; previous !== cleaned;) {
    previous = cleaned;
    cleaned = cleaned.replace(/\([^()]*\)/g, ' ');
  }
  return cleaned
    .replace(/\$\d+/g, ' ')
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The SAN spellings a typed move could mean, best guess first, dropping any
 * that aren't valid SAN. Typing is forgiving about case — `na6` finds `Na6` —
 * but an input that reads as two different moves (`bxa4` is both a pawn and a
 * bishop capture) keeps both readings.
 */
function sanCandidates(token: string): string[] {
  const bare = bareSan(token);
  if (bare === 'O-O' || bare === 'O-O-O') {
    return [bare];
  }
  const lower = bare.toLowerCase();
  const piece = bare.length > 1 ? bare[0].toUpperCase() + lower.slice(1) : bare;
  const ordered = [bare, piece, lower].map(upperPromotion);
  return [...new Set(ordered)].filter((san) => SAN_PATTERN.test(san));
}

/** Drops check/mate marks and annotations, and normalizes castling to `O-O`. */
function bareSan(san: string): string {
  const stripped = san.replace(/[+#!?]+$/, '');
  if (/^[o0](-?[o0]){1,2}$/i.test(stripped)) {
    return stripped.replace(/-/g, '').length === 3 ? 'O-O-O' : 'O-O';
  }
  return stripped;
}

/** Capitalizes the promoted piece, so `e8=q` is read as `e8=Q`. */
function upperPromotion(san: string): string {
  return san.replace(/=([a-z])$/, (_, piece: string) => `=${piece.toUpperCase()}`);
}

/** Numbers the queried moves back into PGN move text, from where they start. */
function labelFor(
  moveNumber: number | null,
  color: 'white' | 'black' | null,
  sans: readonly string[],
): string {
  if (moveNumber === null) {
    return sans.join(' ');
  }
  const parts: string[] = [];
  let ply = moveNumber * 2 - (color === 'black' ? 0 : 1);
  for (const san of sans) {
    if (ply % 2 === 1) {
      parts.push(`${Math.ceil(ply / 2)}.`);
    } else if (parts.length === 0) {
      // A run opening on Black's move needs the `7…` marker to place it.
      parts.push(`${ply / 2}…`);
    }
    parts.push(san);
    ply++;
  }
  return parts.join(' ');
}
