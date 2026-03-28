import type { Dragon, Suit, SuitTile, Tile, Wind } from '@/types';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** A declared or concealed meld (set of tiles forming a group). */
export type Meld = {
  readonly type: 'chow' | 'pong' | 'kong';
  readonly tiles: readonly Tile[];
  readonly concealed: boolean;
};

/**
 * Result of checking whether a hand is a complete winning hand.
 *
 * When `isWin` is `true`:
 * - **Standard form:** `melds` contains all 5 melds (declared + hand-decomposed)
 *   and `pair` contains the 2-tile pair.
 * - **8½ pairs form:** `melds` contains a single concealed pong (the triplet)
 *   and `pair` contains one of the seven pairs. The scoring module recognises
 *   this pattern by the single-meld, all-concealed structure on 17 tiles.
 */
export type WinResult =
  | {
      readonly isWin: true;
      readonly melds: readonly Meld[];
      readonly pair: readonly Tile[];
    }
  | { readonly isWin: false };

/**
 * A claim a player can make on a discarded tile.
 *
 * - For `'hu'`: `melds` is the full winning hand; `pair` is the pair.
 * - For `'pong'`/`'kong'`/`'chow'`: `melds` contains the single new meld.
 */
export type ClaimOption = {
  readonly type: 'hu' | 'pong' | 'kong' | 'chow';
  readonly melds: readonly Meld[];
  readonly pair?: readonly Tile[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of distinct logical tile types (27 suit + 7 honor). */
const TILE_TYPE_COUNT = 34;

/** Standard winning hand requires exactly 5 melds. */
const REQUIRED_MELDS = 5;

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
// Internal types
// ---------------------------------------------------------------------------

/** Describes one meld found during count-based decomposition. */
type MeldSpec = {
  readonly type: 'chow' | 'pong';
  readonly typeIndices: readonly number[];
};

// ---------------------------------------------------------------------------
// Internal helpers
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

/** Groups tiles into 34 buckets by logical type index. */
function buildTypeGroups(tiles: readonly Tile[]): Tile[][] {
  const groups: Tile[][] = Array.from({ length: TILE_TYPE_COUNT }, () => []);
  for (const tile of tiles) {
    const idx = tileTypeIndex(tile);
    if (idx >= 0) groups[idx].push(tile);
  }
  return groups;
}

/**
 * Recursively decomposes tile counts into exactly `needed` chow/pong melds.
 *
 * Always processes the lowest non-zero type index first. Because every lower
 * index is zero, any meld involving the first index must *start* there —
 * this eliminates redundant search branches.
 *
 * Mutates `counts` in place for backtracking efficiency; values are always
 * restored after a failed branch.
 */
function tryDecompose(
  counts: number[],
  needed: number,
  found: readonly MeldSpec[],
): readonly MeldSpec[] | null {
  if (needed === 0) {
    for (let i = 0; i < TILE_TYPE_COUNT; i++) {
      if (counts[i] !== 0) return null;
    }
    return found;
  }

  // Find first type with tiles remaining
  let first = -1;
  for (let i = 0; i < TILE_TYPE_COUNT; i++) {
    if (counts[i] > 0) {
      first = i;
      break;
    }
  }
  if (first === -1) return null;

  // Try pong (3 of a kind)
  if (counts[first] >= 3) {
    counts[first] -= 3;
    const result = tryDecompose(counts, needed - 1, [
      ...found,
      { type: 'pong', typeIndices: [first, first, first] },
    ]);
    if (result) return result;
    counts[first] += 3;
  }

  // Try chow (3 consecutive ranks, same suit — indices 0–26 only)
  if (first < 27 && first % 9 <= 6) {
    const second = first + 1;
    const third = first + 2;
    if (counts[second] > 0 && counts[third] > 0) {
      counts[first]--;
      counts[second]--;
      counts[third]--;
      const result = tryDecompose(counts, needed - 1, [
        ...found,
        { type: 'chow', typeIndices: [first, second, third] },
      ]);
      if (result) return result;
      counts[first]++;
      counts[second]++;
      counts[third]++;
    }
  }

  return null;
}

/**
 * Assigns concrete Tile objects from `groups` to a decomposition result.
 * Uses sequential offsets into each type group to pick tiles.
 */
function assignTiles(
  groups: readonly (readonly Tile[])[],
  pairTypeIdx: number,
  meldSpecs: readonly MeldSpec[],
): { melds: Meld[]; pair: Tile[] } {
  const offsets = new Array<number>(TILE_TYPE_COUNT).fill(0);

  const take = (typeIdx: number): Tile => {
    const tile = groups[typeIdx][offsets[typeIdx]];
    offsets[typeIdx]++;
    return tile;
  };

  const pair = [take(pairTypeIdx), take(pairTypeIdx)];

  const melds: Meld[] = meldSpecs.map(spec => ({
    type: spec.type,
    tiles: spec.typeIndices.map(idx => take(idx)),
    concealed: true,
  }));

  return { melds, pair };
}

/**
 * Attempts standard decomposition: `neededMelds` chow/pong melds + 1 pair.
 *
 * Iterates over every tile type as a candidate pair (ascending index),
 * and within each attempt tries pong before chow. Returns the first valid
 * decomposition, or null.
 */
function tryStandardDecomposition(
  tiles: readonly Tile[],
  neededMelds: number,
): { melds: Meld[]; pair: Tile[] } | null {
  const groups = buildTypeGroups(tiles);
  const baseCounts = groups.map(g => g.length);

  for (let p = 0; p < TILE_TYPE_COUNT; p++) {
    if (baseCounts[p] < 2) continue;

    const counts = [...baseCounts];
    counts[p] -= 2;

    const meldSpecs = tryDecompose(counts, neededMelds, []);
    if (meldSpecs) {
      return assignTiles(groups, p, meldSpecs);
    }
  }

  return null;
}

/**
 * Checks the alternate winning form: 7 pairs + 1 triplet (8½ pairs).
 *
 * Valid when exactly 7 tile types have count 2 and 1 type has count 3,
 * totalling 17 concealed tiles. Any other count distribution fails.
 */
function trySevenPairsAndTriplet(
  tiles: readonly Tile[],
): { melds: Meld[]; pair: Tile[] } | null {
  const groups = buildTypeGroups(tiles);
  const counts = groups.map(g => g.length);

  let pairCount = 0;
  let tripletIdx = -1;
  let firstPairIdx = -1;

  for (let i = 0; i < TILE_TYPE_COUNT; i++) {
    const c = counts[i];
    if (c === 0) continue;
    if (c === 2) {
      pairCount++;
      if (firstPairIdx === -1) firstPairIdx = i;
    } else if (c === 3) {
      if (tripletIdx !== -1) return null; // two triplets
      tripletIdx = i;
    } else {
      return null; // count 1 or ≥ 4
    }
  }

  if (pairCount !== 7 || tripletIdx === -1 || firstPairIdx === -1) return null;

  return {
    melds: [
      {
        type: 'pong',
        tiles: [
          groups[tripletIdx][0],
          groups[tripletIdx][1],
          groups[tripletIdx][2],
        ],
        concealed: true,
      },
    ],
    pair: [groups[firstPairIdx][0], groups[firstPairIdx][1]],
  };
}

/**
 * Finds tiles in `hand` whose logical type matches `target`.
 * Returns an empty array for flower tiles (type index −1).
 */
function findMatchingTiles(hand: readonly Tile[], target: Tile): Tile[] {
  const targetIdx = tileTypeIndex(target);
  if (targetIdx < 0) return [];
  return hand.filter(t => tileTypeIndex(t) === targetIdx);
}

/** Finds suit tiles in `hand` with the given suit and rank. */
function findSuitTilesInHand(
  hand: readonly Tile[],
  suit: Suit,
  rank: number,
): SuitTile[] {
  return hand.filter(
    (t): t is SuitTile =>
      t.kind === 'suit' && t.suit === suit && t.rank === rank,
  );
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Counts occurrences of each tile id in the given array.
 *
 * Returns a `Map` keyed by {@link Tile.id} (the unique physical tile
 * identifier, 0–143). Useful as a general-purpose counting helper for
 * meld detection and visibility tracking.
 *
 * @param tiles - The tiles to count.
 * @returns A `Map<tileId, count>`.
 */
export function getTileCount(tiles: readonly Tile[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const tile of tiles) {
    counts.set(tile.id, (counts.get(tile.id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Checks whether the given hand tiles plus declared melds form a complete
 * Taiwan Mahjong winning hand.
 *
 * Two winning forms are recognised:
 *
 * 1. **Standard (5 melds + 1 pair):** `handTiles` must decompose into
 *    `(5 − declaredMelds.length)` chow / pong melds plus exactly one pair.
 *    All possible pair choices are tried (ascending type index); within each,
 *    pong is attempted before chow. The first valid decomposition is returned.
 *
 * 2. **8½ pairs (7 pairs + 1 triplet):** Requires `declaredMelds` to be empty
 *    and `handTiles` to contain exactly 17 non-flower tiles with 7 types at
 *    count 2 and 1 type at count 3.
 *
 * Flower tiles in `handTiles` are silently ignored — they should have been
 * set aside via flower replacement before calling this function.
 *
 * @param handTiles     - Concealed tiles in the player's hand, including the
 *                        winning tile if already drawn / claimed.
 * @param declaredMelds - Melds already declared (exposed pong/chow/kong, or
 *                        concealed kongs).
 * @returns `{ isWin: true, melds, pair }` with the first valid decomposition,
 *          or `{ isWin: false }` if no winning form is found.
 */
export function isWinningHand(
  handTiles: readonly Tile[],
  declaredMelds: readonly Meld[],
): WinResult {
  const tiles = handTiles.filter(t => t.kind !== 'flower');

  // --- Standard form: (5 − declared) melds + 1 pair ---
  const neededMelds = REQUIRED_MELDS - declaredMelds.length;
  const expectedTileCount = neededMelds * 3 + 2;

  if (neededMelds >= 0 && tiles.length === expectedTileCount) {
    const result = tryStandardDecomposition(tiles, neededMelds);
    if (result) {
      return {
        isWin: true,
        melds: [...declaredMelds, ...result.melds],
        pair: result.pair,
      };
    }
  }

  // --- Alternate form: 7 pairs + 1 triplet (all concealed, 17 tiles) ---
  if (declaredMelds.length === 0 && tiles.length === 17) {
    const result = trySevenPairsAndTriplet(tiles);
    if (result) {
      return {
        isWin: true,
        melds: result.melds,
        pair: result.pair,
      };
    }
  }

  return { isWin: false };
}

/**
 * Returns every valid claim a player can make on a discarded tile.
 *
 * Options are returned in priority order: hu → kong → pong → chow.
 * Every valid option is included — priority resolution between competing
 * players is the caller's responsibility.
 *
 * - **Hu:** the discard is added to the hand and {@link isWinningHand}
 *   is called. Only returned when the resulting hand wins.
 * - **Kong:** requires 3 tiles in hand matching the discard's type.
 *   The resulting meld is exposed (`concealed: false`).
 * - **Pong:** requires 2 tiles in hand matching the discard's type.
 * - **Chow:** requires `isLeftPlayer === true` (next in turn order) and
 *   two hand tiles forming a consecutive-rank sequence with the discard.
 *   Only suit tiles can form chows. Each valid sequence shape (discard as
 *   low / middle / high tile) is a separate option.
 *
 * @param discardedTile - The tile that was just discarded.
 * @param hand          - The claimer's current concealed hand.
 * @param declaredMelds - The claimer's already-declared melds.
 * @param isLeftPlayer  - `true` when the claimer sits immediately next in
 *                        turn order (the only seat allowed to chow).
 * @returns An array of valid {@link ClaimOption}s, possibly empty.
 */
export function getClaimOptions(
  discardedTile: Tile,
  hand: readonly Tile[],
  declaredMelds: readonly Meld[],
  isLeftPlayer: boolean,
): readonly ClaimOption[] {
  const options: ClaimOption[] = [];
  const matching = findMatchingTiles(hand, discardedTile);

  // --- Hu (win) ---
  const winResult = isWinningHand([...hand, discardedTile], declaredMelds);
  if (winResult.isWin) {
    options.push({
      type: 'hu',
      melds: winResult.melds,
      pair: winResult.pair,
    });
  }

  // --- Kong (3 in hand + discard = exposed 4-of-a-kind) ---
  if (matching.length >= 3) {
    options.push({
      type: 'kong',
      melds: [
        {
          type: 'kong',
          tiles: [matching[0], matching[1], matching[2], discardedTile],
          concealed: false,
        },
      ],
    });
  }

  // --- Pong (2 in hand + discard = exposed 3-of-a-kind) ---
  if (matching.length >= 2) {
    options.push({
      type: 'pong',
      melds: [
        {
          type: 'pong',
          tiles: [matching[0], matching[1], discardedTile],
          concealed: false,
        },
      ],
    });
  }

  // --- Chow (consecutive sequence, suit tiles only, left player only) ---
  if (isLeftPlayer && discardedTile.kind === 'suit') {
    const { suit, rank } = discardedTile;

    // Discard is the HIGH end: need (rank−2, rank−1, rank)
    if (rank >= 3) {
      const low = findSuitTilesInHand(hand, suit, rank - 2);
      const mid = findSuitTilesInHand(hand, suit, rank - 1);
      if (low.length > 0 && mid.length > 0) {
        options.push({
          type: 'chow',
          melds: [
            {
              type: 'chow',
              tiles: [low[0], mid[0], discardedTile],
              concealed: false,
            },
          ],
        });
      }
    }

    // Discard is the MIDDLE: need (rank−1, rank, rank+1)
    if (rank >= 2 && rank <= 8) {
      const low = findSuitTilesInHand(hand, suit, rank - 1);
      const high = findSuitTilesInHand(hand, suit, rank + 1);
      if (low.length > 0 && high.length > 0) {
        options.push({
          type: 'chow',
          melds: [
            {
              type: 'chow',
              tiles: [low[0], discardedTile, high[0]],
              concealed: false,
            },
          ],
        });
      }
    }

    // Discard is the LOW end: need (rank, rank+1, rank+2)
    if (rank <= 7) {
      const mid = findSuitTilesInHand(hand, suit, rank + 1);
      const high = findSuitTilesInHand(hand, suit, rank + 2);
      if (mid.length > 0 && high.length > 0) {
        options.push({
          type: 'chow',
          melds: [
            {
              type: 'chow',
              tiles: [discardedTile, mid[0], high[0]],
              concealed: false,
            },
          ],
        });
      }
    }
  }

  return options;
}
