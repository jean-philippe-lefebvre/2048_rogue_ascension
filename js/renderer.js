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
}

const Renderer = {
  // ── Grid ──
  buildGrid() {
    this._geoCache = null;
    const grid = document.getElementById('gameGrid');
    grid.innerHTML = '';
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const cell = document.createElement('div');
      cell.className = 'gcell';
      grid.appendChild(cell);
    }
  },

  _geoCache: null,

  invalidateGeoCache() { this._geoCache = null; },

  getTileGeometry() {
    if (this._geoCache) return this._geoCache;
    const grid = document.getElementById('gameGrid');
    const w = grid.offsetWidth;
    const cellSize = (w - GRID_PAD * 2 - GRID_GAP * (GRID_SIZE - 1)) / GRID_SIZE;
    this._geoCache = {
      cellSize,
      left: (c) => GRID_PAD + c * (cellSize + GRID_GAP),
      top:  (r) => GRID_PAD + r * (cellSize + GRID_GAP),
    };
    return this._geoCache;
  },

  renderTiles(newPositions = new Set(), mergedPositions = new Set()) {
    const container = document.getElementById('gameTiles');
    container.innerHTML = '';
    const geo = this.getTileGeometry();

    GameState.board.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val === 0) return;

        const key = `${r},${c}`;
        const { cellSize, left, top } = geo;
        const tile = document.createElement('div');

        let cls = 'tile ';
        let label = String(val);

        if      (val === TILE.OBSTACLE) {
          cls += 't-obstacle';
          // Transmutation countdown
          const age = GameState.obstacleAge?.[`${r},${c}`];
          label = age !== undefined ? `${3 - age}` : '🧱';
        }
        else if (val === TILE.BOMB)     { cls += 't-bomb';     label = '💣'; }
        else                            { cls += `t${val}`; }

        if (newPositions.has(key))    cls += ' is-new';
        if (mergedPositions.has(key)) cls += ' is-merged';

        const fs = val >= 1024 ? cellSize * 0.28
                 : val >= 128  ? cellSize * 0.34
                 :               cellSize * 0.42;

        tile.className = cls.trim();
        tile.style.cssText = `width:${cellSize}px;height:${cellSize}px;left:${left(c)}px;top:${top(r)}px;font-size:${fs}px;`;
        tile.textContent = label;
        container.appendChild(tile);
      });
    });
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
  },

  updateActiveRelics() {
    const el = document.getElementById('activeRelics');
    el.innerHTML = GameState.run.relics
      .map(r => `<div class="active-relic-icon" title="${r.name}: ${r.desc}">${r.icon}</div>`)
      .join('');
  },

  // ── Room overlay ──
  showRoomOverlay(mode, sub) {
    const icon  = document.getElementById('overlayIcon');
    const title = document.getElementById('overlayTitle');
    const sub_el = document.getElementById('overlaySub');
    const btn   = document.getElementById('overlayBtn');

    if (mode === 'phoenix') {
      icon.textContent  = '🔥';
      title.textContent = 'PHÉNIX !';
      title.style.color = 'var(--red)';
      sub_el.textContent  = sub;
      btn.style.display = 'none';
    } else {
      icon.textContent  = mode === 'success' ? '✨' : '💀';
      title.textContent = mode === 'success' ? 'VICTOIRE !' : 'DÉFAITE';
      title.style.color = mode === 'success' ? 'var(--gold)' : 'var(--red)';
      sub_el.textContent  = sub;
      btn.style.display = '';
    }
    document.getElementById('roomOverlay').classList.add('show');
  },

  hideRoomOverlay() {
    document.getElementById('roomOverlay').classList.remove('show');
  },

  // ── Map ──
  renderMap() {
    const gs = GameState;
    document.getElementById('mapFloorLabel').textContent = `Étage ${GameState.run.floorIdx + 1} / 3`;
    document.getElementById('mapGold').textContent = gs.run.gold;

    // Relics
    const relicsEl = document.getElementById('mapRelics');
    if (gs.run.relics.length === 0) {
      relicsEl.innerHTML = '<span class="text-sm text-muted">Aucune relique</span>';
    } else {
      relicsEl.innerHTML = '';
      gs.run.relics.forEach(r => {
        const chip = document.createElement('div');
        chip.className = 'relic-chip' + (r.isCurse ? ' is-curse' : '');
        chip.innerHTML = `${r.icon} <span>${r.name}</span>`;
        chip.addEventListener('click', () => this.showRelicTooltip(r.icon, r.name, r.desc));
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
      node.innerHTML = `<span>${roomData.completed ? '✓' : def.icon}</span><span class="room-label" style="color:${def.color}">${def.label}</span>`;
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

    // Ascension badge
    const ascBadge = document.getElementById('ascensionBadge');
    if (m.ascensionLevel > 0) {
      ascBadge.textContent = `Ascension ${m.ascensionLevel}`;
      ascBadge.style.display = '';
    } else {
      ascBadge.style.display = 'none';
    }

    const lines = META_DEFS
      .filter(u => (u.ascReq || 0) <= m.ascensionLevel && (m.upgrades[u.id] || 0) > 0)
      .map(u => u.getEffect(m.upgrades[u.id]));

    const pi = document.getElementById('passiveInfo');
    pi.innerHTML = lines.length
      ? '<strong>Passifs actifs :</strong> ' + lines.join(' · ')
      : 'Aucune amélioration. Complète ta première run pour gagner de l\'or.';

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
      ascInfo.textContent = `Ascension ${m.ascensionLevel}`;
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
        header.textContent = `Ascension ${u.ascReq}`;
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
        <div class="meta-icon">${u.icon}</div>
        <div class="meta-info">
          <div class="meta-name">${u.name}</div>
          <div class="meta-desc">${u.desc}</div>
          ${lvl > 0 ? `<div class="meta-current">${u.getEffect(lvl)}</div>` : ''}
          <div class="level-dots">${dots}</div>
        </div>
        <div class="meta-cost${maxed ? ' maxed' : ''}">${maxed ? 'MAX' : `◈${cost}`}</div>`;

      if (!maxed && !locked) card.addEventListener('click', () => Controller.buyUpgrade(u.id));
      list.appendChild(card);
    });

    // Ascension button
    const ascBtn = document.getElementById('btnAscend');
    if (m.ascensionLevel < MAX_ASCENSION) {
      const cost = ASCENSION_COSTS[m.ascensionLevel];
      const canAscend = Controller.canAscend();
      ascBtn.style.display = '';
      ascBtn.textContent = `✦ Ascension ${m.ascensionLevel + 1} — ◈${cost}`;
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
    choices.forEach(relic => {
      const card = document.createElement('div');
      card.className = 'relic-card';
      card.innerHTML = `
        <div class="relic-card-header">
          <div class="relic-icon">${relic.icon}</div>
          <div>
            <div class="relic-name">${relic.name}</div>
            <div class="relic-rarity rarity-${relic.rarity}">${relic.rarity}</div>
          </div>
        </div>
        <div class="relic-desc">${relic.desc}</div>
        <div class="relic-effect">→ ${relic.effect}</div>`;
      card.addEventListener('click', () => Controller.pickRelic(relic));
      container.appendChild(card);
    });
  },

  // ── Rest choice (relics + shop option) ──
  renderRestChoice(choices) {
    document.getElementById('relicGoldInfo').textContent = '+5 or gagné';
    // Render relic cards
    this.renderRelicChoice(choices);

    // Add shop button after relic cards
    const container = document.getElementById('relicChoices');
    const shopCard = document.createElement('div');
    shopCard.className = 'relic-card rest-shop-card';
    shopCard.innerHTML = `
      <div class="relic-card-header">
        <div class="relic-icon">🏰</div>
        <div>
          <div class="relic-name">Forge du Destin</div>
          <div class="relic-rarity rarity-common">boutique</div>
        </div>
      </div>
      <div class="relic-desc">Acheter des améliorations permanentes avec ton or.</div>
      <div class="relic-effect">→ ◈${GameState.meta.permanentGold + GameState.run.gold} or disponible</div>`;
    shopCard.addEventListener('click', () => Controller.pickRestShop());
    container.appendChild(shopCard);

    // Hide skip button for rest (player must choose)
    document.getElementById('btnSkipRelic').style.display = 'none';
  },

  // ── End screen ──
  renderEndScreen(win, abandoned) {
    document.getElementById('endIcon').textContent  = win ? '👑' : abandoned ? '🏳' : '💀';
    const title = document.getElementById('endTitle');
    title.textContent = win ? 'VICTOIRE' : abandoned ? 'ABANDON' : 'DÉFAITE';
    title.className = 'end-title ' + (win ? 'win' : '');

    const gs = GameState;
    const r = gs.run || { gold:0, totalScore:0, relics:[], floorIdx:0 };
    document.getElementById('endStats').innerHTML = `
      <div class="end-stat"><div class="end-stat-val">${r.gold}</div><div class="end-stat-label">◈ Or gagné</div></div>
      <div class="end-stat"><div class="end-stat-val">${r.totalScore}</div><div class="end-stat-label">Score total</div></div>
      <div class="end-stat"><div class="end-stat-val">${r.floorIdx + 1}/3</div><div class="end-stat-label">Étage atteint</div></div>
      <div class="end-stat"><div class="end-stat-val">${r.relics.length}</div><div class="end-stat-label">Reliques</div></div>`;

    const rel = document.getElementById('endRelics');
    rel.innerHTML = r.relics.length
      ? r.relics.map(x => `<div class="relic-chip${x.isCurse ? ' is-curse' : ''}">${x.icon} ${x.name}</div>`).join('')
      : '<span class="text-sm text-muted">Aucune</span>';
  },

  // ── Relic tooltip ──
  showRelicTooltip(icon, name, desc) {
    document.getElementById('relicTTIcon').textContent = icon;
    document.getElementById('relicTTName').textContent = name;
    document.getElementById('relicTTDesc').textContent = desc;
    const el = document.getElementById('relicTooltip');
    el.classList.add('show');
    el.addEventListener('click', () => el.classList.remove('show'), { once: true });
  },

  // ── Mystery modal ──
  showMysteryModal(icon, title, sub, onClose) {
    document.getElementById('mysteryIcon').textContent  = icon;
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
