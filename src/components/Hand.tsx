'use client';

import type { FlowerTile, Tile as TileType } from '@/types';

import type { Meld } from '@/lib/handAnalyzer';
import Tile from '@/components/Tile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TileSize = 'sm' | 'md' | 'lg';
type Position = 'bottom' | 'left' | 'right' | 'top';

type HandProps = {
  tiles: readonly TileType[];
  declaredMelds: readonly Meld[];
  flowers: readonly FlowerTile[];
  isHuman: boolean;
  selectedIndex: number | null;
  onTileClick?: (index: number) => void;
  size?: TileSize;
  position: Position;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Width of the horizontal row needed for 16 sm tiles + gaps. */
const SM_TILE_W = 36;
const SM_TILE_H = 48;
const MAX_TILES = 16;
const ROW_MIN_WIDTH = MAX_TILES * SM_TILE_W + (MAX_TILES - 1) * 2; // ~606px

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

/** Tile pixel dimensions for each size — must match Tile.tsx DIMS. */
const TILE_DIMS: Record<TileSize, { w: number; h: number }> = {
  sm: { w: 36, h: 48 },
  md: { w: 48, h: 64 },
  lg: { w: 60, h: 80 },
};

/** Declared melds — face-up (unless concealed kong), grouped with slight fan overlap. */
function MeldsSection({
  melds,
  tileSize,
}: {
  melds: readonly Meld[];
  tileSize: TileSize;
}) {
  if (melds.length === 0) return null;

  const dims = TILE_DIMS[tileSize];

  return (
    <div className="flex items-end gap-2 mr-3">
      {melds.map((meld, mi) => (
        <div key={mi} className="flex items-end">
          {meld.tiles.map((tile, ti) => {
            // Rotate the stolen tile (last in array) sideways for exposed melds
            const isStolen = !meld.concealed && ti === meld.tiles.length - 1;

            if (isStolen) {
              return (
                <div
                  key={tile.id}
                  className={ti > 0 ? '-ml-1' : ''}
                  style={{
                    width: `${dims.h}px`,
                    height: `${dims.w}px`,
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%) rotate(90deg)',
                    }}
                  >
                    <Tile tile={tile} size={tileSize} />
                  </div>
                </div>
              );
            }

            return (
              <div key={tile.id} className={ti > 0 ? '-ml-1' : ''}>
                <Tile tile={tile} faceDown={meld.concealed} size={tileSize} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Flower tiles — always face-up, always size sm. */
function FlowersSection({ flowers }: { flowers: readonly FlowerTile[] }) {
  if (flowers.length === 0) return null;

  return (
    <div className="flex items-end gap-0.5 ml-3">
      {flowers.map((flower) => (
        <Tile key={flower.id} tile={flower} size="sm" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Hand({
  tiles,
  declaredMelds,
  flowers,
  isHuman,
  selectedIndex,
  onTileClick,
  size = 'md',
  position,
}: HandProps) {
  const faceDown = !isHuman;
  const tileSize: TileSize = position === 'bottom' ? size : 'sm';

  const handContent = (
    <>
      {/* Declared melds — left side, face-up, grouped with overlap */}
      <MeldsSection melds={declaredMelds} tileSize={tileSize} />

      {/* Hand tiles — center, evenly spaced */}
      <div className="flex items-end gap-0.5">
        {tiles.map((tile, index) => (
          <Tile
            key={tile.id}
            tile={tile}
            faceDown={faceDown}
            selected={isHuman && selectedIndex === index}
            onClick={
              isHuman && onTileClick ? () => onTileClick(index) : undefined
            }
            size={tileSize}
          />
        ))}
      </div>

      {/* Flowers — right side, always sm */}
      <FlowersSection flowers={flowers} />
    </>
  );

  // ── Left / Right: horizontal row in a sized wrapper, rotated ──
  // The wrapper has visual (post-rotation) dimensions so parent layout works.
  if (position === 'left' || position === 'right') {
    const deg = position === 'left' ? 90 : -90;

    return (
      <div
        className="relative"
        style={{ width: `${SM_TILE_H + 8}px`, height: `${ROW_MIN_WIDTH}px` }}
        role="group"
        aria-label={`${position} player hand`}
      >
        <div
          className="absolute left-1/2 top-1/2 inline-flex items-end"
          style={{
            transform: `translate(-50%, -50%) rotate(${deg}deg)`,
            width: 'max-content',
          }}
        >
          {handContent}
        </div>
      </div>
    );
  }

  // ── Top: horizontal row rotated 180° ──
  if (position === 'top') {
    return (
      <div
        className="inline-flex items-end"
        style={{ transform: 'rotate(180deg)' }}
        role="group"
        aria-label="top player hand"
      >
        {handContent}
      </div>
    );
  }

  // ── Bottom (human): no rotation ──
  return (
    <div
      className="inline-flex items-end"
      role="group"
      aria-label="bottom player hand"
    >
      {handContent}
    </div>
  );
}
