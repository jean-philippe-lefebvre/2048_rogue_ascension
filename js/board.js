'use strict';

const Board = {
  base() { return typeof GameState !== 'undefined' ? (GameState.base || 2) : 2; },
  rank(value, base = this.base()) { return value > 0 ? Math.log2(value / base) + 1 : 0; },
  empty(size = typeof GameState !== 'undefined' ? (GameState.size || GRID_SIZE) : GRID_SIZE) { return Array.from({ length:size }, () => Array(size).fill(0)); },

  getEmpty(board, excluded = null) {
    excluded ??= typeof GameState !== 'undefined' && GameState.board === board ? GameState.room?.combat?.voidCell : null;
    const cells = [];
    for (let r = 0; r < board.length; r++)
      for (let c = 0; c < board.length; c++)
        if (board[r][c] === 0 && !(excluded && excluded[0] === r && excluded[1] === c)) cells.push([r, c]);
    return cells;
  },

  addRandom(board, useEntropy = false, forgedEntropyLvl = 0, excluded = null) {
    excluded ??= typeof GameState !== 'undefined' && GameState.board === board ? GameState.room?.combat?.voidCell : null;
    const empty = this.getEmpty(board, excluded);
    if (!empty.length) return null;
    const position = empty[Rng.int(empty.length)];
    let value;
    if (forgedEntropyLvl >= 1) {
      value = this.base() * 2 ** (forgedEntropyLvl + 1);
    } else {
      value = (useEntropy || Rng.next() < 0.1) ? this.base() * 2 : this.base();
    }
    // Let relics modify tile value and position
    const ctx = { value, position, board, empty };
    RelicHooks.fire('onTileSpawn', ctx);
    board[ctx.position[0]][ctx.position[1]] = ctx.value;
    // A kind (Magnet's gold) is applied once every hook has settled the final position.
    const kinds = typeof GameState !== 'undefined' && GameState.board === board ? GameState.kinds : null;
    if (ctx.kind && kinds) kinds[ctx.position[0]][ctx.position[1]] = ctx.kind;
    return ctx.position;
  },

  placeValue(board, val, excluded = null) {
    excluded ??= typeof GameState !== 'undefined' && GameState.board === board ? GameState.room?.combat?.voidCell : null;
    const empty = this.getEmpty(board, excluded);
    if (!empty.length) return;
    const [r, c] = empty[Rng.int(empty.length)];
    board[r][c] = val;
  },

  doubleMax(board) {
    let max = 0, mr = -1, mc = -1;
    for (let r = 0; r < board.length; r++)
      for (let c = 0; c < board.length; c++)
        if (board[r][c] > max) { max = board[r][c]; mr = r; mc = c; }
    if (mr >= 0) board[mr][mc] = max * 2;
  },

  emptyKinds(size = typeof GameState !== 'undefined' ? (GameState.size || GRID_SIZE) : GRID_SIZE) { return Array.from({ length:size }, () => Array(size).fill(null)); },

  gravity(board, kinds, timers = {}) {
    const moves = [], nextTimers = {};
    for (let c = 0; c < board.length; c++) {
      let bottom = board.length - 1;
      for (let r = board.length - 1; r >= 0; r--) {
        const value = board[r][c], kind = kinds[r][c];
        if (value === TILE.OBSTACLE || kind === 'ice') { bottom = r - 1; continue; }
        if (!value) continue;
        if (bottom !== r) {
          board[bottom][c] = value; kinds[bottom][c] = kind;
          board[r][c] = 0; kinds[r][c] = null;
          moves.push({ from:{r,c}, to:{r:bottom,c} });
        }
        if (value === TILE.BOMB) nextTimers[`${bottom},${c}`] = timers[`${r},${c}`] ?? 15;
        bottom--;
      }
    }
    Object.keys(timers).forEach(key => delete timers[key]);
    Object.assign(timers, nextTimers);
    return moves;
  },

  flip(board, kinds, seals, timers, iceHits, portals, axis = 'horizontal', obstacleAge = {}, voidCell = null) {
    const size = board.length;
    const point = ([r,c]) => axis === 'horizontal' ? [r,size-1-c] : [size-1-r,c];
    for (const grid of [board,kinds]) {
      const source = grid.map(row => [...row]);
      for (let r=0;r<size;r++) for (let c=0;c<size;c++) { const [sr,sc] = point([r,c]); grid[r][c] = source[sr][sc]; }
    }
    for (const object of [seals,timers,iceHits,obstacleAge]) {
      const entries = Object.entries(object || {});
      entries.forEach(([key]) => delete object[key]);
      entries.forEach(([key,value]) => { const [r,c] = point(key.split(',').map(Number)); object[`${r},${c}`] = value; });
    }
    for (const cell of portals) { const mapped = point(cell); cell[0]=mapped[0]; cell[1]=mapped[1]; }
    return voidCell ? point(voidCell) : null;
  },

  // A line is ordered from the side the player moved toward. Ice and obstacles
  // split it into independent segments. Entries retain their source coordinate.
  _moveLine(values, kinds, sources, deepForgeChance = 0) {
    const output = [], merges = [], moveMap = [];
    let score = 0, gold = 0;
    const flush = segment => {
      const compact = segment.filter(e => e.value !== 0);
      const placed = [];
      for (const entry of compact) {
        const last = placed[placed.length - 1];
        const a = last?.value, b = entry.value;
        const normal = a > 0 && b > 0 && a === b;
        const joker = (a === TILE.JOKER && (b > 0 || b === TILE.JOKER)) || (b === TILE.JOKER && a > 0);
        const mult = (a === TILE.MULT && b > 0) || (b === TILE.MULT && a > 0);
        if (last && !last.merged && (normal || joker || mult)) {
          let value = normal ? a * 2 : a === TILE.JOKER && b === TILE.JOKER ? 2 * this.base() : 2 * Math.max(a, b);
          if (deepForgeChance > 0 && Rng.next() < deepForgeChance) value *= 2;
          last.value = value;
          last.kind = last.kind === 'gold' || entry.kind === 'gold' ? 'gold' : null;
          last.merged = true;
          last.origins.push(...entry.origins);
          score += value;
          const payout = last.kind === 'gold' ? Math.max(1, Math.floor(value / (4 * this.base()))) : 0;
          gold += payout;
          merges.push({ index:output.length + placed.length - 1, val:value, gold:payout, normal });
        } else placed.push({ ...entry, origins:[...entry.origins], merged:false });
      }
      for (let j = 0; j < segment.length; j++) {
        const e = placed[j] || { value:0, kind:null, origins:[] };
        const index = output.length;
        output.push(e);
        for (const from of e.origins) moveMap.push({ from, index });
      }
    };
    let segment = [];
    for (let i = 0; i < values.length; i++) {
      const value = values[i], kind = kinds[i];
      if (value === TILE.OBSTACLE || kind === 'ice') {
        flush(segment); segment = [];
        output.push({ value, kind, origins:[sources[i]] });
        moveMap.push({ from:sources[i], index:output.length - 1 });
      } else segment.push({ value, kind:value > 0 ? kind : null, origins:value ? [sources[i]] : [] });
    }
    flush(segment);
    return { output, merges, moveMap, score, gold };
  },

  slideRow(row, deepForgeChance = 0, kinds = Array(row.length).fill(null)) {
    const sources = row.map((_, i) => i);
    const line = this._moveLine(row, kinds, sources, deepForgeChance);
    return { row:line.output.map(e => e.value), kinds:line.output.map(e => e.kind),
      score:line.score, gold:line.gold, mergedAt:line.merges.map(m => m.index) };
  },

  // Mutates the supplied board and kinds. The move map describes every tile,
  // including both contributors to a merge, so auxiliary state can follow it.
  applyMove(board, dir, mods = {}) {
    const { useEntropy = false, forgedEntropyLvl = 0, deepForgeChance = 0 } = mods;
    const size = board.length;
    const kinds = mods.kinds || this.emptyKinds(size);
    const iceHits = mods.iceHits || {};
    const sourceBoard = board.map(row => [...row]);
    const sourceKinds = kinds.map(row => [...row]);
    const coordinate = (line, index) => ({
      r: dir === 'up' ? index : dir === 'down' ? size - 1 - index : line,
      c: dir === 'left' ? index : dir === 'right' ? size - 1 - index : line,
    });
    let score = 0, gold = 0;
    const merges = [], moveMap = [], bombMoves = [];
    for (let lineIndex = 0; lineIndex < size; lineIndex++) {
      const positions = Array.from({ length:size }, (_, i) => coordinate(lineIndex, i));
      const values = positions.map(({r,c}) => sourceBoard[r][c]);
      const tags = positions.map(({r,c}) => sourceKinds[r][c]);
      const line = this._moveLine(values, tags, positions, deepForgeChance);
      score += line.score; gold += line.gold;
      line.output.forEach((e, i) => {
        const {r,c} = positions[i]; board[r][c] = e.value;
      });
      line.merges.forEach(m => merges.push({ ...coordinate(lineIndex,m.index), val:m.val, gold:m.gold, normal:m.normal }));
      line.moveMap.forEach(({from,index}) => {
        const to = coordinate(lineIndex,index);
        moveMap.push({ from,to });
        if (sourceBoard[from.r][from.c] === TILE.BOMB) bombMoves.push({ from,to });
      });
    }
    const nextKinds = this.emptyKinds(size);
    for (const {from,to} of moveMap) {
      const kind = sourceKinds[from.r][from.c];
      if (kind === 'gold' || (kind === 'ice' && nextKinds[to.r][to.c] !== 'gold'))
        nextKinds[to.r][to.c] = kind;
    }
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
      kinds[r][c] = nextKinds[r][c];
    const moved = board.some((row,r) => row.some((value,c) => value !== sourceBoard[r][c] || kinds[r][c] !== sourceKinds[r][c]));
    if (!moved) return null;
    const cracked = [], thawed = [];
    for (const merge of merges) for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const r = merge.r + dr, c = merge.c + dc;
      if (kinds[r]?.[c] !== 'ice') continue;
      const key = `${r},${c}`;
      iceHits[key] = (iceHits[key] || 0) + 1;
      if (iceHits[key] >= 2) { kinds[r][c] = null; delete iceHits[key]; thawed.push({r,c}); }
      else cracked.push({r,c});
    }
    const newTilePos = this.addRandom(board, useEntropy, forgedEntropyLvl, mods.voidCell);
    return { score, gold, merges, newTilePos, moveMap, bombMoves, cracked, thawed };
  },

  canMove(board, kinds = this.emptyKinds(board.length)) {
    const size = board.length;
    for (const dir of ['left','right','up','down']) {
      const coordinate = (line, index) => ({
        r: dir === 'up' ? index : dir === 'down' ? size - 1 - index : line,
        c: dir === 'left' ? index : dir === 'right' ? size - 1 - index : line,
      });
      for (let line = 0; line < size; line++) {
        const cells = Array.from({length:size}, (_,i) => coordinate(line,i));
        const values = cells.map(({r,c}) => board[r][c]);
        const tags = cells.map(({r,c}) => kinds[r][c]);
        const next = this.slideRow(values, 0, tags);
        if (next.row.some((v,i) => v !== values[i]) || next.kinds.some((v,i) => v !== tags[i])) return true;
      }
    }
    return false;
  },

  createPortals(board) {
    const empty = this.getEmpty(board);
    const pairs = [];
    for (let i = 0; i < empty.length; i++) for (let j = i + 1; j < empty.length; j++) {
      const a = empty[i], b = empty[j];
      if (Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) > 1) pairs.push([a,b]);
    }
    return pairs.length ? pairs[Rng.int(pairs.length)] : [];
  },

  applyPortals(board, kinds, timers, portals) {
    if (!portals || portals.length !== 2) return [];
    const [a,b] = portals;
    const va = board[a[0]][a[1]], vb = board[b[0]][b[1]];
    const movable = (v, kind) => kind !== 'ice' && (v > 0 || v === TILE.JOKER || v === TILE.MULT || v === TILE.BOMB);
    if (!movable(va,kinds[a[0]][a[1]]) && !movable(vb,kinds[b[0]][b[1]])) return [];
    if ((va !== 0 && !movable(va,kinds[a[0]][a[1]])) || (vb !== 0 && !movable(vb,kinds[b[0]][b[1]]))) return [];
    const keyA = `${a[0]},${a[1]}`, keyB = `${b[0]},${b[1]}`;
    [board[a[0]][a[1]],board[b[0]][b[1]]] = [vb,va];
    [kinds[a[0]][a[1]],kinds[b[0]][b[1]]] = [kinds[b[0]][b[1]],kinds[a[0]][a[1]]];
    const ta = timers[keyA], tb = timers[keyB];
    delete timers[keyA]; delete timers[keyB];
    if (tb !== undefined) timers[keyA] = tb;
    if (ta !== undefined) timers[keyB] = ta;
    return [a,b];
  },

  // Bomb timer system
  _initBombTimers(board, timers) {
    for (let r = 0; r < board.length; r++)
      for (let c = 0; c < board.length; c++)
        if (board[r][c] === TILE.BOMB) {
          timers[`${r},${c}`] = 10 + Rng.int(11); // 10-20 moves
        }
  },

  remapBombTimers(timers, bombMoves) {
    const moved = {};
    for (const { from, to } of bombMoves) {
      const oldKey = `${from.r},${from.c}`;
      moved[`${to.r},${to.c}`] = timers[oldKey] ?? 15;
    }
    Object.keys(timers).forEach(key => delete timers[key]);
    Object.assign(timers, moved);
  },

  // Tick bombs after movement and defuses; return the number that exploded.
  tickBombs(board, timers, kinds = this.emptyKinds(board.length)) {
    const exploded = [];
    for (const key of Object.keys(timers)) {
      const [r, c] = key.split(',').map(Number);
      if (board[r]?.[c] !== TILE.BOMB) { delete timers[key]; continue; }
      if (--timers[key] <= 0) {
        const [r, c] = key.split(',').map(Number);
        exploded.push([r, c]);
        delete timers[key];
      }
    }

    // Explosions halve numbered tiles and remove adjacent movable special tiles.
    for (const [br, bc] of exploded) {
      board[br][bc] = 0;
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dr, dc] of dirs) {
        const nr = br + dr, nc = bc + dc;
        if (nr < 0 || nr >= board.length || nc < 0 || nc >= board.length) continue;
        if (board[nr][nc] > 0) board[nr][nc] = Math.max(this.base(), board[nr][nc] / 2);
        else if (board[nr][nc] === TILE.JOKER || board[nr][nc] === TILE.MULT) {
          board[nr][nc] = 0; kinds[nr][nc] = null;
        }
      }
    }
    return exploded.length;
  },

};
