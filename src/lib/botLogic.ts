import type { Dragon, FlowerTile, Suit, Tile, Wind } from '@/types';

import type { ClaimOption, Meld } from '@/lib/handAnalyzer';
import { getClaimOptions } from '@/lib/handAnalyzer';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** Action a bot can take in response to a game event. */
export type BotAction =
  | { readonly type: 'discard'; readonly tile: Tile }
  | { readonly type: 'claim'; readonly option: ClaimOption }
  | { readonly type: 'pass' };

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

/**
 * Returns a tile's logical type index (0–33), or −1 for flower tiles.
 *
 *   0–8   bamboo rank 1–9
 *   9–17  dots rank 1–9
 *   18–26 characters rank 1–9
 *   27–30 east / south / west / north
 *   31–33 red / green / white
 */
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

/**
 * Counts pairs, adjacent blocks, and gap blocks from remaining tile counts.
 * Mutates `counts` in place.
 */
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
    // Adjacent pairs (e.g., 4-5)
    for (let r = 0; r <= 7; r++) {
      const i = base + r;
      if (counts[i] > 0 && counts[i + 1] > 0) {
        counts[i]--;
        counts[i + 1]--;
        partials++;
      }
    }
    // Gap pairs (e.g., 3-5)
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

/**
 * Computes shanten from extracted block counts.
 *
 * `shanten = 2 × neededMelds − 2 × completeMelds − effectivePartials − hasPair`
 *
 * Partial blocks (pairs beyond the first, adjacent tiles, gap tiles) are
 * capped at the number of remaining meld slots.
 */
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

/**
 * Estimates shanten from a count array by trying both decomposition orders
 * (triplets-first and sequences-first) and returning the lower value.
 *
 * Trying both orders mitigates the greedy algorithm's sensitivity to
 * extraction order (e.g., 1-1-1-2-3 benefits from extracting the
 * sequence first rather than the triplet).
 */
function computeShanten(
  counts: readonly number[],
  neededMelds: number,
): number {
  // Order 1: triplets before sequences
  const c1 = [...counts];
  let m1 = extractTriplets(c1);
  m1 += extractSequences(c1);
  const pp1 = countPartialBlocks(c1);

  // Order 2: sequences before triplets
  const c2 = [...counts];
  let m2 = extractSequences(c2);
  m2 += extractTriplets(c2);
  const pp2 = countPartialBlocks(c2);

  return Math.min(
    shantenFromBlocks(neededMelds, m1, pp1.pairs, pp1.partials),
    shantenFromBlocks(neededMelds, m2, pp2.pairs, pp2.partials),
  );
}

/**
 * Estimates shanten (tiles away from tenpai) for a hand.
 *
 * Uses a greedy heuristic with two decomposition orders for a reasonable
 * estimate. Lower = closer to winning (0 = tenpai, −1 = already winning).
 * Not an exact solver — suitable for Phase 1 rule-based bot decisions.
 */
function estimateShanten(
  handTiles: readonly Tile[],
  declaredMelds: readonly Meld[],
): number {
  const tiles = handTiles.filter(t => t.kind !== 'flower');
  const neededMelds = 5 - declaredMelds.length;

  if (neededMelds <= 0) {
    // All melds declared — only need a pair from remaining tiles
    const counts = buildTypeCounts(tiles);
    for (let i = 0; i < TILE_TYPE_COUNT; i++) {
      if (counts[i] >= 2) return -1;
    }
    return 0;
  }

  return computeShanten(buildTypeCounts(tiles), neededMelds);
}

// ---------------------------------------------------------------------------
// Internal helpers — discard evaluation
// ---------------------------------------------------------------------------

/**
 * Scores a tile type for how useful it is to keep in the hand.
 * Higher score = more useful = worse discard candidate.
 *
 * Isolated honors get the lowest scores (8), followed by isolated
 * terminals (10), then tiles with increasing sequence connectivity.
 */
function scoreTileForKeeping(
  tileIdx: number,
  counts: readonly number[],
): number {
  const count = counts[tileIdx];
  if (count <= 0) return -1;

  // Honor tiles: only pair/triplet potential, no sequence connections
  if (tileIdx >= 27) {
    return count * 10 - 2;
  }

  // Suit tiles: base from copy count + connection bonuses
  const rank = tileIdx % 9;
  let score = count * 10;

  // Adjacent tiles boost sequence potential
  if (rank > 0 && counts[tileIdx - 1] > 0) score += 6;
  if (rank < 8 && counts[tileIdx + 1] > 0) score += 6;

  // Gap tiles boost inside-wait potential
  if (rank > 1 && counts[tileIdx - 2] > 0) score += 3;
  if (rank < 7 && counts[tileIdx + 2] > 0) score += 3;

  // Central tiles (ranks 3–7) are more flexible for sequences
  if (rank >= 2 && rank <= 6) score += 2;

  return score;
}

// ---------------------------------------------------------------------------
// Internal helpers — claim evaluation
// ---------------------------------------------------------------------------

/**
 * Creates a new array with `count` tiles of the target type removed.
 * Preserves order of remaining tiles.
 */
function removeFromHandByType(
  hand: readonly Tile[],
  target: Tile,
  count: number,
): readonly Tile[] {
  const targetIdx = tileTypeIndex(target);
  let removed = 0;
  return hand.filter(t => {
    if (removed >= count) return true;
    if (tileTypeIndex(t) === targetIdx) {
      removed++;
      return false;
    }
    return true;
  });
}

/**
 * Checks whether the hand is flush-like (≥ 80% of non-flower tiles
 * belong to one suit plus optional honors). Used to decide whether a
 * kong claim fits the hand's strategic direction.
 */
function isFlushLike(handTiles: readonly Tile[]): boolean {
  let bamboo = 0;
  let dots = 0;
  let characters = 0;
  let honors = 0;

  for (const tile of handTiles) {
    if (tile.kind === 'suit') {
      if (tile.suit === 'bamboo') bamboo++;
      else if (tile.suit === 'dots') dots++;
      else characters++;
    } else if (tile.kind === 'honor') {
      honors++;
    }
  }

  const total = bamboo + dots + characters + honors;
  if (total === 0) return false;

  const maxSuit = Math.max(bamboo, dots, characters);
  return (maxSuit + honors) / total >= 0.8;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Evaluates all valid claims a bot can make on a discarded tile and returns
 * the best action according to Phase 1 heuristics.
 *
 * Claim priority follows the standard resolution order (hu > kong > pong >
 * chow), with each type gated by a strategic condition:
 *
 * - **Hu:** always claimed (top priority).
 * - **Kong:** claimed when the hand is close to winning (estimated shanten
 *   ≤ 2) or when the hand is building toward a flush pattern.
 * - **Pong:** claimed when it improves the hand (reduces estimated shanten
 *   compared to the current hand).
 * - **Chow:** claimed only when the hand is already near tenpai (estimated
 *   shanten ≤ 1).
 *
 * Returns `{ type: 'pass' }` when no claim meaningfully advances the hand.
 *
 * @param hand          - The bot's current concealed hand.
 * @param declaredMelds - The bot's already-declared melds.
 * @param discardedTile - The tile that was just discarded.
 * @param isLeftPlayer  - `true` when the bot sits immediately next in turn
 *                        order (the only seat allowed to chow).
 * @returns The chosen {@link BotAction}.
 */
export function chooseClaim(
  hand: readonly Tile[],
  declaredMelds: readonly Meld[],
  discardedTile: Tile,
  isLeftPlayer: boolean,
): BotAction {
  const options = getClaimOptions(
    discardedTile,
    hand,
    declaredMelds,
    isLeftPlayer,
  );

  if (options.length === 0) {
    return { type: 'pass' };
  }

  // --- Hu: always claim ---
  const hu = options.find(o => o.type === 'hu');
  if (hu) {
    return { type: 'claim', option: hu };
  }

  const shanten = estimateShanten(hand, declaredMelds);

  // --- Kong: claim if close to winning or flush-like ---
  const kong = options.find(o => o.type === 'kong');
  if (kong && (shanten <= 2 || isFlushLike(hand))) {
    return { type: 'claim', option: kong };
  }

  // --- Pong: claim if it reduces shanten ---
  const pong = options.find(o => o.type === 'pong');
  if (pong) {
    const handAfter = removeFromHandByType(hand, discardedTile, 2);
    const newMelds = [...declaredMelds, pong.melds[0]];
    const shantenAfter = estimateShanten(handAfter, newMelds);
    if (shantenAfter < shanten) {
      return { type: 'claim', option: pong };
    }
  }

  // --- Chow: claim only if near tenpai ---
  if (shanten <= 1) {
    const chow = options.find(o => o.type === 'chow');
    if (chow) {
      return { type: 'claim', option: chow };
    }
  }

  return { type: 'pass' };
}

/**
 * Picks the tile that least contributes to any winning path and returns
 * it as the bot's discard action.
 *
 * For each distinct tile type in hand, the function computes the estimated
 * shanten of the remaining hand if that type were removed. The tile whose
 * removal leaves the **lowest** remaining shanten (best remaining hand) is
 * chosen for discard.
 *
 * Ties are broken by a connection-based keepability score so that:
 * 1. Isolated honors are discarded first (no sequence potential).
 * 2. Isolated terminals are discarded next (limited sequence potential).
 * 3. Less-connected suit tiles are preferred over well-connected ones.
 *
 * @param hand          - The bot's current concealed hand (including the
 *                        just-drawn tile, one tile over normal hand size).
 * @param declaredMelds - The bot's already-declared melds.
 * @param flowers       - Flower tiles collected by the bot (reserved for
 *                        Phase 2 scoring-aware discard decisions).
 * @returns A discard {@link BotAction} with the chosen tile.
 */
export function chooseDiscard(
  hand: readonly Tile[],
  declaredMelds: readonly Meld[],
  flowers: readonly FlowerTile[],
): BotAction {
  const tiles = hand.filter(t => t.kind !== 'flower');

  if (tiles.length === 0) {
    return { type: 'discard', tile: hand[0] };
  }

  const counts = buildTypeCounts(tiles);
  const neededMelds = Math.max(5 - declaredMelds.length, 1);

  let bestTile = tiles[0];
  let bestShanten = Infinity;
  let bestKeepScore = Infinity;
  const evaluated = new Set<number>();

  for (const tile of tiles) {
    const idx = tileTypeIndex(tile);
    if (idx < 0 || evaluated.has(idx)) continue;
    evaluated.add(idx);

    // Shanten of remaining hand after discarding one copy of this type
    const adjusted = [...counts];
    adjusted[idx]--;
    const shanten = computeShanten(adjusted, neededMelds);

    // Tiebreaker: lower keepScore = less useful = prefer to discard
    const keepScore = scoreTileForKeeping(idx, counts);

    if (
      shanten < bestShanten ||
      (shanten === bestShanten && keepScore < bestKeepScore)
    ) {
      bestShanten = shanten;
      bestKeepScore = keepScore;
      bestTile = tile;
    }
  }

  return { type: 'discard', tile: bestTile };
}
