'use strict';

const _screens = {};
function showScreen(id) {
  // Cache screen elements on first use
  if (!_screens._all) {
    _screens._all = document.querySelectorAll('.screen');
  }
  _screens._all.forEach(s => s.classList.remove('active'));
  if (!_screens[id]) _screens[id] = document.getElementById(id);
  _screens[id].classList.add('active');
  _screens[id].scrollTop = 0;
  Scene.forScreen(id);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    _screens[id].animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}], {duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
}

const Renderer = {
  // ── Grid ──
  buildGrid() {
    this._geoCache = null;
    this._prevBoard = null;
    this._tilePool = [];
    this._tilePoolIdx = 0;
    document.getElementById('gameTiles').innerHTML = '';
    Fx.clear();
    const grid = document.getElementById('gameGrid');
    grid.innerHTML = '';
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const cell = document.createElement('div');
      cell.className = 'gcell';
      grid.appendChild(cell);
    }
    Fx.resize();
  },

  _geoCache: null,

  invalidateGeoCache() { this._geoCache = null; },

  getTileGeometry() {
    if (this._geoCache) return this._geoCache;
    const grid = document.getElementById('gameGrid');
    const firstCell = grid.querySelector('.gcell');
    if (!firstCell) return null;
    // Read actual rendered position from first cell
    const gridRect = grid.parentElement.getBoundingClientRect();
    const cellRect = firstCell.getBoundingClientRect();
    const cellSize = cellRect.width;
    const originX = cellRect.left - gridRect.left;
    const originY = cellRect.top - gridRect.top;
    const gap = GRID_SIZE > 1 ? (grid.querySelector('.gcell:nth-child(2)').getBoundingClientRect().left - cellRect.right) : GRID_GAP;
    this._geoCache = {
      cellSize,
      left: (c) => originX + c * (cellSize + gap),
      top:  (r) => originY + r * (cellSize + gap),
    };
    return this._geoCache;
  },

  _prevBoard: null,

  // Direction search offsets: to find where a tile came from, search opposite to move
  _searchDir: { left:[0,1], right:[0,-1], up:[1,0], down:[-1,0] },

  // Tile pool: reuse DOM elements instead of rebuilding each move
  _tilePool: [],
  _tilePoolIdx: 0,

  _getTile(container) {
    if (this._tilePoolIdx < this._tilePool.length) {
      const tile = this._tilePool[this._tilePoolIdx++];
      tile.style.display = '';
      return tile;
    }
    const tile = document.createElement('div');
    container.appendChild(tile);
    this._tilePool.push(tile);
    this._tilePoolIdx++;
    return tile;
  },

  renderTiles(newPositions = new Set(), mergedPositions = new Set(), dir = null) {
    const container = document.getElementById('gameTiles');
    const geo = this.getTileGeometry();
    if (!geo) return;

    this._tilePoolIdx = 0;

    const board = GameState.board;
    const prev = this._prevBoard;
    const srcBoard = prev ? prev.map(row => [...row]) : null;
    const searchOffset = dir ? this._searchDir[dir] : null;

    board.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val === 0) return;

        const key = `${r},${c}`;
        const { cellSize, left, top } = geo;
        const tile = this._getTile(container);

        let cls = 'tile ';
        let label = String(val);

        if (val === TILE.OBSTACLE) {
          cls += 't-obstacle';
          const age = GameState.obstacleAge?.[`${r},${c}`];
          const ttl = GameState.room?.combat?.seals?.[key];
          label = ttl !== undefined ? `${Icons.svg('obstacle')}<small class="seal-ttl">${ttl}</small>`
            : age !== undefined ? `${3 - age}` : Icons.svg('obstacle');
        }
        else if (val === TILE.BOMB) {
          cls += 't-bomb';
          const timer = GameState.bombTimers?.[key];
          label = `${Icons.svg('bomb')}${timer !== undefined ? timer : ''}`;
          if (timer !== undefined && timer <= 3) cls += ' bomb-imminent';
        }
        else { cls += `t${Math.min(val, 2048)}`; }

        if (newPositions.has(key))    cls += ' is-new';
        if (mergedPositions.has(key)) cls += ' is-merged';

        const fs = val >= 1024 ? cellSize * 0.28
                 : val >= 128  ? cellSize * 0.34
                 :               cellSize * 0.42;

        // Find source position: search in opposite direction of move
        let srcR = r, srcC = c;
        if (srcBoard && searchOffset && !newPositions.has(key) && val !== TILE.OBSTACLE) {
          const [dr, dc] = searchOffset;
          for (let step = 0; step < GRID_SIZE; step++) {
            const sr = r + dr * step;
            const sc = c + dc * step;
            if (sr < 0 || sr >= GRID_SIZE || sc < 0 || sc >= GRID_SIZE) break;
            if (srcBoard[sr][sc] === TILE.OBSTACLE) break;
            if (srcBoard[sr][sc] !== 0) {
              srcR = sr;
              srcC = sc;
              srcBoard[sr][sc] = 0;
              break;
            }
          }
        }

        const finalLeft = left(c);
        const finalTop = top(r);
        const dx = left(srcC) - finalLeft;
        const dy = top(srcR) - finalTop;

        tile.className = cls.trim();
        if (!tile.firstElementChild) tile.appendChild(document.createElement('div'));
        const face = tile.firstElementChild;
        face.className = 'tile-face';
        face.innerHTML = val === TILE.BOMB || (val === TILE.OBSTACLE && GameState.obstacleAge?.[key] === undefined) ? label : String(label);
        // transition:none prevents the reused pool tile from animating the initial offset
        tile.style.cssText = `width:${cellSize}px;height:${cellSize}px;left:${finalLeft}px;top:${finalTop}px;font-size:${fs}px;transition:none;`
          + (dx || dy ? `transform:translate(${dx}px,${dy}px);` : '');
        tile.style.setProperty('--glow', val >= 64 ? `${Math.min(22, Math.log2(val) * 2)}px` : '0px');
      });
    });

    // Hide unused pool tiles
    for (let i = this._tilePoolIdx; i < this._tilePool.length; i++) {
      this._tilePool[i].style.display = 'none';
    }

    // Force reflow so the browser commits the offset positions with transition:none
    container.offsetHeight;
    // Re-enable transition and remove transforms → CSS transition animates the slide
    for (let i = 0; i < this._tilePoolIdx; i++) {
      const tile = this._tilePool[i];
      tile.style.transition = '';
      if (tile.style.transform) tile.style.transform = '';
    }

    this._prevBoard = board.map(row => [...row]);
  },

  // ── HUD ──
  updateHUD() {
    const gs = GameState;
    document.getElementById('hudScore').textContent = gs.score;
    document.getElementById('hudGold').textContent  = gs.run.gold;
    const pct = gs.movesMax > 0 ? (gs.movesLeft / gs.movesMax) * 100 : 0;
    const fill = document.getElementById('movesFill');
    fill.style.width = pct + '%';
    fill.className = 'moves-fill' + (pct <= 30 ? ' danger' : '');
    document.getElementById('movesText').textContent = `${gs.movesLeft}/${gs.movesMax}`;
    const hearts = document.getElementById('hudHearts');
    const count = gs.run.hearts ?? 3;
    hearts.setAttribute('aria-label', I18n.t('hud.hearts', { n:count }));
    hearts.innerHTML = Array.from({ length:3 }, (_, i) => `<span class="hud-heart ${i < count ? 'full' : 'empty'} ${this._prevHearts !== undefined && i === count && count < this._prevHearts ? 'is-lost' : ''}">${Icons.svg('heart')}</span>`).join('');
    this._prevHearts = count;
    const fight = gs.room?.combat;
    document.getElementById('invertTag').textContent = fight?.invertTurns ? I18n.t('hud.inverted', { n:fight.invertTurns }) : '';
    document.querySelector('.grid-wrap').classList.toggle('is-inverted', !!fight?.invertTurns);
    document.querySelectorAll('[data-dir]').forEach(btn => btn.classList.toggle('is-locked', !!fight && Combat.isLocked(fight, btn.dataset.dir)));
  },

  renderEnemy(first = false) {
    const room = GameState.room, fight = room.combat, def = room.enemyDef;
    const panel = document.getElementById('enemyPanel');
    panel.classList.toggle('is-boss', def.kind === 'boss');
    panel.classList.toggle('is-phase2', fight.phase === 2);
    panel.classList.toggle('is-dead', fight.hp <= 0);
    document.getElementById('enemyEmblem').innerHTML = Icons.svg('e-' + def.id);
    document.getElementById('enemyEmblem').style.color = ROOM_DEFS[def.kind].color;
    document.getElementById('enemyName').textContent = I18n.t(def.kind === 'boss' ? 'boss.name.' + def.floor : 'enemy.' + def.id);
    document.getElementById('enemyHp').innerHTML = `${fight.hp} / ${fight.maxHp}` +
      (fight.block ? ` <span class="enemy-block">${Icons.svg('i-shield')} ${fight.block}</span>` : '');
    const width = `${fight.hp / fight.maxHp * 100}%`;
    for (const id of ['enemyHpFill','enemyHpGhost']) {
      const el = document.getElementById(id);
      if (first) el.style.transition = 'none';
      el.style.width = width;
      if (first) requestAnimationFrame(() => { el.style.transition = ''; });
    }
    const intent = Combat.intent(fight), base = intent === 'seal2' ? 'seal' : intent;
    const arrow = fight.intentDirection ? { left:'←', right:'→', up:'↑', down:'↓' }[fight.intentDirection] : '';
    const chip = document.getElementById('enemyIntent');
    chip.innerHTML = `${Icons.svg('i-' + base)} <span>${I18n.t('intent.' + base, { n:room.floorIdx === 2 ? 3 : 2, arrow })} · ${I18n.t('intent.in', { n:fight.intentIn })}</span>`;
    chip.classList.toggle('is-imminent', fight.intentIn === 1);
  },

  enemyHit(damage) {
    const panel = document.getElementById('enemyPanel');
    panel.classList.remove('is-hit'); void panel.offsetWidth; panel.classList.add('is-hit');
    const el = document.createElement('div');
    el.className = 'fx-float enemy-damage'; el.textContent = `−${damage}`;
    el.style.left = '50%'; el.style.top = '40%'; panel.appendChild(el);
    setTimeout(() => el.remove(), 950);
  },
  intentFired() {
    const chip = document.getElementById('enemyIntent');
    chip.classList.remove('did-fire'); void chip.offsetWidth; chip.classList.add('did-fire');
    setTimeout(() => chip.classList.remove('did-fire'), 400);
  },
  strike(n) {
    const el = document.getElementById('movesText');
    el.classList.remove('is-struck'); void el.offsetWidth; el.classList.add('is-struck');
    const label = document.querySelector('.moves-label');
    const fl = document.createElement('span'); fl.className = 'fx-float strike-float'; fl.textContent = `−${n}`;
    label.appendChild(fl); setTimeout(() => fl.remove(), 950);
  },
  phaseBanner() {
    const el = document.getElementById('phaseBanner');
    el.textContent = I18n.t('combat.phase2');
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  },

  updateActiveRelics() {
    const el = document.getElementById('activeRelics');
    el.innerHTML = GameState.run.relics
      .map(r => `<div class="active-relic-icon rarity-${r.rarity}" title="${I18n.t('relic.' + r.id + '.name')}: ${I18n.t('relic.' + r.id + '.desc')}">${Icons.svg(r.icon)}</div>`)
      .join('');
  },

  // ── Room overlay ──
  showRoomOverlay(mode, sub) {
    const icon  = document.getElementById('overlayIcon');
    const title = document.getElementById('overlayTitle');
    const sub_el = document.getElementById('overlaySub');
    const btn   = document.getElementById('overlayBtn');

    if (mode === 'phoenix') {
      icon.innerHTML = Icons.svg('flame');
      icon.style.color = 'var(--red)';
      title.textContent = I18n.t('overlay.phoenix');
      title.style.color = 'var(--red)';
      sub_el.textContent  = sub;
      btn.style.display = 'none';
    } else {
      icon.innerHTML = Icons.svg(mode === 'success' ? 'sparkle' : 'death');
      icon.style.color = mode === 'success' ? 'var(--gold)' : 'var(--red)';
      title.textContent = mode === 'success' ? I18n.t('overlay.victory') :
        GameState.overlayMode === 'retryBoss' || GameState.overlayMode === 'failedRoom' ? I18n.t('overlay.loseHeart') : I18n.t('overlay.defeat');
      title.style.color = mode === 'success' ? 'var(--gold)' : 'var(--red)';
      sub_el.textContent  = sub;
      btn.style.display = '';
      btn.textContent = GameState.overlayMode === 'retryBoss' ? I18n.t('ui.btn.retryBoss') : I18n.t('ui.btn.continue');
    }
    document.getElementById('roomOverlay').classList.add('show');
  },

  hideRoomOverlay() {
    document.getElementById('roomOverlay').classList.remove('show');
  },

  // ── Map ──
  renderMap() {
    const gs = GameState;
    document.getElementById('mapFloorLabel').textContent = `${I18n.t('map.floor', { n: GameState.run.floorIdx + 1 })} · ${I18n.t('floor.name.' + Math.min(GameState.run.floorIdx, 2))}`;
    document.getElementById('mapGold').innerHTML = `${Icons.svg('gold')} ${gs.run.gold}`;

    // Relics
    const relicsEl = document.getElementById('mapRelics');
    if (gs.run.relics.length === 0) {
      relicsEl.innerHTML = `<span class="text-sm text-muted">${I18n.t('map.noRelics')}</span>`;
    } else {
      relicsEl.innerHTML = '';
      gs.run.relics.forEach(r => {
        const chip = document.createElement('div');
        chip.className = 'relic-chip rarity-' + r.rarity + (r.isCurse ? ' is-curse' : '');
        const rName = I18n.t(`relic.${r.id}.name`);
        const rDesc = I18n.t(`relic.${r.id}.desc`);
        chip.innerHTML = `${Icons.svg(r.icon)} <span>${rName}</span>`;
        chip.addEventListener('click', () => this.showRelicTooltip(r.icon, rName, rDesc, r.rarity));
        relicsEl.appendChild(chip);
      });
    }

    // Map — connected node graph for current floor
    const mapEl = document.getElementById('floorMap');
    mapEl.innerHTML = '';

    const fi    = gs.run.floorIdx;
    const floor = gs.run.floors[fi];

    const NODE_W   = 52;
    const NODE_GAP = 6;
    const COLS     = 3;
    const totalW   = COLS * NODE_W + (COLS - 1) * NODE_GAP;
    const colX     = col => col * (NODE_W + NODE_GAP) + NODE_W / 2;

    const makeNode = (roomData, rowIdx, nodeIdx) => {
      const def = ROOM_DEFS[roomData.type];
      const node = document.createElement('div');
      const cls = ['room-node'];
      if (roomData.available)                                  cls.push('available');
      if (roomData.completed)                                  cls.push('completed');
      if (!roomData.available && !roomData.completed)          cls.push('locked');
      if (roomData.type === 'boss')                            cls.push('boss');
      node.className = cls.join(' ');
      node.innerHTML = `<span style="color:${def.color}">${roomData.completed ? '✓' : Icons.svg(def.icon)}</span><span class="room-label" style="color:${def.color}">${I18n.t('room.' + roomData.type)}</span>`;
      if (roomData.available) node.addEventListener('click', () => Controller.enterRoom(fi, rowIdx, nodeIdx));
      return node;
    };

    const makeSVG = (srcRow, isBossNext) => {
      const ns  = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('width', totalW);
      svg.setAttribute('height', '20');
      svg.style.cssText = 'display:block;margin:0 auto';

      srcRow.forEach((node, col) => {
        (node.connections || []).forEach(tc => {
          const line = document.createElementNS(ns, 'line');
          line.setAttribute('x1', colX(col));
          line.setAttribute('y1', 0);
          line.setAttribute('x2', isBossNext ? totalW / 2 : colX(tc));
          line.setAttribute('y2', 20);
          // Highlight active path
          const isActive = node.completed;
          line.setAttribute('stroke', isActive ? 'rgba(212,168,67,0.45)' : 'rgba(255,255,255,0.08)');
          line.setAttribute('stroke-width', isActive ? '2' : '1');
          svg.appendChild(line);
        });
      });
      return svg;
    };

    floor.forEach((row, rowIdx) => {
      // Node row
      const rowDiv = document.createElement('div');
      rowDiv.className = 'floor-row';
      row.forEach((roomData, nodeIdx) => rowDiv.appendChild(makeNode(roomData, rowIdx, nodeIdx)));
      mapEl.appendChild(rowDiv);

      // Connection SVG to next row
      if (rowIdx < floor.length - 1) {
        const isBossNext = floor[rowIdx + 1].length === 1 && floor[rowIdx + 1][0].type === 'boss';
        mapEl.appendChild(makeSVG(row, isBossNext));
      }
    });
  },

  // ── Title ──
  renderTitle() {
    const m = GameState.meta;
    document.getElementById('s-runs').textContent = m.totalRuns;
    document.getElementById('s-best').textContent = m.bestFloor;
    document.getElementById('s-gold').textContent = m.totalGold;
    I18n.renderSoundToggle();

    // Ascension badge
    const ascBadge = document.getElementById('ascensionBadge');
    if (m.ascensionLevel > 0) {
      ascBadge.textContent = I18n.t('meta.ascension', { n: m.ascensionLevel });
      ascBadge.style.display = '';
    } else {
      ascBadge.style.display = 'none';
    }

    const lines = META_DEFS
      .filter(u => (u.ascReq || 0) <= m.ascensionLevel && (m.upgrades[u.id] || 0) > 0)
      .map(u => u.getEffect(m.upgrades[u.id]));

    const pi = document.getElementById('passiveInfo');
    pi.innerHTML = lines.length
      ? `<strong>${I18n.t('title.activePassives')}</strong> ` + lines.join(' · ')
      : I18n.t('title.noUpgrades');

    // Show "Continuer" only if an active run exists
    const hasRun = !!GameState.run;
    document.getElementById('btnContinueRun').style.display = hasRun ? '' : 'none';
    document.getElementById('btnStartRun').className = hasRun ? 'btn' : 'btn btn-primary';
  },

  // ── Meta ──
  renderMeta() {
    const m = GameState.meta;
    document.getElementById('metaGold').textContent = m.permanentGold;

    // Ascension info
    const ascInfo = document.getElementById('metaAscInfo');
    if (m.ascensionLevel > 0) {
      ascInfo.textContent = I18n.t('meta.ascension', { n: m.ascensionLevel });
      ascInfo.style.display = '';
    } else {
      ascInfo.style.display = 'none';
    }

    const list = document.getElementById('metaList');
    list.innerHTML = '';

    // Group visible upgrades by ascension tier
    const visible = META_DEFS.filter(u => (u.ascReq || 0) <= m.ascensionLevel);
    let lastAsc = -1;

    visible.forEach(u => {
      // Section header for new ascension tier
      if (u.ascReq > 0 && u.ascReq !== lastAsc) {
        lastAsc = u.ascReq;
        const header = document.createElement('div');
        header.className = 'meta-section-header';
        header.textContent = I18n.t('meta.ascension', { n: u.ascReq });
        list.appendChild(header);
      }

      const lvl     = m.upgrades[u.id] || 0;
      const maxed   = lvl >= u.maxLvl;
      const cost    = maxed ? 0 : u.costs[lvl];
      const locked  = !maxed && m.permanentGold < cost;

      const card = document.createElement('div');
      const cls = ['meta-card'];
      if (maxed)  cls.push('is-maxed');
      if (locked) cls.push('is-locked');
      card.className = cls.join(' ');

      const dots = Array.from({ length: u.maxLvl }, (_, i) =>
        `<div class="level-dot${i < lvl ? ' on' : ''}"></div>`
      ).join('');

      card.innerHTML = `
        <div class="meta-icon">${Icons.svg(u.icon)}</div>
        <div class="meta-info">
          <div class="meta-name">${I18n.t('meta.' + u.id + '.name')}</div>
          <div class="meta-desc">${I18n.t('meta.' + u.id + '.desc')}</div>
          ${lvl > 0 ? `<div class="meta-current">${u.getEffect(lvl)}</div>` : ''}
          <div class="level-dots">${dots}</div>
        </div>
        <div class="meta-cost${maxed ? ' maxed' : ''}">${maxed ? I18n.t('meta.max') : `${Icons.svg('gold')}${cost}`}</div>`;

      if (!maxed) card.addEventListener('click', () => Controller.buyUpgrade(u.id, card));
      list.appendChild(card);
    });

    // Ascension button
    const ascBtn = document.getElementById('btnAscend');
    if (m.ascensionLevel < MAX_ASCENSION) {
      const cost = ASCENSION_COSTS[m.ascensionLevel];
      const canAscend = Controller.canAscend();
      ascBtn.style.display = '';
      ascBtn.innerHTML = `${Icons.svg('ascend')} ${I18n.t('meta.ascension', { n: m.ascensionLevel + 1 })} — ${Icons.svg('gold')}${cost}`;
      ascBtn.className = canAscend ? 'btn btn-ascend' : 'btn btn-ascend is-locked';
      ascBtn.disabled = !canAscend;
    } else {
      ascBtn.style.display = 'none';
    }
  },

  // ── Relic choice ──
  renderRelicChoice(choices) {
    const container = document.getElementById('relicChoices');
    container.innerHTML = '';
    choices.forEach((relic, index) => {
      const card = document.createElement('div');
      card.className = `relic-card rarity-${relic.rarity}`;
      card.innerHTML = `
        <div class="relic-card-header">
          <div class="relic-icon">${Icons.svg(relic.icon)}</div>
          <div>
            <div class="relic-name">${I18n.t('relic.' + relic.id + '.name')}</div>
            <div class="relic-rarity rarity-${relic.rarity}">${relic.rarity}</div>
          </div>
        </div>
        <div class="relic-desc">${I18n.t('relic.' + relic.id + '.desc')}</div>
        <div class="relic-effect">→ ${I18n.t('relic.' + relic.id + '.effect')}</div>`;
      card.addEventListener('click', () => Controller.pickRelic(relic));
      container.appendChild(card);
      this.animateRelicCard(card, index);
    });
  },

  animateRelicCard(card, index) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    card.animate([{transform:'translateY(24px) scale(.94)',opacity:0},{transform:'none',opacity:1}],
      {duration:360,delay:index * 70,easing:'cubic-bezier(.34,1.56,.64,1)',fill:'backwards'});
    if (card.classList.contains('rarity-legendary')) card.animate([
      {boxShadow:'0 0 0 rgba(212,168,67,0)'},
      {boxShadow:'0 0 28px rgba(212,168,67,.55)'},
      {boxShadow:'0 0 12px rgba(212,168,67,.25)'},
    ], {duration:1200,delay:index * 70});
  },

  // ── Rest choice (relics + shop option) ──
  renderRestChoice(choices) {
    document.getElementById('relicGoldInfo').textContent = I18n.t('rest.goldBonus');
    // Render relic cards
    this.renderRelicChoice(choices);

    // Add shop button after relic cards
    const container = document.getElementById('relicChoices');
    const shopCard = document.createElement('div');
    shopCard.className = 'relic-card rest-shop-card';
    shopCard.innerHTML = `
      <div class="relic-card-header">
        <div class="relic-icon">${Icons.svg('castle')}</div>
        <div>
          <div class="relic-name">${I18n.t('rest.shopName')}</div>
          <div class="relic-rarity rarity-common">${I18n.t('rest.shopRarity')}</div>
        </div>
      </div>
      <div class="relic-desc">${I18n.t('rest.shopDesc')}</div>
      <div class="relic-effect">${Icons.svg('gold')} ${I18n.t('rest.shopGold', { n: GameState.meta.permanentGold + GameState.run.gold })}</div>`;
    shopCard.addEventListener('click', () => Controller.pickRestShop());
    container.appendChild(shopCard);
    this.animateRelicCard(shopCard, choices.length);

    if ((GameState.run.hearts ?? 3) < 3) {
      const healCard = document.createElement('div');
      healCard.className = 'relic-card rest-heal-card';
      healCard.innerHTML = `<div class="relic-card-header"><div class="relic-icon">${Icons.svg('heart')}</div><div class="relic-name">${I18n.t('rest.healName')}</div></div><div class="relic-desc">${I18n.t('rest.healDesc')}</div>`;
      healCard.addEventListener('click', () => Controller.pickRestHeal());
      container.appendChild(healCard);
      this.animateRelicCard(healCard, choices.length + 1);
    }

    // Hide skip button for rest (player must choose)
    document.getElementById('btnSkipRelic').style.display = 'none';
  },

  // ── End screen ──
  renderEndScreen(win, abandoned) {
    document.getElementById('endIcon').innerHTML = Icons.svg(win ? 'crown' : abandoned ? 'abandon' : 'death');
    document.getElementById('endIcon').style.color = win ? 'var(--gold)' : 'var(--red)';
    const title = document.getElementById('endTitle');
    title.textContent = win ? I18n.t('end.victory') : abandoned ? I18n.t('end.abandon') : I18n.t('end.defeat');
    title.className = 'end-title ' + (win ? 'win' : '');

    const gs = GameState;
    const r = gs.run || { gold:0, totalScore:0, relics:[], floorIdx:0 };
    document.getElementById('endStats').innerHTML = `
      <div class="end-stat"><div class="end-stat-val">${r.gold}</div><div class="end-stat-label">${Icons.svg('gold')} ${I18n.t('end.goldGained')}</div></div>
      <div class="end-stat"><div class="end-stat-val">${r.totalScore}</div><div class="end-stat-label">${I18n.t('end.totalScore')}</div></div>
      <div class="end-stat"><div class="end-stat-val">${r.floorIdx + 1}/3</div><div class="end-stat-label">${I18n.t('end.floorReached')}</div></div>
      <div class="end-stat"><div class="end-stat-val">${r.relics.length}</div><div class="end-stat-label">${I18n.t('end.relics')}</div></div>`;
    document.getElementById('endSeed').textContent = r.seed === undefined ? '' : `${I18n.t('end.seed')} : ${r.seed}`;

    const rel = document.getElementById('endRelics');
    rel.innerHTML = r.relics.length
      ? r.relics.map(x => `<div class="relic-chip rarity-${x.rarity}${x.isCurse ? ' is-curse' : ''}">${Icons.svg(x.icon)} ${I18n.t('relic.' + x.id + '.name')}</div>`).join('')
      : `<span class="text-sm text-muted">${I18n.t('end.noRelics')}</span>`;
  },

  // ── Relic tooltip ──
  showRelicTooltip(icon, name, desc, rarity) {
    document.getElementById('relicTTIcon').className = `relic-tt-icon rarity-${rarity}`;
    document.getElementById('relicTTIcon').innerHTML = Icons.svg(icon);
    document.getElementById('relicTTName').textContent = name;
    document.getElementById('relicTTDesc').textContent = desc;
    const el = document.getElementById('relicTooltip');
    el.classList.add('show');
    el.addEventListener('click', () => el.classList.remove('show'), { once: true });
  },

  // ── Mystery modal ──
  showMysteryModal(icon, title, sub, onClose) {
    document.getElementById('mysteryIcon').innerHTML = Icons.svg(icon);
    document.getElementById('mysteryTitle').textContent = title;
    document.getElementById('mysterySub').textContent   = sub;
    // Show map behind modal first so closing lands on correct screen
    Renderer.renderMap();
    showScreen('mapScreen');
    const modal = document.getElementById('mysteryModal');
    modal.classList.add('show');
    document.getElementById('btnMysteryClose').onclick = () => {
      modal.classList.remove('show');
      onClose();
    };
  },
};
