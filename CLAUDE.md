# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

2048 Rogue Ascension — a roguelike variant of 2048 built as a static vanilla JS game (no build tools, no framework, no bundler). French UI. Part of a portfolio project.

## Development

Open `index.html` directly in a browser — no server or build step required. For live reload during development, use any static file server (e.g. `python3 -m http.server`). Validate syntax with `node -c js/<file>.js`.

No tests, no linter, no package.json.

## Architecture

**Single-page app with 7 screens** managed by CSS `.active` class toggling (`showScreen()` in `renderer.js`). Screens: title, map, game (2048 grid), relic choice, end, meta (upgrades shop). Screen refs are cached for performance.

**Script load order matters** (declared in `index.html`):
`constants → storage → state → board → renderer → controller → input`

Each file exposes a global singleton object. Dependencies flow left-to-right.

### Key modules

| File | Role |
|---|---|
| `constants.js` | Game data: room types, objectives, **RelicHooks system**, relic definitions (29 relics), meta-upgrades, ascension costs, rarity weights, boss objectives |
| `storage.js` | localStorage wrapper (key: `2048rogue_v2`). Persists meta-progression (gold, upgrades, stats, ascensionLevel) |
| `state.js` | `GameState` singleton — holds meta, run, room, board, score, moves |
| `board.js` | Board logic: slide/merge rows, place tiles, check objectives. Fires `onTileSpawn` hook in `addRandom()` |
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

**8 hook points**: `onMovesCalc`, `onRoomStart`, `onTileSpawn`, `onAfterMove`, `onGoldCalc`, `onTransmute`, `onMovesExhausted`, `onRoomEnd`, `onRunStart`

Per-room state for 1x/room relics: `GameState.room.relicState = {}`

### Game structure

- **Meta-progression**: permanent gold + upgrades + **ascension system** (3 tiers, resets upgrades, unlocks new passifs). Persisted in localStorage
- **Run**: 3 floors (étages). Each floor has a **Slay-the-Spire-style node map**: 5 rows of 3 connected nodes + 1 boss. Nodes have connections to 1-2 nodes in the next row. Only the current floor is shown
- **Room types**: normal/elite/boss (2048 battle with scaling objectives), rest (relics OR shop choice), mystery (weighted random events including gold, relics, curses, ambush combat)
- **Relics**: 29 total (7 common, 6 rare, 6 epic, 4 legendary, 6 curses). Rarity-weighted drops that scale by floor. Curses only appear via mystery rooms
- **Board**: 4×4 grid. Special tiles use negative values (`TILE.OBSTACLE = -1`, `TILE.BOMB = -2`). Obstacles/bombs scale by floor
- **Difficulty scaling**: objectives, base moves, obstacles all increase per floor. Boss objectives: 128 → 256 → 512

### CSS

Single `style.css` with CSS custom properties (`:root` tokens). Dark theme with gold/red/blue/purple accents. Tile colors are class-based (`t2`, `t4`... `t-obstacle`, `t-bomb`). Curses styled with red border (`.is-curse`). Ascension UI uses purple theme. Mobile-first, max-width 440px.
