// Source sheet (one source) and the full "data and sources" screen.
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
        item.title ? el('p', { class: 'orig-title' }, item.title) : null,
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

// Full list in id order, with licences and the game settings.
export function renderSourceList({ accessed }, onBack) {
    const T = t('sourcesScreen');
    const items = allSources().sort((a, b) => a.id.localeCompare(b.id));
    const d01 = byId.get('D-01');
    const licenceUrl = 'https://data.gov.sg/open-data-licence';

    return el('section', { class: 'scene sources-screen' },
        el('h1', { class: 'breath-title' }, T.title),
        el('p', { class: 'para small' }, T.lead),

        el('h2', { class: 'section-title' }, T.licenceTitle),
        el('div', { class: 'orig-block' },
            el('p', { class: 'orig-pub', lang: 'en' }, `[${t('sourcesScreen.licenceD01', { date: (d01 && d01.accessed) || accessed })} `,
                el('a', { href: licenceUrl, target: '_blank', rel: 'noopener noreferrer' }, licenceUrl), ']'),
        ),
        el('p', { class: 'para small' }, T.licenceD02),

        el('h2', { class: 'section-title' }, T.listTitle),
        el('ul', { class: 'src-list' }, items.map(s => el('li', { class: 'src-item', id: `src-${s.id}` },
            el('h3', {}, s.id),
            el('p', { class: 'src-label' }, s.label),
            s.note ? el('p', { class: 'src-note' }, s.note) : null,
            ...[s, ...(s.more || [])].map(link => el('div', { class: 'src-link' },
                link.title ? el('p', { class: 'orig-title' }, link.title) : null,
                el('p', { class: 'orig-pub' }, [link.publisher, link.date].filter(Boolean).join('　')),
                el('a', { class: 'orig-link', href: link.url, target: '_blank', rel: 'noopener noreferrer' }, link.url),
            )),
            el('p', { class: 'meta-line' }, s.used && s.used.length ? t('sourcesScreen.usedIn', { where: s.used.join('・') }) : T.notUsed),
            el('p', { class: 'meta-line' }, `${t('sheet.statusLabel')}：${t('sheet.status')[s.status] || s.status}`),
            s.check ? el('p', { class: 'meta-line' }, t('sourcesScreen.check', { text: s.check })) : null,
            s.accessed ? el('p', { class: 'meta-line' }, t('sheet.accessed', { date: s.accessed })) : null,
            s.licence ? el('p', { class: 'meta-line' }, t('sheet.licence', { licence: s.licence })) : null,
        ))),

        el('h2', { class: 'section-title' }, T.assumptionsTitle),
        el('p', { class: 'para small' }, T.assumptionsLead),
        el('ul', { class: 'plain-list' }, T.assumptions.map(a => el('li', {}, a))),

        el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', onclick: onBack }, T.back)),
    );
}
