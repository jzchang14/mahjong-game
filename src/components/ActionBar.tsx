'use client';

import type { Tile as TileType } from '@/types';

import type { ClaimOption } from '@/lib/handAnalyzer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionBarProps = {
  options: ClaimOption[];
  onAction: (option: ClaimOption) => void;
  onDiscard: () => void;
  onPass?: () => void;
  canDiscard: boolean;
  selectedTile: TileType | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Claim types in display order (matches priority: hu > kong > pong > chow). */
const CLAIM_ORDER: readonly ClaimOption['type'][] = [
  'hu',
  'kong',
  'pong',
  'chow',
];

const CLAIM_LABELS: Record<ClaimOption['type'], string> = {
  hu: '胡 Hu',
  kong: '槓 Kong',
  pong: '碰 Pong',
  chow: '吃 Chow',
};

/** Button colors per claim type — inspired by mahjongo.com reference. */
const CLAIM_COLORS: Record<ClaimOption['type'], { bg: string; hover: string }> = {
  hu: { bg: 'bg-red-500', hover: 'hover:bg-red-400' },
  kong: { bg: 'bg-amber-600', hover: 'hover:bg-amber-500' },
  pong: { bg: 'bg-blue-600', hover: 'hover:bg-blue-500' },
  chow: { bg: 'bg-emerald-600', hover: 'hover:bg-emerald-500' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActionBar({
  options,
  onAction,
  onDiscard,
  onPass,
  canDiscard,
  selectedTile,
}: ActionBarProps) {
  const hasAnything = options.length > 0 || canDiscard;
  if (!hasAnything) return null;

  return (
    <div className="flex items-center justify-end gap-3 pr-4">
      {/* Claim buttons — large, colored, matching reference style */}
      {CLAIM_ORDER.map((type) => {
        const option = options.find((o) => o.type === type);
        if (!option) return null;

        const colors = CLAIM_COLORS[type];
        return (
          <button
            key={type}
            onClick={() => onAction(option)}
            className={[
              'rounded-lg px-8 py-3 text-lg font-bold text-white shadow-lg transition-colors',
              colors.bg,
              colors.hover,
            ].join(' ')}
          >
            {CLAIM_LABELS[type]}
          </button>
        );
      })}

      {/* Pass / Skip button — large gray to match reference */}
      {onPass && options.length > 0 && (
        <button
          onClick={onPass}
          className="rounded-lg bg-gray-500 px-8 py-3 text-lg font-bold text-white shadow-lg transition-colors hover:bg-gray-400"
        >
          過 Skip
        </button>
      )}

      {/* Discard button */}
      {canDiscard && (
        <button
          onClick={onDiscard}
          disabled={selectedTile === null}
          className={[
            'rounded-lg px-8 py-3 text-lg font-bold shadow-lg transition-colors',
            selectedTile !== null
              ? 'bg-red-600 text-white hover:bg-red-500'
              : 'cursor-not-allowed bg-gray-700 text-gray-500',
          ].join(' ')}
        >
          打出 Discard
        </button>
      )}
    </div>
  );
}
