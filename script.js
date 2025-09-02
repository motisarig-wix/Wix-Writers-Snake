const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const overlay = document.getElementById('overlay');
const restartBtn = document.getElementById('restartBtn');

// Inline synthesized beeps will be used; external random SFX removed
const wrapEl = document.querySelector('.wrap');

// Grid config
const tileSize = 12;
const gridSize = canvas.width / tileSize;
const RESERVED_TOP_ROWS = 3; // keep top rows free for HUD text

// Colors
const COLOR_BG = '#203b15';
const COLOR_SNAKE = '#c8fda0';
const COLOR_FOOD = '#d2aa34';

let snake, dir, food;
let pendingDir = null;
let restartUnlockAt = 0; // timestamp after which restart is allowed

// Score & timer (persist across deaths until round ends)
let roundScore = 0;
let roundEndAt = 0; // timestamp when 90s ends
let roundTimerInterval = null;

// Dynamic speed management
const BASE_TICK_MS = Math.round(150 * 1.3); // ~30% slower base speed
const MIN_TICK_MS = 70;   // safety cap
let tickMs = BASE_TICK_MS;
let tickTimer = null;

function startLoop() { if (tickTimer) clearInterval(tickTimer); tickTimer = setInterval(() => { applyPendingDir(); tick(); }, tickMs); }

function startRound(){
	// 90 seconds = 1.5 minutes
	roundEndAt = Date.now() + 90_000;
	roundScore = 0;
	updateScore();
	updateTimer();
	if (roundTimerInterval) clearInterval(roundTimerInterval);
	roundTimerInterval = setInterval(updateTimer, 250);
	// Hide overlay and start first life
	overlay.classList.add('hidden');
	overlay.classList.remove('matrix');
	initGame();
}

function formatTime(ms){ const s = Math.max(0, Math.ceil(ms/1000)); const mm = String(Math.floor(s/60)).padStart(2,'0'); const ss = String(s%60).padStart(2,'0'); return `${mm}:${ss}`; }
function updateTimer(){ const remain = Math.max(0, roundEndAt - Date.now()); if (timerEl) timerEl.textContent = `Time: ${formatTime(remain)}`; if (remain <= 0) endRound(); }
function updateScore(){ if (scoreEl) scoreEl.textContent = `Score: ${roundScore}`; }

function initGame() {
	snake = [ {x: 8, y: 10}, {x: 7, y: 10}, {x: 6, y: 10} ];
	dir = {x: 1, y: 0};
	food = spawnFood();
	pendingDir = null;
	restartUnlockAt = 0;
	tickMs = BASE_TICK_MS; // reset speed per life
	startLoop();
	draw();
}

function spawnFood() {
	let f;
	do {
		const x = Math.floor(Math.random() * gridSize);
		const y = Math.floor(RESERVED_TOP_ROWS + Math.random() * (gridSize - RESERVED_TOP_ROWS));
		f = { x, y };
	} while (snake.some(seg => seg.x === f.x && seg.y === f.y));
	return f;
}

function tick() {
	// If round time finished, pause gameplay
	if (Date.now() >= roundEndAt) return;
	let headX = snake[0].x + dir.x;
	let headY = snake[0].y + dir.y;
	// Wrap-around (toroidal): if out of bounds, wrap to opposite side
	if (headX < 0) headX = gridSize - 1;
	else if (headX >= gridSize) headX = 0;
	if (headY < 0) headY = gridSize - 1;
	else if (headY >= gridSize) headY = 0;
	const head = { x: headX, y: headY };
	// Self-collision still restarts life
	if (snake.some(seg => seg.x === head.x && seg.y === head.y)) return onCrash();
	snake.unshift(head);
	if (head.x === food.x && head.y === food.y) {
		roundScore += 1; updateScore();
		playEat();
		flashEat();
		food = spawnFood();
		// Increase speed by 0.5% (reduce interval), apply immediately
		tickMs = Math.max(MIN_TICK_MS, Math.round(tickMs * 0.995));
		startLoop();
	} else { snake.pop(); }
	draw();
}

function draw() { ctx.fillStyle = COLOR_BG; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = '#2f4d1f'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2); drawCell(food.x, food.y, COLOR_FOOD); snake.forEach(seg => drawCell(seg.x, seg.y, COLOR_SNAKE)); }
function drawCell(x, y, color) { ctx.fillStyle = color; ctx.fillRect(x * tileSize, y * tileSize, tileSize - 1, tileSize - 1); }

// Controls & audio unlock
window.addEventListener('keydown', onKeyDown);
['pointerdown','touchstart','mousedown'].forEach(evt => window.addEventListener(evt, resumeAudioContext, { once: true }));

function onKeyDown(e){
	resumeAudioContext();
	if (Date.now() >= roundEndAt) { // if round over, allow restart via button or key
		return;
	}
	switch (e.key) {
		case 'ArrowUp': if (dir.y !== 1) pendingDir = {x:0,y:-1}; break;
		case 'ArrowDown': if (dir.y !== -1) pendingDir = {x:0,y:1}; break;
		case 'ArrowLeft': if (dir.x !== 1) pendingDir = {x:-1,y:0}; break;
		case 'ArrowRight': if (dir.x !== -1) pendingDir = {x:1,y:0}; break;
	}
}

// Map numeric keypad buttons
const dirMap = { up: {x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
document.querySelectorAll('.dir-btn').forEach(btn => { btn.addEventListener('click', () => { resumeAudioContext(); if (Date.now() >= roundEndAt) { return; } const d = dirMap[btn.dataset.dir]; if (!d) return; if ((d.x === 0 && dir.y !== -d.y) || (d.y === 0 && dir.x !== -d.x)) pendingDir = d; }); });

function applyPendingDir() { if (pendingDir) { dir = pendingDir; pendingDir = null; } }

function onCrash(){
	flashCrash();
	playCrash();
	// Immediately start a new life without showing overlay
	initGame();
}

function endRound(){
	// Stop timers
	if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
	if (roundTimerInterval) { clearInterval(roundTimerInterval); roundTimerInterval = null; }
	// Show overlay with final score only
	const title = "Time's Up";
	const h2 = overlay.querySelector('h2');
	if (h2) {
		const spans = Array.from(title).map((ch, i) => `<span style=\"--i:${i}\">${ch}</span>`).join('');
		h2.innerHTML = spans;
	}
	const info = document.getElementById('overlay-info');
	if (info) info.textContent = `Score: ${roundScore}`;
	overlay.classList.add('matrix');
	overlay.classList.remove('hidden');
}

restartBtn.addEventListener('click', () => { resumeAudioContext(); startRound(); });

// ---------- Sound helpers ----------
let audioCtx;
function resumeAudioContext(){ try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch {} }
function beep(freq = 640, dur = 0.08, gainValue = 0.08) { resumeAudioContext(); if (!audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); const now = audioCtx.currentTime; o.type = 'square'; o.frequency.setValueAtTime(freq, now); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(gainValue, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + dur); o.connect(g); g.connect(audioCtx.destination); o.start(now); o.stop(now + dur); }

function playEat(){ beep(880, 0.06, 0.03); }
function playCrash(){ beep(180, 0.18, 0.04); }

function flashEat(){ if (!wrapEl) return; wrapEl.classList.remove('eat-flash'); void wrapEl.offsetWidth; wrapEl.classList.add('eat-flash'); setTimeout(()=>wrapEl.classList.remove('eat-flash'), 500); }
function flashCrash(){ if (!wrapEl) return; wrapEl.classList.remove('crash-flash'); void wrapEl.offsetWidth; wrapEl.classList.add('crash-flash'); setTimeout(()=>wrapEl.classList.remove('crash-flash'), 500); }

// Start first round
startRound(); 