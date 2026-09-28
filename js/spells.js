'use strict';

// Spell rules are independent of DOM and combat timing.
const Spells = {
  copy(value) { return JSON.parse(JSON.stringify(value)); },
  snapshot(gs) {
    return this.copy({ board:gs.board, kinds:gs.kinds, portals:gs.portals,
      bombTimers:gs.bombTimers, obstacleAge:gs.obstacleAge, iceHits:gs.room.iceHits,
      combat:gs.room.combat, relicState:gs.room.relicState, size:gs.size || gs.board.length, base:gs.base || 2, movesLeft:gs.movesLeft,
      score:gs.score, mergeCount:gs.mergeCount, gold:gs.run.gold,
      totalScore:gs.run.totalScore, lastTileVal:gs.run.lastTileVal, lastTileRank:gs.run.lastTileRank,
      spells:gs.run.spells, rngState:Rng._state,
      singularityReady:gs.run.singularityReady, phoenixReady:gs.run._phoenixReady, wildcardMoves:gs.run._wildcardMoves || 0 });
  },
  restore(gs, value) {
    const s = this.copy(value);
    for (const key of ['board','kinds','portals','bombTimers','obstacleAge','movesLeft','score','mergeCount']) gs[key] = s[key];
    gs.size = s.size || s.board.length; gs.base = s.base || 2;
    for (const key of ['iceHits','combat','relicState']) gs.room[key] = s[key];
    for (const key of ['gold','totalScore','lastTileVal','lastTileRank']) gs.run[key] = s[key];
    gs.run.spells = s.spells;
    gs.run.singularityReady = s.singularityReady;
    gs.run._phoenixReady = s.phoenixReady;
    gs.run._wildcardMoves = s.wildcardMoves || 0;
    Rng._state = s.rngState;
  },
  movable(gs, r, c) {
    const value = gs.board[r]?.[c];
    return (value > 0 && gs.kinds[r][c] !== 'ice') || [TILE.JOKER,TILE.MULT,TILE.BOMB].includes(value);
  },
  valid(gs, id, r, c, targets = []) {
    if (r < 0 || r >= gs.board.length || c < 0 || c >= gs.board.length) return false;
    if (id === 'smash') return gs.board[r][c] !== 0;
    if (id === 'swap') return this.movable(gs,r,c) && !targets.some(([tr,tc]) => tr === r && tc === c);
    return false;
  },
  canCast(gs, id) {
    if (id === 'undo') return !!gs.room?.undo;
    if (id === 'joker' || id === 'catalyst') return Board.getEmpty(gs.board).length > 0;
    if (id === 'smash') return gs.board.some(row => row.some(v => v !== 0));
    if (id === 'swap') return gs.board.flat().filter((_,i) => this.movable(gs,Math.floor(i/gs.board.length),i%gs.board.length)).length >= 2;
    return true;
  },
  rotateGrid(grid) {
    return Array.from({length:grid.length}, (_,r) => Array.from({length:grid.length}, (_,c) => grid[grid.length-1-c][r]));
  },
  rotateKeys(object, size = typeof GameState !== 'undefined' ? (GameState.size || GRID_SIZE) : GRID_SIZE) {
    const result = {};
    for (const [key,value] of Object.entries(object || {})) {
      const [r,c] = key.split(',').map(Number);
      result[`${c},${size-1-r}`] = value;
    }
    return result;
  },
  apply(gs, id, targets = []) {
    if (!this.canCast(gs,id)) return false;
    if (id === 'smash') {
      const [r,c] = targets[0] || [];
      if (!this.valid(gs,id,r,c)) return false;
      if (gs.kinds[r][c] === 'ice') {
        gs.kinds[r][c] = null; delete gs.room.iceHits[`${r},${c}`];
      } else {
        gs.board[r][c] = 0; gs.kinds[r][c] = null;
        delete gs.room.combat.seals[`${r},${c}`];
        delete gs.bombTimers[`${r},${c}`];
        delete gs.obstacleAge[`${r},${c}`];
      }
    } else if (id === 'swap') {
      const [a,b] = targets;
      if (!a || !b || !this.valid(gs,id,...a) || !this.valid(gs,id,...b,[a])) return false;
      for (const grid of [gs.board,gs.kinds]) [grid[a[0]][a[1]],grid[b[0]][b[1]]] = [grid[b[0]][b[1]],grid[a[0]][a[1]]];
      const ka = a.join(','), kb = b.join(','), ta = gs.bombTimers[ka], tb = gs.bombTimers[kb];
      delete gs.bombTimers[ka]; delete gs.bombTimers[kb];
      if (ta !== undefined) gs.bombTimers[kb] = ta;
      if (tb !== undefined) gs.bombTimers[ka] = tb;
    } else if (id === 'undo') {
      this.restore(gs,gs.room.undo); gs.room.undo = null;
    } else if (id === 'pivot') {
      gs.board = this.rotateGrid(gs.board); gs.kinds = this.rotateGrid(gs.kinds);
      gs.room.combat.seals = this.rotateKeys(gs.room.combat.seals,gs.board.length);
      gs.bombTimers = this.rotateKeys(gs.bombTimers,gs.board.length);
      gs.obstacleAge = this.rotateKeys(gs.obstacleAge,gs.board.length);
      gs.room.iceHits = this.rotateKeys(gs.room.iceHits,gs.board.length);
      gs.portals = gs.portals.map(([r,c]) => [c,gs.board.length-1-r]);
      if (gs.room.combat.voidCell) {
        const [r,c] = gs.room.combat.voidCell;
        gs.room.combat.voidCell = [c,gs.board.length-1-r];
      }
    } else if (id === 'joker' || id === 'catalyst') {
      const empty = Board.getEmpty(gs.board);
      const [r,c] = empty[Rng.int(empty.length)];
      gs.board[r][c] = id === 'joker' ? TILE.JOKER : TILE.MULT;
    } else return false;
    return true;
  },
  charge(run) {
    const spell = run.spells.find(s => s.charges < 3);
    if (!spell) return false;
    spell.charges++;
    return true;
  },
  chargeAll(run) {
    let changed = false;
    for (const spell of run.spells) if (spell.charges < 3) { spell.charges++; changed = true; }
    return changed;
  },
};
