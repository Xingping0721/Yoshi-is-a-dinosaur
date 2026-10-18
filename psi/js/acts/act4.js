// Act 4: the player's own shopping basket.
import { t } from '../i18n.js';
import { el, assumptionTag } from '../ui.js';
import { nextButton } from '../scenes.js';

export function newAct4State() {
    return { basket: [] };
}

export function act4Scenes({ assumptions }) {
    const A = assumptions.act4;
    const name = id => t(`act4.products.${id}`);
    const range = { min: A.minItems, max: A.maxItems };

    const shelf = {
        type: 'node',
        chrome: {},
        render: ctx => {
            const picked = new Set(ctx.state.basket);
            const count = el('p', { class: 'shelf-count', 'aria-live': 'polite' });
            const checkout = el('button', { class: 'btn primary', type: 'button' }, t('act4.shelf.checkout'));
            const update = () => {
                count.textContent = t('act4.shelf.count', { n: picked.size, ...range });
                checkout.disabled = picked.size < A.minItems || picked.size > A.maxItems;
            };
            const grid = el('ul', { class: 'shelf' }, A.products.map(p => {
                const btn = el('button', { class: 'item', type: 'button', 'aria-pressed': String(picked.has(p.id)) }, name(p.id));
                btn.addEventListener('click', () => {
                    if (picked.has(p.id)) picked.delete(p.id);
                    else if (picked.size < A.maxItems) picked.add(p.id);
                    btn.setAttribute('aria-pressed', String(picked.has(p.id)));
                    update();
                });
                return el('li', {}, btn);
            }));
            checkout.addEventListener('click', () => {
                // keep shelf order so the basket reads the same way
                ctx.state.basket = A.products.map(p => p.id).filter(id => picked.has(id));
                ctx.next();
            });
            update();
            return el('section', { class: 'scene' },
                el('h1', { class: 'breath-title' }, t('act4.shelf.title')),
                assumptionTag(),
                grid,
                count,
                el('div', { class: 'actions' }, checkout),
            );
        },
    };

    const basket = {
        type: 'node',
        chrome: {},
        render: ctx => {
            const items = ctx.state.basket.map(id => A.products.find(p => p.id === id));
            const marked = items.filter(p => p.palm).length;
            return el('section', { class: 'scene' },
                el('h1', { class: 'breath-title' }, t('act4.basket.title')),
                el('ul', { class: 'basket' }, items.map(p => el('li', { class: p.palm ? 'marked' : '' },
                    el('span', { class: 'mark', 'aria-hidden': 'true' }, p.palm ? '●' : ''),
                    el('span', {}, name(p.id)),
                    p.palm ? el('span', { class: 'mark-text' }, t('act4.basket.mark')) : null,
                ))),
                el('p', { class: 'para' }, t('act4.basket.summary', { n: items.length, m: marked })),
                el('div', { class: 'para-wrap' }, assumptionTag(), el('p', { class: 'para small' }, t('act4.basket.legend'))),
                nextButton(null, ctx.next),
            );
        },
    };

    return [
        { type: 'card', chrome: {}, ...t('act4.card') },
        ...t('act4.intro').map(block => ({ type: 'paras', chrome: {}, paras: block.paras, vars: () => range })),
        shelf,
        basket,
        ...t('act4.facts').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        { type: 'breath', chrome: {}, ...t('act4.breath') },
    ];
}
