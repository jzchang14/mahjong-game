'use client';

import { useEffect, useState } from 'react';

import type { ClaimOption } from '@/lib/handAnalyzer';
import { getClaimOptions } from '@/lib/handAnalyzer';
import type { GameAction, GameState } from '@/lib/gameReducer';

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

/**
 * Maps player index to board position.
 * Counter-clockwise from the human's perspective:
 *   0 = bottom (human), 1 = right, 2 = top, 3 = left.
 */
const POSITIONS = ['bottom', 'right', 'top', 'left'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Board({ state, onAction }: BoardProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Reset selection when the phase or active player changes
  useEffect(() => {
    setSelectedIndex(null);
  }, [state.phase, state.currentPlayerIndex]);

  const human = state.players[HUMAN_IDX];

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

  // ── UI-state helpers ──

  const canDiscard =
    state.phase === 'playerTurn' && state.currentPlayerIndex === HUMAN_IDX;

  const selectedTile =
    selectedIndex !== null && selectedIndex < human.hand.length
      ? human.hand[selectedIndex]
      : null;

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

  // ── Render ──

  return (
    <div className="relative h-screen w-full overflow-hidden bg-emerald-900">
      {/* ── ScoreBoard: top-right corner ── */}
      <div className="absolute right-4 top-4 z-20">
        <ScoreBoard
          players={state.players}
          lastTaiBreakdown={state.lastTaiBreakdown}
          prevailingWind={state.prevailingWind}
          dealerIndex={state.dealerIndex}
        />
      </div>

      {/* ── Top hand (bot, player 2) ── */}
      <div className="absolute left-0 right-0 top-4 flex justify-center">
        <Hand
          tiles={state.players[2].hand}
          declaredMelds={state.players[2].declaredMelds}
          flowers={state.players[2].flowers}
          isHuman={false}
          selectedIndex={null}
          position="top"
        />
      </div>

      {/* ── Left hand (bot, player 3) ── */}
      <div className="absolute bottom-0 left-4 top-0 flex items-center">
        <Hand
          tiles={state.players[3].hand}
          declaredMelds={state.players[3].declaredMelds}
          flowers={state.players[3].flowers}
          isHuman={false}
          selectedIndex={null}
          position="left"
        />
      </div>

      {/* ── Right hand (bot, player 1) ── */}
      <div className="absolute bottom-0 right-4 top-0 flex items-center">
        <Hand
          tiles={state.players[1].hand}
          declaredMelds={state.players[1].declaredMelds}
          flowers={state.players[1].flowers}
          isHuman={false}
          selectedIndex={null}
          position="right"
        />
      </div>

      {/* ── Discard pile: dead centre ── */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <DiscardPile discards={[]} lastDiscard={state.lastDiscard} />
      </div>

      {/* ── Bottom area: ActionBar + Human hand ── */}
      <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-2">
        <ActionBar
          options={claimOptions}
          onAction={handleClaim}
          onDiscard={handleDiscard}
          canDiscard={canDiscard}
          selectedTile={selectedTile ?? null}
        />
        <Hand
          tiles={human.hand}
          declaredMelds={human.declaredMelds}
          flowers={human.flowers}
          isHuman={true}
          selectedIndex={selectedIndex}
          onTileClick={handleTileClick}
          position="bottom"
        />
      </div>
    </div>
  );
}
