# 2048 Rogue Ascension

A roguelike variant of 2048 with meta-progression, relics, difficulty tiers and a daily challenge. Built as a static vanilla JS game with no framework or build step.

<p align="center">
  <img src="screenshots/title.png" width="280" alt="Title screen" />
  <img src="screenshots/map.png" width="280" alt="Floor map" />
  <img src="screenshots/gameplay-v2.png" width="280" alt="Gameplay" />
</p>

## How to Play

Open `index.html` in a browser. Swipe or use arrow keys / WASD / ZQSD to move tiles.

Each **run** spans 3 floors. Each floor has a branching node map with battles, elite rooms, mystery events, rest stops, a merchant, and one boss drawn from a pool of three. The map reveals the boss before you reach it. Merge tiles to damage enemies before your moves run out. Enemy intents show what happens next and when; three hearts let you survive failed rooms.

## Features

- **Roguelike runs** – 3 floors of connected nodes with branching paths
- **40 relics** – 7 common, 10 rare, 9 epic, 8 legendary, 6 curses. Eight build families increase the weight of related offers by 30%
- **Rule relics** – Expanse gives battle rooms a 5×5 board and four more moves; Trinity changes tiles to 3, 6, 12... while enemies gain 40% HP. Both start with the next battle room. Tile rank counts upward from 2 or 3 as rank 1, so existing relic thresholds follow either series.
- **Hook-based relic system** – adding a relic is a single entry in `constants.js`, no other files to touch
- **Meta-progression** – spend gold on permanent upgrades in the Forge of Fate
- **Difficulty tiers**: A0 to A10 add cumulative rules. Win at tier N to unlock N + 1; upgrades stay purchased. Higher tiers multiply banked gold.
- **Daily challenge**: one local attempt per UTC day, with a shared date seed, rotating character and tier A3. Permanent upgrades are ignored for the challenge.
- **Result card**: share or download a 1080 × 1350 PNG, or copy a short text summary with floor squares.
- **Mystery rooms** – eight events with visible choices, risks, and rewards
- **Special tiles**: gold tiles pay on merges; ice blocks until two adjacent merges thaw it; jokers merge with numbered tiles; ×2 doubles a numbered tile. Obstacles block movement, bombs halve adjacent numbers and destroy jokers or ×2 tiles, and floor III battles place paired portals. Prophet and Herald can freeze numbered tiles. Gold, joker and ×2 are fully implemented; spells can create joker and ×2 tiles.
- **Spells**: two slots and three charges each, or four with Grimoire. Choose Alchemist, Artificer, or Monk to start with their relic and spell at two charges; a consumed move with at least three merges restores one charge to the first non-full spell. Use 1 or 2 to cast a slot. While targeting, arrows or WASD/ZQSD move the cursor, Enter or Space selects, and Escape cancels. A rescue spell can save a board with no legal slide before defeat is finalized.
- **Merchant**: one per floor on row 2 or 3; spend run gold on relics, spells, healing, recharge or curse removal. Remaining run gold is banked at the end.
- **Rest rooms**: choose a relic, heal or meditate to recharge spells.
- **Combat**: enemy HP, combo damage, block, temporary seals, telegraphed intents and boss phases. New boss mechanics include devouring tiles, a one-time revive, gravity, a move clock, board flips, and a moving void
- **Bilingual** – French and English, switchable from the title screen
- **Mobile-first** – touch swipe controls, 440px max width, responsive
- **Sensation** – gem tiles, merge particles, floating values, shake, and screen motion
- **Procedural sound** – pentatonic merge notes and room cues, with a persistent toggle
- **Seeded runs** – reproducible maps and tile spawns; the run seed appears on the end screen
- **Dungeon art direction**: hand-drawn "fine engraving" SVG icons, and a drifting fog backdrop per scene: each floor (Crypts, Sunken Forge, Abyss) and each named boss has its own palette and emblem

## Tech Stack

Vanilla JS, single CSS file, no dependencies:

```
haptics → i18n → icons → rng → constants → storage → state → board → combat → spells → fx → scene → audio → renderer → controller → share → input
```

## Architecture

| File | Role |
|---|---|
| `i18n.js` | Translation system (FR/EN), `I18n.t(key, params)` |
| `rng.js` | Seeded game randomness |
| `constants.js` | Game data: relics, upgrades, enemies, hook runner |
| `storage.js` | localStorage persistence for meta progression and active runs |
| `state.js` | Runtime game state singleton |
| `board.js` | Dynamic 4×4 or 5×5 grid logic, ranked tile values, obstacles and bombs |
| `combat.js` | Pure combat rules: HP, intents, phases, seals and hearts |
| `spells.js` | Pure spell effects, one-move undo, charges and rotation |
| `fx.js` | Canvas particles and DOM feedback |
| `audio.js` | WebAudio effects |
| `renderer.js` | All DOM manipulation, tile pool, map SVG |
| `controller.js` | Game flow: runs, rooms, moves, relics, tiers and daily challenge |
| `share.js` | PNG result card and text sharing |
| `input.js` | Touch, keyboard, button bindings, boot |

Run `npm test` for board and combat checks. Run `npm run balance` for the 300-seed-per-enemy greedy bot report. Use `npm run balance -- --relic expanse` or `--relic trinity` for informative relic reports.

## License

MIT

The board keeps numeric tile values and a parallel `kinds` grid for gold and ice. `Board.applyMove(board, dir, { kinds, iceHits })` moves both and returns merge payouts and a shared movement map for bomb timers. Active battles save room size, number base, kinds, portal cells and ice cracks; older saves resume at 4×4/base 2 with empty defaults.
