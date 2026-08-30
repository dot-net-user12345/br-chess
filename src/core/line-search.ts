import { GamePosition } from './chess-models';

/**
 * A move query the user typed, e.g. `7. Na6`, `7… Na6` or bare `Bf4`, parsed
 * into what a position must satisfy to count as a match.
 */
export interface PlyQuery {
  /** Move number the move must be played at; null matches any move number. */
  readonly moveNumber: number | null;
  /** Side that must have played it; null matches either. */
  readonly color: 'white' | 'black' | null;
  /** SAN spellings that count as a match, decorations stripped. */
  readonly sans: ReadonlySet<string>;
  /** The query echoed back in the app's move notation, e.g. `7… Na6`. */
  readonly label: string;
}

/**
 * `[move number][separator] move`, where the number is optional and the
 * separator may be a dot, an ellipsis, or nothing at all.
 */
const QUERY_PATTERN = /^(?:(\d{1,3})\s*(\.{1,3}|…)?\s*)?(\S+)$/;

/** Strict SAN: castling, a piece move, or a pawn move/capture/promotion. */
const SAN_PATTERN =
  /^(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?)$/;

/**
 * Parses a search query into a {@link PlyQuery}, or null when it doesn't name a
 * move yet (empty, a bare move number, or something that isn't valid SAN).
 *
 * A dot is read as a plain separator, so `7. Na6` finds the move whichever side
 * played it; `7... Na6` (or `7… Na6`) narrows it to Black, matching how moves
 * are captioned elsewhere in the app.
 */
export function parsePlyQuery(text: string): PlyQuery | null {
  const parts = QUERY_PATTERN.exec(text.trim());
  if (!parts) {
    return null;
  }
  const [, number, separator, token] = parts;
  const sans = sanCandidates(token);
  if (sans.length === 0) {
    return null;
  }
  const moveNumber = number ? Number(number) : null;
  const color = separator && separator !== '.' ? 'black' : null;
  return { moveNumber, color, sans: new Set(sans), label: labelFor(moveNumber, color, sans[0]) };
}

/** Whether a parsed position is the move the query asks for. */
export function positionMatches(position: GamePosition, query: PlyQuery): boolean {
  if (position.san === null) {
    return false;
  }
  if (query.moveNumber !== null && position.moveNumber !== query.moveNumber) {
    return false;
  }
  if (query.color !== null && position.color !== query.color) {
    return false;
  }
  return query.sans.has(bareSan(position.san));
}

/** The first position in a line that satisfies the query, or null when none does. */
export function findMatchingPosition(
  positions: readonly GamePosition[],
  query: PlyQuery,
): GamePosition | null {
  return positions.find((position) => positionMatches(position, query)) ?? null;
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

function labelFor(moveNumber: number | null, color: 'black' | null, san: string): string {
  if (moveNumber === null) {
    return san;
  }
  return color === 'black' ? `${moveNumber}… ${san}` : `${moveNumber}. ${san}`;
}
