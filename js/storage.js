'use strict';

const Storage = {
  KEY: '2048rogue_v2',
  RUN_KEY: '2048rogue_run_v2',
  load() {
    try {
      const s = localStorage.getItem(this.KEY);
      if (!s) return null;
      const meta = JSON.parse(s);
      if (meta.tierUnlocked === undefined)
        meta.tierUnlocked = Math.min(MAX_TIER, Math.max(0, 3 * (meta.ascension ?? meta.ascensionLevel ?? 0)));
      const oldTier = Math.min(MAX_TIER, Math.max(0, meta.tierUnlocked));
      meta.tiers = { ...meta.tiers, ...Object.fromEntries(CHARACTERS.map(({id}) => [id,
        Math.min(MAX_TIER, Math.max(0, meta.tiers?.[id] ?? (['cartographer','usurer'].includes(id) ? 0 : oldTier)))])) };
      delete meta.tierUnlocked;
      meta.codex ??= { relics:[], enemies:{}, runs:[] };
      meta.codex.relics ??= [];
      meta.codex.enemies ??= {};
      meta.codex.runs = (meta.codex.runs || []).slice(0,20);
      meta.records = { tile:0, hit:0, gold:0, ...meta.records };
      meta.progress = { bombs:0, spells:0, ...meta.progress };
      meta.achievements ??= [];
      meta.dailyStreak ??= {count:0,last:null};
      meta.skins = [...new Set((Array.isArray(meta.skins) ? meta.skins : []).filter(id => ['obsidian','ember','frost'].includes(id)))];
      meta.skin = meta.skins.includes(meta.skin) ? meta.skin : null;
      // Only infer achievements from persisted evidence. Older aggregate counters do not
      // establish which boss, character or tier produced them.
      for (const entry of meta.codex.runs) {
        const facts = [
          {event:'run', win:entry.result === 'victory', hearts:entry.hearts, tier:entry.tier},
          ...(entry.bosses || []).map(floor => ({event:'boss',floor})),
        ];
        for (const def of ACHIEVEMENTS) if (facts.some(fact => achievementMet(def,fact)) && !meta.achievements.includes(def.id)) meta.achievements.push(def.id);
      }
      for (const def of ACHIEVEMENTS) {
        const facts = [
          {event:'record',rank:Math.floor(Math.log2(meta.records.tile || 1))},
          {event:'gold',gold:meta.records.gold},
          {event:'bomb',count:meta.progress.bombs},
          {event:'spell',count:meta.progress.spells},
          ...Object.entries(meta.codex.enemies).filter(([,count]) => count > 0).flatMap(([id]) => {
            const enemy = ENEMIES.find(definition => definition.id === id);
            return enemy ? [{event:'fight'}, ...(enemy.kind === 'boss' ? [{event:'boss',floor:enemy.floor}] : [])] : [];
          }),
        ];
        if (facts.some(fact => achievementMet(def,fact)) && !meta.achievements.includes(def.id)) meta.achievements.push(def.id);
      }
      delete meta.ascension;
      delete meta.ascensionLevel;
      for (const [character,skin] of Object.entries({alchemist:'obsidian',artificer:'ember',monk:'frost'}))
        if (meta.codex.runs.some(run => run.result === 'victory' && !run.daily && run.tier >= 10 && run.character === character) && !meta.skins.includes(skin)) meta.skins.push(skin);
      return meta;
    } catch { return null; }
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
      run.character ??= 'alchemist';
      run.hearts ??= 3;
      run.tier ??= 0;
      if (run.daily) {
        run.dailyRule ??= null;
        run.dailyStreak ??= 1;
      }
      run.stats ??= { biggestTile:0, bestDamage:0, goldEarned:0, floorsCleared:0 };
      run.spells = (run.spells ?? [{ id:'smash', charges:2 }])
        .filter(spell => SPELLS.some(def => def.id === spell.id)).slice(0,2)
        .map(spell => ({ id:spell.id, charges:Math.min((run.relics || []).some(r => (r?.id || r) === 'grimoire') ? 4 : 3,Math.max(0,spell.charges ?? 0)) }));
      run.seenEvents ??= [];
      run.bossHpMult ??= 1;
      (run.floors || []).forEach((floor, i) => {
        const boss = floor?.[floor.length - 1]?.[0];
        if (boss?.type === 'boss') {
          boss.bossId ??= ['jailer','smith','eye','ascendant'][i];
          floor.bossId = boss.bossId;
        }
      });
      run.relics = (run.relics || []).map(value => RELICS.find(r => r.id === (value?.id || value))).filter(Boolean);
      if (run.battle) {
        run.battle.size ??= run.battle.board?.length || GRID_SIZE;
        run.battle.base ??= 2;
        run.battle.kinds ??= Board.emptyKinds(run.battle.size);
        run.battle.portals ??= [];
        run.battle.iceHits ??= {};
        if (run.battle.combat) {
          run.battle.combat.reviveAvailable ??= run.battle.combat.id === 'necromancer' && run.battle.combat.phase === 1;
          run.battle.combat.voidCell ??= null;
        }
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
        size:GameState.size || GameState.board.length, base:GameState.base || 2,
        iceHits:room.iceHits, obstacleAge:GameState.obstacleAge, bombTimers:GameState.bombTimers,
        score:GameState.score, mergeCount:GameState.mergeCount,
        movesLeft:GameState.movesLeft, movesMax:GameState.movesMax,
        clockRemaining:room.combat.id === 'clockmaker' && typeof Controller !== 'undefined'
          ? Controller._clockRemaining : null,
        stuck:!!GameState.stuck,
        undo:room.undo || null,
      } : null;
      run.battle = battle;
      localStorage.setItem(this.RUN_KEY, JSON.stringify({ ...run, battle, rngState:Rng._state, relics: run.relics.map(r => r.id) }));
      return true;
    } catch { return false; }
  },
  clearRun() { try { localStorage.removeItem(this.RUN_KEY); } catch {} },
  defaultMeta: () => ({ totalRuns:0, bestFloor:0, totalGold:0, permanentGold:0, upgrades:{}, tiers:Object.fromEntries(CHARACTERS.map(({id}) => [id,0])), skins:[], skin:null, daily:null, dailyStreak:{count:0,last:null},
    codex:{relics:[],enemies:{},runs:[]}, records:{tile:0,hit:0,gold:0}, progress:{bombs:0,spells:0}, achievements:[], settings:{sound:true,music:true} }),
};
