'use strict';

const Fx = {
  colors: {2:'#9fb3c8',4:'#b48cff',8:'#5b8cff',16:'#3fd29a',32:'#f0b429',64:'#ff5d6c',128:'#ff8fd8',256:'#7ef0ff',512:'#e9f6ff',1024:'#ffd36e',2048:'#ffcc33'},
  parts: [],
  raf: 0,
  reduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; },
  canvas() { return document.querySelector('.fx-layer'); },
  resize() {
    const canvas = this.canvas();
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  },
  clear() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.parts = [];
    const canvas = this.canvas();
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    document.querySelectorAll('.fx-float').forEach(el => el.remove());
  },
  cellCenter(r, c) {
    const geo = Renderer.getTileGeometry();
    if (!geo) return null;
    return { x: geo.left(c) + geo.cellSize / 2, y: geo.top(r) + geo.cellSize / 2 };
  },
  burst(x, y, color, count) {
    if (this.reduced()) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      this.parts.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 1, life: 1, color, size: 1.5 + Math.random() * 3 });
    }
    if (!this.raf) this.raf = requestAnimationFrame(() => this.tick());
  },
  tick() {
    const canvas = this.canvas();
    if (!canvas || this.reduced()) { this.clear(); return; }
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.globalCompositeOperation = 'lighter';
    this.parts = this.parts.filter(p => p.life > 0);
    for (const p of this.parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.97; p.life -= 0.028;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.raf = this.parts.length ? requestAnimationFrame(() => this.tick()) : 0;
    if (!this.raf) ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  },
  float(x, y, value) {
    if (this.reduced()) return;
    const el = document.createElement('div');
    el.className = 'fx-float';
    el.textContent = `+${value}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.fontSize = el.textContent.length > 3 ? '16px' : '20px';
    document.querySelector('.grid-wrap').appendChild(el);
    setTimeout(() => el.remove(), 950);
  },
  shake(amplitude) {
    if (this.reduced()) return;
    document.querySelector('.grid-wrap').animate([
      {transform:'none'}, {transform:`translate(${amplitude}px,${-amplitude * 0.5}px)`},
      {transform:`translate(${-amplitude * 0.8}px,${amplitude * 0.4}px)`},
      {transform:`translate(${amplitude * 0.4}px,${amplitude * 0.3}px)`}, {transform:'none'},
    ], {duration:240, easing:'ease-out'});
  },
  flash() {
    if (!this.reduced()) document.querySelector('.grid-wrap').animate([{filter:'none'},{filter:'brightness(1.7)'},{filter:'none'}], {duration:120});
  },
  nudge(dir) {
    if (this.reduced()) return;
    const offsets = {left:[-5,0],right:[5,0],up:[0,-5],down:[0,5]};
    const [x,y] = offsets[dir];
    document.getElementById('gameTiles').animate([{transform:'none'},{transform:`translate(${x}px,${y}px)`},{transform:'none'}], {duration:140,easing:'ease-out'});
  },
  combo(count) {
    const el = document.getElementById('comboLabel');
    if (!el || this.reduced()) return;
    const multiplier = (1 + 0.25 * (count - 1)).toLocaleString(I18n._lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits:2 });
    el.textContent = I18n.t('hud.combo', { n: multiplier });
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._comboTimer);
    this._comboTimer = setTimeout(() => el.classList.remove('show'), 1100);
  },
  merges(merges) {
    if (!merges.length || this.reduced()) return;
    const max = Math.max(...merges.map(m => m.val));
    for (const m of merges) {
      const at = this.cellCenter(m.r, m.c);
      if (!at) continue;
      this.burst(at.x, at.y, this.colors[Math.min(m.val, 2048)], 8 + Math.log2(m.val) * 3);
      this.float(at.x, at.y, m.val);
    }
    this.shake(Math.min(10, 1 + Math.log2(max) * 0.9 + merges.length));
    if (max >= 64) this.flash();
    if (merges.length >= 2) this.combo(merges.length);
  },
  roomSuccess() {
    if (this.reduced()) return;
    [0,120,240].forEach(delay => setTimeout(() => {
      if (!document.getElementById('gameScreen').classList.contains('active')) return;
      const at = this.cellCenter(Math.floor(Math.random() * 4), Math.floor(Math.random() * 4));
      if (at) this.burst(at.x, at.y, '#d4a843', 24);
    }, delay));
  },
};
