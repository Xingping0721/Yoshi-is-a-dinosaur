// Act 4: the player's own shopping basket, then a small investigation.
// Pick one marked product, spend a limited number of checks on clues, watch an evidence chain fill in
// (verified / uncertain / unknown), then choose a conclusion. The conclusion is judged against the
// evidence the player actually collected; "the evidence is not enough" is a valid answer.
// The products, the label wording and the maker's reply are game settings; the other clues are sourced.
import { t } from '../i18n.js';
import { el, rich, assumptionTag, sourceChip } from '../ui.js';
import { reviewTable, replayRow, redraw, scrollTo } from '../play.js';

// Each clue: which link of the chain it informs, and what it shows there.
const CLUES = [
    { id: 'label', link: 'contains', shows: 'uncertain', source: null },
    { id: 'imports', link: 'origin', shows: 'verified', source: 'D-26' },
    { id: 'maker', link: 'plantation', shows: 'unknown', source: null },
    { id: 'alerts', link: 'fires', shows: 'pattern', source: 'D-22' },
    { id: 'report', link: 'fires', shows: 'claim', source: 'D-24' },
    { id: 'finance', link: 'money', shows: 'verified', source: 'D-28' },
    { id: 'switching', link: 'contains', shows: 'context', source: 'D-27' },
];
const LINKS = ['contains', 'origin', 'plantation', 'fires'];
const CONCLUSIONS = ['caused', 'probable', 'none', 'insufficient'];

export function newAct4State() {
    return { basket: [], target: null, clues: [], conclusion: null };
}

// What the chain shows for each link, given the clues collected (most informative first).
const RANK = { verified: 4, pattern: 3, claim: 2, uncertain: 1, unknown: 1, context: 0 };
export function chainOf(clues) {
    const out = {};
    for (const link of [...LINKS, 'money']) {
        const found = CLUES.filter(c => c.link === link && clues.includes(c.id) && c.shows !== 'context');
        out[link] = found.length ? found.sort((a, b) => RANK[b.shows] - RANK[a.shows])[0].shows : 'unchecked';
    }
    return out;
}

// How well a conclusion fits the collected evidence: 'fits' | 'partly' | 'overclaims' | 'unsupported' | 'contradicted'.
export function judge(conclusion, clues) {
    const has = id => clues.includes(id);
    switch (conclusion) {
        case 'caused': return 'overclaims';
        case 'probable': return has('imports') ? 'fits' : 'unsupported';
        case 'none': return has('imports') || has('alerts') ? 'contradicted' : 'unsupported';
        case 'insufficient': return has('imports') || has('alerts') ? 'partly' : 'fits';
        default: return 'unsupported';
    }
}

export function act4Scenes({ assumptions }, { onReplay } = {}) {
    const A = assumptions.act4;
    const S = path => t(`act4.${path}`);
    const name = id => t(`act4.products.${id}`);
    const range = { min: A.minItems, max: A.maxItems };

    const shelf = {
        type: 'node',
        chrome: {},
        render: ctx => {
            const picked = new Set(ctx.state.basket);
            const count = el('p', { class: 'shelf-count', 'aria-live': 'polite' });
            const checkout = el('button', { class: 'btn primary', type: 'button' }, S('shelf.checkout'));
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
                ctx.state.target = null;
                ctx.state.clues = [];
                ctx.state.conclusion = null;
                ctx.next();
            });
            update();
            return el('section', { class: 'scene' },
                el('h1', { class: 'breath-title' }, S('shelf.title')),
                assumptionTag(),
                grid,
                count,
                el('div', { class: 'actions' }, checkout),
            );
        },
    };

    // The basket, then choose which marked product to look into.
    const basket = {
        type: 'node',
        chrome: {},
        render: ctx => {
            const state = ctx.state;
            const section = el('section', { class: 'scene' });
            const items = state.basket.map(id => A.products.find(p => p.id === id));
            const marked = items.filter(p => p.palm);
            // With nothing marked in the basket, the player investigates one marked item from the shelf.
            const pool = marked.length ? marked : A.products.filter(p => p.palm);
            const build = () => [
                el('h1', { class: 'breath-title' }, S('basket.title')),
                el('ul', { class: 'basket' }, items.map(p => el('li', { class: p.palm ? 'marked' : '' },
                    el('span', { class: 'mark', 'aria-hidden': 'true' }, p.palm ? '●' : ''),
                    el('span', {}, name(p.id)),
                    p.palm ? el('span', { class: 'mark-text' }, S('basket.mark')) : null,
                ))),
                el('p', { class: 'para' }, t('act4.basket.summary', { n: items.length, m: marked.length })),
                el('div', { class: 'para-wrap' }, assumptionTag(), el('p', { class: 'para small' }, S('basket.legend'))),
                el('h2', { class: 'section-title' }, S('pick.title')),
                el('p', { class: 'para small' }, marked.length ? S('pick.lead') : S('pick.leadNone')),
                el('div', { class: 'shelf pick' }, pool.map(p => el('button', {
                    class: 'item', type: 'button', 'aria-pressed': String(state.target === p.id),
                    onclick: () => { state.target = p.id; ctx.onChange(); redraw(section, build); },
                }, name(p.id)))),
                el('div', { class: 'actions' }, el('button', {
                    class: 'btn primary', type: 'button', disabled: !state.target, onclick: ctx.next,
                }, S('pick.start'))),
            ];
            section.append(...build());
            return section;
        },
    };

    function chainView(clues) {
        const chain = chainOf(clues);
        const row = link => el('li', { class: `link ${chain[link]}` },
            el('span', { class: 'link-name' }, S(`chain.${link}`)),
            el('span', { class: 'link-state' }, S(`state.${chain[link]}`)),
        );
        return el('div', { class: 'chain' },
            el('ol', {}, LINKS.map(row)),
            el('ul', { class: 'chain-side' }, row('money')),
        );
    }

    const investigation = {
        type: 'node',
        chrome: {},
        render: ctx => {
            const state = ctx.state;
            const section = el('section', { class: 'scene play' });

            function build() {
                const left = A.checks - state.clues.length;
                const product = name(state.target);
                const cards = CLUES.map(c => {
                    const open = state.clues.includes(c.id);
                    if (open) {
                        return el('article', { class: `clue open ${c.shows}` },
                            el('div', { class: 'clue-head' },
                                el('h3', {}, S(`clue.${c.id}.title`)),
                                el('span', { class: 'clue-kind' }, S(`kind.${c.shows}`)),
                            ),
                            c.source ? null : assumptionTag(),
                            el('p', {}, rich(t(`act4.clue.${c.id}.text`, { product }))),
                            c.source ? el('div', { class: 'para-src' }, sourceChip(c.source)) : null,
                        );
                    }
                    const btn = el('button', { class: 'clue closed', type: 'button', disabled: left <= 0, 'data-focus': c.id },
                        el('span', { class: 'clue-q' }, S(`clue.${c.id}.ask`)),
                        el('span', { class: 'clue-cost' }, left <= 0 ? S('inv.noChecks') : S('inv.cost')),
                    );
                    btn.addEventListener('click', () => {
                        state.clues.push(c.id);
                        ctx.onChange();
                        redraw(section, build);
                    });
                    return btn;
                });
                return [
                    el('h1', { class: 'breath-title' }, t('act4.inv.title', { product })),
                    el('p', { class: 'para small' }, t('act4.inv.lead', { n: A.checks })),
                    el('dl', { class: 'status' },
                        el('div', { class: 'stat' }, el('dt', {}, S('inv.checksLeft')), el('dd', {}, `${left} / ${A.checks}`)),
                        el('div', { class: 'stat' }, el('dt', {}, S('inv.found')), el('dd', {}, String(state.clues.length))),
                    ),
                    el('h2', { class: 'section-title' }, S('chain.title')),
                    chainView(state.clues),
                    el('p', { class: 'para small' }, S('chain.legend')),
                    el('h2', { class: 'section-title' }, S('inv.cluesTitle')),
                    el('div', { class: 'clues' }, cards),
                    el('div', { class: 'actions' }, el('button', {
                        class: 'btn primary', type: 'button', disabled: state.clues.length === 0, onclick: ctx.next,
                    }, left > 0 ? t('act4.inv.concludeEarly', { n: left }) : S('inv.conclude'))),
                ];
            }

            section.append(...build());
            return section;
        },
    };

    const conclusion = {
        type: 'node',
        chrome: {},
        render: ctx => {
            const state = ctx.state;
            const section = el('section', { class: 'scene play' });
            const product = name(state.target);

            function build() {
                const parts = [
                    el('h1', { class: 'breath-title' }, S('end.title')),
                    el('p', { class: 'para' }, t('act4.end.lead', { product })),
                    chainView(state.clues),
                ];
                if (!state.conclusion) {
                    parts.push(el('ul', { class: 'choices' }, CONCLUSIONS.map(k => el('li', {},
                        el('button', {
                            class: 'choice', type: 'button',
                            onclick: () => { state.conclusion = k; ctx.onChange(); redraw(section, build); scrollTo(section); },
                        }, t(`act4.end.options.${k}`, { product }))))));
                    return parts;
                }
                const verdict = judge(state.conclusion, state.clues);
                const unanswered = LINKS.filter(l => ['unchecked', 'unknown', 'uncertain', 'claim'].includes(chainOf(state.clues)[l]));
                parts.push(
                    el('div', { class: `result-box verdict ${verdict}` },
                        el('p', { class: 'verdict-label' }, S(`verdict.${verdict}`)),
                        el('p', { class: 'result' }, t(`act4.end.options.${state.conclusion}`, { product })),
                        el('p', { class: 'para' }, rich(t(`act4.feedback.${state.conclusion}.${verdict}`, { product }))),
                    ),
                    unanswered.length ? el('h2', { class: 'section-title' }, S('end.openTitle')) : null,
                    unanswered.length ? el('ul', { class: 'plain-list' }, unanswered.map(l => el('li', {}, S(`open.${l}`)))) : null,
                    reviewTable(S('end.reviewTitle'), t('act4.end.reviewHead'),
                        state.clues.map(id => {
                            const c = CLUES.find(x => x.id === id);
                            return [S(`clue.${id}.title`), S(`chain.${c.link}`), S(`kind.${c.shows}`)];
                        })),
                    el('p', { class: 'para small' }, t('act4.end.skipped', {
                        list: CLUES.filter(c => !state.clues.includes(c.id)).map(c => S(`clue.${c.id}.title`)).join(t('common.listSep')) || '—',
                    })),
                    replayRow(onReplay, ctx.next),
                );
                return parts;
            }

            section.append(...build().filter(Boolean));
            return section;
        },
    };

    return [
        { type: 'card', chrome: {}, ...t('act4.card') },
        ...t('act4.intro').map(block => ({ type: 'paras', chrome: {}, paras: block.paras, vars: () => ({ ...range, n: A.checks }) })),
        shelf,
        basket,
        investigation,
        conclusion,
        ...t('act4.facts').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        { type: 'breath', chrome: {}, ...t('act4.breath') },
    ];
}

