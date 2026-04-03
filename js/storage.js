'use strict';

const Storage = {
  KEY: '2048rogue_v2',
  load() {
    try { const s = localStorage.getItem(this.KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  },
  save(data) {
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch {}
  },
  defaultMeta: () => ({ totalRuns:0, bestFloor:0, totalGold:0, permanentGold:0, upgrades:{}, ascensionLevel:0 }),
};
