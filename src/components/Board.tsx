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
import WinScreen from '@/components/WinScreen';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BoardProps = {
  state: GameState;
  onAction: (action: GameAction) => void;
};

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const HUMAN_IDX = 0;
const PLAYER_COUNT = 4;

/** Reference resolution the layout is designed for. */
const DESIGN_W = 1920;
const DESIGN_H = 1080;

/** Side length of the square center play area (px). */
const PLAY_AREA_SIZE = 900;

/** Center piece (wind + wall count) dimensions (px). */
const CENTER_SIZE = 280;

/** Gap between center piece edge and discard zone edge (px). */
const CENTER_GAP = 4;

/** Distance from board center to discard zone edge: half the center piece + gap. */
const DISCARD_OFFSET = CENTER_SIZE / 2 + CENTER_GAP; // 144

/** Outer decorative table border inset from viewport edges (px). */
const OUTER_BORDER_INSET = 60;

/** Claim countdown timer duration in seconds. */
const CLAIM_TIMER_SECONDS = 8;

/** SVG progress ring constants (inside CENTER_SIZE). */
const RING_CENTER = CENTER_SIZE / 2; // 140
const RING_RADIUS = 125;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WIND_LABEL: Record<Wind, string> = {
  east: '東',
  south: '南',
  west: '西',
  north: '北',
};

const PLAYER_NAMES = ['You', 'Bot 1', 'Bot 2', 'Bot 3'];

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

function sortTiles(tiles: readonly TileType[]): TileType[] {
  function tileKey(t: TileType): number {
    if (t.kind === 'suit') return SUIT_ORDER[t.suit] * 10 + t.rank;
    if (t.kind === 'honor') return 100 + (HONOR_ORDER[t.honor] ?? 0);
    return 200;
  }
  return [...tiles].sort((a, b) => tileKey(a) - tileKey(b));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Nameplate({ name, wind }: { name: string; wind: Wind }) {
  return (
    <div className="rounded-full bg-gray-900/60 px-3 py-0.5 text-xs font-medium text-gray-300 backdrop-blur-sm">
      <span className="mr-1 font-bold text-amber-400">{WIND_LABEL[wind]}</span>
      {name}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Board({ state, onAction }: BoardProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // ── Discard history ──
  const [discardHistory, setDiscardHistory] = useState<
    { tile: TileType; playerIndex: number }[]
  >([]);
  const prevDiscardIdRef = useRef<number | null>(null);
  const prevMeldCountRef = useRef<number>(0);

  // ── Tenpai discard tracking ──
  const [tenpaiDiscardIds, setTenpaiDiscardIds] = useState<
    [Set<number>, Set<number>, Set<number>, Set<number>]
  >([new Set(), new Set(), new Set(), new Set()]);

  // ── Persistent last-discard arrow ID ──
  // Does NOT reset when phase changes — only updates on next actual discard.
  const [stableLastDiscardId, setStableLastDiscardId] = useState<number | null>(null);

  // ── Claim countdown timer ──
  const [claimTimer, setClaimTimer] = useState(CLAIM_TIMER_SECONDS);

  // ── Viewport size for SVG lane markings ──
  const [vpW, setVpW] = useState(0);
  const [vpH, setVpH] = useState(0);
  useEffect(() => {
    const update = () => {
      setVpW(window.innerWidth);
      setVpH(window.innerHeight);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ── Responsive scale factor ──
  // The board layout is designed for DESIGN_W × DESIGN_H. On smaller screens
  // we uniformly scale the entire board down so everything fits.
  const boardScale = vpW > 0 && vpH > 0
    ? Math.min(vpW / DESIGN_W, vpH / DESIGN_H, 1)
    : 1;

  const human = state.players[HUMAN_IDX];

  // ── Auto-sorted human hand ──
  const sortedHumanHand = useMemo(() => sortTiles(human.hand), [human.hand]);

  // Reset selection on phase / player / hand change
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

    if (currId !== null && currId !== prevDiscardIdRef.current) {
      const pi = state.lastDiscardPlayerIndex!;
      const discardTile = state.lastDiscard!;

      setDiscardHistory((prev) => [
        ...prev,
        { tile: discardTile, playerIndex: pi },
      ]);

      // Persist for arrow (never clears on phase change — only on next discard)
      setStableLastDiscardId(currId);

      // Tenpai check
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

    // Claimed tile — remove last history entry
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

  // Clear all per-round state on new round
  useEffect(() => {
    if (state.phase === 'dealing') {
      setDiscardHistory([]);
      prevDiscardIdRef.current = null;
      prevMeldCountRef.current = 0;
      setTenpaiDiscardIds([new Set(), new Set(), new Set(), new Set()]);
      setStableLastDiscardId(null);
    }
  }, [state.phase]);

  // Claim timer: reset on new discard
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

  // ── Claim options for human ──
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

  // Claim timer countdown (pauses while human has options)
  const humanHasClaimOptions = claimOptions.length > 0;
  useEffect(() => {
    if (state.phase !== 'awaitingClaims') return;
    if (humanHasClaimOptions) return;

    const id = setInterval(() => {
      setClaimTimer((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [state.phase, humanHasClaimOptions]);

  // ── UI helpers ──
  const canDiscard =
    state.phase === 'playerTurn' && state.currentPlayerIndex === HUMAN_IDX;
  const isHumanTurn = canDiscard;

  const selectedTile =
    selectedIndex !== null && selectedIndex < sortedHumanHand.length
      ? sortedHumanHand[selectedIndex]
      : null;

  const isActive = (pi: number) =>
    state.currentPlayerIndex === pi &&
    (state.phase === 'playerTurn' || state.phase === 'botTurn');


  // ── SVG lane markings — derived from viewport + play area geometry ──
  const half = PLAY_AREA_SIZE / 2;
  const cx = DESIGN_W / 2;
  const cy = DESIGN_H / 2;
  const sqLeft = cx - half;
  const sqTop = cy - half;
  const sqRight = cx + half;
  const sqBottom = cy + half;

  // ── Action handlers ──

  function handleTileClick(index: number) {
    setSelectedIndex((prev) => (prev === index ? null : index));
  }

  function handleDiscard() {
    if (selectedTile) {
      onAction({ type: 'DISCARD_TILE', playerIndex: HUMAN_IDX, tile: selectedTile });
      setSelectedIndex(null);
    }
  }

  function handleClaim(option: ClaimOption) {
    onAction({ type: 'CLAIM_TILE', playerIndex: HUMAN_IDX, option });
  }

  function handlePass() {
    onAction({ type: 'DRAW_TILE' });
  }

  // ── Render ──

  return (
    <div className="relative flex h-screen w-full items-start justify-center overflow-hidden bg-emerald-900">
      {/* ── Scaled board wrapper ── */}
      <div
        style={{
          width: `${DESIGN_W}px`,
          height: `${DESIGN_H}px`,
          transform: `scale(${boardScale})`,
          transformOrigin: 'top center',
          position: 'relative',
          flexShrink: 0,
        }}
      >
      {/* ── Felt texture overlay ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(16,185,129,0.12) 0%, rgba(6,78,59,0.18) 40%, transparent 70%)',
        }}
      />

      {/* ── SVG lane markings overlay ── */}
      {boardScale > 0 && (
        <svg
          className="pointer-events-none absolute inset-0"
          width="100%"
          height="100%"
        >
          {/* Outer decorative table border */}
          <rect
            x={OUTER_BORDER_INSET}
            y={OUTER_BORDER_INSET}
            width={DESIGN_W - 2 * OUTER_BORDER_INSET}
            height={DESIGN_H - 2 * OUTER_BORDER_INSET}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
            rx="3"
          />

          {/* 4 diagonal lines: play area corners → viewport corners */}
          <line x1={0}    y1={0}    x2={sqLeft}  y2={sqTop}    stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <line x1={DESIGN_W} y1={0}         x2={sqRight} y2={sqTop}    stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <line x1={0}       y1={DESIGN_H}  x2={sqLeft}  y2={sqBottom} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <line x1={DESIGN_W} y1={DESIGN_H} x2={sqRight} y2={sqBottom} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

          {/* 4 edges of the center square — slightly brighter */}
          <rect
            x={sqLeft}
            y={sqTop}
            width={PLAY_AREA_SIZE}
            height={PLAY_AREA_SIZE}
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1.5"
          />
        </svg>
      )}

      {/* ── ScoreBoard ── */}
      <div className="absolute right-4 top-4 z-20">
        <ScoreBoard
          players={state.players}
          lastTaiBreakdown={state.lastTaiBreakdown}
          prevailingWind={state.prevailingWind}
          dealerIndex={state.dealerIndex}
        />
      </div>

      {/* ── Top hand (bot, player 2) ── */}
      <div
        className="absolute top-2 z-10 flex flex-col items-center gap-1"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      >
        <div
          className={isActive(2) ? 'animate-pulse' : ''}
          style={isActive(2) ? { filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.5))' } : undefined}
        >
          <Hand
            tiles={state.players[2].hand}
            declaredMelds={state.players[2].declaredMelds}
            flowers={state.players[2].flowers}
            isHuman={false}
            selectedIndex={null}
            size="md"
            position="top"
            drawnTileId={state.phase === 'botTurn' && state.currentPlayerIndex === 2 ? state.lastDrawnTile?.id ?? null : null}
          />
        </div>
        <Nameplate name={PLAYER_NAMES[2]} wind={state.players[2].seatWind} />
      </div>

      {/* ── Left hand (bot, player 3) ── */}
      <div className="absolute left-0 top-1/2 z-10 -translate-y-1/2 flex flex-col items-center gap-1">
        <Nameplate name={PLAYER_NAMES[3]} wind={state.players[3].seatWind} />
        <div
          className={isActive(3) ? 'animate-pulse' : ''}
          style={isActive(3) ? { filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.5))' } : undefined}
        >
          <Hand
            tiles={state.players[3].hand}
            declaredMelds={state.players[3].declaredMelds}
            flowers={state.players[3].flowers}
            isHuman={false}
            selectedIndex={null}
            size="md"
            position="left"
            drawnTileId={state.phase === 'botTurn' && state.currentPlayerIndex === 3 ? state.lastDrawnTile?.id ?? null : null}
          />
        </div>
      </div>

      {/* ── Right hand (bot, player 1) ── */}
      <div className="absolute right-0 top-1/2 z-10 -translate-y-1/2 flex flex-col items-center gap-1">
        <Nameplate name={PLAYER_NAMES[1]} wind={state.players[1].seatWind} />
        <div
          className={isActive(1) ? 'animate-pulse' : ''}
          style={isActive(1) ? { filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.5))' } : undefined}
        >
          <Hand
            tiles={state.players[1].hand}
            declaredMelds={state.players[1].declaredMelds}
            flowers={state.players[1].flowers}
            isHuman={false}
            selectedIndex={null}
            size="md"
            position="right"
            drawnTileId={state.phase === 'botTurn' && state.currentPlayerIndex === 1 ? state.lastDrawnTile?.id ?? null : null}
          />
        </div>
      </div>

      {/* ── Center play area: 500×500 square ── */}
      <div
        className="absolute z-10"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: PLAY_AREA_SIZE,
          height: PLAY_AREA_SIZE,
        }}
      >
        {/* Styled square background */}
        <div
          className="absolute inset-0 rounded-xl border border-amber-900/30 bg-black/10"
          style={{ boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)' }}
        />

        {/* Inner content (relative for absolute children) */}
        <div className="relative w-full h-full">
          {/* Top discard zone (player 2) — bottom edge adjacent to center piece, h-centered */}
          <div
            className="absolute"
            style={{ position: 'absolute', bottom: `calc(50% + ${DISCARD_OFFSET}px)`, left: '50%', transform: 'translateX(-50%)' }}
          >
            <DiscardPile
              discards={playerDiscards[2]}
              lastDiscardId={stableLastDiscardId}
              playerPosition="top"
              tenpaiDiscardIds={tenpaiDiscardIds[2]}
              tileSize="sm"
              columns={6}
              width={270}
              height={120}
            />
          </div>

          {/* Bottom discard zone (player 0) — top edge adjacent to center piece, h-centered */}
          <div
            className="absolute"
            style={{ position: 'absolute', top: `calc(50% + ${DISCARD_OFFSET}px)`, left: '50%', transform: 'translateX(-50%)' }}
          >
            <DiscardPile
              discards={playerDiscards[0]}
              lastDiscardId={stableLastDiscardId}
              playerPosition="bottom"
              tenpaiDiscardIds={tenpaiDiscardIds[0]}
              tileSize="sm"
              columns={6}
              width={270}
              height={120}
            />
          </div>

          {/* Left discard zone (player 3) — right edge adjacent to center piece, v-centered.
              6 tiles per "row" (bottom→top from left player's POV), rows wrap leftward. */}
          <div
            className="absolute"
            style={{ position: 'absolute', right: `calc(50% + ${DISCARD_OFFSET}px)`, top: '50%', transform: 'translateY(-50%)' }}
          >
            <DiscardPile
              discards={playerDiscards[3]}
              lastDiscardId={stableLastDiscardId}
              playerPosition="left"
              tenpaiDiscardIds={tenpaiDiscardIds[3]}
              tileSize="sm"
              columns={6}
              width={180}
              height={270}
            />
          </div>

          {/* Right discard zone (player 1) — left edge adjacent to center piece, v-centered.
              6 tiles per "row" (top→bottom from right player's POV), rows wrap rightward. */}
          <div
            className="absolute"
            style={{ position: 'absolute', left: `calc(50% + ${DISCARD_OFFSET}px)`, top: '50%', transform: 'translateY(-50%)' }}
          >
            <DiscardPile
              discards={playerDiscards[1]}
              lastDiscardId={stableLastDiscardId}
              playerPosition="right"
              tenpaiDiscardIds={tenpaiDiscardIds[1]}
              tileSize="sm"
              columns={6}
              width={180}
              height={270}
            />
          </div>

          {/* Center piece — absolutely centered, highest z-index in this area */}
          <div
            className="absolute rounded-lg border-2 border-amber-700/50 bg-emerald-800 shadow-lg flex flex-col items-center justify-center"
            style={{
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: CENTER_SIZE,
              height: CENTER_SIZE,
              zIndex: 10,
            }}
          >
            {/* SVG progress ring */}
            <svg
              className="pointer-events-none absolute inset-0"
              viewBox={`0 0 ${CENTER_SIZE} ${CENTER_SIZE}`}
              width={CENTER_SIZE}
              height={CENTER_SIZE}
            >
              <circle
                cx={RING_CENTER}
                cy={RING_CENTER}
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(217,119,6,0.15)"
                strokeWidth="4"
              />
              {state.phase === 'awaitingClaims' && (
                <circle
                  cx={RING_CENTER}
                  cy={RING_CENTER}
                  r={RING_RADIUS}
                  fill="none"
                  stroke={claimTimer <= 2 ? '#ef4444' : '#d97706'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={
                    RING_CIRCUMFERENCE * (1 - claimTimer / CLAIM_TIMER_SECONDS)
                  }
                  style={{
                    transition: 'stroke-dashoffset 1s linear, stroke 0.3s',
                    transform: `rotate(-90deg)`,
                    transformOrigin: `${RING_CENTER}px ${RING_CENTER}px`,
                  }}
                />
              )}
            </svg>

            {/* Compass labels */}
            <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[10px] leading-none text-amber-600/35 select-none">
              北<span className="text-[8px]">N</span>
            </span>
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] leading-none text-amber-600/35 select-none">
              南<span className="text-[8px]">S</span>
            </span>
            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] leading-none text-amber-600/35 select-none">
              西<span className="text-[8px]">W</span>
            </span>
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] leading-none text-amber-600/35 select-none">
              東<span className="text-[8px]">E</span>
            </span>

            {/* Prevailing wind */}
            <span className="text-base font-bold text-amber-500/70 leading-none mb-1 select-none">
              {WIND_LABEL[state.prevailingWind]}
            </span>

            {/* Live wall count */}
            <span
              className="font-bold tabular-nums leading-none select-none"
              style={{
                fontSize: '52px',
                color: state.liveWall.length <= 4 ? '#ef4444' : '#fff',
              }}
            >
              {state.liveWall.length}
            </span>

            {/* Label */}
            <span className="mt-1 text-[11px] text-amber-200/40 leading-none select-none">
              tiles left · 剩餘
            </span>
          </div>
        </div>
      </div>

      {/* ── Bottom area: ActionBar + nameplate + Human hand ── */}
      <div className="absolute bottom-2 left-0 right-0 flex flex-col items-center gap-1.5">
        {isHumanTurn && (
          <span className="animate-pulse text-sm font-bold text-amber-400">
            Your Turn
          </span>
        )}
        {/* ActionBar: positioned slightly right of center, above the hand (like reference) */}
        <div className="w-full max-w-2xl">
          <ActionBar
            options={claimOptions}
            onAction={handleClaim}
            onDiscard={handleDiscard}
            onPass={claimOptions.length > 0 ? handlePass : undefined}
            canDiscard={canDiscard}
            selectedTile={selectedTile ?? null}
          />
        </div>
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
            drawnTileId={state.phase === 'playerTurn' && state.currentPlayerIndex === HUMAN_IDX ? state.lastDrawnTile?.id ?? null : null}
          />
        </div>
      </div>

      {/* ── Win / Draw overlay ── */}
      {state.phase === 'roundOver' && (
        <WinScreen
          winnerIndex={state.winner}
          playerNames={PLAYER_NAMES}
          isSelfDraw={state.lastDiscardPlayerIndex === null}
          taiBreakdown={state.lastTaiBreakdown}
          onNextRound={() => onAction({ type: 'NEXT_ROUND' })}
          onNewGame={() => onAction({ type: 'RESET_GAME' })}
        />
      )}
      </div>{/* end scaled board wrapper */}
    </div>
  );
}
