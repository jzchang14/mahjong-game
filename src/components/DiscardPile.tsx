'use client';

import type { Tile as TileType } from '@/types';

import Tile from '@/components/Tile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Position = 'bottom' | 'top' | 'left' | 'right';

type DiscardPileProps = {
  /** Tiles discarded by a single player. */
  discards: readonly TileType[];
  /** ID of the most recent discard across ALL players (for gold highlight). */
  lastDiscardId: number | null;
  /** Board position of the player who owns this zone — tiles rotate to face them. */
  playerPosition: Position;
  /** IDs of tiles discarded while tenpai (shown sideways). */
  tenpaiDiscardIds?: ReadonlySet<number>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Per-tile rotation so discards face their owner's direction. */
const ROTATION_DEG: Record<Position, number> = {
  bottom: 0,
  top: 180,
  left: 90,
  right: -90,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders one player's discard zone as a small 6-column grid.
 * Each tile is individually rotated to face the owning player.
 * The most recent discard (across all players) gets a gold pulse highlight.
 */
export default function DiscardPile({
  discards,
  lastDiscardId,
  playerPosition,
  tenpaiDiscardIds,
}: DiscardPileProps) {
  if (discards.length === 0) return null;

  const deg = ROTATION_DEG[playerPosition];

  return (
    <div className="grid grid-cols-6 gap-0.5">
      {discards.map((tile) => {
        const isLast = lastDiscardId !== null && tile.id === lastDiscardId;
        const isTenpai = tenpaiDiscardIds?.has(tile.id) ?? false;

        // Build transform: zone rotation + sideways for tenpai + lift for last
        const transforms: string[] = [];
        if (deg !== 0) transforms.push(`rotate(${deg}deg)`);
        if (isTenpai) transforms.push('rotate(90deg)');
        if (isLast) transforms.push('translateY(-4px)');
        const transform =
          transforms.length > 0 ? transforms.join(' ') : undefined;

        return (
          <div
            key={tile.id}
            className={isLast ? 'animate-pulse' : ''}
            style={{
              ...(transform ? { transform } : undefined),
              ...(isLast
                ? {
                    filter:
                      'drop-shadow(0 0 8px rgba(218, 165, 32, 0.7))',
                  }
                : undefined),
            }}
          >
            <Tile tile={tile} size="sm" />
          </div>
        );
      })}
    </div>
  );
}
