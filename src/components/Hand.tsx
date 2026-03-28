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
// Position-specific rotation (applied to the whole hand container)
// ---------------------------------------------------------------------------

const ROTATION_STYLE: Record<Position, React.CSSProperties | undefined> = {
  bottom: undefined,
  top: { transform: 'rotate(180deg)' },
  left: { transform: 'rotate(90deg)' },
  right: { transform: 'rotate(-90deg)' },
};

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

  return (
    <div className="flex items-end gap-2 mr-3">
      {melds.map((meld, mi) => (
        <div key={mi} className="flex items-end">
          {meld.tiles.map((tile, ti) => (
            <div key={tile.id} className={ti > 0 ? '-ml-1' : ''}>
              <Tile tile={tile} faceDown={meld.concealed} size={tileSize} />
            </div>
          ))}
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

  return (
    <div
      className="inline-flex items-end"
      style={ROTATION_STYLE[position]}
      role="group"
      aria-label={`${position} player hand`}
    >
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
    </div>
  );
}
