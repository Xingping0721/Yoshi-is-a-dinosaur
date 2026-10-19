// Act 1: a parent in an S-country housing estate, September–October 2015.
// A planning game: each turn covers a stretch of real days. The player buys supplies and sets
// standing rules for "unhealthy" days, then the stretch plays out on the D-01 daily PSI, which is
// not shown in advance. Points, prices and rules are game settings (data/assumptions.json, GAMEPLAY.md).
import { t, fill } from '../i18n.js';
import { figure } from '../images.js';
import { el, rich, formatNumber, shortDate, assumptionTag } from '../ui.js';
import { nextButton } from '../scenes.js';
import { statusStrip, resetStatus, rulesBox, planSwitch, actionCard, dayStrip, reviewTable, causeList, replayRow, redraw, scrollTo } from '../play.js';

// Each turn starts on a day with a sourced event and runs until the day before the next one.
const PERIODS = [
    { from: '2015-09-01', to: '2015-09-09', source: 'D-10' },
    { from: '2015-09-10', to: '2015-09-13', source: 'D-10' },
    { from: '2015-09-14', to: '2015-09-23', source: 'D-10' },
    { from: '2015-09-24', to: '2015-09-24', source: 'D-07', photo: 'act1-haze-city' },
    { from: '2015-09-25', to: '2015-09-25', source: 'D-07' },
    { from: '2015-09-26', to: '2015-10-07', source: 'D-10' },
    { from: '2015-10-08', to: '2015-10-18', source: 'D-01' },
    { from: '2015-10-19', to: '2015-10-23', source: 'D-11' },
    { from: '2015-10-24', to: '2015-10-29', source: 'D-01' },
    { from: '2015-10-30', to: '2015-10-31', source: 'D-01' },
];

const UNHEALTHY = 101;        // D-11 bands
const VERY_UNHEALTHY = 201;
const MODERATE_MAX = 100;
const SCHOOL_CLOSED = ['2015-09-25'];   // D-07

const band = v => (v <= 50 ? 0 : v <= 100 ? 1 : v <= 200 ? 2 : v <= 300 ? 3 : 4);
const weight = v => (v >= VERY_UNHEALTHY ? 2 : v >= UNHEALTHY ? 1 : 0);

export function newAct1State(assumptions) {
    return {
        money: assumptions.act1.budget,
        masks: 0,
        purifier: false,
        purifierFrom: null,
        rules: { mask: false, skip: false, close: false, purifier: false },
        bought: [],          // purchases in the current turn
        log: [],             // one entry per finished turn
        smoke: 0,
        strain: 0,
        tries: 0,
    };
}

// Figures derived from D-01 (daily maxima of the 24-hr PSI)
export function act1Stats(days) {
    const inRange = (from, to) => days.filter(d => d.date >= from && d.date <= to);
    const peak = days.reduce((a, b) => (b.max > a.max ? b : a));
    return {
        peak,
        unhealthySepOct: inRange('2015-09-01', '2015-10-31').filter(d => d.max >= UNHEALTHY).length,
        veryUnhealthySepOct: inRange('2015-09-01', '2015-10-31').filter(d => d.max >= VERY_UNHEALTHY).length,
        unhealthyAfterNotice: inRange('2015-09-26', '2015-10-31').filter(d => d.max >= UNHEALTHY).length,
        lastModerateBefore: date => [...days].reverse().find(d => d.date < date && d.max <= MODERATE_MAX),
        veryUnhealthyCount: date => inRange('2015-09-01', date).filter(d => d.max >= VERY_UNHEALTHY).length,
    };
}

// Points for one day under a plan (game rules; see rulesLines()).
export function scoreDay(psi, date, plan, P) {
    const w = weight(psi);
    if (!w) return { smoke: 0, strain: 0, mask: false };
    const masked = plan.mask && plan.hasMask;
    const school = SCHOOL_CLOSED.includes(date) ? 0 : (masked ? P.tripMasked : P.trip);
    const play = plan.skip ? 0 : (masked ? P.playMasked : P.play);
    const home = plan.close ? (plan.purifier ? P.homePurifier : P.homeClosed) : P.homeOpen;
    return {
        smoke: w * (school + play + home),
        strain: (plan.skip ? P.strainSkip : 0) + (plan.close ? P.strainClose : 0),
        mask: masked,
        school: school === 0 && SCHOOL_CLOSED.includes(date),
    };
}

export function act1Scenes({ psiDays, assumptions }, { onReplay } = {}) {
    const A = assumptions.act1;
    const P = A.points;
    const byDate = new Map(psiDays.map(d => [d.date, d]));
    const stats = act1Stats(psiDays);
    const money = n => t('common.money', { n: formatNumber(n) });
    const daysOf = p => psiDays.filter(d => d.date >= p.from && d.date <= p.to);
    const soldOut = p => A.maskSoldOutDays.includes(p.from);
    const S = path => t(`act1.${path}`);

    // Totals for "no precautions" and "every precaution" over the whole two months, for comparison.
    resetStatus('act1');
    const allDays = psiDays.filter(d => d.date >= PERIODS[0].from && d.date <= PERIODS[PERIODS.length - 1].to);
    const sum = plan => allDays.reduce((n, d) => n + scoreDay(d.max, d.date, plan, P).smoke, 0);
    const baseline = sum({ mask: false, skip: false, close: false });
    const floor = sum({ mask: true, hasMask: true, skip: true, close: true, purifier: true });

    const rulesLines = () => t('act1.rules.lines').map(line => fill(line, {
        ...P, box: A.masksPerBox, boxPrice: money(A.prices.n95Box), purifierPrice: money(A.prices.purifier),
    }));

    function status(state) {
        return statusStrip('act1', [
            { id: 'money', label: S('status.money'), value: state.money, display: money(state.money) },
            { id: 'masks', label: S('status.masks'), value: state.masks, display: t('act1.status.masksN', { n: state.masks }) },
            { id: 'purifier', label: S('status.purifier'), value: state.purifier ? 1 : 0, display: state.purifier ? S('status.yes') : S('status.no') },
            { id: 'smoke', label: S('status.smoke'), value: state.smoke },
            { id: 'strain', label: S('status.strain'), value: state.strain },
        ]);
    }

    function effectivePlan(state) {
        const r = state.rules;
        return { mask: r.mask, hasMask: true, skip: r.skip, close: r.close, purifier: r.close && r.purifier && state.purifier };
    }

    function run(state, p, i) {
        const plan = effectivePlan(state);
        const entry = {
            rules: { ...plan, mask: state.rules.mask },
            bought: state.bought.slice(),
            days: [], smoke: 0, strain: 0, masksUsed: 0, bad: 0, ranOut: null, schoolClosed: null,
        };
        for (const d of daysOf(p)) {
            const r = scoreDay(d.max, d.date, { ...plan, hasMask: state.masks > 0 }, P);
            if (weight(d.max)) entry.bad++;
            if (plan.mask && weight(d.max) && state.masks === 0 && !entry.ranOut) entry.ranOut = d.date;
            if (r.mask) { state.masks--; entry.masksUsed++; }
            if (r.school) entry.schoolClosed = d.date;
            entry.smoke += r.smoke;
            entry.strain += r.strain;
            entry.days.push({ date: d.date, psi: d.max, smoke: r.smoke, mask: r.mask });
        }
        state.smoke += entry.smoke;
        state.strain += entry.strain;
        state.bought = [];
        state.log[i] = entry;
    }

    function buy(state, item, p) {
        if (item === 'box') {
            state.money -= A.prices.n95Box;
            state.masks += A.masksPerBox;
        } else {
            state.money -= A.prices.purifier;
            state.purifier = true;
            state.purifierFrom = p.from;
        }
        state.bought.push(item);
    }

    function periodScene(p, i) {
        const first = byDate.get(p.from);
        const days = daysOf(p);
        const text = t(`act1.days.${p.from}`);
        const before = stats.lastModerateBefore(p.from);
        const eventVars = {
            psi: formatNumber(first.max),
            since: before ? shortDate(before.date) : '',
            nth: stats.veryUnhealthyCount(p.from),
        };
        return {
            type: 'node',
            chrome: { meter: 's_psi', extinguish: true },
            date: state => (state.log[i] ? p.to : p.from),
            reading: state => (state.log[i] ? days[days.length - 1].max : first.max),
            event: { text: t(`act1.days.${p.from}.event`, eventVars), source: p.source },
            photo: p.photo,
            render: ctx => {
                const state = ctx.state;
                const section = el('section', { class: 'scene play' });
                const title = days.length > 1
                    ? t('act1.plan.title', { from: shortDate(p.from), to: shortDate(p.to), n: days.length })
                    : t('act1.plan.titleOne', { from: shortDate(p.from) });

                const build = () => {
                    const done = state.log[i];
                    const strip = days.map((d, k) => ({
                        label: String(Number(d.date.slice(8))),
                        value: done || k === 0 ? d.max : null,
                        band: band(d.max),
                        mark: done && done.days[k].mask ? S('plan.maskMark') : '',
                    }));
                    const parts = [
                        el('p', { class: 'kicker' }, t('act1.plan.kicker', { n: i + 1, total: PERIODS.length })),
                        el('h1', { class: 'breath-title' }, title),
                        p.photo && !done ? figure(p.photo) : null,
                        el('div', { class: 'story para-wrap' }, assumptionTag(), el('p', { class: 'para' }, rich(text.story))),
                        status(state),
                        dayStrip(strip, done ? S('plan.stripDone') : S('plan.stripUnknown')),
                    ];
                    if (!done) parts.push(...planControls());
                    else parts.push(...resultBlock(done, days.length), nextButton(t('common.next'), ctx.next));
                    return parts;
                };

                function planControls() {
                    const plan = effectivePlan(state);
                    const preview = scoreDay(UNHEALTHY, '2015-09-01', { ...plan, hasMask: state.masks > 0 }, P);
                    const previewVery = scoreDay(VERY_UNHEALTHY, '2015-09-01', { ...plan, hasMask: state.masks > 0 }, P);
                    const refresh = () => { ctx.onChange(); redraw(section, build); };
                    const toggle = key => on => { state.rules[key] = on; refresh(); };
                    const boxReason = soldOut(p) ? S('plan.soldOut') : state.money < A.prices.n95Box ? t('common.notEnoughMoney') : '';
                    const purReason = state.money < A.prices.purifier ? t('common.notEnoughMoney') : '';
                    const runBtn = el('button', { class: 'btn primary', type: 'button', 'data-focus': 'run' },
                        days.length > 1 ? t('act1.plan.run', { n: days.length }) : S('plan.runOne'));
                    runBtn.addEventListener('click', () => {
                        run(state, p, i);
                        ctx.onChange();
                        redraw(section, build);
                        scrollTo(section);
                    });
                    return [
                        el('h2', { class: 'section-title' }, S('plan.shopTitle')),
                        el('div', { class: 'actions-grid' },
                            actionCard({
                                label: S('plan.buyBox'),
                                cost: t('act1.plan.buyBoxCost', { price: money(A.prices.n95Box), n: A.masksPerBox }),
                                disabled: !!boxReason, reason: boxReason,
                                onClick: () => { buy(state, 'box', p); refresh(); },
                            }),
                            state.purifier
                                ? actionCard({ label: S('plan.buyPurifier'), cost: S('plan.owned'), disabled: true })
                                : actionCard({
                                    label: S('plan.buyPurifier'), cost: money(A.prices.purifier),
                                    disabled: !!purReason, reason: purReason,
                                    onClick: () => { buy(state, 'purifier', p); refresh(); },
                                }),
                        ),
                        state.bought.length ? el('p', { class: 'para small' }, t('act1.plan.boughtNow', { list: boughtText(state.bought) })) : null,
                        el('h2', { class: 'section-title' }, S('plan.rulesTitle')),
                        el('p', { class: 'para small' }, S('plan.rulesLead')),
                        el('div', { class: 'switches' },
                            withFocus('mask', planSwitch({ label: S('plan.mask'), hint: S('plan.maskHint'), on: state.rules.mask, onToggle: toggle('mask') })),
                            withFocus('skip', planSwitch({ label: S('plan.skip'), hint: S('plan.skipHint'), on: state.rules.skip, onToggle: toggle('skip') })),
                            withFocus('close', planSwitch({ label: S('plan.close'), hint: S('plan.closeHint'), on: state.rules.close, onToggle: toggle('close') })),
                            withFocus('purifier', planSwitch({
                                label: S('plan.purifier'), hint: S('plan.purifierHint'),
                                on: state.rules.purifier && state.purifier && state.rules.close,
                                disabled: !state.purifier || !state.rules.close,
                                reason: !state.purifier ? S('plan.noPurifier') : S('plan.needClose'),
                                onToggle: toggle('purifier'),
                            })),
                        ),
                        el('p', { class: 'preview' }, t('act1.plan.preview', {
                            smoke: preview.smoke, smokeVery: previewVery.smoke, strain: preview.strain,
                            masks: preview.mask ? 1 : 0,
                        })),
                        state.rules.mask && state.masks === 0 ? el('p', { class: 'warn' }, S('plan.noMasks')) : null,
                        rulesBox(S('rules.title'), rulesLines(), i === 0),
                        el('div', { class: 'actions' }, runBtn),
                    ];
                }

                section.append(...build().filter(Boolean));
                return section;
            },
        };
    }

    const withFocus = (key, node) => { node.dataset.focus = key; return node; };
    const boughtText = list => list.map(b => S(b === 'box' ? 'plan.boughtBox' : 'plan.boughtPurifier')).join(t('common.listSep'));

    function resultBlock(done, n) {
        const notes = [];
        if (!done.bad) notes.push(S('result.allClear'));
        if (done.schoolClosed) notes.push(t('act1.result.schoolClosed', { date: shortDate(done.schoolClosed) }));
        if (done.ranOut) notes.push(t('act1.result.ranOut', { date: shortDate(done.ranOut) }));
        return [
            el('div', { class: 'result-box' },
                el('p', { class: 'result' }, t('act1.result.summary', {
                    n, bad: done.bad, smoke: done.smoke, strain: done.strain, used: done.masksUsed,
                })),
                ...notes.map(x => el('p', { class: 'para small' }, x)),
            ),
        ];
    }

    function planText(r) {
        const on = [];
        if (r.mask) on.push(S('review.mask'));
        if (r.skip) on.push(S('review.skip'));
        if (r.close) on.push(S('review.close'));
        if (r.purifier) on.push(S('review.purifier'));
        return on.length ? on.join(t('common.listSep')) : S('review.none');
    }

    const outcome = {
        type: 'node',
        chrome: {},
        render: ctx => {
            const state = ctx.state;
            const log = state.log.filter(Boolean);
            const masked = log.reduce((n, e) => n + e.masksUsed, 0);
            const closedDays = log.reduce((n, e) => n + (e.rules.close ? e.bad : 0), 0);
            const skipped = log.reduce((n, e) => n + (e.rules.skip ? e.bad : 0), 0);
            const purifierDays = log.reduce((n, e) => n + (e.rules.purifier ? e.bad : 0), 0);
            const ranOut = log.find(e => e.ranOut);
            const max = Math.max(baseline, state.smoke);
            const bar = (label, value, cls) => {
                const fill = el('span', { class: `bar-fill ${cls || ''}` });
                fill.style.width = `${(value / max) * 100}%`;
                return el('li', { class: 'bar-row' },
                    el('div', { class: 'bar-head' }, el('span', { class: 'bar-label' }, label), el('span', { class: 'bar-value' }, String(value))),
                    el('span', { class: 'bar-track', 'aria-hidden': 'true' }, fill));
            };
            const yours = [
                { kind: 'yours', text: t('act1.outcome.cMasks', { n: masked, bad: stats.unhealthySepOct }) },
                { kind: 'yours', text: t('act1.outcome.cClose', { n: closedDays }) },
                { kind: 'yours', text: t('act1.outcome.cSkip', { n: skipped }) },
                state.purifier ? { kind: 'yours', text: t('act1.outcome.cPurifier', { date: shortDate(state.purifierFrom || PERIODS[0].from), n: purifierDays }) } : null,
                ranOut ? { kind: 'yours', text: t('act1.outcome.cRanOut', { date: shortDate(ranOut.ranOut) }) } : null,
                { kind: 'outside', text: rich(t('act1.outcome.cDays', { bad: stats.unhealthySepOct, very: stats.veryUnhealthySepOct })) },
                { kind: 'outside', text: S('outcome.cSoldOut') },
                { kind: 'outside', text: rich(S('outcome.cFloor')) },
            ].filter(Boolean);
            const rows = PERIODS.map((p, i) => {
                const e = state.log[i];
                const range = p.from === p.to ? shortDate(p.from) : `${shortDate(p.from)}–${shortDate(p.to)}`;
                return e
                    ? [range, planText(e.rules), e.bought.length ? boughtText(e.bought) : '—', String(e.smoke), String(e.strain)]
                    : [range, '—', '—', '—', '—'];
            });
            resetStatus('act1');
            return el('section', { class: 'scene play' },
                el('h1', { class: 'breath-title' }, S('outcome.title')),
                el('p', { class: 'para' }, t('act1.outcome.lead', { smoke: state.smoke, strain: state.strain, money: money(state.money) })),
                el('ul', { class: 'bars' },
                    bar(S('outcome.barNone'), baseline, 'muted'),
                    bar(S('outcome.barYou'), state.smoke, 'you'),
                    bar(S('outcome.barAll'), floor, 'muted'),
                ),
                el('div', { class: 'para-wrap' }, assumptionTag(), el('p', { class: 'para small' }, S('outcome.barNote'))),
                el('h2', { class: 'section-title' }, S('outcome.whyTitle')),
                causeList(yours),
                reviewTable(S('outcome.reviewTitle'), t('act1.outcome.reviewHead'), rows),
                el('p', { class: 'para' }, S('outcome.lesson')),
                replayRow(onReplay, ctx.next),
            );
        },
    };

    const lastDay = byDate.get(PERIODS[PERIODS.length - 1].to);

    return [
        { type: 'card', chrome: {}, ...t('act1.card') },
        ...t('act1.intro').map(block => ({
            type: 'paras',
            chrome: { meter: 's_psi', extinguish: true },
            paras: block.paras,
            vars: () => ({ money: money(A.budget) }),
        })),
        ...PERIODS.map(periodScene),
        outcome,
        ...t('act1.end').map(block => ({
            type: 'paras',
            chrome: { meter: 's_psi', extinguish: true },
            psi: lastDay.max,
            paras: state => block.paras.filter(p => !p.when || (p.when === 'tried') === state.tries > 0),
            vars: state => ({ days: stats.unhealthyAfterNotice, tries: state.tries }),
        })),
        {
            type: 'breath',
            chrome: {},
            ...t('act1.breath'),
            vars: () => ({ peak: formatNumber(stats.peak.max), days: stats.unhealthySepOct }),
        },
    ];
}
