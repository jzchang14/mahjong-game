import type { Tile } from '@/types';

import { createDeck, dealHands, drawTile, replaceFlower } from '@/lib/deck';

describe('createDeck', () => {
  it('returns exactly 144 tiles', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(144);
  });

  it('has no duplicate tile ids', () => {
    const deck = createDeck();
    const ids = deck.map(t => t.id);
    expect(new Set(ids).size).toBe(144);
  });

  it('contains 108 suit, 28 honor, and 8 flower tiles', () => {
    const deck = createDeck();
    const suits = deck.filter(t => t.kind === 'suit');
    const honors = deck.filter(t => t.kind === 'honor');
    const flowers = deck.filter(t => t.kind === 'flower');
    expect(suits).toHaveLength(108);
    expect(honors).toHaveLength(28);
    expect(flowers).toHaveLength(8);
  });
});

describe('dealHands', () => {
  const deck = createDeck();
  const result = dealHands(deck);

  it('gives East (dealer) 17 tiles', () => {
    expect(result.hands[0]).toHaveLength(17);
  });

  it('gives South, West, North 16 tiles each', () => {
    expect(result.hands[1]).toHaveLength(16);
    expect(result.hands[2]).toHaveLength(16);
    expect(result.hands[3]).toHaveLength(16);
  });

  it('reserves 16 tiles for the dead wall', () => {
    expect(result.deadWall).toHaveLength(16);
  });

  it('leaves 63 tiles in the live wall', () => {
    expect(result.liveWall).toHaveLength(63);
  });

  it('accounts for all 144 tiles', () => {
    const allIds = [
      ...result.hands.flat(),
      ...result.liveWall,
      ...result.deadWall,
    ].map(t => t.id);
    expect(new Set(allIds).size).toBe(144);
  });
});

describe('replaceFlower', () => {
  it('removes all flower tiles and draws replacements from dead wall', () => {
    // Hand with 2 flowers and 1 non-flower
    const hand: readonly Tile[] = [
      { kind: 'flower', id: 136, flower: 'spring' },
      { kind: 'suit', id: 0, suit: 'bamboo', rank: 1 },
      { kind: 'flower', id: 137, flower: 'summer' },
    ];
    const deadWall: readonly Tile[] = [
      { kind: 'suit', id: 4, suit: 'bamboo', rank: 2 },
      { kind: 'suit', id: 8, suit: 'bamboo', rank: 3 },
      { kind: 'suit', id: 12, suit: 'bamboo', rank: 4 },
    ];

    const result = replaceFlower(hand, deadWall);

    // 2 flowers extracted
    expect(result.flowers).toHaveLength(2);
    expect(result.flowers.map(f => f.id)).toEqual([136, 137]);

    // Hand keeps the non-flower + 2 replacements from dead wall
    expect(result.hand).toHaveLength(3);
    expect(result.hand.every(t => t.kind !== 'flower')).toBe(true);

    // Dead wall consumed 2 tiles
    expect(result.deadWall).toHaveLength(1);
  });

  it('returns hand unchanged when no flowers present', () => {
    const hand: readonly Tile[] = [
      { kind: 'suit', id: 0, suit: 'bamboo', rank: 1 },
      { kind: 'suit', id: 4, suit: 'bamboo', rank: 2 },
    ];
    const deadWall: readonly Tile[] = [
      { kind: 'suit', id: 8, suit: 'bamboo', rank: 3 },
    ];

    const result = replaceFlower(hand, deadWall);
    expect(result.flowers).toHaveLength(0);
    expect(result.hand).toHaveLength(2);
    expect(result.deadWall).toHaveLength(1);
  });
});

describe('drawTile', () => {
  it('returns the first tile and remaining wall', () => {
    const wall: readonly Tile[] = [
      { kind: 'suit', id: 0, suit: 'bamboo', rank: 1 },
      { kind: 'suit', id: 4, suit: 'bamboo', rank: 2 },
    ];

    const result = drawTile(wall);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tile.id).toBe(0);
      expect(result.value.wall).toHaveLength(1);
    }
  });

  it('returns error on empty wall', () => {
    const result = drawTile([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/empty/i);
    }
  });
});
