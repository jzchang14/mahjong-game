import type { FlowerTile, HonorTile, SuitTile, Tile, Wind } from '@/types';

import type { Meld, WinResult } from '@/lib/handAnalyzer';
import { isWinningHand } from '@/lib/handAnalyzer';
import { calculateTai } from '@/lib/taiCalculator';

// ---------------------------------------------------------------------------
// Tile factory helpers (same ID scheme as tiles.ts)
// ---------------------------------------------------------------------------

function suit(s: 'bamboo' | 'dots' | 'characters', rank: number, copy: number): SuitTile {
  const suitOffset = s === 'bamboo' ? 0 : s === 'dots' ? 36 : 72;
  const id = suitOffset + (rank - 1) * 4 + copy;
  return { kind: 'suit', id, suit: s, rank: rank as SuitTile['rank'] };
}

function honor(h: HonorTile['honor'], copy: number): HonorTile {
  const honorMap: Record<string, number> = {
    east: 108, south: 112, west: 116, north: 120,
    red: 124, green: 128, white: 132,
  };
  return { kind: 'honor', id: honorMap[h] + copy, honor: h };
}

function flower(name: FlowerTile['flower'], id: number): FlowerTile {
  return { kind: 'flower', id, flower: name };
}

// ---------------------------------------------------------------------------
// Helper: build a simple winning hand and get its WinResult
// ---------------------------------------------------------------------------

/**
 * Builds a standard concealed winning hand:
 *   bam123, bam456, bam789, dots111, dots222, pair dots33
 * The winning tile is the last tile (dots 3 copy 1).
 */
function buildSimpleWin(): {
  handTiles: readonly Tile[];
  winResult: WinResult & { isWin: true };
  winningTile: Tile;
  declaredMelds: readonly Meld[];
} {
  const handTiles: Tile[] = [
    suit('bamboo', 1, 0), suit('bamboo', 2, 0), suit('bamboo', 3, 0),
    suit('bamboo', 4, 0), suit('bamboo', 5, 0), suit('bamboo', 6, 0),
    suit('bamboo', 7, 0), suit('bamboo', 8, 0), suit('bamboo', 9, 0),
    suit('dots', 1, 0), suit('dots', 1, 1), suit('dots', 1, 2),
    suit('dots', 2, 0), suit('dots', 2, 1), suit('dots', 2, 2),
    suit('dots', 3, 0), suit('dots', 3, 1),
  ];
  const winResult = isWinningHand(handTiles, []);
  if (!winResult.isWin) throw new Error('Test fixture should be a winning hand');
  return {
    handTiles,
    winResult,
    winningTile: suit('dots', 3, 1), // last tile completes the pair
    declaredMelds: [],
  };
}

/** Default context for calculateTai calls — everything zeroed / false. */
function defaultCtx() {
  return {
    isDealer: false,
    dealerStreak: 0,
    isLastTile: false,
    isRobbingKong: false,
    isAfterKong: false,
    isHeavenlyWin: false,
    isEarthlyWin: false,
    isBlessingOfMan: false,
    prevailingWind: 'east' as Wind,
    seatWind: 'south' as Wind,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calculateTai', () => {
  it('self-draw alone = 1 tai', () => {
    const { winResult, declaredMelds, handTiles, winningTile } = buildSimpleWin();
    const ctx = defaultCtx();

    // Has exposed meld so it's NOT concealed → pure self-draw = +1
    const exposedPong: Meld = {
      type: 'pong',
      tiles: [suit('dots', 1, 0), suit('dots', 1, 1), suit('dots', 1, 2)],
      concealed: false,
    };
    // Rebuild hand without the pong tiles + a winning tile
    const hand14: Tile[] = [
      suit('bamboo', 1, 0), suit('bamboo', 2, 0), suit('bamboo', 3, 0),
      suit('bamboo', 4, 0), suit('bamboo', 5, 0), suit('bamboo', 6, 0),
      suit('bamboo', 7, 0), suit('bamboo', 8, 0), suit('bamboo', 9, 0),
      suit('dots', 2, 0), suit('dots', 2, 1), suit('dots', 2, 2),
      suit('dots', 3, 0), suit('dots', 3, 1),
    ];
    const result14 = isWinningHand(hand14, [exposedPong]);
    if (!result14.isWin) throw new Error('Fixture should win');

    const breakdown = calculateTai(
      result14, [exposedPong], [], hand14, suit('dots', 3, 1),
      'self-draw',
      ctx.isDealer, ctx.dealerStreak, ctx.isLastTile,
      ctx.isRobbingKong, ctx.isAfterKong,
      ctx.isHeavenlyWin, ctx.isEarthlyWin, ctx.isBlessingOfMan,
      ctx.prevailingWind, ctx.seatWind,
    );

    const selfDrawItem = breakdown.items.find(i => i.label.includes('自摸'));
    expect(selfDrawItem).toBeDefined();
    expect(selfDrawItem!.tai).toBe(1);

    // Should NOT have concealed self-draw since we have an exposed meld
    const concealedSelfDraw = breakdown.items.find(i => i.label.includes('門清自摸'));
    expect(concealedSelfDraw).toBeUndefined();
  });

  it('concealed + self-draw = 3 tai (not 1+1=2)', () => {
    const { winResult, declaredMelds, handTiles, winningTile } = buildSimpleWin();
    const ctx = defaultCtx();

    const breakdown = calculateTai(
      winResult, declaredMelds, [], handTiles, winningTile,
      'self-draw',
      ctx.isDealer, ctx.dealerStreak, ctx.isLastTile,
      ctx.isRobbingKong, ctx.isAfterKong,
      ctx.isHeavenlyWin, ctx.isEarthlyWin, ctx.isBlessingOfMan,
      ctx.prevailingWind, ctx.seatWind,
    );

    const concealedSelfDraw = breakdown.items.find(i => i.label.includes('門清自摸'));
    expect(concealedSelfDraw).toBeDefined();
    expect(concealedSelfDraw!.tai).toBe(3);

    // Must NOT also have individual self-draw (+1) or concealed (+1)
    const plainSelfDraw = breakdown.items.find(
      i => i.label.includes('自摸') && !i.label.includes('門清'),
    );
    const plainConcealed = breakdown.items.find(
      i => i.label.includes('門清') && !i.label.includes('自摸'),
    );
    expect(plainSelfDraw).toBeUndefined();
    expect(plainConcealed).toBeUndefined();
  });

  it('full flush = 40 tai', () => {
    // All bamboo hand: bam123 bam456 bam789 bam111 bam222 pair bam33
    // Wait — that's 5 melds needing 17 tiles all bamboo
    const handTiles: Tile[] = [
      suit('bamboo', 1, 0), suit('bamboo', 2, 0), suit('bamboo', 3, 0),
      suit('bamboo', 4, 0), suit('bamboo', 5, 0), suit('bamboo', 6, 0),
      suit('bamboo', 7, 0), suit('bamboo', 8, 0), suit('bamboo', 9, 0),
      suit('bamboo', 1, 1), suit('bamboo', 1, 2), suit('bamboo', 1, 3),
      suit('bamboo', 2, 1), suit('bamboo', 2, 2), suit('bamboo', 2, 3),
      suit('bamboo', 3, 1), suit('bamboo', 3, 2),
    ];
    const wr = isWinningHand(handTiles, []);
    if (!wr.isWin) throw new Error('Fixture should win');

    const ctx = defaultCtx();
    const breakdown = calculateTai(
      wr, [], [], handTiles, suit('bamboo', 3, 2),
      'discard',
      ctx.isDealer, ctx.dealerStreak, ctx.isLastTile,
      ctx.isRobbingKong, ctx.isAfterKong,
      ctx.isHeavenlyWin, ctx.isEarthlyWin, ctx.isBlessingOfMan,
      ctx.prevailingWind, ctx.seatWind,
    );

    const fullFlush = breakdown.items.find(i => i.label.includes('清一色'));
    expect(fullFlush).toBeDefined();
    expect(fullFlush!.tai).toBe(40);
  });

  it('all pungs = 10 tai', () => {
    // 5 pongs + pair, all concealed from hand (17 tiles)
    // bam111 bam222 bam333 dots111 dots222 pair dots33
    // Wait: 5 pongs = 15 tiles + 2 pair = 17
    const handTiles: Tile[] = [
      suit('bamboo', 1, 0), suit('bamboo', 1, 1), suit('bamboo', 1, 2),
      suit('bamboo', 2, 0), suit('bamboo', 2, 1), suit('bamboo', 2, 2),
      suit('bamboo', 3, 0), suit('bamboo', 3, 1), suit('bamboo', 3, 2),
      suit('dots', 1, 0), suit('dots', 1, 1), suit('dots', 1, 2),
      suit('dots', 2, 0), suit('dots', 2, 1), suit('dots', 2, 2),
      suit('dots', 3, 0), suit('dots', 3, 1),
    ];
    const wr = isWinningHand(handTiles, []);
    if (!wr.isWin) throw new Error('Fixture should win');

    const ctx = defaultCtx();
    const breakdown = calculateTai(
      wr, [], [], handTiles, suit('dots', 3, 1),
      'discard',
      ctx.isDealer, ctx.dealerStreak, ctx.isLastTile,
      ctx.isRobbingKong, ctx.isAfterKong,
      ctx.isHeavenlyWin, ctx.isEarthlyWin, ctx.isBlessingOfMan,
      ctx.prevailingWind, ctx.seatWind,
    );

    const allPungs = breakdown.items.find(i => i.label.includes('碰碰胡'));
    expect(allPungs).toBeDefined();
    expect(allPungs!.tai).toBe(10);
  });

  it('dealer streak of 2 = 5 tai bonus (1 + 2×2)', () => {
    const { winResult, declaredMelds, handTiles, winningTile } = buildSimpleWin();

    const breakdown = calculateTai(
      winResult, declaredMelds, [], handTiles, winningTile,
      'discard',
      true,  // isDealer
      2,     // dealerStreak
      false, false, false, false, false, false,
      'east', 'east',
    );

    const dealerItem = breakdown.items.find(i => i.label.includes('連莊'));
    expect(dealerItem).toBeDefined();
    expect(dealerItem!.tai).toBe(5);
  });

  it('each flower = 1 tai', () => {
    const { winResult, declaredMelds, handTiles, winningTile } = buildSimpleWin();
    const ctx = defaultCtx();

    const threeFlowers: FlowerTile[] = [
      flower('spring', 136),
      flower('summer', 137),
      flower('autumn', 138),
    ];

    const breakdown = calculateTai(
      winResult, declaredMelds, threeFlowers, handTiles, winningTile,
      'discard',
      ctx.isDealer, ctx.dealerStreak, ctx.isLastTile,
      ctx.isRobbingKong, ctx.isAfterKong,
      ctx.isHeavenlyWin, ctx.isEarthlyWin, ctx.isBlessingOfMan,
      ctx.prevailingWind, ctx.seatWind,
    );

    const flowerItem = breakdown.items.find(i => i.label.includes('花牌'));
    expect(flowerItem).toBeDefined();
    expect(flowerItem!.tai).toBe(3);
  });

  it('all 8 flowers = 8 tai', () => {
    const { winResult, declaredMelds, handTiles, winningTile } = buildSimpleWin();
    const ctx = defaultCtx();

    const allFlowers: FlowerTile[] = [
      flower('spring', 136), flower('summer', 137),
      flower('autumn', 138), flower('winter', 139),
      flower('plum', 140), flower('orchid', 141),
      flower('chrysanthemum', 142), flower('bamboo-flower', 143),
    ];

    const breakdown = calculateTai(
      winResult, declaredMelds, allFlowers, handTiles, winningTile,
      'discard',
      ctx.isDealer, ctx.dealerStreak, ctx.isLastTile,
      ctx.isRobbingKong, ctx.isAfterKong,
      ctx.isHeavenlyWin, ctx.isEarthlyWin, ctx.isBlessingOfMan,
      ctx.prevailingWind, ctx.seatWind,
    );

    const flowerItem = breakdown.items.find(i => i.label.includes('八仙花'));
    expect(flowerItem).toBeDefined();
    expect(flowerItem!.tai).toBe(8);
  });
});
