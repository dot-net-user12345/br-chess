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
