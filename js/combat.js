'use strict';

// Deterministic combat rules. Callers supply the board and the seeded Rng stream.
const Combat = {
  directions: ['left', 'right', 'up', 'down'],
  opposite: { left:'right', right:'left', up:'down', down:'up' },
  pick(floor, kind) {
    const pool = ENEMIES.filter(e => e.floor === floor && e.kind === kind);
    return pool[Rng.int(pool.length)];
  },
  create(def) {
    const fight = { id:def.id, maxHp:def.hp, hp:def.hp, block:0, cadence:def.cadence,
      pattern:def.pattern, patternIndex:0, intentIn:def.cadence, phase:1,
      locked:null, lockTurns:0, invertTurns:0, seals:{}, intentDirection:null,
      reviveAvailable:def.id === 'necromancer', voidCell:null };
    this.announce(fight);
    return fight;
  },
  announce(fight) {
    const intent = fight.pattern[fight.patternIndex % fight.pattern.length];
    if (intent === 'lock') {
      const choices = this.directions.filter(d => d !== fight.locked);
      fight.intentDirection = choices[Rng.int(choices.length)];
    } else fight.intentDirection = null;
    return intent;
  },
  intent(fight) { return fight.pattern[fight.patternIndex % fight.pattern.length]; },
  direction(fight, input) { return fight.invertTurns > 0 ? this.opposite[input] : input; },
  isLocked(fight, input) { return fight.lockTurns > 0 && fight.locked === input; },
  hasLegalMove(fight, board, kinds = Board.emptyKinds(board.length)) {
    for (const input of this.directions) {
      if (this.isLocked(fight, input)) continue;
      const dir = this.direction(fight, input);
      for (let i = 0; i < board.length; i++) {
        const row = dir === 'left' ? board[i] : dir === 'right' ? [...board[i]].reverse()
          : dir === 'up' ? board.map(r => r[i]) : board.map(r => r[i]).reverse();
        const tags = dir === 'left' ? kinds[i] : dir === 'right' ? [...kinds[i]].reverse()
          : dir === 'up' ? kinds.map(r => r[i]) : kinds.map(r => r[i]).reverse();
        const slid = Board.slideRow(row, 0, tags).row;
        if (slid.some((value,j) => value !== row[j])) return true;
      }
    }
    return false;
  },
  damage(fight, merges) {
    const combo = 1 + 0.25 * Math.max(0, merges.length - 1);
    const raw = Math.floor(merges.reduce((sum, merge) => sum + merge.val, 0) * combo * (fight.invertTurns > 0 ? 1.25 : 1));
    const absorbed = Math.min(raw, fight.block);
    fight.block -= absorbed;
    fight.hp = Math.max(0, fight.hp - (raw - absorbed));
    this.revive(fight);
    return { raw, dealt:raw - absorbed, absorbed, combo };
  },
  revive(fight) {
    if (fight.id !== 'necromancer' || !fight.reviveAvailable || fight.hp > 0) return false;
    fight.reviveAvailable = false;
    fight.hp = Math.ceil(fight.maxHp * 0.4);
    fight.phase = 2;
    fight.cadence = 3;
    fight.pattern = ['seal','strike','heal'];
    fight.patternIndex = 0;
    fight.intentIn = fight.cadence;
    this.announce(fight);
    return true;
  },
  placeVoid(fight, board, portals = []) {
    const cells = Board.getEmpty(board).filter(([r,c]) => !portals.some(([pr,pc]) => pr===r && pc===c)
      && !(fight.voidCell?.[0] === r && fight.voidCell?.[1] === c));
    if (cells.length) fight.voidCell = cells[Rng.int(cells.length)];
    return fight.voidCell;
  },
  consumeVoid(fight, board, kinds) {
    if (!fight.voidCell) return null;
    const [r,c] = fight.voidCell, value = board[r][c];
    if (value <= 0) return null;
    board[r][c] = 0; kinds[r][c] = null;
    fight.hp = Math.min(fight.maxHp, fight.hp + Math.floor(value/2));
    return {r,c,value};
  },
  breakHazards(fight, board, merges, bombTimers) {
    const broken = [];
    for (const merge of merges) {
      if (Board.rank(merge.val) < 4) continue;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const r = merge.r + dr, c = merge.c + dc, key = `${r},${c}`;
        if (key in fight.seals && board[r]?.[c] === TILE.OBSTACLE) {
          board[r][c] = 0; delete fight.seals[key]; broken.push({ r,c,kind:'seal' });
        } else if (board[r]?.[c] === TILE.BOMB) {
          board[r][c] = 0; delete bombTimers[key]; broken.push({ r,c,kind:'bomb' });
        }
      }
    }
    return broken;
  },
  tick(fight, board, phaseChanged = false) {
    for (const [key, ttl] of Object.entries(fight.seals)) {
      if (--fight.seals[key] <= 0) {
        const [r,c] = key.split(',').map(Number);
        if (board[r][c] === TILE.OBSTACLE) board[r][c] = 0;
        delete fight.seals[key];
      }
    }
    if (fight.lockTurns > 0 && --fight.lockTurns === 0) fight.locked = null;
    if (fight.invertTurns > 0) fight.invertTurns--;
    if (!phaseChanged) fight.intentIn--;
  },
  phase(fight, def) {
    if (fight.id !== 'necromancer' && fight.phase === 1 && def.phase2 && fight.hp > 0 && fight.hp <= fight.maxHp / 2) {
      fight.phase = 2; fight.cadence = def.phase2.cadence; fight.pattern = def.phase2.pattern;
      fight.patternIndex = 0; fight.intentIn = fight.cadence; this.announce(fight);
      return true;
    }
    return false;
  },
  resolve(fight, board, bombTimers, floor, kinds = Board.emptyKinds(board.length), portals = [], iceHits = {}, obstacleAge = {}) {
    if (fight.intentIn > 0 || fight.hp <= 0) return null;
    const intent = this.intent(fight);
    const effect = { intent, cells:[], strike:0 };
    // A shield only holds until the enemy's next action.
    fight.block = 0;
    if (intent === 'seal' || intent === 'seal2' || intent === 'bomb') {
      const count = intent === 'seal2' ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const empty = Board.getEmpty(board, fight.voidCell).filter(([r,c]) => !portals.some(([pr,pc]) => pr === r && pc === c));
        if (!empty.length) break;
        const [r,c] = empty[Rng.int(empty.length)], key = `${r},${c}`;
        board[r][c] = intent === 'bomb' ? TILE.BOMB : TILE.OBSTACLE;
        if (intent === 'bomb') bombTimers[key] = 5;
        else fight.seals[key] = fight.id === 'jailer' ? 8 : 6;
        effect.cells.push([r,c]);
      }
    } else if (intent === 'freeze') {
      const numbered = [];
      for (let r = 0; r < board.length; r++) for (let c = 0; c < board.length; c++)
        if (board[r][c] > 0 && kinds[r][c] !== 'ice') numbered.push([r,c]);
      const strong = numbered.filter(([r,c]) => Board.rank(board[r][c]) >= 3);
      const pool = strong.length ? strong : numbered;
      if (pool.length) { const [r,c] = pool[Rng.int(pool.length)]; kinds[r][c] = 'ice'; effect.cells.push([r,c]); }
    } else if (intent === 'gnaw') {
      let best = 0, at = null;
      for (let r = 0; r < board.length; r++) for (let c = 0; c < board.length; c++)
        if (board[r][c] > best) { best = board[r][c]; at = [r,c]; }
      if (at) { board[at[0]][at[1]] = Math.max(Board.base(), best / 2); effect.cells.push(at); }
    } else if (intent === 'strike') {
      effect.strike = floor === 2 ? 3 : 2;
    } else if (intent === 'lock') {
      fight.locked = fight.intentDirection; fight.lockTurns = 3;
    } else if (intent === 'invert') {
      fight.invertTurns = 2;
    } else if (intent === 'heal') {
      fight.hp = Math.min(fight.maxHp, fight.hp + Math.floor(fight.maxHp * 0.12));
    } else if (intent === 'shield') {
      fight.block = Math.floor(fight.maxHp * 0.08);
    } else if (intent === 'devour') {
      // The Glutton eats up to two smallest tiles (reading order, not frozen): it takes away merge material.
      for (let r=0;r<board.length;r++) for (let c=0;c<board.length;c++)
        if (effect.cells.length < 2 && Board.rank(board[r][c]) === 1 && kinds[r][c] !== 'ice') { board[r][c]=0; kinds[r][c]=null; effect.cells.push([r,c]); }
    } else if (intent === 'flip' || intent === 'flipv') {
      fight.voidCell = Board.flip(board,kinds,fight.seals,bombTimers,iceHits,portals,
        intent === 'flip' ? 'horizontal' : 'vertical',obstacleAge,fight.voidCell);
    } else if (intent === 'void') {
      this.placeVoid(fight,board,portals);
    }
    fight.patternIndex++;
    fight.intentIn = fight.cadence;
    this.announce(fight);
    return effect;
  },
  bombExploded(fight) {
    if (fight.id === 'smith') fight.hp = Math.min(fight.maxHp, fight.hp + Math.floor(fight.maxHp * 0.05));
  },
  loseHeart(run) { run.hearts = Math.max(0, (run.hearts ?? 3) - 1); return run.hearts === 0; },
  leftoverGold(movesLeft) { return Math.floor(Math.max(0, movesLeft) / 2); },
};
