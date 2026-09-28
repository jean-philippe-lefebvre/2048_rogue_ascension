'use strict';

const Input = {
  touchStart: null,

  init() {
    // Swipe : detect on entire game screen, not just grid
    document.addEventListener('touchstart', e => {
      const screen = document.getElementById('gameScreen');
      if (screen && screen.classList.contains('active')) {
        this.touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    document.addEventListener('touchend', e => {
      if (!this.touchStart) return;
      const dx = e.changedTouches[0].clientX - this.touchStart.x;
      const dy = e.changedTouches[0].clientY - this.touchStart.y;
      this.touchStart = null;
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      const dir = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down'  : 'up');
      Audio2.unlock();
      const haptic = Controller.move(dir);
      if (haptic) Haptics.trigger(haptic);
    }, { passive: true });

    // Keyboard : keyCode (physical) + key (logical) for max compatibility
    const codeMap = {
      37:'left', 38:'up', 39:'right', 40:'down',
      65:'left', 68:'right', 87:'up', 83:'down',
      81:'left', 90:'up',
    };
    const keyMap = {
      ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down',
      a:'left', d:'right', w:'up', s:'down',
      q:'left', z:'up',
    };
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && GameState.spellTarget) { e.preventDefault(); Controller.cancelSpell(); return; }
      if ((e.key === '1' || e.key === '2') && document.getElementById('gameScreen').classList.contains('active')) {
        e.preventDefault(); Controller.selectSpell(Number(e.key)-1); return;
      }
      const dir = codeMap[e.keyCode] || keyMap[e.key];
      if (document.activeElement?.closest?.('[data-accept-defeat]')
        && (e.key === 'Enter' || e.key === ' ' || e.code === 'Space')) return;
      if (GameState.spellTarget && (dir || e.key === 'Enter' || e.key === ' ' || e.code === 'Space')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        Audio2.unlock();
        if (dir) Controller.moveTargetCursor(dir);
        else Controller.confirmSpellCursor();
        return false;
      }
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
        document.activeElement.blur();
      }
      if (dir) {
        e.preventDefault();
        e.stopImmediatePropagation();
        Audio2.unlock();
        const haptic = Controller.move(dir);
        if (haptic) Haptics.trigger(haptic);
        return false;
      }
    }, { capture: true });

    // Resize : re-render tiles (debounced)
    let _resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(() => {
        Renderer.invalidateGeoCache();
        Fx.resize();
        if (document.getElementById('gameScreen').classList.contains('active')) {
          Renderer.renderTiles();
        }
      }, 150);
    });
  },
};

function bindButtons() {
  document.addEventListener('pointerdown', () => Audio2.unlock(), { passive: true });
  document.addEventListener('keydown', () => Audio2.unlock(), { passive: true });
  document.getElementById('soundToggle').addEventListener('click', () => {
    GameState.meta.settings.sound = !GameState.meta.settings.sound;
    Storage.save(GameState.meta);
    Audio2.syncSetting();
    I18n.renderSoundToggle();
    Audio2.unlock();
  });
  // Title
  document.getElementById('btnContinueRun').addEventListener('click', () => {
    if (!GameState.run) return;
    Controller.resumeRun();
  });
  document.getElementById('btnStartRun').addEventListener('click',  () => Controller.startRun());
  document.getElementById('btnDaily').addEventListener('click', () => Controller.startDaily());
  document.getElementById('btnTierDown').addEventListener('click', () => Controller.selectTier((Controller.selectedTier ?? 0) - 1));
  document.getElementById('btnTierUp').addEventListener('click', () => Controller.selectTier((Controller.selectedTier ?? 0) + 1));
  document.getElementById('btnShowMeta').addEventListener('click',  () => { Renderer.renderMeta(); showScreen('metaScreen'); });

  // Map : abandon with confirmation
  document.getElementById('btnAbandon').addEventListener('click', () => {
    document.getElementById('abandonModal').classList.add('show');
  });
  document.getElementById('btnAbandonCancel').addEventListener('click', () => {
    document.getElementById('abandonModal').classList.remove('show');
  });
  document.getElementById('btnAbandonConfirm').addEventListener('click', () => {
    document.getElementById('abandonModal').classList.remove('show');
    Controller.abandonRun();
  });

  // Game : abandon from game screen
  document.getElementById('btnGameAbandon').addEventListener('click', () => {
    if (GameState.spellTarget) Controller.cancelSpell();
    document.getElementById('abandonModal').classList.add('show');
  });

  // Game overlay
  document.getElementById('overlayBtn').addEventListener('click', () => Controller.overlayAction());
  document.getElementById('spellBar').addEventListener('click', e => {
    const button = e.target.closest('[data-spell-slot]');
    if (button) Controller.selectSpell(Number(button.dataset.spellSlot));
  });
  document.getElementById('spellHint').addEventListener('click', e => {
    if (e.target.closest('[data-accept-defeat]')) Controller._checkFailure(true);
  });
  document.getElementById('gameGrid').addEventListener('click', e => {
    const cell = e.target.closest('.gcell');
    if (cell && GameState.spellTarget) Controller.targetSpell(Math.floor([...cell.parentNode.children].indexOf(cell)/GameState.size),[...cell.parentNode.children].indexOf(cell)%GameState.size);
  });
  document.getElementById('btnLeaveShop').addEventListener('click', () => Controller.leaveShop());
  document.getElementById('btnEventContinue').addEventListener('click', () => Controller.continueEvent());
  document.querySelectorAll('[data-dir]').forEach(button => button.addEventListener('click', () => {
    const haptic = Controller.move(button.dataset.dir);
    if (haptic) Haptics.trigger(haptic);
  }));

  // Relic screen
  document.getElementById('btnSkipRelic').addEventListener('click', () => Controller.skipRelic());

  // End screen
  document.getElementById('btnReplay').addEventListener('click',    () => Controller.startRun());
  document.getElementById('btnShare').addEventListener('click', () => Share.share());
  document.getElementById('btnCopyResult').addEventListener('click', () => Share.copyText());
  document.getElementById('btnEndToMeta').addEventListener('click', () => { Renderer.renderMeta(); showScreen('metaScreen'); });
  document.getElementById('btnEndToTitle').addEventListener('click',() => showScreen('titleScreen'));

  document.getElementById('btnResetSave').addEventListener('click', () => {
    document.getElementById('resetModal').classList.add('show');
  });
  document.getElementById('btnResetCancel').addEventListener('click', () => {
    document.getElementById('resetModal').classList.remove('show');
  });
  document.getElementById('btnResetConfirm').addEventListener('click', () => {
    document.getElementById('resetModal').classList.remove('show');
    GameState.meta = Storage.defaultMeta();
    GameState.run   = null;
    Storage.save(GameState.meta);
    Storage.clearRun();
    showScreen('titleScreen');
    Renderer.renderTitle();
  });

  // Meta : return to map if opened from rest room, otherwise title
  document.getElementById('btnMetaBack').addEventListener('click', () => {
    if (GameState._shopReturnToMap) {
      GameState._shopReturnToMap = false;
      Renderer.renderMap();
      showScreen('mapScreen');
    } else {
      showScreen('titleScreen');
    }
  });

}

// ── BOOT ──
(function boot() {
  const saved = Storage.load();
  if (saved) GameState.meta = { ...Storage.defaultMeta(), ...saved, settings: { ...Storage.defaultMeta().settings, ...saved.settings } };
  GameState.run = Storage.loadRun();
  if (GameState.run) {
    Rng._seed = GameState.run.seed >>> 0;
    Rng._state = (GameState.run.rngState ?? GameState.run.seed) >>> 0;
  }
  RelicHooks.invalidate();

  Input.init();
  bindButtons();
  document.querySelectorAll('[data-static-icon]').forEach(el => { el.innerHTML = Icons.svg(el.dataset.staticIcon); });
  I18n.applyDOM();
  Renderer.renderTitle();
  setInterval(() => {
    if (document.getElementById('titleScreen').classList.contains('active')) Renderer.renderTitle();
  }, 1000);

  // Haptic nudge on every button tap
  document.addEventListener('click', e => {
    if (e.target.closest('button')) Haptics.trigger('nudge');
  });
})();
