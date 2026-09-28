'use strict';

const Controller = {
  clockNow: () => performance.now(),
  _clockTimer: null,
  _clockLast: null,
  _clockRemaining: 5,
  _clockVisibilityBound: false,
  _clockLimit() { return GameState.room?.combat?.phase === 2 ? 3.5 : 5; },
  _clockPaused() {
    return !!(GameState.room?.combat?.id !== 'clockmaker' || GameState.roomFinished || GameState.spellTarget
      || (typeof document !== 'undefined' && (document.hidden || !document.getElementById('gameScreen')?.classList.contains('active')
        || document.querySelector('.modal-backdrop.show, .room-overlay.show'))));
  },
  _resetClock() { this._clockRemaining = this._clockLimit(); this._clockLast = null; Renderer.renderClock?.(1,this._clockRemaining); },
  _stopClock() { if (this._clockTimer) globalThis.clearInterval?.(this._clockTimer); this._clockTimer = null; this._clockLast = null; },
  _startClock(remaining = null) {
    this._stopClock();
    if (GameState.room?.combat?.id === 'clockmaker' && Number.isFinite(remaining)) {
      this._clockRemaining = Math.max(0,Math.min(this._clockLimit(),remaining));
      Renderer.renderClock?.(this._clockRemaining / this._clockLimit(),this._clockRemaining);
    } else this._resetClock();
    if (!this._clockVisibilityBound && typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        this._clockLast = null;
        if (document.hidden && GameState.room?.combat?.id === 'clockmaker' && !GameState.roomFinished)
          Storage.saveRun(GameState.run);
      });
      globalThis.addEventListener?.('pagehide', () => {
        if (GameState.room?.combat?.id === 'clockmaker' && !GameState.roomFinished) Storage.saveRun(GameState.run);
      });
      this._clockVisibilityBound = true;
    }
    if (GameState.room?.combat?.id === 'clockmaker') this._clockTimer = globalThis.setInterval?.(() => this.clockTick(), 50);
  },
  clockTick(now = this.clockNow()) {
    if (this._clockPaused()) { this._clockLast = null; return false; }
    if (this._clockLast === null) { this._clockLast = now; return false; }
    this._clockRemaining -= Math.max(0,now - this._clockLast) / 1000;
    this._clockLast = now;
    Renderer.renderClock?.(Math.max(0,this._clockRemaining / this._clockLimit()),this._clockRemaining);
    if (this._clockRemaining > 0) return false;
    GameState.movesLeft = Math.max(0,GameState.movesLeft - 1);
    Renderer.updateHUD(); Renderer.strike(1);
    this._resetClock();
    Storage.saveRun(GameState.run);
    this._checkFailure();
    return true;
  },

  spellCapacity() { return GameState.run?.relics.some(r => r.id === 'grimoire') ? 4 : 3; },
  chargeSpell() {
    const spell = GameState.run.spells.find(s => s.charges < this.spellCapacity());
    if (!spell) return false;
    spell.charges++; return true;
  },
  chargeAllSpells() {
    let changed = false;
    for (const spell of GameState.run.spells) if (spell.charges < this.spellCapacity()) { spell.charges++; changed=true; }
    return changed;
  },

  damage(fight, merges) {
    const ctx = { merges:merges.map(m => ({...m,damageMultiplier:1})), multiplier:1,
      comboStep:GameState.run.character === 'monk' ? 0.35 : 0.25 };
    RelicHooks.fire('onDamageCalc',ctx);
    const combo = 1 + ctx.comboStep * Math.max(0,merges.length-1);
    const raw = Math.floor(ctx.merges.reduce((sum,m) => sum + m.val*m.damageMultiplier,0) * combo *
      (fight.invertTurns>0 ? 1.25 : 1) * ctx.multiplier);
    const absorbed = Math.min(raw,fight.block);
    fight.block -= absorbed;
    fight.hp = Math.max(0,fight.hp-(raw-absorbed));
    return {raw,dealt:raw-absorbed,absorbed,combo};
  },

  breakHazards(fight, board, merges, bombTimers) {
    const broken=Combat.breakHazards(fight,board,merges,bombTimers);
    if (GameState.run.character === 'artificer') for (const merge of merges) if (merge.val >= 8)
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const r=merge.r+dr,c=merge.c+dc;
        if (board[r]?.[c] === TILE.BOMB) { board[r][c]=0; delete bombTimers[`${r},${c}`]; broken.push({r,c,kind:'bomb'}); }
      }
    return broken;
  },

  shopPrice(value) { return GameState.run.character === 'alchemist' ? Math.floor(value*0.8) : value; },

  // ── Run ──
  startRun() { Renderer.renderCharacters(); showScreen('characterScreen'); },

  chooseCharacter(characterId) {
    if (!CHARACTERS.some(c => c.id === characterId)) return false;
    this._beginRun(characterId);
    return true;
  },

  _beginRun(characterId) {
    const m = GameState.meta;
    const seed = new Uint32Array(1);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(seed);
    else seed[0] = (Date.now() ^ Math.floor(Rng.next() * 0x100000000)) >>> 0;
    Rng.seed(seed[0]);
    GameState._shopReturnToMap = false;
    GameState.room = null;
    GameState.kinds = Board.emptyKinds();
    GameState.portals = [];
    GameState.roomFinished = false;
    GameState._restDone = null;
    GameState._relicDone = null;
    GameState.spellTarget = null;
    GameState.stuck = false;
    RelicHooks.invalidate();
    GameState.run = {
      seed: Rng.getSeed(),
      gold: 0,
      hearts: 3,
      totalScore: 0,
      relics: [],
      character: characterId,
      spells: [{ id:CHARACTERS.find(c => c.id === characterId).spell, charges:2 }],
      _wildcardMoves: 0,
      seenEvents: [],
      bossHpMult: 1,
      lastTileVal: 0,
      floorIdx: 0,
      singularityReady: !!(m.upgrades.singularity),
      floors: this._generateFloors(),
    };

    this._grantRelic(RELICS.find(r => r.id === CHARACTERS.find(c => c.id === characterId).relic));

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
    if (run.pendingRoom) {
      const {floorIdx,rowIdx,nodeIdx} = run.pendingRoom;
      GameState.room = {floorIdx,rowIdx,nodeIdx,data:run.floors[floorIdx]?.[rowIdx]?.[nodeIdx]};
    }
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
    if (run.pendingShop) { this._showShop(); return; }
    if (run.pendingEvent) { this._showEvent(); return; }
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
          data, enemyDef, combat:saved.combat, relicState:saved.relicState || {}, iceHits:saved.iceHits || {}, undo:saved.undo || null };
        GameState.board = saved.board;
        GameState.kinds = saved.kinds || Board.emptyKinds();
        GameState.portals = saved.portals || [];
        GameState.obstacleAge = saved.obstacleAge || {};
        GameState.bombTimers = saved.bombTimers || {};
        GameState.score = saved.score;
        GameState.mergeCount = saved.mergeCount;
        GameState.movesLeft = saved.movesLeft;
        GameState.movesMax = saved.movesMax;
        GameState.roomFinished = false;
        GameState.stuck = !!saved.stuck;
        const type = enemyDef.kind, def = ROOM_DEFS[type];
        const roomLabel = type === 'boss' ? I18n.t('enemy.' + enemyDef.id + '.name') : I18n.t('room.' + type);
        document.getElementById('roomName').innerHTML = `<span style="color:${def.color}">${Icons.svg(def.icon)}</span> ${roomLabel}`;
        Renderer.hideRoomOverlay(); Renderer.renderEnemy(true); Renderer.updateHUD();
        Renderer.updateActiveRelics(); Renderer.buildGrid(); showScreen('gameScreen');
        this._startClock(saved.clockRemaining);
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

    return Array.from({ length: 3 }, (_, floorIdx) => {
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

      // One merchant on a middle row, replacing a normal room.
      const candidateRows = [2,3].filter(r => rows[r].some(node => node.type === 'normal'));
      const shopRow = candidateRows.length ? Rng.pick(candidateRows) : 2 + Rng.int(2);
      const normalCols = rows[shopRow].map((node, col) => node.type === 'normal' ? col : -1).filter(col => col >= 0);
      const shopCol = normalCols.length ? Rng.pick(normalCols) : Rng.int(COLS);
      if (!normalCols.length) rows[shopRow][shopCol].type = 'normal';
      rows[shopRow][shopCol].type = 'shop';

      // Last row connects to boss (index 0 in boss row)
      rows[ROWS - 1].forEach(node => { node.connections = [0]; });

      // Boss row (single node)
      const bosses = ENEMIES.filter(e => e.floor === floorIdx && e.kind === 'boss');
      rows.bossId = bosses[Rng.int(bosses.length)].id;
      rows.push([{ type: 'boss', bossId:rows.bossId, available: false, completed: false, connections: [] }]);

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
    const ownedTags = new Set(GameState.run?.relics.flatMap(r => r.tags || []) || []);
    const n = Math.min(count, remaining.length);
    for (let i = 0; i < n; i++) {
      const weights = remaining.map(r => {
        const w = RARITY_WEIGHTS[r.rarity];
        let base = w ? w[fi] : 30;
        if (synergyLvl > 0 && (r.rarity === 'epic' || r.rarity === 'legendary')) {
          base += synergyLvl * 10;
        }
        return base * (r.tags?.some(tag => ownedTags.has(tag)) ? 1.3 : 1);
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
    this._stopClock();
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
    if (roomData.type === 'shop')    { this._doShopRoom(); return; }
    if (roomData.type === 'mystery') { this._doMysteryRoom(); return; }

    this._startBattleRoom(roomData.type, floorIdx);
  },

  _startBattleRoom(type, floorIdx) {
    const run = GameState.run;
    const m   = GameState.meta;
    GameState.spellTarget = null;
    GameState.stuck = false;

    const bossId = GameState.run.floors?.[floorIdx]?.bossId || GameState.room.data?.bossId || ['jailer','smith','eye'][floorIdx];
    const enemy = GameState.room.enemyDef || (type === 'boss' ? ENEMIES.find(e => e.id === bossId) : Combat.pick(floorIdx, type));
    GameState.room.enemyDef = enemy;
    GameState.room.combat = Combat.create(enemy);
    if (type === 'boss' && run.bossHpMult > 1) {
      GameState.room.combat.maxHp = Math.ceil(GameState.room.combat.maxHp * run.bossHpMult);
      GameState.room.combat.hp = GameState.room.combat.maxHp;
    }
    const base = (type === 'boss' ? [50,56,62] : type === 'elite' ? [40,44,48] : [36,40,44])[floorIdx];
    // Meta bonuses
    const moveCtx = { base, bonus: (m.upgrades.extraMoves || 0) * 2, type, floorIdx };
    if (type === 'boss') moveCtx.bonus += Math.floor(base * (m.upgrades.mastery || 0) * 0.1);
    // Relic hooks modify bonus
    RelicHooks.fire('onMovesCalc', moveCtx);
    if (run.nextFight) { moveCtx.bonus += run.nextFight.movesDelta || 0; delete run.nextFight; }
    GameState.movesMax  = moveCtx.base + moveCtx.bonus;
    GameState.movesLeft = GameState.movesMax;
    GameState.score      = 0;
    GameState.mergeCount = 0;
    GameState.roomFinished = false;
    GameState.room.relicState = {};
    GameState.room.iceHits = {};
    GameState.room.undo = null;

    // Build board
    GameState.board = Board.empty();
    GameState.kinds = Board.emptyKinds();
    GameState.portals = [];
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
    if (floorIdx === 2) GameState.portals = Board.createPortals(GameState.board);
    if (enemy.id === 'stareater') Combat.placeVoid(GameState.room.combat,GameState.board,GameState.portals);

    // Render room UI
    const def = ROOM_DEFS[type];
    const roomLabel = type === 'boss' ? I18n.t('enemy.' + enemy.id + '.name') : I18n.t('room.' + type);
    document.getElementById('roomName').innerHTML = `<span style="color:${def.color}">${Icons.svg(def.icon)}</span> ${roomLabel}`;
    Renderer.renderEnemy(true);
    Renderer.hideRoomOverlay();
    Renderer.updateHUD();
    Renderer.updateActiveRelics();
    Renderer.buildGrid();

    showScreen('gameScreen');
    this._startClock();
    Storage.saveRun(GameState.run);

    // Defer first render to ensure grid is visible and has correct dimensions
    requestAnimationFrame(() => { Fx.resize(); Renderer.renderTiles(); });
  },

  _doRestRoom() {
    GameState.run.gold += 5;
    this._completeCurrentRoom();
    Storage.saveRun(GameState.run);
    this._showRestChoice();
  },

  _showRestChoice() {
    const sealed = GameState.run.relics.some(r => r.id === 'sealed');
    const choices = sealed ? [] : this._pickRandom(this._getUnownedRelics(), 2);
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

  pickRestMeditate() {
    if (!this.chargeAllSpells()) return;
    const cb = GameState._restDone;
    GameState._restDone = null;
    if (cb) cb();
  },

  _doShopRoom() {
    const run = GameState.run;
    run.pendingRoom = {floorIdx:GameState.room.floorIdx,rowIdx:GameState.room.rowIdx,nodeIdx:GameState.room.nodeIdx};
    const relics = this._pickRandom(this._getUnownedRelics().filter(r => !r.isCurse), 3);
    const price = value => this.shopPrice(value);
    const spells = SPELLS.filter(s => !run.spells.some(owned => owned.id === s.id));
    run.pendingShop = [
      ...relics.map(r => ({ type:'relic', id:r.id, price:price({ common:35, rare:55, epic:80, legendary:120 }[r.rarity]), bought:false })),
      ...(spells.length ? [{ type:'spell', id:Rng.pick(spells).id, price:price(45), bought:false }] : []),
      { type:'charge', price:price(20), bought:false },
      { type:'heal', price:price(40), bought:false },
      { type:'cleanse', price:price(60), bought:false },
    ];
    Storage.saveRun(run);
    this._showShop();
  },

  _showShop() {
    Renderer.renderShop();
    showScreen('shopScreen');
    Scene.set('shop');
  },

  shopAvailable(offer) {
    const run = GameState.run;
    if (offer.bought || run.gold < offer.price) return false;
    if (offer.type === 'spell') return run.spells.length < 2 && !run.spells.some(s => s.id === offer.id);
    if (offer.type === 'charge') return run.spells.some(s => s.charges < this.spellCapacity());
    if (offer.type === 'heal') return run.hearts < 3;
    if (offer.type === 'cleanse') return run.relics.some(r => r.isCurse);
    return !run.relics.some(r => r.id === offer.id);
  },

  buyShop(index) {
    const run = GameState.run, offer = run.pendingShop?.[index];
    if (!offer || !this.shopAvailable(offer)) return false;
    run.gold -= offer.price;
    if (offer.type === 'relic') this._grantRelic(RELICS.find(r => r.id === offer.id));
    if (offer.type === 'spell') run.spells.push({ id:offer.id, charges:2 });
    if (offer.type === 'charge') this.chargeAllSpells();
    if (offer.type === 'heal') run.hearts++;
    if (offer.type === 'cleanse') {
      const index = run.relics.findLastIndex(r => r.isCurse);
      run.relics.splice(index,1); RelicHooks.invalidate();
    }
    offer.bought = true;
    Storage.saveRun(run);
    Renderer.renderShop(true);
    Audio2.relic();
    return true;
  },

  leaveShop() {
    if (!GameState.run?.pendingShop) return;
    delete GameState.run.pendingShop;
    this._completeCurrentRoom();
    delete GameState.run.pendingRoom;
    Storage.saveRun(GameState.run);
    Renderer.renderMap(); showScreen('mapScreen');
  },

  _doMysteryRoom() {
    const run = GameState.run;
    run.pendingRoom = {floorIdx:GameState.room.floorIdx,rowIdx:GameState.room.rowIdx,nodeIdx:GameState.room.nodeIdx};
    let pool = EVENTS.filter(event => !run.seenEvents.includes(event.id));
    if (!pool.length) { run.seenEvents = []; pool = EVENTS; }
    const event = Rng.pick(pool);
    run.seenEvents.push(event.id);
    run.pendingEvent = { id:event.id, stage:'choice' };
    Storage.saveRun(run);
    this._showEvent();
  },

  _showEvent() {
    Renderer.renderEvent();
    showScreen('eventScreen');
  },

  eventOptionStatus(id, option) {
    const run = GameState.run;
    if ((id === 'peddler' && option === 'buy') && (run.gold < 30 || run.spells.length >= 2))
      return run.spells.length >= 2 ? 'slots' : 'gold';
    if (id === 'peddler' && option === 'sell' && run.hearts < 2) return 'hearts';
    if (id === 'fountain' && option === 'toss' && run.gold < 10) return 'gold';
    if (id === 'ambush' && option === 'flee' && run.gold < 15) return 'gold';
    if (id === 'dice' && option === 'betGold' && run.gold < 20) return 'gold';
    if (id === 'dice' && option === 'betHeart' && run.hearts < 1) return 'hearts';
    if (id === 'altar' && option === 'pray' && !run.spells.some(s => s.charges < this.spellCapacity())) return 'charges';
    return null;
  },

  // Never hand out a relic the run already owns (hooks would fire twice): fall back to any unowned
  // relic, then to gold of matching value.
  _eventRelic(rarity) {
    const unowned = this._getUnownedRelics().filter(r => !r.isCurse);
    const pool = unowned.filter(r => r.rarity === rarity);
    const pick = pool.length ? Rng.pick(pool) : unowned.length ? Rng.pick(unowned) : null;
    if (!pick) { GameState.run.gold += { common:15, rare:25, epic:40, legendary:60 }[rarity] || 15; return false; }
    this._grantRelic(pick);
    return true;
  },

  chooseEvent(option) {
    const run = GameState.run, pending = run?.pendingEvent;
    if (!pending || pending.stage !== 'choice' || !EVENTS.find(e => e.id === pending.id)?.options.includes(option)
      || this.eventOptionStatus(pending.id,option)) return false;
    const id = pending.id;
    let outcome = `${id}.${option}`;
    if (id === 'altar') {
      if (option === 'take') {
        this._eventRelic('rare');
        const curses = RELICS.filter(r => r.isCurse && !run.relics.some(x => x.id === r.id));
        if (curses.length) this._grantRelic(Rng.pick(curses));
      }
      if (option === 'pray') this.chargeAllSpells();
    } else if (id === 'peddler') {
      if (option === 'buy') {
        const pool = SPELLS.filter(s => !run.spells.some(x => x.id === s.id));
        if (pool.length) { run.gold -= 30; run.spells.push({ id:Rng.pick(pool).id, charges:2 }); outcome = 'peddler.bought'; }
      }
      if (option === 'sell') { run.hearts--; run.gold += 40; }
    } else if (id === 'fountain') {
      if (option === 'drink') { if (run.hearts < 3) { run.hearts++; outcome = 'fountain.healed'; } else { run.gold += 15; outcome = 'fountain.gold'; } }
      if (option === 'toss') { run.gold -= 10; outcome = Rng.next() < .5 && this._eventRelic('common') ? 'fountain.found' : 'fountain.empty'; }
    } else if (id === 'chest') {
      if (option === 'force' || option === 'disarm') run.gold += 30;
      if (option === 'force') { if (Rng.next() < .5) { run.hearts--; outcome = 'chest.hurt'; } else outcome = 'chest.safe'; }
      if (option === 'disarm') run.nextFight = { movesDelta:-6 };
    } else if (id === 'ambush') {
      if (option === 'fight') {
        delete run.pendingEvent;
        delete run.pendingRoom;
        run.pendingAmbushRare = true;
        GameState.room.enemyDef = Combat.pick(GameState.room.floorIdx,'normal');
        this._startBattleRoom('normal',GameState.room.floorIdx);
        return true;
      }
      if (option === 'flee') run.gold -= 15;
    } else if (id === 'library') {
      if (option === 'pages') run.gold += 12;
      if (option === 'study') {
        const pool = SPELLS.filter(s => !run.spells.some(x => x.id === s.id));
        if (run.spells.length < 2 && pool.length) {
          pending.stage = 'spell';
          pending.spells = this._pickEventSpells(pool,2);
          Storage.saveRun(run); this._showEvent(); return true;
        }
        this.chargeAllSpells();
      }
    } else if (id === 'pact') {
      if (option === 'sign') { this._eventRelic('epic'); run.bossHpMult = Math.max(run.bossHpMult || 1,1.15); }
    } else if (id === 'dice') {
      if (option === 'betGold') { run.gold -= 20; if (Rng.next() < .5) { run.gold += 45; outcome = 'dice.goldWin'; } else outcome = 'dice.goldLose'; }
      if (option === 'betHeart' && Rng.next() < .5) { this._eventRelic('rare'); outcome = 'dice.heartWin'; }
      else if (option === 'betHeart') { run.hearts--; outcome = 'dice.heartLose'; }
    }
    pending.stage = 'outcome'; pending.outcome = outcome;
    if (run.hearts <= 0) { delete run.pendingEvent; this._endRun(false); return true; }
    Storage.saveRun(run); this._showEvent();
    return true;
  },

  _pickEventSpells(pool,count) {
    const remaining = [...pool], picks = [];
    while (remaining.length && picks.length < count) picks.push(remaining.splice(Rng.int(remaining.length),1)[0].id);
    return picks;
  },

  chooseLibrarySpell(id) {
    const pending = GameState.run?.pendingEvent;
    if (pending?.stage !== 'spell' || !pending.spells.includes(id) || GameState.run.spells.length >= 2) return false;
    GameState.run.spells.push({ id, charges:2 });
    pending.stage = 'outcome'; pending.outcome = 'library.learned';
    Storage.saveRun(GameState.run); this._showEvent(); return true;
  },

  continueEvent() {
    if (GameState.run?.pendingEvent?.stage !== 'outcome') return;
    delete GameState.run.pendingEvent;
    this._completeCurrentRoom();
    delete GameState.run.pendingRoom;
    Storage.saveRun(GameState.run);
    Renderer.renderMap(); showScreen('mapScreen');
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
  _rescueIds() { return GameState.movesLeft > 0 ? ['smash','swap','undo'] : ['undo']; },

  spellAvailable(owned) {
    return !!owned && owned.charges > 0 && Spells.canCast(GameState,owned.id)
      && (!GameState.stuck || this._rescueIds().includes(owned.id));
  },

  _firstSpellCell(id, targets) {
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++)
      if (Spells.valid(GameState,id,r,c,targets)) return [r,c];
    return null;
  },

  selectSpell(slot) {
    const gs = GameState;
    if (!gs.run || !gs.room?.combat || gs.roomFinished || !document.getElementById('gameScreen').classList.contains('active')
      || document.querySelector('.modal-backdrop.show, .room-overlay.show') || gs.spellBusy
      || document.getElementById('gameTiles').getAnimations?.({subtree:true}).some(animation =>
        animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime))) return false;
    const owned = gs.run.spells[slot];
    if (!this.spellAvailable(owned)) return false;
    if (gs.spellTarget?.slot === slot) { this.cancelSpell(); return true; }
    const def = SPELLS.find(s => s.id === owned.id);
    if (!def) return false;
    gs.spellTarget = def.targets ? {slot, targets:[], cursor:this._firstSpellCell(owned.id,[])} : null;
    if (!def.targets) return this._castSpell(slot,[]);
    Renderer.renderSpells();
    return true;
  },

  cancelSpell() { GameState.spellTarget = null; Renderer.renderSpells(); },

  moveTargetCursor(dir) {
    const target = GameState.spellTarget;
    if (!target?.cursor) return false;
    const [dr,dc] = {left:[0,-1],right:[0,1],up:[-1,0],down:[1,0]}[dir] || [0,0];
    target.cursor = [Math.max(0,Math.min(GRID_SIZE-1,target.cursor[0]+dr)),
      Math.max(0,Math.min(GRID_SIZE-1,target.cursor[1]+dc))];
    Renderer.renderSpells();
    return true;
  },

  confirmSpellCursor() {
    const cursor = GameState.spellTarget?.cursor;
    return cursor ? this.targetSpell(...cursor) : false;
  },

  targetSpell(r,c) {
    const target = GameState.spellTarget;
    if (!target) return false;
    if (typeof document !== 'undefined' && document.querySelector?.('.modal-backdrop.show, .room-overlay.show')) return false;
    const id = GameState.run.spells[target.slot].id;
    if (!Spells.valid(GameState,id,r,c,target.targets)) return false;
    target.targets.push([r,c]);
    if (target.targets.length === SPELLS.find(s => s.id === id).targets)
      return this._castSpell(target.slot,target.targets);
    target.cursor = this._firstSpellCell(id,target.targets);
    Renderer.renderSpells();
    return true;
  },

  _castSpell(slot,targets) {
    const gs = GameState, spell = gs.run.spells[slot];
    if (gs.roomFinished || (typeof document !== 'undefined' && document.querySelector?.('.modal-backdrop.show, .room-overlay.show'))) return false;
    if (!spell || spell.charges <= 0 || !Spells.apply(gs,spell.id,targets)) return false;
    gs.run.spells[slot].charges = Math.max(0, gs.run.spells[slot].charges - 1);
    gs.spellTarget = null;
    if (spell.id === 'undo' && gs.room.combat.id === 'clockmaker') this._resetClock();
    for (const [r,c] of targets) {
      const at = Fx.cellCenter(r,c);
      if (at) Fx.burst(at.x,at.y,'#d4a843',12);
    }
    Audio2.relic();
    if (spell.id === 'pivot' || spell.id === 'undo') Renderer.renderPortals();
    Renderer.renderTiles(); Renderer.renderEnemy(); Renderer.updateHUD(); Renderer.renderSpells();
    this._checkFailure();
    Storage.saveRun(gs.run);
    return true;
  },

  /** @returns {'success'|'buzz'|null} haptic to fire */
  move(inputDir) {
    const gs = GameState;
    if (!gs.run || !gs.room?.combat || gs.roomFinished || gs.movesLeft <= 0 || gs.spellTarget || gs.spellBusy
      || (typeof document !== 'undefined' && document.getElementById('gameScreen')?.classList && !document.getElementById('gameScreen').classList.contains('active'))
      || (typeof document !== 'undefined' && document.querySelector('.modal-backdrop.show, .room-overlay.show'))) return null;
    const fight = gs.room.combat;
    if (Combat.isLocked(fight, inputDir)) {
      Fx.nudge(inputDir); Audio2.bump(); return 'buzz';
    }
    const dir = Combat.direction(fight, inputDir);
    const before = Spells.snapshot(gs);
    const result = Board.applyMove(gs.board, dir, {
      kinds: gs.kinds,
      iceHits: gs.room.iceHits,
      forgedEntropyLvl: gs.meta.upgrades.forgedEntropy || 0,
      deepForgeChance: (gs.meta.upgrades.deepForge || 0) * 0.1,
    });
    if (!result) {
      Fx.nudge(inputDir); Audio2.bump();
      if (!Combat.hasLegalMove(fight, gs.board, gs.kinds)) this._checkFailure();
      return 'buzz';
    }
    RelicHooks.fire('onIceThaw',{kinds:gs.kinds,iceHits:gs.room.iceHits,result});
    gs.score += result.score;
    gs.mergeCount += result.merges.length;
    gs.run.totalScore += result.score;
    if (result.merges.length) gs.run.lastTileVal = result.merges[result.merges.length - 1].val;

    const moveCtx = { result, board: gs.board, movesLeft: gs.movesLeft, addMove: 0, freeMove: false };
    RelicHooks.fire('onAfterMove', moveCtx);
    gs.movesLeft += moveCtx.addMove;
    if (!moveCtx.freeMove) {
      gs.room.undo = before;
      RelicHooks.fire('onMoveCommitted', { result, board: gs.board });
      if (result.merges.length >= 3 && this.chargeSpell()) {
        const at = Fx.cellCenter(result.merges[0].r,result.merges[0].c);
        if (at) { Fx.float(at.x,at.y,'1 ✦'); const label = document.querySelector('.grid-wrap .fx-float:last-of-type'); if (label) label.style.color = '#d4a843'; }
      }
    }

    const goldFromTiles = result.merges.reduce((sum, merge) => {
      if (merge.gold) merge.gold = Math.max(1, Math.floor(merge.val / 8));
      return sum + merge.gold;
    }, 0);
    const goldCtx = { gold: Math.floor(result.score / 100) + goldFromTiles, merges: result.merges,
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
    const broken = this.breakHazards(fight, gs.board, result.merges, gs.bombTimers);
    for (const { r,c,kind } of broken) {
      const at = Fx.cellCenter(r,c);
      if (at) Fx.burst(at.x, at.y, kind === 'bomb' ? '#c44a3a' : '#9fb3c8', 14);
    }
    result.teleported = Board.applyPortals(gs.board, gs.kinds, gs.bombTimers, gs.portals);
    const consumed = Combat.consumeVoid(fight,gs.board,gs.kinds);
    if (consumed) {
      Renderer.voidConsume(consumed);
      const at = Fx.cellCenter(consumed.r,consumed.c);
      if (at) Fx.burst(at.x,at.y,'#9a6ae0',12);
    }
    const hit = this.damage(fight, result.merges);
    if (hit.dealt > 0) Renderer.enemyHit(hit.dealt);
    const phaseChanged = Combat.phase(fight, gs.room.enemyDef);
    if (fight.id === 'necromancer' && fight.phase === 1 && fight.hp <= 0) {
      Combat.revive(fight); Renderer.phaseBanner('combat.revive');
    } else if (phaseChanged) Renderer.phaseBanner();
    if (!moveCtx.freeMove) gs.movesLeft--;
    if (!moveCtx.freeMove && fight.id === 'clockmaker') this._resetClock();
    if (fight.hp <= 0) {
      this._winRoom(result, dir);
      return 'buzz';
    }

    if (!moveCtx.freeMove && fight.id === 'colossus') Board.gravity(gs.board,gs.kinds,gs.bombTimers);
    const exploded = Board.tickBombs(gs.board, gs.bombTimers, gs.kinds);
    for (let i = 0; i < exploded; i++) {
      Combat.bombExploded(fight);
      const bombCtx={fight,damage:0}; RelicHooks.fire('onBombExplosion',bombCtx);
      fight.hp=Math.max(0,fight.hp-bombCtx.damage);
    }
    if (fight.hp <= 0) { this._winRoom(result,dir); return 'buzz'; }
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
    const effect = moveCtx.freeMove ? null : Combat.resolve(fight, gs.board, gs.bombTimers, gs.room.floorIdx, gs.kinds, gs.portals,gs.room.iceHits,gs.obstacleAge);
    if (effect) RelicHooks.fire('onEnemyIntent', { effect, board:gs.board, bombTimers:gs.bombTimers });
    if (effect?.strike) {
      gs.movesLeft = Math.max(0, gs.movesLeft - effect.strike);
      Renderer.strike(effect.strike);
    }
    if (effect) {
      Renderer.intentFired();
      if (effect.intent === 'flip' || effect.intent === 'flipv' || effect.intent === 'void') Renderer.renderPortals();
    }
    this._renderAfterMove(result, dir);
    Renderer.renderEnemy();
    Storage.saveRun(gs.run);
    this._checkFailure();
    return result.merges.length ? 'success' : null;
  },

  _checkFailure(force = false) {
    const gs = GameState;
    if (gs.roomFinished) return false;
    if (!force && gs.movesLeft > 0 && Combat.hasLegalMove(gs.room.combat, gs.board, gs.kinds)) {
      if (gs.stuck) { gs.stuck = false; Renderer.renderSpells(); Storage.saveRun(gs.run); }
      return false;
    }
    const exhCtx = { movesLeft:0, consumed:false, overlayIcon:'', overlayTitle:'', overlaySub:'' };
    RelicHooks.fire('onMovesExhausted', exhCtx);
    if (exhCtx.consumed) {
      gs.movesLeft = exhCtx.movesLeft;
      gs.stuck = false;
      // Persist the rescue, or a reload would restore the battle at 0 moves.
      Storage.saveRun(gs.run);
      Renderer.showRoomOverlay('phoenix', exhCtx.overlaySub);
      document.getElementById('overlayIcon').innerHTML = Icons.svg(exhCtx.overlayIcon);
      document.getElementById('overlayTitle').textContent = exhCtx.overlayTitle;
      setTimeout(() => Renderer.hideRoomOverlay(), 2400);
      Renderer.updateHUD();
      return false;
    }
    if (!force && gs.run.spells.some(spell => spell.charges > 0 && this._rescueIds().includes(spell.id)
      && Spells.canCast(gs,spell.id))) {
      gs.stuck = true;
      Renderer.renderSpells();
      Storage.saveRun(gs.run);
      return false;
    }
    gs.stuck = false;
    gs.spellTarget = null;
    gs.roomFinished = true;
    this._stopClock();
    delete gs.run.pendingAmbushRare;
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
    gs.stuck = false;
    gs.roomFinished = true;
    this._stopClock();
    const type = gs.room.data.type;
    const reward = type === 'boss' ? [12,16,20][gs.room.floorIdx] : type === 'elite' ? 12 : 8;
    const leftover = Combat.leftoverGold(gs.movesLeft);
    const endCtx = { won:true, type, floorIdx:gs.room.floorIdx, goldBonus:0,
      goldMultiplier:1, roomReward:reward + leftover };
    RelicHooks.fire('onRoomEnd', endCtx);
    const total = Math.floor((endCtx.roomReward + endCtx.goldBonus) * endCtx.goldMultiplier);
    gs.run.gold += total + (gs.meta.upgrades.goldBonus || 0) * 2;
    if (gs.run.pendingAmbushRare) {
      this._eventRelic('rare');
      delete gs.run.pendingAmbushRare;
    }
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
    Renderer.renderTiles(newSet, mergedSet, dir, result.teleported || [], result.thawed || []);
    Fx.merges(result.merges);
    for (const merge of result.merges) {
      if (!merge.gold) continue;
      const at = Fx.cellCenter(merge.r, merge.c);
      if (!at) continue;
      Fx.burst(at.x, at.y, '#d4a843', 10);
      Fx.float(at.x, at.y, merge.gold);
      const label = document.querySelector('.grid-wrap .fx-float:last-of-type');
      if (label) label.style.color = '#d4a843';
    }
    for (const {r,c} of result.thawed || []) {
      const at = Fx.cellCenter(r,c);
      if (at) Fx.burst(at.x, at.y, '#bfe3ff', 14);
    }
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
