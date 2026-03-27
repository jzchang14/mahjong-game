@AGENTS.md
# CLAUDE.md — Taiwan Mahjong Web Game

## Project Overview

Single-player Taiwan Mahjong web game: 1 human vs 3 rule-based bots. Modeled after mahjongo.com's UX but with **corrected traditional Taiwan scoring**. Phase 1 is rule-based bots; Phase 2 adds LLM-powered bot personalities.

---

## Stack & Conventions

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict mode enabled in `tsconfig.json`)
- **Styling**: Tailwind CSS (no component library; custom game UI)
- **State**: `useReducer` for all game state; no external state library
- **Testing**: Jest for all logic modules (`lib/**/*.test.ts`)
- **Package Manager**: pnpm

### File Structure

```
app/                    # Next.js App Router pages
  page.tsx              # Main game page
  layout.tsx            # Root layout
components/
  game/                 # Game UI components (Board, Hand, Discard, etc.)
  ui/                   # Shared UI primitives (Button, Modal, etc.)
lib/
  tiles.ts              # Tile definitions, creation, shuffling
  wall.ts               # Wall building, drawing, dead wall
  hand.ts               # Hand management, sorting, tile grouping
  melds.ts              # Chow/Pong/Kong detection and formation
  winning.ts            # Win detection (5 melds + 1 pair decomposition)
  scoring.ts            # Tai calculation (all scoring patterns)
  payment.ts            # Payment calculation (self-draw vs discard, dealer bonus)
  flowers.ts            # Flower tile handling and replacement
  game-state.ts         # GameState type, reducer, action types
  game-engine.ts        # Turn flow, priority resolution, round lifecycle
  bot-ai.ts             # Rule-based bot decision-making (Phase 1)
  constants.ts          # Game constants (DEAD_WALL_SIZE, etc.)
  utils.ts              # Shared helpers
types/
  index.ts              # All shared type definitions
__tests__/              # Mirror of lib/ with .test.ts files
```

### Coding Standards

- Pure functions for all game logic in `lib/`. No side effects, no DOM, no React.
- Every `lib/*.ts` file gets a corresponding `__tests__/*.test.ts`.
- Types live in `types/index.ts`; logic files import from there.
- Use discriminated unions for tile types, action types, game phases.
- Prefer `readonly` arrays and properties on state objects.
- No `any`. No `as` casts unless absolutely unavoidable (document why).
- Functions that can fail return `Result<T>` (defined in types), never throw.
- Sort imports: node builtins → external → `@/types` → `@/lib` → relative.

---

## Taiwan Mahjong Rules (Authoritative Reference)

These rules are **traditional Taiwan 16-tile Mahjong**. Where mahjongo.com deviates from tradition, we follow tradition.

### Tile Set (144 + 8 = 152 total tiles dealt from)

**Suit tiles (108):** 3 suits × 9 ranks × 4 copies each.
- Bamboo (條/索): 1–9
- Dots (筒/餅): 1–9
- Characters (萬): 1–9

**Honor tiles (28):**
- Winds (4 copies each): East (東), South (南), West (西), North (北)
- Dragons (4 copies each): Red (中), Green (發), White (白)

**Flower tiles (8 unique):**
- Season flowers: Spring (春), Summer (夏), Autumn (秋), Winter (冬)
- Plant flowers: Plum (梅), Orchid (蘭), Chrysanthemum (菊), Bamboo (竹)

Total in wall: 144 tiles (suits + honors + flowers). Dead wall: 16 tiles reserved.

### Deal & Hand Size

- Each player: 16 tiles (dealer gets 17, immediately discards or declares win).
- Win requires: 5 melds + 1 pair (17th tile completes the hand).
- Seven Pairs + Triplet is an alternate winning form.

### Flowers

- When drawn, flowers are immediately revealed and placed face-up, then replaced with a draw from the back of the wall.
- **Every flower = +1 tai**, regardless of seat wind matching. This is the traditional rule; mahjongo.com's seat-matching variant is NOT used.
- Seven flowers: steal the 8th from whoever holds it (+8 tai total for all 8).
- All 8 flowers: +8 tai.

### Claiming Priority

When a tile is discarded, claims are resolved by priority:
1. **Hu (Win)** — highest priority, any player
2. **Kong** — any player (except the discarder)
3. **Pong** — any player (except the discarder)
4. **Chow** — only the player to the **right** of the discarder (i.e., next in turn order; the discarder's "downstream" player)

If multiple players declare Hu on the same discard, the player closest in turn order (counter-clockwise from discarder) wins.

### Kong Rules

- **Exposed Kong (明槓):** Upgrade a melded Pong with the 4th tile from your hand, or claim a discarded 4th tile. Draw replacement from back of wall.
- **Concealed Kong (暗槓):** Declare with 4 identical tiles all in hand. Draw replacement from back of wall. Worth +2 tai.
- **Robbing the Kong:** When a player upgrades a Pong to Kong, another player may declare Hu on that tile. +1 tai bonus.

### Self-Draw vs Discard Win

- **Self-draw (自摸):** Winner draws the winning tile themselves. All 3 opponents pay.
- **Discard win (放槍):** Only the discarder pays.

### Special First-Turn Wins

- **Heavenly Win (天胡):** Dealer wins with starting 17-tile hand. +40 tai.
- **Earthly Win (地胡):** Non-dealer wins on their very first self-draw (no claims made by anyone prior). +40 tai.
- **Blessing of Man (人胡):** Any player wins on the very first discard of the game. +8 tai.

### 0-Tai (Pihu 雞胡)

A winning hand with 0 tai from scoring patterns is legal. It pays at the base rate (台底). This is traditional; some house rules disallow it.

### No Ready Declaration

There is **no tenpai/ready declaration** in Taiwan Mahjong. That mechanic belongs to Japanese Riichi Mahjong.

---

## Tai Scoring Table (Traditional Values)

These are the **traditional** Taiwan Mahjong tai values. Mahjongo.com deflates several of these; we use the correct values.

### Situational Bonuses
| Pattern | Tai | Notes |
|---|---|---|
| Self-draw (自摸) | +1 | |
| Concealed hand (門清) | +1 | No exposed melds (kongs OK if concealed) |
| Concealed + self-draw (門清自摸) | +3 | Replaces the individual +1s (not additive) |
| Each flower tile | +1 | Per flower, regardless of seat |
| Seven flowers steal | +8 | Total for all 8 flowers |
| All 8 flowers | +8 | Total for all 8 flowers |
| Seat wind pong | +1 | Pong/Kong of your seat wind |
| Round wind pong | +1 | Pong/Kong of the prevailing round wind |
| Dragon pong | +1 | Pong/Kong of any dragon |
| Edge wait (邊張) | +1 | Waiting on 3 of 1-2-3 or 7 of 7-8-9 |
| Inside wait (嵌張) | +1 | Waiting on middle tile of a sequence |
| Single wait (單騎) | +1 | Waiting to complete the pair |
| Last tile of its kind | +1 | Winning tile is the 4th copy (others visible) |
| Robbing the Kong (搶槓) | +1 | |
| Win after Kong (槓上開花) | +1 | On top of self-draw bonus |
| Blessing of Man (人胡) | +8 | Win on very first discard of the game |

### Meld-Based Bonuses
| Pattern | Tai | Notes |
|---|---|---|
| Melded Kong | +1 | Per exposed kong |
| Concealed Kong | +2 | Per concealed kong |

### Hand Pattern Bonuses
| Pattern | Tai | Notes |
|---|---|---|
| No Honors (無字) | +1 | No wind or dragon tiles anywhere in hand |
| All Chows (平胡) | +2 | All 5 melds are chows (sequences) |
| Three Concealed Pungs | +2 | Exactly 3 concealed pong/kong melds |
| All Pungs (碰碰胡) | +10 | All 5 melds are pongs/kongs |
| Half Flush (混一色) | +10 | One suit + honors only |
| Little Three Winds | +5 | 3 wind pongs/kongs + 1 wind pair |
| Little Three Dragons (小三元) | +15 | 2 dragon pongs + dragon pair |
| Four Concealed Pungs | +15 | 4 concealed pong/kong melds |
| Big Three Winds | +15 | 3 wind pongs (no wind pair required) |
| Big Three Dragons (大三元) | +30 | 3 dragon pongs/kongs |
| Little Four Winds (小四喜) | +30 | 3 wind pongs + wind pair |
| Seven Pairs + Triplet | +30 | Alternate win form: 7 pairs where one is actually a triplet (20 tiles? — see note) |
| Big Four Winds (大四喜) | +40 | 4 wind pongs/kongs |
| Full Flush (清一色) | +40 | One suit only, no honors |
| Five Concealed Pungs | +40 | All 5 melds concealed pongs/kongs |
| Heavenly Win (天胡) | +40 | Dealer wins on dealt hand |
| Earthly Win (地胡) | +40 | Non-dealer wins on first self-draw |

### Scoring Stacking Rules

- Tai values from **different categories stack** (e.g., All Pungs + Half Flush = 20 tai).
- Within a category, use the **highest applicable** pattern unless explicitly noted as additive.
- Concealed self-draw (+3) **replaces** concealed (+1) and self-draw (+1); it is NOT +1+1+3.
- Flowers always add on top of everything.
- Kong bonuses (melded/concealed) are per-kong and stack with hand patterns.

### Dealer Streak Bonus

```
bonus_tai = 1 + (2 × consecutive_wins)
```

Where `consecutive_wins` is the number of wins in a row by the current dealer (0 on their first win as dealer). This bonus tai is added to the winner's total when the dealer wins consecutively.

### Payment Formula

```
points_per_tai = base_rate  (e.g., 50 points)
台底 (base) = base_rate
total_payment = 台底 + (tai × points_per_tai)
```

- Self-draw: each of 3 opponents pays `total_payment`.
- Discard win: discarder alone pays `total_payment`.

---

## Bot AI (Phase 1 — Rule-Based)

Simple heuristic bot:
1. Evaluate shanten (tiles away from tenpai).
2. Discard: highest shanten-reducing tile; break isolated honors first.
3. Claim: always claim winning tile; claim Pong if it improves hand; claim Chow only if 1-away from tenpai.
4. Kong: declare if hand is already close to winning or flush pattern.
5. No bluffing, no reading opponents' discards (Phase 1).

Phase 2 will add LLM-powered personalities via Anthropic API calls for decision commentary and strategic variation.

---

## Development Workflow

1. **Build logic bottom-up:** tiles → wall → hand → melds → winning → scoring → payment → game-engine.
2. **Test each module in isolation** before integration.
3. **State is immutable:** reducer returns new state objects, never mutates.
4. **UI comes after logic is solid.** Components consume finalized types.
5. **Each PR should touch one module** (lib file + test file + types if needed).

---

## Key Design Decisions

- **Tile identity:** Each tile has a unique `id` (0–143 for main tiles, 144–151 for flowers) so we can track specific physical tiles through the game.
- **Tile representation:** Discriminated union with `kind: 'suit' | 'honor' | 'flower'`.
- **Meld representation:** Tracks source (which tile was claimed, from whom) for scoring.
- **Game state:** Single `GameState` object with all information needed to render and compute.
- **Turn resolution:** Async-like priority queue: after discard, collect all claims, resolve by priority, then execute the winning claim.
- **Randomness:** Seeded PRNG for reproducible games (testing & replay).

---

## Common Pitfalls to Avoid

- ❌ Don't confuse Japanese Riichi rules with Taiwan rules (no riichi, no furiten, no dora, no yaku minimum).
- ❌ Don't match flowers to seats — every flower is +1 tai flat.
- ❌ Don't use mahjongo.com's deflated tai values — use the table above.
- ❌ Don't forget dead wall (16 tiles reserved, never drawn normally).
- ❌ Don't allow Chow from anyone other than the left player (your upstream).
- ❌ Don't make Concealed Self-Draw additive (+1+1+3 = 5). It's +3 total, replacing the individual bonuses.
- ❌ Don't implement Ready/Tenpai declaration — that's Riichi, not Taiwan.