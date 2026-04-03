'use strict';

const Input = {
  touchStart: null,

  init() {
    // Swipe
    document.addEventListener('touchstart', e => {
      const grid = document.getElementById('gameGrid');
      if (grid && grid.contains(e.target)) {
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

    // Keyboard
    document.addEventListener('keydown', e => {
      const map = {
        ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down',
        a:'left', d:'right', w:'up', s:'down',
        q:'left', z:'up',
      };
      if (map[e.key]) { e.preventDefault(); Controller.move(map[e.key]); }
    });

    // Resize — re-render tiles
    window.addEventListener('resize', () => {
      Renderer.invalidateGeoCache();
      if (document.getElementById('gameScreen').classList.contains('active')) {
        Renderer.renderTiles();
      }
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

  // Map
  document.getElementById('btnAbandon').addEventListener('click', () => Controller.abandonRun());

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

  // D-pad
  document.getElementById('dpadUp').addEventListener('click',    () => Controller.move('up'));
  document.getElementById('dpadDown').addEventListener('click',  () => Controller.move('down'));
  document.getElementById('dpadLeft').addEventListener('click',  () => Controller.move('left'));
  document.getElementById('dpadRight').addEventListener('click', () => Controller.move('right'));

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
    document.getElementById('ascendModalSub').innerHTML =
      `Toutes tes améliorations seront réinitialisées.<br>Tu gagnes l'accès aux passifs d'Ascension ${nextLvl}.<br><br>Coût : <strong class="text-gold">◈${cost}</strong>`;
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
  Renderer.renderTitle();
})();
