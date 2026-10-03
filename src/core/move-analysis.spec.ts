import { describe, expect, it } from 'vitest';
import { ChessService } from './chess-service';
import { AnalysisLine, analyzeMoves, SelectedMove } from './move-analysis';

const chess = new ChessService();
const line = (label: string, pgn: string): AnalysisLine => ({
  label,
  positions: chess.parsePgn(pgn).positions,
});

/** The ply of a line's first move with this SAN, which keeps the tests readable. */
const plyOf = (source: AnalysisLine, san: string): number => {
  const position = source.positions.find((candidate) => candidate.san === san);
  if (!position) {
    throw new Error(`${source.label} never plays ${san}`);
  }
  return position.ply;
};

const at = (lineIndex: number, ply: number): SelectedMove => ({ lineIndex, ply });

/** A small file of Sicilian lines, varied enough for the baseline to mean something. */
const sicilian: AnalysisLine[] = [
  line('Najdorf', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be7'),
  line('Dragon', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O'),
  line('Classical', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 Nc6 6. Bg5 e6 7. Qd2 Be7'),
  line('Rossolimo', '1. e4 c5 2. Nf3 Nc6 3. Bb5 g6 4. O-O Bg7 5. c3 Nf6 6. Re1 O-O 7. d4 cxd4'),
];

describe('analyzeMoves', () => {
  it('says nothing when fewer than two moves are selected', () => {
    expect(analyzeMoves([], sicilian).summary).toBe('');
    expect(analyzeMoves([at(0, 1)], sicilian).summary).toBe('');
  });

  it('ignores selections that point at no move', () => {
    expect(analyzeMoves([at(9, 1), at(0, 99)], sicilian).summary).toBe('');
  });

  it('names the piece and color when every move is the same kind', () => {
    // 5. Nc3 in the three lines that play it.
    const selected = [
      at(0, plyOf(sicilian[0], 'Nc3')),
      at(1, plyOf(sicilian[1], 'Nc3')),
      at(2, plyOf(sicilian[2], 'Nc3')),
    ];
    const { summary } = analyzeMoves(selected, sicilian);
    expect(summary).toContain('All 3 selected moves are White knight moves');
    expect(summary).toContain('land on c3');
  });

  it('reports a shared destination square across different pieces', () => {
    // Both recaptures on d4, one by a knight and one by a pawn.
    const selected = [at(0, plyOf(sicilian[0], 'Nxd4')), at(3, plyOf(sicilian[3], 'cxd4'))];
    const { summary } = analyzeMoves(selected, sicilian);
    expect(summary).toContain('Both selected moves');
    expect(summary).toContain('capture');
    expect(summary).toContain('land on d4');
  });

  it('calls out castling when every move castles', () => {
    const selected = [at(1, plyOf(sicilian[1], 'O-O')), at(3, plyOf(sicilian[3], 'O-O'))];
    const { summary } = analyzeMoves(selected, sicilian);
    expect(summary).toContain('castle short');
  });

  it('reports a narrow stretch of the game', () => {
    const selected = [
      at(0, plyOf(sicilian[0], 'Be3')),
      at(1, plyOf(sicilian[1], 'Be3')),
      at(2, plyOf(sicilian[2], 'Bg5')),
    ];
    const { summary } = analyzeMoves(selected, sicilian);
    expect(summary).toContain('on move 6');
  });

  it('omits timing when the moves are spread across the game', () => {
    const selected = [at(0, 1), at(0, plyOf(sicilian[0], 'Be7'))];
    const { summary } = analyzeMoves(selected, sicilian);
    expect(summary).not.toContain('between moves');
  });

  it('names the shared opening when the moves span several lines', () => {
    const selected = [
      at(0, plyOf(sicilian[0], 'Nc3')),
      at(1, plyOf(sicilian[1], 'Nc3')),
      at(2, plyOf(sicilian[2], 'Nc3')),
    ];
    const { summary } = analyzeMoves(selected, sicilian);
    expect(summary).toContain('The lines all open 1.e4 c5 2.Nf3 d6');
  });

  it('names the line instead when every move comes from one line', () => {
    const selected = [at(0, plyOf(sicilian[0], 'e5')), at(0, plyOf(sicilian[0], 'a6'))];
    const { summary } = analyzeMoves(selected, sicilian);
    expect(summary).toContain('All of them come from Najdorf.');
  });

  it('suppresses facts that are true of the whole file anyway', () => {
    const selected = [at(0, 1), at(1, 1), at(2, 1), at(3, 1)];
    const { summary, findings } = analyzeMoves(selected, sicilian);
    // Every line opens 1. e4, so the untouched back rank says nothing about it.
    expect(summary).not.toContain('white king on e1');
    expect(findings.every((finding) => finding.key !== 'on-e1:K')).toBe(true);
  });

  it('reports an unusual piece placement the selection shares', () => {
    // Both lines reach a board with Black's bishop on g7, which only they do.
    const selected = [at(1, plyOf(sicilian[1], 'Bg7')), at(3, plyOf(sicilian[3], 'Bg7'))];
    const { summary } = analyzeMoves(selected, sicilian);
    expect(summary).toContain('g7');
  });

  it('prefers the exact square over the file and wing it implies', () => {
    const selected = [at(1, plyOf(sicilian[1], 'Bg7')), at(3, plyOf(sicilian[3], 'Bg7'))];
    const { findings } = analyzeMoves(selected, sicilian);
    const keys = findings.map((finding) => finding.kind);
    expect(keys).toContain('to-square');
    expect(keys).not.toContain('to-file');
    expect(keys).not.toContain('to-wing');
  });

  it('passes over pieces still standing on their starting squares', () => {
    // Both recaptures leave White's back rank untouched, which says nothing.
    const selected = [at(0, plyOf(sicilian[0], 'Nxd4')), at(3, plyOf(sicilian[3], 'cxd4'))];
    const { summary, findings } = analyzeMoves(selected, sicilian);
    expect(summary).not.toContain('on b1');
    expect(findings.every((finding) => !finding.kind.startsWith('on-b1'))).toBe(true);
  });

  it('does not restate the square just moved to as a position fact', () => {
    const selected = [at(1, plyOf(sicilian[1], 'Bg7')), at(3, plyOf(sicilian[3], 'Bg7'))];
    const { summary, findings } = analyzeMoves(selected, sicilian);
    expect(summary).toContain('land on g7');
    expect(findings.every((finding) => finding.kind !== 'on-g7')).toBe(true);
  });

  it('leaves out the squares castling fixes anyway', () => {
    const selected = [at(1, plyOf(sicilian[1], 'O-O')), at(3, plyOf(sicilian[3], 'O-O'))];
    const { summary, findings } = analyzeMoves(selected, sicilian);
    expect(summary).toContain('castle short');
    expect(findings.every((finding) => finding.category !== 'destination')).toBe(true);
  });

  it('lands in the center but on a wing', () => {
    // Different squares on one wing, so the wing is the most the moves share.
    const center = [at(0, plyOf(sicilian[0], 'd6')), at(0, plyOf(sicilian[0], 'e5'))];
    expect(analyzeMoves(center, sicilian).summary).toContain('land in the center');
    const wing = [at(1, plyOf(sicilian[1], 'Bg7')), at(1, plyOf(sicilian[1], 'f3'))];
    expect(analyzeMoves(wing, sicilian).summary).toContain('land on the kingside');
  });

  it('ends a truncated opening on the ellipsis rather than a period', () => {
    const selected = [
      at(0, plyOf(sicilian[0], 'Be3')),
      at(1, plyOf(sicilian[1], 'Be3')),
      at(2, plyOf(sicilian[2], 'Bg5')),
    ];
    const { summary } = analyzeMoves(selected, sicilian);
    expect(summary).toContain('Nf6…');
    expect(summary).not.toContain('….');
  });

  it('falls back to a plain statement when nothing stands out', () => {
    const only: AnalysisLine[] = [line('Only', '1. e4 e5')];
    const { summary } = analyzeMoves([at(0, 1), at(0, 2)], only);
    expect(summary).toBe('These 2 moves have no striking pattern in common.');
  });

  it('ranks the strongest findings first', () => {
    const selected = [at(0, plyOf(sicilian[0], 'Nxd4')), at(3, plyOf(sicilian[3], 'cxd4'))];
    const { findings } = analyzeMoves(selected, sicilian);
    const scores = findings.map((finding) => finding.score);
    expect(scores.length).toBeGreaterThan(0);
    expect(findings[0].score).toBeGreaterThanOrEqual(0.3);
  });
});
