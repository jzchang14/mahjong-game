import type { Dragon, FlowerTile, Tile, Wind } from '@/types';

import type { Meld, WinResult } from '@/lib/handAnalyzer';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/**
 * Itemised breakdown of tai (scoring points) for a winning hand.
 *
 * `total` is the sum of all individual `items[].tai` values. The UI can
 * render `items` as a human-readable scoring explanation.
 */
export type TaiBreakdown = {
  readonly total: number;
  readonly items: readonly { readonly label: string; readonly tai: number }[];
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Type guard: is the honor value a wind? */
function isWindValue(honor: Wind | Dragon): honor is Wind {
  return (
    honor === 'east' ||
    honor === 'south' ||
    honor === 'west' ||
    honor === 'north'
  );
}

/** Type guard: is the honor value a dragon? */
function isDragonValue(honor: Wind | Dragon): honor is Dragon {
  return honor === 'red' || honor === 'green' || honor === 'white';
}

/**
 * Detects the 8½ pairs (7 pairs + 1 triplet) hand from the WinResult
 * structure: a single concealed pong meld with no declared melds.
 */
function isSevenPairsHand(
  melds: readonly Meld[],
  declaredMelds: readonly Meld[],
): boolean {
  return (
    declaredMelds.length === 0 &&
    melds.length === 1 &&
    melds[0].type === 'pong' &&
    melds[0].concealed
  );
}

/**
 * Collects every non-flower tile in the winning hand for pattern checks.
 *
 * For standard form, tiles are recoverable from `melds` + `pair`.
 * For 8½ pairs, the WinResult only stores the triplet and one pair, so we
 * fall back to the full `handTiles` array.
 */
function collectAllTiles(
  melds: readonly Meld[],
  pair: readonly Tile[],
  handTiles: readonly Tile[],
  declaredMelds: readonly Meld[],
): readonly Tile[] {
  if (isSevenPairsHand(melds, declaredMelds)) {
    return handTiles.filter(t => t.kind !== 'flower');
  }
  return [...melds.flatMap(m => [...m.tiles]), ...pair];
}

/**
 * Determines the flush state of the winning hand.
 *
 * - `'full'`: every tile is a suit tile of one suit (no honors).
 * - `'half'`: every tile is one suit or honor (at least one of each).
 * - `'none'`: tiles span multiple suits or contain no suit tiles.
 */
function getFlushType(
  allTiles: readonly Tile[],
): 'full' | 'half' | 'none' {
  const suits = new Set<string>();
  let hasHonor = false;

  for (const tile of allTiles) {
    if (tile.kind === 'suit') {
      suits.add(tile.suit);
    } else if (tile.kind === 'honor') {
      hasHonor = true;
    }
  }

  if (suits.size !== 1) return 'none';
  return hasHonor ? 'half' : 'full';
}

/**
 * Extracts the honor value from a pong/kong meld's representative tile.
 * Returns `null` for suit melds.
 */
function getMeldHonor(meld: Meld): (Wind | Dragon) | null {
  const tile = meld.tiles[0];
  return tile.kind === 'honor' ? tile.honor : null;
}

/**
 * Counts concealed pong/kong melds, adjusting for discard wins.
 *
 * When winning by discard, a hand-decomposed pong that contains the
 * winning tile is not truly concealed (one tile came from the discarder).
 * Concealed kongs (declared before the win) are always concealed.
 */
function countConcealedPungs(
  melds: readonly Meld[],
  winningTile: Tile,
  winMethod: 'self-draw' | 'discard',
): number {
  let count = 0;
  for (const meld of melds) {
    if (
      (meld.type === 'pong' || meld.type === 'kong') &&
      meld.concealed
    ) {
      if (
        winMethod === 'discard' &&
        meld.type === 'pong' &&
        meld.tiles.some(t => t.id === winningTile.id)
      ) {
        continue;
      }
      count++;
    }
  }
  return count;
}

/**
 * Determines the wait type bonus for the winning tile's position in
 * the hand decomposition.
 *
 * - `'single'`: winning tile completes the pair.
 * - `'edge'`:   winning tile is rank 3 in a 1-2-3 chow, or rank 7 in 7-8-9.
 * - `'inside'`: winning tile is the middle rank of a chow.
 * - `null`:     no special wait (pong wait or non-restricted chow position).
 */
function getWaitType(
  melds: readonly Meld[],
  pair: readonly Tile[],
  winningTile: Tile,
): 'edge' | 'inside' | 'single' | null {
  // Check pair: single wait
  if (pair.some(t => t.id === winningTile.id)) {
    return 'single';
  }

  // Find the meld containing the winning tile
  for (const meld of melds) {
    if (!meld.tiles.some(t => t.id === winningTile.id)) continue;

    // Only chows produce edge/inside waits
    if (meld.type !== 'chow') return null;

    // Extract ranks from the chow tiles
    const ranks: number[] = [];
    for (const t of meld.tiles) {
      if (t.kind === 'suit') ranks.push(t.rank);
    }
    ranks.sort((a, b) => a - b);
    if (ranks.length !== 3) return null;

    const winRank = winningTile.kind === 'suit' ? winningTile.rank : null;
    if (winRank === null) return null;

    // Inside wait: winning tile is the middle rank
    if (winRank === ranks[1]) return 'inside';

    // Edge wait: 1-2-3 waiting on 3, or 7-8-9 waiting on 7
    if (ranks[0] === 1 && ranks[2] === 3 && winRank === 3) return 'edge';
    if (ranks[0] === 7 && ranks[2] === 9 && winRank === 7) return 'edge';

    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Exported function
// ---------------------------------------------------------------------------

/**
 * Calculates and itemises the tai (scoring points) for a winning hand
 * according to traditional Taiwan Mahjong rules.
 *
 * Every contributing tai source is listed in the returned {@link TaiBreakdown}
 * so the UI can display a full scoring explanation. The `total` field is the
 * sum of all individual items.
 *
 * **Stacking rules:**
 * - Tai values from different scoring families stack (e.g. All Pungs + Half
 *   Flush = 20 tai).
 * - Within a family of progressive patterns, only the highest applies
 *   (e.g. Four Concealed Pungs supersedes Three Concealed Pungs).
 * - Concealed Self-Draw (+3) replaces individual Concealed (+1) and
 *   Self-Draw (+1) — it is not additive.
 * - Flowers are always +1 per flower on top of everything (8 flowers = +8).
 * - Kong bonuses (melded/concealed) are per-kong and stack with everything.
 *
 * @param result          - Verified winning hand decomposition from
 *                          {@link isWinningHand}. Must have `isWin: true`.
 * @param declaredMelds   - Melds declared during the round (exposed
 *                          pong/chow/kong and concealed kongs).
 * @param flowers         - Flower tiles collected by the winner.
 * @param handTiles       - All concealed tiles in the winner's hand at the
 *                          moment of winning (including the winning tile).
 *                          Required for 8½ pairs where the WinResult only
 *                          stores the triplet and one pair.
 * @param winningTile     - The tile that completed the hand (self-drawn or
 *                          claimed discard). Used for wait type detection.
 * @param winMethod       - `'self-draw'` or `'discard'`.
 * @param isDealer        - Whether the winner is the current dealer.
 * @param dealerStreak    - Consecutive dealer wins (0 on first win as dealer).
 * @param isLastTile      - Winning tile is the 4th copy (all others visible).
 * @param isRobbingKong   - Won by robbing another player's kong upgrade.
 * @param isAfterKong     - Won on a replacement draw after declaring a kong.
 * @param isHeavenlyWin   - Dealer wins on their dealt hand (天胡).
 * @param isEarthlyWin    - Non-dealer wins on first self-draw (地胡).
 * @param isBlessingOfMan - Win on the very first discard of the game (人胡).
 * @param prevailingWind  - The prevailing (round) wind.
 * @param seatWind        - The winner's seat wind.
 * @returns A breakdown of every tai source and the total. Returns
 *          `{ total: 0, items: [] }` if `result.isWin` is false.
 */
export function calculateTai(
  result: WinResult,
  declaredMelds: readonly Meld[],
  flowers: readonly FlowerTile[],
  handTiles: readonly Tile[],
  winningTile: Tile,
  winMethod: 'self-draw' | 'discard',
  isDealer: boolean,
  dealerStreak: number,
  isLastTile: boolean,
  isRobbingKong: boolean,
  isAfterKong: boolean,
  isHeavenlyWin: boolean,
  isEarthlyWin: boolean,
  isBlessingOfMan: boolean,
  prevailingWind: Wind,
  seatWind: Wind,
): TaiBreakdown {
  if (!result.isWin) {
    return { total: 0, items: [] };
  }

  const items: { label: string; tai: number }[] = [];
  const { melds, pair } = result;
  const is7Pairs = isSevenPairsHand(melds, declaredMelds);
  const allTiles = collectAllTiles(melds, pair, handTiles, declaredMelds);
  const pongKongMelds = melds.filter(
    m => m.type === 'pong' || m.type === 'kong',
  );

  // -----------------------------------------------------------------------
  // Special first-turn wins
  // -----------------------------------------------------------------------

  if (isHeavenlyWin) {
    items.push({ label: '天胡 (Heavenly Win)', tai: 40 });
  }
  if (isEarthlyWin) {
    items.push({ label: '地胡 (Earthly Win)', tai: 40 });
  }
  if (isBlessingOfMan) {
    items.push({ label: '人胡 (Blessing of Man)', tai: 8 });
  }

  // -----------------------------------------------------------------------
  // Win method: self-draw / concealed / concealed self-draw
  // Concealed Self-Draw (+3) replaces individual Self-Draw (+1) and
  // Concealed Hand (+1). They are NOT additive.
  // -----------------------------------------------------------------------

  const isConcealed = declaredMelds.every(m => m.concealed);

  if (isConcealed && winMethod === 'self-draw') {
    items.push({ label: '門清自摸 (Concealed Self-Draw)', tai: 3 });
  } else if (winMethod === 'self-draw') {
    items.push({ label: '自摸 (Self-Draw)', tai: 1 });
  } else if (isConcealed) {
    items.push({ label: '門清 (Concealed Hand)', tai: 1 });
  }

  // -----------------------------------------------------------------------
  // Flowers: +1 per flower (8 flowers = +8 total)
  // -----------------------------------------------------------------------

  if (flowers.length > 0) {
    if (flowers.length >= 8) {
      items.push({ label: '八仙花 (All 8 Flowers)', tai: 8 });
    } else {
      items.push({
        label: `花牌 ×${flowers.length} (Flowers)`,
        tai: flowers.length,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Wind pong bonuses: seat wind +1, round wind +1 (each, per meld)
  // If seat wind === round wind, the same pong yields +2.
  // -----------------------------------------------------------------------

  for (const meld of pongKongMelds) {
    const honor = getMeldHonor(meld);
    if (honor !== null && isWindValue(honor)) {
      if (honor === seatWind) {
        items.push({ label: `門風 ${honor} (Seat Wind)`, tai: 1 });
      }
      if (honor === prevailingWind) {
        items.push({ label: `圈風 ${honor} (Round Wind)`, tai: 1 });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Dragon pong bonuses: +1 per dragon pong/kong
  // -----------------------------------------------------------------------

  for (const meld of pongKongMelds) {
    const honor = getMeldHonor(meld);
    if (honor !== null && isDragonValue(honor)) {
      items.push({ label: `三元牌 ${honor} (Dragon)`, tai: 1 });
    }
  }

  // -----------------------------------------------------------------------
  // Wait type bonuses (not applicable for 8½ pairs)
  // -----------------------------------------------------------------------

  if (!is7Pairs) {
    const waitType = getWaitType(melds, pair, winningTile);
    if (waitType === 'edge') {
      items.push({ label: '邊張 (Edge Wait)', tai: 1 });
    } else if (waitType === 'inside') {
      items.push({ label: '嵌張 (Inside Wait)', tai: 1 });
    } else if (waitType === 'single') {
      items.push({ label: '單騎 (Single Wait)', tai: 1 });
    }
  }

  // -----------------------------------------------------------------------
  // Situational bonuses
  // -----------------------------------------------------------------------

  if (isLastTile) {
    items.push({ label: '絕張 (Last Tile)', tai: 1 });
  }
  if (isRobbingKong) {
    items.push({ label: '搶槓 (Robbing the Kong)', tai: 1 });
  }
  if (isAfterKong) {
    items.push({ label: '槓上開花 (Win After Kong)', tai: 1 });
  }

  // -----------------------------------------------------------------------
  // Kong bonuses: melded kong +1, concealed kong +2 (per kong, stackable)
  // -----------------------------------------------------------------------

  for (const meld of melds) {
    if (meld.type === 'kong') {
      if (meld.concealed) {
        items.push({ label: '暗槓 (Concealed Kong)', tai: 2 });
      } else {
        items.push({ label: '明槓 (Melded Kong)', tai: 1 });
      }
    }
  }

  // -----------------------------------------------------------------------
  // No Honors: +1 if no wind or dragon tiles anywhere in the hand
  // -----------------------------------------------------------------------

  if (!allTiles.some(t => t.kind === 'honor')) {
    items.push({ label: '無字 (No Honors)', tai: 1 });
  }

  // -----------------------------------------------------------------------
  // All Chows (+2) / All Pungs (+10) — mutually exclusive by nature.
  // Only applicable for standard 5-meld form.
  // -----------------------------------------------------------------------

  if (!is7Pairs && melds.length === 5) {
    if (melds.every(m => m.type === 'pong' || m.type === 'kong')) {
      items.push({ label: '碰碰胡 (All Pungs)', tai: 10 });
    } else if (melds.every(m => m.type === 'chow')) {
      items.push({ label: '平胡 (All Chows)', tai: 2 });
    }
  }

  // -----------------------------------------------------------------------
  // Concealed pungs family: 3 (+2) / 4 (+15) / 5 (+40) — use highest.
  // When winning by discard, a hand-decomposed pong containing the winning
  // tile is not counted as concealed.
  // -----------------------------------------------------------------------

  if (!is7Pairs) {
    const cpCount = countConcealedPungs(melds, winningTile, winMethod);
    if (cpCount >= 5) {
      items.push({ label: '五暗刻 (Five Concealed Pungs)', tai: 40 });
    } else if (cpCount >= 4) {
      items.push({ label: '四暗刻 (Four Concealed Pungs)', tai: 15 });
    } else if (cpCount >= 3) {
      items.push({ label: '三暗刻 (Three Concealed Pungs)', tai: 2 });
    }
  }

  // -----------------------------------------------------------------------
  // Flush family: Half Flush (+10) / Full Flush (+40) — use highest.
  // -----------------------------------------------------------------------

  const flushType = getFlushType(allTiles);
  if (flushType === 'full') {
    items.push({ label: '清一色 (Full Flush)', tai: 40 });
  } else if (flushType === 'half') {
    items.push({ label: '混一色 (Half Flush)', tai: 10 });
  }

  // -----------------------------------------------------------------------
  // Wind pattern family — use highest applicable:
  //   Big Four Winds (+40) > Little Four Winds (+30) > Big Three Winds (+15)
  //
  // Note: CLAUDE.md lists "Little Three Winds (+5, 3 wind pongs + wind pair)"
  // with the same condition as Little Four Winds (+30). Per the "use highest"
  // rule, Little Three Winds is always superseded and never triggers.
  // -----------------------------------------------------------------------

  const windPongCount = pongKongMelds.filter(m => {
    const honor = getMeldHonor(m);
    return honor !== null && isWindValue(honor);
  }).length;
  const pairIsWind =
    pair[0].kind === 'honor' && isWindValue(pair[0].honor);

  if (windPongCount >= 4) {
    items.push({ label: '大四喜 (Big Four Winds)', tai: 40 });
  } else if (windPongCount >= 3 && pairIsWind) {
    items.push({ label: '小四喜 (Little Four Winds)', tai: 30 });
  } else if (windPongCount >= 3) {
    items.push({ label: '大三風 (Big Three Winds)', tai: 15 });
  }

  // -----------------------------------------------------------------------
  // Dragon pattern family — use highest applicable:
  //   Big Three Dragons (+30) > Little Three Dragons (+15)
  // -----------------------------------------------------------------------

  const dragonPongCount = pongKongMelds.filter(m => {
    const honor = getMeldHonor(m);
    return honor !== null && isDragonValue(honor);
  }).length;
  const pairIsDragon =
    pair[0].kind === 'honor' && isDragonValue(pair[0].honor);

  if (dragonPongCount >= 3) {
    items.push({ label: '大三元 (Big Three Dragons)', tai: 30 });
  } else if (dragonPongCount >= 2 && pairIsDragon) {
    items.push({ label: '小三元 (Little Three Dragons)', tai: 15 });
  }

  // -----------------------------------------------------------------------
  // Seven Pairs + Triplet (8½ pairs): +30
  // -----------------------------------------------------------------------

  if (is7Pairs) {
    items.push({ label: '七對半 (Seven Pairs + Triplet)', tai: 30 });
  }

  // -----------------------------------------------------------------------
  // Dealer streak bonus: 1 + (2 × consecutive_wins)
  // Applied whenever the dealer wins. On the first win as dealer
  // (dealerStreak = 0), the bonus is +1.
  // -----------------------------------------------------------------------

  if (isDealer) {
    const bonus = 1 + 2 * dealerStreak;
    if (dealerStreak > 0) {
      items.push({
        label: `莊家連莊 ×${dealerStreak} (Dealer Streak)`,
        tai: bonus,
      });
    } else {
      items.push({ label: '莊家 (Dealer Bonus)', tai: bonus });
    }
  }

  // -----------------------------------------------------------------------
  // Total
  // -----------------------------------------------------------------------

  const total = items.reduce((sum, item) => sum + item.tai, 0);

  return { total, items };
}
