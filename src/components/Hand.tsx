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
  /** ID of the tile just drawn — shown separated on the far right with a gap. */
  drawnTileId?: number | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TILES = 16;
const TILE_GAP = 2; // px gap between tiles

/** Tile pixel dimensions for each size — must match Tile.tsx DIMS. */
const TILE_DIMS: Record<TileSize, { w: number; h: number }> = {
  sm: { w: 45, h: 60 },
  md: { w: 60, h: 80 },
  lg: { w: 75, h: 100 },
};

/** Minimum row width to comfortably hold MAX_TILES in a horizontal line. */
function rowMinWidth(size: TileSize): number {
  const { w } = TILE_DIMS[size];
  return MAX_TILES * w + (MAX_TILES - 1) * TILE_GAP;
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

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
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginRight: '48px', marginLeft: '-24px' }}>
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

/** Flower tiles — always face-up, always sm. */
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
  drawnTileId,
}: HandProps) {
  const faceDown = !isHuman;
  // Use the passed size for ALL positions (not forced to sm for bots).
  const tileSize: TileSize = size;

  const minWidth = rowMinWidth(tileSize);
  const dims = TILE_DIMS[tileSize];

  // Separate the drawn tile from the rest of the hand so it appears on the
  // far right with a gap, indicating which tile was just drawn.
  const drawnIndex = drawnTileId != null
    ? tiles.findIndex((t) => t.id === drawnTileId)
    : -1;

  // Tiles excluding the drawn tile (sorted hand)
  const mainTiles = drawnIndex >= 0
    ? [...tiles.slice(0, drawnIndex), ...tiles.slice(drawnIndex + 1)]
    : [...tiles];

  // The drawn tile itself (or null if not found / not applicable)
  const drawnTile = drawnIndex >= 0 ? tiles[drawnIndex] : null;

  const handContent = (
    <>
      {/* Declared melds — left side, face-up, grouped with overlap */}
      <MeldsSection melds={declaredMelds} tileSize={tileSize} />

      {/* Hand tiles — center, evenly spaced */}
      <div className="flex items-end gap-0.5">
        {mainTiles.map((tile, index) => {
          // Map back to original index for selection/click handling
          const origIndex = tiles.indexOf(tile);
          return (
            <Tile
              key={tile.id}
              tile={tile}
              faceDown={faceDown}
              selected={isHuman && selectedIndex === origIndex}
              onClick={
                isHuman && onTileClick ? () => onTileClick(origIndex) : undefined
              }
              size={tileSize}
            />
          );
        })}
      </div>

      {/* Drawn tile — separated with a gap on the far right */}
      {drawnTile && (
        <div className="flex items-end" style={{ marginLeft: '24px' }}>
          <Tile
            key={drawnTile.id}
            tile={drawnTile}
            faceDown={faceDown}
            selected={isHuman && selectedIndex === drawnIndex}
            onClick={
              isHuman && onTileClick ? () => onTileClick(drawnIndex) : undefined
            }
            size={tileSize}
          />
        </div>
      )}

      {/* Flowers — right side, always sm */}
      <FlowersSection flowers={flowers} />
    </>
  );

  // ── Left / Right: full horizontal row in a sized wrapper, rotated ──
  // Wrapper has the POST-rotation visual dimensions so parent layout works.
  if (position === 'left' || position === 'right') {
    const deg = position === 'left' ? 90 : -90;
    // After rotation: width becomes tile height, height becomes row width
    const wrapperW = dims.h + 8;
    const wrapperH = minWidth;

    return (
      <div
        className="relative"
        style={{ width: `${wrapperW}px`, height: `${wrapperH}px` }}
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

  // ── Top: horizontal flex row rotated 180° on the whole wrapper ──
  // flex-direction:row and flex-wrap:nowrap must be set BEFORE rotation.
  if (position === 'top') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'flex-end',
          minWidth: `${minWidth}px`,
          transform: 'rotate(180deg)',
          transformOrigin: 'center center',
        }}
        role="group"
        aria-label="top player hand"
      >
        {handContent}
      </div>
    );
  }

  // ── Bottom (human): horizontal flex row, no rotation ──
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'nowrap',
        alignItems: 'flex-end',
        minWidth: `${minWidth}px`,
      }}
      role="group"
      aria-label="bottom player hand"
    >
      {handContent}
    </div>
  );
}
