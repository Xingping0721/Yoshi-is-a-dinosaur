// Source sheet (one source) and the full list of data and sources.
import { el } from './ui.js';
import { t } from './i18n.js';

let byId = new Map();
let lastFocus = null;

export function initSources(list) {
    byId = new Map(list.map(s => [s.id, s]));
    // Any element with data-source opens that source.
    document.addEventListener('click', e => {
        const trigger = e.target.closest('[data-source]');
        if (trigger) {
            e.preventDefault();
            openSource(trigger.dataset.source, trigger);
        }
    });
    const backdrop = document.getElementById('sheetBackdrop');
    backdrop.addEventListener('click', e => {
        if (e.target === backdrop) closeSource();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !backdrop.hidden) closeSource();
    });
}

export const getSource = id => byId.get(id);
export const allSources = () => [...byId.values()];

function linkBlock(item) {
    return el('div', { class: 'orig-block' },
        item.title ? el('p', { class: 'orig-title', lang: 'en' }, item.title) : null,
        el('p', { class: 'orig-pub' }, [item.publisher, item.date].filter(Boolean).join('　')),
        el('a', { class: 'orig-link', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, `${t('common.openSource')} ↗`),
    );
}

export function openSource(id, trigger) {
    const s = byId.get(id);
    const sheet = document.getElementById('sheet');
    const backdrop = document.getElementById('sheetBackdrop');
    lastFocus = trigger || document.activeElement;
    const closeTop = el('button', { class: 'src', type: 'button', onclick: closeSource }, t('common.close'));
    const closeBottom = el('button', { class: 'btn close', type: 'button', onclick: closeSource }, t('common.close'));
    const head = label => el('div', { class: 'sheet-head' }, el('p', { class: 'sheet-id' }, label), closeTop);

    const parts = !s
        ? [head(t('common.source')), el('h2', { id: 'sheetTitle' }, t('sheet.unknown', { id })), closeBottom]
        : [
            head(`${t('common.source')} ${s.id}`),
            el('h2', { id: 'sheetTitle' }, s.label),
            s.note ? el('p', { class: 'note' }, s.note) : null,
            linkBlock(s),
            ...(s.more || []).map(linkBlock),
            el('p', { class: 'meta-line' }, `${t('sheet.statusLabel')}：${t('sheet.status')[s.status] || s.status}`),
            s.accessed ? el('p', { class: 'meta-line' }, t('sheet.accessed', { date: s.accessed })) : null,
            s.licence ? el('p', { class: 'meta-line' }, t('sheet.licence', { licence: s.licence })) : null,
            closeBottom,
        ];
    sheet.replaceChildren(...parts.filter(Boolean));
    backdrop.hidden = false;
    sheet.scrollTop = 0;
    closeTop.focus({ preventScroll: true });
}

export function closeSource() {
    document.getElementById('sheetBackdrop').hidden = true;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

// Minimal list, in id order (full screen comes in step 5).
export function renderSourceList(onBack) {
    const items = allSources().sort((a, b) => a.id.localeCompare(b.id));
    return el('section', { class: 'scene' },
        el('h1', { class: 'breath-title' }, t('title.sources')),
        el('ul', { class: 'src-list' }, items.map(s => el('li', { class: 'src-item' },
            el('h3', {}, s.id),
            el('p', {}, s.label),
            el('p', { class: 'orig' }, [s.title, s.publisher].filter(Boolean).join(' — ')),
            el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, `${t('common.openSource')} ↗`),
        ))),
        el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', onclick: onBack }, t('common.close'))),
    );
}
