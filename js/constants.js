'use strict';

const GRID_SIZE = 4;
const GRID_GAP  = 7;   // px, matches CSS --gap
const GRID_PAD  = 8;   // px, matches CSS --grid-pad

const ROOM_DEFS = {
  normal:  { icon:'⚔',  label:'Combat',   color:'var(--text-dim)' },
  elite:   { icon:'💀', label:'Élite',    color:'var(--red)' },
  rest:    { icon:'🏕',  label:'Repos',    color:'var(--green)' },
  mystery: { icon:'?',  label:'Mystère',  color:'var(--purple)' },
  boss:    { icon:'👁',  label:'BOSS',     color:'var(--red)' },
};

// Calibrated objectives per floor (index 0,1,2) and room type
const OBJECTIVES = {
  0: {
    normal: [
      { id:'merges', target:6,  label:'6 fusions' },
      { id:'merges', target:8,  label:'8 fusions' },
      { id:'reach',  target:32, label:'Atteindre 32' },
      { id:'reach',  target:64, label:'Atteindre 64' },
    ],
    elite: [
      { id:'reach',  target:64,  label:'Atteindre 64' },
      { id:'merges', target:10,  label:'10 fusions' },
    ],
  },
  1: {
    normal: [
      { id:'merges', target:12,  label:'12 fusions' },
      { id:'merges', target:14,  label:'14 fusions' },
      { id:'reach',  target:128, label:'Atteindre 128' },
    ],
    elite: [
      { id:'reach',  target:128, label:'Atteindre 128' },
      { id:'reach',  target:256, label:'Atteindre 256' },
      { id:'merges', target:16,  label:'16 fusions' },
    ],
  },
  2: {
    normal: [
      { id:'reach',  target:128, label:'Atteindre 128' },
      { id:'reach',  target:256, label:'Atteindre 256' },
      { id:'merges', target:16,  label:'16 fusions' },
    ],
    elite: [
      { id:'reach',  target:256, label:'Atteindre 256' },
      { id:'merges', target:20,  label:'20 fusions' },
    ],
  },
};

// ── Relic Hook System ──
const RelicHooks = {
  fire(hookName, ctx) {
    const run = GameState.run;
    if (!run) return ctx;
    for (const relic of run.relics) {
      if (relic.hooks?.[hookName]) relic.hooks[hookName](ctx, run, GameState);
    }
    return ctx;
  }
};

const RELICS = [
  // ══════ COMMON ══════
  { id:'entropy',   icon:'🎲', name:'Entropie',      rarity:'common', desc:'Les nouvelles tuiles sont toujours des 4.',       effect:'+50% valeur tuile',
    hooks: { onTileSpawn: ctx => { ctx.value = Math.max(ctx.value, 4); } } },
  { id:'greed',     icon:'💰', name:'Avidité',        rarity:'common', desc:'Chaque fusion rapporte +1 or.',                   effect:'+1 or par fusion',
    hooks: { onGoldCalc: ctx => { ctx.gold += ctx.merges.length; } } },
  { id:'haste',     icon:'⚡', name:'Hâte',           rarity:'common', desc:'+5 coups dans toutes les salles.',                effect:'+5 coups max',
    hooks: { onMovesCalc: ctx => { ctx.bonus += 5; } } },
  { id:'shield',    icon:'🛡', name:'Bouclier',       rarity:'common', desc:'Les bombes sont neutralisées au début de chaque salle.', effect:'Bombes désactivées',
    hooks: { onRoomStart: ctx => { for(let r=0;r<GRID_SIZE;r++) for(let c=0;c<GRID_SIZE;c++) if(ctx.board[r][c]===TILE.BOMB) ctx.board[r][c]=0; } } },
  { id:'sprout',    icon:'🌱', name:'Germination',    rarity:'common', desc:'+1 tuile de départ dans chaque salle.',           effect:'3 tuiles au départ',
    hooks: { onRoomStart: ctx => { Board.addRandom(ctx.board, false, 0); } } },
  { id:'collector', icon:'🪙', name:'Collecteur',     rarity:'common', desc:'+3 or à chaque salle terminée.',                  effect:'+3 or/salle',
    hooks: { onRoomEnd: ctx => { if(ctx.won) ctx.goldBonus += 3; } } },
  { id:'compass',   icon:'📐', name:'Précision',      rarity:'common', desc:'Les tuiles apparaissent toujours sur les bords.', effect:'Spawn sur les bords',
    hooks: { onTileSpawn: ctx => { const edges=ctx.empty.filter(([r,c])=>r===0||r===GRID_SIZE-1||c===0||c===GRID_SIZE-1); if(edges.length) ctx.position=edges[Math.floor(Math.random()*edges.length)]; } } },

  // ══════ RARE ══════
  { id:'echo',      icon:'🔮', name:'Écho',           rarity:'rare', desc:'Après chaque fusion, une tuile apparaît aléatoirement.', effect:'Tuile bonus par fusion',
    hooks: { onAfterMove: ctx => { if(ctx.result.merges.length>0) Board.addRandom(ctx.board, false, 0); } } },
  { id:'magnet',    icon:'🧲', name:'Aimant',         rarity:'rare', desc:'+3 coups au début de chaque salle.',               effect:'+3 coups/salle',
    hooks: { onMovesCalc: ctx => { ctx.bonus += 3; } } },
  { id:'tide',      icon:'🌊', name:'Marée',          rarity:'rare', desc:'1×/salle : le premier coup sans fusion est gratuit.', effect:'1 coup gratuit/salle',
    hooks: { onAfterMove: (ctx, run, gs) => { const rs=gs.room.relicState; if(!rs._tideUsed && ctx.result.merges.length===0) { rs._tideUsed=true; ctx.freeMove=true; } } } },
  { id:'blade',     icon:'🗡', name:'Lame double',    rarity:'rare', desc:'Les fusions 2+2 donnent 8 au lieu de 4.',          effect:'2+2 → 8',
    hooks: { onAfterMove: ctx => { for(const m of ctx.result.merges) { if(m.val===4) { ctx.board[m.r][m.c]=8; m.val=8; } } } } },
  { id:'focus',     icon:'🎯', name:'Focus',          rarity:'rare', desc:'+20% de coups dans les salles élite.',              effect:'+20% coups élite',
    hooks: { onMovesCalc: ctx => { if(ctx.type==='elite') ctx.bonus+=Math.floor(ctx.base*0.2); } } },
  { id:'recycle',   icon:'🔄', name:'Recyclage',      rarity:'rare', desc:'Quand tu rates une salle, récupère la moitié de l\'or.', effect:'50% or sur défaite',
    hooks: { onRoomEnd: ctx => { if(!ctx.won) ctx.goldBonus+=Math.floor(ctx.roomReward/2); } } },

  // ══════ EPIC ══════
  { id:'crystal',   icon:'💎', name:'Cristal',        rarity:'epic', desc:'Début de salle : la tuile la plus haute double de valeur.', effect:'×2 tuile max au départ',
    hooks: { onRoomStart: ctx => { Board.doubleMax(ctx.board); } } },
  { id:'mirror',    icon:'🪞', name:'Miroir',         rarity:'epic', desc:'Chaque salle commence avec une copie de la dernière tuile créée.', effect:'Tuile bonus au départ',
    hooks: { onRoomStart: (ctx, run) => { if(run.lastTileVal>0) Board.placeValue(ctx.board, run.lastTileVal); } } },
  { id:'hourglass', icon:'⏳', name:'Sablier',        rarity:'epic', desc:'+1 coup chaque fois que tu fusionnes une tuile ≥ 64.', effect:'+1 coup si fusion ≥ 64',
    hooks: { onAfterMove: ctx => { if(ctx.result.merges.some(m=>m.val>=64)) ctx.addMove+=1; } } },
  { id:'vortex',    icon:'🌀', name:'Vortex',         rarity:'epic', desc:'1×/salle : quand tu atteins 0 coups, gagne +5 coups.', effect:'+5 coups de survie',
    hooks: { onMovesExhausted: (ctx, run, gs) => { const rs=gs.room.relicState; if(!rs._vortexUsed) { rs._vortexUsed=true; ctx.movesLeft=5; ctx.consumed=true; ctx.overlayIcon='🌀'; ctx.overlayTitle='VORTEX !'; ctx.overlaySub='+5 coups !'; } } } },
  { id:'crown',     icon:'👑', name:'Couronne',       rarity:'epic', desc:'Les salles boss donnent le double d\'or.',           effect:'×2 or boss',
    hooks: { onRoomEnd: ctx => { if(ctx.won && ctx.type==='boss') ctx.goldMultiplier*=2; } } },
  { id:'dupli',     icon:'🧬', name:'Duplication',    rarity:'epic', desc:'Début de salle : la tuile la plus basse est dupliquée.', effect:'Copie tuile min',
    hooks: { onRoomStart: ctx => { let min=Infinity; for(let r=0;r<GRID_SIZE;r++) for(let c=0;c<GRID_SIZE;c++) { const v=ctx.board[r][c]; if(v>0&&v<min) min=v; } if(min<Infinity) Board.placeValue(ctx.board, min); } } },

  // ══════ LEGENDARY ══════
  { id:'phoenix',   icon:'🔥', name:'Phénix',         rarity:'legendary', desc:'1×/run : si tu rates une salle, rejoue-la avec +10 coups.', effect:'1 seconde vie',
    hooks: { onMovesExhausted: (ctx, run) => { if(run._phoenixReady) { run._phoenixReady=false; ctx.movesLeft=10; ctx.consumed=true; ctx.overlayIcon='🔥'; ctx.overlayTitle='PHÉNIX !'; ctx.overlaySub='Le Phénix te sauve ! +10 coups'; } },
             onRunStart: (ctx, run) => { run._phoenixReady = true; } } },
  { id:'transmute', icon:'⚗️', name:'Transmutation',  rarity:'legendary', desc:'Les obstacles se transforment en tuile 4 après 3 coups.', effect:'Obstacles → tuile 4',
    hooks: { onTransmute: (ctx) => { ctx.active = true; } } },
  { id:'darkpact',  icon:'💀', name:'Pacte sombre',   rarity:'legendary', desc:'-10 coups max, mais chaque fusion donne +2 or.', effect:'-10 coups, +2 or/fusion',
    hooks: { onMovesCalc: ctx => { ctx.bonus -= 10; }, onGoldCalc: ctx => { ctx.gold += ctx.merges.length * 2; } } },
  { id:'eclipse',   icon:'🌙', name:'Éclipse',        rarity:'legendary', desc:'Les tuiles 2, 8, 32, 128, 512 sont doublées au spawn.', effect:'Tuiles impaires ×2',
    hooks: { onTileSpawn: ctx => { if([2,8,32,128,512].includes(ctx.value)) ctx.value*=2; } } },
  { id:'berserker', icon:'⚔️', name:'Berserker',      rarity:'legendary', desc:'+15 coups max, mais les fusions ne rapportent aucun or.', effect:'+15 coups, 0 or',
    hooks: { onMovesCalc: ctx => { ctx.bonus += 15; }, onGoldCalc: ctx => { ctx.gold = 0; } } },

  // ══════ CURSES (malus) ══════
  { id:'web',       icon:'🕸', name:'Toile',          rarity:'curse', isCurse:true, desc:'-3 coups dans toutes les salles.',   effect:'-3 coups max',
    hooks: { onMovesCalc: ctx => { ctx.bonus -= 3; } } },
  { id:'fragile',   icon:'🦴', name:'Fragilité',      rarity:'curse', isCurse:true, desc:'Les obstacles apparaissent aussi dans les salles normales.', effect:'Obstacles partout',
    hooks: { onRoomStart: ctx => { if(ctx.type==='normal') Board.placeValue(ctx.board, TILE.OBSTACLE); } } },
  { id:'sealed',    icon:'🔒', name:'Scellé',         rarity:'curse', isCurse:true, desc:'Les salles de repos ne proposent plus de reliques.', effect:'Repos = boutique seule',
    hooks: {} },
  { id:'cursed',    icon:'👁‍🗨', name:'Malédiction',    rarity:'curse', isCurse:true, desc:'1 obstacle indestructible apparaît dans chaque salle.', effect:'+1 obstacle permanent',
    hooks: { onRoomStart: ctx => { Board.placeValue(ctx.board, TILE.OBSTACLE); } } },
  { id:'slow',      icon:'🐌', name:'Lenteur',        rarity:'curse', isCurse:true, desc:'Les tuiles générées reculent d\'un cran.', effect:'Tuiles -1 niveau',
    hooks: { onTileSpawn: ctx => { if(ctx.value > 2) ctx.value = ctx.value / 2; } } },
  { id:'tax',       icon:'💸', name:'Taxe',           rarity:'curse', isCurse:true, desc:'-20% de l\'or gagné dans chaque salle.', effect:'-20% or',
    hooks: { onGoldCalc: ctx => { ctx.gold = Math.floor(ctx.gold * 0.8); } } },
];

const ASCENSION_COSTS = [150, 300, 500];
const MAX_ASCENSION   = ASCENSION_COSTS.length;

const META_DEFS = [
  // ── Base (Ascension 0+) ──
  { id:'extraMoves',  icon:'⏳', name:'Élan',           maxLvl:4, costs:[20,40,70,110], ascReq:0, desc:'Coups de base de toutes les salles.',     getEffect: l => `+${l*2} coups de base` },
  { id:'startTile',   icon:'🃏', name:'Tuile de départ', maxLvl:3, costs:[30,60,100],   ascReq:0, desc:'Commence chaque run avec une tuile bonus.', getEffect: l => `Tuile ${[4,8,16][l-1]} au départ` },
  { id:'goldBonus',   icon:'💰', name:'Alchimie',        maxLvl:3, costs:[25,50,90],    ascReq:0, desc:"Or gagné en fin de salle.",               getEffect: l => `+${l*2} or/salle` },
  { id:'relicSlots',  icon:'🎒', name:'Besace',          maxLvl:2, costs:[50,100],      ascReq:0, desc:'Plus de choix de reliques proposés.',     getEffect: l => `${l+3} reliques proposées` },
  { id:'startRelic',  icon:'🌟', name:'Bénédiction',     maxLvl:1, costs:[80],          ascReq:0, desc:'1 relique commune gratuite au départ.',   getEffect: _  => '1 relique gratuite' },

  // ── Ascension 1 ──
  { id:'forgedEntropy', icon:'🔥', name:'Entropie Forgée', maxLvl:3, costs:[40,80,150], ascReq:1, desc:'Les tuiles générées commencent plus haut.', getEffect: l => `Tuiles de base : ${[4,8,16][l-1]}` },
  { id:'synergy',       icon:'🔗', name:'Synergie',        maxLvl:2, costs:[60,120],    ascReq:1, desc:'Plus de reliques proposées par étage.',     getEffect: l => `+${l} choix de reliques` },

  // ── Ascension 2 ──
  { id:'deepForge',  icon:'⚗️', name:'Forge Profonde', maxLvl:3, costs:[50,100,180], ascReq:2, desc:'Chance de super-fusion (résultat ×2).', getEffect: l => `${l*10}% chance super-fusion` },
  { id:'destiny',    icon:'🌠', name:'Destinée',       maxLvl:1, costs:[100],        ascReq:2, desc:'Choisis 1 relique rare au début de chaque run.', getEffect: _ => '1 relique rare au départ' },

  // ── Ascension 3 ──
  { id:'singularity', icon:'💫', name:'Singularité', maxLvl:1, costs:[200],       ascReq:3, desc:'1×/run : quand une tuile atteint 128+, tout le board double.', getEffect: _ => 'Doublement total à 128+' },
  { id:'mastery',     icon:'👁', name:'Maîtrise',    maxLvl:3, costs:[80,150,250], ascReq:3, desc:'Coups bonus dans les salles boss.',                           getEffect: l => `+${l*10}% coups boss` },
];

const BOSS_OBJECTIVES = [
  [{ id:'reach', target:128, label:'Atteindre 128' }],
  [{ id:'reach', target:256, label:'Atteindre 256' }],
  [{ id:'reach', target:512, label:'Atteindre 512' }],
];

// Relic drop weights per rarity, indexed by floor (0, 1, 2)
const RARITY_WEIGHTS = {
  common:    [50, 35, 20],
  rare:      [30, 30, 30],
  epic:      [15, 25, 30],
  legendary: [ 5, 10, 20],
  curse:     [ 0,  0,  0], // curses never appear in normal relic offers
};

// Special tile type codes (negative values on board)
const TILE = { OBSTACLE: -1, BOMB: -2 };
