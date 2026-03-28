import type {
  Dragon,
  FlowerName,
  FlowerTile,
  HonorTile,
  Rank,
  Suit,
  SuitTile,
  Tile,
  Wind,
} from '@/types';

// Tile ID allocation (144 tiles total):
//   0–107  suit tiles   (3 suits × 9 ranks × 4 copies = 108)
//   108–135 honor tiles  (4 winds + 3 dragons × 4 copies = 28)
//   136–143 flower tiles (8 unique flowers, 1 copy each)
// Note: CLAUDE.md key-design-decisions lists flowers as 144–151; the actual
// tile counts (108+28+8=144 total) place them at 136–143. Tiles.ts is the
// authoritative source.

const SUITS: readonly Suit[] = ['bamboo', 'dots', 'characters'];
const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const WINDS: readonly Wind[] = ['east', 'south', 'west', 'north'];
const DRAGONS: readonly Dragon[] = ['red', 'green', 'white'];
const FLOWER_NAMES: readonly FlowerName[] = [
  'spring',
  'summer',
  'autumn',
  'winter',
  'plum',
  'orchid',
  'chrysanthemum',
  'bamboo-flower',
];

function createSuitTiles(): readonly SuitTile[] {
  const tiles: SuitTile[] = [];
  let id = 0;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push({ kind: 'suit', id: id++, suit, rank });
      }
    }
  }
  return tiles; // ids 0–107
}

function createHonorTiles(): readonly HonorTile[] {
  const tiles: HonorTile[] = [];
  let id = 108;
  const honors: readonly (Wind | Dragon)[] = [...WINDS, ...DRAGONS];
  for (const honor of honors) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push({ kind: 'honor', id: id++, honor });
    }
  }
  return tiles; // ids 108–135
}

function createFlowerTiles(): readonly FlowerTile[] {
  const tiles: FlowerTile[] = [];
  let id = 136;
  for (const flower of FLOWER_NAMES) {
    tiles.push({ kind: 'flower', id: id++, flower });
  }
  return tiles; // ids 136–143
}

/** Returns all 144 tiles in a standard Taiwan Mahjong set (unsorted). */
export function createTiles(): readonly Tile[] {
  return [
    ...createSuitTiles(),
    ...createHonorTiles(),
    ...createFlowerTiles(),
  ];
}

/** Mulberry32 — fast, seedable 32-bit PRNG returning values in [0, 1). */
function mulberry32(seed: number): () => number {
  let s = seed;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a new shuffled copy of `tiles` using a seeded Fisher-Yates shuffle.
 * The same `seed` always produces the same order, enabling reproducible games
 * and test replays.
 */
export function shuffleTiles(tiles: readonly Tile[], seed: number): readonly Tile[] {
  const arr = [...tiles];
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
