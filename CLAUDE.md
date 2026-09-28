# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

2048 Rogue Ascension – a roguelike variant of 2048 built as a static vanilla JS game (no build tools, no framework, no bundler). French UI. Part of a portfolio project.

## Versioning

**CRITICAL**: After every commit, bump the version in `index.html` (`.version-tag` in the title screen).

- **Fix** (bug fix, cleanup) → bump patch: `v1.0.0` → `v1.0.1`
- **Feature** (new mechanic, new relics, UI change) → bump minor: `v1.0.0` → `v1.1.0`
- **Major** (user-requested big upgrade) → bump major: `v1.0.0` → `v2.0.0`

Current version: **v3.1.0** (`index.html` title screen, bottom)

## Development

Open `index.html` directly in a browser – no server or build step required. For live reload during development, use any static file server (e.g. `python3 -m http.server`). Validate syntax with `node -c js/<file>.js` and run `npm test` for board and map checks.

No linter or dependencies.

## Architecture

**Single-page app with 10 screens** managed by CSS `.active` class toggling (`showScreen()` in `renderer.js`). Screens: title, codex, character choice, map, game (2048 grid), relic choice, merchant, event, end, meta (permanent upgrades). Screen refs are cached for performance.

**Script load order matters** (declared in `index.html`):
`haptics → i18n → icons → rng → constants → storage → state → board → combat → spells → fx → scene → audio → music → renderer → controller → share → input`

Each file exposes a global singleton object. Dependencies flow left-to-right.

### Key modules

| File | Role |
|---|---|
| `haptics.js` | Haptic feedback |
| `i18n.js` | French and English translations |
| `icons.js` | Hand-authored "Gravure fine" SVG icon set (24px grid, 1.5px round stroke, soft fills); icons are ids, never emojis |
| `rng.js` | Seeded mulberry32 random stream for game decisions |
| `constants.js` | Game data: room types, enemies, **RelicHooks system**, relic definitions (41 relics), achievements, unlocks, meta-upgrades, tier requirements, rarity weights |
| `storage.js` | localStorage wrapper (keys: `2048rogue_v2`, `2048rogue_run_v2`). Persists meta-progression, sound, active run and hearts |
| `state.js` | `GameState` singleton – holds meta, run, room, board, score, moves |
| `board.js` | Pure line merge model, kinds and bomb move map, ice thaw, portals, tile placement. Fires `onTileSpawn` in `addRandom()` |
| `combat.js` | Pure enemy HP, damage, intent, seal, status, phase and heart rules |
| `spells.js` | Pure spell effects, validation, snapshots, charges and rotation |
| `fx.js` | Particles, floating merge values, shake, flash, and combo label |
| `scene.js` | "Brume minimaliste" backdrops: one scene per context (title, map per floor, floors I-III, bosses I-III, shop, rest), crossfaded from `showScreen()` |
| `audio.js` | Lazy WebAudio sound effects |
| `music.js` | Procedural floor and room music, driven by screen and boss phase |
| `renderer.js` | All DOM manipulation. Tile geometry cached (`_geoCache`), invalidated on resize/buildGrid. SVG connection lines for map |
| `controller.js` | Game flow orchestrator: run lifecycle, room entry, move processing, relic hook fire points, tiers, daily challenge, mystery events |
| `share.js` | Result card PNG and copied result text |
| `input.js` | Touch swipe, keyboard (arrows + WASD + ZQSD), d-pad buttons, window resize. Button bindings and boot IIFE |

### Relic Hook System

**CRITICAL**: Relics use a hook-based system, NOT flags. Adding a relic = adding an entry in the `RELICS` array in `constants.js` with a `hooks` object. No changes to `controller.js` or `board.js` needed.

```js
// Each relic declares hooks it responds to
{ id:'example', hooks: { onMovesCalc: ctx => { ctx.bonus += 5; } } }
```

`RelicHooks.fire(hookName, ctx)` iterates all owned relics and calls matching hooks. The `ctx` object is mutable – hooks modify it, the caller reads the result. Hooks chain: each relic sees the result of previous relics.

**14 hook points**: `onMovesCalc`, `onRoomStart`, `onTileSpawn` (may set `ctx.kind`), `onAfterMove`, `onMoveCommitted` (after the free-move decision), `onGoldCalc`, `onTransmute`, `onMovesExhausted`, `onRoomEnd`, `onRunStart`, `onEnemyIntent`, `onDamageCalc`, `onBombExplosion`, `onIceThaw`

Every non-curse relic has one or two family tags. Offers that share any tag with an owned relic receive 1.3 times their normal weight. The tags are gold, blast, chain, small, corner, control, tempo, and spell.

Characters: alchemist starts with Magnet and Swap and gets 20% off merchant prices; artificer starts with Catalyst Ring and Catalyst and defuses bombs next to 8+ merges; monk starts with Focus and Pivot and has a +0.35 combo step. Migrated runs without a character count as alchemist and keep their saved spells.

Per-room state for 1x/room relics: `GameState.room.relicState = {}`

### Game structure

- **Meta-progression**: permanent gold and upgrades plus 10 cumulative difficulty tiers. Win tier N to unlock N + 1; upgrades stay purchased. Old ascension saves migrate to tier 3 × old level. Persisted in localStorage.
- **Codex and achievements**: meta saves discovered relics, defeated enemy counts, the latest 20 runs, tile/damage/gold records, 13 achievements, and cumulative bomb/spell progress. Four achievements unlock relics and two unlock characters. Locked relics are excluded from all offer pools.
- **Music**: a separate persisted music toggle controls a procedural WebAudio bed at 0.22 of master gain. `Music.sceneFor()` and `Music.tempoFor()` are pure scene selectors; `showScreen()` and boss phase changes drive 1.2 second crossfades.
- **Daily challenge**: UTC date hashed with FNV-1a, rotating character, tier A3, one local attempt per day. Meta upgrades and start relic upgrades are ignored. Runs can be resumed.
- **Result card**: 1080 × 1350 PNG generated in `share.js`, with native file sharing or download fallback, plus a copied text summary.
- **Run**: 3 floors (étages). Each floor has a **Slay-the-Spire-style node map**: 5 rows of 3 connected nodes + 1 boss. Nodes have connections to 1-2 nodes in the next row. Each floor has a seeded `bossId`, persisted on its boss node because JSON arrays do not serialize custom properties. The map shows its emblem and name. Older runs default to jailer, smith, eye. Only the current floor is shown
- **Room types**: normal/elite/boss (HP combat with telegraphed enemy intents), rest (relic, healing or spell recharge), shop (run gold purchases), mystery (eight choice events)
- **Relics**: 41 total (7 common, 10 rare, 9 epic, 9 legendary, 6 curses). Rarity-weighted drops that scale by floor. Expanse makes the next battle board 5×5 with 4 more moves; Trinity uses the 3, 6, 12... tile series and raises enemy HP by 40%. Curses enter through mystery events and can be removed by the merchant
- **Board**: 4×4 by default, 5×5 with Expanse. `GameState.size` and `GameState.base` belong to the room and are saved with battles and Undo. All numbered tiles follow `base × 2^k`; `Board.rank(value)` maps either series to shared thresholds and colours. Negative values represent obstacles (`-1`), bombs (`-2`), ×2 (`-3`) and jokers (`-4`). `GameState.kinds` is a parallel grid of `null | gold | ice` for numbered tiles. `GameState.portals` stores a cell pair in floor III battle rooms; `room.iceHits` tracks cracks. Bombs halve adjacent numbered tiles without removing their kind, and destroy adjacent jokers and ×2 tiles. Adjacent rank 4+ merges defuse bombs and temporary seals.
- **Spells**: two slots, three charges maximum, starting Smash at two charges. Three merges on a consumed move recharge the first non-full spell. Undo restores the last consumed move of the current room. A stuck battle remains open while Smash, Swap or Undo can rescue it; at zero moves only Undo can rescue. Keyboard targeting uses directional keys, Enter or Space, and Escape.
- **Merchant and events**: one merchant on row 2 or 3 of every floor; offers and active choices survive reload. Event risks are shown before selection. Run gold remaining at the end is banked.
- **Difficulty scaling**: enemy HP, moves, obstacles and intent cadence vary by floor. Each floor draws from three bosses. Glutton devours, Necromancer revives once, Colossus applies gravity, Clockmaker drains moves over time, Mirror flips the board, and Star Eater moves a tile-eating void. Failed rooms cost one of three hearts; bosses restart on a surviving failure.

### CSS

Single `style.css` with CSS custom properties (`:root` tokens). Dark theme with gold/red/blue/purple accents. Tile colors are class-based (`t2`, `t4`... `t-obstacle`, `t-bomb`). Curses styled with red border (`.is-curse`). Tier selection uses the existing gold and purple accents. Mobile-first, max-width 440px.

### Special tile board API

`Board.applyMove(board, dir, { kinds, iceHits, deepForgeChance, ... })` mutates the numeric board and kinds, then returns merges, score, gold payout, `moveMap`, `bombMoves`, spawn, and cracked/thawed cells. Each merge is processed once in movement order. Ice partitions lines and thaws after two adjacent merges. The controller remaps bomb timers, applies portals after merges and before bomb ticks, then resolves enemy intent. `Board.canMove(board, kinds)` and `Combat.hasLegalMove(fight, board, kinds)` share the same line semantics. Legacy v2.0 battle saves default to an empty kinds grid and no portals.
