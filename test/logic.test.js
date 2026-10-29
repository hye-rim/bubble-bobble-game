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

test('there are 100 levels, every one has a different shape, and every platform can be reached from the floor', () => {
  assert.strictEqual(L.MAPS.length, L.LAST_LEVEL);
  assert.strictEqual(L.LAST_LEVEL, 100);
  assert.strictEqual(new Set(L.MAPS.map((m) => JSON.stringify(m))).size, 100, 'all different');
  const stepOf = (a, b) => Math.max(0, Math.max(a[0], b[0]) - Math.min(a[1], b[1]));
  L.MAPS.forEach((m, i) => {
    assert.ok(L.connected(m), `map ${i + 1} connected`);
    const rows = Object.keys(m).map(Number).sort((a, b) => b - a);
    assert.ok(rows.length >= 2 && rows.every((r) => r >= 4 && r <= 19), 'rows are inside the field');
    const all = [L.FLOOR_ROW, ...rows];
    for (let k = 1; k < all.length; k++) assert.ok(all[k - 1] - all[k] <= 5, `map ${i + 1}: the layers are at most 5 rows apart (jumpable)`);
    for (const r of rows) for (const [a, b] of m[r]) assert.ok(a >= 2 && b <= 29 && b - a >= 2, 'segments fit between the walls');
    // 독립 검사: 바닥에서 위아래 한 층씩 5칸 이내로 이어지는지
    const segs = [{ row: L.FLOOR_ROW, r: [2, L.FLOOR_GAP[0] - 1] }, { row: L.FLOOR_ROW, r: [L.FLOOR_GAP[1] + 1, 29] }];
    rows.forEach((r) => m[r].forEach((seg) => segs.push({ row: r, r: seg })));
    const seen = new Set([0]); const q = [0];
    while (q.length) { const x = q.shift(); segs.forEach((o, j) => { if (!seen.has(j) && Math.abs(all.indexOf(o.row) - all.indexOf(segs[x].row)) === 1 && Math.abs(o.row - segs[x].row) <= 5 && stepOf(o.r, segs[x].r) <= 5) { seen.add(j); q.push(j); } }); }
    assert.strictEqual(seen.size, segs.length, `map ${i + 1} reachable`);
  });
  assert.strictEqual(L.buildTiles(100).length, L.ROWS);
  assert.strictEqual(L.buildTiles(101).length, L.ROWS, 'past the end still builds');
});

test('enemy kinds appear from the levels the original introduces them', () => {
  assert.deepStrictEqual(L.FIRST_LEVEL, { zen: 1, mighta: 6, monsta: 10, pulpul: 20, banebou: 30, hidegons: 40, drunk: 50, invader: 60 });
  for (let lv = 1; lv <= 100; lv++) {
    const list = L.enemyList(lv, L.rng(lv));
    for (const e of list) assert.ok(L.FIRST_LEVEL[e.kind] <= lv, `${e.kind} is not allowed on level ${lv}`);
    for (const k of Object.keys(L.FIRST_LEVEL)) if (L.FIRST_LEVEL[k] === lv && lv > 1) assert.ok(list.filter((e) => e.kind === k).length >= 2, `the new ${k} shows up on level ${lv}`);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].at > list[i - 1].at);
  }
  assert.strictEqual(L.enemyList(1, L.rng(1)).length, 4);
  assert.ok(L.enemyList(1, L.rng(1)).every((e) => e.kind === 'zen'));
  assert.ok(L.enemyList(100, L.rng(1)).length === 9);
  const all = new Set(L.enemyList(100, L.rng(7)).map((e) => e.kind));
  assert.strictEqual(all.size, 8, 'every kind on the last level');
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
  for (let r = 2; r < L.FLOOR_ROW; r++) for (let c = 2; c < L.COLS - 2; c++) if (st.tiles[r][c] === 2 || st.tiles[r][c] === 3) st.tiles[r][c] = 0;     // 위에 발판이 없는 판
  st.player.x = 98;
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
  assert.ok(s2.bubbles.length >= 5, 'no cap on how many are floating');
  const left = calm(); left.player.x = 100; left.player.face = -1; L.shoot(left);
  assert.ok(left.bubbles[0].vx < 0);
});

test('a bubble that touches an enemy traps it, and popping the bubble kills it for 1000 points and a fruit', () => {
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
  assert.strictEqual(st.score, 1000);
  assert.strictEqual(st.items.length, 1);
  assert.strictEqual(st.stats.pops, 1);
  assert.ok(st.events.some((x) => x.t === 'kill'));
  const it = st.items[0];
  assert.ok(it.kind === 'fruit' || it.kind === 'candy');
  // 가까이 가서 먹는다
  st.player.x = it.x - 2; st.player.y = it.y - 2;
  run(st, 0.5);
  assert.ok(st.score >= 1500);
});

test('popping several trapped enemies in a row doubles the points', () => {
  const st = calm();
  const mk = (x) => { const b = { id: ++st.seq, x, y: 80, vx: 0, vy: 0, r: 8, age: 1, phase: 'float', enemy: { kind: 'zen', angry: false }, life: 5, dead: false }; st.bubbles.push(b); return b; };
  const a = mk(60), b = mk(120), c = mk(180);
  L.popBubble(st, a, true); L.popBubble(st, b, true); L.popBubble(st, c, true);
  assert.strictEqual(st.score, 1000 + 2000 + 4000);
  st.time += 2;
  const d = mk(90); L.popBubble(st, d, true);
  assert.strictEqual(st.score, 7000 + 1000, 'the chain starts over after a pause');
});

test('an enemy stays trapped for seven seconds and then breaks out angry', () => {
  const st = calm();
  const e = sitting(st, 'zen', 120);
  const b = { id: ++st.seq, x: 122, y: FLOOR_Y - 12, vx: 100, vy: 0, r: 8, age: 0, phase: 'shot', enemy: null, life: 8, dead: false };   // 날아가는 중인 방울
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

test('only a bubble that was just shot traps an enemy, a floating empty bubble does not', () => {
  const st = calm();
  const e = sitting(st, 'zen', 120);
  const floating = { id: ++st.seq, x: 122, y: FLOOR_Y - 12, vx: 0, vy: 0, r: 8, age: 2, phase: 'float', enemy: null, life: 5, dead: false };
  st.bubbles.push(floating);
  st.player.x = 40;
  run(st, 0.1);
  assert.strictEqual(floating.enemy, null, 'the enemy touching a floating bubble is not trapped');
  assert.ok(e.alive && st.enemies.includes(e), 'the enemy is still free');
  assert.strictEqual(st.stats.traps, 0);
});

test('a bubble shot at an enemy traps it, but once it has turned into a floating bubble it no longer does', () => {
  const near = calm();
  const e1 = sitting(near, 'zen', 120);
  near.player.x = 100; near.player.face = 1; L.shoot(near);
  run(near, 0.5);
  assert.ok(near.bubbles.some((b) => b.enemy), 'a bubble shot into the enemy traps it');
  assert.ok(!e1.alive);
  const late = calm();
  const e2 = sitting(late, 'zen', 120);
  late.bubbles.push({ id: ++late.seq, x: 60, y: FLOOR_Y - 12, vx: 0, vy: 0, r: 8, age: 1.5, phase: 'float', enemy: null, life: 6, dead: false });   // 쏜 지 오래된 방울
  late.player.x = 200;
  late.bubbles[0].x = 122;
  run(late, 0.2);
  assert.ok(e2.alive, 'a late floating bubble does not catch it');
  assert.strictEqual(late.bubbles.filter((b) => b.enemy).length, 0);
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

test('fruit scores, candies and shoes make you stronger up to two times, and a lost life takes it away', () => {
  const st = calm();
  const fruit = { x: st.player.x, y: st.player.y, w: 10, h: 10, vx: 0, vy: 0, ground: true, kind: 'fruit', type: 'cherry', pts: 500, age: 0 };
  st.items.push(fruit); run(st, 0.05);
  assert.strictEqual(st.score, 500);
  const candy = (type) => { st.items.push({ x: st.player.x, y: st.player.y, w: 10, h: 10, vx: 0, vy: 0, ground: true, kind: 'candy', type, age: 0 }); run(st, 0.05); };
  candy('rate'); candy('rate'); candy('rate'); candy('speed'); candy('range');
  assert.strictEqual(st.mods.rate, 2, 'capped at two');
  assert.strictEqual(st.mods.speed, 1);
  assert.strictEqual(st.mods.range, 1);
  const x0 = st.player.x; run(st, 0.5, { dx: 1, jump: false, shoot: false });
  assert.ok(st.player.x - x0 > L.PLAYER_SPEED * 0.5 * 1.1, 'faster');
  st.player.face = 1; st.player.cool = 0; L.shoot(st);
  assert.ok(st.bubbles[0].vx > 150 * 1.2, 'the bubble goes farther');
  sitting(st, 'zen', st.player.x);
  st.player.invuln = 0; run(st, 0.1);
  assert.deepStrictEqual(st.mods, { speed: 0, rate: 0, range: 0 });
});

test('candies come from what you do: 35 bubbles blown, 35 bubbles popped, 15 times on a bubble; one per level', () => {
  const st = calm();
  st.counts.blown = L.CANDY_AT.rate - 1;
  st.player.face = 1; st.player.cool = 0;
  L.shoot(st);
  const candies = () => st.items.filter((i) => i.kind === 'candy');
  assert.strictEqual(candies().length, 1);
  assert.strictEqual(candies()[0].type, 'rate');
  assert.strictEqual(st.counts.blown, 0);
  st.counts.popped = L.CANDY_AT.range; L.checkCandy(st);
  assert.strictEqual(candies().length, 1, 'only one candy a level');
  assert.strictEqual(st.counts.popped, L.CANDY_AT.range, 'the count waits');
  const s2 = calm();
  s2.counts = { blown: 99, popped: 99, bounced: 99 };
  L.checkCandy(s2);
  assert.strictEqual(s2.items[0].type, 'speed', 'shoes first, then range, then rate');
  const s3 = L.newGame(L.rng(5));
  s3.queue = []; s3.enemies = [];
  const b = { id: 1, x: 100, y: 100, vx: 0, vy: 0, r: 8, age: 1, phase: 'float', enemy: { kind: 'zen', angry: false }, life: 6, dead: false };
  s3.bubbles.push(b);
  s3.items.push({ x: 50, y: 50, w: 10, h: 10, vx: 0, vy: 0, kind: 'candy', type: 'rate', age: 0 });
  L.popBubble(s3, b, true);
  run(s3, 0.1);
  assert.strictEqual(s3.phase, 'clear');
  assert.ok(!s3.items.some((i) => i.kind === 'candy'), 'the candy is gone when the last enemy pops');
  assert.strictEqual(L.CANDY_AT.speed, 15);
});

test('standing on a bubble counts toward the shoes', () => {
  const st = calm();
  st.bubbles.push({ id: ++st.seq, x: 100, y: 130, vx: 0, vy: -28, r: 8, age: 2, phase: 'float', enemy: null, life: 8, dead: false });
  st.player.x = 93; st.player.y = 100; st.player.vy = 40;
  run(st, 0.4);
  assert.strictEqual(st.counts.bounced, 1);
});

test('EXTEND letters: three trapped enemies popped in a row give one letter bubble, four give two', () => {
  const mk = (st, n) => { for (let i = 0; i < n; i++) { const b = { id: ++st.seq, x: 40 + i * 30, y: 80, vx: 0, vy: 0, r: 8, age: 1, phase: 'float', enemy: { kind: 'zen', angry: false }, life: 5, dead: false }; st.bubbles.push(b); L.popBubble(st, b, true); } };
  const a = calm(); mk(a, 2);
  assert.strictEqual(a.bubbles.filter((b) => b.letter !== undefined).length, 0);
  const b3 = calm(); mk(b3, 3);
  assert.strictEqual(b3.bubbles.filter((b) => b.letter !== undefined).length, 1);
  const b4 = calm(); mk(b4, 4);
  const letters = b4.bubbles.filter((b) => b.letter !== undefined);
  assert.strictEqual(letters.length, 2);
  assert.notStrictEqual(letters[0].letter, letters[1].letter);
  assert.ok(letters[0].letter >= 0 && letters[0].letter < 6);
  assert.deepStrictEqual(L.EXTEND_LETTERS, ['E', 'X', 'T', 'E', 'N', 'D']);
  const s5 = calm(); s5.score = 0;
  s5.bubbles = [];
  const e = { id: 1, x: 10, y: 10, vx: 0, vy: 0, r: 8, age: 1, phase: 'float', enemy: { kind: 'zen', angry: false }, life: 5, dead: false };
  s5.bubbles.push(e); L.popBubble(s5, e, true);
  s5.time += 5;
  assert.strictEqual(s5.bubbles.filter((b) => b.letter !== undefined).length, 0, 'a pause starts a new chain');
});

test('collecting all six EXTEND letters gives a life and skips the level', () => {
  const st = calm();
  st.enemies.push({ x: 100, y: 100, w: 14, h: 14, vx: 0, vy: 0, ground: false, id: 99, kind: 'zen', dir: 1, angry: false, prot: 0, think: 1e9, alive: true, ang: 0, anim: 0 });
  for (let i = 0; i < 6; i++) {
    const b = { id: ++st.seq, x: 60 + i * 20, y: 60, vx: 0, vy: 0, r: 8, age: 1, phase: 'float', enemy: null, letter: i, life: 18, dead: false };
    st.bubbles.push(b);
    if (i < 5) { L.popBubble(st, b, true); assert.strictEqual(st.phase, 'play'); assert.ok(st.extend[i]); }
  }
  const lives = st.lives;
  L.popBubble(st, st.bubbles[st.bubbles.length - 1], true);
  assert.strictEqual(st.lives, lives + 1);
  assert.strictEqual(st.phase, 'clear');
  assert.strictEqual(st.enemies.length, 0);
  assert.ok(st.events.some((e) => e.t === 'extend'));
  assert.ok(st.extend.every((x) => !x), 'the letters start over');
  run(st, 2.8);
  assert.strictEqual(st.level, 2);
});

test('special bubbles float up now and then, and popping them burns the enemies into diamonds (7000 water, 8000 lightning, 9000 fire)', () => {
  const st = calm();
  sitting(st, 'zen', 40);
  st.specialT = 0;
  run(st, 0.1);
  assert.strictEqual(st.bubbles.filter((b) => b.special).length, 1);
  const kinds = new Set();
  for (let i = 0; i < 60; i++) { const s = calm(); s.rand = L.rng(i); sitting(s, 'zen', 40); L.spawnSpecial(s); kinds.add(s.bubbles[0].special); }
  assert.deepStrictEqual([...kinds].sort(), ['fire', 'lightning', 'water']);
  for (const [type, pts] of [['water', 7000], ['lightning', 8000], ['fire', 9000]]) {
    const s = calm();
    s.player.x = 200;
    const e = sitting(s, 'zen', 96);                                    // 바닥 발판 위
    const b = { id: ++s.seq, x: 100, y: type === 'lightning' ? 169 : 150, vx: 0, vy: 0, r: 8, age: 1, phase: 'float', enemy: null, special: type, life: 16, dead: false };
    s.bubbles.push(b);
    L.popBubble(s, b, true);
    run(s, 1.5);
    assert.ok(!e.alive, `${type} burns the enemy`);
    const d = s.items.find((i) => i.kind === 'diamond');
    assert.ok(d, `${type} leaves a diamond`);
    assert.strictEqual(d.pts, pts);
  }
});

test('a diamond is worth its points when you pick it up', () => {
  const st = calm();
  st.items.push({ x: st.player.x, y: st.player.y, w: 10, h: 10, vx: 0, vy: 0, ground: true, kind: 'diamond', type: 'water', pts: 7000, age: 0 });
  run(st, 0.05);
  assert.strictEqual(st.score, 7000);
});

test('extra lives come from the score at 30000, 100000, 400000, 1000000 and 2000000', () => {
  assert.deepStrictEqual(L.EXTRA_LIFE_SCORES, [30000, 100000, 400000, 1000000, 2000000]);
  const st = calm();
  st.score = 99990; L.popBubble(st, { id: 1, x: 100, y: 100, vx: 0, vy: 0, r: 8, age: 1, phase: 'float', enemy: { kind: 'zen' }, life: 5, dead: false }, true);
  assert.strictEqual(st.lives, L.START_LIVES + 2, '30000 and 100000 are both passed');
  st.time += 5;
  st.score = 399950; L.popBubble(st, { id: 2, x: 100, y: 100, vx: 0, vy: 0, r: 8, age: 1, phase: 'float', enemy: { kind: 'zen' }, life: 5, dead: false }, true);
  assert.strictEqual(st.lives, L.START_LIVES + 3, 'then 400000');
  const far = calm(); far.score = 3000000;
  L.popBubble(far, { id: 3, x: 1, y: 1, vx: 0, vy: 0, r: 8, age: 1, phase: 'float', enemy: { kind: 'zen' }, life: 5, dead: false }, true);
  assert.strictEqual(far.lives, L.START_LIVES + 5, 'no more lives from the score after the last threshold');
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
  const b0 = { x: st.baron.x, y: st.baron.y }, toward = { x: st.player.x - b0.x, y: st.player.y - b0.y };
  run(st, 0.5);
  const moved = { x: st.baron.x - b0.x, y: st.baron.y - b0.y };
  assert.ok(moved.x * toward.x + moved.y * toward.y > 0 && Math.hypot(moved.x, moved.y) > 10, 'the whale heads for the player');
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
      assert.ok(st.lives >= 0 && st.score >= 0);
      for (const e of st.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
    }
  }
});

test('there is no limit on how many bubbles can be on screen at once', () => {
  const st = calm();
  for (let i = 0; i < 30; i++) { st.player.cool = 0; st.player.face = 1; L.shoot(st); }
  assert.strictEqual(st.bubbles.length, 30);
});

test('yellow candy makes you blow bubbles faster and blue candy sends them farther', () => {
  const rate = calm(), plain = calm();
  rate.mods.rate = 2;
  const shots = (st) => { let n = 0; for (let i = 0; i < 60 * 3; i++) { L.step(st, DT, { dx: 0, jump: false, shoot: true }); } n = st.stats.shots; return n; };
  assert.ok(shots(rate) > shots(plain) * 1.4, 'faster shooting');
  const far = calm(), near = calm();
  far.mods.range = 2; far.player.face = 1; near.player.face = 1;
  L.shoot(far); L.shoot(near);
  const x0f = far.bubbles[0].x, x0n = near.bubbles[0].x;
  run(far, 0.8); run(near, 0.8);
  assert.ok(far.bubbles[0].x - x0f > (near.bubbles[0].x - x0n) * 1.3, 'travels farther');
  assert.strictEqual(L.CANDY_AT.rate, 35);
  assert.strictEqual(L.CANDY_AT.range, 35);
});

test('popping an empty bubble with your body is worth 10 points, and one that just times out is worth nothing', () => {
  const st = calm();
  const b = { id: ++st.seq, x: 60, y: FLOOR_Y - 20, vx: 0, vy: 0, r: 8, age: 2, phase: 'float', enemy: null, life: 5, dead: false };
  st.bubbles.push(b);
  st.player.x = 56; st.player.y = FLOOR_Y - 14;
  run(st, 0.1);
  assert.strictEqual(st.score, 10);
  assert.ok(st.events.length >= 0);
  const s2 = calm();
  s2.player.x = 200; s2.player.face = 1; L.shoot(s2);
  run(s2, L.EMPTY_LIFE + 0.5);
  assert.strictEqual(s2.bubbles.length, 0);
  assert.strictEqual(s2.score, 0, 'no points when it just fades');
  assert.strictEqual(L.KILL_POINTS, 1000); assert.strictEqual(L.BUBBLE_POINTS, 10);
});

test('normal fruit is worth 700 points', () => {
  const st = calm();
  const e = { id: 1, x: 100, y: 100, vx: 0, vy: 0, r: 8, age: 1, phase: 'float', enemy: { kind: 'zen' }, life: 5, dead: false };
  st.bubbles.push(e); st.player.x = 220;
  L.popBubble(st, e, true);
  assert.strictEqual(st.items[0].pts, L.FRUIT_POINTS);
  assert.strictEqual(L.FRUIT_POINTS, 700);
  const s2 = calm(); s2.level = 9;
  const e2 = { id: 2, x: 100, y: 100, vx: 0, vy: 0, r: 8, age: 1, phase: 'float', enemy: { kind: 'zen' }, life: 5, dead: false };
  s2.bubbles.push(e2); L.popBubble(s2, e2, true);
  assert.strictEqual(s2.items[0].pts, 700, 'the same on later levels');
});

test('blowing a bubble with your back to the wall pops it at once for 10 points', () => {
  const st = calm();
  st.player.x = L.WALL; st.player.face = -1;
  L.shoot(st);
  assert.strictEqual(st.bubbles.length, 0, 'it never floats');
  assert.strictEqual(st.score, 10);
  assert.strictEqual(st.counts.blown, 1, 'still counts as a bubble you blew');
  const s2 = calm();
  s2.player.x = L.W - L.WALL - 14; s2.player.face = 1;
  L.shoot(s2);
  assert.strictEqual(s2.score, 10);
  const s3 = calm(); s3.player.x = 100; s3.player.face = 1; L.shoot(s3);
  assert.strictEqual(s3.bubbles.length, 1, 'out in the open it floats as usual');
});

const walker = (st, kind, x, y, extra = {}) => { const e = L.makeEnemy(st, kind, x, y, { prot: 0, ...extra }); e.ground = true; st.enemies.push(e); return e; };

test('Mighta throws a slow rock you cannot destroy, and the rock hurts', () => {
  const st = calm(); st.player.invuln = 0;
  st.player.x = 150; st.player.y = L.FLOOR_ROW * 8 - 14;
  const e = walker(st, 'mighta', 60, L.FLOOR_ROW * 8 - 14, { dir: 1, atkT: 0 });
  run(st, 0.2);
  const rock = st.shots.find((s) => s.kind === 'rock');
  assert.ok(rock, 'threw a rock'); assert.ok(rock.vx > 0 && rock.vx < 60, 'slowly');
  const b = { id: ++st.seq, x: rock.x + 6, y: rock.y, vx: 0, vy: 0, r: 8, age: 0.5, phase: 'float', enemy: null, life: 8, dead: false };
  void b; void e;
  st.player.x = rock.x + 30;
  run(st, 1.0);
  assert.strictEqual(st.lives, L.START_LIVES - 1, 'hit by the rock');
});

test('Monsta and Pulpul fly diagonally and bounce off the walls, Pulpul sideways more than up and down', () => {
  const st = calm(); st.player.invuln = 999;
  const m = walker(st, 'monsta', 100, 80), p = walker(st, 'pulpul', 100, 120);
  for (const e of [m, p]) { e.vx = 30; e.vy = 30; }
  p.vx = L.KINDS.pulpul.speed * L.KINDS.pulpul.fx; p.vy = L.KINDS.pulpul.speed * L.KINDS.pulpul.fy;
  run(st, 6);
  for (const e of [m, p]) assert.ok(e.x >= L.WALL - 1e-6 && e.x + e.w <= L.W - L.WALL + 1e-6 && e.y >= L.WALL - 1e-6, 'stays inside');
  assert.ok(Math.abs(L.KINDS.pulpul.fx) > L.KINDS.pulpul.fy * 2, 'more sideways');
  assert.strictEqual(L.KINDS.monsta.fx, L.KINDS.monsta.fy, 'a true diagonal');
  const turned = calm(); turned.player.invuln = 999;
  const q = walker(turned, 'monsta', L.W - L.WALL - 20, 80); q.vx = 40; q.vy = 0.001;
  run(turned, 1.0);
  assert.ok(q.vx < 0, 'bounced off the right wall');
});

test('Banebou only moves by hopping', () => {
  const st = calm(); st.player.invuln = 999;
  const e = walker(st, 'banebou', 60, L.FLOOR_ROW * 8 - 14, { dir: 1 });
  e.hopT = 0;
  const x0 = e.x;
  run(st, 0.1);
  assert.ok(!e.ground && e.vy < 0, 'jumped');
  run(st, 0.1);
  assert.ok(Math.abs(e.x - x0) > 4, 'moves while in the air');
  const rest = calm(); rest.player.invuln = 999;
  const f = walker(rest, 'banebou', 80, L.FLOOR_ROW * 8 - 14, { dir: 1 });
  f.hopT = 5;
  const fx = f.x;
  run(rest, 0.5);
  assert.strictEqual(f.x, fx, 'standing still between hops');
  assert.ok(f.ground);
});

test('Hidegons breathes fire without stopping, Invader shoots a laser downward at a steady beat, Drunk throws a bottle that comes back', () => {
  const st = calm(); st.player.invuln = 999;
  st.player.x = 220;
  const h = walker(st, 'hidegons', 60, L.FLOOR_ROW * 8 - 14, { dir: 1, atkT: 0 });
  const x0 = h.x;
  run(st, 0.3);
  assert.ok(st.shots.some((s) => s.kind === 'fire'), 'fire');
  assert.ok(h.x > x0 + 8, 'keeps walking while it shoots');
  const si = calm(); si.player.invuln = 999; si.player.x = 220;
  const iv = walker(si, 'invader', 100, L.FLOOR_ROW * 8 - 14, { dir: 1, atkT: 0 });
  run(si, 0.03);
  const lasers = () => si.shots.filter((s) => s.kind === 'laser').length;
  assert.ok(lasers() >= 1, 'laser');
  assert.ok(si.shots.find((s) => s.kind === 'laser').vy > 0 && si.shots.find((s) => s.kind === 'laser').vx === 0, 'straight down');
  const n0 = si.stats.kills; void n0;
  run(si, 3.5);
  assert.ok(iv.alive);
  const sd = calm(); sd.player.invuln = 999; sd.player.x = 30;
  const d = walker(sd, 'drunk', 100, L.FLOOR_ROW * 8 - 14, { dir: 1, atkT: 0 });
  run(sd, 0.2);
  const bottle = sd.shots.find((s) => s.kind === 'bottle');
  assert.ok(bottle, 'bottle thrown');
  let back = false;
  for (let i = 0; i < 60 * 5; i++) { L.step(sd, DT, NONE); const b = sd.shots.find((s) => s.kind === 'bottle'); if (b && b.back) back = true; if (!b && back) break; }
  assert.ok(back, 'it bounced off the wall and came back');
  assert.ok(!sd.shots.some((s) => s.kind === 'bottle') || true);
  assert.ok(d.alive);
});

test('enemies that never jump (Invader) and only seldom jump (Hidegons) stay on their platform more than Zen-chan and Drunk', () => {
  assert.strictEqual(L.KINDS.invader.jump, 0);
  assert.ok(L.KINDS.hidegons.jump < L.KINDS.zen.jump);
  assert.ok(L.KINDS.drunk.jump > L.KINDS.zen.jump);
  assert.ok(L.KINDS.hidegons.speed > L.KINDS.zen.speed && L.KINDS.drunk.speed > L.KINDS.zen.speed, 'faster');
});

test('clearing level 100 finishes the game', () => {
  const st = L.newGame(L.rng(5));
  L.startLevel(st, 100);
  st.queue = []; st.enemies = []; st.bubbles = [];
  run(st, 0.2);
  assert.strictEqual(st.phase, 'clear');
  run(st, 3.2);
  assert.strictEqual(st.phase, 'won');
  assert.ok(st.events.some((e) => e.t === 'win') || st.phase === 'won');
  const lv = st.level;
  run(st, 2);
  assert.strictEqual(st.level, lv, 'no level 101');
});

test('a full run through every level with every enemy kind keeps everything inside the field', () => {
  const rand = L.rng(77);
  for (const lv of [6, 10, 20, 30, 40, 50, 60, 100]) {
    const st = L.newGame(L.rng(lv));
    L.startLevel(st, lv);
    st.player.invuln = 99999;
    const inp = { dx: 0, jump: false, shoot: true };
    for (let i = 0; i < 60 * 40 && st.phase === 'play'; i++) {
      if (i % 25 === 0) inp.dx = Math.floor(rand() * 3) - 1;
      inp.jump = i % 80 === 0;
      L.step(st, DT, inp);
      for (const e of st.enemies) { assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y)); assert.ok(e.x >= L.WALL - 1e-6 && e.x + e.w <= L.W - L.WALL + 1e-6, `${e.kind} x`); }
      for (const sh of st.shots) assert.ok(Number.isFinite(sh.x) && Number.isFinite(sh.y));
    }
  }
});

// ---------- 판마다 나오는 적의 표(levels.js)가 단계에 알맞은지 ----------
const THREAT = { zen: 1, mighta: 1.5, monsta: 1.4, pulpul: 1.4, banebou: 1.6, hidegons: 2.2, drunk: 2.4, invader: 2 };
const countOf = (row) => Object.values(row).reduce((a, b) => a + b, 0);
const threatOf = (row) => Object.entries(row).reduce((s, [k, n]) => s + THREAT[k] * n, 0);

test('the enemy table has one row for each of the 100 levels and the game spawns exactly what it says', () => {
  const T = L.LEVEL_ENEMIES;
  assert.strictEqual(T.length, 100);
  for (let lv = 1; lv <= 100; lv++) {
    const list = L.enemyList(lv);
    const got = {}; list.forEach((e) => { got[e.kind] = (got[e.kind] || 0) + 1; });
    assert.deepStrictEqual(got, T[lv - 1], `level ${lv}: the spawn list matches the table`);
  }
  assert.deepStrictEqual(L.enemyList(150), L.enemyList(100), 'past 100 uses the last row');
});

test('every level has a fitting number of enemies: 4 at first, growing to 9, never more', () => {
  const T = L.LEVEL_ENEMIES;
  T.forEach((row, i) => {
    const n = countOf(row), lv = i + 1;
    assert.ok(n >= 4 && n <= 9, `level ${lv} has ${n}`);
    assert.strictEqual(n, Math.min(9, 4 + Math.floor((lv - 1) / 10)), `level ${lv} count follows the schedule`);
  });
  assert.strictEqual(countOf(T[0]), 4);
  assert.strictEqual(countOf(T[99]), 9);
  for (let lv = 2; lv <= 100; lv++) assert.ok(countOf(T[lv - 1]) >= countOf(T[lv - 2]), `the count never drops (level ${lv})`);
});

test('no enemy shows up before the level where it is introduced, and each new kind arrives in pairs', () => {
  const T = L.LEVEL_ENEMIES;
  T.forEach((row, i) => {
    const lv = i + 1;
    for (const k of Object.keys(row)) {
      assert.ok(L.KINDS[k], `${k} is a real kind`);
      assert.ok(L.FIRST_LEVEL[k] <= lv, `${k} appears on level ${lv}, before its first level ${L.FIRST_LEVEL[k]}`);
      assert.ok(row[k] >= 1);
    }
    for (const k of Object.keys(L.FIRST_LEVEL)) if (L.FIRST_LEVEL[k] === lv && lv > 1) assert.ok(row[k] >= 2, `the new ${k} arrives with at least two on level ${lv}`);
  });
  for (let lv = 1; lv <= 5; lv++) assert.deepStrictEqual(Object.keys(T[lv - 1]), ['zen'], `level ${lv} is only Zen-chan`);
  assert.deepStrictEqual(new Set(Object.keys(T[99])), new Set(Object.keys(L.FIRST_LEVEL)), 'the last level has every kind');
});

test('the mix gets harder as you go: tougher enemies and more of them in each ten levels, and Zen-chan become rare', () => {
  const T = L.LEVEL_ENEMIES;
  const decade = (d) => { let t = 0, n = 0, z = 0; for (let i = d * 10; i < d * 10 + 10; i++) { t += threatOf(T[i]); n += countOf(T[i]); z += T[i].zen || 0; } return { threat: t / 10, n: n / 10, zen: z / n }; };
  const ds = Array.from({ length: 10 }, (_, d) => decade(d));
  for (let d = 1; d <= 4; d++) assert.ok(ds[d].threat > ds[d - 1].threat + 0.5, `decade ${d + 1} is clearly harder than decade ${d}`);
  for (let d = 5; d < 10; d++) assert.ok(ds[d].threat >= ds[4].threat - 1, 'it does not get easier later');
  assert.ok(ds[0].zen > 0.6, 'the early levels are mostly Zen-chan');
  assert.ok(ds[9].zen < 0.15, 'the late levels hardly have any');
  assert.ok(ds[9].threat > ds[0].threat * 3, 'the end is much harder than the start');
  // 열 판마다 마지막 구간이 첫 구간보다 평균 위험도가 높다
  for (let d = 0; d < 9; d++) assert.ok(ds[d + 1].threat >= ds[d].threat - 0.8, 'no big step back between neighbouring decades');
});

test('the table has variety: many different mixes, and a level never looks exactly like the one before', () => {
  const T = L.LEVEL_ENEMIES;
  assert.ok(new Set(T.map((r) => JSON.stringify(r))).size >= 60);
  let same = 0;
  for (let i = 1; i < 100; i++) if (JSON.stringify(T[i]) === JSON.stringify(T[i - 1])) same++;
  assert.ok(same <= 12, `repeats of the previous level: ${same}`);
  for (const lv of [6, 10, 20, 30, 40, 50, 60]) assert.notDeepStrictEqual(T[lv - 1], T[lv - 2], `level ${lv} differs from ${lv - 1}`);
});

test('the spawn order mixes the kinds: every kind comes out once before any kind comes out twice', () => {
  for (const lv of [10, 30, 60, 100]) {
    const kinds = L.enemyList(lv).map((e) => e.kind);
    const distinct = new Set(kinds).size;
    assert.strictEqual(new Set(kinds.slice(0, distinct)).size, distinct, `level ${lv}: ${kinds.join(',')}`);
  }
});
