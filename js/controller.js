'use strict';

const Controller = {

  // ── Run ──
  startRun() {
    const m = GameState.meta;
    GameState._shopReturnToMap = false;
    GameState._restDone = null;
    GameState._relicDone = null;
    RelicHooks.invalidate();
    GameState.run = {
      gold: 0,
      totalScore: 0,
      relics: [],
      lastTileVal: 0,
      floorIdx: 0,
      singularityReady: !!(m.upgrades.singularity),
      floors: this._generateFloors(),
    };

    if (m.upgrades.startRelic) {
      const commons = RELICS.filter(r => r.rarity === 'common');
      this._grantRelic(commons[Math.floor(Math.random() * commons.length)]);
    }

    m.totalRuns++;
    Storage.save(m);

    // Destiny upgrade: offer a rare relic at start
    if (m.upgrades.destiny) {
      const rares = RELICS.filter(r => r.rarity === 'rare' || r.rarity === 'epic');
      this._offerRelics(2, () => { Renderer.renderMap(); showScreen('mapScreen'); }, rares);
    } else {
      Renderer.renderMap();
      showScreen('mapScreen');
    }
  },

  _generateFloors() {
    const COLS = 3;
    const ROWS = 5;
    const POOL = ['normal','normal','normal','elite','mystery','rest'];

    return Array.from({ length: 3 }, () => {
      // 5 rows of 3 nodes
      const rows = Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLS }, () => ({
          type: POOL[Math.floor(Math.random() * POOL.length)],
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
          if (col > 0 && Math.random() < 0.35) { node.connections.push(col - 1); incoming.add(col - 1); }
          if (col < COLS - 1 && Math.random() < 0.35) { node.connections.push(col + 1); incoming.add(col + 1); }
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
    for (let i = 0; i < Math.min(count, remaining.length); i++) {
      const weights = remaining.map(r => {
        const w = RARITY_WEIGHTS[r.rarity];
        let base = w ? w[fi] : 30;
        if (synergyLvl > 0 && (r.rarity === 'epic' || r.rarity === 'legendary')) {
          base += synergyLvl * 10;
        }
        return base;
      });
      const total = weights.reduce((s, w) => s + w, 0);
      let roll = Math.random() * total;
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
  },

  abandonRun() {
    const m = GameState.meta;
    m.permanentGold += GameState.run.gold;
    m.totalGold     += GameState.run.gold;
    Storage.save(m);
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

    // Pick objective — scales by floor
    let pool;
    if (type === 'boss') {
      pool = BOSS_OBJECTIVES[floorIdx] || BOSS_OBJECTIVES[2];
    } else {
      pool = OBJECTIVES[floorIdx]?.[type] ?? OBJECTIVES[floorIdx]?.normal ?? OBJECTIVES[0].normal;
    }
    const obj  = pool[Math.floor(Math.random() * pool.length)];
    GameState.room.objective = obj;

    // Moves — all room types scale by floor
    const NORMAL_MOVES = [35, 30, 25];
    const ELITE_MOVES  = [32, 28, 24];
    const BOSS_MOVES   = [35, 40, 45];
    const base = type === 'boss'  ? (BOSS_MOVES[floorIdx] || 45)
               : type === 'elite' ? (ELITE_MOVES[floorIdx] || 24)
               :                    (NORMAL_MOVES[floorIdx] || 25);
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
    if (type === 'elite') {
      Board.placeValue(GameState.board, TILE.OBSTACLE);
      if (floorIdx >= 2) Board.placeValue(GameState.board, TILE.OBSTACLE);
    }
    if (type === 'boss') {
      Board.placeValue(GameState.board, TILE.OBSTACLE);
      if (floorIdx >= 1) Board.placeValue(GameState.board, TILE.BOMB);
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
    document.getElementById('roomName').textContent = `${def.icon} ${def.label}`;
    document.getElementById('roomObjectiveText').textContent = obj.label;
    Renderer.hideRoomOverlay();
    Renderer.updateHUD();
    Renderer.updateActiveRelics();
    Renderer.buildGrid();

    showScreen('gameScreen');

    // Defer first render to ensure grid is visible and has correct dimensions
    requestAnimationFrame(() => Renderer.renderTiles());
  },

  _doRestRoom() {
    GameState.run.gold += 5;
    this._completeCurrentRoom();
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
    Renderer.renderRestChoice(choices);
    GameState._restDone = () => { Renderer.renderMap(); showScreen('mapScreen'); };
    showScreen('relicScreen');
  },

  pickRestShop() {
    const cb = GameState._restDone;
    GameState._restDone = null;
    GameState._shopReturnToMap = true;
    Renderer.renderMeta();
    showScreen('metaScreen');
  },

  _doMysteryRoom() {
    const run = GameState.run;
    const fi  = GameState.room.floorIdx;

    // Weighted events: [weight, handler]
    const events = [
      // ── Or ──
      [20, () => { run.gold += 5;  return { icon:'💰', title:'Carte ancienne',  sub:'+5 or gagné' }; }],
      [20, () => { run.gold += 10; return { icon:'💰', title:'Coffre trouvé !',  sub:'+10 or gagné' }; }],
      [10, () => { run.gold += 20; return { icon:'💰', title:'Trésor antique',   sub:'+20 or gagné' }; }],
      // ── Reliques ──
      [15, () => {
        const picks = this._pickRandom(this._getUnownedRelics().filter(r => r.rarity === 'common'), 1);
        if (picks.length) { this._grantRelic(picks[0]); return { icon:'🎁', title:'Objet mystérieux', sub:'Une relique commune obtenue !' }; }
        run.gold += 8; return { icon:'💰', title:'Coffre poussiéreux', sub:'+8 or gagné' };
      }],
      [5, () => {
        const picks = this._pickRandom(this._getUnownedRelics().filter(r => r.rarity === 'rare' || r.rarity === 'epic'), 1);
        if (picks.length) { this._grantRelic(picks[0]); return { icon:'✨', title:'Artefact oublié', sub:'Une relique rare obtenue !' }; }
        run.gold += 15; return { icon:'💰', title:'Butin enfoui', sub:'+15 or gagné' };
      }],
      // ── Bonus coups ──
      [10, () => {
        const haste = RELICS.find(r => r.id === 'haste');
        if (haste && !run.relics.find(r => r.id === 'haste')) { this._grantRelic(haste); return { icon:'⚡', title:'Bénédiction rapide', sub:'Relique Hâte obtenue ! +5 coups/salle' }; }
        run.gold += 10; return { icon:'💰', title:'Énergie résiduelle', sub:'+10 or gagné' };
      }],
      // ── Perte d'or (malédiction) ──
      [8, () => { const lost = Math.min(run.gold, 10); run.gold -= lost; return { icon:'💀', title:'Piège !', sub:`-${lost} or perdu` }; }],
      // ── Double ou rien ──
      [7, () => {
        if (Math.random() < 0.5) { run.gold += 25; return { icon:'🎰', title:'Double ou rien', sub:'Chance ! +25 or gagné' }; }
        const lost = Math.min(run.gold, 15); run.gold -= lost; return { icon:'🎰', title:'Double ou rien', sub:`Malchance... -${lost} or perdu` };
      }],
      // ── Curse (malus) ──
      [8, () => {
        const curses = RELICS.filter(r => r.isCurse && !run.relics.find(x => x.id === r.id));
        if (curses.length) { const c = curses[Math.floor(Math.random() * curses.length)]; this._grantRelic(c); return { icon:c.icon, title:'Malédiction !', sub:`${c.name} : ${c.desc}` }; }
        run.gold += 5; return { icon:'💰', title:'Rien de spécial', sub:'+5 or gagné' };
      }],
      // ── Combat piège (rare) ──
      [5, () => 'AMBUSH'],
    ];

    // Weighted random pick
    const totalWeight = events.reduce((sum, e) => sum + e[0], 0);
    let roll = Math.random() * totalWeight;
    let picked;
    for (const [weight, handler] of events) {
      roll -= weight;
      if (roll <= 0) { picked = handler; break; }
    }
    if (!picked) picked = events[0][1];

    const result = picked();

    // Combat piège : lance un vrai combat au lieu d'un modal
    if (result === 'AMBUSH') {
      this._completeCurrentRoom();
      // Show ambush warning, then start battle
      Renderer.showMysteryModal('⚔', 'Embuscade !', 'Un ennemi surgit de l\'ombre...', () => {
        this._startBattleRoom(fi >= 1 ? 'elite' : 'normal', fi);
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

    // Disable other available nodes on same row (you chose your path)
    floor[rowIdx].forEach((n, i) => {
      if (i !== nodeIdx && !n.completed) n.available = false;
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
  },

  // ── Move ──
  move(dir) {
    const gs = GameState;
    if (gs.roomFinished || gs.movesLeft <= 0) return;

    const mods = {
      forgedEntropyLvl: gs.meta.upgrades.forgedEntropy || 0,
      deepForgeChance: (gs.meta.upgrades.deepForge || 0) * 0.1,
    };
    const result = Board.applyMove(gs.board, dir, mods);
    if (!result) return;

    gs.score      += result.score;
    gs.mergeCount += result.merges.length;
    gs.run.totalScore += result.score;
    if (result.merges.length) gs.run.lastTileVal = result.merges[result.merges.length - 1].val;

    // Relic hooks: post-move effects (echo, sablier, marée, lame double)
    const moveCtx = { result, board: gs.board, movesLeft: gs.movesLeft, addMove: 0, freeMove: false };
    RelicHooks.fire('onAfterMove', moveCtx);
    gs.movesLeft += moveCtx.addMove;

    // Gold: base from score, then relic hooks, then meta bonus
    let gold = Math.floor(result.score / 100);
    const goldCtx = { gold, merges: result.merges, type: gs.room.data.type, floorIdx: gs.room.floorIdx };
    RelicHooks.fire('onGoldCalc', goldCtx);
    goldCtx.gold += (gs.meta.upgrades.goldBonus || 0) * 2 * (result.merges.length > 0 ? 1 : 0);
    gs.run.gold += goldCtx.gold;

    // Singularity meta upgrade
    if (gs.run.singularityReady && result.merges.some(m => m.val >= 128)) {
      gs.run.singularityReady = false;
      for (let r = 0; r < GRID_SIZE; r++)
        for (let c = 0; c < GRID_SIZE; c++)
          if (gs.board[r][c] > 0) gs.board[r][c] *= 2;
    }

    // Transmutation hook
    const transCtx = { board: gs.board, obstacleAge: gs.obstacleAge, active: false };
    RelicHooks.fire('onTransmute', transCtx);
    if (transCtx.active) {
      for (let r = 0; r < GRID_SIZE; r++)
        for (let c = 0; c < GRID_SIZE; c++)
          if (gs.board[r][c] === TILE.OBSTACLE) {
            const key = `${r},${c}`;
            if (!(key in gs.obstacleAge)) gs.obstacleAge[key] = 0;
          }
      for (const key of Object.keys(gs.obstacleAge)) {
        gs.obstacleAge[key]++;
        if (gs.obstacleAge[key] >= 3) {
          const [r, c] = key.split(',').map(Number);
          if (gs.board[r][c] === TILE.OBSTACLE) gs.board[r][c] = 4;
          delete gs.obstacleAge[key];
        }
      }
    }

    // Check win BEFORE decrementing moves
    const won = Board.checkObjective(gs.board, gs.room.objective, gs.score, gs.mergeCount);

    if (won) {
      gs.roomFinished = true;
      const BOSS_REWARDS = [12, 16, 20];
      let reward = gs.room.data.type === 'boss' ? (BOSS_REWARDS[gs.room.floorIdx] || 20) : gs.room.data.type === 'elite' ? 12 : 8;
      const endCtx = { won: true, type: gs.room.data.type, floorIdx: gs.room.floorIdx, goldBonus: 0, goldMultiplier: 1, roomReward: reward };
      RelicHooks.fire('onRoomEnd', endCtx);
      reward = Math.floor((reward + endCtx.goldBonus) * endCtx.goldMultiplier);
      gs.run.gold += reward + (gs.meta.upgrades.goldBonus || 0) * 2;
      this._completeCurrentRoom();
      this._renderAfterMove(result);
      Renderer.showRoomOverlay('success', `+${reward} or`);
      gs.overlayMode = 'success';
      return;
    }

    if (!moveCtx.freeMove) gs.movesLeft--;

    this._renderAfterMove(result);
    Renderer.updateHUD();

    if (gs.movesLeft <= 0 || !Board.canMove(gs.board)) {
      const exhCtx = { movesLeft: 0, consumed: false, overlayIcon: '', overlayTitle: '', overlaySub: '' };
      RelicHooks.fire('onMovesExhausted', exhCtx);
      if (exhCtx.consumed) {
        gs.movesLeft = exhCtx.movesLeft;
        Renderer.showRoomOverlay('phoenix', exhCtx.overlaySub);
        // Override overlay display
        document.getElementById('overlayIcon').textContent = exhCtx.overlayIcon;
        document.getElementById('overlayTitle').textContent = exhCtx.overlayTitle;
        setTimeout(() => Renderer.hideRoomOverlay(), 2400);
        Renderer.updateHUD();
        return;
      }
      gs.roomFinished = true;
      gs.overlayMode = 'failure';
      Renderer.showRoomOverlay('failure', 'Plus de coups disponibles');
    }
  },

  _renderAfterMove(result) {
    const newSet    = new Set(result.newTilePos ? [`${result.newTilePos[0]},${result.newTilePos[1]}`] : []);
    const mergedSet = new Set(result.merges.map(m => `${m.r},${m.c}`));
    Renderer.renderTiles(newSet, mergedSet);
    Renderer.updateHUD();
  },

  // ── Overlay action ──
  overlayAction() {
    Renderer.hideRoomOverlay();
    const mode = GameState.overlayMode;
    GameState.overlayMode = null;

    if (mode === 'success') {
      const room = GameState.room;
      const isFinalBoss = room.data.type === 'boss' && room.floorIdx === 2;
      if (isFinalBoss) { this._endRun(true); return; }

      const afterRelic = () => {
        if (room.data.type === 'boss') GameState.run.floorIdx++;
        Renderer.renderMap();
        showScreen('mapScreen');
      };
      this._offerRelics(this._relicCount(), afterRelic);
    } else {
      this._endRun(false);
    }
  },

  _relicCount() { return 3 + (GameState.meta.upgrades.relicSlots || 0); },

  // ── Relic offer ──
  _offerRelics(count, onDone, customPool) {
    const choices = this._pickRandom(this._getUnownedRelics(customPool), count);
    if (choices.length === 0) { onDone(); return; }

    GameState._relicDone = onDone;
    document.getElementById('relicGoldInfo').textContent = '';
    document.getElementById('btnSkipRelic').style.display = '';
    Renderer.renderRelicChoice(choices);
    showScreen('relicScreen');
  },

  pickRelic(relic) {
    this._grantRelic(relic);
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
  buyUpgrade(id) {
    const m   = GameState.meta;
    const def = META_DEFS.find(u => u.id === id);
    const lvl = m.upgrades[id] || 0;
    if (lvl >= def.maxLvl) return;
    const cost = def.costs[lvl];
    if (m.permanentGold < cost) return;
    m.permanentGold -= cost;
    m.upgrades[id]   = lvl + 1;
    Storage.save(m);
    Renderer.renderMeta();
  },
};
