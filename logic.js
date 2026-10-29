'use strict';
// 보글보글 스타일 규칙. 화면 없이 Node 에서 시험한다 (DOM 을 쓰지 않는다).
// 화면은 한 판 크기 256x200 (타일 8픽셀, 32x25). 위가 y=0, 길이는 모두 픽셀, 시간은 초.
const LOGIC_BUBBLE = (() => {
const TILE = 8, COLS = 32, ROWS = 25, W = COLS * TILE, H = ROWS * TILE;
// 판마다 나오는 적의 표 (브라우저에서는 levels.js 가 먼저 불러와져 전역으로 있고, Node 에서는 require 한다)
const ENEMY_TABLE = typeof LEVEL_ENEMIES !== 'undefined' ? LEVEL_ENEMIES : require('./levels.js');
const WALL = 16;                                            // 양쪽 벽 두께, 천장 두께
const FLOOR_ROW = 22;                                       // 바닥 윗면 줄
const TIER_ROWS = [17, 12, 7, 4];                           // 발판 윗면 줄 (아래에서 위로)
const FLOOR_GAP = [14, 17];                                 // 바닥에 뚫린 구멍 (떨어지면 위로 돌아온다)
const GRAVITY = 620, JUMP_V = 238, MAX_FALL = 270;
const PLAYER_SPEED = 72, PLAYER_W = 14, PLAYER_H = 14;
const START_LIVES = 3, INVULN = 2.6, RESPAWN = 1.4;
const SHOT_COOL = 0.3;                                      // 한 번 쏘고 다음에 쏠 때까지의 시간 (동시에 떠 있는 방울 수에는 제한이 없다)
const BUBBLE_R = 8, TRAP_LIFE = 7, EMPTY_LIFE = 8;
const HURRY_AT = 42, BARON_AT = 56;
const EXTRA_LIFE_SCORES = [30000, 100000, 400000, 1000000, 2000000];      // 점수로 얻는 목숨 (그 뒤로는 EXTEND 로만)
const EXTEND_LETTERS = ['E', 'X', 'T', 'E', 'N', 'D'];
const CANDY_AT = { speed: 15, range: 35, rate: 35 };           // 신발은 방울 위에 15번 올라서면, 파란 사탕(거리)은 방울을 35번 터뜨리면, 노란 사탕(쏘는 속도)은 방울을 35번 뿜으면
const CANDY_ORDER = ['speed', 'range', 'rate'];                   // 한꺼번에 조건이 차면 이 순서로 (한 판에 하나)
const SPECIAL = { water: { pts: 7000, speed: 110, life: 6 }, fire: { pts: 9000, speed: 70, life: 5 }, lightning: { pts: 8000, speed: 300, life: 1 } };
const CHAIN_WINDOW = 0.9;
const KILL_POINTS = 1000, BUBBLE_POINTS = 10;                  // 적이 갇힌 방울을 터뜨리면 1000점(한꺼번에 이어서 터뜨리면 두 배씩), 빈 방울을 터뜨리면 10점 (오락실 원작 점수)
// 적 종류 (원작 일반 모드): 처음 나오는 판은 젠짱 1 · 마이타 6 · 몬스타 10 · 풀풀 20 · 바네보 30 · 히데곤 40 · 드렁크 50 · 인베이더 60
//   젠짱: 느리게 걷고, 가끔 멈춰서 위 발판으로 뛰어오른다 · 마이타: 느리고 부술 수 없는 바위를 던진다 · 몬스타: 대각선으로 날며 벽에 튕긴다
//   풀풀: 벽에 튕기되 옆으로 더 많이 움직인다 · 바네보: 짧게 뛰어서만 움직인다 · 히데곤: 빨리 걸으며 멈추지 않고 불을 쏜다, 점프는 서툴다
//   드렁크: 빠르고 점프를 잘하며 벽에 튕겨 돌아오는 병을 던진다 · 인베이더: 걷기만 하고 일정한 박자로 아래로 레이저를 쏜다
const KINDS = {
  zen: { w: 14, h: 14, speed: 36, ai: 'walk', jump: 1 },
  mighta: { w: 14, h: 14, speed: 34, ai: 'walk', jump: 0.5, throws: 'rock' },
  monsta: { w: 14, h: 14, speed: 40, ai: 'fly', fx: 0.7, fy: 0.7 },
  pulpul: { w: 14, h: 14, speed: 46, ai: 'fly', fx: 0.95, fy: 0.35 },
  banebou: { w: 14, h: 14, speed: 48, ai: 'hop' },
  hidegons: { w: 14, h: 14, speed: 58, ai: 'walk', jump: 0.15, throws: 'fire' },
  drunk: { w: 14, h: 14, speed: 60, ai: 'walk', jump: 1.5, throws: 'bottle' },
  invader: { w: 14, h: 14, speed: 36, ai: 'walk', jump: 0, throws: 'laser' },
};
const FIRST_LEVEL = { zen: 1, mighta: 6, monsta: 10, pulpul: 20, banebou: 30, hidegons: 40, drunk: 50, invader: 60 };
const LAST_LEVEL = 100;
const FRUITS = ['cherry', 'orange', 'banana', 'apple', 'grape', 'melon', 'star'];
const FRUIT_POINTS = 700;                                  // 일반 과일 (원작 점수)

const rng = (seed) => {                                      // mulberry32 (시험용 고정 난수)
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const emit = (st, e) => { st.events.push(e); };

// ---------- 100판의 발판 모양 ----------
// 원작의 판 하나하나를 그대로 옮긴 것이 아니다: 원작처럼 판마다 모양이 모두 다르게, 대칭이 많고, 발판이 서로 닿을 수 있게 만든 100가지다
// 줄(윗면 줄 번호) → [시작 칸, 끝 칸] 목록. 발판 층의 간격은 5줄(40픽셀) 이하여서 점프로 오른다
const STYLES = [[17, 12, 7, 4], [18, 14, 10, 6], [19, 16, 13, 10, 7, 4], [17, 12, 7], [18, 13, 8, 4], [18, 15, 12, 9, 6]];
const STYLE_WEIGHT = [30, 22, 12, 14, 14, 8];
function pickWeighted(r, w) { let x = r() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; } return w.length - 1; }
function randomSegs(r, mirror) {
  const lo = 2, hi = mirror ? 15 : 29;
  const n = 1 + Math.floor(r() * (mirror ? 2 : 3));
  const segs = [];
  let c = lo + Math.floor(r() * 3);
  for (let i = 0; i < n && c <= hi - 2; i++) {
    const len = 3 + Math.floor(r() * (mirror ? 8 : 10));
    const a = c, b = Math.min(hi, c + len);
    if (b - a >= 2) segs.push([a, b]);
    c = b + 2 + Math.floor(r() * 4);
  }
  if (!segs.length) segs.push([lo + 1, Math.min(hi, lo + 6)]);
  if (!mirror) return segs;
  const full = [];
  for (const [a, b] of segs) { full.push([a, b]); }
  for (const [a, b] of segs.slice().reverse()) full.push([31 - b, 31 - a]);       // 가운데를 기준으로 좌우 대칭
  // 가운데에서 맞닿거나 겹치는 것은 하나로 합친다
  full.sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const seg of full) { const last = out[out.length - 1]; if (last && seg[0] <= last[1] + 1) last[1] = Math.max(last[1], seg[1]); else out.push([seg[0], seg[1]]); }
  return out;
}
// 모든 발판이 바닥에서 시작해 점프(위층과 5칸 이내) 또는 떨어짐으로 닿는가
function connected(map) {
  const floorRows = [FLOOR_ROW].concat(Object.keys(map).map(Number)).sort((a, b) => b - a);
  const segs = [{ row: FLOOR_ROW, a: 2, b: FLOOR_GAP[0] - 1 }, { row: FLOOR_ROW, a: FLOOR_GAP[1] + 1, b: COLS - 3 }];
  for (const row of Object.keys(map)) for (const [a, b] of map[row]) segs.push({ row: Number(row), a, b });
  const gap = (x, y) => Math.max(0, Math.max(x.a, y.a) - Math.min(x.b, y.b));
  const seen = new Set([0]); const q = [0];
  while (q.length) {
    const i = q.shift();
    segs.forEach((o, j) => {
      if (seen.has(j)) return;
      if (Math.abs(floorRows.indexOf(o.row) - floorRows.indexOf(segs[i].row)) === 1 && Math.abs(o.row - segs[i].row) <= 5 && gap(segs[i], o) <= 5) { seen.add(j); q.push(j); }
    });
  }
  return seen.size === segs.length;
}
function makeMaps() {
  const maps = [], used = new Set();
  for (let level = 1; level <= LAST_LEVEL; level++) {
    const r = rng(7001 + level * 7919);
    let map = null;
    for (let attempt = 0; attempt < 400 && !map; attempt++) {
      const rows = STYLES[pickWeighted(r, STYLE_WEIGHT)];
      const mirror = r() < 0.7;
      const m = {};
      rows.forEach((row, i) => {
        if (i > 0 && r() < 0.12) return;                                                    // 가끔 한 층은 비운다
        m[row] = randomSegs(r, mirror);
      });
      const sig = JSON.stringify(m);
      if (used.has(sig) || !connected(m) || Object.keys(m).length < 2) continue;
      used.add(sig); map = m;
    }
    maps.push(map);
  }
  return maps;
}
const MAPS = makeMaps();

// ---------- 판 ----------
// 타일: 0 비어 있음 · 1 단단한 벽 · 2 발판 윗면(아래에서는 지나감) · 3 발판 몸통(그림만)
function buildTiles(level) {
  const t = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  for (let r = 0; r < ROWS; r++) for (const c of [0, 1, COLS - 2, COLS - 1]) t[r][c] = 1;
  for (let c = 0; c < COLS; c++) { t[0][c] = 1; t[1][c] = 1; }
  const platform = (row, a, b) => { for (let c = a; c <= b; c++) { t[row][c] = 2; if (row + 1 < ROWS) t[row + 1][c] = 3; } };
  platform(FLOOR_ROW, 2, FLOOR_GAP[0] - 1); platform(FLOOR_ROW, FLOOR_GAP[1] + 1, COLS - 3);
  for (let r = FLOOR_ROW + 2; r < ROWS; r++) for (let c = 2; c < COLS - 2; c++) if (c < FLOOR_GAP[0] || c > FLOOR_GAP[1]) t[r][c] = 3;
  const m = MAPS[Math.min(level, LAST_LEVEL) - 1];
  for (const row of Object.keys(m)) for (const [a, b] of m[row]) platform(Number(row), a, b);
  return t;
}

// 한 판의 적 목록: 판마다 나올 적의 종류와 마리 수는 levels.js 의 표(LEVEL_ENEMIES)가 정한다.
// 종류를 번갈아 가며 한 마리씩 내보내서(젠짱, 마이타, 젠짱, 마이타 …) 한 종류만 몰려 나오지 않게 한다. 100판이 넘으면 마지막 판의 표를 쓴다
const KIND_ORDER = Object.keys(FIRST_LEVEL);
function enemyList(level) {
  const row = ENEMY_TABLE[Math.min(Math.max(level, 1), LAST_LEVEL) - 1] || { zen: 4 };
  const left = KIND_ORDER.filter((k) => row[k] > 0).map((k) => ({ kind: k, n: row[k] }));
  const kinds = [];
  while (left.some((x) => x.n > 0)) for (const x of left) if (x.n > 0) { kinds.push(x.kind); x.n--; }
  const xs = [40, 216, 100, 160, 72, 188, 128, 28, 232];
  return kinds.map((kind, i) => ({ at: 0.5 + i * 0.6, kind, x: xs[i % xs.length] }));
}

function newBody(x, y, w, h) { return { x, y, w, h, vx: 0, vy: 0, ground: false }; }

function newGame(rand = Math.random) {
  const st = {
    rand, score: 0, lives: START_LIVES, extra: 0, level: 1, time: 0, events: [], seq: 0,
    stats: { pops: 0, traps: 0, shots: 0 },
    mods: { speed: 0, rate: 0, range: 0 },                     // 사탕·신발로 얻은 힘 (각각 두 번까지)
    counts: { blown: 0, popped: 0, bounced: 0 }, extend: new Array(6).fill(false),
    player: null, phase: 'play',
  };
  startLevel(st, 1);
  st.events = [];
  return st;
}

function startLevel(st, level) {
  st.level = level;
  st.tiles = buildTiles(level);
  st.t = 0; st.phase = 'play'; st.phaseT = 0;
  st.queue = enemyList(level);
  st.enemies = []; st.bubbles = []; st.items = []; st.baron = null;
  st.hurry = false; st.chain = { n: 0, t: 0 };
  st.effects = []; st.shots = []; st.candyThisLevel = false; st.specialT = 8 + st.rand() * 6;
  const floorY = FLOOR_ROW * TILE;
  const p = newBody(24, floorY - PLAYER_H, PLAYER_W, PLAYER_H);
  st.player = Object.assign(p, { alive: true, face: 1, invuln: INVULN, cool: 0, respawn: 0, ride: null, coyote: 0, anim: 0 });
  emit(st, { t: 'level', level });
}

// ---------- 물리 ----------
const tileAt = (st, c, r) => (r >= ROWS ? 0 : c < 0 || c >= COLS || r < 0 ? 1 : st.tiles[r][c]);     // 화면 아래는 열려 있다(떨어지면 위로 돌아온다)

// 중력을 받으며 한 걸음. 발판은 위에서 내려올 때만 밟는다
function fall(st, b, dt, onlyTop = true) {
  b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
  const prevFeet = b.y + b.h;
  let ny = b.y + b.vy * dt;
  b.ground = false;
  if (b.vy >= 0) {
    const newFeet = ny + b.h;
    const c0 = Math.floor((b.x + 1) / TILE), c1 = Math.floor((b.x + b.w - 1) / TILE);
    for (let r = Math.ceil((prevFeet - 0.01) / TILE); r <= Math.floor(newFeet / TILE); r++) {
      let hit = false;
      for (let c = c0; c <= c1; c++) { const v = tileAt(st, c, r); if (v === 2 || (v === 1 && r * TILE >= WALL)) { hit = true; break; } }
      if (hit) { ny = r * TILE - b.h; b.vy = 0; b.ground = true; break; }
    }
  }
  b.y = ny;
  if (b.y < WALL) { b.y = WALL; if (b.vy < 0) b.vy = 0; }                                  // 천장
  if (b.y > H + 4) { b.y = WALL; b.vy = Math.min(b.vy, 60); emit(st, { t: 'wrap', who: b.kind || 'player' }); }    // 바닥 구멍으로 떨어지면 위로 돌아온다
}
function walls(b) {
  if (b.x < WALL) { b.x = WALL; return -1; }
  if (b.x + b.w > W - WALL) { b.x = W - WALL - b.w; return 1; }
  return 0;
}

// ---------- 시작 ----------
function addScore(st, n) {
  st.score += n;
  while (st.extra < EXTRA_LIFE_SCORES.length && st.score >= EXTRA_LIFE_SCORES[st.extra]) { st.extra++; st.lives++; emit(st, { t: 'extraLife' }); }
}

function makeEnemy(st, kind, cx, y, extra) {
  const k = KINDS[kind];
  const e = Object.assign(newBody(cx - k.w / 2, y, k.w, k.h), {
    id: ++st.seq, kind, dir: st.rand() < 0.5 ? -1 : 1, angry: false, prot: 0.9, think: 1 + st.rand() * 2, alive: true, ang: st.rand() * 6.28, anim: 0,
    atkT: 1.4 + st.rand() * 2, pause: 0, hopT: 0.3,
  }, extra);
  if (k.ai === 'fly') { const sg = () => (st.rand() < 0.5 ? -1 : 1); e.vx = sg() * k.speed * k.fx; e.vy = sg() * k.speed * k.fy; e.dir = e.vx >= 0 ? 1 : -1; }
  return e;
}
function spawnEnemy(st, s) {
  const e = makeEnemy(st, s.kind, s.x, WALL + 2, { angry: st.hurry });
  st.enemies.push(e);
  emit(st, { t: 'spawn', kind: s.kind });
}

function shoot(st) {
  const p = st.player;
  if (p.cool > 0) return;
  const sp = 150 * (1 + 0.28 * st.mods.range);
  const bx = p.x + p.w / 2 + p.face * 14;
  const b = { id: ++st.seq, x: bx, y: p.y + p.h / 2 - 1, vx: p.face * sp, vy: -4, r: BUBBLE_R, age: 0, phase: 'shot', enemy: null, life: EMPTY_LIFE, dead: false };
  if (bx < WALL + BUBBLE_R || bx > W - WALL - BUBBLE_R) {            // 벽에 바싹 붙어 불면 방울이 바로 터진다 (한 방울당 10점)
    b.x = Math.max(WALL + BUBBLE_R, Math.min(W - WALL - BUBBLE_R, bx));
    st.stats.shots++; st.counts.blown++;
    popBubble(st, b, true);
    emit(st, { t: 'shoot' });
    p.cool = SHOT_COOL / (1 + 0.45 * st.mods.rate);
    checkCandy(st);
    return;
  }
  st.bubbles.push(b);
  p.cool = SHOT_COOL / (1 + 0.45 * st.mods.rate);
  st.stats.shots++;
  st.counts.blown++; checkCandy(st);
  emit(st, { t: 'shoot' });
}

function playerHit(st, why) {
  const p = st.player;
  if (!p.alive || p.invuln > 0) return;
  p.alive = false; p.ride = null;
  st.lives--;
  st.mods = { speed: 0, rate: 0, range: 0 };
  emit(st, { t: 'crash', x: p.x, y: p.y, why });
  p.respawn = RESPAWN;
  if (st.lives <= 0) { st.phase = 'dying'; st.phaseT = 2.2; }
}

function popBubble(st, b, byPlayer) {
  b.dead = true;
  if (byPlayer) { st.counts.popped++; checkCandy(st); }
  if (b.letter !== undefined) { collectLetter(st, b); return; }
  if (b.special) { triggerSpecial(st, b); return; }
  if (!b.enemy) {
    if (byPlayer) addScore(st, BUBBLE_POINTS);
    emit(st, { t: 'pop', x: b.x, y: b.y, trapped: false, pts: byPlayer ? BUBBLE_POINTS : 0 });
    return;
  }
  // 갇힌 적이 터진다: 연쇄로 터뜨릴수록 점수가 두 배씩
  if (st.time - st.chain.t > CHAIN_WINDOW) st.chain.n = 0;
  st.chain.t = st.time;
  const pts = KILL_POINTS * 2 ** Math.min(st.chain.n, 7);
  st.chain.n++;
  addScore(st, pts);
  st.stats.pops++;
  emit(st, { t: 'kill', x: b.x, y: b.y, pts, kind: b.enemy.kind, chain: st.chain.n });
  if (st.chain.n >= 3) spawnLetter(st, b.x, b.y);                                    // 세 마리째부터 한 마리마다 EXTEND 글자 방울이 하나씩 나온다
  const fruit = FRUITS[Math.min(FRUITS.length - 1, Math.floor((st.level - 1) / 2))];
  st.items.push(Object.assign(newBody(b.x - 5, b.y - 5, 10, 10), { kind: 'fruit', type: fruit, pts: FRUIT_POINTS, age: 0, vy: -90 }));
}

// ---------- 사탕 · EXTEND · 특수 방울 ----------
function dropCandy(st, type) {
  st.candyThisLevel = true;
  st.items.push(Object.assign(newBody(40 + st.rand() * 170, WALL, 10, 10), { kind: 'candy', type, age: 0 }));
  emit(st, { t: 'candyDrop', type });
}
// 쏜 수·터뜨린 수·방울 위에 올라선 수가 차면 사탕이 떨어진다 (한 판에 하나, 판이 끝나면 사라진다)
function checkCandy(st) {
  if (st.candyThisLevel || st.phase !== 'play') return;
  const key = { speed: 'bounced', range: 'popped', rate: 'blown' };
  for (const type of CANDY_ORDER) {
    if (st.counts[key[type]] >= CANDY_AT[type] && st.mods[type] < 2) { st.counts[key[type]] = 0; dropCandy(st, type); return; }
  }
}
function spawnLetter(st, x, y) {
  const left = [0, 1, 2, 3, 4, 5].filter((i) => !st.extend[i] && !st.bubbles.some((b) => b.letter === i));
  if (!left.length) return;
  const idx = left[Math.floor(st.rand() * left.length)];
  st.bubbles.push({ id: ++st.seq, x, y, vx: (st.rand() - 0.5) * 20, vy: -26, r: BUBBLE_R, age: 0, phase: 'float', enemy: null, letter: idx, life: 18, dead: false });
  emit(st, { t: 'letter', idx, spawned: true });
}
function collectLetter(st, b) {
  st.extend[b.letter] = true;
  emit(st, { t: 'letter', idx: b.letter, x: b.x, y: b.y, letter: EXTEND_LETTERS[b.letter] });
  if (st.extend.every(Boolean)) {                                                    // EXTEND 완성: 목숨 +1, 이 판은 건너뛴다
    st.extend = new Array(6).fill(false);
    st.lives++;
    emit(st, { t: 'extend' }); emit(st, { t: 'extraLife' });
    st.enemies = []; st.queue = [];
    for (const o of st.bubbles) if (o.enemy) o.dead = true;
    st.effects = [];
    st.phase = 'clear'; st.phaseT = 2.6;
    emit(st, { t: 'clear', level: st.level, skipped: true });
  }
}
function triggerSpecial(st, b) {
  const type = b.special;
  emit(st, { t: 'special', type, x: b.x, y: b.y });
  if (type === 'lightning') { for (const dir of [-1, 1]) st.effects.push({ kind: 'bolt', type, x: b.x, y: b.y, ox: b.x, dir, t: 0, life: SPECIAL.lightning.life }); }
  else st.effects.push({ kind: 'flow', type, x: b.x, y: b.y, w: 8, h: 6, dir: 0, vy: 40, t: 0, life: SPECIAL[type].life });
}
function spawnSpecial(st) {
  const type = ['water', 'lightning', 'fire'][Math.floor(st.rand() * 3)];
  st.bubbles.push({ id: ++st.seq, x: 40 + st.rand() * 176, y: FLOOR_ROW * TILE - 6, vx: (st.rand() - 0.5) * 16, vy: -28, r: BUBBLE_R, age: 0, phase: 'float', enemy: null, special: type, life: 16, dead: false });
  emit(st, { t: 'specialBubble', type });
}
function burn(st, e, type) {                                                         // 적이 보석으로 바뀐다
  e.alive = false;
  st.stats.burned = (st.stats.burned || 0) + 1;
  st.items.push(Object.assign(newBody(e.x + e.w / 2 - 5, e.y, 10, 10), { kind: 'diamond', type, pts: SPECIAL[type].pts, age: 0, vy: -70 }));
  emit(st, { t: 'burn', type, x: e.x, y: e.y });
}
// ---------- 적의 공격 ----------
// 마이타(바위) · 히데곤(불) · 드렁크(병) · 인베이더(레이저)
function attack(st, e, k, h) {
  const p = st.player;
  e.atkT -= h;
  if (e.atkT > 0) return;
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  if (k.throws === 'rock') {
    if (p.alive && e.ground && Math.abs(p.y - e.y) < 24) {
      e.dir = p.x > e.x ? 1 : -1; e.pause = 0.45; e.atkT = 3 + st.rand() * 2;
      st.shots.push({ kind: 'rock', x: cx + e.dir * 8, y: cy, vx: e.dir * 38, vy: 0, life: 7, owner: e.id });
      emit(st, { t: 'enemyShot', kind: 'rock' });
    } else e.atkT = 0.5;
  } else if (k.throws === 'fire') {
    e.atkT = 1.5 + st.rand() * 1.4;
    st.shots.push({ kind: 'fire', x: cx + e.dir * 8, y: cy, vx: e.dir * 95, vy: 0, life: 1.1, owner: e.id });
    emit(st, { t: 'enemyShot', kind: 'fire' });
  } else if (k.throws === 'bottle') {
    if (st.shots.some((o) => o.kind === 'bottle' && o.owner === e.id)) { e.atkT = 0.4; return; }
    e.atkT = 2 + st.rand() * 1.5;
    st.shots.push({ kind: 'bottle', x: cx + e.dir * 8, y: cy, vx: e.dir * 100, vy: 0, life: 6, owner: e.id, back: false });
    emit(st, { t: 'enemyShot', kind: 'bottle' });
  } else if (k.throws === 'laser') {
    e.atkT = 1.7;
    st.shots.push({ kind: 'laser', x: cx, y: cy + 6, vx: 0, vy: 140, life: 3, owner: e.id });
    emit(st, { t: 'enemyShot', kind: 'laser' });
  }
}
function updateShots(st, h) {
  const p = st.player;
  for (const sh of st.shots) {
    sh.life -= h;
    sh.x += sh.vx * h; sh.y += sh.vy * h;
    if (sh.kind === 'bottle') {
      const owner = st.enemies.find((e) => e.id === sh.owner && e.alive);
      if (!owner) { sh.life = 0; continue; }
      if (!sh.back && (sh.x < WALL + 4 || sh.x > W - WALL - 4)) { sh.x = Math.max(WALL + 4, Math.min(W - WALL - 4, sh.x)); sh.vx = -sh.vx; sh.back = true; }
      if (sh.back) {                                                                       // 벽에 튕겨 던진 사람에게 돌아오면 받는다
        const ox = owner.x + owner.w / 2, oy = owner.y + owner.h / 2;
        sh.vx = Math.sign(ox - sh.x) * 100; sh.y += Math.sign(oy - sh.y) * 20 * h;
        if (Math.abs(sh.x - ox) < 9 && Math.abs(sh.y - oy) < 14) sh.life = 0;
      }
    } else if (sh.kind === 'rock' || sh.kind === 'fire') {
      if (sh.x < WALL || sh.x > W - WALL) sh.life = 0;
    } else if (sh.kind === 'laser') {
      if (sh.y > H) sh.life = 0;
    }
    if (p.alive && sh.life > 0 && Math.abs(sh.x - (p.x + p.w / 2)) < 7 && Math.abs(sh.y - (p.y + p.h / 2)) < 8) playerHit(st, sh.kind);
  }
  st.shots = st.shots.filter((sh) => sh.life > 0);
}

function updateEffects(st, h) {
  const out = [];
  for (const f of st.effects) {
    f.t += h;
    if (f.t > f.life) continue;
    if (f.kind === 'bolt') {
      f.x += f.dir * SPECIAL.lightning.speed * h;
      if (f.x < -10 || f.x > W + 10) continue;
      for (const e of st.enemies) {
        const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
        if (e.alive && Math.abs(f.y - ey) < 10 && (f.dir > 0 ? ex > f.ox - 4 && ex < f.x + 4 : ex < f.ox + 4 && ex > f.x - 4)) burn(st, e, 'lightning');
      }
      out.push(f); continue;
    }
    // 물 · 불: 떨어지다 발판 위에 닿으면 양쪽으로 퍼져 흐른다
    const sp = SPECIAL[f.type].speed;
    const prevFeet = f.y + f.h;
    if (f.dir !== 0) f.x += f.dir * sp * h;
    f.vy = Math.min(260, f.vy + 520 * h);
    let ny = f.y + f.vy * h;
    const col = Math.floor(f.x / TILE);
    let landed = false;
    for (let r = Math.ceil((prevFeet - 0.01) / TILE); r <= Math.floor((ny + f.h) / TILE); r++) {
      if (tileAt(st, col, r) === 2) { ny = r * TILE - f.h; f.vy = 0; landed = true; break; }
    }
    f.y = ny;
    if (landed && f.dir === 0) {                                                       // 처음 닿으면 둘로 갈라진다
      for (const dir of [-1, 1]) out.push({ ...f, dir, vy: 0, t: f.t });
      continue;
    }
    if (f.y > H || f.x < WALL - 4 || f.x > W - WALL + 4) continue;
    for (const e of st.enemies) {
      if (e.alive && Math.abs(f.x - (e.x + e.w / 2)) < 10 && Math.abs(f.y + f.h / 2 - (e.y + e.h / 2)) < 10) burn(st, e, f.type);
    }
    out.push(f);
  }
  st.effects = out;
}

function trap(st, b, e) {
  e.alive = false;
  b.enemy = { kind: e.kind, angry: e.angry };
  b.phase = 'float'; b.vx = 0; b.vy = -22; b.life = TRAP_LIFE; b.age = 0;
  st.stats.traps++;
  emit(st, { t: 'trap', x: b.x, y: b.y, kind: e.kind });
}

// ---------- 한 걸음 ----------
// input: { dx: -1~1, jump: 이번에 점프를 눌렀는가, shoot: 쏘는 중 }
function step(st, dt, input) {
  st.events = [];
  let left = dt;
  while (left > 1e-9 && st.phase !== 'over' && st.phase !== 'won') { const h = Math.min(left, 1 / 60); sub(st, h, input || {}); left -= h; if (input) input.jump = false; }
}

function sub(st, h, input) {
  st.time += h;
  const p = st.player;
  if (st.phase === 'dying') { st.phaseT -= h; if (st.phaseT <= 0) { st.phase = 'over'; emit(st, { t: 'over' }); return; } }
  if (st.phase === 'clear') {
    st.phaseT -= h;
    if (st.phaseT <= 0) {
      if (st.level >= LAST_LEVEL) { st.phase = 'won'; emit(st, { t: 'win' }); return; }
      startLevel(st, st.level + 1); return;
    }
  }
  const live = st.phase === 'play';
  if (live) st.t += h;

  // 서두르기 · 훼방꾼 고래
  if (live && !st.hurry && st.t >= HURRY_AT) { st.hurry = true; for (const e of st.enemies) e.angry = true; emit(st, { t: 'hurry' }); }
  if (live && !st.baron && st.t >= BARON_AT) { st.baron = Object.assign(newBody(WALL + 4, WALL + 4, 18, 16), { kind: 'baron', anim: 0 }); emit(st, { t: 'baron' }); }

  // 특수 방울(물·번개·불)이 가끔 떠오른다
  if (live && st.enemies.length) { st.specialT -= h; if (st.specialT <= 0) { if (!st.bubbles.some((b) => b.special)) spawnSpecial(st); st.specialT = 14 + st.rand() * 8; } }

  // 나올 적
  if (live) while (st.queue.length && st.queue[0].at <= st.t) spawnEnemy(st, st.queue.shift());

  // 내 캐릭터
  if (p.alive) {
    p.cool = Math.max(0, p.cool - h);
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - h);
    const dx = Math.max(-1, Math.min(1, input.dx || 0));
    const spd = PLAYER_SPEED * (1 + 0.18 * st.mods.speed);
    if (live) { if (Math.abs(dx) > 0.2) { p.x += dx * spd * h; p.face = dx > 0 ? 1 : -1; p.anim += h; } }
    walls(p);
    if (p.ride) {                                                                       // 방울을 타고 있으면 같이 올라간다
      const b = p.ride;
      if (b.dead || Math.abs(p.x + p.w / 2 - b.x) > b.r + 5) { p.ride = null; }
      else if (b.y - b.r - p.h < WALL) { popBubble(st, b, true); p.ride = null; }                // 천장에 눌리면 터진다
      else { p.y = b.y - b.r - p.h; p.vy = 0; p.ground = true; }
    }
    if (!p.ride) fall(st, p, h);
    if (p.ground) p.coyote = 0.08; else p.coyote = Math.max(0, p.coyote - h);
    if (live && input.jump && (p.ground || p.coyote > 0)) { p.vy = -JUMP_V; p.ground = false; p.coyote = 0; p.ride = null; emit(st, { t: 'jump' }); }
    if (live && input.shoot) shoot(st);
  } else if (live && st.lives > 0) {
    p.respawn -= h;
    if (p.respawn <= 0) {
      Object.assign(p, newBody(24, FLOOR_ROW * TILE - PLAYER_H, PLAYER_W, PLAYER_H), { alive: true, invuln: INVULN, cool: 0, ride: null, face: 1 });
      emit(st, { t: 'respawn' });
    }
  }

  // 방울
  for (const b of st.bubbles) {
    b.age += h;
    if (b.phase === 'shot') {
      b.x += b.vx * h; b.y += b.vy * h;
      b.vx *= Math.exp(-4 * h);                                                            // 점점 느려진다 (약 5칸 날아간다)
      if (b.x < WALL + b.r) { b.x = WALL + b.r; b.vx = 0; }
      if (b.x > W - WALL - b.r) { b.x = W - WALL - b.r; b.vx = 0; }
      if (Math.abs(b.vx) < 22 || b.age > 0.9) { b.phase = 'float'; b.vx = (st.rand() - 0.5) * 12; b.vy = -28; }
    } else {
      const ceiling = WALL + b.r + (st.player.ride === b ? p.h : 0);
      b.x += b.vx * h + Math.sin(b.age * 2 + b.id) * 8 * h; b.y += b.vy * h;
      if (b.y <= ceiling) { b.y = ceiling; b.vy = 0; if (Math.abs(b.vx) < 6) b.vx = (b.id % 2 ? 1 : -1) * 10; }
      if (b.x < WALL + b.r) { b.x = WALL + b.r; b.vx = Math.abs(b.vx); }
      if (b.x > W - WALL - b.r) { b.x = W - WALL - b.r; b.vx = -Math.abs(b.vx); }
    }
    b.life -= h;
    if (b.life <= 0) {
      if (b.enemy) {                                                                       // 갇혀 있던 적이 화가 나서 튀어나온다
        b.dead = true;
        st.enemies.push(makeEnemy(st, b.enemy.kind, b.x, b.y - 7, { angry: true, prot: 0.3 }));
        emit(st, { t: 'break', x: b.x, y: b.y });
      } else { b.dead = true; emit(st, { t: 'pop', x: b.x, y: b.y, trapped: false, expired: true }); }
    }
  }
  // 방울이 적을 가둔다: 막 쏜 방울(날아가는 동안)만 가둔다. 이미 둥둥 떠오르는 빈 방울에는 적이 닿아도 아무 일 없다 (원작처럼)
  for (const b of st.bubbles) {
    if (b.dead || b.enemy || b.letter !== undefined || b.special || b.phase !== 'shot') continue;
    for (const e of st.enemies) {
      if (!e.alive || e.prot > 0) continue;
      const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
      if ((b.x - ex) ** 2 + (b.y - ey) ** 2 < 12 * 12) { trap(st, b, e); break; }
    }
  }
  updateEffects(st, h);
  st.enemies = st.enemies.filter((e) => e.alive);

  // 내 캐릭터와 방울: 위에서 내려앉으면 타고, 옆이나 아래에서 닿으면 터뜨린다
  if (p.alive) {
    for (const b of st.bubbles) {
      if (b.dead || (b.phase === 'shot' && b.age < 0.3)) continue;
      const px = p.x + p.w / 2, py = p.y + p.h / 2;
      const dxp = px - b.x, dyp = py - b.y;
      if (dxp * dxp + dyp * dyp > (b.r + 6) * (b.r + 6)) continue;
      const feet = p.y + p.h;
      if (feet <= b.y - b.r * 0.2 + 3) {                                                  // 방울 위쪽: 내려앉으면 타고, 아니면 그냥 지나간다
        if (!p.ride && p.vy >= 0 && Math.abs(dxp) < b.r + 3) { if (b.y - b.r - p.h < WALL) popBubble(st, b, true); else { p.ride = b; p.y = b.y - b.r - p.h; p.vy = 0; p.ground = true; st.counts.bounced++; checkCandy(st); } }
      } else if (p.ride !== b) popBubble(st, b, true);
    }
  }
  st.bubbles = st.bubbles.filter((b) => !b.dead);

  // 적
  for (const e of st.enemies) {
    const k = KINDS[e.kind];
    e.anim += h;
    if (e.prot > 0) e.prot = Math.max(0, e.prot - h);
    const mul = (e.angry ? 1.7 : 1) * Math.min(1.5, 1 + 0.0035 * (st.level - 1) * 4);
    if (k.ai === 'walk') {
      e.think -= h; e.pause = Math.max(0, e.pause - h);
      if (e.pause <= 0) {
        const ahead = e.x + e.w / 2 + e.dir * (e.w / 2 + 3);
        e.x += e.dir * k.speed * mul * h;
        const wall = walls(e);
        if (wall) e.dir = -wall;
        if (e.ground) {                                                                      // 발판 끝: 돌아서거나 뛰어내린다
          const c = Math.floor(ahead / TILE), r = Math.floor((e.y + e.h + 2) / TILE);
          if (tileAt(st, c, r) !== 2 && tileAt(st, c, r) !== 1 && e.think > 0.3 && st.rand() < 0.5) { e.dir = -e.dir; }
        }
        if (e.think <= 0) {
          e.think = 1.2 + st.rand() * 2.6;
          const above = p.alive && p.y + p.h < e.y + e.h - 14;
          if (e.ground && k.jump > 0 && ((above && st.rand() < Math.min(1, k.jump)) || st.rand() < 0.18 * k.jump)) { e.vy = -JUMP_V * 0.97; e.ground = false; if (p.alive) e.dir = p.x > e.x ? 1 : -1; }
          else if (st.rand() < 0.3) e.dir = -e.dir;
        }
      }
      fall(st, e, h);
      if (k.throws && e.prot <= 0) attack(st, e, k, h);
    } else if (k.ai === 'hop') {                                                             // 바네보: 짧게 뛰어서만 움직인다
      if (!e.ground) { e.x += e.dir * k.speed * mul * h; const wall = walls(e); if (wall) e.dir = -wall; }
      fall(st, e, h);
      if (e.ground) {
        e.hopT -= h;
        if (e.hopT <= 0) { e.vy = -JUMP_V * 0.62; e.ground = false; e.hopT = (0.25 + st.rand() * 0.4) / (e.angry ? 1.7 : 1); if (p.alive && st.rand() < 0.5) e.dir = p.x > e.x ? 1 : -1; }
      }
    } else {                                                                                 // 몬스타·풀풀: 대각선으로 날며 벽에 튕긴다
      e.x += e.vx * mul * h; e.y += e.vy * mul * h;
      const w = walls(e);
      if (w) e.vx = -w * Math.abs(e.vx);
      if (e.y < WALL) { e.y = WALL; e.vy = Math.abs(e.vy); }
      if (e.y + e.h > FLOOR_ROW * TILE) { e.y = FLOOR_ROW * TILE - e.h; e.vy = -Math.abs(e.vy); }
      e.dir = e.vx >= 0 ? 1 : -1;
    }
  }
  updateShots(st, h);
  if (st.baron) {
    const bn = st.baron;
    if (p.alive) {
      const tx = p.x - bn.x, ty = p.y - bn.y, d = Math.hypot(tx, ty) || 1;
      const sp = (st.t > BARON_AT + 14 ? 62 : 44);
      bn.x += tx / d * sp * h; bn.y += ty / d * sp * h;
    }
    bn.anim += h;
  }

  // 내 캐릭터와 적
  if (p.alive && p.invuln <= 0) {
    for (const e of st.enemies) {
      if (e.prot > 0) continue;
      if (Math.abs(p.x + p.w / 2 - (e.x + e.w / 2)) < 11 && Math.abs(p.y + p.h / 2 - (e.y + e.h / 2)) < 11) { playerHit(st, 'enemy'); break; }
    }
    if (p.alive && st.baron && Math.abs(p.x + p.w / 2 - (st.baron.x + 9)) < 12 && Math.abs(p.y + p.h / 2 - (st.baron.y + 8)) < 11) playerHit(st, 'baron');
  }

  // 과일과 사탕
  for (const it of st.items) {
    it.age += h;
    it.x += it.vx * h;
    fall(st, it, h);
    if (it.ground && it.vy === 0 && it.bounce === undefined) it.bounce = 0;
  }
  if (p.alive) for (const it of st.items) {
    if (Math.abs(p.x + p.w / 2 - (it.x + it.w / 2)) < 10 && Math.abs(p.y + p.h / 2 - (it.y + it.h / 2)) < 10) {
      it.taken = true;
      if (it.kind === 'fruit') { addScore(st, it.pts); emit(st, { t: 'fruit', pts: it.pts, x: it.x, y: it.y, type: it.type }); }
      else if (it.kind === 'diamond') { addScore(st, it.pts); emit(st, { t: 'diamond', pts: it.pts, x: it.x, y: it.y, type: it.type }); }
      else { addScore(st, 500); st.mods[it.type] = Math.min(2, st.mods[it.type] + 1); emit(st, { t: 'candy', type: it.type, x: it.x, y: it.y }); }
    }
  }
  st.items = st.items.filter((it) => !it.taken && it.age < 14);

  // 판 깨기
  if (live && st.queue.length === 0 && st.enemies.length === 0 && !st.bubbles.some((b) => b.enemy)) {
    st.phase = 'clear'; st.phaseT = 3;
    st.items = st.items.filter((i) => i.kind !== 'candy');                               // 사탕은 마지막 적을 터뜨리면 사라진다
    emit(st, { t: 'clear', level: st.level });
  }
}

return {
  W, H, TILE, COLS, ROWS, WALL, FLOOR_ROW, TIER_ROWS, FLOOR_GAP, GRAVITY, JUMP_V, PLAYER_SPEED, START_LIVES, SHOT_COOL, KILL_POINTS, BUBBLE_POINTS, BUBBLE_R,
  TRAP_LIFE, EMPTY_LIFE, HURRY_AT, BARON_AT, KINDS, FIRST_LEVEL, LAST_LEVEL, LEVEL_ENEMIES: ENEMY_TABLE, FRUIT_POINTS, MAPS, STYLES, FRUITS, makeEnemy, connected, EXTEND_LETTERS, CANDY_AT, SPECIAL, EXTRA_LIFE_SCORES,
  rng, buildTiles, enemyList, newGame, startLevel, step, tileAt, spawnEnemy, shoot, popBubble, trap, playerHit, spawnLetter, spawnSpecial, checkCandy, dropCandy, triggerSpecial, burn,
};
})();
if (typeof module !== 'undefined') module.exports = LOGIC_BUBBLE;
