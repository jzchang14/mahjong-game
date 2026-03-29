'use client';

import type { Tile as TileType } from '@/types';

import Tile from '@/components/Tile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TileSize = 'sm' | 'md' | 'lg';
type Position = 'bottom' | 'top' | 'left' | 'right';

type DiscardPileProps = {
  /** Tiles discarded by a single player. */
  discards: readonly TileType[];
  /** ID of the most recent discard across ALL players (for gold highlight + arrow). */
  lastDiscardId: number | null;
  /** Board position of the player who owns this zone — tiles rotate to face them. */
  playerPosition: Position;
  /** IDs of tiles discarded while tenpai (shown sideways). */
  tenpaiDiscardIds?: ReadonlySet<number>;
  /** Tile render size (default 'md'). */
  tileSize?: TileSize;
  /** Number of grid columns. */
  columns?: number;
  /** Explicit container width in px. */
  width: number;
  /** Explicit container height in px. */
  height: number;
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

/** Tile pixel dimensions — must match Tile.tsx DIMS. */
const TILE_DIMS: Record<TileSize, { w: number; h: number }> = {
  sm: { w: 45, h: 60 },
  md: { w: 60, h: 80 },
  lg: { w: 75, h: 100 },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DiscardPile({
  discards,
  lastDiscardId,
  playerPosition,
  tenpaiDiscardIds,
  tileSize = 'md',
  columns = 4,
  width,
  height,
}: DiscardPileProps) {
  if (discards.length === 0) return null;

  const { w: tileW, h: tileH } = TILE_DIMS[tileSize];
  const baseDeg = ROTATION_DEG[playerPosition];

  // For left/right, the tile face rotates 90°/-90°, swapping its visual dimensions.
  // The outer cell must match those post-rotation visual dimensions so tiles don't
  // overlap or gap: cell becomes tileH wide × tileW tall instead of tileW × tileH.
  const isRotated90 = playerPosition === 'left' || playerPosition === 'right';
  const cellW = isRotated90 ? tileH : tileW;
  const cellH = isRotated90 ? tileW : tileH;

  // Each position fills left→right, top→bottom FROM THAT PLAYER'S PERSPECTIVE.
  // Since each player faces a different direction, the screen-space fill direction
  // is rotated to match:
  //   bottom (0°):   screen left→right, screen top→bottom
  //   top (180°):    screen right→left, screen bottom→top
  //   right (-90°):  screen top→bottom, screen left→right
  //   left (90°):    screen bottom→top, screen right→left
  //
  // "col" = position along the player's primary (left→right) axis.
  // "row" = which row (wraps after `columns` tiles), growing away from center.
  function getPos(index: number): { x: number; y: number } {
    const col = index % columns;
    const row = Math.floor(index / columns);
    switch (playerPosition) {
      case 'bottom':
        // Left→right = +x, next row = +y (away from center = downward)
        return { x: col * cellW, y: row * cellH };
      case 'top':
        // Left→right (from top's view) = -x, next row = -y (away from center = upward)
        return {
          x: (columns - 1 - col) * cellW,
          y: height - cellH - row * cellH,
        };
      case 'right':
        // Left→right (from right's view) = -y (upward on screen), next row = +x (rightward, away from center)
        return { x: row * cellW, y: height - cellH - col * cellH };
      case 'left':
        // Left→right (from left's view) = +y (downward on screen), next row = -x (leftward, away from center)
        return {
          x: width - cellW - row * cellW,
          y: col * cellH,
        };
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        width: `${width}px`,
        height: `${height}px`,
        overflow: 'visible',
      }}
    >
      {discards.map((tile, index) => {
        const { x, y } = getPos(index);
        const isLast = lastDiscardId !== null && tile.id === lastDiscardId;
        // NOTE: tenpai sideways rotation disabled for now — will be added later.
        const rotateDeg = baseDeg;

        return (
          <div
            key={tile.id}
            style={{
              position: 'absolute',
              left: `${x}px`,
              top: `${y}px`,
              width: `${cellW}px`,
              height: `${cellH}px`,
            }}
          >
            {/* Tile face — rotated inside its cell.
                For left/right: the cell is tileH×tileW (swapped), so we absolutely center
                the face (tileW×tileH) and rotate it to fill the cell exactly.
                For top/bottom: the cell is tileW×tileH, face rotates in normal flow. */}
            {isRotated90 ? (
              <div
                className={isLast ? 'animate-pulse' : undefined}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) rotate(${rotateDeg}deg)`,
                  display: 'inline-flex',
                  ...(isLast
                    ? { filter: 'drop-shadow(0 0 8px rgba(218,165,32,0.8))' }
                    : undefined),
                }}
              >
                <Tile tile={tile} size={tileSize} />
              </div>
            ) : (
              <div
                className={isLast ? 'animate-pulse' : undefined}
                style={{
                  display: 'inline-flex',
                  ...(rotateDeg !== 0 ? { transform: `rotate(${rotateDeg}deg)` } : undefined),
                  ...(isLast
                    ? { filter: 'drop-shadow(0 0 8px rgba(218,165,32,0.8))' }
                    : undefined),
                }}
              >
                <Tile tile={tile} size={tileSize} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}