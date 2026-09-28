'use strict';

const Share = {
  current: null,
  capture(run, win, abandoned) {
    this.current = run ? { ...run, relics:[...(run.relics || [])], stats:{...(run.stats || {})}, win, abandoned } : null;
  },
  label(run) {
    return run.daily ? `${I18n._lang === 'en' ? 'Daily challenge' : 'Défi du'} ${run.daily.slice(8,10)}/${run.daily.slice(5,7)}`
      : I18n.t('tier.label', { n:run.tier || 0 });
  },
  floor(run) { return Math.min(3, (run.floorIdx || 0) + 1); },
  boss(run) {
    const floor = this.floor(run) - 1;
    const rows = run.floors?.[floor];
    const id = rows?.[rows.length - 1]?.[0]?.bossId || rows?.bossId || ['jailer','smith','eye'][floor];
    return I18n.t('enemy.' + id + '.name');
  },
  result(run) {
    return run.win ? I18n.t('tier.victory') : `${I18n.t('end.floorReached').replace(/ atteint| reached/, '')} ${this.floor(run)} · ${this.boss(run)}`;
  },
  text(run = this.current) {
    if (!run) return '';
    const squares = this.floorStates(run).map(state => ({ cleared:'🟨', failed:'🟥', none:'⬛' })[state]).join('');
    const floor = this.floor(run);
    const hearts = run.hearts ?? 0;
    const floorText = I18n._lang === 'en' ? `Floor ${floor}/3` : `Étage ${floor}/3`;
    const heartText = I18n._lang === 'en' ? `${hearts} hearts` : `${hearts} cœurs`;
    const link = this.link();
    return `2048 Rogue · ${this.label(run)} · ${floorText} · ${heartText} · ${squares}` + (link ? `\n${link}` : '');
  },
  async copyText() {
    if (this.current) await navigator.clipboard.writeText(this.text());
  },
  icon(id, color, size) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      const svg = Icons.svg(id).replaceAll('currentColor', color).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
  },
  // A public link only when served over http(s): a file:// page would leak a local path.
  link() { return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : ''; },
  // Floor states shared by the card and the text: cleared, failed, or not reached.
  floorStates(run) {
    const cleared = Math.min(3, run.stats?.floorsCleared || (run.win ? 3 : 0));
    return Array.from({length:3}, (_, i) => i < cleared ? 'cleared' : i === cleared && !run.win && !run.abandoned ? 'failed' : 'none');
  },
  // Fits text to a width by stepping the font size down.
  fit(ctx, text, weightFamily, size, maxWidth) {
    let px = size;
    do { ctx.font = `${weightFamily.replace('{px}', px)}`; px -= 2; } while (ctx.measureText(text).width > maxWidth && px > 20);
  },
  async draw(run = this.current) {
    if (!run) return null;
    await document.fonts.ready;
    const W = 1080, H = 1350, en = I18n._lang === 'en';
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const gold = '#d4a843', text = '#e8e4d8', dim = '#9a9488', muted = '#6a6a5a';
    const accents = ['#4a7cc4', '#c47d4a', '#9a4ac4'];
    // Background: deep ink, floor-coloured glow behind the hero, soft vignette.
    ctx.fillStyle = '#0c0b12'; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(540, 420, 20, 540, 420, 720);
    glow.addColorStop(0, accents[this.floor(run) - 1] + '66'); glow.addColorStop(1, '#0c0b1200');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const vignette = ctx.createRadialGradient(540, 675, 500, 540, 675, 900);
    vignette.addColorStop(0, '#00000000'); vignette.addColorStop(1, '#000000aa');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
    // Engraved frame with diamond corners.
    ctx.strokeStyle = 'rgba(212,168,67,.35)'; ctx.lineWidth = 2; ctx.strokeRect(40, 40, W - 80, H - 80);
    ctx.strokeStyle = 'rgba(212,168,67,.15)'; ctx.lineWidth = 1; ctx.strokeRect(52, 52, W - 104, H - 104);
    ctx.fillStyle = gold;
    for (const [x, y] of [[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40]]) {
      ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + 10, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 10, y); ctx.closePath(); ctx.fill();
    }
    ctx.textAlign = 'center';
    // Kicker and context line.
    ctx.fillStyle = gold; ctx.font = '700 34px Cinzel';
    ctx.letterSpacing = '6px'; ctx.fillText('2048 ROGUE ASCENSION', 540, 128); ctx.letterSpacing = '0px';
    ctx.fillStyle = dim; ctx.font = '30px "Courier Prime"';
    ctx.fillText(run.daily ? this.label(run) + ' · ' + I18n.t('tier.label', { n:run.tier || 0 }) : this.label(run), 540, 178);
    // Hero: character.
    const character = CHARACTERS.find(c => c.id === run.character) || CHARACTERS[0];
    const characterIcon = await this.icon(character.icon, gold, 150);
    if (characterIcon) ctx.drawImage(characterIcon, 465, 222, 150, 150);
    ctx.fillStyle = text; ctx.font = '40px Cinzel';
    ctx.fillText(I18n.t('character.' + character.id + '.name'), 540, 430);
    // Result.
    const headline = run.win ? I18n.t('tier.victory').toUpperCase() : (en ? `FLOOR ${this.floor(run)} / 3` : `ÉTAGE ${this.floor(run)} / 3`);
    ctx.fillStyle = run.win ? gold : text;
    this.fit(ctx, headline, '700 {px}px Cinzel', 92, 900);
    ctx.fillText(headline, 540, 548);
    ctx.fillStyle = dim;
    const sub = run.win ? (en ? 'All three floors cleared' : 'Les trois étages vaincus') : (en ? 'Against ' : 'Face à ') + this.boss(run);
    this.fit(ctx, sub, '34px Cinzel', 34, 900);
    ctx.fillText(sub, 540, 604);
    // Floor squares, same states as the shared text.
    const states = this.floorStates(run);
    states.forEach((state, i) => {
      const x = 540 - 150 + i * 112, y = 648, size = 76;
      ctx.lineWidth = 3;
      if (state === 'cleared') { ctx.fillStyle = gold; ctx.fillRect(x, y, size, size); }
      else if (state === 'failed') { ctx.fillStyle = 'rgba(196,74,58,.25)'; ctx.fillRect(x, y, size, size); ctx.strokeStyle = '#c44a3a'; ctx.strokeRect(x, y, size, size); }
      else { ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.strokeRect(x, y, size, size); }
      ctx.fillStyle = state === 'cleared' ? '#0c0b12' : state === 'failed' ? '#e8a09a' : muted;
      ctx.font = '700 30px Cinzel'; ctx.fillText(['I', 'II', 'III'][i], x + size / 2, y + 50);
    });
    // Stats: 3 columns × 2 rows, big numerals.
    const stats = run.stats || {};
    const cells = [
      [stats.biggestTile || 0, en ? 'biggest tile' : 'plus grosse tuile'],
      [stats.bestDamage || 0, en ? 'best hit' : 'meilleur coup'],
      [stats.goldEarned || 0, en ? 'gold earned' : 'or gagné'],
      [run.hearts ?? 0, en ? 'hearts left' : 'cœurs restants'],
      [run.relics?.length || 0, en ? 'relics' : 'reliques'],
      [run.tier ? 'A' + run.tier : 'A0', en ? 'tier' : 'palier'],
    ];
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(120, 790); ctx.lineTo(960, 790); ctx.moveTo(120, 1060); ctx.lineTo(960, 1060); ctx.moveTo(120, 925); ctx.lineTo(960, 925); ctx.stroke();
    cells.forEach(([value, label], index) => {
      const x = 120 + 140 + (index % 3) * 280, y = 790 + Math.floor(index / 3) * 135;
      ctx.fillStyle = gold; ctx.font = '700 60px Cinzel'; ctx.fillText(String(value), x, y + 74);
      ctx.fillStyle = dim; ctx.font = '24px "Courier Prime"'; ctx.fillText(label, x, y + 112);
    });
    // Relics, centred.
    const relics = (run.relics || []).slice(0, 10);
    const colors = { common:'#c9c1ae', rare:'#6aa0e8', epic:'#b27ae0', legendary:gold, curse:'#e06a5a' };
    const images = await Promise.all(relics.map(r => this.icon(r.icon, colors[r.isCurse ? 'curse' : r.rarity] || colors.common, 72)));
    const step = 84, startX = 540 - (images.length * step - 12) / 2;
    images.forEach((img, i) => { if (img) ctx.drawImage(img, startX + i * step, 1098, 72, 72); });
    // Footer.
    ctx.fillStyle = muted; ctx.font = '24px "Courier Prime"';
    const link = this.link().replace(/^https?:\/\//, '').replace(/\/$/, '');
    ctx.fillText((link ? link + '  ·  ' : '') + 'seed ' + (run.seed ?? 0), 540, 1262);
    return canvas;
  },
  async share() {
    const canvas = await this.draw();
    if (!canvas) return;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const run = this.current;
    const filename = `2048-rogue-${run.daily || run.seed}.png`;
    const file = new File([blob], filename, {type:'image/png'});
    if (navigator.canShare?.({files:[file]}) && navigator.share) {
      try { await navigator.share({files:[file]}); } catch (error) { if (error.name !== 'AbortError') throw error; }
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  },
};
