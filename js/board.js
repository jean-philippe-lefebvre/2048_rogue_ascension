'use strict';

const Board = {
  empty() { return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0)); },

  getEmpty(board) {
    const cells = [];
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (board[r][c] === 0) cells.push([r, c]);
    return cells;
  },

  addRandom(board, useEntropy = false, forgedEntropyLvl = 0) {
    const empty = this.getEmpty(board);
    if (!empty.length) return null;
    const position = empty[Rng.int(empty.length)];
    let value;
    if (forgedEntropyLvl >= 1) {
      value = [4, 8, 16][forgedEntropyLvl - 1];
    } else {
      value = (useEntropy || Rng.next() < 0.1) ? 4 : 2;
    }
    // Let relics modify tile value and position
    const ctx = { value, position, board, empty };
    RelicHooks.fire('onTileSpawn', ctx);
    board[ctx.position[0]][ctx.position[1]] = ctx.value;
    return ctx.position;
  },

  placeValue(board, val) {
    const empty = this.getEmpty(board);
    if (!empty.length) return;
    const [r, c] = empty[Rng.int(empty.length)];
    board[r][c] = val;
  },

  doubleMax(board) {
    let max = 0, mr = -1, mc = -1;
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (board[r][c] > max) { max = board[r][c]; mr = r; mc = c; }
    if (mr >= 0) board[mr][mc] = max * 2;
  },

  // Slide a single row left, returns { row, score, mergedAt[] }
  // deepForgeChance: 0-1 probability of super-merge (result ×2)
  // Slide a segment (no obstacles) left. Bombs move but don't merge.
  _slideSegment(seg, deepForgeChance) {
    const merged = [];
    const isMerged = new Set();
    let score = 0;
    let lastMergeIdx = -1;

    for (const val of seg) {
      if (val === 0) continue;
      if (val === TILE.BOMB) {
        merged.push(val);
        lastMergeIdx = -1;
        continue;
      }
      if (merged.length && merged[merged.length - 1] === val && merged[merged.length - 1] > 0 && lastMergeIdx !== merged.length - 1) {
        let v = val * 2;
        if (deepForgeChance > 0 && Rng.next() < deepForgeChance) v *= 2;
        merged[merged.length - 1] = v;
        score += v;
        lastMergeIdx = merged.length - 1;
        isMerged.add(merged.length - 1);
      } else {
        merged.push(val);
      }
    }
    while (merged.length < seg.length) merged.push(0);
    return { merged, isMerged, score };
  },

  slideRow(row, deepForgeChance = 0) {
    // Split row into segments separated by obstacles
    const segments = [];
    let current = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      if (row[i] === TILE.OBSTACLE) {
        segments.push({ type: 'seg', cells: current });
        segments.push({ type: 'obs', idx: i });
        current = [];
      } else {
        current.push(row[i]);
      }
    }
    segments.push({ type: 'seg', cells: current });

    // Slide each segment independently, reassemble
    const result = [];
    const mergedAt = [];
    let totalScore = 0;

    for (const part of segments) {
      if (part.type === 'obs') {
        result.push(TILE.OBSTACLE);
      } else {
        const { merged, isMerged, score } = this._slideSegment(part.cells, deepForgeChance);
        totalScore += score;
        const baseIdx = result.length;
        for (let i = 0; i < merged.length; i++) {
          if (isMerged.has(i)) mergedAt.push(baseIdx + i);
          result.push(merged[i]);
        }
      }
    }

    return { row: result, score: totalScore, mergedAt };
  },

  // Apply a move direction, returns { moved, score, merges:[{r,c,val}], newTilePos }
  // mods: { useEntropy, forgedEntropyLvl, deepForgeChance }
  applyMove(board, dir, mods = {}) {
    const { useEntropy = false, forgedEntropyLvl = 0, deepForgeChance = 0 } = mods;
    let moved = false;
    let totalScore = 0;
    const merges = [];

    const processLine = (getLine, setCell) => {
      for (let i = 0; i < GRID_SIZE; i++) {
        const orig = getLine(i);
        const { row, score, mergedAt } = this.slideRow(orig, deepForgeChance);
        if (row.some((v, j) => v !== orig[j])) moved = true;
        totalScore += score;
        row.forEach((v, j) => {
          setCell(i, j, v);
          if (v > 0 && mergedAt.includes(j)) {
            const r = dir === 'up' ? j : dir === 'down' ? GRID_SIZE - 1 - j : i;
            const c = dir === 'left' ? j : dir === 'right' ? GRID_SIZE - 1 - j : i;
            merges.push({ r, c, val: v });
          }
        });
      }
    };

    if (dir === 'left')  processLine(r => [...board[r]],                          (r,c,v) => board[r][c] = v);
    if (dir === 'right') processLine(r => [...board[r]].reverse(),                (r,c,v) => board[r][GRID_SIZE-1-c] = v);
    if (dir === 'up')    processLine(c => board.map(r => r[c]),                   (c,r,v) => board[r][c] = v);
    if (dir === 'down')  processLine(c => [...board.map(r => r[c])].reverse(),    (c,r,v) => board[GRID_SIZE-1-r][c] = v);

    if (!moved) return null;

    const newTilePos = this.addRandom(board, useEntropy, forgedEntropyLvl);
    return { score: totalScore, merges, newTilePos };
  },

  canMove(board) {
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++) {
        if (board[r][c] === 0) return true;
        if (board[r][c] < 0) continue;
        if (c < GRID_SIZE-1 && board[r][c] === board[r][c+1]) return true;
        if (r < GRID_SIZE-1 && board[r][c] === board[r+1][c]) return true;
      }
    return false;
  },

  // Bomb timer system
  _initBombTimers(board, timers) {
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (board[r][c] === TILE.BOMB) {
          timers[`${r},${c}`] = 10 + Rng.int(11); // 10-20 moves
        }
  },

  // Tick all bombs, track their new positions after a move, explode at 0
  tickBombs(board, timers) {
    // Rebuild timer keys to match current bomb positions
    const newTimers = {};
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (board[r][c] === TILE.BOMB) {
          const key = `${r},${c}`;
          // Find closest old timer (bomb may have moved)
          let found = false;
          for (const oldKey of Object.keys(timers)) {
            if (!found) { newTimers[key] = timers[oldKey] - 1; delete timers[oldKey]; found = true; }
          }
          if (!found) newTimers[key] = 15; // fallback for new bombs
        }

    // Check for explosions
    const exploded = [];
    for (const [key, t] of Object.entries(newTimers)) {
      if (t <= 0) {
        const [r, c] = key.split(',').map(Number);
        exploded.push([r, c]);
        delete newTimers[key];
      }
    }

    // Apply explosions: destroy bomb + adjacent tiles
    for (const [br, bc] of exploded) {
      board[br][bc] = 0; // remove bomb
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dr, dc] of dirs) {
        const nr = br + dr, nc = bc + dc;
        if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
          if (board[nr][nc] !== TILE.OBSTACLE) board[nr][nc] = 0; // obstacles survive explosions
        }
      }
    }

    // Update timers ref
    Object.keys(timers).forEach(k => delete timers[k]);
    Object.assign(timers, newTimers);

    return exploded.length > 0;
  },

  checkObjective(board, obj, score, mergeCount) {
    if (obj.id === 'reach') {
      for (let r = 0; r < GRID_SIZE; r++)
        for (let c = 0; c < GRID_SIZE; c++)
          if (board[r][c] >= obj.target) return true;
      return false;
    }
    if (obj.id === 'score')  return score >= obj.target;
    if (obj.id === 'merges') return mergeCount >= obj.target;
    return false;
  },
};
