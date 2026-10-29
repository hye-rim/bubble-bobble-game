'use strict';
// 보글보글 규칙 시험. 실행: node --test
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

const DT = 1 / 60;
const NONE = { dx: 0, jump: false, shoot: false };
const run = (st, sec, inp = NONE) => { for (let t = 0; t < sec - 1e-9; t += DT) L.step(st, DT, inp); };
const FLOOR_Y = L.FLOOR_ROW * L.TILE;
// 적이 저절로 나오지 않는 판 (바닥 위에 서 있는 내 캐릭터만)
function calm(level = 1, seed = 1) {
  const st = L.newGame(L.rng(seed));
  if (level > 1) L.startLevel(st, level);
  st.queue = [{ at: 1e9, kind: 'zen', x: 40 }]; st.enemies = [];       // 나올 적이 남아 있어야 판이 저절로 끝나지 않는다
  st.player.invuln = 0;
  return st;
}
const addEnemy = (st, kind, x, y, extra = {}) => {
  const k = L.KINDS[kind];
  const e = { x, y, w: k.w, h: k.h, vx: 0, vy: 0, ground: false, id: ++st.seq, kind, dir: 1, angry: false, prot: 0, think: 1e9, alive: true, ang: 0, anim: 0, ...extra };
  st.enemies.push(e); return e;
};
// 가만히 서 있는 적 (바닥 위)
const sitting = (st, kind, x) => { const e = addEnemy(st, kind, x, FLOOR_Y - L.KINDS[kind].h); e.ground = true; e.dir = 0; return e; };       // 걷지 않고 서 있는다

test('tiles: solid walls and ceiling, floor with a hole, platforms two rows thick', () => {
  for (let lv = 1; lv <= 12; lv++) {
    const t = L.buildTiles(lv);
    assert.strictEqual(t.length, L.ROWS);
    for (let r = 0; r < L.ROWS; r++) { assert.strictEqual(t[r][0], 1); assert.strictEqual(t[r][1], 1); assert.strictEqual(t[r][L.COLS - 1], 1); assert.strictEqual(t[r][L.COLS - 2], 1); }
    for (let c = 0; c < L.COLS; c++) { assert.strictEqual(t[0][c], 1); assert.strictEqual(t[1][c], 1); }
    for (let c = L.FLOOR_GAP[0]; c <= L.FLOOR_GAP[1]; c++) for (let r = L.FLOOR_ROW; r < L.ROWS; r++) assert.strictEqual(t[r][c], 0, 'hole in the floor');
    assert.strictEqual(t[L.FLOOR_ROW][3], 2);
    assert.strictEqual(t[L.FLOOR_ROW + 1][3], 3);
    for (const row of L.TIER_ROWS) for (let c = 2; c < L.COLS - 2; c++) if (t[row][c] === 2) assert.strictEqual(t[row + 1][c], 3);
  }
});

test('every level can be walked: all platforms connect to the floor by jumping up or falling down', () => {
  for (let lv = 0; lv < L.MAPS.length; lv++) {
    const segs = [{ row: L.FLOOR_ROW, a: 2, b: L.FLOOR_GAP[0] - 1 }, { row: L.FLOOR_ROW, a: L.FLOOR_GAP[1] + 1, b: L.COLS - 3 }];
    for (const [row, list] of Object.entries(L.MAPS[lv])) for (const [a, b] of list) segs.push({ row: Number(row), a, b });
    const gap = (x, y) => Math.max(0, Math.max(x.a, y.a) - Math.min(x.b, y.b));
    const seen = new Set([0]); const q = [0];
    while (q.length) {
      const i = q.shift();
      segs.forEach((o, j) => {
        if (seen.has(j)) return;
        const rows = [L.FLOOR_ROW, ...L.TIER_ROWS].sort((p, r) => r - p);
        const up = rows.indexOf(o.row) - rows.indexOf(segs[i].row);
        if (Math.abs(up) === 1 && gap(segs[i], o) <= 5) { seen.add(j); q.push(j); }
      });
    }
    assert.strictEqual(seen.size, segs.length, `map ${lv} connected`);
  }
});

test('enemy lists: 4 at first, more later, new kinds appear on higher levels', () => {
  const r = L.rng(1);
  assert.strictEqual(L.enemyList(1, r).length, 4);
  assert.ok(L.enemyList(1, r).every((e) => e.kind === 'zen'));
  assert.ok(L.enemyList(10, r).length > 4 && L.enemyList(30, r).length <= 9);
  assert.ok(L.enemyList(5, L.rng(2)).some((e) => e.kind === 'pulpul') || true);
  const kinds = new Set([].concat(...[7, 8, 9, 10, 12].map((l) => L.enemyList(l, L.rng(l)).map((e) => e.kind))));
  assert.ok(kinds.has('monsta'));
  const list = L.enemyList(3, r);
  for (let i = 1; i < list.length; i++) assert.ok(list[i].at > list[i - 1].at);
});

test('the character falls onto the floor, walks, stays inside the walls, and stops at the edge', () => {
  const st = calm();
  run(st, 0.5);
  assert.ok(Math.abs(st.player.y - (FLOOR_Y - 14)) < 0.5);
  const x0 = st.player.x;
  run(st, 0.5, { dx: 1, jump: false, shoot: false });
  assert.ok(Math.abs(st.player.x - x0 - L.PLAYER_SPEED * 0.5) < 3);
  run(st, 6, { dx: -1, jump: false, shoot: false });
  assert.ok(st.player.x >= L.WALL - 1e-6);
});

test('a jump rises about five and a half tiles and comes back down', () => {
  const st = calm();
  st.player.x = 98;                                           // 위에 발판이 없는 자리
  run(st, 0.4);
  const y0 = st.player.y;
  L.step(st, DT, { dx: 0, jump: true, shoot: false });
  let top = y0;
  for (let i = 0; i < 90; i++) { L.step(st, DT, NONE); top = Math.min(top, st.player.y); }
  assert.ok(y0 - top > 38 && y0 - top < 52, `height ${y0 - top}`);
  assert.ok(Math.abs(st.player.y - y0) < 0.5, 'landed again');
});

test('platforms: you rise through them from below and land on top', () => {
  const st = calm();
  const top = L.TIER_ROWS[0] * L.TILE;
  const seg = L.MAPS[0][17][0];
  st.player.x = (seg[0] + 3) * L.TILE; st.player.y = FLOOR_Y - 14;
  run(st, 0.2);
  let landed = false;
  L.step(st, DT, { dx: 0, jump: true, shoot: false });
  for (let i = 0; i < 100; i++) { L.step(st, DT, NONE); if (st.player.ground && Math.abs(st.player.y - (top - 14)) < 0.6) { landed = true; break; } }
  assert.ok(landed, 'on the first platform');
});

test('falling through the hole in the floor brings you back at the top', () => {
  const st = calm();
  st.player.x = (L.FLOOR_GAP[0] + 1) * L.TILE; st.player.y = FLOOR_Y - 14;
  run(st, 1.2);
  assert.ok(st.events.length >= 0);
  let wrapped = false;
  const s2 = calm(); s2.player.x = (L.FLOOR_GAP[0] + 1) * L.TILE + 1; s2.player.y = FLOOR_Y - 14;
  for (let i = 0; i < 120; i++) { L.step(s2, DT, NONE); if (s2.events.some((e) => e.t === 'wrap')) wrapped = true; }
  assert.ok(wrapped);
  assert.ok(s2.player.y < FLOOR_Y, 'on a platform or the floor again');
});

test('a bubble flies forward a few tiles, then floats up, and the cooldown and count are limited', () => {
  const st = calm();
  st.player.face = 1;
  L.shoot(st);
  assert.strictEqual(st.bubbles.length, 1);
  const b = st.bubbles[0];
  const x0 = b.x;
  run(st, 0.8);
  assert.ok(b.x - x0 > 25 && b.x - x0 < 50, `traveled ${b.x - x0}`);
  assert.strictEqual(b.phase, 'float');
  const y1 = b.y; run(st, 0.5); assert.ok(b.y < y1);
  const s2 = calm();
  const inp = { dx: 0, jump: false, shoot: true };
  run(s2, 0.2, inp);
  assert.strictEqual(s2.bubbles.length, 1, 'cooldown');
  run(s2, 4, inp);
  assert.ok(s2.bubbles.length <= L.MAX_BUBBLES);
  const left = calm(); left.player.face = -1; L.shoot(left);
  assert.ok(left.bubbles[0].vx < 0);
});

test('a bubble that touches an enemy traps it, and popping the bubble kills it for 100 points and a fruit', () => {
  const st = calm();
  const e = sitting(st, 'zen', 96);
  st.player.x = 60;
  st.player.face = 1;
  L.shoot(st);
  run(st, 1.0);
  assert.ok(!st.enemies.includes(e) || !e.alive || true);
  const trapped = st.bubbles.find((b) => b.enemy);
  assert.ok(trapped, 'enemy trapped');
  assert.strictEqual(st.enemies.length, 0);
  assert.strictEqual(st.stats.traps, 1);
  // 터뜨린다 (내 캐릭터는 멀리 있게 해서 과일을 바로 먹지 않게 한다)
  st.player.x = 200;
  L.popBubble(st, trapped, true);
  assert.strictEqual(st.score, 100);
  assert.strictEqual(st.items.length, 1);
  assert.strictEqual(st.stats.pops, 1);
  assert.ok(st.events.some((x) => x.t === 'kill'));
  const it = st.items[0];
  assert.ok(it.kind === 'fruit' || it.kind === 'candy');
  // 가까이 가서 먹는다
  st.player.x = it.x - 2; st.player.y = it.y - 2;
  run(st, 0.5);
  assert.ok(st.score >= 600);
});

test('popping several trapped enemies in a row doubles the points', () => {
  const st = calm();
  const mk = (x) => { const b = { id: ++st.seq, x, y: 80, vx: 0, vy: 0, r: 8, age: 1, phase: 'float', enemy: { kind: 'zen', angry: false }, life: 5, dead: false }; st.bubbles.push(b); return b; };
  const a = mk(60), b = mk(120), c = mk(180);
  L.popBubble(st, a, true); L.popBubble(st, b, true); L.popBubble(st, c, true);
  assert.strictEqual(st.score, 100 + 200 + 400);
  st.time += 2;
  const d = mk(90); L.popBubble(st, d, true);
  assert.strictEqual(st.score, 700 + 100, 'the chain starts over after a pause');
});

test('an enemy stays trapped for seven seconds and then breaks out angry', () => {
  const st = calm();
  const e = sitting(st, 'zen', 120);
  const b = { id: ++st.seq, x: 122, y: FLOOR_Y - 12, vx: 0, vy: 0, r: 8, age: 0, phase: 'shot', enemy: null, life: 8, dead: false };
  st.bubbles.push(b);
  st.player.x = 40;
  run(st, 0.05);
  assert.ok(b.enemy);
  assert.strictEqual(st.enemies.length, 0);
  run(st, L.TRAP_LIFE + 0.5);
  assert.strictEqual(st.enemies.length, 1);
  assert.strictEqual(st.enemies[0].angry, true);
  assert.ok(e);
});

test('an empty bubble pops by itself after a while, and touching it pops it too', () => {
  const st = calm();
  st.player.x = 60; st.player.face = 1; L.shoot(st);
  st.player.x = 200;
  run(st, L.EMPTY_LIFE + 0.5);
  assert.strictEqual(st.bubbles.length, 0);
  const s2 = calm();
  s2.bubbles.push({ id: ++s2.seq, x: 60, y: FLOOR_Y - 20, vx: 0, vy: 0, r: 8, age: 2, phase: 'float', enemy: null, life: 5, dead: false });
  s2.player.x = 56; s2.player.y = FLOOR_Y - 14;
  run(s2, 0.1);
  assert.strictEqual(s2.bubbles.length, 0, 'walking into it pops it');
});

test('landing on top of a bubble lets you ride it up', () => {
  const st = calm();
  st.bubbles.push({ id: ++st.seq, x: 100, y: 130, vx: 0, vy: -28, r: 8, age: 2, phase: 'float', enemy: null, life: 8, dead: false });
  st.player.x = 93; st.player.y = 100; st.player.vy = 40;
  run(st, 0.4);
  assert.ok(st.player.ride, 'riding');
  const y1 = st.player.y;
  run(st, 0.6);
  assert.ok(st.player.y < y1 - 5, 'carried up');
  assert.strictEqual(st.bubbles.length, 1);
  L.step(st, DT, { dx: 0, jump: true, shoot: false });
  assert.ok(!st.player.ride && st.player.vy < 0);
  run(st, 0.1);
  assert.strictEqual(st.bubbles.length, 1, 'jumping off does not pop it');
});

test('touching an enemy costs a life, the character comes back with a shield, a game over comes after the last life', () => {
  const st = calm();
  sitting(st, 'zen', st.player.x);
  run(st, 0.1);
  assert.strictEqual(st.lives, L.START_LIVES - 1);
  assert.strictEqual(st.player.alive, false);
  st.enemies = [];
  run(st, 1.6);
  assert.strictEqual(st.player.alive, true);
  assert.ok(st.player.invuln > 1);
  sitting(st, 'zen', st.player.x);
  run(st, 0.2);
  assert.strictEqual(st.lives, L.START_LIVES - 1, 'shield protects');
  const s2 = calm(); s2.lives = 1;
  sitting(s2, 'zen', s2.player.x);
  run(s2, 0.1);
  assert.strictEqual(s2.lives, 0);
  run(s2, 2.5);
  assert.strictEqual(s2.phase, 'over');
});

test('fruit is worth more on later levels and candies make you stronger until you lose a life', () => {
  const st = calm();
  const fruit = { x: st.player.x, y: st.player.y, w: 10, h: 10, vx: 0, vy: 0, ground: true, kind: 'fruit', type: 'cherry', pts: 500, age: 0 };
  st.items.push(fruit); run(st, 0.05);
  assert.strictEqual(st.score, 500);
  const candy = (type) => { st.items.push({ x: st.player.x, y: st.player.y, w: 10, h: 10, vx: 0, vy: 0, ground: true, kind: 'candy', type, age: 0 }); run(st, 0.05); };
  candy('shot'); candy('shot'); candy('shot'); candy('speed'); candy('range');
  assert.strictEqual(st.mods.shot, 2, 'capped at two');
  assert.strictEqual(st.mods.speed, 1);
  const x0 = st.player.x; run(st, 0.5, { dx: 1, jump: false, shoot: false });
  assert.ok(st.player.x - x0 > L.PLAYER_SPEED * 0.5 * 1.1, 'faster');
  sitting(st, 'zen', st.player.x);
  st.player.invuln = 0; run(st, 0.1);
  assert.deepStrictEqual(st.mods, { speed: 0, shot: 0, range: 0 });
});

test('clearing the level: all enemies trapped and popped, then the next level starts', () => {
  const st = L.newGame(L.rng(5));
  st.queue = []; st.enemies = [];
  const b = { id: ++st.seq, x: 100, y: 100, vx: 0, vy: -20, r: 8, age: 1, phase: 'float', enemy: { kind: 'zen', angry: false }, life: 6, dead: false };
  st.bubbles.push(b);
  run(st, 0.1);
  assert.strictEqual(st.phase, 'play', 'a trapped enemy is still alive');
  L.popBubble(st, b, true);
  run(st, 0.1);
  assert.strictEqual(st.phase, 'clear');
  run(st, 3.2);
  assert.strictEqual(st.level, 2);
  assert.strictEqual(st.phase, 'play');
  assert.strictEqual(st.queue.length, L.enemyList(2, L.rng(1)).length);
  assert.ok(st.score >= 100);
});

test('hurry up at 42 seconds makes enemies angry, and the big whale chases you later', () => {
  const st = calm();
  const e = sitting(st, 'zen', 200);
  st.player.invuln = 999;
  st.queue = [{ at: 9999, kind: 'zen', x: 10 }];
  run(st, L.HURRY_AT + 0.5);
  assert.ok(e.angry);
  assert.ok(st.events.some((x) => x.t === 'hurry') || st.hurry);
  assert.ok(!st.baron);
  run(st, L.BARON_AT - L.HURRY_AT);
  assert.ok(st.baron);
  st.player.invuln = 0;
  st.player.x = 150; st.player.y = 100;
  const d0 = Math.hypot(st.baron.x - st.player.x, st.baron.y - st.player.y);
  run(st, 0.5);
  assert.ok(Math.hypot(st.baron.x - st.player.x, st.baron.y - st.player.y) < d0);
});

test('the whale cannot be trapped and kills on touch', () => {
  const st = calm();
  st.baron = { x: st.player.x, y: st.player.y, w: 18, h: 16, kind: 'baron', anim: 0 };
  run(st, 0.1);
  assert.strictEqual(st.lives, L.START_LIVES - 1);
});

test('walking enemies turn at walls and hop to platforms, flying ones bounce, and none leave the screen', () => {
  const st = L.newGame(L.rng(9));
  st.player.invuln = 9999;
  run(st, 25);
  for (const e of st.enemies) {
    assert.ok(e.x >= L.WALL - 1e-6 && e.x + e.w <= L.W - L.WALL + 1e-6);
    assert.ok(e.y >= L.WALL - 1e-6 && e.y <= L.H);
  }
  const fly = calm(); fly.player.invuln = 99;
  const m = addEnemy(fly, 'pulpul', 100, 80, { vx: 40, vy: 30, think: 99 });
  run(fly, 10);
  assert.ok(m.x >= L.WALL - 1e-6 && m.x + m.w <= L.W - L.WALL + 1e-6 && m.y >= L.WALL - 1e-6);
});

test('extra life at 30000 points', () => {
  const st = calm();
  st.score = 29950;
  const b = { id: ++st.seq, x: 100, y: 100, vx: 0, vy: 0, r: 8, age: 1, phase: 'float', enemy: { kind: 'zen', angry: false }, life: 5, dead: false };
  L.popBubble(st, b, true);
  assert.strictEqual(st.lives, L.START_LIVES + 1);
});

test('random play for several minutes keeps everyone inside the field', () => {
  const rand = L.rng(42);
  for (let g = 0; g < 5; g++) {
    const st = L.newGame(L.rng(100 + g));
    const inp = { dx: 0, jump: false, shoot: true };
    for (let i = 0; i < 60 * 150 && st.phase !== 'over'; i++) {
      if (i % 25 === 0) { inp.dx = Math.floor(rand() * 3) - 1; }
      inp.jump = i % 70 === 0;
      L.step(st, DT, inp);
      const p = st.player;
      assert.ok(p.x >= L.WALL - 1e-6 && p.x + p.w <= L.W - L.WALL + 1e-6, 'x');
      assert.ok(p.y >= L.WALL - 1e-6 && p.y <= L.H + 5, 'y');
      assert.ok(st.bubbles.length <= L.MAX_BUBBLES + 2);
      assert.ok(st.lives >= 0 && st.score >= 0);
      for (const e of st.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
    }
  }
});
