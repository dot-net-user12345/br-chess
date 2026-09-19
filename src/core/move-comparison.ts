import { GamePosition } from './chess-models';

/** How many diverging moves to flag per PGN (the first and second). */
export const DIVERGENT_MOVE_LIMIT = 2;

/**
 * Index of the entry a PGN is compared against: the one before it in the list,
 * or — when it is first — the one after it. Returns -1 when there is nothing to
 * compare against (fewer than two entries).
 */
export function comparisonIndex(index: number, total: number): number {
  if (total < 2) {
    return -1;
  }
  return index === 0 ? 1 : index - 1;
}

/**
 * The first ply (1-based half-move) at which two lines play a different move,
 * comparing by SAN at each ply. A move one line reaches but the other does not
 * (because it is shorter) counts as a deviation. Returns null when the lines are
 * identical. Symmetric in its arguments, unlike {@link divergentPlies}.
 */
export function firstDeviationPly(
  a: readonly GamePosition[],
  b: readonly GamePosition[],
): number | null {
  const maxPly = Math.max(a.length, b.length) - 1;
  for (let ply = 1; ply <= maxPly; ply++) {
    if ((a[ply]?.san ?? null) !== (b[ply]?.san ?? null)) {
      return ply;
    }
  }
  return null;
}

/**
 * Plies (1-based half-move numbers) of the first `limit` moves in `line` whose
 * SAN differs from `reference` at the same ply — i.e. where the two lines play a
 * different move for the same numbered move. A move `reference` doesn't reach
 * (it is shorter) counts as divergent.
 */
export function divergentPlies(
  line: readonly GamePosition[],
  reference: readonly GamePosition[],
  limit: number = DIVERGENT_MOVE_LIMIT,
): Set<number> {
  const plies = new Set<number>();
  for (const position of line) {
    if (position.ply === 0) {
      continue;
    }
    const referenceSan = reference[position.ply]?.san ?? null;
    if (position.san !== referenceSan) {
      plies.add(position.ply);
      if (plies.size >= limit) {
        break;
      }
    }
  }
  return plies;
}

/**
 * The pair of plies to display for a line's deviation from `reference`: the
 * ply where it first plays a different move, and the ply straight after it in
 * the same line — so the two boards are always consecutive, and therefore
 * always opposite colors. Returns an empty set when the lines are identical, or
 * the deviating ply alone when the line ends there.
 */
export function deviationPlies(
  line: readonly GamePosition[],
  reference: readonly GamePosition[],
): Set<number> {
  const ply = firstDeviationPly(line, reference);
  if (ply === null || !line[ply]) {
    return new Set<number>();
  }
  return line[ply + 1] ? new Set([ply, ply + 1]) : new Set([ply]);
}
