import type { Dragon, Suit, Tile, Wind } from '@/types';

import type { Meld } from '@/lib/handAnalyzer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of distinct logical tile types (27 suit + 7 honor). */
const TILE_TYPE_COUNT = 34;

/** Maps each suit to its base type-index offset. */
const SUIT_OFFSET: Record<Suit, number> = {
  bamboo: 0,
  dots: 9,
  characters: 18,
};

/** Maps each honor value to its type-index. */
const HONOR_OFFSET: Record<Wind | Dragon, number> = {
  east: 27,
  south: 28,
  west: 29,
  north: 30,
  red: 31,
  green: 32,
  white: 33,
};

// ---------------------------------------------------------------------------
// Internal helpers — tile indexing
// ---------------------------------------------------------------------------

/** Returns a tile's logical type index (0–33), or −1 for flower tiles. */
function tileTypeIndex(tile: Tile): number {
  if (tile.kind === 'suit') return SUIT_OFFSET[tile.suit] + tile.rank - 1;
  if (tile.kind === 'honor') return HONOR_OFFSET[tile.honor];
  return -1;
}

/** Builds a 34-element count array indexed by tile type. */
function buildTypeCounts(tiles: readonly Tile[]): number[] {
  const counts = new Array<number>(TILE_TYPE_COUNT).fill(0);
  for (const tile of tiles) {
    const idx = tileTypeIndex(tile);
    if (idx >= 0) counts[idx]++;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Internal helpers — shanten estimation
// ---------------------------------------------------------------------------

/** Greedily extracts triplets (3-of-a-kind) from counts. Mutates in place. */
function extractTriplets(counts: number[]): number {
  let found = 0;
  for (let i = 0; i < TILE_TYPE_COUNT; i++) {
    while (counts[i] >= 3) {
      counts[i] -= 3;
      found++;
    }
  }
  return found;
}

/** Greedily extracts consecutive-rank sequences from counts. Mutates in place. */
function extractSequences(counts: number[]): number {
  let found = 0;
  for (let suit = 0; suit < 3; suit++) {
    const base = suit * 9;
    for (let r = 0; r <= 6; r++) {
      const i = base + r;
      while (counts[i] > 0 && counts[i + 1] > 0 && counts[i + 2] > 0) {
        counts[i]--;
        counts[i + 1]--;
        counts[i + 2]--;
        found++;
      }
    }
  }
  return found;
}

/** Counts pairs, adjacent blocks, and gap blocks from remaining tile counts. */
function countPartialBlocks(
  counts: number[],
): { pairs: number; partials: number } {
  let pairs = 0;
  let partials = 0;

  for (let i = 0; i < TILE_TYPE_COUNT; i++) {
    if (counts[i] >= 2) {
      counts[i] -= 2;
      pairs++;
    }
  }

  for (let suit = 0; suit < 3; suit++) {
    const base = suit * 9;
    for (let r = 0; r <= 7; r++) {
      const i = base + r;
      if (counts[i] > 0 && counts[i + 1] > 0) {
        counts[i]--;
        counts[i + 1]--;
        partials++;
      }
    }
    for (let r = 0; r <= 6; r++) {
      const i = base + r;
      if (counts[i] > 0 && counts[i + 2] > 0) {
        counts[i]--;
        counts[i + 2]--;
        partials++;
      }
    }
  }

  return { pairs, partials };
}

/** Computes shanten from extracted block counts. */
function shantenFromBlocks(
  neededMelds: number,
  mentsu: number,
  pairs: number,
  partials: number,
): number {
  const hasPair = pairs > 0 ? 1 : 0;
  const extraPairs = Math.max(pairs - 1, 0);
  const cap = Math.max(neededMelds - mentsu, 0);
  const effectivePartials = Math.min(partials + extraPairs, cap);

  return Math.max(
    2 * neededMelds - 2 * mentsu - effectivePartials - hasPair,
    -1,
  );
}

/** Tries both decomposition orders and returns the lower value. */
function computeShanten(
  counts: readonly number[],
  neededMelds: number,
): number {
  const c1 = [...counts];
  let m1 = extractTriplets(c1);
  m1 += extractSequences(c1);
  const pp1 = countPartialBlocks(c1);

  const c2 = [...counts];
  let m2 = extractSequences(c2);
  m2 += extractTriplets(c2);
  const pp2 = countPartialBlocks(c2);

  return Math.min(
    shantenFromBlocks(neededMelds, m1, pp1.pairs, pp1.partials),
    shantenFromBlocks(neededMelds, m2, pp2.pairs, pp2.partials),
  );
}

// ---------------------------------------------------------------------------
// Exported function
// ---------------------------------------------------------------------------

/**
 * Estimates shanten (tiles away from tenpai) for a hand.
 *
 * Uses a greedy heuristic with two decomposition orders.
 * Lower = closer to winning (0 = tenpai, −1 = already winning).
 */
export function estimateShanten(
  hand: readonly Tile[],
  declaredMelds: readonly Meld[],
): number {
  const tiles = hand.filter((t) => t.kind !== 'flower');
  const neededMelds = 5 - declaredMelds.length;

  if (neededMelds <= 0) {
    const counts = buildTypeCounts(tiles);
    for (let i = 0; i < TILE_TYPE_COUNT; i++) {
      if (counts[i] >= 2) return -1;
    }
    return 0;
  }

  return computeShanten(buildTypeCounts(tiles), neededMelds);
}
