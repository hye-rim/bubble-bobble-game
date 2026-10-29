'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 보글보글: 화면·입력·소리. 규칙(발판·방울·적·과일·서두르기)은 logic.js (LOGIC_BUBBLE) 에 있고,
// 여기서는 규칙이 남긴 st.events 를 보고 소리·효과·안내를 만든다.
const L = LOGIC_BUBBLE;
const { W, H, TILE, COLS, ROWS } = L;
const HUD = 16;                                   // 위쪽 안내 줄
const CH = H + HUD;                               // 캔버스 높이 216

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

function fit() {
  const controls = $('controls');
  const ctrlH = getComputedStyle(controls).display === 'none' ? 0 : controls.offsetHeight + 10;
  const scale = Math.min((innerWidth - 16) / W, (innerHeight - 16 - ctrlH) / CH);
  const cssW = Math.max(160, Math.floor(W * scale)), cssH = Math.floor(cssW * CH / W);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / CH, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
addEventListener('resize', fit);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};

// ---------- 소리 ----------
let audio = null;
let muted = store.get('bubbleMuted') === '1';
function tone(freq, dur, type = 'square', vol = 0.045, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t); o.stop(t + dur);
  } catch (_) {}
}
const melody = (notes, step, type = 'square', vol = 0.05) => notes.forEach((f, i) => { if (f) setTimeout(() => tone(f, step * 0.9 / 1000, type, vol), i * step); });
const sfx = {
  jump: () => tone(300, 0.16, 'square', 0.04, 360),
  shoot: () => tone(700, 0.08, 'sine', 0.05, -300),
  trap: () => melody([520, 780], 70, 'sine', 0.07),
  pop: () => tone(900, 0.07, 'sine', 0.05, -500),
  kill: (n) => melody([523, 659, 784].map((f) => f * (1 + 0.12 * Math.min(n, 6))), 55, 'square', 0.05),
  fruit: () => melody([880, 1175, 1568], 60, 'sine', 0.07),
  candy: () => melody([660, 990, 1320, 1760], 60, 'sine', 0.07),
  crash: () => { tone(260, 0.5, 'sawtooth', 0.06, -200); setTimeout(() => tone(160, 0.5, 'sawtooth', 0.06, -90), 120); },
  brk: () => tone(220, 0.15, 'sawtooth', 0.05, 200),
  life: () => melody([1047, 1319, 1568, 2093], 90, 'square', 0.05),
  start: () => melody([392, 523, 659, 784, 1047], 100),
  clear: () => melody([523, 659, 784, 1047, 1319, 1568], 100),
  hurry: () => melody([880, 0, 880, 0, 880], 130, 'sawtooth', 0.05),
  eshot: (k) => (k === 'laser' ? tone(900, 0.12, 'square', 0.03, -500) : k === 'fire' ? tone(220, 0.15, 'sawtooth', 0.03, 200) : tone(180, 0.1, 'triangle', 0.04)),
  letter: () => melody([880, 1175], 70, 'sine', 0.07),
  extend: () => melody([523, 659, 784, 1047, 1319, 1568, 2093], 90, 'square', 0.05),
  special: (t) => (t === 'water' ? melody([600, 500, 400, 300], 70, 'sine', 0.07) : t === 'lightning' ? melody([1500, 400, 1800, 300], 40, 'sawtooth', 0.05) : melody([200, 260, 220, 300], 70, 'sawtooth', 0.05)),
  diamond: () => melody([1320, 1760, 2093, 2637], 55, 'sine', 0.07),
  over: () => melody([392, 330, 262, 196], 220, 'sawtooth', 0.06),
};

// ---------- 상태 ----------
let G = L.newGame();
let state = 'title';                              // title · play · paused · over
let pausedFrom = null;
let best = Number(store.get('bubbleBest')) || 0;
let fxs = [];
let banner = { text: '', sub: '', t: 0, color: '#ffe14a' };
let clock = 0;
let lastX = 0;

/* @test-hooks:start */
window.__bb = { get G() { return G; }, get state() { return state; }, L, setG(g) { G = g; }, step: (dt) => update(dt) };
/* @test-hooks:end */

// ---------- 입력 ----------
const held = new Set();
const MOVE_KEYS = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };
const JUMP_KEYS = [' ', 'z', 'Z', 'ArrowUp', 'w', 'W'];
const SHOT_KEYS = ['x', 'X', 'j', 'J', 'k', 'K'];
let shotKey = false, shotTouch = false, jumpQueued = false, padDx = 0;
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key in MOVE_KEYS) { e.preventDefault(); held.add(e.key); return; }
  if (JUMP_KEYS.includes(e.key)) {
    e.preventDefault();
    if (state === 'title' || state === 'over') { if (!e.repeat && e.key === ' ') onOverlayButton(); return; }
    if (state === 'paused') { if (!e.repeat) resume(); return; }
    if (!e.repeat) jumpQueued = true;
    return;
  }
  if (SHOT_KEYS.includes(e.key)) { e.preventDefault(); if (state === 'play') shotKey = true; return; }
  if (e.key === 'Enter') { if (state === 'title' || state === 'over') onOverlayButton(); else if (state === 'paused') resume(); return; }
  if (e.key === 'p' || e.key === 'P') { if (state === 'paused') resume(); else pause(); }
  else if (e.key === 'm' || e.key === 'M') toggleMute();
});
addEventListener('keyup', (e) => { held.delete(e.key); if (SHOT_KEYS.includes(e.key)) shotKey = false; });

const pad = $('pad');
const PAD_DIRS = ['u', 'd', 'l', 'r'];
function padFrom(e) {
  const r = pad.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const rad = r.width / 2, m = Math.hypot(dx, dy);
  padDx = Math.abs(dx) < rad * 0.14 ? 0 : Math.max(-1, Math.min(1, dx / (rad * 0.6)));
  const knob = pad.querySelector('b'), lim = r.width * 0.2;
  knob.style.transform = `translate(${Math.max(-lim, Math.min(lim, dx))}px, ${Math.max(-lim, Math.min(lim, dy))}px)`;
  const on = { u: false, d: false, l: padDx < -0.3, r: padDx > 0.3 };
  pad.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', !!on[PAD_DIRS[i]]));
  if (dy < -rad * 0.62 && Math.abs(dx) < rad * 0.5 && !pad._up) { pad._up = true; if (state === 'play') jumpQueued = true; }   // 패드를 위로 밀어도 점프
  if (dy >= -rad * 0.45) pad._up = false;
  void m;
}
const padEnd = () => { padDx = 0; pad._up = false; pad.querySelector('b').style.transform = ''; pad.querySelectorAll('i').forEach((el) => el.classList.remove('on')); };
pad.addEventListener('pointerdown', (e) => { e.preventDefault(); try { pad.setPointerCapture(e.pointerId); } catch (_) {} padFrom(e); });
pad.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') padFrom(e); });
pad.addEventListener('pointerup', padEnd);
pad.addEventListener('pointercancel', padEnd);
const fireBtn = $('fireBtn'), jumpBtn = $('jumpBtn');
fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); try { fireBtn.setPointerCapture(e.pointerId); } catch (_) {} shotTouch = true; fireBtn.classList.add('on'); });
const fireOff = () => { shotTouch = false; fireBtn.classList.remove('on'); };
fireBtn.addEventListener('pointerup', fireOff);
fireBtn.addEventListener('pointercancel', fireOff);
jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (state === 'play') jumpQueued = true; jumpBtn.classList.add('on'); });
const jumpOff = () => jumpBtn.classList.remove('on');
jumpBtn.addEventListener('pointerup', jumpOff);
jumpBtn.addEventListener('pointercancel', jumpOff);

function readInput() {
  let dx = padDx;
  for (const k of held) dx += MOVE_KEYS[k] || 0;
  dx = Math.max(-1, Math.min(1, dx));
  const input = { dx, jump: jumpQueued, shoot: shotKey || shotTouch };
  jumpQueued = false;
  return input;
}

// ---------- 흐름 ----------
function showOverlay(html) { const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden'); o.querySelector('button').onclick = onOverlayButton; }
function hideOverlay() { $('overlay').classList.add('hidden'); }
function setBanner(text, sub = '', color = '#ffe14a', t = 2.2) { banner = { text, sub, t, color }; }
function startGame() {
  G = L.newGame();
  fxs = []; held.clear(); lastX = G.player.x;
  state = 'play';
  setBanner('ROUND 1', 'GET READY');
  hideOverlay();
  sfx.start();
}
function onOverlayButton() { if (state === 'paused') resume(); else startGame(); }
function pause() {
  if (state !== 'play') return;
  pausedFrom = state; state = 'paused';
  showOverlay('<h2>일시정지</h2><p>P 키나 아래 버튼으로 계속해요</p><button id="startBtn">계속하기</button>');
}
function resume() { if (state !== 'paused') return; state = pausedFrom; hideOverlay(); }
function gameWon() {
  state = 'over';
  const rec = G.score > best;
  if (rec) { best = G.score; store.set('bubbleBest', String(best)); }
  sfx.clear();
  showOverlay(`<h2>🎉 100판 클리어!</h2><p class="big">${G.score.toLocaleString()}점</p><p>터뜨린 적 ${G.stats.pops}마리${rec ? '<br>🏆 최고 기록!' : ''}</p><button id="startBtn">다시 하기</button>`);
}
function gameOver() {
  state = 'over';
  const rec = G.score > best;
  if (rec) { best = G.score; store.set('bubbleBest', String(best)); }
  sfx.over();
  showOverlay(`<h2>GAME OVER</h2><p class="big">${G.score.toLocaleString()}점</p><p>${G.level}라운드 · 터뜨린 적 ${G.stats.pops}마리${rec ? '<br>🏆 최고 기록!' : ''}</p><button id="startBtn">다시 하기</button>`);
}

function handleEvents() {
  for (const e of G.events) {
    if (e.t === 'jump') { sfx.jump(); tutorialSignal('jump'); }
    else if (e.t === 'shoot') { sfx.shoot(); tutorialSignal('shoot'); }
    else if (e.t === 'trap') { sfx.trap(); tutorialSignal('trap'); fxs.push({ kind: 'ring', x: e.x, y: e.y, t: 0, life: 0.35 }); }
    else if (e.t === 'pop') { sfx.pop(); fxs.push({ kind: 'ring', x: e.x, y: e.y, t: 0, life: 0.25 }); if (e.pts) fxs.push({ kind: 'text', x: e.x, y: e.y - 4, t: 0, life: 0.6, text: String(e.pts), color: '#bfe9ff' }); }
    else if (e.t === 'kill') {
      sfx.kill(e.chain); tutorialSignal('kill');
      fxs.push({ kind: 'ring', x: e.x, y: e.y, t: 0, life: 0.4 }, { kind: 'text', x: e.x, y: e.y - 6, t: 0, life: 1, text: String(e.pts) });
      for (let i = 0; i < 6; i++) fxs.push({ kind: 'spark', x: e.x, y: e.y, t: 0, life: 0.5, a: i * 1.05 + 0.3 });
    }
    else if (e.t === 'fruit') { sfx.fruit(); tutorialSignal('pickup'); fxs.push({ kind: 'text', x: e.x, y: e.y - 4, t: 0, life: 0.9, text: String(e.pts), color: '#ffe14a' }); }
    else if (e.t === 'candy') { sfx.candy(); tutorialSignal('pickup'); fxs.push({ kind: 'text', x: e.x, y: e.y - 4, t: 0, life: 1, text: { speed: 'SPEED UP', rate: 'RATE UP', range: 'RANGE UP' }[e.type], color: '#7fe0ff' }); }
    else if (e.t === 'candyDrop') setBanner('사탕이 나왔어요!', '', '#7fe0ff', 1.6);
    else if (e.t === 'letter') { if (e.spawned) sfx.letter(); else { sfx.letter(); fxs.push({ kind: 'text', x: e.x, y: e.y - 4, t: 0, life: 1, text: e.letter, color: '#ffe14a' }); } }
    else if (e.t === 'extend') { sfx.extend(); setBanner('EXTEND!', '목숨 +1 · 다음 판으로', '#ffe14a', 2.6); }
    else if (e.t === 'special') { sfx.special(e.type); fxs.push({ kind: 'ring', x: e.x, y: e.y, t: 0, life: 0.4 }); if (e.type === 'lightning') fxs.push({ kind: 'flash', x: 0, y: 0, t: 0, life: 0.25 }); }
    else if (e.t === 'burn') { sfx.kill(6); fxs.push({ kind: 'ring', x: e.x + 7, y: e.y + 7, t: 0, life: 0.4 }); tutorialSignal('kill'); }
    else if (e.t === 'diamond') { sfx.diamond(); tutorialSignal('pickup'); fxs.push({ kind: 'text', x: e.x, y: e.y - 4, t: 0, life: 1.1, text: String(e.pts), color: '#7fe0ff' }); }
    else if (e.t === 'specialBubble') sfx.letter();
    else if (e.t === 'crash') sfx.crash();
    else if (e.t === 'break') { sfx.brk(); fxs.push({ kind: 'ring', x: e.x, y: e.y, t: 0, life: 0.3, red: true }); }
    else if (e.t === 'extraLife') sfx.life();
    else if (e.t === 'enemyShot') sfx.eshot(e.kind);
    else if (e.t === 'win') gameWon();
    else if (e.t === 'hurry') { sfx.hurry(); setBanner('HURRY UP!', '적이 화났어요', '#ff6a5a', 2.4); }
    else if (e.t === 'baron') setBanner('조심!', '훼방꾼 고래가 쫓아와요', '#7fc8ff', 2.4);
    else if (e.t === 'clear') { sfx.clear(); setBanner('ROUND CLEAR', '', '#7fe08a', 2.6); }
    else if (e.t === 'level') { if (e.level > 1) { setBanner(`ROUND ${e.level}`, 'GET READY'); sfx.start(); } }
    else if (e.t === 'over') gameOver();
  }
}

function update(dt) {
  clock += dt;
  if (state !== 'play') return;
  L.step(G, dt, readInput());
  handleEvents();
  const p = G.player;
  if (Math.abs(p.x - lastX) >= 10) { lastX = p.x; tutorialSignal('move'); }
  banner.t = Math.max(0, banner.t - dt);
  for (const f of fxs) f.t += dt;
  fxs = fxs.filter((f) => f.t < f.life);
}

// ---------- 그리기 ----------
const PALETTES = [
  { bg: '#0a0a2a', brick: '#d8602a', hi: '#ff9a5a', lo: '#8a3410', wall: '#b04a22' },
  { bg: '#0a1a2a', brick: '#3a8ad8', hi: '#7ac0ff', lo: '#1a4a8a', wall: '#2c6ab4' },
  { bg: '#1a0a2a', brick: '#a05ad8', hi: '#d29aff', lo: '#5a2a8a', wall: '#7c44b0' },
  { bg: '#0a2a1a', brick: '#3ab45a', hi: '#8aff9a', lo: '#1a6a2a', wall: '#2c8a44' },
  { bg: '#2a1a0a', brick: '#d8b03a', hi: '#ffe07a', lo: '#8a6a10', wall: '#b08a22' },
  { bg: '#2a0a14', brick: '#d83a6a', hi: '#ff8aaa', lo: '#8a1a3a', wall: '#b02c52' },
];
function drawTiles() {
  const pal = PALETTES[(G.level - 1) % PALETTES.length];
  ctx.fillStyle = pal.bg; ctx.fillRect(0, HUD, W, H);
  for (let i = 0; i < 24; i++) {                                                       // 별
    const x = (i * 97 + 13) % W, y = HUD + ((i * 61 + 7) % (H - 20));
    ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.15 * Math.sin(clock * 2 + i)})`; ctx.fillRect(x, y, 1, 1);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const v = G.tiles[r][c];
    if (!v) continue;
    const x = c * TILE, y = HUD + r * TILE;
    if (v === 1) { ctx.fillStyle = pal.wall; ctx.fillRect(x, y, TILE, TILE); ctx.fillStyle = pal.lo; ctx.fillRect(x + TILE - 1, y, 1, TILE); ctx.fillRect(x, y + TILE - 1, TILE, 1); ctx.fillStyle = pal.hi; ctx.fillRect(x, y, TILE, 1); }
    else if (v === 2) { ctx.fillStyle = pal.brick; ctx.fillRect(x, y, TILE, TILE); ctx.fillStyle = pal.hi; ctx.fillRect(x, y, TILE, 2); ctx.fillStyle = pal.lo; ctx.fillRect(x + TILE - 1, y + 2, 1, TILE - 2); }
    else { ctx.fillStyle = pal.brick; ctx.fillRect(x, y, TILE, TILE); ctx.fillStyle = pal.lo; ctx.fillRect(x, y + TILE - 1, TILE, 1); ctx.fillRect(x + TILE - 1, y, 1, TILE); if ((r + c) % 2) { ctx.fillStyle = pal.lo; ctx.fillRect(x + 2, y + 3, 3, 1); } }
  }
}
function drawDragon(p, body, belly, spike, face) {
  const cx = p.x + p.w / 2, cy = HUD + p.y + p.h / 2;
  const step = p.moving ? (Math.floor(clock * 10) % 2) : 0;
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(face, 1);
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0, 8, 7, 0, 0, 7); ctx.fill();            // 몸
  ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(1.5, 2, 5, 4.5, 0, 0, 7); ctx.fill();       // 배
  ctx.fillStyle = spike; ctx.fillRect(-6, -8, 3, 3); ctx.fillRect(-2, -9, 3, 3); ctx.fillRect(2, -8, 3, 3);   // 등 가시
  ctx.fillStyle = '#fff'; ctx.fillRect(2, -5, 4, 4);                                               // 눈
  ctx.fillStyle = '#111'; ctx.fillRect(4, -4, 2, 2);
  ctx.fillStyle = body; ctx.fillRect(5, -1, 5, 4);                                                 // 주둥이
  ctx.fillStyle = '#e8a030'; ctx.fillRect(-5 + step, 6, 4, 2); ctx.fillRect(2 - step, 6, 4, 2);    // 발
  ctx.restore();
}
function drawPlayer() {
  const p = G.player;
  if (!p.alive) return;
  if (p.invuln > 0 && Math.floor(clock * 14) % 2 === 0) return;
  p.moving = Math.abs(lastDx) > 0.2;
  drawDragon(p, '#3ac84a', '#bff0a0', '#e8453a', p.face);
}
let lastDx = 0;
function drawEnemyBody(kind, cx, cy, angry, t, face, scale = 1) {
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(face * scale, scale);
  const eye = (x, y) => { ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 4, 4); ctx.fillStyle = '#111'; ctx.fillRect(x + 2, y + 1, 2, 3); };
  if (kind === 'zen') {
    ctx.fillStyle = angry ? '#e84a3a' : '#7a8ee8'; ctx.fillRect(-7, -6, 14, 12);
    ctx.fillStyle = angry ? '#a02a20' : '#4a5ab8'; ctx.fillRect(-7, 4, 14, 2);
    eye(1, -4);
    ctx.fillStyle = '#e8c83a'; ctx.fillRect(-9, -2 + (Math.floor(t * 6) % 2), 3, 4);                        // 태엽
    ctx.fillStyle = '#5a5a5a'; ctx.fillRect(-5, 6, 4, 2); ctx.fillRect(2, 6, 4, 2);
  } else if (kind === 'mighta') {                                                                           // 마이타: 두건을 쓴 마법사
    ctx.fillStyle = angry ? '#e84a3a' : '#8a5ae8'; ctx.beginPath(); ctx.moveTo(-7, 7); ctx.lineTo(-5, -4); ctx.lineTo(0, -8); ctx.lineTo(5, -4); ctx.lineTo(7, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a1a3a'; ctx.fillRect(-1, -5, 6, 6); eye(0, -4);
    ctx.fillStyle = '#c8b0ff'; ctx.fillRect(-7, 6, 14, 2);
    ctx.fillStyle = '#9a9aa6'; ctx.beginPath(); ctx.arc(8, 0, 3, 0, 7); ctx.fill();                       // 던질 바위
  } else if (kind === 'pulpul') {
    ctx.fillStyle = angry ? '#e8453a' : '#c05ae8'; ctx.beginPath(); ctx.ellipse(0, -1, 7, 7, 0, 0, 7); ctx.fill();
    eye(-4, -4);
    ctx.fillStyle = angry ? '#a02a20' : '#8a3ab8'; const w = Math.floor(t * 8) % 2; ctx.fillRect(-7, 5, 3, 3 + w); ctx.fillRect(-1, 5, 3, 4 - w); ctx.fillRect(4, 5, 3, 3 + w);
  } else if (kind === 'monsta') {
    ctx.fillStyle = angry ? '#ff8a7a' : '#f2f2ff'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(1, -3, 3, 3); ctx.fillRect(-4, -3, 3, 3);
    ctx.fillStyle = angry ? '#e8453a' : '#a8a8d8'; ctx.fillRect(-8, 3, 16, 3);
  } else if (kind === 'banebou') {                                                                          // 바네보: 용수철 몸
    ctx.strokeStyle = angry ? '#e8453a' : '#d8d8e8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-5, 7); ctx.lineTo(5, 4); ctx.lineTo(-5, 1); ctx.lineTo(5, -2); ctx.stroke();
    ctx.fillStyle = angry ? '#e8453a' : '#ff8a5a'; ctx.beginPath(); ctx.arc(0, -4, 6, 0, 7); ctx.fill();
    eye(0, -7);
  } else if (kind === 'hidegons') {                                                                         // 히데곤: 불을 쏘는 초록 용
    ctx.fillStyle = angry ? '#e8453a' : '#3ab43a'; ctx.beginPath(); ctx.ellipse(-1, 1, 7, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = angry ? '#ffb04a' : '#58d458'; ctx.fillRect(2, -5, 7, 6);
    ctx.fillStyle = '#ff6a2a'; ctx.fillRect(-7, -6, 3, 3); ctx.fillRect(-3, -7, 3, 3);
    eye(3, -4); ctx.fillStyle = '#ffe14a'; ctx.fillRect(9, -3, 2, 2);
    ctx.fillStyle = '#e8c83a'; ctx.fillRect(-5, 6, 3, 2); ctx.fillRect(1, 6, 3, 2);
  } else if (kind === 'drunk') {                                                                            // 드렁크: 병을 던지는 술꾼
    ctx.fillStyle = angry ? '#e84a3a' : '#e8a03a'; ctx.fillRect(-6, -2, 12, 9);
    ctx.fillStyle = '#ffd0a0'; ctx.fillRect(-5, -8, 10, 7); eye(1, -6);
    ctx.fillStyle = '#e8453a'; ctx.fillRect(4, -3, 3, 2);
    ctx.fillStyle = '#3ab43a'; ctx.fillRect(6, -2, 3, 6); ctx.fillStyle = '#7ad87a'; ctx.fillRect(7, -5, 1, 3);
  } else if (kind === 'invader') {                                                                          // 인베이더: 오락실 침략자 모양
    ctx.fillStyle = angry ? '#ff6a6a' : '#6af26a';
    const rows = ['..#....#..', '...#..#...', '..######..', '.##.##.##.', '##########', '#.######.#', '#.#....#.#', '...##.##..'];
    rows.forEach((row, ry) => { for (let rx = 0; rx < 10; rx++) if (row[rx] === '#') ctx.fillRect(-7 + rx * 1.4, -6 + ry * 1.6, 1.5, 1.7); });
    ctx.fillStyle = '#111'; ctx.fillRect(-3, -1, 2, 2); ctx.fillRect(2, -1, 2, 2);
  }
  ctx.restore();
}
function drawShots() {
  for (const sh of G.shots || []) {
    const x = sh.x, y = HUD + sh.y;
    if (sh.kind === 'rock') { ctx.fillStyle = '#8a8a96'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill(); ctx.fillStyle = '#b4b4c0'; ctx.fillRect(x - 2, y - 3, 2, 2); }
    else if (sh.kind === 'fire') { ctx.fillStyle = Math.floor(clock * 14) % 2 ? '#ff6a2a' : '#ffc02a'; ctx.beginPath(); ctx.moveTo(x + (sh.vx > 0 ? 5 : -5), y); ctx.lineTo(x - (sh.vx > 0 ? 5 : -5), y - 4); ctx.lineTo(x - (sh.vx > 0 ? 5 : -5), y + 4); ctx.closePath(); ctx.fill(); }
    else if (sh.kind === 'bottle') { ctx.save(); ctx.translate(x, y); ctx.rotate(clock * 12); ctx.fillStyle = '#3ab43a'; ctx.fillRect(-2, -5, 4, 10); ctx.fillStyle = '#7ad87a'; ctx.fillRect(-1, -7, 2, 3); ctx.restore(); }
    else if (sh.kind === 'laser') { ctx.fillStyle = '#ff4a4a'; ctx.fillRect(x - 1, y - 5, 2, 10); ctx.fillStyle = '#fff'; ctx.fillRect(x - 0.5, y - 5, 1, 10); }
  }
}
function drawEnemies() {
  for (const e of G.enemies) {
    if (e.prot > 0 && Math.floor(clock * 16) % 2 === 0) continue;
    drawEnemyBody(e.kind, e.x + e.w / 2, HUD + e.y + e.h / 2, e.angry, e.anim, e.dir >= 0 ? 1 : -1);
  }
  if (G.baron) {
    const b = G.baron, cx = b.x + 9, cy = HUD + b.y + 8;
    ctx.fillStyle = '#2f5ad8'; ctx.beginPath(); ctx.ellipse(cx, cy, 11, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#9ac0ff'; ctx.beginPath(); ctx.ellipse(cx + 1, cy + 3, 8, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(cx + 2, cy - 5, 5, 5); ctx.fillStyle = '#111'; ctx.fillRect(cx + 4, cy - 4, 2, 3);
    ctx.fillStyle = '#2f5ad8'; ctx.fillRect(cx - 14, cy - 2 + Math.floor(clock * 6) % 2, 5, 4);
  }
}
function drawBubbles() {
  for (const b of G.bubbles) {
    const cx = b.x, cy = HUD + b.y;
    const warn = b.enemy && b.life < 2 && Math.floor(clock * 8) % 2 === 0;
    const wob = 1 + 0.04 * Math.sin(clock * 6 + b.id);
    ctx.fillStyle = b.enemy ? (warn ? 'rgba(255,120,110,.55)' : 'rgba(150,230,255,.4)') : 'rgba(170,240,255,.28)';
    ctx.beginPath(); ctx.ellipse(cx, cy, b.r * wob, b.r / wob, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = warn ? '#ff8a7a' : '#d8f8ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy, b.r * wob - 0.5, b.r / wob - 0.5, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(cx - 4, cy - 5, 3, 2); ctx.fillRect(cx - 5, cy - 3, 2, 2);
    if (b.enemy) drawEnemyBody(b.enemy.kind, cx, cy, warn || b.enemy.angry, clock, 1, 0.75);
    if (b.letter !== undefined) { ctx.fillStyle = '#ffe14a'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(L.EXTEND_LETTERS[b.letter], cx, cy + 1); }
    if (b.special) {
      const col = { water: '#4a9aff', lightning: '#ffe14a', fire: '#ff6a3a' }[b.special];
      ctx.fillStyle = col; ctx.beginPath();
      if (b.special === 'water') { ctx.moveTo(cx, cy - 6); ctx.quadraticCurveTo(cx + 6, cy + 2, cx, cy + 6); ctx.quadraticCurveTo(cx - 6, cy + 2, cx, cy - 6); }
      else if (b.special === 'lightning') { ctx.moveTo(cx + 1, cy - 7); ctx.lineTo(cx - 4, cy + 1); ctx.lineTo(cx, cy + 1); ctx.lineTo(cx - 1, cy + 7); ctx.lineTo(cx + 4, cy - 2); ctx.lineTo(cx, cy - 2); }
      else { ctx.moveTo(cx, cy - 7); ctx.quadraticCurveTo(cx + 7, cy, cx + 2, cy + 6); ctx.lineTo(cx - 3, cy + 6); ctx.quadraticCurveTo(cx - 7, cy + 1, cx - 1, cy - 3); }
      ctx.fill();
    }
  }
}
const FRUIT_EMOJI = { cherry: '🍒', orange: '🍊', banana: '🍌', apple: '🍎', grape: '🍇', melon: '🍈', star: '⭐' };
function drawItems() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '10px sans-serif';
  for (const it of G.items) {
    if (it.age > 10 && Math.floor(clock * 8) % 2 === 0) continue;
    const cx = it.x + it.w / 2, cy = HUD + it.y + it.h / 2;
    if (it.kind === 'fruit') ctx.fillText(FRUIT_EMOJI[it.type], cx, cy);
    else if (it.kind === 'diamond') {
      ctx.fillStyle = { water: '#4a9aff', lightning: '#ffe14a', fire: '#ff5a3a' }[it.type]; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx - 5, cy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(cx - 2, cy - 3, 2, 3);
    } else if (it.type === 'speed') {
      ctx.fillStyle = '#e8453a'; ctx.fillRect(cx - 5, cy - 1, 10, 5); ctx.fillStyle = '#fff'; ctx.fillRect(cx - 5, cy + 3, 10, 1); ctx.fillRect(cx - 5, cy - 4, 4, 3);
    } else {
      ctx.fillStyle = it.type === 'rate' ? '#ffe14a' : '#4a9aff'; ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - 4, cy - 1, 8, 2);
    }
  }
}
function drawEffects() {
  for (const f of G.effects) {
    const x = f.x, y = HUD + f.y;
    if (f.kind === 'bolt') {
      ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.ox, y);
      const steps = 10; for (let i = 1; i <= steps; i++) ctx.lineTo(f.ox + (x - f.ox) * i / steps, y + (i % 2 ? -3 : 3));
      ctx.stroke();
    } else if (f.type === 'water') {
      ctx.fillStyle = '#4a9aff'; ctx.fillRect(x - 4, y - 1, 8, 7); ctx.fillStyle = '#9ad0ff'; ctx.fillRect(x - 3, y - 1, 6, 2);
    } else {
      ctx.fillStyle = Math.floor(clock * 14) % 2 ? '#ff5a2a' : '#ffb02a'; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y + 6); ctx.lineTo(x - 5, y + 6); ctx.closePath(); ctx.fill();
    }
  }
}
function drawFx() {
  for (const f of fxs) {
    const k = f.t / f.life, x = f.x, y = HUD + f.y;
    if (f.kind === 'ring') { ctx.strokeStyle = f.red ? `rgba(255,120,100,${1 - k})` : `rgba(200,250,255,${1 - k})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 6 + k * 14, 0, 7); ctx.stroke(); }
    else if (f.kind === 'spark') { ctx.fillStyle = `rgba(255,230,90,${1 - k})`; ctx.fillRect(x + Math.cos(f.a) * k * 22 - 1, y + Math.sin(f.a) * k * 22 - 1, 3, 3); }
    else if (f.kind === 'text') { ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = f.color || '#fff'; ctx.fillText(f.text, x, y - k * 12); }
  }
}
function drawHud() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, HUD);
  ctx.textBaseline = 'middle'; ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'left'; ctx.fillStyle = '#6ee86e'; ctx.fillText('1UP', 4, 8); ctx.fillStyle = '#fff'; ctx.fillText(String(G.score), 24, 8);
  ctx.textAlign = 'center'; ctx.fillStyle = '#ff6a6a'; ctx.fillText('HI', 112, 8); ctx.fillStyle = '#fff'; ctx.fillText(String(Math.max(best, G.score)), 134, 8);
  ctx.textAlign = 'right'; ctx.fillStyle = '#ffe14a'; ctx.fillText(`R${G.level}`, W - 52, 8);
  for (let i = 0; i < Math.max(0, G.lives - (G.player.alive ? 1 : 0)); i++) {
    ctx.fillStyle = '#3ac84a'; ctx.beginPath(); ctx.arc(8 + i * 11, H + HUD - 7, 4, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(9 + i * 11, H + HUD - 9, 2, 2);
  }
  // 사탕으로 얻은 힘
  const m = G.mods;
  let x = W - 20;
  for (const [k, c] of [['speed', '#e8453a'], ['rate', '#ffe14a'], ['range', '#4a9aff']]) for (let i = 0; i < m[k]; i++) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, H + HUD - 7, 3.5, 0, 7); ctx.fill(); x -= 9; }
  // EXTEND 글자: 모은 것은 밝게
  ctx.textAlign = 'center'; ctx.font = 'bold 9px sans-serif';
  for (let i = 0; i < 6; i++) { ctx.fillStyle = G.extend[i] ? '#ffe14a' : 'rgba(255,255,255,.28)'; ctx.fillText(L.EXTEND_LETTERS[i], W / 2 - 25 + i * 10, H + HUD - 7); }
}
function draw() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, CH);
  drawTiles();
  drawItems();
  drawBubbles();
  drawEnemies();
  drawPlayer();
  drawShots();
  drawEffects();
  drawFx();
  drawHud();
  if (banner.t > 0) {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, HUD + H / 2 - 26, W, banner.sub ? 38 : 24);
    ctx.fillStyle = banner.color; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(banner.text, W / 2, HUD + H / 2 - 15);
    if (banner.sub) { ctx.font = 'bold 9px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(banner.sub, W / 2, HUD + H / 2 + 1); }
  }
}

let last = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - (last || ts)) / 1000);
  last = ts;
  lastDx = readDxPreview();
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
function readDxPreview() { let d = padDx; for (const k of held) d += MOVE_KEYS[k] || 0; return d; }

addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function toggleMute() {
  muted = !muted;
  store.set('bubbleMuted', muted ? '1' : '0');
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
}
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('pauseBtn').onclick = (e) => { e.currentTarget.blur(); state === 'paused' ? resume() : pause(); };
$('startBtn').onclick = onOverlayButton;
$('muteBtn').textContent = muted ? '🔇' : '🔊';

fit();
requestAnimationFrame(frame);
