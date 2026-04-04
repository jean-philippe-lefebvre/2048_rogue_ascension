'use strict';

const Input = {
  touchStart: null,

  init() {
    // Swipe — detect on entire game screen, not just grid
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
      if (Math.abs(dx) > Math.abs(dy)) Controller.move(dx > 0 ? 'right' : 'left');
      else                             Controller.move(dy > 0 ? 'down'  : 'up');
    }, { passive: true });

    // Keyboard — keyCode (physical) + key (logical) for max compatibility
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
      const dir = codeMap[e.keyCode] || keyMap[e.key];
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
        document.activeElement.blur();
      }
      if (dir) {
        e.preventDefault();
        e.stopImmediatePropagation();
        Controller.move(dir);
        return false;
      }
    }, { capture: true });

    // Resize — re-render tiles (debounced)
    let _resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(() => {
        Renderer.invalidateGeoCache();
        if (document.getElementById('gameScreen').classList.contains('active')) {
          Renderer.renderTiles();
        }
      }, 150);
    });
  },
};

function bindButtons() {
  // Title
  document.getElementById('btnContinueRun').addEventListener('click', () => {
    if (!GameState.run) return;
    Renderer.renderMap();
    showScreen('mapScreen');
  });
  document.getElementById('btnStartRun').addEventListener('click',  () => Controller.startRun());
  document.getElementById('btnShowMeta').addEventListener('click',  () => { Renderer.renderMeta(); showScreen('metaScreen'); });

  // Map — abandon with confirmation
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

  // Game — abandon from game screen
  document.getElementById('btnGameAbandon').addEventListener('click', () => {
    document.getElementById('abandonModal').classList.add('show');
  });

  // Game overlay
  document.getElementById('overlayBtn').addEventListener('click', () => Controller.overlayAction());

  // Relic screen
  document.getElementById('btnSkipRelic').addEventListener('click', () => Controller.skipRelic());

  // End screen
  document.getElementById('btnReplay').addEventListener('click',    () => Controller.startRun());
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
    showScreen('titleScreen');
    Renderer.renderTitle();
  });

  // Meta — return to map if opened from rest room, otherwise title
  document.getElementById('btnMetaBack').addEventListener('click', () => {
    if (GameState._shopReturnToMap) {
      GameState._shopReturnToMap = false;
      Renderer.renderMap();
      showScreen('mapScreen');
    } else {
      showScreen('titleScreen');
    }
  });

  // Ascension
  document.getElementById('btnAscend').addEventListener('click', () => {
    if (!Controller.canAscend()) return;
    document.getElementById('ascendModal').classList.add('show');
    const cost = ASCENSION_COSTS[GameState.meta.ascensionLevel];
    const nextLvl = GameState.meta.ascensionLevel + 1;
    document.getElementById('ascendModalSub').innerHTML = I18n.t('modal.ascendSub', { n: nextLvl, cost });
  });
  document.getElementById('btnAscendCancel').addEventListener('click', () => {
    document.getElementById('ascendModal').classList.remove('show');
  });
  document.getElementById('btnAscendConfirm').addEventListener('click', () => {
    document.getElementById('ascendModal').classList.remove('show');
    Controller.doAscension();
  });
}

// ── BOOT ──
(function boot() {
  const saved = Storage.load();
  if (saved) GameState.meta = { ...Storage.defaultMeta(), ...saved };

  Input.init();
  bindButtons();
  I18n.applyDOM();
  Renderer.renderTitle();
})();
