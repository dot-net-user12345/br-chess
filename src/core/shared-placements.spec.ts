import { ChessService } from './chess-service';
import { AnalysisLine } from './move-analysis';
import { sharedPlacements } from './shared-placements';

const chess = new ChessService();

function line(label: string, pgn: string): AnalysisLine {
  const result = chess.parsePgn(pgn);
  expect(result.valid).toBe(true);
  return { label, positions: result.positions };
}

describe('shared placements', () => {
  // Three lines reach move 3 by White: two play Nf3, one plays Bc4. The Nf3
  // lines differ from each other on d5/d6, so only part of their board is shared.
  const nf3a = line('Nf3 a', '1. e4 e5 2. d4 d5 3. Nf3 Nc6');
  const nf3b = line('Nf3 b', '1. e4 e5 2. d4 d6 3. Nf3 Nc6');
  const bc4 = line('Bc4', '1. e4 e5 2. d4 d5 3. Bc4 Nc6');

  it("reports the pieces every matching line shares, and those no other line has", () => {
    const result = sharedPlacements(
      { moveNumber: 3, san: 'Nf3', color: 'white' },
      [nf3a, nf3b, bc4],
    );

    expect(result.label).toBe('3. Nf3');
    expect(result.matching).toEqual(['Nf3 a', 'Nf3 b']);
    expect(result.others).toBe(1);
    expect(result.othersAtMove).toBe(1);
    expect(result.fen).toBe(nf3a.positions[5].fen);

    const common = result.common.map((placement) => placement.square);
    // Shared by both Nf3 lines: the knight it put on f3, and the pawns they agree on.
    expect(common).toContain('f3');
    expect(common).toContain('e4');
    // They disagree here — d5 in one line, d6 in the other.
    expect(common).not.toContain('d5');
    expect(common).not.toContain('d6');

    // Of the 31 they share, two are theirs alone: the knight Nf3 put on f3, and
    // the bishop still sitting on f1 — the Bc4 line moved that bishop away.
    expect(result.common).toHaveLength(31);
    expect(result.unique.map((placement) => placement.text)).toEqual([
      'White bishop on f1',
      'White knight on f3',
    ]);
    expect(result.summary).toBe(
      '2 of 3 lines play 3. Nf3. Of the 31 pieces they all share, 2 are unique to them — no other line has them there.',
    );
  });

  it('reads the move as forgivingly as the move filter, and names it as the lines spell it', () => {
    const nf6 = line('Nf6', '1. e4 e5 2. d4 d5 3. Nf3 Nf6');
    const result = sharedPlacements({ moveNumber: 3, san: 'nc6', color: 'black' }, [
      nf3a,
      bc4,
      nf6,
    ]);
    // Typed in lower case, reported the way the lines write it.
    expect(result.label).toBe('3… Nc6');
    expect(result.matching).toEqual(['Nf3 a', 'Bc4']);
    // The two lines' third moves differ, so neither f3 nor c4 is shared; what
    // only they have is the knight on c6 and the one still waiting on g8.
    expect(result.unique.map((placement) => placement.text)).toEqual([
      'Black knight on c6',
      'Black knight on g8',
    ]);
  });

  it('counts a line that never reaches the move as unable to match it', () => {
    const short = line('Short', '1. e4 e5');
    const result = sharedPlacements({ moveNumber: 3, san: 'Nf3', color: 'white' }, [nf3a, short]);
    expect(result.matching).toEqual(['Nf3 a']);
    expect(result.others).toBe(1);
    expect(result.othersAtMove).toBe(0);
    // Nothing reaches that point to contradict it, so all it shares is its own.
    expect(result.unique).toEqual(result.common);
    expect(result.summary).toContain('no other line reaches that move');
  });

  it('reports no match when no line plays the move', () => {
    const result = sharedPlacements({ moveNumber: 3, san: 'Qh5', color: 'white' }, [nf3a, bc4]);
    expect(result.matching).toEqual([]);
    expect(result.common).toEqual([]);
    expect(result.unique).toEqual([]);
    expect(result.fen).toBe('');
    expect(result.summary).toBe('No line plays 3. Qh5.');
  });

  it('lists the result White first, strongest piece first', () => {
    // One line alone, so its whole board is both shared and unique.
    const only = sharedPlacements({ moveNumber: 1, san: 'e4', color: 'white' }, [nf3a]);
    const [first, second] = only.unique;
    expect(first.text).toBe('White king on e1');
    expect(second.text).toBe('White queen on d1');
    expect(only.unique.at(-1)?.piece).toBe('p');
  });
});
