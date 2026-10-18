(() => {
    'use strict';

    const LEVELS = window.DINO_NEST_LEVELS;
    const DIRS = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
    const ANGLE = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 };
    const MOVE_MS = 120;
    const HATCH_MS = 1500;
    const TAU = Math.PI * 2;

    // The island keeps its own palette in both themes
    const PAL = {
        sandA: '#f3d9a4',
        sandB: '#ecd096',
        shore: '#c9a466',
        rock: '#8b7d6b',
        rockTop: '#a8998a',
        rockDark: '#5f5446',
        fern: '#4f9a3a',
        water: '#4fb3d9',
        waterDeep: '#2a86b3',
        mud: '#c49a5c',
        nest: '#a8743a',
        nestLight: '#d9a35a',
        egg: '#fffaf0',
        eggSpot: '#5cc24a',
        eggShade: '#e8dcc4',
        boulder: '#9aa0a6',
        boulderTop: '#c4c9ce',
        dino: '#63c74d',
        dinoDark: '#2f6f2a',
        spike: '#e8475b',
        boot: '#ff9a3c',
        gold: '#f5b82e',
        warn: '#e8475b',
    };

    const $ = id => document.getElementById(id);
    const canvas = $('board');
    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- Storage (per-viewer progress) ---
    function load(key, fallback) {
        try {
            const v = localStorage.getItem(key);
            return v === null ? fallback : JSON.parse(v);
        } catch (e) { return fallback; }
    }
    function save(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    }
    const progress = Object.assign({ best: {}, last: 0 }, load('dino-nest-progress', {}));
    let muted = load('dino-nest-muted', false);

    // --- Audio ---
    let actx = null;
    function ensureAudio() {
        if (!actx) {
            try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
        }
        if (actx && actx.state === 'suspended') actx.resume();
    }
    function tone(f0, f1, dur, type = 'sine', vol = 0.1, delay = 0) {
        if (!actx || muted) return;
        const t = actx.currentTime + delay;
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(actx.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
    }
    const sfx = {
        step: () => tone(520, 480, 0.04, 'triangle', 0.04),
        push: () => tone(180, 120, 0.09, 'square', 0.05),
        bump: () => tone(120, 90, 0.07, 'sine', 0.08),
        nest: () => { tone(660, 990, 0.12, 'sine', 0.1); tone(990, 1320, 0.14, 'sine', 0.07, 0.07); },
        splash: () => { tone(400, 90, 0.3, 'sine', 0.12); tone(900, 300, 0.15, 'triangle', 0.04, 0.02); },
        undo: () => tone(700, 440, 0.07, 'triangle', 0.05),
        clear: () => [0, 4, 7, 12, 16].forEach((s, i) => tone(523 * 2 ** (s / 12), 523 * 2 ** (s / 12) * 1.01, 0.18, 'triangle', 0.09, i * 0.09)),
    };

    // --- Level parsing ---
    function parseLevel(index) {
        const def = LEVELS[index];
        const h = def.map.length;
        const w = Math.max(...def.map.map(r => r.length));
        const base = new Array(w * h).fill('void');
        const nests = new Set();
        const water = new Set();
        const pieces = [];
        let player = 0;
        for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
                const ch = def.map[r][c] || ' ';
                const i = r * w + c;
                if (ch === '#') { base[i] = 'wall'; continue; }
                if (ch === ' ') continue;
                base[i] = 'floor';
                if ('n+E'.includes(ch)) nests.add(i);
                if ('eE'.includes(ch)) pieces.push({ id: pieces.length, kind: 'egg', i, alive: true });
                if (ch === 'b') pieces.push({ id: pieces.length, kind: 'boulder', i, alive: true });
                if (ch === 'w') water.add(i);
                if ('@+'.includes(ch)) player = i;
            }
        }
        const lvl = { index, def, w, h, base, nests };
        lvl.live = liveCells(lvl);
        return { lvl, state: { player, dir: 'R', pieces, water, filled: new Set(), moves: 0 } };
    }

    function stepIndex(lvl, i, dir) {
        const r = Math.floor(i / lvl.w) + DIRS[dir][0];
        const c = (i % lvl.w) + DIRS[dir][1];
        if (r < 0 || c < 0 || r >= lvl.h || c >= lvl.w) return -1;
        return r * lvl.w + c;
    }

    // Cells from which an egg could still be pushed onto some nest (ignoring other pieces)
    function liveCells(lvl) {
        const live = new Set(lvl.nests);
        const queue = [...lvl.nests];
        while (queue.length) {
            const i = queue.shift();
            for (const d of 'UDLR') {
                const a = stepIndex(lvl, i, d);
                const b = a < 0 ? -1 : stepIndex(lvl, a, d);
                if (a < 0 || b < 0 || live.has(a)) continue;
                if (lvl.base[a] === 'floor' && lvl.base[b] === 'floor') {
                    live.add(a);
                    queue.push(a);
                }
            }
        }
        return live;
    }

    // --- Game state ---
    let L, S;
    let history = [];
    let anim = null;
    let won = false, wonAt = 0;
    let particles = [];
    let hintDir = null, hintUntil = 0;
    let toastTimer = 0;
    let clearTimer = 0;

    const pieceAt = i => S.pieces.find(p => p.alive && p.i === i);
    const eggs = () => S.pieces.filter(p => p.kind === 'egg');

    function snapshot() {
        return {
            player: S.player, dir: S.dir, moves: S.moves,
            pieces: S.pieces.map(p => ({ ...p })),
            water: [...S.water], filled: [...S.filled],
        };
    }
    function restore(snap) {
        S = {
            player: snap.player, dir: snap.dir, moves: snap.moves,
            pieces: snap.pieces.map(p => ({ ...p })),
            water: new Set(snap.water), filled: new Set(snap.filled),
        };
    }

    function loadLevel(index) {
        index = Math.max(0, Math.min(LEVELS.length - 1, index));
        const parsed = parseLevel(index);
        L = parsed.lvl;
        S = parsed.state;
        history = [];
        anim = null;
        won = false;
        particles = [];
        hintDir = null;
        clearTimeout(clearTimer);
        $('clearOv').hidden = true;
        progress.last = index;
        save('dino-nest-progress', progress);

        const tip = $('tip');
        tip.hidden = !L.def.tip;
        tip.textContent = L.def.tip || '';
        hideToast();
        layout();
        updateHUD();
    }

    // --- Moves ---
    function move(dir) {
        if (won || !menuClosed()) return;
        ensureAudio();
        anim = null;
        hintDir = null;

        const t = stepIndex(L, S.player, dir);
        if (t < 0 || L.base[t] !== 'floor' || S.water.has(t)) return bump(dir);

        const piece = pieceAt(t);
        let pushed = null, sank = false;
        if (piece) {
            const u = stepIndex(L, t, dir);
            if (u < 0 || L.base[u] !== 'floor' || pieceAt(u)) return bump(dir);
            if (piece.kind === 'egg' && S.water.has(u)) {
                showToast('タマゴは水に入れません');
                return bump(dir);
            }
            history.push(snapshot());
            pushed = { id: piece.id, from: t, to: u };
            piece.i = u;
            if (piece.kind === 'boulder' && S.water.has(u)) {
                S.water.delete(u);
                S.filled.add(u);
                piece.alive = false;
                sank = true;
            }
        } else {
            history.push(snapshot());
        }

        const from = S.player;
        S.dir = dir;
        S.player = t;
        S.moves++;
        anim = { t0: performance.now(), player: { from, to: t }, pushed, sink: sank ? piece.id : null, bump: null };

        if (sank) {
            sfx.splash();
            const [x, y] = cellCenter(pushed.to);
            burst(x, y, 16, '#bfe9ff', 0.9);
        } else if (pushed) {
            sfx.push();
            const [x, y] = cellCenter(pushed.from);
            burst(x, y, 5, '#e2c48a', 0.4);
        } else {
            sfx.step();
        }

        if (pushed && piece.kind === 'egg') {
            if (L.nests.has(pushed.to)) {
                sfx.nest();
                const [x, y] = cellCenter(pushed.to);
                burst(x, y, 14, PAL.gold, 0.7);
            } else if (!L.live.has(pushed.to)) {
                showToast('このタマゴはもう巣に戻せません。Z で戻そう', 3200);
            }
        }

        if (L.def.tip && S.moves >= 2) $('tip').hidden = true;
        updateHUD();
        if (eggs().every(e => L.nests.has(e.i))) win();
    }

    function bump(dir) {
        S.dir = dir;
        anim = { t0: performance.now(), player: { from: S.player, to: S.player }, pushed: null, sink: null, bump: dir };
        sfx.bump();
    }

    function undo() {
        if (!history.length || !menuClosed()) return;
        if (won) {
            won = false;
            clearTimeout(clearTimer);
            $('clearOv').hidden = true;
        }
        restore(history.pop());
        anim = null;
        hintDir = null;
        sfx.undo();
        updateHUD();
    }

    function resetLevel() {
        if (!menuClosed()) return;
        loadLevel(L.index);
        $('tip').hidden = true;
    }

    // --- Winning ---
    function starsFor(moves, par) {
        if (moves <= par) return 3;
        if (moves <= par + Math.max(4, Math.round(par * 0.3))) return 2;
        return 1;
    }

    function win() {
        won = true;
        wonAt = performance.now();
        hintDir = null;
        const prev = progress.best[L.index];
        if (prev === undefined || S.moves < prev) progress.best[L.index] = S.moves;
        save('dino-nest-progress', progress);
        setTimeout(sfx.clear, 600);
        clearTimer = setTimeout(showClear, reduceMotion ? 500 : HATCH_MS);
    }

    function showClear() {
        const stars = starsFor(S.moves, L.def.par);
        $('clearStars').innerHTML = [1, 2, 3].map(n => `<span class="${n <= stars ? 'on' : ''}">★</span>`).join('');
        const diff = S.moves - L.def.par;
        $('clearText').textContent = diff <= 0
            ? `${S.moves} 手。最短手順でクリア！`
            : `${S.moves} 手でクリア（最短は ${L.def.par} 手）`;
        const last = L.index === LEVELS.length - 1;
        $('nextBtn').textContent = last ? 'レベル一覧へ' : '次のレベルへ';
        $('clearOv').hidden = false;
        $('nextBtn').focus();
    }

    function nextLevel() {
        if (L.index === LEVELS.length - 1) {
            $('clearOv').hidden = true;
            openMenu();
        } else {
            loadLevel(L.index + 1);
        }
    }

    // --- Hint (breadth-first search from the current position) ---
    function solveNext(limit = 700000) {
        const eggCells = eggs().map(e => e.i).sort((a, b) => a - b);
        if (eggCells.some(i => !L.live.has(i))) return null;
        const bould = S.pieces.filter(p => p.alive && p.kind === 'boulder').map(p => p.i).sort((a, b) => a - b);
        const water = [...S.water].sort((a, b) => a - b);
        const key = (p, e, b, w) => p + '|' + e.join(',') + '|' + b.join(',') + '|' + w.join(',');

        const seen = new Set([key(S.player, eggCells, bould, water)]);
        let frontier = [{ p: S.player, e: eggCells, b: bould, w: water, first: null }];
        while (frontier.length) {
            const next = [];
            for (const s of frontier) {
                for (const d of 'UDLR') {
                    const t = stepIndex(L, s.p, d);
                    if (t < 0 || L.base[t] !== 'floor' || s.w.includes(t)) continue;
                    let e = s.e, b = s.b, w = s.w;
                    const ei = e.indexOf(t), bi = b.indexOf(t);
                    if (ei >= 0 || bi >= 0) {
                        const u = stepIndex(L, t, d);
                        if (u < 0 || L.base[u] !== 'floor' || e.includes(u) || b.includes(u)) continue;
                        if (ei >= 0) {
                            if (w.includes(u) || !L.live.has(u)) continue;
                            e = e.slice();
                            e[ei] = u;
                            e.sort((x, y) => x - y);
                        } else {
                            b = b.slice();
                            if (w.includes(u)) {
                                b.splice(bi, 1);
                                w = w.filter(x => x !== u);
                            } else {
                                b[bi] = u;
                                b.sort((x, y) => x - y);
                            }
                        }
                    }
                    const k = key(t, e, b, w);
                    if (seen.has(k)) continue;
                    seen.add(k);
                    const first = s.first || d;
                    if (e.every(i => L.nests.has(i))) return first;
                    if (seen.size > limit) return 'LIMIT';
                    next.push({ p: t, e, b, w, first });
                }
            }
            frontier = next;
        }
        return null;
    }

    function hint() {
        if (won || !menuClosed()) return;
        showToast('考え中…', 10000);
        setTimeout(() => {
            const d = solveNext();
            if (d === null) showToast('この状態からは解けません。Z で戻してみよう', 3200);
            else if (d === 'LIMIT') showToast('ヒントが見つかりませんでした。やり直してみよう', 3200);
            else {
                hideToast();
                hintDir = d;
                hintUntil = performance.now() + 2500;
            }
        }, 30);
    }

    // --- HUD & overlays ---
    function updateHUD() {
        $('lvNum').textContent = `LEVEL ${L.index + 1}`;
        $('lvName').textContent = L.def.name;
        $('moves').textContent = S.moves;
        $('par').textContent = L.def.par;
        $('moves').parentElement.classList.toggle('over', S.moves > L.def.par);
        $('undoBtn').disabled = history.length === 0;
    }

    function showToast(text, ms = 2200) {
        const el = $('toast');
        el.textContent = text;
        el.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideToast, ms);
    }
    function hideToast() {
        clearTimeout(toastTimer);
        $('toast').hidden = true;
    }

    const unlocked = i => i === 0 || progress.best[i - 1] !== undefined || progress.best[i] !== undefined;
    const menuClosed = () => $('menuOv').hidden;

    function openMenu() {
        const grid = $('levelGrid');
        grid.innerHTML = '';
        let total = 0;
        LEVELS.forEach((def, i) => {
            const best = progress.best[i];
            const stars = best === undefined ? 0 : starsFor(best, def.par);
            total += stars;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lvl' + (i === L.index ? ' current' : '') + (best !== undefined ? ' cleared' : '');
            btn.disabled = !unlocked(i);
            btn.innerHTML = `<span class="n">${i + 1}</span><span class="nm"></span><span class="st">${'<i>★</i>'.repeat(stars)}${'★'.repeat(3 - stars)}</span>`;
            btn.querySelector('.nm').textContent = btn.disabled ? 'まだ遊べません' : def.name;
            btn.addEventListener('click', () => {
                closeMenu();
                loadLevel(i);
            });
            grid.appendChild(btn);
        });
        $('starTotal').textContent = total;
        $('starMax').textContent = LEVELS.length * 3;
        $('menuOv').hidden = false;
        const current = grid.querySelector('.current') || grid.querySelector('button');
        if (current) current.focus();
    }
    function closeMenu() {
        $('menuOv').hidden = true;
    }

    function renderMuteIcon() {
        $('muteBtn').innerHTML = muted
            ? '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3 7h3l4-4v14l-4-4H3z"/><path d="M13 7l5 6M18 7l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
            : '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3 7h3l4-4v14l-4-4H3z"/><path d="M13 6.5a5 5 0 0 1 0 7M15.5 4a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        $('muteBtn').setAttribute('aria-pressed', String(muted));
    }

    // --- Layout ---
    let dpr = 1, cssW = 0, cssH = 0, tile = 48, ox = 0, oy = 0;
    function layout() {
        const rect = canvas.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        cssW = rect.width;
        cssH = rect.height;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        if (!L) return;
        const reserve = $('tip').hidden ? 0 : 54;
        const pad = 10;
        tile = Math.floor(Math.min((cssW - pad * 2) / L.w, (cssH - reserve - pad * 2) / L.h, 76));
        tile = Math.max(tile, 16);
        ox = Math.round((cssW - tile * L.w) / 2);
        oy = Math.round((cssH - reserve - tile * L.h) / 2);
    }

    function cellCenter(i) {
        return [ox + (i % L.w + 0.5) * tile, oy + (Math.floor(i / L.w) + 0.5) * tile];
    }

    // --- Drawing ---
    const ease = t => 1 - (1 - t) * (1 - t);
    const hash = i => ((i * 2654435761) >>> 0) % 1000 / 1000;

    function lerpCell(from, to, k) {
        const [x0, y0] = cellCenter(from);
        const [x1, y1] = cellCenter(to);
        return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function isFloor(r, c) {
        return r >= 0 && c >= 0 && r < L.h && c < L.w && L.base[r * L.w + c] === 'floor';
    }

    function drawTerrain(now) {
        const s = tile;
        // Shoreline under the sand
        ctx.fillStyle = PAL.shore;
        for (let i = 0; i < L.base.length; i++) {
            if (L.base[i] !== 'floor') continue;
            const x = ox + (i % L.w) * s, y = oy + Math.floor(i / L.w) * s;
            roundRect(x - 4, y - 2, s + 8, s + 8, s * 0.3);
            ctx.fill();
        }
        // Sand
        for (let i = 0; i < L.base.length; i++) {
            if (L.base[i] !== 'floor') continue;
            const r = Math.floor(i / L.w), c = i % L.w;
            const x = ox + c * s, y = oy + r * s;
            ctx.fillStyle = (r + c) % 2 ? PAL.sandA : PAL.sandB;
            ctx.fillRect(x, y, s, s);
        }
        // Rocks bordering the sand
        for (let i = 0; i < L.base.length; i++) {
            if (L.base[i] !== 'wall') continue;
            const r = Math.floor(i / L.w), c = i % L.w;
            let near = false;
            for (let dr = -1; dr <= 1 && !near; dr++) {
                for (let dc = -1; dc <= 1; dc++) if (isFloor(r + dr, c + dc)) { near = true; break; }
            }
            if (!near) continue;
            const x = ox + c * s, y = oy + r * s;
            const h = hash(i);
            ctx.fillStyle = PAL.rockDark;
            roundRect(x + 2, y + 4, s - 4, s - 4, s * 0.28);
            ctx.fill();
            ctx.fillStyle = PAL.rock;
            roundRect(x + 2, y + 1, s - 4, s - 6, s * 0.28);
            ctx.fill();
            ctx.fillStyle = PAL.rockTop;
            roundRect(x + s * 0.18, y + s * 0.12, s * 0.5, s * 0.22, s * 0.11);
            ctx.fill();
            if (h > 0.62) {
                ctx.fillStyle = PAL.fern;
                for (let k = 0; k < 3; k++) {
                    ctx.beginPath();
                    ctx.ellipse(x + s * (0.62 + k * 0.08), y + s * 0.62, s * 0.06, s * 0.2, -0.5 + k * 0.5, 0, TAU);
                    ctx.fill();
                }
            }
        }
        // Filled ponds, water, nests
        for (const i of S.filled) {
            const [x, y] = cellCenter(i);
            ctx.fillStyle = PAL.mud;
            ctx.beginPath();
            ctx.ellipse(x, y, s * 0.42, s * 0.36, 0, 0, TAU);
            ctx.fill();
        }
        for (const i of S.water) {
            const x = ox + (i % L.w) * s, y = oy + Math.floor(i / L.w) * s;
            ctx.fillStyle = PAL.waterDeep;
            roundRect(x + 2, y + 2, s - 4, s - 4, s * 0.3);
            ctx.fill();
            ctx.fillStyle = PAL.water;
            roundRect(x + 4, y + 4, s - 8, s - 10, s * 0.26);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.lineWidth = Math.max(1.5, s * 0.04);
            const ph = reduceMotion ? 0 : now / 600 + i;
            for (let k = 0; k < 2; k++) {
                const yy = y + s * (0.38 + k * 0.24) + Math.sin(ph + k) * s * 0.03;
                ctx.beginPath();
                ctx.moveTo(x + s * 0.25, yy);
                ctx.quadraticCurveTo(x + s * 0.4, yy - s * 0.06, x + s * 0.55, yy);
                ctx.stroke();
            }
        }
        for (const i of L.nests) {
            const [x, y] = cellCenter(i);
            ctx.lineWidth = s * 0.11;
            ctx.strokeStyle = PAL.nest;
            ctx.beginPath();
            ctx.ellipse(x, y + s * 0.04, s * 0.34, s * 0.3, 0, 0, TAU);
            ctx.stroke();
            ctx.lineWidth = Math.max(1, s * 0.03);
            ctx.strokeStyle = PAL.nestLight;
            for (let k = 0; k < 10; k++) {
                const a = (k / 10) * TAU;
                ctx.beginPath();
                ctx.moveTo(x + Math.cos(a) * s * 0.27, y + s * 0.04 + Math.sin(a) * s * 0.24);
                ctx.lineTo(x + Math.cos(a + 0.4) * s * 0.4, y + s * 0.04 + Math.sin(a + 0.4) * s * 0.35);
                ctx.stroke();
            }
        }
    }

    function shadow(x, y, rx) {
        ctx.fillStyle = 'rgba(80, 50, 20, 0.22)';
        ctx.beginPath();
        ctx.ellipse(x, y + tile * 0.3, rx, tile * 0.1, 0, 0, TAU);
        ctx.fill();
    }

    function drawEgg(x, y, piece, now, hatchK) {
        const s = tile;
        const onNest = L.nests.has(piece.i) && !(anim && anim.pushed && anim.pushed.id === piece.id && animK(now) < 1);
        const stuck = !L.nests.has(piece.i) && !L.live.has(piece.i);
        const wob = reduceMotion ? 0 : Math.sin(now / 400 + piece.id * 1.7) * 0.05;
        let shakeX = 0;
        if (hatchK > 0 && hatchK < 0.45 && !reduceMotion) shakeX = Math.sin(now / 25) * s * 0.04;

        shadow(x, y, s * 0.26);
        if (onNest) {
            const pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now / 300 + piece.id);
            ctx.fillStyle = `rgba(245, 184, 46, ${0.18 + pulse * 0.2})`;
            ctx.beginPath();
            ctx.arc(x, y, s * 0.46, 0, TAU);
            ctx.fill();
        }

        ctx.save();
        ctx.translate(x + shakeX, y);
        ctx.rotate(wob);
        const rx = s * 0.26, ry = s * 0.32;
        const opened = hatchK >= 0.6;
        if (opened) drawBaby(Math.min(1, (hatchK - 0.6) / 0.4));

        ctx.lineWidth = Math.max(1.5, s * 0.035);
        ctx.strokeStyle = stuck ? PAL.warn : 'rgba(90, 70, 40, 0.45)';
        ctx.fillStyle = PAL.egg;
        ctx.beginPath();
        if (opened) {
            // bottom half of the shell with a zigzag rim
            ctx.moveTo(-rx, 0);
            for (let k = 0; k <= 6; k++) ctx.lineTo(-rx + (2 * rx * k) / 6, k % 2 ? -s * 0.05 : s * 0.02);
            ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
        } else {
            ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = PAL.eggSpot;
        [[-0.1, 0.12, 0.08], [0.11, 0.18, 0.06], [0.08, -0.1, 0.07], [-0.12, -0.16, 0.05]].forEach(([dx, dy, r]) => {
            if (opened && dy < 0.02) return;
            ctx.beginPath();
            ctx.arc(dx * s, dy * s, r * s, 0, TAU);
            ctx.fill();
        });
        if (!opened) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath();
            ctx.ellipse(-rx * 0.4, -ry * 0.45, s * 0.05, s * 0.08, -0.4, 0, TAU);
            ctx.fill();
            if (hatchK >= 0.4) {
                ctx.strokeStyle = PAL.rockDark;
                ctx.lineWidth = Math.max(1.5, s * 0.03);
                ctx.beginPath();
                ctx.moveTo(-rx, 0);
                for (let k = 0; k <= 6; k++) ctx.lineTo(-rx + (2 * rx * k) / 6, k % 2 ? -s * 0.05 : s * 0.02);
                ctx.stroke();
            }
        }
        if (stuck) {
            ctx.fillStyle = PAL.warn;
            ctx.font = `900 ${Math.round(s * 0.3)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', 0, 0);
        }
        ctx.restore();

        if (opened) {
            // top half of the shell flies up and fades
            const k = Math.min(1, (hatchK - 0.6) / 0.5);
            ctx.save();
            ctx.globalAlpha = 1 - k;
            ctx.translate(x + k * s * 0.3, y - s * 0.1 - k * s * 0.5);
            ctx.rotate(k * 1.2);
            ctx.fillStyle = PAL.egg;
            ctx.strokeStyle = 'rgba(90, 70, 40, 0.45)';
            ctx.beginPath();
            ctx.ellipse(0, 0, rx, ry * 0.7, 0, Math.PI, TAU);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }

    function drawBaby(k) {
        const s = tile;
        const bounce = Math.sin(k * Math.PI) * s * 0.12;
        const y = -s * 0.12 - k * s * 0.08 - bounce;
        ctx.fillStyle = PAL.dino;
        ctx.strokeStyle = PAL.dinoDark;
        ctx.lineWidth = Math.max(1.5, s * 0.03);
        ctx.beginPath();
        ctx.arc(0, y, s * 0.2, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(s * 0.12, y + s * 0.04, s * 0.12, s * 0.09, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-s * 0.04, y - s * 0.06, s * 0.06, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#111111';
        ctx.beginPath();
        ctx.arc(-s * 0.03, y - s * 0.055, s * 0.028, 0, TAU);
        ctx.fill();
    }

    function drawBoulder(x, y, scale) {
        const s = tile * scale;
        shadow(x, y, s * 0.32);
        ctx.fillStyle = PAL.boulder;
        ctx.strokeStyle = '#5e646a';
        ctx.lineWidth = Math.max(1.5, s * 0.04);
        ctx.beginPath();
        ctx.ellipse(x, y, s * 0.36, s * 0.33, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = PAL.boulderTop;
        ctx.beginPath();
        ctx.ellipse(x - s * 0.1, y - s * 0.12, s * 0.15, s * 0.09, -0.3, 0, TAU);
        ctx.fill();
    }

    function drawDino(x, y, dir, walkK, now) {
        const s = tile;
        shadow(x, y, s * 0.3);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ANGLE[dir]);
        const step = Math.sin(walkK * Math.PI) * s * 0.06;
        ctx.lineWidth = Math.max(1.5, s * 0.035);
        ctx.strokeStyle = PAL.dinoDark;

        // feet
        ctx.fillStyle = PAL.boot;
        [[0.08 + step / s, -0.24], [-0.08 - step / s, 0.24]].forEach(([fx, fy]) => {
            ctx.beginPath();
            ctx.ellipse(fx * s, fy * s, s * 0.09, s * 0.07, 0, 0, TAU);
            ctx.fill();
            ctx.stroke();
        });
        // tail
        ctx.fillStyle = PAL.dino;
        ctx.beginPath();
        ctx.moveTo(-s * 0.2, -s * 0.1);
        ctx.quadraticCurveTo(-s * 0.48, Math.sin(now / 200) * s * 0.05, -s * 0.2, s * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // body
        ctx.beginPath();
        ctx.ellipse(-s * 0.02, 0, s * 0.27, s * 0.24, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        // spikes down the back
        ctx.fillStyle = PAL.spike;
        [-0.18, -0.06, 0.06].forEach(sx => {
            ctx.beginPath();
            ctx.arc(sx * s, 0, s * 0.05, 0, TAU);
            ctx.fill();
        });
        // head + snout
        ctx.fillStyle = PAL.dino;
        ctx.beginPath();
        ctx.arc(s * 0.22, 0, s * 0.17, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(s * 0.38, 0, s * 0.12, s * 0.12, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        // eyes
        [-1, 1].forEach(side => {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(s * 0.22, side * s * 0.1, s * 0.065, s * 0.06, 0, 0, TAU);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#111111';
            ctx.beginPath();
            ctx.arc(s * 0.245, side * s * 0.1, s * 0.03, 0, TAU);
            ctx.fill();
        });
        ctx.restore();
    }

    function drawHint(x, y, now) {
        if (!hintDir || now > hintUntil) return;
        const [dr, dc] = DIRS[hintDir];
        const pulse = reduceMotion ? 0 : Math.sin(now / 140) * tile * 0.06;
        const d = tile * 0.62 + pulse;
        const ax = x + dc * d, ay = y + dr * d;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ANGLE[hintDir]);
        ctx.fillStyle = PAL.gold;
        ctx.strokeStyle = '#7a5410';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tile * 0.2, 0);
        ctx.lineTo(-tile * 0.1, -tile * 0.18);
        ctx.lineTo(-tile * 0.1, tile * 0.18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    function animK(now) {
        return anim ? Math.max(0, Math.min(1, (now - anim.t0) / MOVE_MS)) : 1;
    }

    function burst(x, y, n, color, life) {
        if (reduceMotion) n = Math.ceil(n / 3);
        for (let k = 0; k < n; k++) {
            const a = Math.random() * TAU;
            const sp = tile * (1.5 + Math.random() * 3);
            particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - tile, life, max: life, r: tile * (0.03 + Math.random() * 0.05), color });
        }
    }

    let lastFrame = performance.now();
    function frame(now) {
        requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - lastFrame) / 1000);
        lastFrame = now;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);
        if (!L) return;

        drawTerrain(now);

        const k = ease(animK(now));
        const draws = [];
        for (const p of S.pieces) {
            const moving = anim && anim.pushed && anim.pushed.id === p.id && animK(now) < 1;
            const sinking = anim && anim.sink === p.id && animK(now) < 1;
            if (!p.alive && !sinking) continue;
            const [x, y] = moving ? lerpCell(anim.pushed.from, anim.pushed.to, k) : cellCenter(p.i);
            draws.push({ y, fn: () => {
                if (p.kind === 'egg') {
                    const delay = eggs().indexOf(p) * 0.12;
                    const hk = won && !reduceMotion ? Math.max(0, (now - wonAt) / 1000 - delay) : (won ? 1 : 0);
                    drawEgg(x, y, p, now, Math.min(1.2, hk));
                } else {
                    drawBoulder(x, y, p.alive ? 1 : 1 - k * 0.7);
                }
            } });
        }

        let px, py;
        let walkK = 0;
        if (anim && animK(now) < 1) {
            if (anim.bump) {
                const [dr, dc] = DIRS[anim.bump];
                const b = Math.sin(animK(now) * Math.PI) * tile * 0.12;
                [px, py] = cellCenter(S.player);
                px += dc * b;
                py += dr * b;
            } else {
                [px, py] = lerpCell(anim.player.from, anim.player.to, k);
                walkK = animK(now);
            }
        } else {
            [px, py] = cellCenter(S.player);
        }
        draws.push({ y: py, fn: () => drawDino(px, py, S.dir, walkK, now) });

        draws.sort((a, b) => a.y - b.y).forEach(d => d.fn());
        drawHint(px, py, now);

        for (let i = particles.length - 1; i >= 0; i--) {
            const q = particles[i];
            q.life -= dt;
            if (q.life <= 0) { particles.splice(i, 1); continue; }
            q.vy += tile * 9 * dt;
            q.x += q.vx * dt;
            q.y += q.vy * dt;
            ctx.globalAlpha = q.life / q.max;
            ctx.fillStyle = q.color;
            ctx.beginPath();
            ctx.arc(q.x, q.y, q.r, 0, TAU);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // --- Input ---
    const KEY_DIRS = {
        ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R',
        KeyW: 'U', KeyS: 'D', KeyA: 'L', KeyD: 'R',
    };
    window.addEventListener('keydown', e => {
        if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!$('clearOv').hidden) {
            if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyN') { e.preventDefault(); nextLevel(); }
            else if (e.code === 'KeyZ' || e.code === 'Backspace') { e.preventDefault(); undo(); }
            else if (e.code === 'KeyR') resetLevel();
            return;
        }
        if (e.code === 'Escape') {
            if (menuClosed()) openMenu(); else closeMenu();
            return;
        }
        if (!menuClosed()) return;
        const dir = KEY_DIRS[e.code];
        if (dir) { e.preventDefault(); move(dir); return; }
        if (e.code === 'KeyZ' || e.code === 'Backspace') { e.preventDefault(); undo(); }
        else if (e.code === 'KeyR') resetLevel();
        else if (e.code === 'KeyH') hint();
        else if (e.code === 'KeyM') toggleMute();
    });

    let swipe = null;
    canvas.addEventListener('pointerdown', e => {
        ensureAudio();
        swipe = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', e => {
        if (!swipe) return;
        const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
        swipe = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'R' : 'L');
        else move(dy > 0 ? 'D' : 'U');
    });
    canvas.addEventListener('pointercancel', () => { swipe = null; });

    document.querySelectorAll('.dpad button').forEach(btn => {
        btn.addEventListener('click', () => move(btn.dataset.dir));
    });

    function toggleMute() {
        muted = !muted;
        save('dino-nest-muted', muted);
        renderMuteIcon();
    }

    $('undoBtn').addEventListener('click', undo);
    $('resetBtn').addEventListener('click', resetLevel);
    $('hintBtn').addEventListener('click', hint);
    $('muteBtn').addEventListener('click', () => { ensureAudio(); toggleMute(); });
    $('menuBtn').addEventListener('click', openMenu);
    $('closeMenu').addEventListener('click', closeMenu);
    $('menuOv').addEventListener('click', e => { if (e.target === $('menuOv')) closeMenu(); });
    $('nextBtn').addEventListener('click', nextLevel);
    $('againBtn').addEventListener('click', () => loadLevel(L.index));
    window.addEventListener('resize', layout);

    // --- Boot ---
    function start(data) {
        renderMuteIcon();
        const first = LEVELS.findIndex((_, i) => progress.best[i] === undefined);
        const startAt = data && typeof data.index === 'number' ? data.index
            : (unlocked(progress.last) ? progress.last : Math.max(0, first));
        loadLevel(startAt);
        if (data && data.state) {
            restore(data.state);
            history = (data.history || []).slice();
            updateHUD();
        }
        requestAnimationFrame(t => { lastFrame = t; frame(t); });
    }

    window.claude?.hot?.snapshot?.(() => ({ index: L.index, state: snapshot(), history: history.slice(-300) }));
    if (window.claude?.hot?.ready) window.claude.hot.ready(start);
    else start(window.claude?.hot?.data ?? {});
})();
