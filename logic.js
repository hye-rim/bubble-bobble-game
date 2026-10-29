'use strict';
// 보글보글 스타일 규칙. 화면 없이 Node 에서 시험한다 (DOM 을 쓰지 않는다).
// 화면은 한 판 크기 256x200 (타일 8픽셀, 32x25). 위가 y=0, 길이는 모두 픽셀, 시간은 초.
const LOGIC_BUBBLE = (() => {
const TILE = 8, COLS = 32, ROWS = 25, W = COLS * TILE, H = ROWS * TILE;
const WALL = 16;                                            // 양쪽 벽 두께, 천장 두께
const FLOOR_ROW = 22;                                       // 바닥 윗면 줄
const TIER_ROWS = [17, 12, 7, 4];                           // 발판 윗면 줄 (아래에서 위로)
const FLOOR_GAP = [14, 17];                                 // 바닥에 뚫린 구멍 (떨어지면 위로 돌아온다)
const GRAVITY = 620, JUMP_V = 238, MAX_FALL = 270;
const PLAYER_SPEED = 72, PLAYER_W = 14, PLAYER_H = 14;
const START_LIVES = 3, INVULN = 2.6, RESPAWN = 1.4;
const SHOT_COOL = 0.3, MAX_BUBBLES = 6;
const BUBBLE_R = 8, TRAP_LIFE = 7, EMPTY_LIFE = 8;
const HURRY_AT = 42, BARON_AT = 56;
const EXTRA_LIFE_AT = 30000, EXTRA_LIFE_EVERY = 100000;
const CHAIN_WINDOW = 0.9;
const KINDS = {
  zen: { w: 14, h: 14, speed: 36, fly: false, pts: 100 },
  pulpul: { w: 14, h: 14, speed: 44, fly: true, pts: 100 },
  monsta: { w: 14, h: 14, speed: 34, fly: true, pts: 100 },
};
const FRUITS = ['cherry', 'orange', 'banana', 'apple', 'grape', 'melon', 'star'];

// 발판 모양: 줄(윗면 줄 번호) → [시작 칸, 끝 칸] 목록
const MAPS = [
  { 17: [[2, 11], [20, 29]], 12: [[7, 24]], 7: [[2, 11], [20, 29]] },
  { 17: [[2, 12], [19, 29]], 12: [[2, 7], [12, 19], [24, 29]], 7: [[2, 12], [19, 29]], 4: [[10, 21]] },
  { 17: [[6, 25]], 12: [[2, 9], [22, 29]], 7: [[6, 25]], 4: [[2, 9], [22, 29]] },
  { 17: [[2, 13]], 12: [[10, 21]], 7: [[18, 29]], 4: [[2, 13]] },
  { 17: [[2, 29]], 12: [[2, 11], [20, 29]], 7: [[2, 29]], 4: [[8, 23]] },
  { 17: [[2, 6], [11, 20], [25, 29]], 12: [[6, 11], [20, 25]], 7: [[2, 6], [11, 20], [25, 29]], 4: [[6, 25]] },
  { 17: [[4, 27]], 12: [[2, 13], [18, 29]], 7: [[4, 27]] },
  { 17: [[2, 10], [13, 18], [21, 29]], 12: [[5, 13], [18, 26]], 7: [[2, 10], [13, 18], [21, 29]], 4: [[9, 22]] },
  { 17: [[2, 29]], 12: [[10, 21]], 7: [[2, 29]], 4: [[2, 9], [22, 29]] },
  { 17: [[2, 8], [23, 29]], 12: [[4, 12], [19, 27]], 7: [[2, 8], [11, 20], [23, 29]], 4: [[7, 24]] },
  { 17: [[8, 23]], 12: [[2, 9], [22, 29]], 7: [[8, 23]], 4: [[2, 9], [22, 29]] },
  { 17: [[2, 29]], 12: [[2, 13], [18, 29]], 7: [[2, 29]] },
];

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

// ---------- 판 ----------
// 타일: 0 비어 있음 · 1 단단한 벽 · 2 발판 윗면(아래에서는 지나감) · 3 발판 몸통(그림만)
function buildTiles(level) {
  const t = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  for (let r = 0; r < ROWS; r++) for (const c of [0, 1, COLS - 2, COLS - 1]) t[r][c] = 1;
  for (let c = 0; c < COLS; c++) { t[0][c] = 1; t[1][c] = 1; }
  const platform = (row, a, b) => { for (let c = a; c <= b; c++) { t[row][c] = 2; if (row + 1 < ROWS) t[row + 1][c] = 3; } };
  platform(FLOOR_ROW, 2, FLOOR_GAP[0] - 1); platform(FLOOR_ROW, FLOOR_GAP[1] + 1, COLS - 3);
  for (let r = FLOOR_ROW + 2; r < ROWS; r++) for (let c = 2; c < COLS - 2; c++) if (c < FLOOR_GAP[0] || c > FLOOR_GAP[1]) t[r][c] = 3;
  const m = MAPS[(level - 1) % MAPS.length];
  for (const row of Object.keys(m)) for (const [a, b] of m[row]) platform(Number(row), a, b);
  return t;
}

// 한 판의 적 목록: 판이 오를수록 많이, 새로운 종류가 나온다
function enemyList(level, r) {
  const n = Math.min(9, 4 + Math.floor((level - 1) / 2));
  const pool = ['zen'];
  if (level >= 4) pool.push('pulpul');
  if (level >= 7) pool.push('monsta');
  const xs = [40, 216, 100, 160, 72, 188, 128, 28, 232];
  const list = [];
  for (let i = 0; i < n; i++) {
    const kind = i < 2 ? 'zen' : pool[Math.floor(r() * pool.length)];
    list.push({ at: 0.5 + i * 0.6, kind, x: xs[i % xs.length] });
  }
  return list;
}

function newBody(x, y, w, h) { return { x, y, w, h, vx: 0, vy: 0, ground: false }; }

function newGame(rand = Math.random) {
  const st = {
    rand, score: 0, lives: START_LIVES, extra: 0, level: 1, time: 0, events: [], seq: 0,
    stats: { pops: 0, traps: 0, shots: 0 },
    mods: { speed: 0, shot: 0, range: 0 },                     // 사탕으로 얻은 힘
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
  st.queue = enemyList(level, st.rand);
  st.enemies = []; st.bubbles = []; st.items = []; st.baron = null;
  st.hurry = false; st.chain = { n: 0, t: 0 };
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
  const need = () => (st.extra === 0 ? EXTRA_LIFE_AT : EXTRA_LIFE_AT + st.extra * EXTRA_LIFE_EVERY);
  while (st.score >= need()) { st.extra++; st.lives++; emit(st, { t: 'extraLife' }); }
}

function spawnEnemy(st, s) {
  const k = KINDS[s.kind];
  const e = Object.assign(newBody(s.x - k.w / 2, WALL + 2, k.w, k.h), {
    id: ++st.seq, kind: s.kind, dir: st.rand() < 0.5 ? -1 : 1, angry: st.hurry, prot: 0.9, think: 1 + st.rand() * 2, alive: true, ang: st.rand() * 6.28, anim: 0,
  });
  if (k.fly) { e.vx = e.dir * k.speed; e.vy = (st.rand() < 0.5 ? -1 : 1) * k.speed * 0.7; }
  st.enemies.push(e);
  emit(st, { t: 'spawn', kind: s.kind });
}

function shoot(st) {
  const p = st.player;
  if (p.cool > 0 || st.bubbles.length >= MAX_BUBBLES + st.mods.range) return;
  const sp = 150 + 45 * st.mods.shot + 12 * st.mods.range;
  st.bubbles.push({
    id: ++st.seq, x: p.x + p.w / 2 + p.face * 14, y: p.y + p.h / 2 - 1, vx: p.face * sp, vy: -4, r: BUBBLE_R, age: 0, phase: 'shot', enemy: null, life: EMPTY_LIFE, dead: false,
  });
  p.cool = SHOT_COOL / (1 + 0.35 * st.mods.shot);
  st.stats.shots++;
  emit(st, { t: 'shoot' });
}

function playerHit(st, why) {
  const p = st.player;
  if (!p.alive || p.invuln > 0) return;
  p.alive = false; p.ride = null;
  st.lives--;
  st.mods = { speed: 0, shot: 0, range: 0 };
  emit(st, { t: 'crash', x: p.x, y: p.y, why });
  p.respawn = RESPAWN;
  if (st.lives <= 0) { st.phase = 'dying'; st.phaseT = 2.2; }
}

function popBubble(st, b, byPlayer) {
  b.dead = true;
  if (!b.enemy) { emit(st, { t: 'pop', x: b.x, y: b.y, trapped: false }); return; }
  // 갇힌 적이 터진다: 연쇄로 터뜨릴수록 점수가 두 배씩
  if (st.time - st.chain.t > CHAIN_WINDOW) st.chain.n = 0;
  st.chain.t = st.time;
  const pts = 100 * 2 ** Math.min(st.chain.n, 7);
  st.chain.n++;
  addScore(st, pts);
  st.stats.pops++;
  emit(st, { t: 'kill', x: b.x, y: b.y, pts, kind: b.enemy.kind, chain: st.chain.n });
  const fruit = FRUITS[Math.min(FRUITS.length - 1, Math.floor((st.level - 1) / 2))];
  const r = st.rand();
  if (r < 0.2) st.items.push(Object.assign(newBody(b.x - 5, b.y - 5, 10, 10), { kind: 'candy', type: ['speed', 'shot', 'range'][Math.floor(st.rand() * 3)], age: 0, vy: -80 }));
  else st.items.push(Object.assign(newBody(b.x - 5, b.y - 5, 10, 10), { kind: 'fruit', type: fruit, pts: 500 + 100 * (st.level - 1), age: 0, vy: -90 }));
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
  while (left > 1e-9 && st.phase !== 'over') { const h = Math.min(left, 1 / 60); sub(st, h, input || {}); left -= h; if (input) input.jump = false; }
}

function sub(st, h, input) {
  st.time += h;
  const p = st.player;
  if (st.phase === 'dying') { st.phaseT -= h; if (st.phaseT <= 0) { st.phase = 'over'; emit(st, { t: 'over' }); return; } }
  if (st.phase === 'clear') {
    st.phaseT -= h;
    if (st.phaseT <= 0) { startLevel(st, st.level + 1); return; }
  }
  const live = st.phase === 'play';
  if (live) st.t += h;

  // 서두르기 · 훼방꾼 고래
  if (live && !st.hurry && st.t >= HURRY_AT) { st.hurry = true; for (const e of st.enemies) e.angry = true; emit(st, { t: 'hurry' }); }
  if (live && !st.baron && st.t >= BARON_AT) { st.baron = Object.assign(newBody(WALL + 4, WALL + 4, 18, 16), { kind: 'baron', anim: 0 }); emit(st, { t: 'baron' }); }

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
        const k = KINDS[b.enemy.kind];
        b.dead = true;
        const e = Object.assign(newBody(b.x - k.w / 2, b.y - k.h / 2, k.w, k.h), { id: ++st.seq, kind: b.enemy.kind, dir: st.rand() < 0.5 ? -1 : 1, angry: true, prot: 0.3, think: 1, alive: true, ang: 0, anim: 0 });
        if (k.fly) { e.vx = e.dir * k.speed; e.vy = -k.speed * 0.5; }
        st.enemies.push(e);
        emit(st, { t: 'break', x: b.x, y: b.y });
      } else { b.dead = true; emit(st, { t: 'pop', x: b.x, y: b.y, trapped: false, expired: true }); }
    }
  }
  // 방울이 적을 가둔다
  for (const b of st.bubbles) {
    if (b.dead || b.enemy) continue;
    for (const e of st.enemies) {
      if (!e.alive || e.prot > 0) continue;
      const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
      if ((b.x - ex) ** 2 + (b.y - ey) ** 2 < 12 * 12) { trap(st, b, e); break; }
    }
  }
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
        if (!p.ride && p.vy >= 0 && Math.abs(dxp) < b.r + 3) { if (b.y - b.r - p.h < WALL) popBubble(st, b, true); else { p.ride = b; p.y = b.y - b.r - p.h; p.vy = 0; p.ground = true; } }
      } else if (p.ride !== b) popBubble(st, b, true);
    }
  }
  st.bubbles = st.bubbles.filter((b) => !b.dead);

  // 적
  for (const e of st.enemies) {
    const k = KINDS[e.kind];
    e.anim += h;
    if (e.prot > 0) e.prot = Math.max(0, e.prot - h);
    const mul = (e.angry ? 1.7 : 1) * Math.min(1.5, 1 + 0.04 * (st.level - 1));
    if (!k.fly) {
      e.think -= h;
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
        if (e.ground && p.alive && (p.y + p.h < e.y + e.h - 14 || st.rand() < 0.18)) { e.vy = -JUMP_V * 0.97; e.ground = false; if (p.alive) e.dir = p.x > e.x ? 1 : -1; }
        else if (st.rand() < 0.3) e.dir = -e.dir;
      }
      fall(st, e, h);
    } else {
      e.ang += h;
      if (e.kind === 'monsta') {
        const tx = p.x - e.x, ty = p.y - e.y, d = Math.hypot(tx, ty) || 1;
        e.vx += (tx / d * k.speed * mul - e.vx) * Math.min(1, h * 1.4);
        e.vy += (ty / d * k.speed * mul + Math.sin(e.ang * 3) * 18 - e.vy) * Math.min(1, h * 1.4);
      } else {
        e.think -= h;
        if (e.think <= 0) { e.think = 1.4 + st.rand() * 2; const a = st.rand() * 6.283; e.vx = Math.cos(a) * k.speed * mul; e.vy = Math.sin(a) * k.speed * mul; }
      }
      e.x += e.vx * h; e.y += e.vy * h;
      const w = walls(e);
      if (w) e.vx = -w * Math.abs(e.vx || k.speed);
      if (e.y < WALL) { e.y = WALL; e.vy = Math.abs(e.vy); }
      if (e.y + e.h > FLOOR_ROW * TILE) { e.y = FLOOR_ROW * TILE - e.h; e.vy = -Math.abs(e.vy); }
      e.dir = e.vx >= 0 ? 1 : -1;
    }
  }
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
      else { addScore(st, 500); st.mods[it.type] = Math.min(2, st.mods[it.type] + 1); emit(st, { t: 'candy', type: it.type, x: it.x, y: it.y }); }
    }
  }
  st.items = st.items.filter((it) => !it.taken && it.age < 14);

  // 판 깨기
  if (live && st.queue.length === 0 && st.enemies.length === 0 && !st.bubbles.some((b) => b.enemy)) {
    st.phase = 'clear'; st.phaseT = 3;
    emit(st, { t: 'clear', level: st.level });
  }
}

return {
  W, H, TILE, COLS, ROWS, WALL, FLOOR_ROW, TIER_ROWS, FLOOR_GAP, GRAVITY, JUMP_V, PLAYER_SPEED, START_LIVES, SHOT_COOL, MAX_BUBBLES, BUBBLE_R,
  TRAP_LIFE, EMPTY_LIFE, HURRY_AT, BARON_AT, KINDS, MAPS, FRUITS,
  rng, buildTiles, enemyList, newGame, startLevel, step, tileAt, spawnEnemy, shoot, popBubble, trap, playerHit,
};
})();
if (typeof module !== 'undefined') module.exports = LOGIC_BUBBLE;
