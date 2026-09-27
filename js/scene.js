'use strict';

// "Brume minimaliste" backdrops: one scene per context (title, map, floors, bosses, shop, rest).
// Each scene is a deep gradient, a blurred line emblem, two drifting fog banks and rising dust.
const Scene = {
  PALETTES: {
    title: { base:'#100d16', deep:'#040306', acc:'#d4a843' },
    shop:  { base:'#1d170c', deep:'#070503', acc:'#d4a843' },
    rest:  { base:'#0f1a15', deep:'#030705', acc:'#f0a040' },
    f1:    { base:'#131a2c', deep:'#05070d', acc:'#6aa9c9' },
    f2:    { base:'#24130c', deep:'#090403', acc:'#e07a3a' },
    f3:    { base:'#1b1132', deep:'#06030d', acc:'#9a6ae0' },
    b1:    { base:'#1d1812', deep:'#070504', acc:'#c9a36a' },
    b2:    { base:'#2c0d06', deep:'#0b0302', acc:'#ff6a2a' },
    b3:    { base:'#1d0722', deep:'#050108', acc:'#e04a8a' },
  },
  MOTIFS: { title:'portal', shop:'shelves', rest:'campfire', f1:'colonnade', f2:'chains', f3:'stars', b1:'keyhole', b2:'anvil', b3:'eye' },
  _current: null,

  // Scene for a screen, derived from the game state.
  forScreen(screenId) {
    const fi = Math.min(GameState.run?.floorIdx ?? 0, 2);
    switch (screenId) {
      case 'titleScreen': case 'endScreen': return this.set('title');
      case 'metaScreen':  return this.set(GameState._shopReturnToMap ? 'shop' : 'title');
      case 'mapScreen':   return this.set('map', fi);
      case 'gameScreen': {
        const type = GameState.room?.data?.type;
        const roomFloor = Math.min(GameState.room?.floorIdx ?? fi, 2);
        return this.set(type === 'boss' ? `b${roomFloor + 1}` : `f${roomFloor + 1}`);
      }
      case 'relicScreen': if (GameState._restDone) return this.set('rest'); return;
    }
  },

  set(key, floorIdx = 0) {
    const id = key === 'map' ? `map${floorIdx}` : key;
    if (id === this._current) return;
    this._current = id;
    const host = document.getElementById('backdrop');
    if (!host) return;
    // The map borrows its floor's colours with the winding-path emblem, a little dimmer.
    const pal = key === 'map' ? this.PALETTES[`f${floorIdx + 1}`] : this.PALETTES[key];
    const motif = key === 'map' ? 'path' : this.MOTIFS[key];
    const dim = key === 'map' ? 0.75 : 1;
    const boss = key[0] === 'b';

    const layer = document.createElement('div');
    layer.className = 'scene';
    layer.style.cssText = `--s-base:${pal.base};--s-deep:${pal.deep};--s-acc:${pal.acc};--s-dim:${dim}`;
    layer.innerHTML = `
      <div class="scene-base"></div>
      <svg class="scene-motif${boss ? ' is-boss' : ''}" viewBox="0 0 300 560" preserveAspectRatio="xMidYMid meet" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <g stroke="var(--s-acc)" stroke-width="2.6">${this._motif(motif)}</g></svg>
      <div class="scene-fog scene-fog-a"></div>
      <div class="scene-fog scene-fog-b"></div>
      <div class="scene-dust">${this._dust(id)}</div>`;
    host.appendChild(layer);
    // Crossfade: the new scene fades in, older ones leave once it is opaque.
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('is-in')));
    const old = [...host.children].filter(el => el !== layer);
    setTimeout(() => old.forEach(el => el.remove()), 900);
  },

  _rand(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  },
  _seed(str) { let h = 7; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; },

  _dust(id) {
    const R = this._rand(this._seed(id) + 3);
    let out = '';
    for (let i = 0; i < 16; i++) {
      out += `<i style="left:${(R() * 100).toFixed(1)}%;top:${(55 + R() * 45).toFixed(1)}%;animation-duration:${(8 + R() * 8).toFixed(1)}s;animation-delay:${(-R() * 12).toFixed(1)}s;opacity:${(.35 + R() * .5).toFixed(2)}"></i>`;
    }
    return out;
  },

  // Line emblems on a 300x560 canvas, drawn to read as silhouettes once blurred.
  _motif(k) {
    const R = this._rand(this._seed(k));
    const n = v => v.toFixed(0);
    switch (k) {
      case 'portal':
        return '<path d="M50 560V262a100 100 0 0 1 200 0v298"/><path d="M78 560V268a72 72 0 0 1 144 0v292"/><path d="M138 150h24l-5 24h-14z"/><path d="M28 560V236M272 560V236M18 236h20M262 236h20"/><path d="M30 520h240M20 540h260"/>';
      case 'path': {
        let d = '<path d="M150 560C40 480 260 430 150 352S40 232 150 152 260 52 150 -10" stroke-dasharray="4 10"/>';
        [[150, 352], [150, 152], [74, 452], [226, 262]].forEach(([x, y]) => { d += `<path d="M${x} ${y - 8}l8 8-8 8-8-8z"/>`; });
        return d;
      }
      case 'colonnade':
        return '<path d="M22 560V118M52 560V118M248 560V118M278 560V118M14 118h46M240 118h46M17 106h40M243 106h40"/><path d="M52 160a98 98 0 0 1 196 0"/><path d="M52 184a98 98 0 0 1 196 0" opacity=".5"/>';
      case 'chains': {
        let d = '';
        [34, 78, 222, 266].forEach(x => {
          const len = 120 + R() * 220;
          for (let y = -6; y < len; y += 14) d += `<ellipse cx="${x}" cy="${y}" rx="${(y / 14) % 2 ? 2 : 4}" ry="7"/>`;
          d += `<path d="M${x - 9} ${n(len + 4)}h18l-4 16h-10z"/>`;
        });
        return d + '<path d="M0 500h300M0 524h300"/>';
      }
      case 'stars': {
        let d = '';
        for (let i = 0; i < 40; i++) d += `<circle cx="${n(R() * 300)}" cy="${n(R() * 420)}" r="${(R() * 1.6 + .6).toFixed(1)}"/>`;
        [70, 120, 180, 250].forEach(r => { d += `<circle cx="150" cy="660" r="${r}"/>`; });
        return d;
      }
      case 'keyhole': {
        let d = '<path d="M150 150a56 56 0 0 1 32 102l24 150H94l24-150a56 56 0 0 1 32-102z"/>';
        [16, 46, 254, 284].forEach(x => { d += `<path d="M${x} 0v560"/>`; });
        return d + '<path d="M0 80h60M240 80h60M0 480h60M240 480h60"/>';
      }
      case 'anvil':
        return '<path d="M60 250h180v22c-24 8-44 14-58 18l-8 40h36v20H90v-20h36l-8-40c-24-4-48-10-58-18-20 0-34-6-40-14 12-5 26-8 40-8z"/><path d="M168 118l58 58M204 96l40 40-16 16-40-40z"/><path d="M150 226l-12-30M172 220l6-34M192 228l24-24M126 232l-28-18"/>';
      case 'eye': {
        let d = '<path d="M14 280C66 196 108 176 150 176s84 20 136 104c-52 84-94 104-136 104S66 364 14 280z"/><circle cx="150" cy="280" r="64"/><path d="M150 232c16 20 16 76 0 96-16-20-16-76 0-96z"/>';
        for (let i = 0; i < 13; i++) {
          const a = Math.PI * (1.08 + i * .066);
          d += `<path d="M${n(150 + Math.cos(a) * 150)} ${n(280 + Math.sin(a) * 150)}L${n(150 + Math.cos(a) * 190)} ${n(280 + Math.sin(a) * 190)}"/>`;
        }
        return d;
      }
      case 'shelves': {
        let d = '<path d="M108 30h84v40h-84zM120 30l30-24 30 24"/>';
        [150, 250, 350].forEach(y => {
          d += `<path d="M16 ${y}h268M30 ${y}l14 16M270 ${y}l-14 16"/>`;
          for (let x = 34; x < 262; x += 34 + R() * 14) {
            const h = 20 + R() * 26, w = 10 + R() * 10;
            d += `<rect x="${n(x)}" y="${n(y - h)}" width="${n(w)}" height="${n(h)}" rx="3"/>`;
          }
        });
        return d;
      }
      case 'campfire':
        return '<path d="M-40 330a190 190 0 0 1 380 0"/><path d="M-10 330a160 160 0 0 1 320 0" opacity=".5"/><path d="M60 540l180-36M60 504l180 36"/><path d="M150 490c-30 0-46-16-46-40 0-24 16-34 22-56 10 10 14 20 12 30 12-10 22-28 20-62 22 16 44 42 44 78 0 28-18 50-52 50z"/>';
    }
    return '';
  },
};

// Title scene on boot (the title screen is active before any showScreen call).
Scene.set('title');
