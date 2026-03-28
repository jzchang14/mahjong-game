'use client';

import type { Tile as TileType } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TileSize = 'sm' | 'md' | 'lg';

type TileProps = {
  tile: TileType;
  faceDown?: boolean;
  selected?: boolean;
  onClick?: () => void;
  size?: TileSize;
};

// ---------------------------------------------------------------------------
// Dimensions — all three sizes share the 3:4 aspect ratio of the viewBox
// ---------------------------------------------------------------------------

const DIMS: Record<TileSize, { w: number; h: number }> = {
  sm: { w: 36, h: 48 },
  md: { w: 48, h: 64 },
  lg: { w: 60, h: 80 },
};

// ---------------------------------------------------------------------------
// Character & colour maps
// ---------------------------------------------------------------------------

const RANK_CHAR: Record<number, string> = {
  1: '一', 2: '二', 3: '三', 4: '四', 5: '五',
  6: '六', 7: '七', 8: '八', 9: '九',
};

const SUIT_COLOR: Record<string, string> = {
  bamboo: '#2E7D32',
  dots: '#C62828',
  characters: '#1565C0',
};

const WIND_CHAR: Record<string, string> = {
  east: '東', south: '南', west: '西', north: '北',
};

const DRAGON_INFO: Record<string, { char: string; color: string }> = {
  red:   { char: '中', color: '#C62828' },
  green: { char: '發', color: '#2E7D32' },
  white: { char: '白', color: '#546E7A' },
};

const FLOWER_INFO: Record<string, { char: string; color: string }> = {
  spring:          { char: '春', color: '#D81B60' },
  summer:          { char: '夏', color: '#E53935' },
  autumn:          { char: '秋', color: '#E65100' },
  winter:          { char: '冬', color: '#1565C0' },
  plum:            { char: '梅', color: '#AD1457' },
  orchid:          { char: '蘭', color: '#7B1FA2' },
  chrysanthemum:   { char: '菊', color: '#BF8C00' },
  'bamboo-flower': { char: '竹', color: '#2E7D32' },
};

const FONT = '"Noto Serif TC", "SimSun", "Hiragino Mincho Pro", serif';

const PETAL_ANGLES = [0, 72, 144, 216, 288];

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

function getAriaLabel(tile: TileType, faceDown: boolean): string {
  if (faceDown) return 'Face-down tile';
  if (tile.kind === 'suit') return `${tile.rank} of ${tile.suit}`;
  if (tile.kind === 'honor') return tile.honor;
  return `${tile.flower} flower`;
}

// ---------------------------------------------------------------------------
// SVG sub-renderers — face-down back
// ---------------------------------------------------------------------------

function TileBack() {
  return (
    <>
      <rect
        x="1" y="1" width="58" height="78" rx="4"
        fill="#1A6B3A" stroke="#145C30" strokeWidth="1"
      />
      {/* Decorative inner frame */}
      <rect
        x="6" y="6" width="48" height="68" rx="2.5"
        fill="none" stroke="#2D9B54" strokeWidth="0.8" opacity="0.5"
      />
      {/* Outer diamond */}
      <path
        d="M30 14 L48 40 L30 66 L12 40 Z"
        fill="none" stroke="#2D9B54" strokeWidth="0.8" opacity="0.4"
      />
      {/* Inner diamond */}
      <path
        d="M30 24 L40 40 L30 56 L20 40 Z"
        fill="#2D9B54" opacity="0.15"
      />
      {/* Corner dots */}
      <circle cx="12" cy="12" r="2" fill="#2D9B54" opacity="0.3" />
      <circle cx="48" cy="12" r="2" fill="#2D9B54" opacity="0.3" />
      <circle cx="12" cy="68" r="2" fill="#2D9B54" opacity="0.3" />
      <circle cx="48" cy="68" r="2" fill="#2D9B54" opacity="0.3" />
    </>
  );
}

// ---------------------------------------------------------------------------
// SVG sub-renderers — suit tile icons
// ---------------------------------------------------------------------------

/** Green bamboo stalk with nodes and two small leaves. */
function BambooIcon() {
  return (
    <g>
      <rect x="27" y="40" width="6" height="26" rx="1.5" fill="#388E3C" />
      <rect x="25" y="49" width="10" height="1.2" rx="0.6" fill="#1B5E20" />
      <rect x="25" y="58" width="10" height="1.2" rx="0.6" fill="#1B5E20" />
      <ellipse
        cx="22" cy="45" rx="5" ry="2"
        transform="rotate(-35 22 45)" fill="#43A047" opacity="0.7"
      />
      <ellipse
        cx="38" cy="55" rx="5" ry="2"
        transform="rotate(35 38 55)" fill="#43A047" opacity="0.7"
      />
    </g>
  );
}

/** Red circle with concentric highlight rings. */
function DotsIcon() {
  return (
    <g>
      <circle cx="30" cy="54" r="10" fill="#E53935" />
      <circle cx="30" cy="54" r="6.5" fill="#EF5350" opacity="0.5" />
      <circle cx="30" cy="54" r="3" fill="#FFCDD2" opacity="0.4" />
    </g>
  );
}

/** The 萬 character rendered in blue. */
function CharsIcon() {
  return (
    <text
      x="30" y="56" textAnchor="middle" dominantBaseline="central"
      fontSize="20" fontWeight="bold" fill="#1565C0" fontFamily={FONT}
    >
      萬
    </text>
  );
}

// ---------------------------------------------------------------------------
// SVG sub-renderers — tile face content
// ---------------------------------------------------------------------------

function SuitContent({ suit, rank }: { suit: string; rank: number }) {
  return (
    <>
      <text
        x="30" y="24" textAnchor="middle" dominantBaseline="central"
        fontSize="24" fontWeight="bold" fill={SUIT_COLOR[suit]} fontFamily={FONT}
      >
        {RANK_CHAR[rank]}
      </text>
      {suit === 'bamboo' && <BambooIcon />}
      {suit === 'dots' && <DotsIcon />}
      {suit === 'characters' && <CharsIcon />}
    </>
  );
}

function HonorContent({ honor }: { honor: string }) {
  if (honor in WIND_CHAR) {
    return (
      <text
        x="30" y="40" textAnchor="middle" dominantBaseline="central"
        fontSize="36" fontWeight="bold" fill="#1A237E" fontFamily={FONT}
      >
        {WIND_CHAR[honor]}
      </text>
    );
  }

  const info = DRAGON_INFO[honor];

  if (honor === 'white') {
    return (
      <>
        {/* Traditional bordered frame for the white dragon */}
        <rect
          x="16" y="18" width="28" height="44" rx="3"
          fill="none" stroke="#90A4AE" strokeWidth="1.5"
        />
        <text
          x="30" y="40" textAnchor="middle" dominantBaseline="central"
          fontSize="28" fill={info.color} fontFamily={FONT}
        >
          {info.char}
        </text>
      </>
    );
  }

  return (
    <text
      x="30" y="40" textAnchor="middle" dominantBaseline="central"
      fontSize="38" fontWeight="bold" fill={info.color} fontFamily={FONT}
    >
      {info.char}
    </text>
  );
}

function FlowerContent({ flower }: { flower: string }) {
  const info = FLOWER_INFO[flower];
  return (
    <>
      {/* Five-petal flower icon */}
      <g transform="translate(30 28)">
        {PETAL_ANGLES.map((angle) => (
          <ellipse
            key={angle}
            cx="0" cy="-8" rx="4" ry="7"
            fill={info.color} opacity="0.6"
            transform={`rotate(${angle})`}
          />
        ))}
        <circle cx="0" cy="0" r="3.5" fill="#FDD835" />
      </g>
      {/* Flower name in Chinese */}
      <text
        x="30" y="62" textAnchor="middle" dominantBaseline="central"
        fontSize="16" fontWeight="bold" fill={info.color} fontFamily={FONT}
      >
        {info.char}
      </text>
    </>
  );
}

function TileContent({ tile }: { tile: TileType }) {
  switch (tile.kind) {
    case 'suit':
      return <SuitContent suit={tile.suit} rank={tile.rank} />;
    case 'honor':
      return <HonorContent honor={tile.honor} />;
    case 'flower':
      return <FlowerContent flower={tile.flower} />;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Tile({
  tile,
  faceDown = false,
  selected = false,
  onClick,
  size = 'md',
}: TileProps) {
  const { w, h } = DIMS[size];
  const interactive = onClick !== undefined;
  const gradId = `tg-${tile.id}`;
  const borderColor = selected ? '#DAA520' : '#C4B998';
  const borderWidth = selected ? 2.5 : 1;

  return (
    <div
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={getAriaLabel(tile, faceDown)}
      className={[
        'inline-block select-none',
        'transition-all duration-150 ease-out',
        interactive ? 'cursor-pointer' : '',
        selected ? '-translate-y-1.5' : '',
        interactive && !selected ? 'hover:-translate-y-0.5' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        filter: selected
          ? 'drop-shadow(0 6px 8px rgba(0,0,0,0.3))'
          : 'drop-shadow(0 2px 3px rgba(0,0,0,0.18))',
      }}
    >
      <svg viewBox="0 0 60 80" width={w} height={h}>
        {faceDown ? (
          <TileBack />
        ) : (
          <>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FEFCF5" />
                <stop offset="100%" stopColor="#F0E6CC" />
              </linearGradient>
            </defs>
            <rect
              x="1" y="1" width="58" height="78" rx="4"
              fill={`url(#${gradId})`}
              stroke={borderColor}
              strokeWidth={borderWidth}
            />
            <TileContent tile={tile} />
          </>
        )}
      </svg>
    </div>
  );
}
