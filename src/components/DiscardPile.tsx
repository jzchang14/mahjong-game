'use client';

import type { Tile as TileType } from '@/types';

import Tile from '@/components/Tile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DiscardPileProps = {
  /** Tiles discarded by a single player. */
  discards: readonly TileType[];
  /** ID of the most recent discard across ALL players (for gold highlight). */
  lastDiscardId: number | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders one player's discard zone as a small 6-column grid.
 * The most recent discard (across all players) gets a gold pulse highlight.
 */
export default function DiscardPile({
  discards,
  lastDiscardId,
}: DiscardPileProps) {
  if (discards.length === 0) return null;

  return (
    <div className="grid grid-cols-6 gap-0.5">
      {discards.map((tile) => {
        const isLast = lastDiscardId !== null && tile.id === lastDiscardId;

        return (
          <div
            key={tile.id}
            className={isLast ? '-translate-y-1 animate-pulse' : ''}
            style={
              isLast
                ? {
                    filter:
                      'drop-shadow(0 0 8px rgba(218, 165, 32, 0.7))',
                  }
                : undefined
            }
          >
            <Tile tile={tile} size="sm" />
          </div>
        );
      })}
    </div>
  );
}
