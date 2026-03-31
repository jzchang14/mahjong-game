'use client';

import type { TaiBreakdown } from '@/lib/taiCalculator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WinScreenProps = {
  /** Index of the winning player (null = exhaustive draw). */
  winnerIndex: number | null;
  /** Display name of each player. */
  playerNames: readonly string[];
  /** Whether the win was self-drawn (自摸) or by discard (放槍). */
  isSelfDraw: boolean;
  /** Tai breakdown for scoring display. */
  taiBreakdown: TaiBreakdown | null;
  /** Called when the player clicks "Next Round". */
  onNextRound: () => void;
  /** Called when the player clicks "New Game". */
  onNewGame: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WinScreen({
  winnerIndex,
  playerNames,
  isSelfDraw,
  taiBreakdown,
  onNextRound,
  onNewGame,
}: WinScreenProps) {
  const isDraw = winnerIndex === null;
  const winnerName = winnerIndex !== null ? playerNames[winnerIndex] : '';

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
    >
      <div
        className="relative flex flex-col items-center rounded-2xl border border-amber-700/50 px-12 py-10"
        style={{
          background: 'linear-gradient(145deg, #1a3a2a 0%, #0d2818 50%, #1a3a2a 100%)',
          boxShadow: '0 0 60px rgba(218, 165, 32, 0.3), inset 0 0 30px rgba(0,0,0,0.5)',
          minWidth: '420px',
        }}
      >
        {isDraw ? (
          <>
            {/* Exhaustive draw */}
            <div className="mb-2 text-5xl font-bold text-amber-400">流局</div>
            <div className="mb-6 text-lg text-amber-200/70">Exhaustive Draw</div>
          </>
        ) : (
          <>
            {/* Win announcement */}
            <div className="mb-1 text-6xl font-bold text-red-500" style={{ textShadow: '0 0 20px rgba(239,68,68,0.5)' }}>
              胡
            </div>
            <div className="mb-4 text-xl text-amber-200/80">Hú</div>

            {/* Win method */}
            <div className="mb-1 text-2xl font-semibold text-amber-300">
              {isSelfDraw ? '自摸 Self-draw' : '放槍 Discard'}
            </div>

            {/* Winner name */}
            <div className="mb-4 text-lg text-amber-100/70">
              {winnerName} wins!
            </div>

            {/* Tai breakdown */}
            {taiBreakdown && taiBreakdown.items.length > 0 && (
              <div
                className="mb-6 w-full rounded-lg border border-amber-900/40 px-5 py-3"
                style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
              >
                <div className="mb-2 text-center text-sm font-medium uppercase tracking-wide text-amber-400/60">
                  Scoring
                </div>
                {taiBreakdown.items.map((item, i) => (
                  <div key={i} className="flex justify-between py-0.5 text-sm">
                    <span className="text-amber-100/80">{item.label}</span>
                    <span className="font-medium text-amber-300">+{item.tai} 台</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t border-amber-700/30 pt-2 text-base font-bold">
                  <span className="text-amber-100">Total</span>
                  <span className="text-amber-300">{taiBreakdown.total} 台</span>
                </div>
              </div>
            )}

            {/* 0-tai (pihu) */}
            {taiBreakdown && taiBreakdown.total === 0 && (
              <div className="mb-6 text-sm text-amber-200/50">
                雞胡 Pihu (0 tai — base rate only)
              </div>
            )}
          </>
        )}

        {/* Action buttons */}
        <div className="flex gap-4">
          <button
            className="rounded-lg border border-amber-600/50 bg-amber-700/40 px-6 py-2.5 text-base font-bold text-amber-100 transition hover:bg-amber-600/50"
            onClick={onNextRound}
          >
            下一局 Next Round
          </button>
          <button
            className="rounded-lg border border-gray-500/40 bg-gray-700/40 px-6 py-2.5 text-base font-medium text-gray-200 transition hover:bg-gray-600/40"
            onClick={onNewGame}
          >
            新遊戲 New Game
          </button>
        </div>
      </div>
    </div>
  );
}
