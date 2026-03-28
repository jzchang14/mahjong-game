'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { Tile as TileType, Wind } from '@/types';

import type { ClaimOption } from '@/lib/handAnalyzer';
import { getClaimOptions } from '@/lib/handAnalyzer';
import type { GameAction, GameState } from '@/lib/gameReducer';
import { estimateShanten } from '@/lib/shanten';

import ActionBar from '@/components/ActionBar';
import DiscardPile from '@/components/DiscardPile';
import Hand from '@/components/Hand';
import ScoreBoard from '@/components/ScoreBoard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BoardProps = {
  state: GameState;
  onAction: (action: GameAction) => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HUMAN_IDX = 0;
const PLAYER_COUNT = 4;

const WIND_LABEL: Record<Wind, string> = {
  east: '東',
  south: '南',
  west: '西',
  north: '北',
};

const PLAYER_NAMES = ['You', 'Bot 1', 'Bot 2', 'Bot 3'];

/** Claim countdown timer duration in seconds. */
const CLAIM_TIMER_SECONDS = 8;

/** SVG progress ring constants. */
const RING_RADIUS = 35;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUIT_ORDER: Record<string, number> = {
  bamboo: 0,
  dots: 1,
  characters: 2,
};
const HONOR_ORDER: Record<string, number> = {
  east: 0,
  south: 1,
  west: 2,
  north: 3,
  red: 4,
  green: 5,
  white: 6,
};

/**
 * Sorts tiles for display: suits (bamboo → dots → characters, by rank),
 * then honors (winds E/S/W/N, dragons R/G/W), then flowers.
 */
function sortTiles(tiles: readonly TileType[]): TileType[] {
  function tileKey(t: TileType): number {
    if (t.kind === 'suit') return SUIT_ORDER[t.suit] * 10 + t.rank;
    if (t.kind === 'honor') return 100 + (HONOR_ORDER[t.honor] ?? 0);
    return 200; // flowers last
  }
  return [...tiles].sort((a, b) => tileKey(a) - tileKey(b));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Small pill showing player name + seat wind character. */
function Nameplate({ name, wind }: { name: string; wind: Wind }) {
  return (
    <div className="rounded-full bg-gray-900/60 px-3 py-0.5 text-xs font-medium text-gray-300 backdrop-blur-sm">
      <span className="mr-1 font-bold text-amber-400">
        {WIND_LABEL[wind]}
      </span>
      {name}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Board({ state, onAction }: BoardProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // ── Discard history tracking ──
  // The reducer only stores lastDiscard / lastDiscardPlayerIndex (no history).
  // We accumulate discards here and remove claimed tiles by detecting meld
  // count changes when lastDiscard disappears.
  const [discardHistory, setDiscardHistory] = useState<
    { tile: TileType; playerIndex: number }[]
  >([]);
  const prevDiscardIdRef = useRef<number | null>(null);
  const prevMeldCountRef = useRef<number>(0);

  // ── Tenpai discard tracking ──
  // Track which discard IDs were made while the discarding player was tenpai.
  // Keyed by player index → Set of discard tile IDs.
  const [tenpaiDiscardIds, setTenpaiDiscardIds] = useState<
    [Set<number>, Set<number>, Set<number>, Set<number>]
  >([new Set(), new Set(), new Set(), new Set()]);

  // ── Claim countdown timer ──
  const [claimTimer, setClaimTimer] = useState(CLAIM_TIMER_SECONDS);

  const human = state.players[HUMAN_IDX];

  // ── Auto-sorted human hand ──
  const sortedHumanHand = useMemo(
    () => sortTiles(human.hand),
    [human.hand],
  );

  // Reset selection when phase, active player, or hand contents change
  useEffect(() => {
    setSelectedIndex(null);
  }, [state.phase, state.currentPlayerIndex, sortedHumanHand]);

  // Track new discards and claimed tiles
  useEffect(() => {
    const currId = state.lastDiscard?.id ?? null;
    const totalMelds = state.players.reduce(
      (sum, p) => sum + p.declaredMelds.length,
      0,
    );

    // A new discard appeared → append to history + check tenpai
    if (currId !== null && currId !== prevDiscardIdRef.current) {
      const pi = state.lastDiscardPlayerIndex!;
      const discardTile = state.lastDiscard!;

      setDiscardHistory((prev) => [
        ...prev,
        { tile: discardTile, playerIndex: pi },
      ]);

      // Check if the discarding player is now tenpai (shanten 0 after discard)
      const player = state.players[pi];
      const shanten = estimateShanten(player.hand, player.declaredMelds);
      if (shanten <= 0) {
        setTenpaiDiscardIds((prev) => {
          const next = [...prev] as [Set<number>, Set<number>, Set<number>, Set<number>];
          next[pi] = new Set(prev[pi]).add(discardTile.id);
          return next;
        });
      }
    }

    // Discard disappeared AND meld count increased → tile was claimed
    if (
      prevDiscardIdRef.current !== null &&
      currId === null &&
      totalMelds > prevMeldCountRef.current
    ) {
      setDiscardHistory((prev) => prev.slice(0, -1));
    }

    prevDiscardIdRef.current = currId;
    prevMeldCountRef.current = totalMelds;
  }, [state.lastDiscard, state.lastDiscardPlayerIndex, state.players]);

  // Clear discard history and tenpai tracking when a new round begins
  useEffect(() => {
    if (state.phase === 'dealing') {
      setDiscardHistory([]);
      prevDiscardIdRef.current = null;
      prevMeldCountRef.current = 0;
      setTenpaiDiscardIds([new Set(), new Set(), new Set(), new Set()]);
    }
  }, [state.phase]);

  // ── Claim timer: reset on new discard ──
  useEffect(() => {
    if (state.lastDiscard !== null) {
      setClaimTimer(CLAIM_TIMER_SECONDS);
    }
  }, [state.lastDiscard]);

  // ── Per-player discard arrays ──
  const playerDiscards: TileType[][] = [[], [], [], []];
  for (const entry of discardHistory) {
    playerDiscards[entry.playerIndex].push(entry.tile);
  }
  const lastDiscardId = state.lastDiscard?.id ?? null;

  // ── Derive claim options for the human player during awaitingClaims ──
  let claimOptions: ClaimOption[] = [];
  if (
    state.phase === 'awaitingClaims' &&
    state.lastDiscard &&
    state.lastDiscardPlayerIndex !== null &&
    state.lastDiscardPlayerIndex !== HUMAN_IDX
  ) {
    const isNextInTurn =
      (state.lastDiscardPlayerIndex + 1) % PLAYER_COUNT === HUMAN_IDX;
    claimOptions = [
      ...getClaimOptions(
        state.lastDiscard,
        human.hand,
        human.declaredMelds,
        isNextInTurn,
      ),
    ];
  }

  // ── Claim timer: countdown during awaitingClaims (pause when human has options) ──
  const humanHasClaimOptions = claimOptions.length > 0;
  useEffect(() => {
    if (state.phase !== 'awaitingClaims') return;
    if (humanHasClaimOptions) return; // pause while human decides

    const id = setInterval(() => {
      setClaimTimer((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [state.phase, humanHasClaimOptions]);

  // ── UI-state helpers ──
  const canDiscard =
    state.phase === 'playerTurn' && state.currentPlayerIndex === HUMAN_IDX;

  const isHumanTurn = canDiscard;

  const selectedTile =
    selectedIndex !== null && selectedIndex < sortedHumanHand.length
      ? sortedHumanHand[selectedIndex]
      : null;

  /** Whether the given player is the active player this turn. */
  const isActive = (pi: number) =>
    state.currentPlayerIndex === pi &&
    (state.phase === 'playerTurn' || state.phase === 'botTurn');

  // ── Action handlers ──

  function handleTileClick(index: number) {
    setSelectedIndex((prev) => (prev === index ? null : index));
  }

  function handleDiscard() {
    if (selectedTile) {
      onAction({
        type: 'DISCARD_TILE',
        playerIndex: HUMAN_IDX,
        tile: selectedTile,
      });
      setSelectedIndex(null);
    }
  }

  function handleClaim(option: ClaimOption) {
    onAction({ type: 'CLAIM_TILE', playerIndex: HUMAN_IDX, option });
  }

  /** Human explicitly declines all claim options — advance to next draw. */
  function handlePass() {
    onAction({ type: 'DRAW_TILE' });
  }

  // ── Render ──

  return (
    <div className="relative h-screen w-full overflow-hidden bg-emerald-900">
      {/* ── Felt texture overlay ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(16,185,129,0.12) 0%, rgba(6,78,59,0.18) 40%, transparent 70%)',
        }}
      />

      {/* ── ScoreBoard: top-right corner ── */}
      <div className="absolute right-4 top-4 z-20">
        <ScoreBoard
          players={state.players}
          lastTaiBreakdown={state.lastTaiBreakdown}
          prevailingWind={state.prevailingWind}
          dealerIndex={state.dealerIndex}
        />
      </div>

      {/* ── Top hand (bot, player 2) + nameplate ── */}
      <div className="absolute left-0 right-0 top-2 z-10 flex flex-col items-center gap-1">
        <div
          className={isActive(2) ? 'animate-pulse' : ''}
          style={
            isActive(2)
              ? { filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.5))' }
              : undefined
          }
        >
          <Hand
            tiles={state.players[2].hand}
            declaredMelds={state.players[2].declaredMelds}
            flowers={state.players[2].flowers}
            isHuman={false}
            selectedIndex={null}
            position="top"
          />
        </div>
        <Nameplate name={PLAYER_NAMES[2]} wind={state.players[2].seatWind} />
      </div>

      {/* ── Left hand (bot, player 3) + nameplate ── */}
      <div className="absolute left-0 top-1/2 z-10 -translate-y-1/2 flex flex-col items-center gap-1">
        <Nameplate name={PLAYER_NAMES[3]} wind={state.players[3].seatWind} />
        <div
          className={isActive(3) ? 'animate-pulse' : ''}
          style={
            isActive(3)
              ? { filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.5))' }
              : undefined
          }
        >
          <Hand
            tiles={state.players[3].hand}
            declaredMelds={state.players[3].declaredMelds}
            flowers={state.players[3].flowers}
            isHuman={false}
            selectedIndex={null}
            position="left"
          />
        </div>
      </div>

      {/* ── Right hand (bot, player 1) + nameplate ── */}
      <div className="absolute right-0 top-1/2 z-10 -translate-y-1/2 flex flex-col items-center gap-1">
        <Nameplate name={PLAYER_NAMES[1]} wind={state.players[1].seatWind} />
        <div
          className={isActive(1) ? 'animate-pulse' : ''}
          style={
            isActive(1)
              ? { filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.5))' }
              : undefined
          }
        >
          <Hand
            tiles={state.players[1].hand}
            declaredMelds={state.players[1].declaredMelds}
            flowers={state.players[1].flowers}
            isHuman={false}
            selectedIndex={null}
            position="right"
          />
        </div>
      </div>

      {/* ── Center play area: discard zones + wind indicator ── */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div
          className="rounded-xl border border-amber-900/30 bg-black/10 p-3"
          style={{ boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)' }}
        >
          <div className="flex flex-col items-center gap-2">
            {/* Top discard zone (player 2) */}
            <div className="min-h-[52px] min-w-[224px]">
              <DiscardPile
                discards={playerDiscards[2]}
                lastDiscardId={lastDiscardId}
                playerPosition="top"
                tenpaiDiscardIds={tenpaiDiscardIds[2]}
              />
            </div>

            {/* Middle row: left discards | center wind | right discards */}
            <div className="flex items-center gap-3">
              <div className="min-h-[52px] min-w-[224px]">
                <DiscardPile
                  discards={playerDiscards[3]}
                  lastDiscardId={lastDiscardId}
                  playerPosition="left"
                  tenpaiDiscardIds={tenpaiDiscardIds[3]}
                />
              </div>

              {/* Center piece: prevailing wind + compass + progress ring */}
              <div className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg border-2 border-amber-700/50 bg-emerald-800 shadow-lg">
                {/* SVG progress ring (visible during awaitingClaims) */}
                <svg
                  className="pointer-events-none absolute inset-0"
                  viewBox="0 0 80 80"
                  width={80}
                  height={80}
                >
                  {/* Background ring track */}
                  <circle
                    cx="40"
                    cy="40"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="rgba(217,119,6,0.15)"
                    strokeWidth="3"
                  />
                  {/* Animated countdown arc */}
                  {state.phase === 'awaitingClaims' && (
                    <circle
                      cx="40"
                      cy="40"
                      r={RING_RADIUS}
                      fill="none"
                      stroke={claimTimer <= 2 ? '#ef4444' : '#d97706'}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={
                        RING_CIRCUMFERENCE *
                        (1 - claimTimer / CLAIM_TIMER_SECONDS)
                      }
                      style={{
                        transition: 'stroke-dashoffset 1s linear, stroke 0.3s',
                        transform: 'rotate(-90deg)',
                        transformOrigin: '40px 40px',
                      }}
                    />
                  )}
                </svg>

                {/* Compass labels: N/S/E/W */}
                <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[10px] leading-none text-amber-600/40">
                  北<span className="text-[8px]">N</span>
                </span>
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[10px] leading-none text-amber-600/40">
                  南<span className="text-[8px]">S</span>
                </span>
                <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[10px] leading-none text-amber-600/40">
                  西<span className="text-[8px]">W</span>
                </span>
                <span className="absolute right-0.5 top-1/2 -translate-y-1/2 text-[10px] leading-none text-amber-600/40">
                  東<span className="text-[8px]">E</span>
                </span>

                {/* Prevailing wind character */}
                <span className="text-2xl font-bold text-amber-400">
                  {WIND_LABEL[state.prevailingWind]}
                </span>

                {/* Timer seconds (visible during awaitingClaims) */}
                {state.phase === 'awaitingClaims' && (
                  <span
                    className={[
                      'absolute bottom-1 right-1 text-[10px] font-bold tabular-nums',
                      claimTimer <= 2
                        ? 'text-red-400'
                        : 'text-amber-400/60',
                    ].join(' ')}
                  >
                    {claimTimer}
                  </span>
                )}
              </div>

              <div className="min-h-[52px] min-w-[224px]">
                <DiscardPile
                  discards={playerDiscards[1]}
                  lastDiscardId={lastDiscardId}
                  playerPosition="right"
                  tenpaiDiscardIds={tenpaiDiscardIds[1]}
                />
              </div>
            </div>

            {/* Bottom discard zone (player 0 / human) */}
            <div className="min-h-[52px] min-w-[224px]">
              <DiscardPile
                discards={playerDiscards[0]}
                lastDiscardId={lastDiscardId}
                playerPosition="bottom"
                tenpaiDiscardIds={tenpaiDiscardIds[0]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom area: "Your Turn" + ActionBar + nameplate + Human hand ── */}
      <div className="absolute bottom-2 left-0 right-0 flex flex-col items-center gap-1.5">
        {isHumanTurn && (
          <span className="animate-pulse text-sm font-bold text-amber-400">
            Your Turn
          </span>
        )}
        <ActionBar
          options={claimOptions}
          onAction={handleClaim}
          onDiscard={handleDiscard}
          onPass={claimOptions.length > 0 ? handlePass : undefined}
          canDiscard={canDiscard}
          selectedTile={selectedTile ?? null}
        />
        <Nameplate name={PLAYER_NAMES[0]} wind={human.seatWind} />
        <div
          style={
            isActive(0)
              ? { filter: 'drop-shadow(0 0 12px rgba(251,191,36,0.6))' }
              : undefined
          }
        >
          <Hand
            tiles={sortedHumanHand}
            declaredMelds={human.declaredMelds}
            flowers={human.flowers}
            isHuman={true}
            selectedIndex={selectedIndex}
            onTileClick={handleTileClick}
            size="lg"
            position="bottom"
          />
        </div>
      </div>
    </div>
  );
}
