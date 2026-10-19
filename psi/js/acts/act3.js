// Act 3: a small farmer who has to clear a new field before planting, then the view pulls back.
// A week-by-week season: pick a farm, then each week burn, hire a machine, clear by hand, build a
// firebreak or take paid work, while the dry season gets drier. Money, weeks, dryness and smoke
// units are game settings (data/assumptions.json, GAMEPLAY.md); only the cost ratio (burning is
// about a third of machines, D-19) and the pattern of drained peat burning (D-21) come from sources.
import { t, fill } from '../i18n.js';
import { el, rich, formatNumber, assumptionTag } from '../ui.js';
import { statusStrip, resetStatus, rulesBox, actionCard, reviewTable, causeList, replayRow, redraw, scrollTo } from '../play.js';

// Photos for the concession and peatland steps
const ZOOM_PHOTOS = [undefined, undefined, 'act3-plantation', 'act3-burned-peat'];

export function newAct3State() {
    return {
        farm: null,          // 'mineral' | 'peat'
        week: 1,
        money: 0,
        cleared: 0,          // hand-clearing progress
        helpers: false,
        firebreak: false,
        loan: false,
        doneWeek: null,      // week the field was ready
        method: null,
        costs: 0,
        wagesLost: 0,
        wagesEarned: 0,
        smoke: 0,
        escaped: false,
        log: [],
    };
}

export function act3Scenes({ assumptions }, { onReplay } = {}) {
    const A = assumptions.act3;
    const S = path => t(`act3.${path}`);
    const levels = t('act3.levels');
    const zoom = t('act3.zoom');
    const money = n => formatNumber(n);
    resetStatus('act3');

    const farmOf = state => A.farms[state.farm];
    const dryness = week => A.dryness[Math.min(week, A.dryness.length) - 1];
    const plantWeek = state => (state.doneWeek ? state.doneWeek + 1 : null);
    const harvest = state => {
        const w = plantWeek(state);
        if (!w) return 0;
        return A.harvest[Math.min(Math.max(w - A.deadline, 0), A.harvest.length - 1)];
    };
    const escapes = (state, week) => {
        const d = dryness(week);
        const peat = farmOf(state).peat;
        if (state.firebreak) return peat && d >= 3;
        return d >= 3 || (peat && d >= 2);
    };
    const net = state => harvest(state) - state.costs - state.wagesLost + state.wagesEarned - (state.loan ? A.loan.repay - A.loan.amount : 0);

    function status(state) {
        return statusStrip('act3', [
            { id: 'week', label: S('status.week'), value: state.week, display: t('act3.status.weekOf', { n: Math.min(state.week, A.maxWeeks), deadline: A.deadline }) },
            { id: 'money', label: S('status.money'), value: state.money, display: money(state.money) },
            { id: 'dry', label: S('status.dry'), value: dryness(state.week), display: S(`dryness.${dryness(state.week)}`) },
            { id: 'field', label: S('status.field'), value: state.doneWeek ? 'ready' : state.cleared,
                display: state.doneWeek ? S('status.ready') : t('act3.status.progress', { n: state.cleared, need: farmOf(state).handWork }) },
            { id: 'smoke', label: S('status.smoke'), value: state.smoke },
        ]);
    }

    // One week's action. Returns the log entry.
    function act(state, key) {
        const week = state.week;
        const e = { week, key, dry: dryness(week), note: '' };
        switch (key) {
            case 'burn': {
                state.money -= A.cost.burn;
                state.costs += A.cost.burn;
                const esc = escapes(state, week);
                state.escaped = esc;
                state.smoke += esc ? (farmOf(state).peat ? A.smoke.escapedPeat : A.smoke.escaped) : A.smoke.controlled;
                state.doneWeek = week;
                state.method = 'burn';
                e.note = esc ? S(farmOf(state).peat ? 'week.escapedPeat' : 'week.escaped') : S('week.burned');
                if (esc) {
                    // Putting the spread fire out takes the family the next week: no wages, planting slips.
                    state.log.push(e);
                    state.week++;
                    state.wagesLost += A.wage;
                    state.doneWeek = state.week;
                    const fight = { week: state.week, key: 'fight', dry: dryness(state.week), note: t('act3.week.fight', { wage: money(A.wage) }) };
                    state.log.push(fight);
                    state.week++;
                    return fight;
                }
                break;
            }
            case 'machine':
                state.money -= A.cost.machine;
                state.costs += A.cost.machine;
                state.doneWeek = week;
                state.method = 'machine';
                e.note = S('week.machine');
                break;
            case 'hand':
                state.cleared = Math.min(farmOf(state).handWork, state.cleared + 1 + (state.helpers ? 1 : 0));
                state.wagesLost += A.wage;
                if (state.cleared >= farmOf(state).handWork) {
                    state.doneWeek = week;
                    state.method = 'hand';
                    e.note = S('week.handDone');
                } else {
                    e.note = t('act3.week.hand', { n: state.cleared, need: farmOf(state).handWork });
                }
                break;
            case 'firebreak':
                state.firebreak = true;
                state.wagesLost += A.wage;
                e.note = S('week.firebreak');
                break;
            case 'work':
                state.wagesEarned += A.wage;
                state.money += A.wage;
                e.note = S('week.work');
                break;
            default:
        }
        state.log.push(e);
        state.week++;
        return e;
    }

    const farmScene = {
        type: 'node',
        chrome: {},
        render: ctx => {
            const state = ctx.state;
            const section = el('section', { class: 'scene play' });
            const build = () => [
                el('h1', { class: 'breath-title' }, S('farm.title')),
                el('p', { class: 'para' }, S('farm.lead')),
                el('div', { class: 'actions-grid wide' }, ['mineral', 'peat'].map(key => {
                    const f = A.farms[key];
                    return actionCard({
                        label: S(`farm.${key}.label`),
                        cost: t('act3.farm.money', { money: money(f.money) }),
                        note: S(`farm.${key}.note`),
                        picked: state.farm === key,
                        onClick: () => {
                            Object.assign(state, newAct3State(), { farm: key, money: f.money });
                            ctx.onChange();
                            redraw(section, build);
                        },
                    });
                })),
                el('div', { class: 'para-wrap' }, assumptionTag(), el('p', { class: 'para small' }, rich(S('farm.note')))),
                el('div', { class: 'actions' }, el('button', {
                    class: 'btn primary', type: 'button', disabled: !state.farm, onclick: ctx.next,
                }, S('farm.start'))),
            ];
            section.append(...build());
            return section;
        },
    };

    const rulesLines = state => t('act3.rules.lines').map(line => fill(line, {
        deadline: A.deadline, burn: money(A.cost.burn), machine: money(A.cost.machine), wage: money(A.wage),
        helpers: money(A.cost.helpers), machineWeek: A.machineFrom, need: money(A.need),
        loan: money(A.loan.amount), repay: money(A.loan.repay),
        full: money(A.harvest[0]), late1: money(A.harvest[1]), late2: money(A.harvest[2]),
        hand: state.farm ? farmOf(state).handWork : '?',
        smallSmoke: A.smoke.controlled, bigSmoke: A.smoke.escaped, peatSmoke: A.smoke.escapedPeat,
    }));

    const seasonScene = {
        type: 'node',
        chrome: {},
        render: ctx => {
            const state = ctx.state;
            const section = el('section', { class: 'scene play' });
            const refresh = () => { ctx.onChange(); redraw(section, build); };

            function build() {
                const f = farmOf(state);
                const over = state.doneWeek || state.week > A.maxWeeks;
                const weeks = el('ol', { class: 'weeks' }, Array.from({ length: A.maxWeeks }, (_, k) => {
                    const w = k + 1;
                    const entry = state.log.find(e => e.week === w);
                    return el('li', { class: `week d${dryness(w)}${w === state.week && !over ? ' now' : ''}${w > A.deadline ? ' late' : ''}` },
                        el('span', { class: 'wk-n' }, t('act3.weekShort', { n: w })),
                        el('span', { class: 'wk-dry' }, S(`dryness.${dryness(w)}`)),
                        el('span', { class: 'wk-act' }, entry ? S(`do.${entry.key}.short`) : (plantWeek(state) === w ? S('do.plant') : '')),
                    );
                }));
                const parts = [
                    el('h1', { class: 'breath-title' }, over ? S('season.overTitle') : t('act3.season.title', { n: state.week })),
                    status(state),
                    weeks,
                    el('p', { class: 'para small' }, t('act3.season.deadline', { n: A.deadline })),
                ];
                const last = state.log[state.log.length - 1];
                if (last) parts.push(el('div', { class: 'result-box' }, el('p', { class: 'result' }, last.note)));
                if (over) {
                    parts.push(el('div', { class: 'actions' }, el('button', { class: 'btn primary', type: 'button', onclick: ctx.next }, S('season.toResult'))));
                    return parts;
                }
                const take = key => () => {
                    act(state, key);
                    refresh();
                    scrollTo(section);
                };
                const d = dryness(state.week);
                const burnReason = state.money < A.cost.burn ? t('common.notEnoughMoney') : d < 2 ? S('do.burn.tooWet') : '';
                const machineReason = state.week < A.machineFrom ? t('act3.do.machine.notYet', { n: A.machineFrom })
                    : state.money < A.cost.machine ? S('do.machine.needLoan') : '';
                const risk = escapes(state, state.week);
                const handWeeks = Math.ceil((f.handWork - state.cleared) / (state.helpers ? 2 : 1));
                const cards = [
                    actionCard({
                        label: S('do.burn.label'), cost: t('act3.do.burn.cost', { cost: money(A.cost.burn) }),
                        note: burnReason ? '' : (risk ? S('do.burn.riskHigh') : S('do.burn.riskLow')),
                        tone: !burnReason && risk ? 'risky' : '', disabled: !!burnReason, reason: burnReason, onClick: take('burn'),
                    }),
                    actionCard({
                        label: S('do.machine.label'), cost: t('act3.do.machine.cost', { cost: money(A.cost.machine) }),
                        note: S('do.machine.note'), disabled: !!machineReason, reason: machineReason, onClick: take('machine'),
                    }),
                    actionCard({
                        label: S('do.hand.label'),
                        cost: t('act3.do.hand.cost', { wage: money(A.wage), n: handWeeks }),
                        note: t('act3.do.hand.note', { n: state.cleared, need: f.handWork }), onClick: take('hand'),
                    }),
                    state.firebreak
                        ? actionCard({ label: S('do.firebreak.label'), cost: S('do.firebreak.done'), disabled: true })
                        : actionCard({ label: S('do.firebreak.label'), cost: t('act3.do.firebreak.cost', { wage: money(A.wage) }), note: S('do.firebreak.note'), onClick: take('firebreak') }),
                    actionCard({ label: S('do.work.label'), cost: t('act3.do.work.cost', { wage: money(A.wage) }), note: S('do.work.note'), onClick: take('work') }),
                ];
                const extras = [
                    state.helpers
                        ? actionCard({ label: S('do.helpers.label'), cost: S('do.helpers.done'), disabled: true })
                        : actionCard({
                            label: S('do.helpers.label'), cost: t('act3.do.helpers.cost', { cost: money(A.cost.helpers) }), note: S('do.helpers.note'),
                            disabled: state.money < A.cost.helpers, reason: t('common.notEnoughMoney'),
                            onClick: () => { state.helpers = true; state.money -= A.cost.helpers; state.costs += A.cost.helpers; refresh(); },
                        }),
                    state.loan
                        ? actionCard({ label: S('do.loan.label'), cost: S('do.loan.done'), disabled: true })
                        : actionCard({
                            label: S('do.loan.label'), cost: t('act3.do.loan.cost', { amount: money(A.loan.amount), repay: money(A.loan.repay) }), note: S('do.loan.note'),
                            onClick: () => { state.loan = true; state.money += A.loan.amount; refresh(); },
                        }),
                ];
                parts.push(
                    el('h2', { class: 'section-title' }, S('season.weekTitle')),
                    el('div', { class: 'actions-grid' }, cards),
                    el('h2', { class: 'section-title' }, S('season.extraTitle')),
                    el('p', { class: 'para small' }, S('season.extraLead')),
                    el('div', { class: 'actions-grid' }, extras),
                    rulesBox(S('rules.title'), rulesLines(state), state.week === 1),
                );
                return parts;
            }

            section.append(...build());
            return section;
        },
    };

    const outcome = {
        type: 'node',
        chrome: {},
        render: ctx => {
            const state = ctx.state;
            const f = farmOf(state);
            const result = net(state);
            const met = result >= A.need;
            const pw = plantWeek(state);
            const causes = [
                { kind: 'yours', text: state.method ? t(`act3.outcome.c_${state.method}`, { week: state.doneWeek }) : S('outcome.cNone') },
                pw ? { kind: 'yours', text: t(pw <= A.deadline ? 'act3.outcome.cOnTime' : 'act3.outcome.cLate', { week: pw, harvest: money(harvest(state)) }) } : null,
                state.wagesLost ? { kind: 'yours', text: t('act3.outcome.cWages', { n: money(state.wagesLost) }) } : null,
                state.loan ? { kind: 'yours', text: t('act3.outcome.cLoan', { n: money(A.loan.repay - A.loan.amount) }) } : null,
                state.escaped ? { kind: 'yours', text: S('outcome.cEscaped') } : null,
                { kind: 'outside', text: rich(S('outcome.cRatio')) },
                { kind: 'outside', text: rich(S('outcome.cDry')) },
                f.peat ? { kind: 'outside', text: rich(S('outcome.cPeat')) } : null,
                { kind: 'outside', text: S('outcome.cMachine') },
            ].filter(Boolean);
            const rows = state.log.map(e => [t('act3.weekShort', { n: e.week }), S(`do.${e.key}.short`), S(`dryness.${e.dry}`), e.note]);
            return el('section', { class: 'scene play' },
                el('h1', { class: 'breath-title' }, S('outcome.title')),
                el('p', { class: 'para' }, t('act3.outcome.lead', {
                    farm: S(`farm.${state.farm}.label`), net: money(result), need: money(A.need), smoke: state.smoke,
                })),
                el('p', { class: met ? 'para good' : 'warn' }, met ? S('outcome.met') : S('outcome.notMet')),
                el('div', { class: 'para-wrap' }, assumptionTag(), el('p', { class: 'para small' }, S('outcome.smokeNote'))),
                el('h2', { class: 'section-title' }, S('outcome.whyTitle')),
                causeList(causes),
                reviewTable(S('outcome.reviewTitle'), t('act3.outcome.reviewHead'), rows),
                el('p', { class: 'para' }, rich(S('outcome.lesson'))),
                el('p', { class: 'para small' }, S('outcome.tryOther')),
                replayRow(onReplay, ctx.next),
            );
        },
    };

    return [
        { type: 'card', chrome: {}, ...t('act3.card') },
        ...t('act3.intro').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        farmScene,
        seasonScene,
        outcome,
        ...t('act3.after').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        ...zoom.map((step, i) => ({
            type: 'zoom',
            chrome: {},
            level: i,
            levels,
            kicker: t('act3.zoomKicker', { n: i + 1, total: zoom.length }),
            title: step.title,
            paras: step.paras,
            photo: ZOOM_PHOTOS[i],
        })),
        ...t('act3.end').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        { type: 'breath', chrome: {}, ...t('act3.breath') },
    ];
}
