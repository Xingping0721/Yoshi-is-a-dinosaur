// Act 2: a family in P city, October 2015, near the fires.
// A time-allocation game: each day has a few blocks of time to split between paid work outside,
// looking after a small child, sealing the house, the distant clinic and the mask handout point.
// The options that would cut smoke the most (a purifier, leaving town) stay locked, each with its reason.
// Blocks, money units and points are game settings (data/assumptions.json, GAMEPLAY.md).
import { t, fill } from '../i18n.js';
import { el, rich, assumptionTag, shortDate } from '../ui.js';
import { nextButton } from '../scenes.js';
import { figure } from '../images.js';
import { statusStrip, resetStatus, rulesBox, actionCard, reviewTable, causeList, replayRow, redraw, scrollTo } from '../play.js';

// Meter readings come from the sources named here; act2.readingOver ("over 1,000") is the two-week average in D-14.
const DAYS = [
    { date: '2015-10-16', reading: { value: 1889, display: '1,889', source: 'D-15' }, event: 'D-15', counter: 'D-16', clinic: false },
    { date: '2015-10-24', reading: { value: 1000, display: 'act2.readingOver', source: 'D-14' }, event: 'D-14', counter: 'D-14', clinic: true },
    { date: '2015-10-26', reading: { value: 1000, display: 'act2.readingOver', source: 'D-14' }, event: 'D-14', counter: 'D-14', clinic: true },
];

// A display given as a text key is looked up in the current language.
const localReading = r => (r.display.startsWith('act2.') ? { ...r, display: t(r.display) } : r);

export function newAct2State(assumptions) {
    return {
        money: assumptions.act2.savings,
        smoke: 0,
        sealed: false,
        maskChecked: null,
        clinicDone: false,
        plan: [],      // today's blocks: 'work' | 'care' | 'seal' | 'clinic' | 'masks'
        log: [],
        unmet: 0,
    };
}

export function act2Scenes({ psiDays, assumptions }, { onReplay } = {}) {
    const A = assumptions.act2;
    const sPsiOct16 = psiDays.find(d => d.date === '2015-10-16');
    const S = path => t(`act2.${path}`);
    resetStatus('act2');

    const blocksOf = (plan, key) => plan.filter(k => k === key).length;
    const used = plan => plan.reduce((n, k) => n + (k === 'clinic' ? A.clinic.blocks : 1), 0);
    const careOf = plan => blocksOf(plan, 'care') + (plan.includes('clinic') ? A.clinic.care : 0);

    function status(state) {
        return statusStrip('act2', [
            { id: 'money', label: S('status.money'), value: state.money },
            { id: 'smoke', label: S('status.smoke'), value: state.smoke },
            { id: 'unmet', label: S('status.unmet'), value: state.unmet },
        ]);
    }

    function settle(state, day, i) {
        const plan = state.plan;
        const work = blocksOf(plan, 'work');
        const care = careOf(plan);
        const entry = { plan: plan.slice(), notes: [], unmet: [] };
        const income = work * A.wage;
        const fee = plan.includes('clinic') ? A.clinic.fee : 0;
        if (plan.includes('seal')) state.sealed = true;
        const home = state.sealed ? A.smoke.homeSealed : A.smoke.homeOpen;
        entry.smoke = work * A.smoke.outsidePerBlock + home;
        entry.money = income - A.dailyCost - fee;
        state.money += entry.money;
        state.smoke += entry.smoke;
        if (care < A.careNeed) entry.unmet.push(S('unmet.care'));
        if (state.money < 0) {
            entry.unmet.push(t('act2.unmet.money', { n: -state.money }));
            state.money = 0;
        }
        if (day.clinic && !state.clinicDone && !plan.includes('clinic') && i === DAYS.length - 1) entry.unmet.push(S('unmet.clinic'));
        if (plan.includes('clinic')) {
            state.clinicDone = true;
            entry.notes.push(S('notes.clinic'));
        }
        if (plan.includes('masks')) {
            state.maskChecked = day.date;
            entry.notes.push(S('notes.masks'));
        }
        if (plan.includes('seal')) entry.notes.push(S('notes.seal'));
        state.unmet += entry.unmet.length;
        state.plan = [];
        state.log[i] = entry;
    }

    function dayScene(day, i) {
        const texts = t(`act2.days.${day.date}`);
        return {
            type: 'node',
            chrome: { meter: 'p_pm10' },
            date: day.date,
            reading: localReading(day.reading),
            counter: { label: t('act2.counterLabel'), text: texts.counter, source: day.counter },
            event: { text: texts.event, source: day.event },
            render: ctx => {
                const state = ctx.state;
                const section = el('section', { class: 'scene play' });
                const refresh = () => { ctx.onChange(); redraw(section, build); };

                function build() {
                    const done = state.log[i];
                    const parts = [
                        el('p', { class: 'kicker' }, t('act2.plan.kicker', { n: i + 1, total: DAYS.length })),
                        el('h1', { class: 'breath-title' }, t('act2.plan.title', { date: shortDate(day.date) })),
                        i === 0 && !done ? figure('act2-haze-mosque') : null,
                        el('div', { class: 'story para-wrap' }, assumptionTag(), el('p', { class: 'para' }, rich(texts.story))),
                        status(state),
                    ];
                    if (done) {
                        parts.push(resultBlock(done), nextButton(t('common.nextDay'), ctx.next));
                        return parts;
                    }
                    const left = A.blocks - used(state.plan);
                    const slots = el('ol', { class: 'slots', 'aria-label': t('act2.plan.slotsLabel', { n: left, total: A.blocks }) },
                        Array.from({ length: A.blocks }, (_, k) => {
                            let n = 0;
                            let key = null;
                            for (const b of state.plan) {
                                const size = b === 'clinic' ? A.clinic.blocks : 1;
                                if (k >= n && k < n + size) key = b;
                                n += size;
                            }
                            return el('li', { class: key ? `slot ${key}` : 'slot' }, key ? S(`act.${key}.short`) : '');
                        }));
                    const add = key => () => { state.plan.push(key); refresh(); };
                    const can = (size, extra) => (left < size ? S('plan.noTime') : extra || '');
                    const cards = [
                        actionCard({ label: S('act.work.label'), cost: S('act.work.cost'), note: S('act.work.note'), disabled: !!can(1), reason: can(1), onClick: add('work') }),
                        actionCard({ label: S('act.care.label'), cost: S('act.care.cost'), note: t('act2.act.care.note', { n: A.careNeed }), disabled: !!can(1), reason: can(1), onClick: add('care') }),
                        state.sealed || state.plan.includes('seal')
                            ? actionCard({ label: S('act.seal.label'), cost: S('act.seal.done'), disabled: true })
                            : actionCard({ label: S('act.seal.label'), cost: S('act.seal.cost'), note: S('act.seal.note'), disabled: !!can(1), reason: can(1), onClick: add('seal') }),
                        day.clinic
                            ? (state.clinicDone || state.plan.includes('clinic')
                                ? actionCard({ label: S('act.clinic.label'), cost: S('act.clinic.done'), disabled: true })
                                : actionCard({ label: S('act.clinic.label'), cost: t('act2.act.clinic.cost', { n: A.clinic.blocks, fee: A.clinic.fee }), note: S('act.clinic.note'), disabled: !!can(A.clinic.blocks), reason: can(A.clinic.blocks), onClick: add('clinic') }))
                            : null,
                        state.maskChecked || state.plan.includes('masks')
                            ? actionCard({ label: S('act.masks.label'), cost: state.maskChecked ? t('act2.act.masks.checked', { date: shortDate(state.maskChecked) }) : S('act.masks.cost'), disabled: true })
                            : actionCard({ label: S('act.masks.label'), cost: S('act.masks.cost'), note: S('act.masks.note'), disabled: !!can(1), reason: can(1), onClick: add('masks') }),
                        actionCard({ label: S('act.purifier.label'), disabled: true, reason: S('act.purifier.reason'), tone: 'locked' }),
                        actionCard({ label: S('act.leave.label'), disabled: true, reason: S('act.leave.reason'), tone: 'locked' }),
                    ];
                    const work = blocksOf(state.plan, 'work');
                    const fee = state.plan.includes('clinic') ? A.clinic.fee : 0;
                    const sealedAfter = state.sealed || state.plan.includes('seal');
                    const preview = {
                        money: work * A.wage - A.dailyCost - fee,
                        smoke: work * A.smoke.outsidePerBlock + (sealedAfter ? A.smoke.homeSealed : A.smoke.homeOpen),
                        care: careOf(state.plan),
                    };
                    const endBtn = el('button', { class: 'btn primary', type: 'button', 'data-focus': 'end' }, S('plan.end'));
                    endBtn.addEventListener('click', () => {
                        settle(state, day, i);
                        ctx.onChange();
                        redraw(section, build);
                        scrollTo(section);
                    });
                    parts.push(
                        el('h2', { class: 'section-title' }, t('act2.plan.slotsTitle', { n: left, total: A.blocks })),
                        slots,
                        state.plan.length ? el('div', { class: 'actions' }, el('button', { class: 'btn small', type: 'button', 'data-focus': 'undo', onclick: () => { state.plan.pop(); refresh(); } }, S('plan.undo'))) : null,
                        el('div', { class: 'actions-grid' }, cards.filter(Boolean)),
                        el('p', { class: 'preview' }, t('act2.plan.preview', {
                            money: preview.money > 0 ? `+${preview.money}` : String(preview.money),
                            smoke: preview.smoke, care: preview.care, need: A.careNeed,
                        })),
                        preview.care < A.careNeed ? el('p', { class: 'warn' }, S('plan.careWarn')) : null,
                        state.money + preview.money < 0 ? el('p', { class: 'warn' }, S('plan.moneyWarn')) : null,
                        rulesBox(S('rules.title'), t('act2.rules.lines').map(fillRule), i === 0),
                        el('div', { class: 'actions' }, endBtn),
                    );
                    return parts;
                }

                section.append(...build().filter(Boolean));
                return section;
            },
        };
    }

    const fillRule = line => fill(line, {
        blocks: A.blocks, wage: A.wage, cost: A.dailyCost,
        outside: A.smoke.outsidePerBlock, homeOpen: A.smoke.homeOpen, homeSealed: A.smoke.homeSealed,
        care: A.careNeed, clinicBlocks: A.clinic.blocks, clinicFee: A.clinic.fee, clinicCare: A.clinic.care,
    });

    function resultBlock(done) {
        return el('div', { class: 'result-box' },
            el('p', { class: 'result' }, t('act2.result.summary', {
                money: done.money > 0 ? `+${done.money}` : String(done.money), smoke: done.smoke,
            })),
            ...done.notes.map(n => el('p', { class: 'para small' }, rich(n))),
            ...done.unmet.map(u => el('p', { class: 'warn' }, u)),
        );
    }

    const planText = plan => {
        const counts = {};
        plan.forEach(k => { counts[k] = (counts[k] || 0) + 1; });
        return Object.entries(counts).map(([k, n]) => (n > 1 ? `${S(`act.${k}.short`)}×${n}` : S(`act.${k}.short`))).join(t('common.listSep')) || '—';
    };

    const outcome = {
        type: 'node',
        chrome: {},
        render: ctx => {
            const state = ctx.state;
            const workBlocks = state.log.reduce((n, e) => n + (e ? blocksOf(e.plan, 'work') : 0), 0);
            const homeSmoke = state.log.reduce((n, e) => n + (e ? e.smoke - blocksOf(e.plan, 'work') * A.smoke.outsidePerBlock : 0), 0);
            const rows = DAYS.map((d, i) => {
                const e = state.log[i];
                return e ? [shortDate(d.date), planText(e.plan), e.money > 0 ? `+${e.money}` : String(e.money), String(e.smoke), e.unmet.length ? e.unmet.join(t('common.listSep')) : '—']
                    : [shortDate(d.date), '—', '—', '—', '—'];
            });
            const causes = [
                { kind: 'yours', text: t('act2.outcome.cWork', { n: workBlocks, smoke: workBlocks * A.smoke.outsidePerBlock }) },
                { kind: 'yours', text: state.sealed ? S('outcome.cSealed') : S('outcome.cNotSealed') },
                { kind: 'outside', text: t('act2.outcome.cHome', { n: homeSmoke }) },
                { kind: 'outside', text: rich(S('outcome.cPurifier')) },
                { kind: 'outside', text: rich(S('outcome.cMasks')) },
                { kind: 'outside', text: rich(S('outcome.cLeave')) },
                { kind: 'outside', text: rich(S('outcome.cAir')) },
            ];
            return el('section', { class: 'scene play' },
                el('h1', { class: 'breath-title' }, S('outcome.title')),
                el('p', { class: 'para' }, t('act2.outcome.lead', { smoke: state.smoke, money: state.money, unmet: state.unmet })),
                el('h2', { class: 'section-title' }, S('outcome.whyTitle')),
                causeList(causes),
                reviewTable(S('outcome.reviewTitle'), t('act2.outcome.reviewHead'), rows),
                el('p', { class: 'para' }, S('outcome.lesson')),
                replayRow(onReplay, ctx.next),
            );
        },
    };

    return [
        { type: 'card', chrome: {}, ...t('act2.card') },
        ...t('act2.intro').map(block => ({ type: 'paras', chrome: { meter: 'p_pm10' }, paras: block.paras })),
        dayScene(DAYS[0], 0),
        {
            type: 'compare',
            chrome: {},
            ...t('act2.compare'),
            meters: [
                { indicator: 's_psi', reading: { value: sPsiOct16.max, source: 'D-01' } },
                { indicator: 'p_pm10', reading: localReading(DAYS[0].reading) },
            ],
        },
        dayScene(DAYS[1], 1),
        dayScene(DAYS[2], 2),
        outcome,
        ...t('act2.end').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        {
            type: 'bars',
            chrome: {},
            title: t('act2.bars.title'),
            rows: [
                { label: t('act2.bars.official'), value: 19, display: t('act2.bars.officialValue') },
                { label: t('act2.bars.estimate'), value: 91600, display: t('act2.bars.estimateValue') },
            ],
            note: t('act2.bars.note'),
        },
        ...t('act2.after').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        { type: 'breath', chrome: {}, ...t('act2.breath') },
    ];
}
