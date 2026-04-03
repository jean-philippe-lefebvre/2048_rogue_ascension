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
    const position = empty[Math.floor(Math.random() * empty.length)];
    let value;
    if (forgedEntropyLvl >= 1) {
      value = [4, 8, 16][forgedEntropyLvl - 1];
    } else {
      value = (useEntropy || Math.random() < 0.1) ? 4 : 2;
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
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
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
  slideRow(row, deepForgeChance = 0) {
    const normals  = row.filter(v => v > 0);
    const specials = row.filter(v => v < 0);
    const out = [];
    let addedScore = 0;
    const mergedAt = [];
    let lastMergeIdx = -1;

    for (let i = 0; i < normals.length; i++) {
      if (out.length && out[out.length - 1] === normals[i] && lastMergeIdx !== out.length - 1) {
        let v = normals[i] * 2;
        // Deep Forge: chance to double the merge result
        if (deepForgeChance > 0 && Math.random() < deepForgeChance) v *= 2;
        out[out.length - 1] = v;
        addedScore += v;
        lastMergeIdx = out.length - 1;
        mergedAt.push(out.length - 1);
      } else {
        out.push(normals[i]);
      }
    }

    // Pad with specials then zeros
    const full = [...out, ...specials];
    while (full.length < GRID_SIZE) full.push(0);
    return { row: full.slice(0, GRID_SIZE), score: addedScore, mergedAt };
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
          if (v > 0 && mergedAt.includes(j)) merges.push({ r: i, c: j, val: v });
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
