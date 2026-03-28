export type Suit = 'bamboo' | 'dots' | 'characters';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Wind = 'east' | 'south' | 'west' | 'north';
export type Dragon = 'red' | 'green' | 'white';
export type FlowerName =
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'winter'
  | 'plum'
  | 'orchid'
  | 'chrysanthemum'
  | 'bamboo-flower';

export type SuitTile = {
  readonly kind: 'suit';
  readonly id: number;
  readonly suit: Suit;
  readonly rank: Rank;
};

export type HonorTile = {
  readonly kind: 'honor';
  readonly id: number;
  readonly honor: Wind | Dragon;
};

export type FlowerTile = {
  readonly kind: 'flower';
  readonly id: number;
  readonly flower: FlowerName;
};

export type Tile = SuitTile | HonorTile | FlowerTile;

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };
