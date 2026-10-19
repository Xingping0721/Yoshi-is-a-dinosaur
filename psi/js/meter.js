// Air pollution meter. Always shows the number and the band name, never colour alone.
import { el, sourceChip, formatNumber } from './ui.js';
import { t } from './i18n.js';

const clamp01 = v => Math.min(1, Math.max(0, v));

// Each indicator: band upper limits, the visible scale, and where its numbers come from.
// Both acts use the same 0–400 track, so the P-city readings run off the scale.
export const INDICATORS = {
    s_psi: {
        text: 'meter.s_psi',
        limits: [50, 100, 200, 300, Infinity],   // D-11
        scaleMax: 400,
        ticks: [0, 50, 100, 200, 300, 400],
        source: 'D-01',
        haze: v => clamp01((v - 50) / 300),
    },
    m_api: {
        text: 'meter.m_api',
        limits: [50, 100, 200, 300, Infinity],   // D-12, D-36
        scaleMax: 400,
        ticks: [0, 50, 100, 200, 300, 400],
        source: 'D-36',
        haze: v => clamp01((v - 50) / 300),
    },
    p_pm10: {
        text: 'meter.p_pm10',
        limits: [49, 150, 250, 350, Infinity],   // D-15: below 50 good … above 350 hazardous
        scaleMax: 400,
        ticks: [0, 50, 150, 250, 350, 400],
        source: 'D-15',
        haze: () => 1,
    },
};

// A reading is a number, or { value, display, source } when the shown text differs (e.g. "1,000超").
function normalise(reading, ind) {
    if (reading === null || reading === undefined) return null;
    if (typeof reading === 'number') return { value: reading, display: formatNumber(reading), source: ind.source };
    return { display: reading.value === null ? '—' : formatNumber(reading.value), source: ind.source, ...reading };
}

function bandIndex(ind, v) {
    return ind.limits.findIndex(limit => v <= limit);
}

function buildTrack(ind) {
    const track = el('div', { class: 'meter-track', 'aria-hidden': 'true' });
    let from = 0;
    ind.limits.forEach((limit, i) => {
        const to = Math.min(limit, ind.scaleMax);
        const seg = el('div', { class: `meter-seg b${i}` });
        seg.style.width = `${((to - from) / ind.scaleMax) * 100}%`;
        track.append(seg);
        from = to;
    });
    const needle = el('div', { class: 'meter-needle' });
    track.append(needle);
    const ticks = el('div', { class: 'meter-ticks', 'aria-hidden': 'true' }, ind.ticks.map(v => {
        const s = el('span', {}, formatNumber(v));
        s.style.left = `${(v / ind.scaleMax) * 100}%`;
        if (v === ind.scaleMax) s.style.transform = 'translateX(-100%)';
        return s;
    }));
    return { track, needle, ticks };
}

function paint(ind, r, parts) {
    const text = t(ind.text);
    const { value, band, needle, over, chips } = parts;
    if (!r) {
        value.textContent = '—';
        band.textContent = '';
        band.style.removeProperty('--band-color');
        needle.style.left = '0%';
        over.hidden = true;
        chips.replaceChildren(sourceChip(ind.source));
        return;
    }
    if (r.value === null) {
        value.textContent = r.display;
        band.textContent = t('meter.band', { band: '—' });
        band.style.removeProperty('--band-color');
        needle.style.left = '0%';
        over.hidden = true;
        chips.replaceChildren(sourceChip(r.source));
        return;
    }
    const i = bandIndex(ind, r.value);
    value.textContent = r.display;
    band.textContent = t('meter.band', { band: text.bands[i] });
    band.style.setProperty('--band-color', `var(--band-${i})`);
    needle.style.left = `${Math.min(100, (r.value / ind.scaleMax) * 100)}%`;
    over.hidden = r.value <= ind.scaleMax;
    chips.replaceChildren(sourceChip(r.source));
}

function meterParts(ind) {
    const text = t(ind.text);
    const parts = {
        label: el('p', { class: 'meter-label' }, text.label),
        chips: el('span', { class: 'meter-chips' }),
        value: el('span', { class: 'meter-value', 'aria-live': 'polite' }),
        band: el('span', { class: 'meter-band' }),
        over: el('span', { class: 'meter-over', hidden: true }, `${t('meter.over')} →`),
        note: text.note ? el('p', { class: 'meter-note' }, text.note) : null,
        ...buildTrack(ind),
    };
    parts.nodes = [
        el('div', { class: 'meter-head' }, parts.label, parts.chips),
        el('div', { class: 'meter-main' }, parts.value, parts.band, parts.over),
        parts.track,
        parts.ticks,
        parts.note,
    ];
    return parts;
}

export function createMeter(root) {
    let ind = null;
    let parts = null;

    function configure(key) {
        ind = INDICATORS[key];
        parts = meterParts(ind);
        root.replaceChildren(...parts.nodes.filter(Boolean));
        set(null);
    }

    function set(reading) {
        if (!ind) return;
        const r = normalise(reading, ind);
        paint(ind, r, parts);
        document.documentElement.style.setProperty('--haze', r && r.value !== null ? String(ind.haze(r.value)) : '0');
    }

    return { configure, set };
}

// A static copy of the meter, used where two indicators sit side by side.
export function miniMeter(key, reading) {
    const ind = INDICATORS[key];
    const parts = meterParts(ind);
    paint(ind, normalise(reading, ind), parts);
    return el('div', { class: 'meter mini' }, ...parts.nodes.filter(Boolean));
}

export function clearHaze() {
    document.documentElement.style.setProperty('--haze', '0');
}
