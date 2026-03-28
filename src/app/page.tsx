'use client';

import { useEffect, useReducer } from 'react';

import { chooseClaim } from '@/lib/botLogic';
import { gameReducer, initialState } from '@/lib/gameReducer';
import type { ClaimOption } from '@/lib/handAnalyzer';
import { getClaimOptions } from '@/lib/handAnalyzer';

import Board from '@/components/Board';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAYER_COUNT = 4;
const BOT_TURN_DELAY = 600;
const BOT_CLAIM_DELAY = 400;
const NO_CLAIM_DELAY = 300;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // ── Deal on mount ──
  useEffect(() => {
    dispatch({ type: 'DEAL' });
  }, []);

  // ── Flower replacement loop ──
  // Keep dispatching REPLACE_FLOWER while the phase stays 'replacingFlowers'.
  // The reducer cycles through players and transitions out once all are clean.
  useEffect(() => {
    if (state.phase !== 'replacingFlowers') return;

    const id = setTimeout(() => {
      dispatch({ type: 'REPLACE_FLOWER' });
    }, 50);

    return () => clearTimeout(id);
  }, [state.phase, state.currentPlayerIndex, state.players]);

  // ── Bot turn ──
  // When a bot needs to act, give the UI time to render then dispatch.
  useEffect(() => {
    if (state.phase !== 'botTurn') return;

    const id = setTimeout(() => {
      dispatch({ type: 'BOT_TAKE_TURN' });
    }, BOT_TURN_DELAY);

    return () => clearTimeout(id);
  }, [state.phase, state.currentPlayerIndex]);

  // ── Awaiting claims ──
  // Check bots for claims in priority order. If a bot wants to claim,
  // dispatch after a short delay. Otherwise advance via DRAW_TILE.
  useEffect(() => {
    if (state.phase !== 'awaitingClaims') return;
    if (state.lastDiscard === null || state.lastDiscardPlayerIndex === null)
      return;

    const discarderIdx = state.lastDiscardPlayerIndex;

    // Check each non-discarding player in turn order for claims.
    // Priority: hu > kong > pong > chow (handled inside chooseClaim).
    // Among multiple claimers, closer in turn order wins.
    let bestClaim: {
      playerIndex: number;
      option: ClaimOption;
    } | null = null;

    for (let offset = 1; offset < PLAYER_COUNT; offset++) {
      const pi = (discarderIdx + offset) % PLAYER_COUNT;
      const player = state.players[pi];

      // Skip the human — Board handles human claims via ActionBar
      if (player.isHuman) continue;

      const isNextInTurn = (discarderIdx + 1) % PLAYER_COUNT === pi;
      const action = chooseClaim(
        player.hand,
        player.declaredMelds,
        state.lastDiscard,
        isNextInTurn,
      );

      if (action.type === 'claim') {
        // Hu always wins; otherwise first in turn order with a claim wins
        if (!bestClaim || action.option.type === 'hu') {
          bestClaim = { playerIndex: pi, option: action.option };
        }
        // If we already found hu, no need to check further
        if (action.option.type === 'hu') break;
      }
    }

    if (bestClaim) {
      const claim = bestClaim;
      const id = setTimeout(() => {
        dispatch({
          type: 'CLAIM_TILE',
          playerIndex: claim.playerIndex,
          option: claim.option,
        });
      }, BOT_CLAIM_DELAY);
      return () => clearTimeout(id);
    }

    // Check if the human player has any legal claim options — if so, wait
    const humanIdx = state.players.findIndex((p) => p.isHuman);
    if (humanIdx !== -1 && humanIdx !== discarderIdx) {
      const isNextInTurn = (discarderIdx + 1) % PLAYER_COUNT === humanIdx;
      const humanOptions = getClaimOptions(
        state.lastDiscard,
        state.players[humanIdx].hand,
        state.players[humanIdx].declaredMelds,
        isNextInTurn,
      );
      if (humanOptions.length > 0) return;
    }

    // No one claims — advance to next player's draw
    const id = setTimeout(() => {
      dispatch({ type: 'DRAW_TILE' });
    }, NO_CLAIM_DELAY);

    return () => clearTimeout(id);
  }, [state.phase, state.lastDiscard, state.lastDiscardPlayerIndex, state.players]);

  return <Board state={state} onAction={dispatch} />;
}
