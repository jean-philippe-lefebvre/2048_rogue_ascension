'use strict';

const Controller = {

  // ── Run ──
  startRun() {
    const m = GameState.meta;
    const seed = new Uint32Array(1);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(seed);
    else seed[0] = (Date.now() ^ Math.floor(Rng.next() * 0x100000000)) >>> 0;
    Rng.seed(seed[0]);
    GameState._shopReturnToMap = false;
    GameState.room = null;
    GameState.roomFinished = false;
    GameState._restDone = null;
    GameState._relicDone = null;
    RelicHooks.invalidate();
    GameState.run = {
      seed: Rng.getSeed(),
      gold: 0,
      hearts: 3,
      totalScore: 0,
      relics: [],
      lastTileVal: 0,
      floorIdx: 0,
      singularityReady: !!(m.upgrades.singularity),
      floors: this._generateFloors(),
    };

    if (m.upgrades.startRelic) {
      const commons = RELICS.filter(r => r.rarity === 'common');
      this._grantRelic(commons[Rng.int(commons.length)]);
    }

    m.totalRuns++;
    Storage.save(m);
    Storage.saveRun(GameState.run);

    // Destiny upgrade: offer a rare relic at start
    if (m.upgrades.destiny) {
      const rares = RELICS.filter(r => r.rarity === 'rare' || r.rarity === 'epic');
      this._offerRelics(2, () => { Renderer.renderMap(); showScreen('mapScreen'); }, rares, 'destiny');
    } else {
      Renderer.renderMap();
      showScreen('mapScreen');
    }
  },

  resumeRun() {
    const run = GameState.run;
    if (!run) return;
    if ((run.hearts ?? 3) <= 0) { this._endRun(false); return; }
    if (run.pendingRelic) {
      const pending = run.pendingRelic;
      const choices = pending.ids.map(id => RELICS.find(r => r.id === id)).filter(Boolean);
      GameState._relicDone = pending.reason === 'battle'
        ? () => this._finishBattleReward()
        : () => { Renderer.renderMap(); showScreen('mapScreen'); };
      document.getElementById('relicGoldInfo').textContent = '';
      document.getElementById('btnSkipRelic').style.display = '';
      Renderer.renderRelicChoice(choices);
      showScreen('relicScreen');
      return;
    }
    if (run.pendingReward) { this._showBattleReward(); return; }
    if (run.pendingRest) {
      const choices = run.pendingRest.map(id => RELICS.find(r => r.id === id)).filter(Boolean);
      GameState._restDone = () => { delete run.pendingRest; Storage.saveRun(run); Renderer.renderMap(); showScreen('mapScreen'); };
      Renderer.renderRestChoice(choices);
      showScreen('relicScreen');
      return;
    }
    if (run.battle) {
      const saved = run.battle;
      const data = run.floors[saved.floorIdx]?.[saved.rowIdx]?.[saved.nodeIdx];
      const enemyDef = ENEMIES.find(e => e.id === saved.enemyId);
      if (data && enemyDef) {
        GameState.room = { floorIdx:saved.floorIdx, rowIdx:saved.rowIdx, nodeIdx:saved.nodeIdx,
          data, enemyDef, combat:saved.combat, relicState:saved.relicState || {} };
        GameState.board = saved.board;
        GameState.obstacleAge = saved.obstacleAge || {};
        GameState.bombTimers = saved.bombTimers || {};
        GameState.score = saved.score;
        GameState.mergeCount = saved.mergeCount;
        GameState.movesLeft = saved.movesLeft;
        GameState.movesMax = saved.movesMax;
        GameState.roomFinished = false;
        const type = enemyDef.kind, def = ROOM_DEFS[type];
        const roomLabel = type === 'boss' ? I18n.t('boss.name.' + saved.floorIdx) : I18n.t('room.' + type);
        document.getElementById('roomName').innerHTML = `<span style="color:${def.color}">${Icons.svg(def.icon)}</span> ${roomLabel}`;
        Renderer.hideRoomOverlay(); Renderer.renderEnemy(true); Renderer.updateHUD();
        Renderer.updateActiveRelics(); Renderer.buildGrid(); showScreen('gameScreen');
        requestAnimationFrame(() => { Fx.resize(); Renderer.renderTiles(); });
        return;
      }
    }
    Renderer.renderMap(); showScreen('mapScreen');
  },

  _generateFloors() {
    const COLS = 3;
    const ROWS = 5;
    const POOL = ['normal','normal','normal','elite','mystery','rest'];

    return Array.from({ length: 3 }, () => {
      // 5 rows of 3 nodes
      const rows = [];
      for (let r = 0; r < ROWS; r++) rows.push(
        Array.from({ length: COLS }, (_, col) => ({
          type: (() => {
            if (r === 0) return 'normal';
            if (r === ROWS - 1) return 'rest';
            let type;
            for (let tries = 0; tries < 5; tries++) {
              type = Rng.pick(POOL);
              if ((r === 1 && type === 'elite') || (r === ROWS - 2 && type === 'rest')) continue;
              if ((type === 'elite' || type === 'rest') && rows[r - 1][col].type === type) continue;
              break;
            }
            if (r === 1 && type === 'elite') type = 'normal';
            if (r === ROWS - 2 && type === 'rest') type = 'normal';
            if ((type === 'elite' || type === 'rest') && rows[r - 1][col].type === type) type = 'normal';
            return type;
          })(),
          available: false,
          completed: false,
          connections: [],
        }))
      );

      // Generate connections between adjacent rows
      for (let r = 0; r < ROWS - 1; r++) {
        const incoming = new Set();
        rows[r].forEach((node, col) => {
          node.connections.push(col); // always straight ahead
          incoming.add(col);
          if (col > 0 && Rng.next() < 0.35) { node.connections.push(col - 1); incoming.add(col - 1); }
          if (col < COLS - 1 && Rng.next() < 0.35) { node.connections.push(col + 1); incoming.add(col + 1); }
          node.connections = [...new Set(node.connections)].sort();
        });
        // Ensure every next-row node has at least one incoming connection
        for (let col = 0; col < COLS; col++) {
          if (!incoming.has(col)) {
            const from = Math.min(Math.max(col, 0), COLS - 1);
            if (!rows[r][from].connections.includes(col)) rows[r][from].connections.push(col);
          }
        }
      }
      // No elite→elite or rest→rest along any connection, diagonals included
      for (let r = 1; r < ROWS - 1; r++) {
        rows[r].forEach((node, col) => {
          if (node.type !== 'elite' && node.type !== 'rest') return;
          if (rows[r - 1].some(p => p.type === node.type && p.connections.includes(col))) node.type = 'normal';
        });
      }

      // Last row connects to boss (index 0 in boss row)
      rows[ROWS - 1].forEach(node => { node.connections = [0]; });

      // Boss row (single node)
      rows.push([{ type: 'boss', available: false, completed: false, connections: [] }]);

      // First row available
      rows[0].forEach(n => { n.available = true; });

      return rows;
    });
  },

  // Pick `count` random items from `pool` with rarity weighting by floor
  _pickRandom(pool, count, floorIdx) {
    const remaining = [...pool];
    const picks = [];
    const fi = Math.min(floorIdx ?? GameState.run?.floorIdx ?? 0, 2);
    const synergyLvl = GameState.meta?.upgrades?.synergy || 0;
    const n = Math.min(count, remaining.length);
    for (let i = 0; i < n; i++) {
      const weights = remaining.map(r => {
        const w = RARITY_WEIGHTS[r.rarity];
        let base = w ? w[fi] : 30;
        if (synergyLvl > 0 && (r.rarity === 'epic' || r.rarity === 'legendary')) {
          base += synergyLvl * 10;
        }
        return base;
      });
      const total = weights.reduce((s, w) => s + w, 0);
      let roll = Rng.next() * total;
      let idx = 0;
      for (; idx < weights.length; idx++) {
        roll -= weights[idx];
        if (roll <= 0) break;
      }
      idx = Math.min(idx, remaining.length - 1);
      picks.push(remaining.splice(idx, 1)[0]);
    }
    return picks;
  },

  _getUnownedRelics(customPool) {
    const owned = new Set(GameState.run.relics.map(r => r.id));
    return (customPool || RELICS).filter(r => !owned.has(r.id));
  },

  _grantRelic(relic) {
    GameState.run.relics.push(relic);
    RelicHooks.invalidate();
    if (relic.hooks?.onRunStart) relic.hooks.onRunStart({}, GameState.run, GameState);
    Storage.saveRun(GameState.run);
  },

  abandonRun() {
    const m = GameState.meta;
    m.permanentGold += GameState.run.gold;
    m.totalGold     += GameState.run.gold;
    Storage.save(m);
    Storage.clearRun();
    Renderer.renderEndScreen(false, true);
    GameState.run = null;
    Renderer.renderTitle();
    showScreen('endScreen');
  },

  // ── Room entry ──
  enterRoom(floorIdx, rowIdx, nodeIdx) {
    const roomData = GameState.run.floors[floorIdx][rowIdx][nodeIdx];
    GameState.room = { floorIdx, rowIdx, nodeIdx, data: roomData };

    if (roomData.type === 'rest')    { this._doRestRoom();    return; }
    if (roomData.type === 'mystery') { this._doMysteryRoom(); return; }

    this._startBattleRoom(roomData.type, floorIdx);
  },

  _startBattleRoom(type, floorIdx) {
    const run = GameState.run;
    const m   = GameState.meta;

    const enemy = GameState.room.enemyDef || Combat.pick(floorIdx, type);
    GameState.room.enemyDef = enemy;
    GameState.room.combat = Combat.create(enemy);
    const base = (type === 'boss' ? [50,56,62] : type === 'elite' ? [40,44,48] : [36,40,44])[floorIdx];
    // Meta bonuses
    const moveCtx = { base, bonus: (m.upgrades.extraMoves || 0) * 2, type, floorIdx };
    if (type === 'boss') moveCtx.bonus += Math.floor(base * (m.upgrades.mastery || 0) * 0.1);
    // Relic hooks modify bonus
    RelicHooks.fire('onMovesCalc', moveCtx);
    GameState.movesMax  = moveCtx.base + moveCtx.bonus;
    GameState.movesLeft = GameState.movesMax;
    GameState.score      = 0;
    GameState.mergeCount = 0;
    GameState.roomFinished = false;
    GameState.room.relicState = {};

    // Build board
    GameState.board = Board.empty();
    GameState.obstacleAge = {};
    GameState.bombTimers = {};
    if (type === 'elite') {
      Board.placeValue(GameState.board, TILE.OBSTACLE);
      if (floorIdx >= 2) Board.placeValue(GameState.board, TILE.OBSTACLE);
    }

    const feLvl = m.upgrades.forgedEntropy || 0;
    Board.addRandom(GameState.board, false, feLvl);
    Board.addRandom(GameState.board, false, feLvl);

    // Meta: start tile upgrade
    const stLvl = m.upgrades.startTile || 0;
    if (stLvl > 0) Board.placeValue(GameState.board, [4, 8, 16][stLvl - 1]);

    // Relic hooks modify board at room start (crystal, mirror, germination, curses, etc.)
    RelicHooks.fire('onRoomStart', { board: GameState.board, type, floorIdx, run });

    // Render room UI
    const def = ROOM_DEFS[type];
    const roomLabel = type === 'boss' ? I18n.t('boss.name.' + Math.min(floorIdx, 2)) : I18n.t('room.' + type);
    document.getElementById('roomName').innerHTML = `<span style="color:${def.color}">${Icons.svg(def.icon)}</span> ${roomLabel}`;
    Renderer.renderEnemy(true);
    Renderer.hideRoomOverlay();
    Renderer.updateHUD();
    Renderer.updateActiveRelics();
    Renderer.buildGrid();

    showScreen('gameScreen');
    Storage.saveRun(GameState.run);

    // Defer first render to ensure grid is visible and has correct dimensions
    requestAnimationFrame(() => { Fx.resize(); Renderer.renderTiles(); });
  },

  _doRestRoom() {
    GameState.run.gold += 5;
    this._completeCurrentRoom();
    Storage.saveRun(GameState.run);
    // Sealed curse: rest rooms only offer shop
    const isSealed = GameState.run.relics.some(r => r.id === 'sealed');
    if (isSealed) {
      GameState._shopReturnToMap = true;
      Renderer.renderMeta();
      showScreen('metaScreen');
    } else {
      this._showRestChoice();
    }
  },

  _showRestChoice() {
    const choices = this._pickRandom(this._getUnownedRelics(), 2);
    GameState.run.pendingRest = choices.map(r => r.id);
    Storage.saveRun(GameState.run);
    Renderer.renderRestChoice(choices);
    GameState._restDone = () => { delete GameState.run.pendingRest; Storage.saveRun(GameState.run); Renderer.renderMap(); showScreen('mapScreen'); };
    showScreen('relicScreen');
  },

  pickRestShop() {
    const cb = GameState._restDone;
    GameState._restDone = null;
    delete GameState.run.pendingRest;
    Storage.saveRun(GameState.run);
    GameState._shopReturnToMap = true;
    Renderer.renderMeta();
    showScreen('metaScreen');
  },

  pickRestHeal() {
    GameState.run.hearts = Math.min(3, GameState.run.hearts + 1);
    Storage.saveRun(GameState.run);
    const cb = GameState._restDone;
    GameState._restDone = null;
    if (cb) cb();
  },

  _doMysteryRoom() {
    const run = GameState.run;
    const fi  = GameState.room.floorIdx;

    // Weighted events: [weight, handler]
    const events = [
      // ── Or ──
      [20, () => { run.gold += 5;  return { icon:'gold', title:I18n.t('mystery.goldSmall.title'),  sub:I18n.t('mystery.goldSmall.sub') }; }],
      [20, () => { run.gold += 10; return { icon:'gold', title:I18n.t('mystery.goldMedium.title'),  sub:I18n.t('mystery.goldMedium.sub') }; }],
      [10, () => { run.gold += 20; return { icon:'gold', title:I18n.t('mystery.goldLarge.title'),   sub:I18n.t('mystery.goldLarge.sub') }; }],
      // ── Reliques ──
      [15, () => {
        const picks = this._pickRandom(this._getUnownedRelics().filter(r => r.rarity === 'common'), 1);
        if (picks.length) { this._grantRelic(picks[0]); return { icon:'gift', title:I18n.t('mystery.relicCommon.title'), sub:I18n.t('mystery.relicCommon.sub') }; }
        run.gold += 8; return { icon:'gold', title:I18n.t('mystery.relicCommonFail.title'), sub:I18n.t('mystery.relicCommonFail.sub') };
      }],
      [5, () => {
        const picks = this._pickRandom(this._getUnownedRelics().filter(r => r.rarity === 'rare' || r.rarity === 'epic'), 1);
        if (picks.length) { this._grantRelic(picks[0]); return { icon:'sparkle', title:I18n.t('mystery.relicRare.title'), sub:I18n.t('mystery.relicRare.sub') }; }
        run.gold += 15; return { icon:'gold', title:I18n.t('mystery.relicRareFail.title'), sub:I18n.t('mystery.relicRareFail.sub') };
      }],
      // ── Bonus coups ──
      [10, () => {
        const haste = RELICS.find(r => r.id === 'haste');
        if (haste && !run.relics.find(r => r.id === 'haste')) { this._grantRelic(haste); return { icon:'haste', title:I18n.t('mystery.haste.title'), sub:I18n.t('mystery.haste.sub') }; }
        run.gold += 10; return { icon:'gold', title:I18n.t('mystery.hasteFail.title'), sub:I18n.t('mystery.hasteFail.sub') };
      }],
      // ── Perte d'or ──
      [8, () => { const lost = Math.min(run.gold, 10); run.gold -= lost; return { icon:'trap', title:I18n.t('mystery.trap.title'), sub:I18n.t('mystery.trap.sub', { n: lost }) }; }],
      // ── Double ou rien ──
      [7, () => {
        if (Rng.next() < 0.5) { run.gold += 25; return { icon:'slots', title:I18n.t('mystery.double.title'), sub:I18n.t('mystery.double.lucky') }; }
        const lost = Math.min(run.gold, 15); run.gold -= lost; return { icon:'slots', title:I18n.t('mystery.double.title'), sub:I18n.t('mystery.double.unlucky', { n: lost }) };
      }],
      // ── Curse (malus) ──
      [8, () => {
        const curses = RELICS.filter(r => r.isCurse && !run.relics.find(x => x.id === r.id));
        if (curses.length) { const c = curses[Rng.int(curses.length)]; this._grantRelic(c); return { icon:c.icon, title:I18n.t('mystery.curse.title'), sub:`${I18n.t('relic.' + c.id + '.name')} : ${I18n.t('relic.' + c.id + '.desc')}` }; }
        run.gold += 5; return { icon:'gold', title:I18n.t('mystery.curseFail.title'), sub:I18n.t('mystery.curseFail.sub') };
      }],
      // ── Combat piège (rare) ──
      [5, () => 'AMBUSH'],
    ];

    // Weighted random pick
    const totalWeight = events.reduce((sum, e) => sum + e[0], 0);
    let roll = Rng.next() * totalWeight;
    let picked;
    for (const [weight, handler] of events) {
      roll -= weight;
      if (roll <= 0) { picked = handler; break; }
    }
    if (!picked) picked = events[0][1];

    const result = picked();

    // Combat piège : lance un vrai combat au lieu d'un modal
    if (result === 'AMBUSH') {
      // Show ambush warning, then start battle
      Renderer.showMysteryModal('ambush', I18n.t('mystery.ambush.title'), I18n.t('mystery.ambush.sub'), () => {
        GameState.room.enemyDef = Combat.pick(fi, 'normal');
        this._startBattleRoom('normal', fi);
      });
      return;
    }

    this._completeCurrentRoom();
    Renderer.showMysteryModal(result.icon, result.title, result.sub, () => {
      Renderer.renderMap();
      showScreen('mapScreen');
    });
  },

  _completeCurrentRoom() {
    const rm = GameState.room;
    this._completeRoom(rm.floorIdx, rm.rowIdx, rm.nodeIdx);
  },

  _completeRoom(fi, rowIdx, nodeIdx) {
    const floor = GameState.run.floors[fi];
    const node  = floor[rowIdx][nodeIdx];
    node.completed = true;
    node.available = false;

    // Disable other nodes on same row (you chose your path)
    floor[rowIdx].forEach((n, i) => {
      if (i !== nodeIdx) n.available = false;
    });

    if (node.type === 'boss') {
      // Boss battu : débloque la première rangée de l'étage suivant
      const nextFi = fi + 1;
      if (nextFi < GameState.run.floors.length) {
        GameState.run.floors[nextFi][0].forEach(n => { n.available = true; });
      }
    } else {
      // Salle terminée : débloque les noeuds connectés dans la rangée suivante
      const nextRow = rowIdx + 1;
      if (nextRow < floor.length) {
        (node.connections || []).forEach(ci => {
          if (floor[nextRow][ci]) floor[nextRow][ci].available = true;
        });
      }
    }
    Storage.saveRun(GameState.run);
  },

  // ── Move ──
  /** @returns {'success'|'buzz'|null} haptic to fire */
  move(inputDir) {
    const gs = GameState;
    if (!gs.run || gs.roomFinished || gs.movesLeft <= 0) return null;
    const fight = gs.room.combat;
    if (Combat.isLocked(fight, inputDir)) {
      Fx.nudge(inputDir); Audio2.bump(); return 'buzz';
    }
    const dir = Combat.direction(fight, inputDir);
    const result = Board.applyMove(gs.board, dir, {
      forgedEntropyLvl: gs.meta.upgrades.forgedEntropy || 0,
      deepForgeChance: (gs.meta.upgrades.deepForge || 0) * 0.1,
    });
    if (!result) {
      Fx.nudge(inputDir); Audio2.bump();
      if (!Combat.hasLegalMove(fight, gs.board)) this._checkFailure();
      return 'buzz';
    }
    gs.score += result.score;
    gs.mergeCount += result.merges.length;
    gs.run.totalScore += result.score;
    if (result.merges.length) gs.run.lastTileVal = result.merges[result.merges.length - 1].val;

    const moveCtx = { result, board: gs.board, movesLeft: gs.movesLeft, addMove: 0, freeMove: false };
    RelicHooks.fire('onAfterMove', moveCtx);
    gs.movesLeft += moveCtx.addMove;

    const goldCtx = { gold: Math.floor(result.score / 100), merges: result.merges,
      type: gs.room.data.type, floorIdx: gs.room.floorIdx };
    RelicHooks.fire('onGoldCalc', goldCtx);
    goldCtx.gold += (gs.meta.upgrades.goldBonus || 0) * 2 * (result.merges.length > 0 ? 1 : 0);
    gs.run.gold += goldCtx.gold;

    if (gs.run.singularityReady && result.merges.some(m => m.val >= 128)) {
      gs.run.singularityReady = false;
      for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++)
        if (gs.board[r][c] > 0) gs.board[r][c] *= 2;
    }

    Board.remapBombTimers(gs.bombTimers, result.bombMoves);
    const broken = Combat.breakHazards(fight, gs.board, result.merges, gs.bombTimers);
    for (const { r,c,kind } of broken) {
      const at = Fx.cellCenter(r,c);
      if (at) Fx.burst(at.x, at.y, kind === 'bomb' ? '#c44a3a' : '#9fb3c8', 14);
    }
    const hit = Combat.damage(fight, result.merges);
    if (hit.dealt > 0) Renderer.enemyHit(hit.dealt);
    const phaseChanged = Combat.phase(fight, gs.room.enemyDef);
    if (phaseChanged) Renderer.phaseBanner();
    if (!moveCtx.freeMove) gs.movesLeft--;
    if (fight.hp <= 0) {
      this._winRoom(result, dir);
      return 'buzz';
    }

    const exploded = Board.tickBombs(gs.board, gs.bombTimers);
    for (let i = 0; i < exploded; i++) Combat.bombExploded(fight);
    const transCtx = { board: gs.board, obstacleAge: gs.obstacleAge, active:false };
    RelicHooks.fire('onTransmute', transCtx);
    if (transCtx.active) {
      for (let r=0;r<GRID_SIZE;r++) for (let c=0;c<GRID_SIZE;c++)
        if (gs.board[r][c] === TILE.OBSTACLE && !(`${r},${c}` in fight.seals))
          gs.obstacleAge[`${r},${c}`] ??= 0;
      for (const key of Object.keys(gs.obstacleAge)) {
        if (++gs.obstacleAge[key] >= 3) {
          const [r,c] = key.split(',').map(Number);
          if (gs.board[r][c] === TILE.OBSTACLE) gs.board[r][c] = 4;
          delete gs.obstacleAge[key];
        }
      }
    }
    if (!moveCtx.freeMove) Combat.tick(fight, gs.board, phaseChanged);
    const effect = moveCtx.freeMove ? null : Combat.resolve(fight, gs.board, gs.bombTimers, gs.room.floorIdx);
    if (effect) RelicHooks.fire('onEnemyIntent', { effect, board:gs.board, bombTimers:gs.bombTimers });
    if (effect?.strike) {
      gs.movesLeft = Math.max(0, gs.movesLeft - effect.strike);
      Renderer.strike(effect.strike);
    }
    if (effect) Renderer.intentFired();
    this._renderAfterMove(result, dir);
    Renderer.renderEnemy();
    Storage.saveRun(gs.run);
    this._checkFailure();
    return result.merges.length ? 'success' : null;
  },

  _checkFailure() {
    const gs = GameState;
    if (gs.roomFinished || (gs.movesLeft > 0 && Combat.hasLegalMove(gs.room.combat, gs.board))) return false;
    const exhCtx = { movesLeft:0, consumed:false, overlayIcon:'', overlayTitle:'', overlaySub:'' };
    RelicHooks.fire('onMovesExhausted', exhCtx);
    if (exhCtx.consumed) {
      gs.movesLeft = exhCtx.movesLeft;
      // Persist the rescue, or a reload would restore the battle at 0 moves.
      Storage.saveRun(gs.run);
      Renderer.showRoomOverlay('phoenix', exhCtx.overlaySub);
      document.getElementById('overlayIcon').innerHTML = Icons.svg(exhCtx.overlayIcon);
      document.getElementById('overlayTitle').textContent = exhCtx.overlayTitle;
      setTimeout(() => Renderer.hideRoomOverlay(), 2400);
      Renderer.updateHUD();
      return false;
    }
    gs.roomFinished = true;
    const defeated = Combat.loseHeart(gs.run);
    const type = gs.room.data.type;
    const reward = type === 'boss' ? [12,16,20][gs.room.floorIdx] : type === 'elite' ? 12 : 8;
    const endCtx = { won:false, type, floorIdx:gs.room.floorIdx, goldBonus:0, goldMultiplier:1, roomReward:reward };
    RelicHooks.fire('onRoomEnd', endCtx);
    gs.run.gold += Math.floor(endCtx.goldBonus * endCtx.goldMultiplier);
    gs.overlayMode = defeated ? 'defeat' : type === 'boss' ? 'retryBoss' : 'failedRoom';
    if (!defeated && type !== 'boss') this._completeCurrentRoom();
    Renderer.updateHUD();
    Renderer.showRoomOverlay('failure', defeated ? I18n.t('overlay.noHearts') : I18n.t('overlay.noMoves'));
    Audio2.fail();
    Storage.saveRun(gs.run);
    return true;
  },

  _winRoom(result, dir) {
    const gs = GameState;
    gs.roomFinished = true;
    const type = gs.room.data.type;
    const reward = type === 'boss' ? [12,16,20][gs.room.floorIdx] : type === 'elite' ? 12 : 8;
    const leftover = Combat.leftoverGold(gs.movesLeft);
    const endCtx = { won:true, type, floorIdx:gs.room.floorIdx, goldBonus:0,
      goldMultiplier:1, roomReward:reward + leftover };
    RelicHooks.fire('onRoomEnd', endCtx);
    const total = Math.floor((endCtx.roomReward + endCtx.goldBonus) * endCtx.goldMultiplier);
    gs.run.gold += total + (gs.meta.upgrades.goldBonus || 0) * 2;
    gs.run.pendingReward = { floorIdx:gs.room.floorIdx, rowIdx:gs.room.rowIdx,
      nodeIdx:gs.room.nodeIdx, type };
    this._completeCurrentRoom();
    this._renderAfterMove(result, dir);
    Renderer.renderEnemy();
    Fx.roomSuccess(); Audio2.win();
    gs.overlayMode = 'success';
    const detail = `+${total} ${I18n.t('hud.gold').toLowerCase()} · ${I18n.t('overlay.leftoverGold', { n:leftover })}`;
    setTimeout(() => Renderer.showRoomOverlay('success', detail), 300);
    Storage.saveRun(gs.run);
  },

  _renderAfterMove(result, dir) {
    const newSet    = new Set(result.newTilePos ? [`${result.newTilePos[0]},${result.newTilePos[1]}`] : []);
    const mergedSet = new Set(result.merges.map(m => `${m.r},${m.c}`));
    Renderer.renderTiles(newSet, mergedSet, dir);
    Fx.merges(result.merges);
    Audio2.merges(result.merges);
    Renderer.updateHUD();
  },

  // ── Overlay action ──
  overlayAction() {
    Renderer.hideRoomOverlay();
    const mode = GameState.overlayMode;
    GameState.overlayMode = null;

    if (mode === 'success') {
      this._showBattleReward();
    } else if (mode === 'failedRoom') {
      Renderer.renderMap();
      showScreen('mapScreen');
    } else if (mode === 'retryBoss') {
      this._startBattleRoom('boss', GameState.room.floorIdx);
    } else {
      this._endRun(false);
    }
    if (GameState.run) Storage.saveRun(GameState.run);
  },

  _relicCount() { return 3 + (GameState.meta.upgrades.relicSlots || 0); },

  _finishBattleReward() {
    const reward = GameState.run.pendingReward;
    if (reward?.type === 'boss') GameState.run.floorIdx++;
    delete GameState.run.pendingReward;
    Storage.saveRun(GameState.run);
    Renderer.renderMap(); showScreen('mapScreen');
  },

  _showBattleReward() {
    const reward = GameState.run.pendingReward;
    if (reward?.type === 'boss' && reward.floorIdx === 2) {
      this._endRun(true); return;
    }
    this._offerRelics(this._relicCount(), () => this._finishBattleReward(), null, 'battle');
  },

  // ── Relic offer ──
  _offerRelics(count, onDone, customPool, reason = null) {
    const choices = this._pickRandom(this._getUnownedRelics(customPool), count);
    if (choices.length === 0) { onDone(); return; }

    GameState._relicDone = onDone;
    if (reason) {
      GameState.run.pendingRelic = { ids:choices.map(r => r.id), reason };
      Storage.saveRun(GameState.run);
    }
    document.getElementById('relicGoldInfo').textContent = '';
    document.getElementById('btnSkipRelic').style.display = '';
    Renderer.renderRelicChoice(choices);
    showScreen('relicScreen');
  },

  pickRelic(relic) {
    this._grantRelic(relic);
    Audio2.relic();
    this._finishRelicScreen();
  },

  skipRelic() { this._finishRelicScreen(); },

  _finishRelicScreen() {
    // Rest room callback takes priority
    const restCb = GameState._restDone;
    if (restCb) {
      GameState._restDone = null;
      GameState._relicDone = null;
      restCb();
      return;
    }
    const cb = GameState._relicDone;
    GameState._relicDone = null;
    delete GameState.run.pendingRelic;
    Storage.saveRun(GameState.run);
    if (cb) cb();
  },

  // ── End run ──
  _endRun(win) {
    const m  = GameState.meta;
    const r  = GameState.run;
    if (win) { r.gold += 30; r.floorIdx = 2; } // victoire = étage 3/3
    m.permanentGold += r.gold;
    m.totalGold     += r.gold;
    m.bestFloor      = Math.max(m.bestFloor, r.floorIdx + 1);
    Storage.save(m);
    Storage.clearRun();
    Renderer.renderEndScreen(win, false);
    GameState.run = null;
    Renderer.renderTitle();
    showScreen('endScreen');
  },

  // ── Ascension ──
  canAscend() {
    const m = GameState.meta;
    if (m.ascensionLevel >= MAX_ASCENSION) return false;
    return m.permanentGold >= ASCENSION_COSTS[m.ascensionLevel];
  },

  doAscension() {
    if (!this.canAscend()) return;
    const m    = GameState.meta;
    const cost = ASCENSION_COSTS[m.ascensionLevel];
    m.permanentGold -= cost;
    m.ascensionLevel++;
    // Reset all upgrades
    m.upgrades = {};
    Storage.save(m);
    Renderer.renderMeta();
    Renderer.renderTitle();
  },

  // ── Meta ──
  buyUpgrade(id, cardEl) {
    const m   = GameState.meta;
    const def = META_DEFS.find(u => u.id === id);
    const lvl = m.upgrades[id] || 0;
    if (lvl >= def.maxLvl) return;
    const cost = def.costs[lvl];
    if (m.permanentGold < cost) {
      if (cardEl) { cardEl.classList.remove('shake'); void cardEl.offsetWidth; cardEl.classList.add('shake'); }
      return;
    }
    m.permanentGold -= cost;
    m.upgrades[id]   = lvl + 1;
    Storage.save(m);
    Renderer.renderMeta();
  },
};
