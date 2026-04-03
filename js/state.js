'use strict';

const GameState = {
  meta: Storage.defaultMeta(),

  // Run-level state
  run: null,

  // Room-level state
  room: null,
  board: [],
  score: 0,
  mergeCount: 0,
  movesLeft: 0,
  movesMax: 0,
  roomFinished: false,
  overlayMode: null,       // 'success' | 'failure'

  // Relic choice callback
  _relicDone: null,

  getUpgradeLevel(id) { return this.meta.upgrades[id] || 0; },
  hasRelic(id) { return this.run?.relics.some(r => r.id === id); },
};
