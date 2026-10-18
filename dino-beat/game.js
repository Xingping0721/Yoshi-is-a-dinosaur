(() => {
    'use strict';

    const SONGS = window.DINO_BEAT_SONGS;
    const E = window.DinoBeatEngine;

    const LANE_COLORS = ['#ff4fa3', '#ffd23f', '#3ff0c2', '#4fa8ff'];
    const KEY_LANES = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
    const KEY_LABELS = ['D', 'F', 'J', 'K'];
    const WINDOW = { perfect: 0.045, great: 0.09, good: 0.135 };
    const WEIGHT = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };
    const GRADE_COLOR = { perfect: '#3ff0c2', great: '#ffd23f', good: '#4fa8ff', miss: '#9a88b8' };
    const LEAD_IN = 2.6;
    const TAU = Math.PI * 2;

    const $ = id => document.getElementById(id);
    const canvas = $('stage');
    const ctx2d = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- Storage (per-viewer settings and best scores) ---
    function load(key, fallback) {
        try {
            const v = localStorage.getItem(key);
            return v === null ? fallback : JSON.parse(v);
        } catch (e) { return fallback; }
    }
    function save(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    }
    const settings = Object.assign({ speed: 2.2, offset: 0, volume: 0.8, hitSound: true }, load('dino-beat-settings', {}));
    const best = load('dino-beat-best', {});
    const sel = Object.assign({ song: 0, diff: 'normal' }, load('dino-beat-select', {}));
    if (!SONGS[sel.song]) sel.song = 0;
    if (!E.DIFFS[sel.diff]) sel.diff = 'normal';

    // Precompute charts for the menu (note counts)
    const compiled = SONGS.map(s => E.compileSong(s));
    const noteCount = (si, d) => E.buildChart(compiled[si], d).length;

    // --- Audio ---
    let actx = null, synth = null, schedTimer = 0;
    function ensureAudio() {
        if (!actx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            actx = new AC({ latencyHint: 'interactive' });
            synth = new E.Synth(actx);
        }
        synth.volume.gain.value = settings.volume;
        if (actx.state === 'suspended') actx.resume();
    }

    // --- Run state ---
    let mode = 'title';             // title | play | paused | results
    let run = null;
    let clockOffset = null;         // audio clock minus performance clock, in seconds
    const held = [false, false, false, false];
    const laneGlow = [0, 0, 0, 0];
    const pointerLanes = new Map();
    let effects = [];
    let judgeFx = null;

    function syncClock() {
        const perf = performance.now() / 1000;
        const latency = actx.outputLatency || actx.baseLatency || 0;
        const target = actx.currentTime - latency - perf;
        if (clockOffset === null || Math.abs(target - clockOffset) > 0.03) clockOffset = target;
        else clockOffset += (target - clockOffset) * 0.02;
    }
    const songTimeAt = ms => ms / 1000 + clockOffset - run.songStart;

    function startRun() {
        ensureAudio();
        synth.newSession();
        const song = SONGS[sel.song];
        const comp = compiled[sel.song];
        const notes = E.buildChart(comp, sel.diff);
        run = {
            song, diff: sel.diff, comp, notes,
            songStart: actx.currentTime + LEAD_IN,
            evIdx: 0, open: 0,
            points: 0, combo: 0, maxCombo: 0,
            counts: { perfect: 0, great: 0, good: 0, miss: 0 },
            errors: [], weight: 0, judged: 0,
        };
        // Four count-in clicks before the first bar
        const beat = 60 / song.bpm;
        for (let k = 4; k >= 1; k--) synth.tick(run.songStart - k * beat);

        clockOffset = null;
        effects = [];
        judgeFx = null;
        mode = 'play';
        $('titleOv').hidden = true;
        $('pauseOv').hidden = true;
        $('resultOv').hidden = true;
        $('hud').hidden = false;
        $('hudTitle').textContent = song.title;
        const tag = $('hudDiff');
        tag.textContent = E.DIFFS[run.diff].label;
        tag.className = 'diff-tag ' + run.diff;
        startScheduler();
        updateHUD(0);
    }

    function startScheduler() {
        clearInterval(schedTimer);
        schedTimer = setInterval(schedule, 25);
        schedule();
    }
    function stopScheduler() {
        clearInterval(schedTimer);
    }
    function schedule() {
        if (!run) return;
        const horizon = actx.currentTime + 0.2;
        const ev = run.comp.events;
        while (run.evIdx < ev.length && run.songStart + ev[run.evIdx].t < horizon) {
            const e = ev[run.evIdx++];
            const at = run.songStart + e.t;
            if (at >= actx.currentTime - 0.02) synth.play(e, Math.max(at, actx.currentTime));
        }
    }

    function pause() {
        if (mode !== 'play') return;
        mode = 'paused';
        stopScheduler();
        actx.suspend();
        held.fill(false);
        $('pauseOv').hidden = false;
        $('resumeBtn').focus();
    }
    function resume() {
        if (mode !== 'paused') return;
        $('pauseOv').hidden = true;
        actx.resume().then(() => {
            clockOffset = null;
            mode = 'play';
            startScheduler();
        });
    }
    function quitToTitle() {
        stopScheduler();
        if (actx) {
            synth.newSession();
            if (actx.state === 'suspended') actx.resume();
        }
        run = null;
        mode = 'title';
        $('pauseOv').hidden = true;
        $('resultOv').hidden = true;
        $('hud').hidden = true;
        renderMenu();
        $('titleOv').hidden = false;
        $('startBtn').focus();
    }
    function retry() {
        stopScheduler();
        if (actx && actx.state === 'suspended') actx.resume();
        startRun();
    }

    // --- Judging ---
    function press(lane, stampMs) {
        held[lane] = true;
        laneGlow[lane] = 1;
        if (mode !== 'play' || clockOffset === null) return;
        pressAt(lane, songTimeAt(stampMs) - settings.offset / 1000);
    }

    function pressAt(lane, t) {
        let target = null;
        for (let i = run.open; i < run.notes.length; i++) {
            const n = run.notes[i];
            if (n.t - t > WINDOW.good) break;
            if (n.judged || n.lane !== lane || t - n.t > WINDOW.good) continue;
            target = n;
            break;
        }
        if (!target) return null;
        const err = t - target.t;
        const a = Math.abs(err);
        const grade = a <= WINDOW.perfect ? 'perfect' : a <= WINDOW.great ? 'great' : 'good';
        judge(target, grade, err);
        if (settings.hitSound && actx) synth.tick(actx.currentTime);
        return grade;
    }

    function judge(n, grade, err) {
        n.judged = grade;
        run.counts[grade]++;
        run.judged++;
        run.weight += WEIGHT[grade];
        run.points += WEIGHT[grade];
        if (grade === 'miss') {
            run.combo = 0;
        } else {
            run.combo++;
            run.maxCombo = Math.max(run.maxCombo, run.combo);
            run.errors.push(err);
            effects.push({ lane: n.lane, t: performance.now(), color: LANE_COLORS[n.lane], grade });
        }
        judgeFx = { grade, err, t: performance.now() };
        while (run.open < run.notes.length && run.notes[run.open].judged) run.open++;
    }

    function sweepMisses(t) {
        for (let i = run.open; i < run.notes.length; i++) {
            const n = run.notes[i];
            if (t - n.t <= WINDOW.good) break;
            if (!n.judged) judge(n, 'miss', 0);
        }
    }

    const scoreOf = r => Math.round((r.points / Math.max(1, r.notes.length)) * 1000000);
    const rankOf = s => s >= 950000 ? 'S' : s >= 900000 ? 'A' : s >= 800000 ? 'B' : s >= 700000 ? 'C' : 'D';

    function finish() {
        stopScheduler();
        mode = 'results';
        $('hud').hidden = true;
        const score = scoreOf(run);
        const rank = rankOf(score);
        const fc = run.counts.miss === 0;
        const ap = run.counts.perfect === run.notes.length;
        const key = `${run.song.id}:${run.diff}`;
        const prev = best[key];
        const isNew = !prev || score > prev.score;
        if (isNew) best[key] = { score, rank, fc: fc || (prev && prev.fc) };
        else if (fc && !prev.fc) best[key].fc = true;
        save('dino-beat-best', best);

        const rankEl = $('rRank');
        rankEl.textContent = rank;
        rankEl.className = 'rank ' + rank;
        $('rSong').textContent = `${run.song.title} · ${E.DIFFS[run.diff].label}`;
        $('rScore').textContent = score.toLocaleString('en-US');
        $('rBadges').innerHTML = (ap ? '<span class="badge ap">ALL PERFECT</span>' : fc ? '<span class="badge fc">FULL COMBO</span>' : '')
            + (isNew ? '<span class="badge new">NEW BEST</span>' : '');
        ['perfect', 'great', 'good', 'miss'].forEach(g => {
            $('r' + g[0].toUpperCase() + g.slice(1)).textContent = run.counts[g];
        });
        $('rCombo').textContent = `${run.maxCombo} / ${run.notes.length}`;
        $('rAcc').textContent = ((run.weight / Math.max(1, run.judged)) * 100).toFixed(2) + '%';

        const avgMs = run.errors.length ? Math.round(run.errors.reduce((a, b) => a + b, 0) / run.errors.length * 1000) : 0;
        $('rAvg').textContent = avgMs === 0 ? '±0 ms' : `${avgMs > 0 ? '+' : ''}${avgMs} ms（${avgMs > 0 ? '遅め' : '早め'}）`;
        const tip = $('offsetTip');
        if (run.errors.length >= 20 && Math.abs(avgMs) >= 12) {
            const suggested = Math.max(-150, Math.min(150, settings.offset + avgMs));
            tip.hidden = false;
            $('offsetTipText').textContent = `叩くタイミングが平均 ${Math.abs(avgMs)}ms ${avgMs > 0 ? '遅れて' : '早まって'}います。補正を ${suggested} ms にすると合いやすくなります。`;
            $('applyOffsetBtn').onclick = () => {
                settings.offset = suggested;
                save('dino-beat-settings', settings);
                syncSettingsUI();
                tip.hidden = true;
            };
        } else {
            tip.hidden = true;
        }
        $('resultOv').hidden = false;
        $('retryBtn').focus();
    }

    // --- HUD ---
    let lastHud = '';
    function updateHUD(t) {
        const score = String(scoreOf(run)).padStart(7, '0');
        const acc = run.judged ? (run.weight / run.judged) * 100 : 100;
        const prog = Math.max(0, Math.min(1, t / run.comp.length));
        const key = score + acc.toFixed(2) + prog.toFixed(3);
        if (key === lastHud) return;
        lastHud = key;
        $('hudScore').textContent = score;
        $('hudAcc').textContent = acc.toFixed(2) + '%';
        $('hudBar').style.width = (prog * 100).toFixed(1) + '%';
    }

    // --- Menu ---
    function renderMenu() {
        const list = $('songList');
        list.innerHTML = '';
        SONGS.forEach((s, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'song';
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', String(i === sel.song));
            b.innerHTML = `<b></b><span class="bpm">${s.bpm}<br>BPM</span><span class="artist"></span>`;
            b.querySelector('b').textContent = s.title;
            b.querySelector('.artist').textContent = `${s.artist} · ${Math.round(compiled[i].length)}秒`;
            b.addEventListener('click', () => { sel.song = i; save('dino-beat-select', sel); renderMenu(); });
            list.appendChild(b);
        });

        const diffs = $('diffList');
        diffs.innerHTML = '';
        Object.keys(E.DIFFS).forEach(d => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'diff ' + d;
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', String(d === sel.diff));
            const rec = best[`${SONGS[sel.song].id}:${d}`];
            b.innerHTML = `<b>${E.DIFFS[d].label}</b><span class="sub">${noteCount(sel.song, d)} ノーツ</span><span class="best"></span>`;
            b.querySelector('.best').textContent = rec ? `BEST ${rec.rank}${rec.fc ? ' · FC' : ''}` : '';
            b.addEventListener('click', () => { sel.diff = d; save('dino-beat-select', sel); renderMenu(); });
            diffs.appendChild(b);
        });
    }

    function syncSettingsUI() {
        $('speedInput').value = settings.speed;
        $('speedOut').textContent = Number(settings.speed).toFixed(1);
        $('offsetInput').value = settings.offset;
        $('offsetOut').textContent = `${settings.offset > 0 ? '+' : ''}${settings.offset} ms`;
        $('volumeInput').value = settings.volume;
        $('volumeOut').textContent = Math.round(settings.volume * 100) + '%';
        $('hitSoundInput').checked = settings.hitSound;
    }
    function bindSetting(id, key, parse) {
        $(id).addEventListener('input', e => {
            settings[key] = parse(e.target);
            save('dino-beat-settings', settings);
            if (key === 'volume' && synth) synth.volume.gain.value = settings.volume;
            syncSettingsUI();
        });
    }
    bindSetting('speedInput', 'speed', el => Number(el.value));
    bindSetting('offsetInput', 'offset', el => Number(el.value));
    bindSetting('volumeInput', 'volume', el => Number(el.value));
    bindSetting('hitSoundInput', 'hitSound', el => el.checked);

    // --- Drawing ---
    let W = 0, H = 0, dpr = 1;
    let G = {};
    const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.6, r: 0.6 + Math.random() * 1.4, p: Math.random() * TAU }));

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        const laneW = Math.min(W / 5.2, 104, H / 6);
        G = { cx: W / 2, laneW, horizon: H * 0.13, hitY: H * 0.82 };
        G.zFar = 7;
    }

    function proj(laneX, z) {
        const s = 1 / (1 + Math.max(z, -0.6));
        return { x: G.cx + laneX * G.laneW * s, y: G.horizon + (G.hitY - G.horizon) * s, s };
    }

    function drawBackground(beat, pulse, now) {
        const c = ctx2d;
        const g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0c0518');
        g.addColorStop(0.55, '#2a0f45');
        g.addColorStop(1, '#4a1a5c');
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);

        c.fillStyle = '#ffffff';
        for (const st of stars) {
            c.globalAlpha = 0.3 + 0.4 * Math.abs(Math.sin(now / 900 + st.p));
            c.beginPath();
            c.arc(st.x * W, st.y * H, st.r, 0, TAU);
            c.fill();
        }
        c.globalAlpha = 1;

        // Disco moon
        const mx = G.cx, my = G.horizon - Math.min(40, H * 0.04);
        const mr = Math.min(W, H) * 0.09;
        const glow = c.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * (2.4 + pulse * 0.6));
        glow.addColorStop(0, 'rgba(255, 210, 63, 0.35)');
        glow.addColorStop(1, 'rgba(255, 210, 63, 0)');
        c.fillStyle = glow;
        c.beginPath();
        c.arc(mx, my, mr * 3, 0, TAU);
        c.fill();
        c.save();
        c.beginPath();
        c.arc(mx, my, mr, 0, TAU);
        c.clip();
        c.fillStyle = '#ffe9a8';
        c.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
        const tileSize = mr / 3.2;
        const spin = reduceMotion ? 0 : (now / 1200) % 1;
        for (let yy = -4; yy <= 4; yy++) {
            for (let xx = -5; xx <= 5; xx++) {
                const shade = (xx + yy + Math.floor(spin * 4)) % 3;
                c.fillStyle = shade === 0 ? 'rgba(255, 255, 255, 0.55)' : shade === 1 ? 'rgba(255, 180, 90, 0.35)' : 'rgba(200, 120, 255, 0.25)';
                c.fillRect(mx + (xx + spin) * tileSize, my + yy * tileSize, tileSize - 1.5, tileSize - 1.5);
            }
        }
        c.restore();

        // Spotlights
        if (!reduceMotion) {
            [[0, LANE_COLORS[0]], [W, LANE_COLORS[3]]].forEach(([sx, col], i) => {
                const a = Math.sin(now / 1400 + i * 2) * 0.35 + (i ? -0.45 : 0.45);
                c.save();
                c.translate(sx, 0);
                c.rotate(a);
                const lg = c.createLinearGradient(0, 0, 0, H);
                lg.addColorStop(0, col + '55');
                lg.addColorStop(1, col + '00');
                c.fillStyle = lg;
                c.beginPath();
                c.moveTo(-8, 0);
                c.lineTo(8, 0);
                c.lineTo(H * 0.18, H * 1.1);
                c.lineTo(-H * 0.18, H * 1.1);
                c.closePath();
                c.fill();
                c.restore();
            });
        }

        // Volcanoes with lava glow on the beat
        const base = G.hitY + (H - G.hitY) * 0.2;
        [[-1, W * 0.12], [1, W * 0.88]].forEach(([side, vx]) => {
            const vw = Math.max(160, W * 0.24), vh = H * 0.42;
            c.fillStyle = '#1a0a2a';
            c.beginPath();
            c.moveTo(vx - vw, base);
            c.lineTo(vx - vw * 0.18, base - vh);
            c.lineTo(vx + vw * 0.18, base - vh);
            c.lineTo(vx + vw, base);
            c.closePath();
            c.fill();
            c.fillStyle = `rgba(255, 110, 60, ${0.35 + pulse * 0.55})`;
            c.beginPath();
            c.ellipse(vx, base - vh, vw * 0.18, 8, 0, 0, TAU);
            c.fill();
            c.strokeStyle = `rgba(255, 120, 70, ${0.25 + pulse * 0.4})`;
            c.lineWidth = 4;
            c.beginPath();
            c.moveTo(vx - vw * 0.06 * side, base - vh);
            c.quadraticCurveTo(vx + vw * 0.1 * side, base - vh * 0.6, vx - vw * 0.05 * side, base - vh * 0.25);
            c.stroke();
        });
    }

    function drawHighway(songT, bpm, speed) {
        const c = ctx2d;
        const far = G.zFar;
        const corners = [proj(-2, -0.35), proj(2, -0.35), proj(2, far), proj(-2, far)];
        const g = c.createLinearGradient(0, G.horizon, 0, G.hitY);
        g.addColorStop(0, 'rgba(20, 8, 40, 0.1)');
        g.addColorStop(1, 'rgba(20, 8, 40, 0.85)');
        c.fillStyle = g;
        c.beginPath();
        corners.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath();
        c.fill();

        // Lane glow while pressed
        for (let l = 0; l < 4; l++) {
            if (laneGlow[l] <= 0.01) continue;
            const a = proj(l - 2, -0.35), b = proj(l - 1, -0.35), cc = proj(l - 1, far * 0.5), d = proj(l - 2, far * 0.5);
            const lg = c.createLinearGradient(0, G.hitY, 0, d.y);
            lg.addColorStop(0, LANE_COLORS[l] + Math.round(laneGlow[l] * 110).toString(16).padStart(2, '0'));
            lg.addColorStop(1, LANE_COLORS[l] + '00');
            c.fillStyle = lg;
            c.beginPath();
            c.moveTo(a.x, a.y);
            c.lineTo(b.x, b.y);
            c.lineTo(cc.x, cc.y);
            c.lineTo(d.x, d.y);
            c.closePath();
            c.fill();
        }

        c.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        c.lineWidth = 1.5;
        for (let l = 0; l <= 4; l++) {
            const a = proj(l - 2, -0.35), b = proj(l - 2, far);
            c.beginPath();
            c.moveTo(a.x, a.y);
            c.lineTo(b.x, b.y);
            c.stroke();
        }

        // Beat lines scrolling toward the player
        const beatLen = 60 / bpm;
        const first = Math.floor(songT / beatLen);
        for (let k = 0; k < 40; k++) {
            const bt = (first + k) * beatLen;
            const z = (bt - songT) * speed;
            if (z < -0.3) continue;
            if (z > far) break;
            const a = proj(-2, z), b = proj(2, z);
            const downbeat = (first + k) % 4 === 0;
            c.strokeStyle = `rgba(255, 255, 255, ${(downbeat ? 0.3 : 0.12) * Math.min(1, a.s * 2)})`;
            c.lineWidth = downbeat ? 2 : 1;
            c.beginPath();
            c.moveTo(a.x, a.y);
            c.lineTo(b.x, b.y);
            c.stroke();
        }

        // Hit line and receptors
        const L0 = proj(-2, 0), L1 = proj(2, 0);
        c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(L0.x - 6, L0.y);
        c.lineTo(L1.x + 6, L1.y);
        c.stroke();
        const touch = window.matchMedia('(pointer: coarse)').matches;
        for (let l = 0; l < 4; l++) {
            const p = proj(l - 1.5, 0);
            const r = G.laneW * 0.34;
            c.lineWidth = 3;
            c.strokeStyle = LANE_COLORS[l];
            c.fillStyle = held[l] ? LANE_COLORS[l] + '66' : 'rgba(18, 8, 33, 0.7)';
            c.beginPath();
            c.ellipse(p.x, p.y, r, r * 0.62, 0, 0, TAU);
            c.fill();
            c.stroke();
            if (!touch) {
                c.fillStyle = 'rgba(255, 255, 255, 0.85)';
                c.font = `700 ${Math.round(G.laneW * 0.2)}px 'M PLUS 1', sans-serif`;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText(KEY_LABELS[l], p.x, p.y + 1);
            }
        }
    }

    function drawNote(lane, z, missed) {
        const c = ctx2d;
        const p = proj(lane - 1.5, z);
        const rx = G.laneW * 0.36 * p.s, ry = rx * 0.66;
        const col = LANE_COLORS[lane];
        c.globalAlpha = missed ? 0.3 : Math.min(1, p.s * 3);
        const g = c.createRadialGradient(p.x - rx * 0.3, p.y - ry * 0.4, rx * 0.1, p.x, p.y, rx);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, col);
        g.addColorStop(1, shade(col));
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(p.x, p.y, rx, ry, 0, 0, TAU);
        c.fill();
        c.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        c.lineWidth = Math.max(1, 2 * p.s);
        c.stroke();
        // egg spots
        c.fillStyle = 'rgba(255, 255, 255, 0.55)';
        c.beginPath();
        c.arc(p.x + rx * 0.35, p.y + ry * 0.15, rx * 0.12, 0, TAU);
        c.arc(p.x - rx * 0.1, p.y + ry * 0.45, rx * 0.09, 0, TAU);
        c.fill();
        c.globalAlpha = 1;
        return p;
    }

    function shade(hex) {
        const n = parseInt(hex.slice(1), 16);
        const r = (n >> 16) * 0.55, g = ((n >> 8) & 255) * 0.55, b = (n & 255) * 0.55;
        return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
    }

    function drawNotes(songT, speed) {
        const c = ctx2d;
        const tFar = G.zFar / speed;
        const notes = run.notes;
        let lastT = null, lastP = null;
        // draw far to near so close eggs sit on top
        let end = run.open;
        while (end < notes.length && notes[end].t - songT < tFar) end++;
        for (let i = end - 1; i >= Math.max(0, run.open - 40); i--) {
            const n = notes[i];
            if (n.judged && n.judged !== 'miss') continue;
            const z = (n.t - songT) * speed;
            if (z < -0.5) continue;
            const p = drawNote(n.lane, z, n.judged === 'miss');
            if (lastT !== null && Math.abs(lastT - n.t) < 1e-6 && !n.judged) {
                c.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                c.lineWidth = Math.max(1, 3 * p.s);
                c.beginPath();
                c.moveTo(p.x, p.y);
                c.lineTo(lastP.x, lastP.y);
                c.stroke();
            }
            lastT = n.t;
            lastP = p;
        }
    }

    function drawEffects(now) {
        const c = ctx2d;
        effects = effects.filter(fx => now - fx.t < 380);
        for (const fx of effects) {
            const k = Math.max(0, (now - fx.t) / 380);
            const p = proj(fx.lane - 1.5, 0);
            const r = G.laneW * (0.36 + k * 0.5);
            c.globalAlpha = 1 - k;
            c.strokeStyle = fx.grade === 'perfect' ? '#ffffff' : fx.color;
            c.lineWidth = 4 * (1 - k) + 1;
            c.beginPath();
            c.ellipse(p.x, p.y, r, r * 0.62, 0, 0, TAU);
            c.stroke();
            c.fillStyle = fx.color;
            for (let s = 0; s < 6; s++) {
                const a = (s / 6) * TAU + fx.lane;
                c.beginPath();
                c.arc(p.x + Math.cos(a) * r * 1.1, p.y + Math.sin(a) * r * 0.7 - k * 20, 3 * (1 - k) + 1, 0, TAU);
                c.fill();
            }
        }
        c.globalAlpha = 1;

        if (judgeFx && now - judgeFx.t < 600) {
            const k = Math.max(0, (now - judgeFx.t) / 600);
            const pop = k < 0.15 ? 0.8 + k / 0.15 * 0.3 : 1.1 - Math.min(0.1, (k - 0.15));
            const y = G.hitY - G.laneW * 1.25;
            c.save();
            c.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
            c.translate(G.cx, y);
            c.scale(pop, pop);
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.font = `${Math.round(G.laneW * 0.42)}px Bungee, 'Arial Black', sans-serif`;
            c.lineWidth = 6;
            c.strokeStyle = 'rgba(12, 5, 24, 0.85)';
            const word = judgeFx.grade.toUpperCase();
            c.strokeText(word, 0, 0);
            c.fillStyle = GRADE_COLOR[judgeFx.grade];
            c.fillText(word, 0, 0);
            if (judgeFx.grade === 'great' || judgeFx.grade === 'good') {
                c.font = `700 ${Math.round(G.laneW * 0.17)}px 'M PLUS 1', sans-serif`;
                c.fillStyle = judgeFx.err > 0 ? '#ff9a7a' : '#8fd0ff';
                c.fillText(judgeFx.err > 0 ? 'SLOW' : 'FAST', 0, G.laneW * 0.34);
            }
            c.restore();
        }
    }

    function drawCombo(beatPulse) {
        if (!run || run.combo < 5) return;
        const c = ctx2d;
        const y = G.horizon + (G.hitY - G.horizon) * 0.42;
        const size = G.laneW * (0.7 + beatPulse * 0.06);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.globalAlpha = 0.9;
        c.font = `${Math.round(size)}px Bungee, 'Arial Black', sans-serif`;
        c.fillStyle = '#ffffff';
        c.fillText(String(run.combo), G.cx, y);
        c.font = `${Math.round(G.laneW * 0.16)}px Bungee, 'Arial Black', sans-serif`;
        c.fillStyle = '#ffd23f';
        c.fillText('COMBO', G.cx, y + size * 0.62);
        c.globalAlpha = 1;
    }

    function drawDancer(x, y, size, color, flip, beat) {
        const c = ctx2d;
        const ph = beat - Math.floor(beat);
        const bounce = reduceMotion ? 0 : Math.abs(Math.sin(beat * Math.PI)) * size * 0.12;
        const armUp = Math.floor(beat) % 2 === 0;
        c.save();
        c.translate(x, y - bounce);
        c.scale(flip ? -1 : 1, 1);
        c.scale(1 + (reduceMotion ? 0 : (1 - ph) * 0.04), 1 - (reduceMotion ? 0 : (1 - ph) * 0.04));
        c.fillStyle = color;
        c.strokeStyle = '#120821';
        c.lineWidth = Math.max(2, size * 0.04);
        // tail
        c.beginPath();
        c.moveTo(-size * 0.3, -size * 0.3);
        c.quadraticCurveTo(-size * 0.8, -size * 0.2, -size * 0.85, -size * 0.55);
        c.quadraticCurveTo(-size * 0.55, -size * 0.45, -size * 0.25, -size * 0.55);
        c.closePath();
        c.fill();
        c.stroke();
        // legs
        [[-0.15, 1], [0.15, -1]].forEach(([lx, s]) => {
            c.beginPath();
            c.ellipse(size * lx, -size * 0.06, size * 0.11, size * 0.16, s * (armUp ? 0.2 : -0.2), 0, TAU);
            c.fill();
            c.stroke();
        });
        // body
        c.beginPath();
        c.ellipse(0, -size * 0.45, size * 0.32, size * 0.38, 0, 0, TAU);
        c.fill();
        c.stroke();
        c.fillStyle = 'rgba(255, 255, 255, 0.85)';
        c.beginPath();
        c.ellipse(size * 0.1, -size * 0.38, size * 0.16, size * 0.24, 0, 0, TAU);
        c.fill();
        // arm
        c.strokeStyle = color;
        c.lineWidth = size * 0.1;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(size * 0.18, -size * 0.55);
        c.lineTo(size * 0.42, armUp ? -size * 0.98 : -size * 0.42);
        c.stroke();
        c.lineCap = 'butt';
        // head
        c.fillStyle = color;
        c.strokeStyle = '#120821';
        c.lineWidth = Math.max(2, size * 0.04);
        c.beginPath();
        c.ellipse(size * 0.18, -size * 0.92, size * 0.26, size * 0.22, -0.15, 0, TAU);
        c.fill();
        c.stroke();
        c.beginPath();
        c.ellipse(size * 0.42, -size * 0.86, size * 0.18, size * 0.14, 0, 0, TAU);
        c.fill();
        c.stroke();
        // sunglasses
        c.fillStyle = '#120821';
        c.fillRect(size * 0.12, -size * 1.0, size * 0.32, size * 0.08);
        c.beginPath();
        c.ellipse(size * 0.32, -size * 0.95, size * 0.1, size * 0.06, 0, 0, TAU);
        c.fill();
        // spikes
        c.fillStyle = '#ffd23f';
        [[-0.05, -1.1], [-0.2, -0.95], [-0.3, -0.75]].forEach(([sx, sy]) => {
            c.beginPath();
            c.arc(size * sx, size * sy, size * 0.06, 0, TAU);
            c.fill();
        });
        c.restore();
    }

    function drawCrowd(beat) {
        const c = ctx2d;
        c.fillStyle = '#0b0416';
        const n = Math.ceil(W / 46) + 1;
        for (let i = 0; i < n; i++) {
            const x = i * 46 + ((i % 2) * 12);
            const bob = reduceMotion ? 0 : Math.abs(Math.sin(beat * Math.PI + i * 0.7)) * 8;
            const y = H - 8 - bob;
            c.beginPath();
            c.ellipse(x, y, 20, 26, 0, Math.PI, TAU);
            c.fill();
            c.beginPath();
            c.ellipse(x + 10, y - 30, 14, 11, 0, 0, TAU);
            c.fill();
        }
    }

    let lastFrame = performance.now();
    function frame(now) {
        requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - lastFrame) / 1000);
        lastFrame = now;

        let songT, bpm;
        if (run && (mode === 'play' || mode === 'paused' || mode === 'results')) {
            if (mode === 'play') syncClock();
            songT = clockOffset === null ? -LEAD_IN : songTimeAt(now);
            bpm = run.song.bpm;
        } else {
            songT = now / 1000;
            bpm = 112;
        }
        const beat = songT * bpm / 60;
        const ph = beat - Math.floor(beat);
        const pulse = (mode === 'title' || songT >= 0) && !reduceMotion ? Math.exp(-ph * 5) : 0;

        if (mode === 'play') {
            const t = songT - settings.offset / 1000;
            sweepMisses(t);
            updateHUD(songT);
            if (songT > run.comp.length + 1.2 && run.open >= run.notes.length) finish();
        }

        for (let l = 0; l < 4; l++) laneGlow[l] = held[l] ? 1 : Math.max(0, laneGlow[l] - dt * 6);

        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawBackground(beat, pulse, now);
        drawHighway(songT, bpm, settings.speed);
        if (run && mode !== 'title') drawNotes(songT, settings.speed);
        drawEffects(now);
        drawCombo(pulse);

        const dancerSize = Math.min(150, H * 0.2);
        const roomBeside = G.cx - 2 * G.laneW;
        if (roomBeside > dancerSize * 1.2) {
            const off = 2 * G.laneW + roomBeside / 2;
            drawDancer(G.cx - off, G.hitY + dancerSize * 0.25, dancerSize, '#5fd35a', false, beat);
            drawDancer(G.cx + off, G.hitY + dancerSize * 0.25, dancerSize, '#ff6fb5', true, beat + 0.5);
        }
        drawCrowd(beat);
    }

    // --- Input ---
    window.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const lane = KEY_LANES[e.code];
        if (mode === 'play') {
            if (lane !== undefined) {
                e.preventDefault();
                if (!e.repeat) press(lane, e.timeStamp);
                return;
            }
            if (e.code === 'Escape' || e.code === 'KeyP') pause();
            return;
        }
        if (mode === 'paused') {
            if (e.code === 'Escape' || e.code === 'KeyP') resume();
            return;
        }
        if (mode === 'title' && e.code === 'Enter' && !e.target.closest('button, input, summary')) {
            e.preventDefault();
            startRun();
        } else if (mode === 'results') {
            if (e.code === 'Enter' && !e.target.closest('button')) { e.preventDefault(); retry(); }
            else if (e.code === 'Escape') quitToTitle();
        }
    });
    window.addEventListener('keyup', e => {
        const lane = KEY_LANES[e.code];
        if (lane !== undefined) held[lane] = false;
    });

    canvas.addEventListener('pointerdown', e => {
        if (mode !== 'play') return;
        const lane = Math.max(0, Math.min(3, Math.floor((e.clientX / W) * 4)));
        pointerLanes.set(e.pointerId, lane);
        press(lane, e.timeStamp);
    });
    const releasePointer = e => {
        const lane = pointerLanes.get(e.pointerId);
        if (lane !== undefined) {
            held[lane] = false;
            pointerLanes.delete(e.pointerId);
        }
    };
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);

    window.addEventListener('blur', () => { held.fill(false); pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    window.addEventListener('resize', resize);

    $('startBtn').addEventListener('click', startRun);
    $('pauseBtn').addEventListener('click', pause);
    $('resumeBtn').addEventListener('click', resume);
    $('retryPauseBtn').addEventListener('click', retry);
    $('quitBtn').addEventListener('click', quitToTitle);
    $('retryBtn').addEventListener('click', retry);
    $('toTitleBtn').addEventListener('click', quitToTitle);

    // --- Boot ---
    resize();
    syncSettingsUI();
    renderMenu();
    requestAnimationFrame(t => { lastFrame = t; frame(t); });
})();
