import type { FlowerTile, Result, Tile } from '@/types';

import { createTiles, shuffleTiles } from '@/lib/tiles';

const DEAD_WALL_SIZE = 16;
const DEALER_HAND_SIZE = 17;
const PLAYER_HAND_SIZE = 16;
const PLAYER_COUNT = 4;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Result of dealing the initial hands from a shuffled deck. */
export type DealResult = {
  /**
   * Four player hands, indexed by seat:
   *   0 = East (dealer, 17 tiles),
   *   1 = South (16 tiles),
   *   2 = West  (16 tiles),
   *   3 = North (16 tiles).
   */
  readonly hands: readonly (readonly Tile[])[];
  /** Remaining drawable tiles after the deal (front = next draw). */
  readonly liveWall: readonly Tile[];
  /** 16 reserved tiles for kong and flower replacements (front = next draw). */
  readonly deadWall: readonly Tile[];
};

/** Result of one round of flower replacement on a hand. */
export type FlowerReplaceResult = {
  /** Hand with flower tiles removed and replacement tiles appended. */
  readonly hand: readonly Tile[];
  /** Dead wall after consuming replacement tiles from its front. */
  readonly deadWall: readonly Tile[];
  /** Flower tiles that were removed from the hand, in the order found. */
  readonly flowers: readonly FlowerTile[];
};

/**
 * Result of drawing a single tile from the live wall.
 * Returns `{ ok: false }` when the wall is empty (exhaustive draw).
 */
export type DrawResult = Result<{
  /** The drawn tile. */
  readonly tile: Tile;
  /** The remaining live wall after the draw. */
  readonly wall: readonly Tile[];
}>;

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Creates a shuffled 144-tile deck ready for dealing.
 *
 * Generates a random integer seed via `Math.random()` and passes it to
 * {@link shuffleTiles}, so each call produces a different tile arrangement.
 *
 * For reproducible games or test replays, call {@link createTiles} and
 * {@link shuffleTiles} directly with a known seed instead.
 *
 * @returns A shuffled readonly array of all 144 Taiwan Mahjong tiles.
 */
export function createDeck(): readonly Tile[] {
  const seed = Math.floor(Math.random() * 0xffffffff);
  return shuffleTiles(createTiles(), seed);
}

/**
 * Deals initial hands from a shuffled deck.
 *
 * Tiles are dealt from the front of the deck in seat order:
 *   1. East  (player 0 / dealer) — 17 tiles
 *   2. South (player 1)          — 16 tiles
 *   3. West  (player 2)          — 16 tiles
 *   4. North (player 3)          — 16 tiles
 *
 * The last 16 tiles of the deck are reserved as the dead wall.
 * Everything between the dealt hands and the dead wall forms the live wall
 * (63 tiles in a standard 144-tile deck).
 *
 * @param deck - A shuffled array of 144 tiles (from {@link createDeck} or
 *               {@link shuffleTiles}).
 * @returns An object containing the four hands, the live wall, and the
 *          dead wall. All arrays are new — the input is never mutated.
 */
export function dealHands(deck: readonly Tile[]): DealResult {
  const hands: (readonly Tile[])[] = [];
  let offset = 0;

  // East (dealer) gets 17 tiles
  hands.push(deck.slice(offset, offset + DEALER_HAND_SIZE));
  offset += DEALER_HAND_SIZE;

  // South, West, North each get 16 tiles
  for (let i = 1; i < PLAYER_COUNT; i++) {
    hands.push(deck.slice(offset, offset + PLAYER_HAND_SIZE));
    offset += PLAYER_HAND_SIZE;
  }

  // Dead wall: last 16 tiles of the deck
  const deadWall = deck.slice(deck.length - DEAD_WALL_SIZE);

  // Live wall: everything between dealt hands and dead wall
  const liveWall = deck.slice(offset, deck.length - DEAD_WALL_SIZE);

  return { hands, liveWall, deadWall };
}

/**
 * Performs one round of flower tile replacement on a hand.
 *
 * Scans the hand for every {@link FlowerTile}, removes them, and draws
 * the same number of replacement tiles from the **front** of the dead wall.
 * Replacement tiles are appended to the end of the returned hand.
 *
 * Because a replacement tile may itself be a flower, the caller should
 * invoke `replaceFlower` again on the returned hand and dead wall until
 * `flowers` is empty.
 *
 * @param hand     - The player's current hand (may contain flower tiles).
 * @param deadWall - The current dead wall to draw replacements from.
 * @returns An object with the updated hand, updated dead wall, and the
 *          flower tiles that were removed. All arrays are new copies.
 */
export function replaceFlower(
  hand: readonly Tile[],
  deadWall: readonly Tile[],
): FlowerReplaceResult {
  const flowers: FlowerTile[] = [];
  const kept: Tile[] = [];

  for (const tile of hand) {
    if (tile.kind === 'flower') {
      flowers.push(tile);
    } else {
      kept.push(tile);
    }
  }

  if (flowers.length === 0) {
    return { hand: [...hand], deadWall: [...deadWall], flowers: [] };
  }

  const replacements = deadWall.slice(0, flowers.length);
  const remainingDeadWall = deadWall.slice(flowers.length);

  return {
    hand: [...kept, ...replacements],
    deadWall: remainingDeadWall,
    flowers,
  };
}

/**
 * Draws the next tile from the front of the live wall.
 *
 * Returns a {@link Result} error when the wall is empty, which signals
 * an exhaustive draw (no winner this round).
 *
 * @param wall - The current live wall.
 * @returns `{ ok: true, value: { tile, wall } }` on success, or
 *          `{ ok: false, error: string }` when the wall is empty.
 */
export function drawTile(wall: readonly Tile[]): DrawResult {
  if (wall.length === 0) {
    return { ok: false, error: 'Wall is empty: exhaustive draw' };
  }

  return {
    ok: true,
    value: {
      tile: wall[0],
      wall: wall.slice(1),
    },
  };
}
