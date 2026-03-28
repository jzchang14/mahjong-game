import type { SuitTile, HonorTile, Tile } from '@/types';

import type { Meld } from '@/lib/handAnalyzer';
import { getClaimOptions, isWinningHand } from '@/lib/handAnalyzer';

// ---------------------------------------------------------------------------
// Tile factory helpers
// ---------------------------------------------------------------------------
// Tile ID layout from tiles.ts:
//   Bamboo 1 copy0=0, copy1=1, copy2=2, copy3=3
//   Bamboo 2 copy0=4, ...
//   Suit base: bamboo=0, dots=36*4=108? No:
//     bamboo ranks 1-9 × 4 copies = ids 0..35
//     dots   ranks 1-9 × 4 copies = ids 36..71
//     chars  ranks 1-9 × 4 copies = ids 72..107
//   Honor base: 108
//     east copies = 108..111, south=112..115, west=116..119, north=120..123
//     red=124..127, green=128..131, white=132..135

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

// ---------------------------------------------------------------------------
// isWinningHand
// ---------------------------------------------------------------------------

describe('isWinningHand', () => {
  it('detects a standard 5-meld + pair winning hand', () => {
    // 17 tiles in hand, 0 declared melds → need 5 melds + 1 pair
    // Melds: bam123, bam456, bam789, dots111, dots222 + pair dots33
    const hand: Tile[] = [
      suit('bamboo', 1, 0), suit('bamboo', 2, 0), suit('bamboo', 3, 0),
      suit('bamboo', 4, 0), suit('bamboo', 5, 0), suit('bamboo', 6, 0),
      suit('bamboo', 7, 0), suit('bamboo', 8, 0), suit('bamboo', 9, 0),
      suit('dots', 1, 0), suit('dots', 1, 1), suit('dots', 1, 2),
      suit('dots', 2, 0), suit('dots', 2, 1), suit('dots', 2, 2),
      suit('dots', 3, 0), suit('dots', 3, 1),
    ];
    expect(hand).toHaveLength(17);

    const result = isWinningHand(hand, []);
    expect(result.isWin).toBe(true);
    if (result.isWin) {
      // 5 melds total (decomposed from hand, no declared)
      expect(result.melds).toHaveLength(5);
      expect(result.pair).toHaveLength(2);
    }
  });

  it('returns isWin: false for an incomplete hand', () => {
    // Random 17 tiles that don't decompose
    const hand: Tile[] = [
      suit('bamboo', 1, 0), suit('bamboo', 3, 0), suit('bamboo', 5, 0),
      suit('bamboo', 7, 0), suit('bamboo', 9, 0), suit('dots', 1, 0),
      suit('dots', 3, 0), suit('dots', 5, 0), suit('dots', 7, 0),
      suit('dots', 9, 0), suit('characters', 1, 0), suit('characters', 3, 0),
      suit('characters', 5, 0), suit('characters', 7, 0), suit('characters', 9, 0),
      honor('east', 0), honor('south', 0),
    ];
    expect(hand).toHaveLength(17);

    const result = isWinningHand(hand, []);
    expect(result.isWin).toBe(false);
  });

  it('detects 8½ pairs (7 pairs + 1 triplet)', () => {
    // Non-consecutive tiles so standard decomposition is impossible.
    // 7 pairs + 1 triplet = 17 tiles
    const hand: Tile[] = [
      suit('bamboo', 1, 0), suit('bamboo', 1, 1),
      suit('bamboo', 3, 0), suit('bamboo', 3, 1),
      suit('bamboo', 5, 0), suit('bamboo', 5, 1),
      suit('bamboo', 7, 0), suit('bamboo', 7, 1),
      suit('bamboo', 9, 0), suit('bamboo', 9, 1),
      suit('dots', 1, 0), suit('dots', 1, 1),
      suit('dots', 3, 0), suit('dots', 3, 1),
      // triplet (count 3)
      suit('dots', 5, 0), suit('dots', 5, 1), suit('dots', 5, 2),
    ];
    expect(hand).toHaveLength(17);

    const result = isWinningHand(hand, []);
    expect(result.isWin).toBe(true);
    if (result.isWin) {
      // Structure: 1 pong meld (the triplet), and a pair
      expect(result.melds).toHaveLength(1);
      expect(result.melds[0].type).toBe('pong');
      expect(result.melds[0].concealed).toBe(true);
      expect(result.pair).toHaveLength(2);
    }
  });

  it('works with declared melds reducing needed hand melds', () => {
    // 1 declared pong → need 4 melds from hand + pair = 14 tiles
    const declared: Meld[] = [
      { type: 'pong', tiles: [honor('east', 0), honor('east', 1), honor('east', 2)], concealed: false },
    ];
    // 4 melds + pair = 14 tiles: bam123, bam456, bam789, dots111, pair dots22
    const hand: Tile[] = [
      suit('bamboo', 1, 0), suit('bamboo', 2, 0), suit('bamboo', 3, 0),
      suit('bamboo', 4, 0), suit('bamboo', 5, 0), suit('bamboo', 6, 0),
      suit('bamboo', 7, 0), suit('bamboo', 8, 0), suit('bamboo', 9, 0),
      suit('dots', 1, 0), suit('dots', 1, 1), suit('dots', 1, 2),
      suit('dots', 2, 0), suit('dots', 2, 1),
    ];
    expect(hand).toHaveLength(14);

    const result = isWinningHand(hand, declared);
    expect(result.isWin).toBe(true);
    if (result.isWin) {
      // 5 total melds: 1 declared + 4 from hand
      expect(result.melds).toHaveLength(5);
    }
  });
});

// ---------------------------------------------------------------------------
// getClaimOptions
// ---------------------------------------------------------------------------

describe('getClaimOptions', () => {
  it('returns hu when the discarded tile completes a winning hand', () => {
    // Hand has 4 melds + pair needs one tile to complete 5th meld
    // 4 chows done + need 1 more meld. Hand: 13 tiles (4*3+1 pair-tile-short? No.)
    // With 0 declared: need 5 melds + pair from 16 hand tiles + 1 discard = 17
    // Hand: 16 tiles that need 1 more to win
    // bam123, bam456, bam789, dots123, dots4-5 (waiting on dots6) + pair dots99
    const hand: Tile[] = [
      suit('bamboo', 1, 0), suit('bamboo', 2, 0), suit('bamboo', 3, 0),
      suit('bamboo', 4, 0), suit('bamboo', 5, 0), suit('bamboo', 6, 0),
      suit('bamboo', 7, 0), suit('bamboo', 8, 0), suit('bamboo', 9, 0),
      suit('dots', 1, 0), suit('dots', 2, 0), suit('dots', 3, 0),
      suit('dots', 4, 0), suit('dots', 5, 0),
      suit('dots', 9, 0), suit('dots', 9, 1),
    ];
    expect(hand).toHaveLength(16);

    const discard = suit('dots', 6, 0);
    const options = getClaimOptions(discard, hand, [], true);

    const huOption = options.find(o => o.type === 'hu');
    expect(huOption).toBeDefined();
  });

  it('returns chow only when isLeftPlayer is true', () => {
    // Hand has dots 4,5 — can chow dots 3 (as left player) or dots 6 (as left player)
    const hand: Tile[] = [
      suit('dots', 4, 0), suit('dots', 5, 0),
      // fill remaining with unrelated tiles
      suit('bamboo', 1, 0), suit('bamboo', 3, 0),
      suit('characters', 1, 0), suit('characters', 3, 0),
    ];

    const discard = suit('dots', 6, 0);

    const asLeft = getClaimOptions(discard, hand, [], true);
    const chowsAsLeft = asLeft.filter(o => o.type === 'chow');
    expect(chowsAsLeft.length).toBeGreaterThan(0);

    const asNotLeft = getClaimOptions(discard, hand, [], false);
    const chowsAsNotLeft = asNotLeft.filter(o => o.type === 'chow');
    expect(chowsAsNotLeft).toHaveLength(0);
  });

  it('does not return chow for honor tiles', () => {
    const hand: Tile[] = [
      honor('east', 0), honor('south', 0),
      suit('bamboo', 1, 0),
    ];
    const discard = honor('west', 0);

    const options = getClaimOptions(discard, hand, [], true);
    const chows = options.filter(o => o.type === 'chow');
    expect(chows).toHaveLength(0);
  });

  it('returns pong when 2 matching tiles are in hand', () => {
    const hand: Tile[] = [
      suit('dots', 5, 0), suit('dots', 5, 1),
      suit('bamboo', 1, 0),
    ];
    const discard = suit('dots', 5, 2);

    const options = getClaimOptions(discard, hand, [], false);
    const pongs = options.filter(o => o.type === 'pong');
    expect(pongs).toHaveLength(1);
  });

  it('returns kong when 3 matching tiles are in hand', () => {
    const hand: Tile[] = [
      suit('dots', 5, 0), suit('dots', 5, 1), suit('dots', 5, 2),
      suit('bamboo', 1, 0),
    ];
    const discard = suit('dots', 5, 3);

    const options = getClaimOptions(discard, hand, [], false);
    const kongs = options.filter(o => o.type === 'kong');
    expect(kongs).toHaveLength(1);
  });
});
