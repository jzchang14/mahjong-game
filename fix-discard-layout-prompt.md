# Fix Remaining Discard Pile Layout Issues

## Context
A previous fix was applied to `DiscardPile.tsx` and `Board.tsx` to adjust discard pile fill directions. Some issues remain. The bottom player's discard pile is correct (reference behavior).

## Remaining Issues

### 1. Board too small — left zone overlaps with top zone
The `PLAY_AREA_SIZE` (currently 600px in `Board.tsx`) is too small. The left and top discard zones physically overlap in the corner region between them.

**Fix:** Increase `PLAY_AREA_SIZE` from 600 to at least 900. You may also need to increase the outer container/viewport sizing to accommodate.

### 2. Left side (player 3) — tiles go VERTICALLY instead of horizontally
In `DiscardPile.tsx`, for the `left` position, the second tile appears BELOW the first tile instead of to the RIGHT of it. Tiles should fill left-to-right in rows (same visual pattern as the bottom player), then wrap to the next row.

**Current code (wrong):**
```ts
case 'left':
  return { x: (columns - 1 - col) * cellW, y: row * cellH };
```

**Fix:** For the left position, tiles should fill left-to-right, top-to-bottom — identical to the bottom position:
```ts
case 'left':
  return { x: col * cellW, y: row * cellH };
```

### 3. Right side (player 1) — tiles go VERTICALLY and start from the right
Same issue as left. The right side should also fill tiles left-to-right in rows, starting from the left edge of the zone. The current code may already be correct (`x: col * cellW, y: row * cellH`) but verify the rendering produces horizontal rows, not vertical columns. Make sure `columns` is set to 3 (not 1) for left/right in Board.tsx.

### 4. Top side (player 2) — tiles start from the RIGHT instead of the LEFT
Tiles should fill left-to-right (from the viewer's perspective on screen), same as bottom. Currently they appear to start on the right side.

**Check:** The getPos for `top` currently does:
```ts
case 'top':
  return { x: col * cellW, y: height - cellH - row * cellH };
```

The `x: col * cellW` should produce left-to-right fill. However, if the container has a CSS transform that flips it, or if there's some other issue causing the reversal, investigate and fix. The y-reversal (bottom-to-top fill) is correct — tiles should start near the center and grow upward.

## Summary of desired behavior for ALL 4 positions

Looking at any discard zone on screen, tiles should:
1. Start at the **top-left corner** of the zone (as seen by the viewer)
2. Fill **left-to-right** in rows
3. Wrap to the **next row below** when a row is full

**Exception for top zone only:** rows should fill bottom-to-top (nearest center first, growing upward away from center), but WITHIN each row, tiles still go left-to-right.

The individual tile faces rotate to face their player (0°, 180°, 90°, -90°), but the GRID FILL DIRECTION should be the same for everyone.

## Files to modify
1. `src/components/Board.tsx` — increase `PLAY_AREA_SIZE` (line 34) from 600 to 900. Check if `OUTER_BORDER_INSET` or any parent container needs adjustment.
2. `src/components/DiscardPile.tsx` — fix `getPos()` for left position. Verify right and top positions produce correct visual layout.

## Do NOT change
- Tile rotation (ROTATION_DEG) — faces must still orient toward their player
- Tile sizes or column counts
- Container dimensions (270×120 for top/bottom, 180×240 for left/right)
- The bottom player's discard pile (it's correct)
