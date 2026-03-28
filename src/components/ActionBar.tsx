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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActionBar({
  options,
  onAction,
  onDiscard,
  canDiscard,
  selectedTile,
}: ActionBarProps) {
  const hasAnything = options.length > 0 || canDiscard;
  if (!hasAnything) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-gray-900/80 px-4 py-2 backdrop-blur-sm">
      {/* Claim buttons — only for options present in the array */}
      {CLAIM_ORDER.map((type) => {
        const option = options.find((o) => o.type === type);
        if (!option) return null;

        const isHu = type === 'hu';
        return (
          <button
            key={type}
            onClick={() => onAction(option)}
            className={[
              'rounded-md px-4 py-2 text-sm font-bold transition-colors',
              isHu
                ? 'bg-amber-500 text-white hover:bg-amber-400'
                : 'bg-gray-600 text-gray-100 hover:bg-gray-500',
            ].join(' ')}
          >
            {CLAIM_LABELS[type]}
          </button>
        );
      })}

      {/* Discard button — only when it's the human's turn */}
      {canDiscard && (
        <button
          onClick={onDiscard}
          disabled={selectedTile === null}
          className={[
            'rounded-md px-4 py-2 text-sm font-bold transition-colors',
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
