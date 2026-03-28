import type { FlowerTile, Tile, Wind } from '@/types';

import { chooseDiscard } from '@/lib/botLogic';
import { createDeck, dealHands, drawTile, replaceFlower } from '@/lib/deck';
import type { ClaimOption, Meld, WinResult } from '@/lib/handAnalyzer';
import { isWinningHand } from '@/lib/handAnalyzer';
import type { TaiBreakdown } from '@/lib/taiCalculator';
import { calculateTai } from '@/lib/taiCalculator';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** Per-player state within a round. */
export type PlayerState = {
  readonly hand: readonly Tile[];
  readonly declaredMelds: readonly Meld[];
  readonly flowers: readonly FlowerTile[];
  readonly seatWind: Wind;
  readonly isHuman: boolean;
  readonly score: number;
};

/** Phases of the game state machine. */
export type GamePhase =
  | 'dealing'
  | 'replacingFlowers'
  | 'playerTurn'
  | 'awaitingClaims'
  | 'botTurn'
  | 'roundOver'
  | 'gameOver';

/**
 * Complete game state. Passed to `gameReducer` along with a `GameAction` to
 * produce the next state. Never mutated in place.
 */
export type GameState = {
  readonly phase: GamePhase;
  readonly players: readonly PlayerState[];
  readonly currentPlayerIndex: number;
  readonly prevailingWind: Wind;
  readonly dealerIndex: number;
  readonly dealerStreak: number;
  readonly liveWall: readonly Tile[];
  readonly deadWall: readonly Tile[];
  readonly lastDiscard: Tile | null;
  readonly lastDiscardPlayerIndex: number | null;
  readonly winner: number | null;
  readonly lastTaiBreakdown: TaiBreakdown | null;
  readonly turnCount: number;
  readonly isLastTile: boolean;
  /**
   * Where the current player's last tile came from.
   * `'wall'` = normal draw (self-draw win possible).
   * `'deadWall'` = kong replacement draw (win-after-kong possible).
   * `null` = after a claim (pong/chow) or initial deal.
   */
  readonly lastDrawSource: 'wall' | 'deadWall' | null;
  /** The specific tile last drawn/replaced. Used as winningTile for scoring. */
  readonly lastDrawnTile: Tile | null;
  /** True once any pong/chow/kong claim has been made this round. */
  readonly claimsMadeThisRound: boolean;
};

/** Actions the UI / game loop can dispatch into the reducer. */
export type GameAction =
  | { readonly type: 'DEAL' }
  | { readonly type: 'REPLACE_FLOWER' }
  | { readonly type: 'DRAW_TILE' }
  | { readonly type: 'DISCARD_TILE'; readonly playerIndex: number; readonly tile: Tile }
  | { readonly type: 'CLAIM_TILE'; readonly playerIndex: number; readonly option: ClaimOption }
  | { readonly type: 'DECLARE_KONG'; readonly playerIndex: number; readonly meld: Meld }
  | { readonly type: 'BOT_TAKE_TURN' }
  | { readonly type: 'NEXT_ROUND' }
  | { readonly type: 'RESET_GAME' };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAYER_COUNT = 4;
const BASE_RATE = 50;
const SEAT_WINDS: readonly Wind[] = ['east', 'south', 'west', 'north'];
const WIND_ORDER: readonly Wind[] = ['east', 'south', 'west', 'north'];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns a new players array with one player replaced. */
function updatePlayer(
  players: readonly PlayerState[],
  index: number,
  player: PlayerState,
): readonly PlayerState[] {
  return players.map((p, i) => (i === index ? player : p));
}

/** Next player index in counter-clockwise turn order. */
function nextPlayer(index: number): number {
  return (index + 1) % PLAYER_COUNT;
}

/** Returns a string key that groups tiles of the same logical type. */
function tileTypeKey(tile: Tile): string {
  if (tile.kind === 'suit') return `${tile.suit}-${tile.rank}`;
  if (tile.kind === 'honor') return tile.honor;
  return '';
}

/**
 * Draws a tile and handles flower replacement from the dead wall.
 *
 * If the initial tile (or any replacement) is a flower, it is moved to
 * the flower collection and another tile is drawn from the dead wall.
 * Repeats until a non-flower tile is obtained.
 *
 * Returns `null` if the dead wall is exhausted during replacement.
 */
function drawWithFlowers(
  initialTile: Tile,
  hand: readonly Tile[],
  flowers: readonly FlowerTile[],
  deadWall: readonly Tile[],
): {
  hand: readonly Tile[];
  flowers: readonly FlowerTile[];
  deadWall: readonly Tile[];
  drawnTile: Tile;
} | null {
  let currentTile: Tile = initialTile;
  let h: Tile[] = [...hand, currentTile];
  let f: FlowerTile[] = [...flowers];
  let dw: Tile[] = [...deadWall];

  while (currentTile.kind === 'flower') {
    const flower = currentTile; // narrowed to FlowerTile
    f = [...f, flower];
    h = h.filter(t => t.id !== flower.id);

    if (dw.length === 0) return null;

    currentTile = dw[0];
    dw = dw.slice(1);
    h = [...h, currentTile];
  }

  return { hand: h, flowers: f, deadWall: dw, drawnTile: currentTile };
}

/**
 * Finds 4-of-a-kind in the hand that can be declared as a concealed kong.
 * Returns the first one found, or `null`.
 */
function findConcealedKong(hand: readonly Tile[]): Meld | null {
  const groups = new Map<string, Tile[]>();
  for (const tile of hand) {
    const key = tileTypeKey(tile);
    if (key === '') continue;
    const existing = groups.get(key);
    if (existing) {
      existing.push(tile);
    } else {
      groups.set(key, [tile]);
    }
  }

  for (const tiles of groups.values()) {
    if (tiles.length >= 4) {
      return {
        type: 'kong',
        tiles: [tiles[0], tiles[1], tiles[2], tiles[3]],
        concealed: true,
      };
    }
  }
  return null;
}

/**
 * Finds an exposed pong that can be upgraded to a kong (the 4th matching
 * tile is in hand). Returns the pong's index and the upgrade tile, or `null`.
 */
function findPongUpgrade(
  hand: readonly Tile[],
  declaredMelds: readonly Meld[],
): { pongIndex: number; tile: Tile } | null {
  for (let i = 0; i < declaredMelds.length; i++) {
    const meld = declaredMelds[i];
    if (meld.type !== 'pong' || meld.concealed) continue;

    const pongKey = tileTypeKey(meld.tiles[0]);
    const match = hand.find(t => tileTypeKey(t) === pongKey);
    if (match) {
      return { pongIndex: i, tile: match };
    }
  }
  return null;
}

/**
 * Draws a replacement tile from the dead wall after a kong declaration,
 * handling flower replacements. Returns the updated state, or transitions
 * to `'roundOver'` if the dead wall is exhausted.
 */
function applyKongReplacementDraw(
  state: GameState,
  playerIndex: number,
  player: PlayerState,
): GameState {
  if (state.deadWall.length === 0) {
    return { ...state, phase: 'roundOver', winner: null, lastTaiBreakdown: null };
  }

  const result = drawWithFlowers(
    state.deadWall[0],
    player.hand,
    player.flowers,
    state.deadWall.slice(1),
  );

  if (!result) {
    return { ...state, phase: 'roundOver', winner: null, lastTaiBreakdown: null };
  }

  const updatedPlayer: PlayerState = {
    ...player,
    hand: result.hand,
    flowers: result.flowers,
  };

  return {
    ...state,
    players: updatePlayer(state.players, playerIndex, updatedPlayer),
    deadWall: result.deadWall,
    lastDrawnTile: result.drawnTile,
    lastDrawSource: 'deadWall',
  };
}

/**
 * Processes a win: calculates tai, applies payment, and transitions to
 * `'roundOver'`.
 */
function processWin(
  state: GameState,
  winnerIdx: number,
  winResult: WinResult,
  handTiles: readonly Tile[],
  winningTile: Tile,
  winMethod: 'self-draw' | 'discard',
  isAfterKong: boolean,
  isHeavenlyWin: boolean,
  isEarthlyWin: boolean,
  isBlessingOfMan: boolean,
): GameState {
  const player = state.players[winnerIdx];

  const breakdown = calculateTai(
    winResult,
    player.declaredMelds,
    player.flowers,
    handTiles,
    winningTile,
    winMethod,
    winnerIdx === state.dealerIndex,
    state.dealerStreak,
    state.isLastTile,
    false, // isRobbingKong — not implemented in Phase 1
    isAfterKong,
    isHeavenlyWin,
    isEarthlyWin,
    isBlessingOfMan,
    state.prevailingWind,
    player.seatWind,
  );

  // Payment: 台底 + (tai × points_per_tai)
  const totalPayment = BASE_RATE + breakdown.total * BASE_RATE;

  const newPlayers: readonly PlayerState[] =
    winMethod === 'self-draw'
      ? state.players.map((p, i) => {
          if (i === winnerIdx) return { ...p, score: p.score + totalPayment * 3 };
          return { ...p, score: p.score - totalPayment };
        })
      : state.players.map((p, i) => {
          if (i === winnerIdx) return { ...p, score: p.score + totalPayment };
          if (i === state.lastDiscardPlayerIndex) return { ...p, score: p.score - totalPayment };
          return p;
        });

  return {
    ...state,
    phase: 'roundOver',
    players: newPlayers,
    winner: winnerIdx,
    lastTaiBreakdown: breakdown,
  };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

function handleDeal(state: GameState): GameState {
  if (state.phase !== 'dealing') return state;

  const deck = createDeck();
  const { hands, liveWall, deadWall } = dealHands(deck);

  // Assign hands by deal position: dealer = East (position 0), etc.
  const players: readonly PlayerState[] = state.players.map((p, i) => {
    const dealPosition = (i - state.dealerIndex + PLAYER_COUNT) % PLAYER_COUNT;
    return {
      ...p,
      hand: hands[dealPosition],
      declaredMelds: [] as readonly Meld[],
      flowers: [] as readonly FlowerTile[],
      seatWind: SEAT_WINDS[dealPosition],
    };
  });

  return {
    ...state,
    phase: 'replacingFlowers',
    players,
    currentPlayerIndex: state.dealerIndex,
    liveWall,
    deadWall,
    lastDiscard: null,
    lastDiscardPlayerIndex: null,
    winner: null,
    lastTaiBreakdown: null,
    turnCount: 0,
    isLastTile: liveWall.length <= 1,
    lastDrawSource: null,
    lastDrawnTile: null,
    claimsMadeThisRound: false,
  };
}

function handleReplaceFlower(state: GameState): GameState {
  if (state.phase !== 'replacingFlowers') return state;

  const idx = state.currentPlayerIndex;
  const player = state.players[idx];
  const result = replaceFlower(player.hand, state.deadWall);

  if (result.flowers.length > 0) {
    // Flowers found — update player, stay in phase (replacements may have flowers)
    const updatedPlayer: PlayerState = {
      ...player,
      hand: result.hand,
      flowers: [...player.flowers, ...result.flowers],
    };
    return {
      ...state,
      players: updatePlayer(state.players, idx, updatedPlayer),
      deadWall: result.deadWall,
    };
  }

  // No flowers — advance to next player
  const nextIdx = nextPlayer(idx);
  if (nextIdx === state.dealerIndex) {
    // All 4 players done — dealer's turn begins.
    // The dealer already has 17 tiles; treat the last tile as the "drawn" tile
    // for Heavenly Win detection.
    const dealer = state.players[state.dealerIndex];
    const lastTile = dealer.hand[dealer.hand.length - 1];
    const phase = dealer.isHuman ? 'playerTurn' : 'botTurn';
    return {
      ...state,
      phase,
      currentPlayerIndex: state.dealerIndex,
      lastDrawSource: 'wall',
      lastDrawnTile: lastTile ?? null,
    };
  }

  return { ...state, currentPlayerIndex: nextIdx };
}

function handleDrawTile(state: GameState): GameState {
  if (state.phase !== 'awaitingClaims') return state;
  if (state.lastDiscardPlayerIndex === null) return state;

  const drawerIdx = nextPlayer(state.lastDiscardPlayerIndex);
  const player = state.players[drawerIdx];

  // Draw from live wall
  const result = drawTile(state.liveWall);
  if (!result.ok) {
    // Exhaustive draw — round over with no winner
    return {
      ...state,
      phase: 'roundOver',
      winner: null,
      lastTaiBreakdown: null,
    };
  }

  // Handle flower replacement on the drawn tile
  const flowerResult = drawWithFlowers(
    result.value.tile,
    player.hand,
    player.flowers,
    state.deadWall,
  );

  if (!flowerResult) {
    // Dead wall exhausted during flower replacement
    return {
      ...state,
      phase: 'roundOver',
      winner: null,
      lastTaiBreakdown: null,
    };
  }

  const updatedPlayer: PlayerState = {
    ...player,
    hand: flowerResult.hand,
    flowers: flowerResult.flowers,
  };

  const newLiveWall = result.value.wall;
  const phase = updatedPlayer.isHuman ? 'playerTurn' : 'botTurn';

  return {
    ...state,
    phase,
    players: updatePlayer(state.players, drawerIdx, updatedPlayer),
    currentPlayerIndex: drawerIdx,
    liveWall: newLiveWall,
    deadWall: flowerResult.deadWall,
    lastDiscard: null,
    lastDiscardPlayerIndex: null,
    isLastTile: newLiveWall.length <= 1,
    lastDrawSource: 'wall',
    lastDrawnTile: flowerResult.drawnTile,
  };
}

function handleDiscardTile(
  state: GameState,
  action: { readonly playerIndex: number; readonly tile: Tile },
): GameState {
  if (state.phase !== 'playerTurn' && state.phase !== 'botTurn') return state;
  if (action.playerIndex !== state.currentPlayerIndex) return state;

  const player = state.players[action.playerIndex];

  // Verify tile is in hand
  if (!player.hand.some(t => t.id === action.tile.id)) return state;

  const newHand = player.hand.filter(t => t.id !== action.tile.id);
  const updatedPlayer: PlayerState = { ...player, hand: newHand };

  return {
    ...state,
    phase: 'awaitingClaims',
    players: updatePlayer(state.players, action.playerIndex, updatedPlayer),
    lastDiscard: action.tile,
    lastDiscardPlayerIndex: action.playerIndex,
    turnCount: state.turnCount + 1,
  };
}

function handleClaimTile(
  state: GameState,
  action: { readonly playerIndex: number; readonly option: ClaimOption },
): GameState {
  if (state.phase !== 'awaitingClaims') return state;
  if (!state.lastDiscard || state.lastDiscardPlayerIndex === null) return state;
  if (action.playerIndex === state.lastDiscardPlayerIndex) return state;

  const { playerIndex, option } = action;
  const player = state.players[playerIndex];

  // --- Hu (win on discard) ---
  if (option.type === 'hu') {
    const handWithDiscard = [...player.hand, state.lastDiscard];
    const winResult = isWinningHand(handWithDiscard, player.declaredMelds);
    if (!winResult.isWin) return state;

    return processWin(
      state,
      playerIndex,
      winResult,
      handWithDiscard,
      state.lastDiscard,
      'discard',
      false,
      false,
      false,
      state.turnCount === 1,
    );
  }

  // --- Non-hu claims: pong / kong / chow ---
  const claimedMeld = option.melds[0];

  // Remove hand tiles used in the meld (all meld tiles except the discard)
  const handTileIds = new Set(
    claimedMeld.tiles.filter(t => t.id !== state.lastDiscard!.id).map(t => t.id),
  );
  const newHand = player.hand.filter(t => !handTileIds.has(t.id));

  let updatedPlayer: PlayerState = {
    ...player,
    hand: newHand,
    declaredMelds: [...player.declaredMelds, claimedMeld],
  };

  let newState: GameState = {
    ...state,
    lastDiscard: null,
    lastDiscardPlayerIndex: null,
    claimsMadeThisRound: true,
  };

  // Kong claims get a replacement draw from dead wall
  if (option.type === 'kong') {
    newState = applyKongReplacementDraw(newState, playerIndex, updatedPlayer);
    if (newState.phase === 'roundOver') return newState;

    // Refresh updatedPlayer from the modified state
    updatedPlayer = newState.players[playerIndex];
    const phase = updatedPlayer.isHuman ? 'playerTurn' : 'botTurn';
    return { ...newState, phase, currentPlayerIndex: playerIndex };
  }

  // Pong / Chow: no replacement draw; claimer now has one extra tile to discard
  const phase = updatedPlayer.isHuman ? 'playerTurn' : 'botTurn';
  return {
    ...newState,
    phase,
    players: updatePlayer(newState.players, playerIndex, updatedPlayer),
    currentPlayerIndex: playerIndex,
    lastDrawSource: null,
    lastDrawnTile: null,
  };
}

function handleDeclareKong(
  state: GameState,
  action: { readonly playerIndex: number; readonly meld: Meld },
): GameState {
  if (state.phase !== 'playerTurn') return state;
  if (action.playerIndex !== state.currentPlayerIndex) return state;
  if (action.meld.type !== 'kong') return state;

  const { playerIndex, meld } = action;
  const player = state.players[playerIndex];

  let updatedPlayer: PlayerState;

  if (meld.concealed) {
    // Concealed kong: verify 4 tiles of the same type are in hand
    if (meld.tiles.length !== 4) return state;
    if (!meld.tiles.every(t => player.hand.some(h => h.id === t.id))) return state;

    const tileIds = new Set(meld.tiles.map(t => t.id));
    updatedPlayer = {
      ...player,
      hand: player.hand.filter(t => !tileIds.has(t.id)),
      declaredMelds: [...player.declaredMelds, meld],
    };
  } else {
    // Pong upgrade: find matching exposed pong and the 4th tile in hand
    const upgradeKey = tileTypeKey(meld.tiles[0]);
    const pongIndex = player.declaredMelds.findIndex(
      m => m.type === 'pong' && !m.concealed && tileTypeKey(m.tiles[0]) === upgradeKey,
    );
    if (pongIndex === -1) return state;

    const existingPong = player.declaredMelds[pongIndex];
    const existingIds = new Set(existingPong.tiles.map(t => t.id));
    const upgradeTile = player.hand.find(
      t => tileTypeKey(t) === upgradeKey && !existingIds.has(t.id),
    );
    if (!upgradeTile) return state;

    const kong: Meld = {
      type: 'kong',
      tiles: [...existingPong.tiles, upgradeTile],
      concealed: false,
    };
    updatedPlayer = {
      ...player,
      hand: player.hand.filter(t => t.id !== upgradeTile.id),
      declaredMelds: player.declaredMelds.map((m, i) => (i === pongIndex ? kong : m)),
    };
  }

  // Draw replacement from dead wall
  const newState = applyKongReplacementDraw(state, playerIndex, updatedPlayer);
  if (newState.phase === 'roundOver') return newState;

  // Stay in playerTurn — player may win, declare another kong, or discard
  return { ...newState, phase: 'playerTurn' };
}

function handleBotTakeTurn(state: GameState): GameState {
  if (state.phase !== 'botTurn') return state;

  const idx = state.currentPlayerIndex;
  const player = state.players[idx];

  // 1. Check for self-draw win
  if (state.lastDrawSource !== null) {
    const winResult = isWinningHand(player.hand, player.declaredMelds);
    if (winResult.isWin && state.lastDrawnTile) {
      const isAfterKong = state.lastDrawSource === 'deadWall';
      const isHeavenlyWin = idx === state.dealerIndex && state.turnCount === 0;
      const isEarthlyWin =
        !state.claimsMadeThisRound &&
        idx !== state.dealerIndex &&
        state.turnCount === ((idx - state.dealerIndex + PLAYER_COUNT) % PLAYER_COUNT);

      return processWin(
        state,
        idx,
        winResult,
        player.hand,
        state.lastDrawnTile,
        'self-draw',
        isAfterKong,
        isHeavenlyWin,
        isEarthlyWin,
        false,
      );
    }
  }

  // 2. Check for concealed kong (always declare for Phase 1 simplicity)
  const concealedKong = findConcealedKong(player.hand);
  if (concealedKong) {
    const tileIds = new Set(concealedKong.tiles.map(t => t.id));
    const afterKong: PlayerState = {
      ...player,
      hand: player.hand.filter(t => !tileIds.has(t.id)),
      declaredMelds: [...player.declaredMelds, concealedKong],
    };

    const afterDraw = applyKongReplacementDraw(state, idx, afterKong);
    if (afterDraw.phase === 'roundOver') return afterDraw;

    // Re-enter bot turn to check for win on replacement / another kong / discard
    return { ...afterDraw, phase: 'botTurn' };
  }

  // 3. Check for pong upgrade (always upgrade for Phase 1 simplicity)
  const upgrade = findPongUpgrade(player.hand, player.declaredMelds);
  if (upgrade) {
    const existingPong = player.declaredMelds[upgrade.pongIndex];
    const kong: Meld = {
      type: 'kong',
      tiles: [...existingPong.tiles, upgrade.tile],
      concealed: false,
    };
    const afterUpgrade: PlayerState = {
      ...player,
      hand: player.hand.filter(t => t.id !== upgrade.tile.id),
      declaredMelds: player.declaredMelds.map((m, i) =>
        i === upgrade.pongIndex ? kong : m,
      ),
    };

    const afterDraw = applyKongReplacementDraw(state, idx, afterUpgrade);
    if (afterDraw.phase === 'roundOver') return afterDraw;

    // Re-enter bot turn to check for win on replacement / discard
    return { ...afterDraw, phase: 'botTurn' };
  }

  // 4. Choose discard
  const botAction = chooseDiscard(player.hand, player.declaredMelds, player.flowers);
  if (botAction.type !== 'discard') return state;

  const newHand = player.hand.filter(t => t.id !== botAction.tile.id);
  const updatedPlayer: PlayerState = { ...player, hand: newHand };

  return {
    ...state,
    phase: 'awaitingClaims',
    players: updatePlayer(state.players, idx, updatedPlayer),
    lastDiscard: botAction.tile,
    lastDiscardPlayerIndex: idx,
    turnCount: state.turnCount + 1,
  };
}

function handleNextRound(state: GameState): GameState {
  if (state.phase !== 'roundOver') return state;

  let newDealerIndex = state.dealerIndex;
  let newDealerStreak = state.dealerStreak;
  let newPrevailingWind = state.prevailingWind;

  if (state.winner === state.dealerIndex) {
    // Dealer won — stays, streak increments
    newDealerStreak = state.dealerStreak + 1;
  } else {
    // Dealer lost or exhaustive draw — rotate dealer
    newDealerIndex = nextPlayer(state.dealerIndex);
    newDealerStreak = 0;

    // When dealer rotates back to position 0, advance prevailing wind
    if (newDealerIndex === 0) {
      const currentIdx = WIND_ORDER.indexOf(state.prevailingWind);
      if (currentIdx >= WIND_ORDER.length - 1) {
        return { ...state, phase: 'gameOver' };
      }
      newPrevailingWind = WIND_ORDER[currentIdx + 1];
    }
  }

  return {
    ...state,
    phase: 'dealing',
    dealerIndex: newDealerIndex,
    dealerStreak: newDealerStreak,
    prevailingWind: newPrevailingWind,
    winner: null,
    lastTaiBreakdown: null,
    lastDiscard: null,
    lastDiscardPlayerIndex: null,
    turnCount: 0,
    isLastTile: false,
    lastDrawSource: null,
    lastDrawnTile: null,
    claimsMadeThisRound: false,
  };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

/** A valid starting state before the first deal. */
export const initialState: GameState = {
  phase: 'dealing',
  players: [
    { hand: [], declaredMelds: [], flowers: [], seatWind: 'east', isHuman: true, score: 0 },
    { hand: [], declaredMelds: [], flowers: [], seatWind: 'south', isHuman: false, score: 0 },
    { hand: [], declaredMelds: [], flowers: [], seatWind: 'west', isHuman: false, score: 0 },
    { hand: [], declaredMelds: [], flowers: [], seatWind: 'north', isHuman: false, score: 0 },
  ],
  currentPlayerIndex: 0,
  prevailingWind: 'east',
  dealerIndex: 0,
  dealerStreak: 0,
  liveWall: [],
  deadWall: [],
  lastDiscard: null,
  lastDiscardPlayerIndex: null,
  winner: null,
  lastTaiBreakdown: null,
  turnCount: 0,
  isLastTile: false,
  lastDrawSource: null,
  lastDrawnTile: null,
  claimsMadeThisRound: false,
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Pure reducer for the entire Taiwan Mahjong game state machine.
 *
 * Processes one {@link GameAction} at a time and returns the next
 * {@link GameState}. Illegal actions (wrong phase, wrong player, invalid
 * tile) return the current state unchanged.
 *
 * **Design notes:**
 * - The `DEAL` action calls `createDeck()`, which uses `Math.random()` for
 *   the shuffle seed. This is the only source of non-determinism. For
 *   reproducible games, the game loop can pre-build the deck externally.
 * - Bot turns are triggered explicitly via `BOT_TAKE_TURN` so the UI can
 *   insert delays (300–500 ms) between bot actions.
 * - Claim resolution during `'awaitingClaims'` is driven by the game loop:
 *   it checks each player for valid claims (via `getClaimOptions` /
 *   `chooseClaim`), resolves priority, then dispatches either `CLAIM_TILE`
 *   or `DRAW_TILE`.
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'DEAL':
      return handleDeal(state);
    case 'REPLACE_FLOWER':
      return handleReplaceFlower(state);
    case 'DRAW_TILE':
      return handleDrawTile(state);
    case 'DISCARD_TILE':
      return handleDiscardTile(state, action);
    case 'CLAIM_TILE':
      return handleClaimTile(state, action);
    case 'DECLARE_KONG':
      return handleDeclareKong(state, action);
    case 'BOT_TAKE_TURN':
      return handleBotTakeTurn(state);
    case 'NEXT_ROUND':
      return handleNextRound(state);
    case 'RESET_GAME':
      return initialState;
  }
  return state;
}
