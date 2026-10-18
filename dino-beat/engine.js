// Music compiler, chart builder and WebAudio synth for Dino Beat.
(function () {
    'use strict';

    const midiToHz = m => 440 * Math.pow(2, (m - 69) / 12);

    // Turn a song definition into a flat, time-sorted list of sound events
    function compileSong(song) {
        const stepDur = 60 / song.bpm / 4;
        const events = [];
        song.bars.forEach((bar, barIndex) => {
            const barStart = barIndex * 16 * stepDur;
            const drums = song.drums[bar.d];
            for (let s = 0; s < 16; s++) {
                const t = barStart + s * stepDur;
                const tag = { t, bar: barIndex, step: s, drum: bar.d };
                if (drums.kick[s] === 'x') events.push({ ...tag, inst: 'kick' });
                if (drums.snare[s] === 'x') events.push({ ...tag, inst: 'snare' });
                if (drums.hat[s] === 'x') events.push({ ...tag, inst: 'hat' });

                if (bar.b) {
                    const ch = song.bassPatterns[bar.b][s];
                    const root = song.bassRoots[bar.c];
                    const offs = { x: 0, o: 12, 5: 7 };
                    if (ch in offs) events.push({ ...tag, inst: 'bass', midi: root + offs[ch], dur: stepDur * 1.6 });
                }

                if (bar.m) {
                    const line = song.melodies[bar.m];
                    const ch = line[s];
                    if (ch >= '0' && ch <= '9') {
                        let len = 1;
                        while (s + len < 16 && line[s + len] === '-') len++;
                        const degree = Number(ch);
                        events.push({ ...tag, inst: 'lead', degree, midi: song.leadRoot + song.scale[degree], dur: stepDur * len * 0.95, len });
                    }
                }
            }
        });
        events.sort((a, b) => a.t - b.t);
        return { events, stepDur, length: song.bars.length * 16 * stepDur };
    }

    const DIFFS = {
        easy: { maxChord: 1, label: 'EASY' },
        normal: { maxChord: 2, label: 'NORMAL' },
        hard: { maxChord: 2, label: 'HARD' },
    };

    // Pick which sound events become notes, then place them in lanes
    function buildChart(compiled, diff) {
        const cands = [];
        let melLane = 1, melDeg = null;
        for (const e of compiled.events) {
            let want = false, lane = 0, prio = 0;
            if (e.inst === 'lead') {
                want = diff === 'hard' || e.step % 4 === 0;
                if (!want) continue;
                // Melody lanes follow the tune's contour: up moves right, down moves left
                if (melDeg !== null && e.degree !== melDeg) {
                    const stepBy = Math.abs(e.degree - melDeg) >= 2 ? 2 : 1;
                    melLane += Math.sign(e.degree - melDeg) * stepBy;
                    if (melLane > 3) melLane = 6 - melLane;
                    if (melLane < 0) melLane = -melLane;
                    melLane = Math.max(0, Math.min(3, melLane));
                }
                melDeg = e.degree;
                lane = melLane;
                prio = 3;
            } else if (e.inst === 'snare') {
                want = diff === 'hard' ? e.step % 2 === 0 : diff === 'normal' && e.step % 8 === 4;
                lane = melLane >= 2 ? 1 : 2;
                prio = 2;
            } else if (e.inst === 'kick') {
                want = diff === 'hard' ? e.step % 2 === 0 : diff === 'normal' ? e.step % 8 === 0 : e.step === 0;
                lane = melLane >= 2 ? 0 : 3;
                prio = 1;
            } else if (e.inst === 'hat') {
                want = diff === 'hard' && e.drum === 'b' && e.step % 4 === 2;
                lane = melLane >= 2 ? 0 : 3;
                prio = 0;
            }
            if (want) cands.push({ t: e.t, lane, prio });
        }

        // Group simultaneous candidates, keep the most important ones, avoid lane clashes
        const maxChord = DIFFS[diff].maxChord;
        const minGap = 0.1;
        const lastInLane = [-1, -1, -1, -1];
        const notes = [];
        for (let i = 0; i < cands.length;) {
            let j = i;
            while (j < cands.length && Math.abs(cands[j].t - cands[i].t) < 1e-6) j++;
            const group = cands.slice(i, j).sort((a, b) => b.prio - a.prio).slice(0, maxChord);
            const used = new Set();
            for (const c of group) {
                const order = [c.lane, c.lane + 1, c.lane - 1, c.lane + 2, c.lane - 2, c.lane + 3, c.lane - 3]
                    .filter(l => l >= 0 && l < 4);
                const lane = order.find(l => !used.has(l) && c.t - lastInLane[l] >= minGap);
                if (lane === undefined) continue;
                used.add(lane);
                lastInLane[lane] = c.t;
                notes.push({ t: c.t, lane, id: notes.length, judged: null });
            }
            i = j;
        }
        return notes;
    }

    class Synth {
        constructor(ctx) {
            this.ctx = ctx;
            this.comp = ctx.createDynamicsCompressor();
            this.comp.threshold.value = -14;
            this.comp.ratio.value = 4;
            this.comp.connect(ctx.destination);
            this.volume = ctx.createGain();
            this.volume.gain.value = 0.8;
            this.volume.connect(this.comp);
            this.out = null;
            this.newSession();

            const len = ctx.sampleRate;
            this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = this.noiseBuf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        }

        // Each play gets its own output bus so quitting can silence what is already scheduled
        newSession() {
            if (this.out) {
                const old = this.out;
                old.gain.setValueAtTime(0, this.ctx.currentTime);
                setTimeout(() => old.disconnect(), 500);
            }
            this.out = this.ctx.createGain();
            this.out.connect(this.volume);
        }

        env(gainNode, t, peak, attack, decay) {
            gainNode.gain.setValueAtTime(0.0001, t);
            gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
        }

        noise(t, dur, type, freq, peak) {
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuf;
            const f = this.ctx.createBiquadFilter();
            f.type = type;
            f.frequency.value = freq;
            const g = this.ctx.createGain();
            this.env(g, t, peak, 0.002, dur);
            src.connect(f).connect(g).connect(this.out);
            src.start(t, Math.random() * 0.5);
            src.stop(t + dur + 0.05);
        }

        kick(t) {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.frequency.setValueAtTime(160, t);
            o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
            this.env(g, t, 0.9, 0.003, 0.3);
            o.connect(g).connect(this.out);
            o.start(t);
            o.stop(t + 0.4);
        }

        snare(t) {
            this.noise(t, 0.16, 'highpass', 1200, 0.45);
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(220, t);
            o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
            this.env(g, t, 0.3, 0.002, 0.09);
            o.connect(g).connect(this.out);
            o.start(t);
            o.stop(t + 0.15);
        }

        hat(t) {
            this.noise(t, 0.04, 'highpass', 7500, 0.16);
        }

        bass(t, midi, dur) {
            const o = this.ctx.createOscillator();
            const f = this.ctx.createBiquadFilter();
            const g = this.ctx.createGain();
            o.type = 'sawtooth';
            o.frequency.value = midiToHz(midi);
            f.type = 'lowpass';
            f.frequency.setValueAtTime(900, t);
            f.frequency.exponentialRampToValueAtTime(260, t + dur);
            f.Q.value = 6;
            this.env(g, t, 0.28, 0.005, dur);
            o.connect(f).connect(g).connect(this.out);
            o.start(t);
            o.stop(t + dur + 0.05);
        }

        lead(t, midi, dur) {
            const g = this.ctx.createGain();
            const f = this.ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = 2600;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.13, t + 0.008);
            g.gain.setValueAtTime(0.1, t + Math.max(0.02, dur - 0.04));
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
            f.connect(g).connect(this.out);
            [['square', 0], ['triangle', 7]].forEach(([type, detune]) => {
                const o = this.ctx.createOscillator();
                o.type = type;
                o.frequency.value = midiToHz(midi);
                o.detune.value = detune;
                o.connect(f);
                o.start(t);
                o.stop(t + dur + 0.1);
            });
        }

        tick(t) {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.frequency.value = 1500;
            this.env(g, t, 0.08, 0.001, 0.04);
            o.connect(g).connect(this.volume);
            o.start(t);
            o.stop(t + 0.06);
        }

        play(e, at) {
            if (e.inst === 'bass' || e.inst === 'lead') this[e.inst](at, e.midi, e.dur);
            else this[e.inst](at);
        }
    }

    window.DinoBeatEngine = { compileSong, buildChart, Synth, DIFFS };
})();
