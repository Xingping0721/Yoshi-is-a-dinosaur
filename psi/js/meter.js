// Air pollution meter. Always shows the number and the band name, never colour alone.
import { el, sourceChip, formatNumber } from './ui.js';
import { t } from './i18n.js';

// Each indicator: band upper limits, the visible scale, and where its numbers come from.
export const INDICATORS = {
    s_psi: {
        text: 'meter.s_psi',
        limits: [50, 100, 200, 300, Infinity],
        scaleMax: 400,
        ticks: [0, 50, 100, 200, 300, 400],
        source: 'D-01',
        bandSource: 'D-11',
        // how much the screen greys out at a given value (0..1)
        haze: v => Math.min(1, Math.max(0, (v - 50) / 300)),
    },
};

export function createMeter(root) {
    let ind = null;
    const label = el('p', { class: 'meter-label' });
    const chips = el('span', { class: 'meter-chips' });
    const value = el('span', { class: 'meter-value', 'aria-live': 'polite' });
    const band = el('span', { class: 'meter-band' });
    const track = el('div', { class: 'meter-track', 'aria-hidden': 'true' });
    const needle = el('div', { class: 'meter-needle' });
    const ticks = el('div', { class: 'meter-ticks', 'aria-hidden': 'true' });
    const note = el('p', { class: 'meter-note', hidden: true });

    root.append(
        el('div', { class: 'meter-head' }, label, chips),
        el('div', { class: 'meter-main' }, value, band),
        track,
        ticks,
        note,
    );

    function configure(key) {
        ind = INDICATORS[key];
        const text = t(ind.text);
        label.textContent = text.label;
        chips.replaceChildren(sourceChip(ind.source));
        track.replaceChildren();
        let from = 0;
        ind.limits.forEach((limit, i) => {
            const to = Math.min(limit, ind.scaleMax);
            const seg = el('div', { class: `meter-seg b${i}` });
            seg.style.width = `${((to - from) / ind.scaleMax) * 100}%`;
            track.append(seg);
            from = to;
        });
        track.append(needle);
        ticks.replaceChildren(...ind.ticks.map(v => {
            const s = el('span', {}, formatNumber(v));
            s.style.left = `${(v / ind.scaleMax) * 100}%`;
            if (v === ind.scaleMax) s.style.transform = 'translateX(-100%)';
            return s;
        }));
        if (text.note) {
            note.textContent = text.note;
            note.hidden = false;
        } else {
            note.hidden = true;
        }
        set(null);
    }

    function bandIndex(v) {
        return ind.limits.findIndex(limit => v <= limit);
    }

    function set(v) {
        if (!ind) return;
        const text = t(ind.text);
        if (v === null || v === undefined) {
            value.textContent = '—';
            band.textContent = '';
            band.style.removeProperty('--band-color');
            needle.style.left = '0%';
            document.documentElement.style.setProperty('--haze', '0');
            return;
        }
        const i = bandIndex(v);
        value.textContent = formatNumber(v);
        band.textContent = t('meter.band', { band: text.bands[i] });
        band.style.setProperty('--band-color', `var(--band-${i})`);
        needle.style.left = `${Math.min(100, (v / ind.scaleMax) * 100)}%`;
        document.documentElement.style.setProperty('--haze', String(ind.haze(v)));
    }

    return { configure, set };
}

export function clearHaze() {
    document.documentElement.style.setProperty('--haze', '0');
}
