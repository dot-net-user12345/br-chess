import { GamePosition, PieceCode } from './chess-models';

/** A line as the analyzer sees it: its name and every position from the start. */
export interface AnalysisLine {
  readonly label: string;
  /** Every position from the start through the final move, so a ply is its own index. */
  readonly positions: readonly GamePosition[];
}

/** One move picked out for analysis, as an index into the line list and a ply. */
export interface SelectedMove {
  readonly lineIndex: number;
  readonly ply: number;
}

/** Which sentence of the summary a finding belongs to, and how it is worded. */
export type FindingCategory =
  'mover-piece' | 'mover-color' | 'action' | 'destination' | 'position' | 'timing' | 'opening';

/** One fact that holds for every selected move, and how much it earns its place. */
export interface Finding {
  readonly category: FindingCategory;
  /** The kind of fact, without its value: `to-square`, `capture`, `on-g7`. */
  readonly kind: string;
  /**
   * Identifies the fact with its value, as `kind:value` — two moves share a
   * fact only when they share this, not merely the kind.
   */
  readonly key: string;
  /** The finding's clause, worded to slot into its own sentence. */
  readonly text: string;
  /** 0 when the fact is true of the whole file anyway, 1 when it is unique to the selection. */
  readonly score: number;
}

/** What the selected moves have in common, as prose and as the facts behind it. */
export interface Analysis {
  /** The summary paragraph, '' when there is nothing worth saying. */
  readonly summary: string;
  /** The facts the summary is built from, strongest first. */
  readonly findings: readonly Finding[];
}

/**
 * How unusual a fact must be before it is worth a clause: a fact true of 70% of
 * the file's moves anyway says nothing about the selection.
 */
const MIN_SALIENCE = 0.3;

/** How much each kind of fact counts when picking which ones to report. */
const WEIGHT: Readonly<Record<FindingCategory, number>> = {
  'mover-piece': 1,
  'mover-color': 1,
  action: 1,
  destination: 0.9,
  position: 0.7,
  timing: 1,
  opening: 1,
};

/** Most clauses to spend on the moves themselves, and on the resulting positions. */
const MOVE_CLAUSE_LIMIT = 3;
const POSITION_CLAUSE_LIMIT = 2;
/** Most plies of a shared opening to spell out before trailing off. */
const OPENING_PLY_LIMIT = 8;

const FILES = 'abcdefgh';
const RANK_NAMES = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

/** Where each piece starts, so a piece that has not moved can be passed over. */
const INITIAL_SQUARES: ReadonlyMap<string, PieceCode> = new Map([
  ...[...'RNBQKBNR'].map((piece, file): [string, PieceCode] => [
    `${FILES[file]}1`,
    piece as PieceCode,
  ]),
  ...[...FILES].map((file): [string, PieceCode] => [`${file}2`, 'P']),
  ...[...FILES].map((file): [string, PieceCode] => [`${file}7`, 'p']),
  ...[...'rnbqkbnr'].map((piece, file): [string, PieceCode] => [
    `${FILES[file]}8`,
    piece as PieceCode,
  ]),
]);

const PIECE_NAMES: Readonly<Record<string, string>> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
  P: 'pawn',
};

/**
 * What a set of selected moves have in common, as a sentence or two.
 *
 * Every fact is scored against `lines` as a baseline, so only what is unusual
 * for this file is reported: that all the moves leave a white king on e1 is
 * true of most moves in most files, and is left unsaid.
 */
export function analyzeMoves(
  selected: readonly SelectedMove[],
  lines: readonly AnalysisLine[],
): Analysis {
  const moves = selected
    .map((move) => lines[move.lineIndex]?.positions[move.ply])
    .filter((position): position is GamePosition => !!position && position.ply > 0);
  if (moves.length < 2) {
    return { summary: '', findings: [] };
  }

  const rate = baselineRates(lines);
  const findings = [
    ...commonFeatures(moves, rate),
    ...timingFindings(moves, lines),
    ...originFindings(selected, lines),
  ]
    // A fact the rest of the file shares says nothing about this selection.
    .filter((finding) => finding.score >= MIN_SALIENCE)
    .sort((a, b) => b.score * WEIGHT[b.category] - a.score * WEIGHT[a.category]);

  return { summary: buildSummary(moves.length, findings), findings };
}

/** The share of the file's moves each feature key holds, used to score findings. */
function baselineRates(lines: readonly AnalysisLine[]): (key: string) => number {
  const counts = new Map<string, number>();
  let total = 0;
  for (const line of lines) {
    for (const position of line.positions) {
      if (position.ply === 0 || position.san === null) {
        continue;
      }
      total++;
      for (const key of new Set(features(position).map((feature) => feature.key))) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return (key) => (total === 0 ? 1 : (counts.get(key) ?? 0) / total);
}

/** The features every selected move shares, scored against the rest of the file. */
function commonFeatures(moves: readonly GamePosition[], rate: (key: string) => number): Finding[] {
  const [first, ...rest] = moves;
  let common = features(first);
  for (const move of rest) {
    const keys = new Set(features(move).map((feature) => feature.key));
    common = common.filter((feature) => keys.has(feature.key));
  }

  const kinds = new Set(common.map((feature) => feature.kind));
  const landed = common
    .find((feature) => feature.kind === 'to-square')
    ?.key.slice('to-square:'.length);
  return common
    .filter((feature) => !isRedundant(feature, kinds, landed))
    .map((feature) => ({ ...feature, score: 1 - rate(feature.key) }));
}

/**
 * Whether a fact says nothing beyond another one in the same set: landing on d5
 * already says the move lands on the d-file, mate is check, castling fixes its
 * own squares, and the piece standing on the square just moved to is the move.
 */
function isRedundant(
  feature: Feature,
  kinds: ReadonlySet<string>,
  landed: string | undefined,
): boolean {
  if (feature.kind === 'check' && kinds.has('mate')) {
    return true;
  }
  if (
    feature.category === 'destination' &&
    (kinds.has('castle-short') || kinds.has('castle-long'))
  ) {
    return true;
  }
  if (landed && feature.kind === `on-${landed}`) {
    return true;
  }
  for (const side of ['to', 'from']) {
    if (
      feature.kind.startsWith(`${side}-`) &&
      feature.kind !== `${side}-square` &&
      kinds.has(`${side}-square`)
    ) {
      return true;
    }
    if (feature.kind === `${side}-wing` && kinds.has(`${side}-file`)) {
      return true;
    }
  }
  return false;
}

/** A feature before it has been scored against the file. */
type Feature = Pick<Finding, 'category' | 'kind' | 'key' | 'text'>;

/** A fact with no value of its own, such as an action the move performs. */
function flag(category: FindingCategory, kind: string, text: string): Feature {
  return { category, kind, key: kind, text };
}

/**
 * Everything the analyzer can notice about one move: who moved what, what the
 * move does, where it starts and lands, and what stands on the resulting board.
 *
 * Every key carries its value, so two moves share a fact only when they share
 * the value too — and so a fact's baseline rate measures that value alone.
 */
function features(position: GamePosition): Feature[] {
  const san = position.san ?? '';
  const piece = pieceOf(san);
  const found: Feature[] = [
    { category: 'mover-piece', kind: 'piece', key: `piece:${piece}`, text: piece },
    {
      category: 'mover-color',
      kind: 'color',
      key: `color:${position.color}`,
      text: titleCase(position.color),
    },
  ];

  if (san.includes('x')) {
    found.push(flag('action', 'capture', 'capture'));
  }
  if (san.endsWith('#')) {
    found.push(flag('action', 'mate', 'deliver mate'));
    found.push(flag('action', 'check', 'give check'));
  } else if (san.endsWith('+')) {
    found.push(flag('action', 'check', 'give check'));
  }
  if (san.startsWith('O-O-O')) {
    found.push(flag('action', 'castle-long', 'castle long'));
  } else if (san.startsWith('O-O')) {
    found.push(flag('action', 'castle-short', 'castle short'));
  }
  if (san.includes('=')) {
    found.push(flag('action', 'promote', 'promote a pawn'));
  }

  found.push(...squareFeatures('to', position.to, 'land on'));
  found.push(...squareFeatures('from', position.from, 'come from'));

  for (const [square, occupant] of placements(position.fen)) {
    // A piece still on its own starting square is the board's default, not a
    // pattern: it is the pieces that have gone somewhere that say something.
    if (INITIAL_SQUARES.get(square) === occupant) {
      continue;
    }
    found.push({
      category: 'position',
      kind: `on-${square}`,
      key: `on-${square}:${occupant}`,
      text: `${article(pieceName(occupant))} on ${square}`,
    });
  }
  return found;
}

/** A square's own name, its file, its rank, and the wing it sits on. */
function squareFeatures(side: 'to' | 'from', square: string | null, verb: string): Feature[] {
  if (!square || !FILES.includes(square[0])) {
    return [];
  }
  const file = square[0];
  const rank = Number(square[1]);
  const center = file === 'd' || file === 'e';
  const wing = center ? 'the center' : file <= 'c' ? 'the queenside' : 'the kingside';
  // `land in the center`, but `land on the kingside` — and `come from` either.
  const wingVerb = side === 'to' && center ? 'land in' : verb;
  return [
    {
      category: 'destination',
      kind: `${side}-square`,
      key: `${side}-square:${square}`,
      text: `${verb} ${square}`,
    },
    {
      category: 'destination',
      kind: `${side}-file`,
      key: `${side}-file:${file}`,
      text: `${verb} the ${file}-file`,
    },
    {
      category: 'destination',
      kind: `${side}-rank`,
      key: `${side}-rank:${rank}`,
      text: `${verb} the ${RANK_NAMES[rank - 1]} rank`,
    },
    {
      category: 'destination',
      kind: `${side}-wing`,
      key: `${side}-wing:${wing}`,
      text: `${wingVerb} ${wing}`,
    },
  ];
}

/**
 * When the moves are bunched into a narrow stretch of the game — one move
 * number, or a short run covering well under half the file's length.
 */
function timingFindings(moves: readonly GamePosition[], lines: readonly AnalysisLine[]): Finding[] {
  const numbers = moves.map((move) => move.moveNumber);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const longest = Math.max(1, ...lines.map((line) => line.positions.at(-1)?.moveNumber ?? 0));
  const span = max - min + 1;
  if (min !== max && span * 2 > longest) {
    return [];
  }
  return [
    {
      category: 'timing',
      kind: 'timing',
      key: 'timing',
      text: min === max ? `on move ${min}` : `between moves ${min} and ${max}`,
      score: 1 - span / longest,
    },
  ];
}

/**
 * Where the moves come from: the one line they all belong to, or the opening
 * that the several lines they span all share.
 */
function originFindings(
  selected: readonly SelectedMove[],
  lines: readonly AnalysisLine[],
): Finding[] {
  const indexes = [...new Set(selected.map((move) => move.lineIndex))].filter(
    (index) => !!lines[index],
  );
  if (indexes.length === 0) {
    return [];
  }
  if (indexes.length === 1) {
    // Only worth saying when there were other lines it could have been.
    return lines.length < 2
      ? []
      : [
          {
            category: 'opening',
            kind: 'single-line',
            key: 'single-line',
            text: `All of them come from ${lines[indexes[0]].label}.`,
            score: 1 - 1 / lines.length,
          },
        ];
  }

  const sans = indexes.map((index) =>
    lines[index].positions.flatMap((position) => (position.san ? [position.san] : [])),
  );
  const [first, ...rest] = sans;
  let shared = 0;
  while (shared < first.length && rest.every((line) => line[shared] === first[shared])) {
    shared++;
  }
  if (shared < 2) {
    return [];
  }
  const shown = first.slice(0, Math.min(shared, OPENING_PLY_LIMIT));
  // The ellipsis ends the sentence itself, so it does not also take a period.
  const text = shared > shown.length ? `${openingText(shown)}…` : `${openingText(shown)}.`;
  return [
    {
      category: 'opening',
      kind: 'shared-opening',
      key: 'shared-opening',
      text: `The lines all open ${text}`,
      score: Math.min(1, shared / OPENING_PLY_LIMIT),
    },
  ];
}

/** `1.e4 c5 2.Nf3` — compact enough to sit inside a sentence. */
function openingText(sans: readonly string[]): string {
  return sans.map((san, index) => (index % 2 === 0 ? `${index / 2 + 1}.${san}` : san)).join(' ');
}

/** Turns the findings into a short paragraph, spending each sentence on one kind of fact. */
function buildSummary(count: number, findings: readonly Finding[]): string {
  const pick = (category: FindingCategory) => findings.find((f) => f.category === category);
  const all = (category: FindingCategory) => findings.filter((f) => f.category === category);

  const lead = count === 2 ? 'Both selected moves' : `All ${count} selected moves`;
  const piece = pick('mover-piece');
  const color = pick('mover-color');
  const timing = pick('timing');

  const sentences: string[] = [];
  const mover = piece && color ? `${color.text} ${piece.text}` : piece ? piece.text : '';
  if (mover) {
    const when = timing ? `, played ${timing.text}` : '';
    sentences.push(`${lead} are ${mover} moves${when}.`);
  } else if (color || timing) {
    const by = color ? ` by ${color.text}` : '';
    const when = timing ? ` ${timing.text}` : '';
    sentences.push(`${lead} are played${by}${when}.`);
  }

  const clauses = [...all('action'), ...all('destination')]
    .slice(0, MOVE_CLAUSE_LIMIT)
    .map((finding) => finding.text);
  if (clauses.length > 0) {
    const them = count === 2 ? 'They both' : 'They all';
    const subject = sentences.length > 0 ? them : lead;
    sentences.push(`${subject} ${joinClauses(clauses)}.`);
  }

  const pieces = all('position')
    .slice(0, POSITION_CLAUSE_LIMIT)
    .map((finding) => finding.text);
  if (pieces.length > 0) {
    sentences.push(`In every resulting position there is ${joinClauses(pieces)}.`);
  }

  const origin = pick('opening');
  if (origin) {
    sentences.push(origin.text);
  }

  if (sentences.length === 0) {
    return `These ${count} moves have no striking pattern in common.`;
  }
  return sentences.join(' ');
}

/** `a, b and c` — a clause list as it reads in a sentence. */
function joinClauses(parts: readonly string[]): string {
  if (parts.length <= 1) {
    return parts[0] ?? '';
  }
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** Which piece a SAN move belongs to; anything unprefixed is a pawn. */
function pieceOf(san: string): string {
  if (san.startsWith('O-O')) {
    return 'king';
  }
  return PIECE_NAMES[san[0]] ?? 'pawn';
}

/** `black pawn` — a FEN letter spelled out with its color. */
function pieceName(piece: PieceCode): string {
  const white = piece === piece.toUpperCase();
  return `${white ? 'white' : 'black'} ${PIECE_NAMES[piece.toUpperCase()]}`;
}

function article(noun: string): string {
  return `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`;
}

function titleCase(text: string | null): string {
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

/** Every occupied square of a FEN's board, as `e4` paired with its piece letter. */
function placements(fen: string): ReadonlyMap<string, PieceCode> {
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
