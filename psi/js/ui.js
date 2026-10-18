// Small DOM helpers shared by every screen.
import { t, fill } from './i18n.js';

export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === false || v === null || v === undefined) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
        if (c === null || c === undefined || c === false) continue;
        node.append(c instanceof Node ? c : String(c));
    }
    return node;
}

// Turn "…{{341|D-07}}…" into text plus tappable numbers that open their source.
const MARK = /\{\{([^{}|]+)\|(D-\d{2})\}\}/g;
export function rich(str, vars) {
    const s = fill(str, vars);
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of s.matchAll(MARK)) {
        if (m.index > last) frag.append(s.slice(last, m.index));
        frag.append(numButton(m[1], m[2]));
        last = m.index + m[0].length;
    }
    if (last < s.length) frag.append(s.slice(last));
    return frag;
}

// A link (not a button) so long phrases wrap like the text around them.
export function numButton(text, id) {
    return el('a', {
        class: 'num',
        href: `#${id}`,
        'data-source': id,
        'aria-label': `${text}（${t('common.source')} ${id}）`,
    }, text, el('span', { class: 'sid', 'aria-hidden': 'true' }, id));
}

export function sourceChip(id) {
    return el('button', {
        class: 'src',
        type: 'button',
        'data-source': id,
        'aria-label': `${t('common.source')} ${id}`,
    }, `${t('common.source')} ${id}`);
}

export function assumptionTag() {
    return el('span', { class: 'tag' }, t('common.assumption'));
}

// "2015-09-25" -> "2015年9月25日（金）"
export function formatDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const w = t('common.weekdays')[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return t('common.date', { y, m, d, w });
}

// "2015-09-21" -> "9月21日"
export function shortDate(iso) {
    const [, m, d] = iso.split('-').map(Number);
    return `${m}月${d}日`;
}

export const formatNumber = n => Number(n).toLocaleString('ja-JP');

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let toastTimer = 0;
export function toast(message) {
    const node = document.getElementById('toast');
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 2800);
}

// Storage is a convenience only; the game must work without it.
export function load(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
    } catch (e) {
        return fallback;
    }
}
export function save(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        /* storage unavailable */
    }
}
export function remove(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        /* storage unavailable */
    }
}
