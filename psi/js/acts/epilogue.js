// Epilogue: the same thing, now. Figures come from data/now.json, which carries its own date.
import { t, local } from '../i18n.js';
import { el, rich, sourceChip, longDate } from '../ui.js';
import { nextButton } from '../scenes.js';

// Values in now.json may be given per language ({ "ja": …, "en": … }).
const localVars = vars => Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, local(v)]));

export function epilogueScenes({ now }, { onSources, onRestart }) {
    const asOf = t('epilogue.asOf', { date: longDate(now.asOf) });

    const figures = {
        type: 'node',
        chrome: {},
        render: ctx => el('section', { class: 'scene' },
            el('h1', { class: 'breath-title' }, t('epilogue.lead')),
            el('p', { class: 'asof' }, asOf),
            el('p', { class: 'para' }, rich(t('epilogue.past'))),
            el('ul', { class: 'now-list' }, now.items.map(item => el('li', { class: 'now-item' },
                el('div', { class: 'now-head' },
                    el('span', { class: 'now-date' }, t('epilogue.itemDate', { date: longDate(item.date) })),
                    sourceChip(item.id),
                ),
                el('p', { class: 'now-text' }, rich(t(`epilogue.items.${item.id}`, localVars(item.vars)))),
            ))),
            nextButton(null, ctx.next),
        ),
    };

    const closing = {
        type: 'node',
        chrome: {},
        render: () => el('section', { class: 'scene' },
            el('h1', { class: 'breath-title' }, t('epilogue.linksTitle')),
            el('ul', { class: 'link-list' }, now.links.map(link => el('li', {},
                el('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer' }, `${t(`epilogue.links.${link.id}`)} ↗`),
            ))),
            el('p', { class: 'end-mark' }, t('epilogue.endTitle')),
            el('div', { class: 'stack' },
                el('button', { class: 'btn primary wide', type: 'button', onclick: onSources }, t('epilogue.sources')),
                el('button', { class: 'btn wide', type: 'button', onclick: onRestart }, t('epilogue.restart')),
            ),
        ),
    };

    return [
        { type: 'card', chrome: {}, ...t('epilogue.card') },
        figures,
        closing,
    ];
}
