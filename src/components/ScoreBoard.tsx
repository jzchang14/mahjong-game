'use client';

import type { Wind } from '@/types';

import type { PlayerState } from '@/lib/gameReducer';
import type { TaiBreakdown } from '@/lib/taiCalculator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScoreBoardProps = {
  players: readonly PlayerState[];
  lastTaiBreakdown: TaiBreakdown | null;
  prevailingWind: Wind;
  dealerIndex: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIND_LABEL: Record<Wind, string> = {
  east: '東',
  south: '南',
  west: '西',
  north: '北',
};

const POSITION_LABELS = ['You', 'Right', 'Top', 'Left'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScoreBoard({
  players,
  lastTaiBreakdown,
  prevailingWind,
  dealerIndex,
}: ScoreBoardProps) {
  return (
    <div className="min-w-48 rounded-lg bg-gray-900/80 p-3 text-white backdrop-blur-sm">
      {/* Prevailing wind */}
      <div className="mb-2 text-xs text-gray-400">
        {WIND_LABEL[prevailingWind]} Wind Round
      </div>

      {/* Player rows */}
      <div className="space-y-1.5">
        {players.map((player, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            {/* Seat wind */}
            <span className="w-5 text-center text-xs font-bold text-amber-400">
              {WIND_LABEL[player.seatWind]}
            </span>

            {/* Position label + dealer indicator */}
            <span className="flex-1">
              {POSITION_LABELS[i]}
              {i === dealerIndex && (
                <span className="ml-1 text-xs text-red-400">莊</span>
              )}
            </span>

            {/* Score */}
            <span className="font-mono font-bold tabular-nums">
              {player.score}
            </span>
          </div>
        ))}
      </div>

      {/* Tai breakdown panel — visible when a round ends with a winner */}
      {lastTaiBreakdown && (
        <div className="mt-3 border-t border-gray-700 pt-3">
          <div className="mb-1.5 text-xs text-gray-400">Tai Breakdown</div>

          {/* Individual items */}
          <div className="space-y-1">
            {lastTaiBreakdown.items.map((item, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-gray-300">{item.label}</span>
                <span className="font-bold text-amber-400">+{item.tai}</span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="mt-2 flex justify-between border-t border-gray-700 pt-2 text-sm font-bold">
            <span>Total</span>
            <span className="text-amber-400">{lastTaiBreakdown.total} tai</span>
          </div>
        </div>
      )}
    </div>
  );
}
