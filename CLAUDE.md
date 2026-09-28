# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

2048 Rogue Ascension — a roguelike variant of 2048 built as a static vanilla JS game (no build tools, no framework, no bundler). French UI. Part of a portfolio project.

## Versioning

**CRITICAL**: After every commit, bump the version in `index.html` (`.version-tag` in the title screen).

- **Fix** (bug fix, cleanup) → bump patch: `v1.0.0` → `v1.0.1`
- **Feature** (new mechanic, new relics, UI change) → bump minor: `v1.0.0` → `v1.1.0`
- **Major** (user-requested big upgrade) → bump major: `v1.0.0` → `v2.0.0`

Current version: **v2.0.0** (`index.html` title screen, bottom)

## Development

Open `index.html` directly in a browser — no server or build step required. For live reload during development, use any static file server (e.g. `python3 -m http.server`). Validate syntax with `node -c js/<file>.js` and run `npm test` for board and map checks.

No linter or dependencies.

## Architecture

**Single-page app with 7 screens** managed by CSS `.active` class toggling (`showScreen()` in `renderer.js`). Screens: title, map, game (2048 grid), relic choice, end, meta (upgrades shop). Screen refs are cached for performance.

**Script load order matters** (declared in `index.html`):
`haptics → i18n → icons → rng → constants → storage → state → board → combat → fx → scene → audio → renderer → controller → input`

Each file exposes a global singleton object. Dependencies flow left-to-right.

### Key modules

| File | Role |
|---|---|
| `haptics.js` | Haptic feedback |
| `i18n.js` | French and English translations |
| `icons.js` | Hand-authored "Gravure fine" SVG icon set (24px grid, 1.5px round stroke, soft fills); icons are ids, never emojis |
| `rng.js` | Seeded mulberry32 random stream for game decisions |
| `constants.js` | Game data: room types, enemies, **RelicHooks system**, relic definitions (29 relics), meta-upgrades, ascension costs, rarity weights |
| `storage.js` | localStorage wrapper (keys: `2048rogue_v2`, `2048rogue_run_v2`). Persists meta-progression, sound, active run and hearts |
| `state.js` | `GameState` singleton — holds meta, run, room, board, score, moves |
| `board.js` | Board logic: slide/merge rows, place tiles. Fires `onTileSpawn` hook in `addRandom()` |
| `combat.js` | Pure enemy HP, damage, intent, seal, status, phase and heart rules |
| `fx.js` | Particles, floating merge values, shake, flash, and combo label |
| `scene.js` | "Brume minimaliste" backdrops: one scene per context (title, map per floor, floors I-III, bosses I-III, shop, rest), crossfaded from `showScreen()` |
| `audio.js` | Lazy WebAudio sound effects |
| `renderer.js` | All DOM manipulation. Tile geometry cached (`_geoCache`), invalidated on resize/buildGrid. SVG connection lines for map |
| `controller.js` | Game flow orchestrator: run lifecycle, room entry, move processing, relic hook fire points, ascension, mystery events |
| `input.js` | Touch swipe, keyboard (arrows + WASD + ZQSD), d-pad buttons, window resize. Button bindings and boot IIFE |

### Relic Hook System

**CRITICAL**: Relics use a hook-based system, NOT flags. Adding a relic = adding an entry in the `RELICS` array in `constants.js` with a `hooks` object. No changes to `controller.js` or `board.js` needed.

```js
// Each relic declares hooks it responds to
{ id:'example', hooks: { onMovesCalc: ctx => { ctx.bonus += 5; } } }
```

`RelicHooks.fire(hookName, ctx)` iterates all owned relics and calls matching hooks. The `ctx` object is mutable — hooks modify it, the caller reads the result. Hooks chain: each relic sees the result of previous relics.

**10 hook points**: `onMovesCalc`, `onRoomStart`, `onTileSpawn`, `onAfterMove`, `onGoldCalc`, `onTransmute`, `onMovesExhausted`, `onRoomEnd`, `onRunStart`, `onEnemyIntent`

Per-room state for 1x/room relics: `GameState.room.relicState = {}`

### Game structure

- **Meta-progression**: permanent gold + upgrades + **ascension system** (3 tiers, resets upgrades, unlocks new passifs). Persisted in localStorage
- **Run**: 3 floors (étages). Each floor has a **Slay-the-Spire-style node map**: 5 rows of 3 connected nodes + 1 boss. Nodes have connections to 1-2 nodes in the next row. Only the current floor is shown
- **Room types**: normal/elite/boss (HP combat with telegraphed enemy intents), rest (relics, shop or heart healing), mystery (weighted random events including gold, relics, curses, ambush combat)
- **Relics**: 29 total (7 common, 6 rare, 6 epic, 4 legendary, 6 curses). Rarity-weighted drops that scale by floor. Curses only appear via mystery rooms
- **Board**: 4×4 grid. Special tiles use negative values (`TILE.OBSTACLE = -1`, `TILE.BOMB = -2`). Bombs halve adjacent numbered tiles on explosion; adjacent merges ≥16 defuse bombs and break temporary seals. Permanent obstacles are unaffected.
- **Difficulty scaling**: enemy HP, moves, obstacles and intent cadence vary by floor. Failed rooms cost one of three hearts; bosses restart on a surviving failure.

### CSS

Single `style.css` with CSS custom properties (`:root` tokens). Dark theme with gold/red/blue/purple accents. Tile colors are class-based (`t2`, `t4`... `t-obstacle`, `t-bomb`). Curses styled with red border (`.is-curse`). Ascension UI uses purple theme. Mobile-first, max-width 440px.
