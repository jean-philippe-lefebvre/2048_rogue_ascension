'use strict';

const _screens = {};
function showScreen(id) {
  if (typeof Renderer !== 'undefined') Renderer.closeHud();
  // Cache screen elements on first use
  if (!_screens._all) {
    _screens._all = document.querySelectorAll('.screen');
  }
  _screens._all.forEach(s => s.classList.remove('active'));
  if (!_screens[id]) _screens[id] = document.getElementById(id);
  _screens[id].classList.add('active');
  _screens[id].scrollTop = 0;
  if (id === 'gameScreen') Renderer.renderRelicTray('combatRelicTray');
  if (id === 'mapScreen') Renderer.renderRelicTray('mapRelics');
  if (typeof GameState !== 'undefined' && GameState.run?.floorIdx === 3 && (id === 'mapScreen' || id === 'gameScreen'))
    Scene.set(id === 'gameScreen' ? 'b4' : 'f4');
  else Scene.forScreen(id);
  if (typeof Music !== 'undefined') Music.forScreen(id);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    _screens[id].animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}], {duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
}

const Renderer = {
  hudReturnFocus: null,
  trayVisibleCount(width, count) {
    const contentWidth = Math.max(0, width - 16);
    const capacity = Math.max(0, Math.floor((contentWidth + 2) / 27));
    let visible = Math.min(count, capacity);
    while (visible < count && visible > 0) {
      const badgeWidth = Math.max(36, 14 + 9 * (1 + String(count - visible).length));
      if (visible * 27 + badgeWidth <= contentWidth) break;
      visible--;
    }
    return visible;
  },
  relicState(relic, room, run) {
    const roomFlags = {shield:'_shieldUsed',tide:'_tideUsed',focus:'_focusUsed',vortex:'_vortexUsed'};
    if (room?.relicState?.[roomFlags[relic.id]]) return 'usedRoom';
    if (relic.id === 'phoenix') return run?._phoenixReady === false ? 'usedRun' : 'availableRun';
    if (relic.id === 'wildcard') return 'wildcard';
    return '';
  },
  renderRelicTray(id) {
    const tray = document.getElementById(id), relics = GameState.run?.relics || [];
    const width = tray.clientWidth;
    if (!width) return;
    const count = this.trayVisibleCount(width, relics.length);
    tray.innerHTML = relics.length ? relics.slice(0, count).map(r => `<span class="tray-icon rarity-${r.rarity}" title="${I18n.t('relic.'+r.id+'.name')}">${Icons.svg(r.icon)}</span>`).join('')
      + (relics.length > count ? `<span class="tray-more">+${relics.length-count}</span>` : '')
      : `<span class="tray-empty">${I18n.t('map.noRelics')}</span>`;
    tray.setAttribute('aria-label', `${I18n.t('hud.relics')} ${relics.length}`);
  },
  openHud(id, trigger) {
    this.closeHud(false);
    this.hudReturnFocus = trigger;
    document.getElementById('hudScrim').classList.add('show');
    const panel = document.getElementById(id);
    panel.inert = false;
    panel.classList.add('show');
    panel.focus();
  },
  closeHud(restore = true) {
    document.getElementById('hudScrim')?.classList.remove('show');
    document.querySelectorAll('.hud-sheet.show, .hud-pop.show').forEach(el => { el.classList.remove('show'); el.inert = true; });
    if (restore && this.hudReturnFocus?.isConnected) this.hudReturnFocus.focus();
    this.hudReturnFocus = null;
  },
  openRelicSheet(trigger) {
    this._relicFilter = '';
    document.getElementById('relicSheet').classList.remove('show-detail');
    this.renderRelicSheet();
    this.openHud('relicSheet', trigger);
  },
  renderRelicSheet() {
    const relics = GameState.run?.relics || [];
    const room = document.getElementById('gameScreen').classList.contains('active') ? GameState.room : null;
    document.getElementById('relicSheetTitle').textContent = `${I18n.t('hud.relics')} ${relics.length}`;
    const tags = ['gold','small','tempo','control','spell','blast','chain','corner'];
    document.getElementById('relicFilters').innerHTML = tags.map(tag => {
      const count = relics.filter(r => r.tags?.includes(tag)).length;
      return count ? `<button type="button" data-relic-filter="${tag}" aria-pressed="${this._relicFilter === tag}"><i class="family-dot fam-${tag}"></i>${I18n.t('family.'+tag)} ${count}</button>` : '';
    }).join('');
    document.getElementById('relicSheetGrid').innerHTML = relics.filter(r => !this._relicFilter || r.tags?.includes(this._relicFilter)).map(r => {
      const used = ['usedRoom','usedRun'].includes(this.relicState(r,room,GameState.run));
      return `<button type="button" data-relic-detail="${r.id}" class="${used ? 'used' : ''}"><span class="rarity-${r.rarity}">${Icons.svg(r.icon)}</span><span>${I18n.t('relic.'+r.id+'.name')}</span></button>`;
    }).join('');
    document.querySelectorAll('#relicSheet [data-close-hud]').forEach(b => b.textContent = I18n.t('hud.close'));
  },
  showRelicDetail(id) {
    const relic = GameState.run?.relics.find(r => r.id === id);
    if (!relic) return;
    const room = document.getElementById('gameScreen').classList.contains('active') ? GameState.room : null;
    const state = this.relicState(relic, room, GameState.run);
    const stateText = state === 'wildcard' ? I18n.t('hud.wildcardState',{n:(GameState.run._wildcardMoves || 0)%12})
      : state ? I18n.t('hud.relicState.'+state) : '';
    document.getElementById('relicSheetDetail').innerHTML = `<button type="button" class="detail-back" data-relic-back>${I18n.t('hud.allRelics')}</button><div class="detail-icon rarity-${relic.rarity}">${Icons.svg(relic.icon)}</div><h3>${I18n.t('relic.'+id+'.name')}</h3><div class="detail-meta"><span class="relic-rarity rarity-${relic.rarity}">${I18n.t('rarity.'+relic.rarity)}</span>${this.familyChips(relic)}</div><p>${I18n.t('relic.'+id+'.desc')}</p>${stateText ? `<div class="detail-state">${stateText}</div>` : ''}`;
    document.getElementById('relicSheet').classList.add('show-detail');
    document.querySelector('[data-relic-back]').focus();
  },
  renderMenu() {
    document.getElementById('menuScore').textContent = `${I18n.t('hud.score')} ${GameState.score}`;
    document.getElementById('menuSound').textContent = I18n.t(GameState.meta.settings.sound === false ? 'settings.soundOff' : 'settings.soundOn');
    document.getElementById('menuMusic').textContent = I18n.t(GameState.meta.settings.music === false ? 'settings.musicOff' : 'settings.musicOn');
    document.getElementById('menuSound').setAttribute('aria-pressed', String(GameState.meta.settings.sound !== false));
    document.getElementById('menuMusic').setAttribute('aria-pressed', String(GameState.meta.settings.music !== false));
    document.getElementById('btnGameAbandon').textContent = I18n.t('hud.abandonRun');
    document.querySelectorAll('#combatMenuSheet [data-close-hud]').forEach(b => b.textContent = I18n.t('hud.close'));
  },
  openMenu(trigger) {
    this.renderMenu();
    this.openHud('combatMenuSheet',trigger);
  },
  openIntent(trigger) {
    const fight = GameState.room?.combat;
    if (!fight) return;
    const hidden = !this.intentVisible(fight,GameState.run.tier);
    const intent = Combat.intent(fight), base = hidden ? 'hidden' : intent === 'seal2' ? 'seal' : intent;
    const params = this.intentHelpParams(intent, fight, GameState.room.floorIdx, GameState.run.tier);
    const pop = document.getElementById('intentPop');
    const next = GameState.run.relics?.some(r => r.id === 'voideye') ? [1,2].map(offset => {
      const future = fight.pattern[(fight.patternIndex + offset) % fight.pattern.length];
      return `<p>${I18n.t('intent.next',{n:offset})}${I18n.t('ui.colon')}${I18n.t('intent.'+future,this.intentHelpParams(future,fight,GameState.room.floorIdx,GameState.run.tier))}</p>`;
    }).join('') : '';
    pop.innerHTML = `<h3>${Icons.svg('i-'+base)} ${hidden ? '???' : I18n.t('intent.'+intent,params)} · ${I18n.t(fight.intentIn === 1 ? 'hud.inMoves' : 'hud.inMovesPlural',{n:fight.intentIn})}</h3><p>${hidden ? I18n.t('intent.hidden.help') : I18n.t('intent.'+intent+'.help',params)}</p>${next}${fight.affix ? `<p>${I18n.t('affix.'+fight.affix+'.rule',{v:Board.base()*4})}</p>` : ''}<div class="pop-actions"><button type="button" data-close-hud>${I18n.t('hud.understood')}</button></div>`;
    pop.style.top = `${Math.min(window.innerHeight-pop.offsetHeight-16, document.getElementById('enemyPanel').getBoundingClientRect().bottom + 6)}px`;
    this.openHud('intentPop',trigger);
  },
  openSpell(slot, trigger) {
    const owned = GameState.run?.spells[slot];
    if (!owned) return;
    const def = SPELLS.find(s => s.id === owned.id), available = Controller.spellAvailable(owned);
    const reason = owned.charges <= 0 && !Controller.canGoldCast(owned) ? I18n.t(GameState.run.character === 'usurer' ? 'hud.noGoldCast' : 'hud.noCharges') : !available ? I18n.t(
      owned.id === 'undo' ? 'hud.noUndo' : ['joker','catalyst'].includes(owned.id) ? 'hud.boardFull' : 'hud.spellUnavailable') : '';
    const pop = document.getElementById('spellPop');
    pop.innerHTML = `<h3>${Icons.svg(def.icon)} ${I18n.t('spell.'+owned.id)} <span>${owned.charges} / ${Controller.spellCapacity()} ${I18n.t('hud.charges')}</span></h3><p>${I18n.t('spell.desc.'+owned.id)}</p><small>${I18n.t('hud.spellFree')}${def.targets ? ' '+I18n.t(def.targets === 2 ? 'spell.pickTwo' : 'spell.pickOne')+'.' : ''}</small>${reason ? `<small class="pop-reason">${reason}</small>` : ''}<div class="pop-actions"><button type="button" data-close-hud>${I18n.t('ui.btn.cancel')}</button><button type="button" class="pop-go" data-launch-spell="${slot}" ${available ? '' : 'disabled'}>${owned.charges === 0 ? I18n.t('hud.castGold') : I18n.t('hud.cast')}</button></div>`;
    pop.style.bottom = `${window.innerHeight-document.getElementById('spellBar').getBoundingClientRect().top+6}px`;
    this.openHud('spellPop',trigger);
  },
  intentHelpParams(intent, fight, floorIdx, tier, base = Board.base()) {
    const rank = {seal:4,seal2:4,bomb:4,freeze:3,devour:1}[intent] || 1;
    const n = intent === 'seal' || intent === 'seal2' ? (fight.id === 'jailer' ? 8 : 6)
      : (floorIdx >= 2 ? 3 : 2);
    const arrow = fight.intentDirection ? {left:'←',right:'→',up:'↑',down:'↓'}[fight.intentDirection] : '';
    return {n, v:base * 2 ** (rank - 1), arrow};
  },
  intentVisible(fight, tier) { return (typeof GameState !== 'undefined' && GameState.run?.relics?.some(r => r.id === 'voideye')) || tier < 4 || fight.intentIn <= 2; },
  tileClass(value) { return `t${Math.min(2 ** Board.rank(value), 2048)}`; },
  familyChips(relic) {
    return (relic.ascension ? `<span class="family-chip"><i class="family-dot fam-ascension"></i>${I18n.t('family.ascension')}</span>` : '') + (relic.tags || []).map(tag => `<span class="family-chip">${I18n.t('family.'+tag)}</span>`).join('');
  },
  renderCharacters() {
    this.renderTierSelector();
    const container=document.getElementById('characterChoices');
    container.innerHTML='';
    for(const character of CHARACTERS) {
      const card=document.createElement('button');
      const locked = !Controller.characterUnlocked(character.id);
      card.className='character-card' + (locked ? ' is-locked' : character.id === (Controller.selectedCharacter || 'alchemist') ? ' is-selected' : '');
      card.disabled = locked;
      card.innerHTML=locked
        ? `<span class="character-tier-badge">A${characterTier(GameState.meta,character.id)}</span><span class="character-icon">${Icons.svg('lock')}</span><span class="character-name">${I18n.t('character.'+character.id+'.name')}</span><span class="character-detail">${I18n.t('achievement.'+UNLOCKS[character.id]+'.condition')}</span>`
        : `<span class="character-tier-badge">A${characterTier(GameState.meta,character.id)}</span><span class="character-icon">${Icons.svg(character.icon)}</span><span class="character-name">${I18n.t('character.'+character.id+'.name')}</span><span class="character-detail">${I18n.t('character.relic')}${I18n.t('ui.colon')}${I18n.t('relic.'+character.relic+'.name')}</span><span class="character-detail">${I18n.t('character.spell')}${I18n.t('ui.colon')}${I18n.t('spell.'+character.spell)}</span><span class="character-detail">${I18n.t('character.'+character.id+'.passive')}</span>`;
      if (!locked) card.addEventListener('click',()=>Controller.selectCharacter(character.id));
      container.appendChild(card);
    }
    document.getElementById('btnCharacterBack').onclick=()=>showScreen('titleScreen');
    const confirm = document.getElementById('btnConfirmCharacter');
    confirm.textContent = I18n.t('character.start');
    confirm.onclick = () => Controller.chooseCharacter(Controller.selectedCharacter || 'alchemist');
  },
  renderTierSelector() {
    const tier = Controller.selectedTier ?? 0;
    document.getElementById('tierLabel').textContent = I18n.t('tier.label', { n:tier });
    document.getElementById('btnTierDown').disabled = tier <= 0;
    const unlocked = characterTier(GameState.meta,Controller.selectedCharacter || 'alchemist');
    document.getElementById('btnTierUp').disabled = tier >= Math.min(MAX_TIER, unlocked);
    const options = document.getElementById('tierOptions');
    options.innerHTML = '';
    for (let n = 0; n <= MAX_TIER; n++) {
      const button = document.createElement('button');
      button.className = 'tier-option' + (n === tier ? ' selected' : '');
      button.textContent = `A${n}`;
      button.disabled = n > unlocked;
      button.setAttribute('aria-label', I18n.t('tier.label', { n }));
      button.onclick = () => Controller.selectTier(n);
      options.appendChild(button);
    }
    const rules = document.getElementById('tierRules');
    rules.innerHTML = '';
    for (let n = tier; n >= 1; n--) {
      const line = document.createElement('div');
      line.className = [3,6,9,10].includes(n) ? 'tier-milestone' : '';
      line.textContent = `A${n} ${[3,6,9,10].includes(n) ? '★ ' : '· '}${I18n.t('tier.rule.' + n,{n:2*tier})}`;
      rules.appendChild(line);
    }
  },
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
    grid.style.setProperty('--n',GameState.size || GRID_SIZE);
    for (let i = 0; i < GameState.size * GameState.size; i++) {
      const cell = document.createElement('div');
      cell.className = 'gcell';
      if (GameState.portals?.some(([r,c]) => r * GameState.size + c === i)) {
        cell.classList.add('is-portal');
        cell.setAttribute('aria-label', I18n.t('tile.portal'));
      }
      if (GameState.room?.combat?.voidCell?.[0] === Math.floor(i/GameState.size)
        && GameState.room.combat.voidCell[1] === i%GameState.size) cell.classList.add('is-void');
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
    const gap = GameState.size > 1 ? (grid.querySelector('.gcell:nth-child(2)').getBoundingClientRect().left - cellRect.right) : GRID_GAP;
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

  renderTiles(newPositions = new Set(), mergedPositions = new Set(), dir = null, teleported = [], thawed = []) {
    const container = document.getElementById('gameTiles');
    const geo = this.getTileGeometry();
    if (!geo) return;

    this._tilePoolIdx = 0;

    const board = GameState.board;
    const prev = this._prevBoard;
    const srcBoard = prev ? prev.map(row => [...row]) : null;
    const searchOffset = dir ? this._searchDir[dir] : null;
    const teleportedSet = new Set(teleported.map(([r,c]) => `${r},${c}`));
    const thawedSet = new Set(thawed.map(({r,c}) => `${r},${c}`));

    board.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val === 0) return;

        const key = `${r},${c}`;
        const kind = GameState.kinds?.[r]?.[c];
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
        else if (val === TILE.JOKER) { cls += 't-joker'; label = '★'; }
        else if (val === TILE.MULT) { cls += 't-mult'; label = '×2'; }
        else { cls += this.tileClass(val); }

        if (kind === 'gold') cls += ' is-gold';
        if (kind === 'ice') cls += ' is-ice' + (GameState.room?.iceHits?.[key] ? ' is-cracked' : '');
        if (thawedSet.has(key)) cls += ' is-thawing';
        if (teleportedSet.has(key)) cls += ' is-teleported';

        if (newPositions.has(key))    cls += ' is-new';
        if (mergedPositions.has(key)) cls += ' is-merged';

        const rank = Board.rank(val);
        const scale = GameState.size === 5 ? 0.82 : 1;
        const fs = (rank >= 10 ? cellSize * 0.28
                 : rank >= 7  ? cellSize * 0.34
                 :              cellSize * 0.42) * scale;

        // Find source position: search in opposite direction of move
        let srcR = r, srcC = c;
        if (srcBoard && searchOffset && !newPositions.has(key) && val !== TILE.OBSTACLE) {
          const [dr, dc] = searchOffset;
          for (let step = 0; step < GameState.size; step++) {
            const sr = r + dr * step;
            const sc = c + dc * step;
            if (sr < 0 || sr >= GameState.size || sc < 0 || sc >= GameState.size) break;
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
        const accessible = kind === 'gold' ? I18n.t('tile.gold') : kind === 'ice' ? I18n.t('tile.ice')
          : val === TILE.JOKER ? I18n.t('tile.joker') : val === TILE.MULT ? I18n.t('tile.mult') : null;
        if (accessible) tile.setAttribute('aria-label', `${accessible}${val > 0 ? ` ${val}` : ''}`);
        else tile.removeAttribute('aria-label');
        if (!tile.firstElementChild) tile.appendChild(document.createElement('div'));
        const face = tile.firstElementChild;
        face.className = 'tile-face';
        face.innerHTML = val === TILE.BOMB || (val === TILE.OBSTACLE && GameState.obstacleAge?.[key] === undefined) ? label : String(label);
        // transition:none prevents the reused pool tile from animating the initial offset
        tile.style.cssText = `width:${cellSize}px;height:${cellSize}px;left:${finalLeft}px;top:${finalTop}px;font-size:${fs}px;transition:none;`
          + (dx || dy ? `transform:translate(${dx}px,${dy}px);` : '');
        tile.style.setProperty('--glow', rank >= 6 ? `${Math.min(22, rank * 2)}px` : '0px');
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
    document.getElementById('hudGold').innerHTML = `${Icons.svg('gold')} ${gs.run.gold}`;
    const pct = gs.movesMax > 0 ? (gs.movesLeft / gs.movesMax) * 100 : 0;
    const fill = document.getElementById('movesFill');
    fill.style.width = pct + '%';
    fill.className = 'moves-fill' + (pct <= 30 ? ' danger' : '');
    document.getElementById('movesText').textContent = `${gs.movesLeft}/${gs.movesMax}`;
    const hearts = document.getElementById('hudHearts');
    const count = gs.run.hearts ?? 3;
    hearts.setAttribute('aria-label', I18n.t('hud.hearts', { n:count }));
    hearts.innerHTML = Array.from({ length:Controller.maxHearts() }, (_, i) => `<span class="hud-heart ${i < count ? 'full' : 'empty'} ${this._prevHearts !== undefined && i === count && count < this._prevHearts ? 'is-lost' : ''}">${Icons.svg('heart')}</span>`).join('');
    this._prevHearts = count;
    const fight = gs.room?.combat;
    document.getElementById('invertTag').textContent = fight?.invertTurns ? I18n.t('hud.inverted', { n:fight.invertTurns }) : '';
    document.querySelector('.grid-wrap').classList.toggle('is-inverted', !!fight?.invertTurns);
    document.querySelectorAll('[data-dir]').forEach(btn => btn.classList.toggle('is-locked', !!fight && Combat.isLocked(fight, btn.dataset.dir)));
    this.renderSpells();
    this.updateActiveRelics();
  },

  renderSpells() {
    const bar = document.getElementById('spellBar');
    if (!bar || !GameState.run) return;
    const target = GameState.run.spells[GameState.spellTarget?.slot] ? GameState.spellTarget : null;
    bar.innerHTML = Array.from({length:Math.max(2, GameState.run.spells.length)}, (_,i) => {
      const owned = GameState.run.spells[i];
      if (!owned) return `<button class="spell-slot is-empty" type="button" disabled>${I18n.t('spell.empty')}</button>`;
      const def = SPELLS.find(s => s.id === owned.id);
      const goldCast = GameState.run.character === 'usurer' && owned.charges === 0;
      return `<button class="spell-slot ${target?.slot === i ? 'is-targeting' : ''}" type="button" data-spell-slot="${i}" ${goldCast && GameState.run.gold < 25 ? 'disabled' : ''}>${Icons.svg(def.icon)}<span>${I18n.t('spell.'+owned.id)}</span>${goldCast ? `<span class="spell-cost">${I18n.t('hud.castGold')}</span>` : `<span class="spell-dots">${Array.from({length:Controller.spellCapacity()},(_,n) => `<i class="${n < owned.charges ? 'filled' : ''}"></i>`).join('')}</span>`}</button>`;
    }).join('');
    const hint = document.getElementById('spellHint');
    hint.innerHTML = '';
    if (target) {
      const message = document.createElement('span');
      message.textContent = I18n.t(target.targets.length ? 'spell.pickTwo' : SPELLS.find(s => s.id === GameState.run.spells[target.slot].id).targets === 2 ? 'spell.pickTwo' : 'spell.pickOne');
      hint.appendChild(message);
      if (target.cursor) {
        const position = document.createElement('span');
        position.className = 'spell-cursor-announce';
        position.textContent = I18n.t('spell.cell',{r:target.cursor[0]+1,c:target.cursor[1]+1});
        hint.appendChild(position);
      }
    }
    if (GameState.stuck) {
      const message = document.createElement('span');
      message.textContent = I18n.t(GameState.movesLeft > 0 ? 'spell.stuckSlide' : 'spell.stuckMoves');
      hint.appendChild(message);
      const accept = document.createElement('button');
      accept.className = 'btn-ghost spell-accept';
      accept.dataset.acceptDefeat = '';
      accept.textContent = I18n.t('spell.acceptDefeat');
      hint.appendChild(accept);
    }
    document.querySelectorAll('#gameGrid .gcell').forEach((cell,i) => {
      const r = Math.floor(i/GameState.size), c = i%GameState.size;
      cell.classList.toggle('spell-valid',!!target && Spells.valid(GameState,GameState.run.spells[target.slot].id,r,c,target.targets));
      cell.classList.toggle('spell-cursor',!!target && target.cursor?.[0] === r && target.cursor?.[1] === c);
      if (target) cell.setAttribute('aria-label',I18n.t('spell.cell',{r:r+1,c:c+1}));
      else if (cell.classList.contains('is-portal')) cell.setAttribute('aria-label',I18n.t('tile.portal'));
      else cell.removeAttribute('aria-label');
    });
  },

  renderPortals() {
    document.querySelectorAll('#gameGrid .gcell').forEach((cell,i) => {
      const active = GameState.portals?.some(([r,c]) => r * GameState.size + c === i);
      cell.classList.toggle('is-portal',!!active);
      cell.classList.toggle('is-void',GameState.room?.combat?.voidCell?.[0] === Math.floor(i/GameState.size)
        && GameState.room.combat.voidCell[1] === i%GameState.size);
      if (active) cell.setAttribute('aria-label',I18n.t('tile.portal'));
      else cell.removeAttribute('aria-label');
    });
  },

  renderShop(animateGold = false) {
    const run = GameState.run, gold = document.getElementById('shopGold');
    const previous = Number(gold.dataset.value || run.gold);
    gold.dataset.value = run.gold;
    if (this._shopGoldRaf) cancelAnimationFrame(this._shopGoldRaf);
    gold.innerHTML = `${Icons.svg('gold')} <span>${run.gold}</span>`;
    if (animateGold && previous !== run.gold && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const number = gold.querySelector('span'), start = performance.now(), final = run.gold;
      const tick = now => {
        const progress = Math.min(1,(now-start)/300);
        number.textContent = Math.round(previous + (final-previous)*progress);
        if (progress < 1) this._shopGoldRaf = requestAnimationFrame(tick);
      };
      number.textContent = previous;
      this._shopGoldRaf = requestAnimationFrame(tick);
    }
    const container = document.getElementById('shopOffers');
    container.innerHTML = '';
    run.pendingShop.forEach((offer,index) => {
      const data = offer.type === 'relic' ? RELICS.find(r => r.id === offer.id) : offer.type === 'spell' ? SPELLS.find(s => s.id === offer.id) : null;
      const icon = data?.icon || {charge:'s-catalyst',heal:'heart',cleanse:'ev-altar'}[offer.type];
      const name = offer.type === 'relic' ? I18n.t('relic.'+offer.id+'.name') : offer.type === 'spell' ? I18n.t('spell.'+offer.id) : I18n.t('shop.'+offer.type);
      const desc = offer.type === 'relic' ? I18n.t('relic.'+offer.id+'.desc') : offer.type === 'spell' ? I18n.t('spell.desc.'+offer.id) : I18n.t('shop.desc.'+offer.type);
      const unavailable = offer.type === 'spell' && run.spells.length >= 2 ? I18n.t('shop.slotsFull') : '';
      const card = document.createElement('button');
      card.className = `relic-card shop-offer ${run.gold < offer.price ? 'is-unaffordable' : ''}`;
      card.disabled = !Controller.shopAvailable(offer);
      card.innerHTML = `<div class="relic-card-header"><div class="relic-icon">${Icons.svg(icon)}</div><div><div class="relic-name">${name}</div></div></div><div class="relic-desc">${desc}</div>${offer.type === 'relic' ? this.familyChips(data) : ''}<div class="shop-price ${run.gold < offer.price ? 'is-red' : ''}">${offer.bought ? I18n.t('shop.sold') : unavailable || `${Icons.svg('gold')} ${offer.price}`}</div>`;
      card.addEventListener('click',() => Controller.buyShop(index));
      container.appendChild(card);
    });
  },

  renderEvent() {
    const pending = GameState.run.pendingEvent, def = EVENTS.find(e => e.id === pending.id);
    document.getElementById('eventIcon').innerHTML = Icons.svg(def.icon);
    document.getElementById('eventTitle').textContent = I18n.t('event.'+def.id+'.title');
    document.getElementById('eventFlavour').textContent = I18n.t('event.'+def.id+'.flavour');
    const options = document.getElementById('eventOptions');
    options.innerHTML = '';
    document.getElementById('eventOutcome').textContent = pending.stage === 'outcome' ? I18n.t('event.outcome.'+pending.outcome) : '';
    document.getElementById('btnEventContinue').style.display = pending.stage === 'outcome' ? '' : 'none';
    if (pending.stage === 'outcome') return;
    const ids = pending.stage === 'spell' ? pending.spells : def.options;
    ids.forEach(option => {
      const reason = pending.stage === 'choice' ? Controller.eventOptionStatus(def.id,option) : null;
      const button = document.createElement('button');
      button.className = 'event-option'; button.disabled = !!reason;
      const label = pending.stage === 'spell' ? I18n.t('spell.'+option) : I18n.t(`event.${def.id}.${option}.label`);
      const consequence = pending.stage === 'spell' ? I18n.t('event.library.study.effect') : I18n.t(`event.${def.id}.${option}.effect`);
      button.innerHTML = `<span>${label}</span><small class="${/−|malédiction|curse/.test(consequence) ? 'is-cost' : ''}">${reason ? I18n.t('event.reason.'+reason) : consequence}</small>`;
      button.addEventListener('click',() => pending.stage === 'spell' ? Controller.chooseLibrarySpell(option) : Controller.chooseEvent(option));
      options.appendChild(button);
    });
  },

  renderEnemy(first = false) {
    const room = GameState.room, fight = room.combat, def = room.enemyDef;
    const panel = document.getElementById('enemyPanel');
    panel.classList.toggle('is-boss', def.kind === 'boss');
    panel.classList.toggle('is-phase2', fight.phase === 2);
    panel.classList.toggle('is-phase3', fight.phase === 3);
    panel.classList.toggle('is-dead', fight.hp <= 0);
    document.getElementById('enemyEmblem').innerHTML = Icons.svg('e-' + def.id);
    document.getElementById('enemyEmblem').style.color = ROOM_DEFS[def.kind].color;
    document.getElementById('enemyName').textContent = I18n.t(def.kind === 'boss' ? 'enemy.' + def.id + '.name' : 'enemy.' + def.id);
    document.getElementById('enemyHp').innerHTML = `${fight.hp} / ${fight.maxHp}` +
      (fight.block ? ` <span class="enemy-block">${Icons.svg('i-shield')} ${fight.block}</span>` : '');
    document.getElementById('enemyAffix').innerHTML = fight.affix
      ? `<span class="enemy-affix affix-${fight.affix}">${Icons.svg('a-'+fight.affix)} ${I18n.t('affix.'+fight.affix+'.name')}</span>` : '';
    const width = `${fight.hp / fight.maxHp * 100}%`;
    for (const id of ['enemyHpFill','enemyHpGhost']) {
      const el = document.getElementById(id);
      if (first) el.style.transition = 'none';
      el.style.width = width;
      if (first) requestAnimationFrame(() => { el.style.transition = ''; });
    }
    const intent = Combat.intent(fight), hidden = !this.intentVisible(fight,GameState.run.tier);
    const base = hidden ? 'hidden' : intent === 'seal2' ? 'seal' : intent;
    const params = this.intentHelpParams(intent, fight, room.floorIdx, GameState.run.tier);
    const chip = document.getElementById('enemyIntent');
    chip.innerHTML = `${Icons.svg('i-' + base)}<span class="intent-text">${hidden ? '???' : I18n.t('intent.' + intent, params)} · ${I18n.t(fight.intentIn === 1 ? 'hud.inMoves' : 'hud.inMovesPlural', { n:fight.intentIn })}</span><span class="intent-more" aria-hidden="true">?</span>`;
    chip.setAttribute('aria-label', `${hidden ? '???' : I18n.t('intent.' + intent, params)} · ${I18n.t(fight.intentIn === 1 ? 'hud.inMoves' : 'hud.inMovesPlural', { n:fight.intentIn })}`);
    const passive = def.id === 'colossus' ? 'gravity' : def.id === 'clockmaker' ? 'clock' : null;
    document.getElementById('enemyPassive').innerHTML = [passive ? I18n.t('combat.' + passive) : '', def.id === 'guardian' ? I18n.t('combat.threshold',{v:Board.base()*8}) : '', fight.reviveAvailable ? `<span class="phylactery" title="${I18n.t('combat.reviveAvailable')}">${Icons.svg('i-heal')} ${I18n.t('combat.reviveAvailable')}</span>` : ''].filter(Boolean).join(' · ');
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
    const label = document.querySelector('.moves-row');
    const fl = document.createElement('span'); fl.className = 'fx-float strike-float'; fl.textContent = `−${n}`;
    label.appendChild(fl); setTimeout(() => fl.remove(), 950);
  },
  phaseBanner(key = 'combat.phase2') {
    const el = document.getElementById('phaseBanner');
    el.textContent = I18n.t(key);
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._phaseBannerTimer);
    this._phaseBannerTimer = setTimeout(() => el.classList.remove('show'), 1200);
  },

  renderClock(fraction, remaining) {
    const ring = document.getElementById('movesClock');
    if (!ring) return;
    ring.classList.toggle('active',GameState.room?.combat?.id === 'clockmaker');
    ring.style.setProperty('--clock-progress', `${Math.max(0,fraction)*100}%`);
    ring.style.setProperty('--clock-color', remaining < 1.5 ? 'var(--red)' : '#d4a843');
  },
  voidConsume({r,c,value}) {
    const geo = this.getTileGeometry();
    if (!geo) return;
    const tile = document.createElement('div');
    tile.className = `tile ${this.tileClass(value)} is-void-consumed`;
    tile.style.cssText = `left:${geo.left(c)}px;top:${geo.top(r)}px;width:${geo.cellSize}px;height:${geo.cellSize}px;z-index:24;pointer-events:none`;
    tile.innerHTML = `<div class="tile-face">${value}</div>`;
    document.querySelector('.grid-wrap').appendChild(tile);
    setTimeout(() => tile.remove(),220);
  },

  updateActiveRelics() {
    this.renderRelicTray('combatRelicTray');
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
    document.getElementById('mapFloorLabel').textContent = GameState.run.floorIdx === 3
      ? I18n.t('map.summit')
      : `${I18n.t('map.floor', { n: GameState.run.floorIdx + 1 })} · ${I18n.t('floor.name.' + GameState.run.floorIdx)}`;
    document.getElementById('mapGold').innerHTML = `${Icons.svg('gold')} ${gs.run.gold}`;
    // The summit (floor IV) is a single, staged boss node.
    document.getElementById('mapScreen').classList.toggle('is-summit', GameState.run.floorIdx === 3);
    document.getElementById('floorMap').dataset.summitHint = I18n.t('map.summitHint');

    // Relics
    this.renderRelicTray('mapRelics');

    // Map – connected node graph for current floor
    const mapEl = document.getElementById('floorMap');
    mapEl.innerHTML = '';

    const cartographer = gs.run.character === 'cartographer';
    const currentFloor = gs.run.floorIdx;

    const NODE_W   = 52;
    const NODE_GAP = 6;
    const COLS     = 3;
    const totalW   = COLS * NODE_W + (COLS - 1) * NODE_GAP;
    const colX     = col => col * (NODE_W + NODE_GAP) + NODE_W / 2;

    const makeNode = (roomData, rowIdx, nodeIdx, fi) => {
      const def = ROOM_DEFS[roomData.type];
      const node = document.createElement('div');
      const cls = ['room-node'];
      if (roomData.available)                                  cls.push('available');
      if (roomData.completed)                                  cls.push('completed');
      if (!roomData.available && !roomData.completed)          cls.push('locked');
      if (roomData.type === 'boss')                            cls.push('boss');
      if (cartographer && ['normal','elite'].includes(roomData.type)) cls.push('has-enemy-emblem');
      node.className = cls.join(' ');
      const bossId = roomData.type === 'boss' ? roomData.bossId || ['jailer','smith','eye'][fi] : null;
      node.innerHTML = bossId
        ? `<span class="boss-emblem">${roomData.completed ? '✓' : Icons.svg('e-' + bossId)}</span><span class="room-label boss-name">${I18n.t('enemy.' + bossId + '.name')}</span>`
        : `<span style="color:${def.color}">${roomData.completed ? '✓' : Icons.svg(def.icon)}</span><span class="room-label" style="color:${def.color}">${I18n.t('room.' + roomData.type)}</span>${cartographer && ['normal','elite'].includes(roomData.type) ? `<span class="map-enemy-emblem">${Icons.svg('e-'+(roomData.enemyId || ENEMIES.find(e => e.floor === fi && e.kind === roomData.type).id))}</span>` : ''}`;
      if (fi === currentFloor && roomData.available) node.addEventListener('click', () => Controller.enterRoom(fi, rowIdx, nodeIdx));
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

    const visibleFloors = cartographer ? gs.run.floors.map((floor,fi) => ({floor,fi})).slice(currentFloor,currentFloor === 3 ? 4 : 3) : [{floor:gs.run.floors[currentFloor],fi:currentFloor}];
    for (const {floor,fi} of visibleFloors) {
      const section = document.createElement('div');
      section.className = 'map-floor-section' + (fi > currentFloor ? ' is-future' : '');
      if (cartographer) {
        const label = document.createElement('div');
        label.className = 'floor-label';
        label.textContent = fi === 3 ? I18n.t('map.summit') : `${I18n.t('map.floor',{n:fi+1})} · ${I18n.t('floor.name.'+fi)}`;
        section.appendChild(label);
      }
      floor.forEach((row, rowIdx) => {
        // Node row
        const rowDiv = document.createElement('div');
        rowDiv.className = 'floor-row';
        row.forEach((roomData, nodeIdx) => rowDiv.appendChild(makeNode(roomData, rowIdx, nodeIdx, fi)));
        section.appendChild(rowDiv);

        // Connection SVG to next row
        if (rowIdx < floor.length - 1) {
          const isBossNext = floor[rowIdx + 1].length === 1 && floor[rowIdx + 1][0].type === 'boss';
          section.appendChild(makeSVG(row, isBossNext));
        }
      });
      mapEl.appendChild(section);
    }
  },

  // ── Title ──
  renderTitle() {
    const m = GameState.meta;
    document.getElementById('s-runs').textContent = m.totalRuns;
    document.getElementById('s-best').textContent = m.bestFloor;
    document.getElementById('s-gold').textContent = m.totalGold;
    I18n.renderSoundToggle();
    I18n.renderMusicToggle();
    if (m.skin) document.body.dataset.skin = m.skin;
    else delete document.body.dataset.skin;
    const skinToggle = document.getElementById('skinToggle');
    if (skinToggle) {
      skinToggle.innerHTML = [{id:'',name:'gems'},...m.skins.map(id => ({id,name:id}))].map(({id,name}) => `<button type="button" class="lang-btn ${m.skin === (id || null) ? 'active' : ''}" data-select-skin="${id}" aria-pressed="${m.skin === (id || null)}">${I18n.t('skin.'+name)}</button>`).join('');
      skinToggle.onclick = event => {
        const button = event.target.closest('[data-select-skin]');
        if (!button) return;
        const selected = button.dataset.selectSkin;
        if (selected && !m.skins.includes(selected)) return;
        m.skin = selected || null;
        Storage.save(m);
        this.renderTitle();
      };
    }

    // Highest unlocked tier
    const ascBadge = document.getElementById('ascensionBadge');
    if (bestTier(m) > 0) {
      ascBadge.textContent = I18n.t('tier.label', { n: bestTier(m) });
      ascBadge.style.display = '';
    } else {
      ascBadge.style.display = 'none';
    }

    const lines = META_DEFS
      .filter(u => tierRequirement(u.ascReq) <= bestTier(m) && (m.upgrades[u.id] || 0) > 0)
      .map(u => u.getEffect(m.upgrades[u.id]));

    const pi = document.getElementById('passiveInfo');
    pi.innerHTML = lines.length
      ? `<strong>${I18n.t('title.activePassives')}</strong> ` + lines.join(' · ')
      : I18n.t('title.noUpgrades');

    // Show "Continuer" only if an active run exists
    const hasRun = !!GameState.run;
    document.getElementById('btnContinueRun').style.display = hasRun ? '' : 'none';
    document.getElementById('btnStartRun').className = hasRun ? 'btn' : 'btn btn-primary';
    const today = Controller.dailyDate();
    const done = m.daily?.date === today;
    const dailyBtn = document.getElementById('btnDaily');
    dailyBtn.disabled = done;
    dailyBtn.innerHTML = `${Icons.svg('daily')} ${done
      ? m.daily.result === 'victory' ? I18n.t('tier.victory') : I18n.t('tier.dailyDone', { n:Math.min(3, GameState.run?.daily === today ? GameState.run.floorIdx + 1 : m.daily.floor || 1) })
      : I18n.t('ui.btn.daily')}`;
    const countdown = document.getElementById('dailyCountdown');
    countdown.style.display = done ? '' : 'none';
    if (done) {
      const left = 86400000 - Date.now() % 86400000;
      countdown.textContent = `${String(Math.floor(left / 3600000)).padStart(2,'0')}:${String(Math.floor(left / 60000) % 60).padStart(2,'0')}:${String(Math.floor(left / 1000) % 60).padStart(2,'0')}`;
    }
  },

  // ── Meta ──
  renderMeta() {
    const m = GameState.meta;
    document.getElementById('metaGold').textContent = m.permanentGold;

    // Tier info
    const ascInfo = document.getElementById('metaAscInfo');
    if (bestTier(m) > 0) {
      ascInfo.textContent = I18n.t('tier.label', { n: bestTier(m) });
      ascInfo.style.display = '';
    } else {
      ascInfo.style.display = 'none';
    }

    const list = document.getElementById('metaList');
    list.innerHTML = '';

    // Group visible upgrades by tier requirement
    const visible = META_DEFS.filter(u => tierRequirement(u.ascReq) <= bestTier(m));
    let lastAsc = -1;

    visible.forEach(u => {
      // Section header for newly available upgrades
      if (u.ascReq > 0 && u.ascReq !== lastAsc) {
        lastAsc = u.ascReq;
        const header = document.createElement('div');
        header.className = 'meta-section-header';
        header.textContent = I18n.t('tier.label', { n: tierRequirement(u.ascReq) });
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

  },

  // ── Relic choice ──
  renderRelicChoice(choices) {
    document.querySelector('#relicScreen .text-xs').textContent = I18n.t('relic.chooseTitle');
    document.querySelector('#relicScreen .relic-screen-title').textContent = I18n.t('relic.reward');
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
            <div class="relic-rarity rarity-${relic.rarity}">${I18n.t('rarity.' + relic.rarity)}</div>
          </div>
        </div>
        <div class="relic-desc">${I18n.t('relic.' + relic.id + '.desc')}</div>
        <div class="relic-family-list">${this.familyChips(relic)}</div>
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
    document.querySelector('#relicScreen .text-xs').textContent = I18n.t('rest.choose');
    document.querySelector('#relicScreen .relic-screen-title').textContent = I18n.t('room.rest');

    const container = document.getElementById('relicChoices');
    if ((GameState.run.hearts ?? 3) < Controller.maxHearts()) {
      const healCard = document.createElement('div');
      healCard.className = 'relic-card rest-heal-card';
      healCard.innerHTML = `<div class="relic-card-header"><div class="relic-icon">${Icons.svg('heart')}</div><div class="relic-name">${I18n.t('rest.healName')}</div></div><div class="relic-desc">${I18n.t('rest.healDesc')}</div>`;
      healCard.addEventListener('click', () => Controller.pickRestHeal());
      container.appendChild(healCard);
      this.animateRelicCard(healCard, choices.length + 1);
    }

    if (GameState.run.spells.some(spell => spell.charges < Controller.spellCapacity())) {
      const card = document.createElement('button');
      card.className = 'relic-card';
      card.innerHTML = `<div class="relic-card-header"><div class="relic-icon">${Icons.svg('s-catalyst')}</div><div class="relic-name">${I18n.t('rest.meditate')}</div></div>`;
      card.addEventListener('click', () => Controller.pickRestMeditate());
      container.appendChild(card);
    }

    // Offer a way out when every rest reward is unavailable.
    document.getElementById('btnSkipRelic').style.display = container.children.length ? 'none' : '';
  },

  // ── End screen ──
  renderEndScreen(win, abandoned) {
    if (typeof Share !== 'undefined') Share.capture(GameState.run, win, abandoned);
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
      <div class="end-stat"><div class="end-stat-val">${r.floorIdx + 1}/${r.floors?.length >= 4 ? 4 : 3}</div><div class="end-stat-label">${I18n.t('end.floorReached')}</div></div>
      <div class="end-stat"><div class="end-stat-val">${r.relics.length}</div><div class="end-stat-label">${I18n.t('end.relics')}</div></div>`;
    document.getElementById('endSeed').textContent = r.seed === undefined ? '' : `${I18n.t('end.seed')} : ${r.seed}`;

    const rel = document.getElementById('endRelics');
    rel.innerHTML = r.relics.length
      ? r.relics.map(x => `<div class="relic-chip rarity-${x.rarity}${x.isCurse ? ' is-curse' : ''}">${Icons.svg(x.icon)} ${I18n.t('relic.' + x.id + '.name')}</div>`).join('')
      : `<span class="text-sm text-muted">${I18n.t('end.noRelics')}</span>`;
  },

  // ── Relic tooltip ──
  showRelicTooltip(icon, name, desc, rarity, relic) {
    document.getElementById('relicTTIcon').className = `relic-tt-icon rarity-${rarity}`;
    document.getElementById('relicTTIcon').innerHTML = Icons.svg(icon);
    document.getElementById('relicTTName').textContent = name;
    document.getElementById('relicTTDesc').textContent = desc;
    document.getElementById('relicTTFamilies').innerHTML = relic ? this.familyChips(relic) : '';
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

  renderCodex(tab = this._codexTab || 'relics') {
    this._codexTab = tab;
    const meta = GameState.meta;
    const tabs = document.getElementById('codexTabs');
    tabs.innerHTML = '';
    for (const id of ['relics','bestiary','characters','achievements','history']) {
      const button = document.createElement('button');
      button.className = 'codex-tab' + (id === tab ? ' is-active' : '');
      button.textContent = I18n.t('codex.tab.'+id);
      button.setAttribute('aria-selected',String(id === tab));
      button.onclick = () => this.renderCodex(id);
      tabs.appendChild(button);
    }
    const list = document.getElementById('codexContent');
    list.innerHTML = '';
    const counter = document.getElementById('codexCounter');
    counter.textContent = '';
    if (tab === 'relics') {
      counter.textContent = `${meta.codex.relics.length} / ${RELICS.length}`;
      list.className = 'codex-content codex-grid';
      for (const relic of RELICS) {
        const seen = meta.codex.relics.includes(relic.id);
        const card = document.createElement('div');
        card.className = 'codex-card' + (seen ? '' : ' is-unknown');
        card.innerHTML = seen
          ? `<div class="codex-icon">${Icons.svg(relic.icon)}</div><div class="codex-name">${I18n.t('relic.'+relic.id+'.name')}</div><div class="relic-rarity rarity-${relic.rarity}">${I18n.t('rarity.'+relic.rarity)}</div><div class="codex-families">${this.familyChips(relic)}</div>${relic.ascension ? `<div class="codex-hint">${I18n.t('relic.ascensionGate')}</div>` : ''}`
          : `<div class="codex-icon">${Icons.svg('lock')}</div><div class="codex-name">???</div>${relic.ascension ? `<div class="codex-hint">${I18n.t('relic.ascensionGate')}</div>` : UNLOCKS[relic.id] ? `<div class="codex-hint">${I18n.t('achievement.'+UNLOCKS[relic.id]+'.name')}</div>` : ''}`;
        list.appendChild(card);
      }
    } else if (tab === 'bestiary') {
      list.className = 'codex-content';
      for (const enemy of ENEMIES) {
        const count = meta.codex.enemies[enemy.id] || 0;
        const card = document.createElement('div'); card.className = 'codex-row' + (count ? '' : ' is-unknown');
        card.innerHTML = `<span class="codex-icon">${Icons.svg(count ? 'e-'+enemy.id : 'lock')}</span><span class="codex-row-main"><strong>${count ? I18n.t(enemy.kind === 'boss' ? 'enemy.'+enemy.id+'.name' : 'enemy.'+enemy.id) : '???'}</strong><small>${I18n.t('codex.floor',{n:enemy.floor+1})}</small></span><span>${count ? I18n.t('codex.defeated',{n:count}) : ''}</span>`;
        list.appendChild(card);
      }
    } else if (tab === 'characters') {
      list.className = 'codex-content';
      for (const character of CHARACTERS) {
        const unlocked = !UNLOCKS[character.id] || meta.achievements.includes(UNLOCKS[character.id]);
        const card = document.createElement('div');
        card.className = 'codex-row' + (unlocked ? '' : ' is-unknown');
        card.innerHTML = `<span class="codex-icon">${Icons.svg(unlocked ? character.icon : 'lock')}</span><span class="codex-row-main"><strong>${I18n.t('character.'+character.id+'.name')}</strong><small>${unlocked ? I18n.t('character.'+character.id+'.passive') : I18n.t('achievement.'+UNLOCKS[character.id]+'.condition')}</small></span><span>A${characterTier(meta,character.id)}</span>`;
        list.appendChild(card);
      }
    } else if (tab === 'achievements') {
      list.className = 'codex-content';
      for (const achievement of ACHIEVEMENTS) {
        const earned = meta.achievements.includes(achievement.id);
        const card = document.createElement('div'); card.className = 'codex-row' + (earned ? ' is-earned' : ' is-unknown');
        card.innerHTML = `<span class="codex-icon">${Icons.svg('trophy')}</span><span class="codex-row-main"><strong>${I18n.t('achievement.'+achievement.id+'.name')}</strong><small>${I18n.t('achievement.'+achievement.id+'.condition')}</small>${achievement.reward ? `<small>${I18n.t('codex.reward')}${I18n.t('ui.colon')}${CHARACTERS.some(c => c.id === achievement.reward) ? I18n.t('character.'+achievement.reward+'.name') : I18n.t('relic.'+achievement.reward+'.name')}</small>` : ''}</span>`;
        list.appendChild(card);
      }
    } else {
      list.className = 'codex-content';
      if (!meta.codex.runs.length) list.textContent = I18n.t('codex.noRuns');
      for (const run of meta.codex.runs) {
        const card = document.createElement('div'); card.className = 'codex-row';
        const character = CHARACTERS.find(c => c.id === run.character);
        const date = new Date(run.date);
        card.innerHTML = `<span class="codex-icon">${Icons.svg(character?.icon || 'c-alchemist')}</span><span class="codex-row-main"><strong>${Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(I18n._lang)} · A${run.tier || 0}${run.daily ? ' · '+I18n.t('codex.daily') : ''}</strong><small>${I18n.t('codex.result.'+run.result)} · ${I18n.t('codex.floor',{n:run.floor || 1})} · ${run.boss ? I18n.t('enemy.'+run.boss+'.name') : '???'}</small><small>${I18n.t('codex.seed')}${I18n.t('ui.colon')}${run.seed}</small></span>`;
        list.appendChild(card);
      }
    }
  },

  showAchievement(id) {
    this._achievementQueue ??= [];
    this._achievementQueue.push(id);
    if (this._achievementShowing) return;
    const next = () => {
      const current = this._achievementQueue.shift();
      if (!current) { this._achievementShowing = false; return; }
      this._achievementShowing = true;
      const banner = document.getElementById('achievementToast');
      banner.innerHTML = `${Icons.svg('trophy')} <span>${current.startsWith('skin.') ? I18n.t('settings.skin')+I18n.t('ui.colon')+I18n.t(current) : I18n.t('achievement.'+current+'.name')}</span>`;
      banner.classList.add('show');
      setTimeout(() => { banner.classList.remove('show'); setTimeout(next,220); },2620);
    };
    next();
  },
  showSkinUnlock(skin) {
    this.showAchievement('skin.'+skin);
  },
};
