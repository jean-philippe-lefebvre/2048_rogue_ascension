'use strict';

const Storage = {
  KEY: '2048rogue_v2',
  RUN_KEY: '2048rogue_run_v2',
  load() {
    try { const s = localStorage.getItem(this.KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  },
  save(data) {
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); return true; }
    catch(e) { console.warn('Save failed:', e); return false; }
  },
  loadRun() {
    try {
      const raw = localStorage.getItem(this.RUN_KEY);
      if (!raw) return null;
      const run = JSON.parse(raw);
      run.hearts ??= 3;
      run.spells = (run.spells ?? [{ id:'smash', charges:2 }])
        .filter(spell => SPELLS.some(def => def.id === spell.id)).slice(0,2)
        .map(spell => ({ id:spell.id, charges:Math.min(3,Math.max(0,spell.charges ?? 0)) }));
      run.seenEvents ??= [];
      run.bossHpMult ??= 1;
      run.relics = (run.relics || []).map(value => RELICS.find(r => r.id === (value?.id || value))).filter(Boolean);
      if (run.battle) {
        run.battle.kinds ??= Board.emptyKinds();
        run.battle.portals ??= [];
        run.battle.iceHits ??= {};
      }
      return run;
    } catch { return null; }
  },
  saveRun(run) {
    try {
      const room = GameState.room;
      const battle = room?.combat && !GameState.roomFinished ? {
        floorIdx:room.floorIdx, rowIdx:room.rowIdx, nodeIdx:room.nodeIdx,
        enemyId:room.enemyDef.id, combat:room.combat, relicState:room.relicState,
        board:GameState.board, kinds:GameState.kinds, portals:GameState.portals,
        iceHits:room.iceHits, obstacleAge:GameState.obstacleAge, bombTimers:GameState.bombTimers,
        score:GameState.score, mergeCount:GameState.mergeCount,
        movesLeft:GameState.movesLeft, movesMax:GameState.movesMax,
        stuck:!!GameState.stuck,
        undo:room.undo || null,
      } : null;
      run.battle = battle;
      localStorage.setItem(this.RUN_KEY, JSON.stringify({ ...run, battle, rngState:Rng._state, relics: run.relics.map(r => r.id) }));
      return true;
    } catch { return false; }
  },
  clearRun() { try { localStorage.removeItem(this.RUN_KEY); } catch {} },
  defaultMeta: () => ({ totalRuns:0, bestFloor:0, totalGold:0, permanentGold:0, upgrades:{}, ascensionLevel:0, settings:{ sound:true } }),
};
