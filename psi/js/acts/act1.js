// Act 1: a parent in an S-country housing estate, September–October 2015.
// Story text is a game setting; event lines and numbers come from sources.json.
import { t } from '../i18n.js';
import { formatNumber, shortDate } from '../ui.js';

const DAYS = [
    { date: '2015-09-01', source: 'D-10', choices: ['send', 'app'] },
    { date: '2015-09-10', source: 'D-10', choices: ['window', 'mask', 'play'] },
    { date: '2015-09-14', source: 'D-10', choices: ['clinic', 'purifier', 'wait'] },
    { date: '2015-09-24', source: 'D-07', choices: ['tell', 'count', 'shop'], photo: 'act1-haze-city' },
    { date: '2015-09-25', source: 'D-07', choices: ['shop', 'handout', 'home'] },
    { date: '2015-09-26', source: 'D-10', choices: ['news', 'out'] },
    { date: '2015-10-08', source: 'D-01', choices: ['park', 'open'] },
    { date: '2015-10-19', source: 'D-11', choices: ['purifierOn', 'purifier', 'stay'] },
    { date: '2015-10-24', source: 'D-01', choices: ['game', 'call'] },
    { date: '2015-10-30', source: 'D-01', choices: ['open', 'walk'] },
];

const UNHEALTHY = 101;
const VERY_UNHEALTHY = 201;
const MODERATE_MAX = 100;

export function newAct1State(assumptions) {
    return { money: assumptions.act1.budget, hasMask: false, hasPurifier: false, tries: 0, picks: {} };
}

// Figures derived from D-01 (daily maxima of the 24-hr PSI)
export function act1Stats(days) {
    const inRange = (from, to) => days.filter(d => d.date >= from && d.date <= to);
    const peak = days.reduce((a, b) => (b.max > a.max ? b : a));
    return {
        peak,
        unhealthySepOct: inRange('2015-09-01', '2015-10-31').filter(d => d.max >= UNHEALTHY).length,
        unhealthyAfterNotice: inRange('2015-09-26', '2015-10-31').filter(d => d.max >= UNHEALTHY).length,
        lastModerateBefore: date => [...days].reverse().find(d => d.date < date && d.max <= MODERATE_MAX),
        veryUnhealthyCount: date => inRange('2015-09-01', date).filter(d => d.max >= VERY_UNHEALTHY).length,
    };
}

export function act1Scenes({ psiDays, assumptions }) {
    const A = assumptions.act1;
    const byDate = new Map(psiDays.map(d => [d.date, d]));
    const stats = act1Stats(psiDays);
    const money = n => t('common.money', { n: formatNumber(n) });
    const soldOut = date => A.maskSoldOutDays.includes(date);

    function buyMask(state, date, text) {
        if (soldOut(date)) return text.soldOut;
        state.money -= A.prices.n95Box;
        state.hasMask = true;
        return text.result;
    }

    function choiceList(day, state) {
        const texts = t(`act1.days.${day.date}.choices`);
        return day.choices.map(key => {
            const text = texts[key];
            const c = { key, label: text.label, vars: {}, disabled: false, reason: '' };
            const needs = price => {
                c.vars.price = money(price);
                if (state.money < price) {
                    c.disabled = true;
                    c.reason = t('common.notEnoughMoney');
                }
            };
            switch (key) {
                case 'mask':
                case 'shop':
                    needs(A.prices.n95Box);
                    c.pick = s => buyMask(s, day.date, text);
                    break;
                case 'purifier':
                    if (state.hasPurifier) return null;
                    needs(A.prices.purifier);
                    c.pick = s => {
                        s.money -= A.prices.purifier;
                        s.hasPurifier = true;
                        return text.result;
                    };
                    break;
                case 'purifierOn':
                    if (!state.hasPurifier) return null;
                    c.pick = () => text.result;
                    break;
                case 'count':
                    c.pick = s => (s.hasMask ? text.result : text.none);
                    break;
                case 'out':
                    c.pick = s => (s.hasMask ? text.result : text.noMask);
                    break;
                default:
                    c.pick = () => text.result;
            }
            const pick = c.pick;
            c.pick = s => {
                s.picks[day.date] = key;
                return pick(s);
            };
            return c;
        }).filter(Boolean);
    }

    function dayScene(day) {
        const psi = byDate.get(day.date);
        const before = stats.lastModerateBefore(day.date);
        const eventVars = {
            psi: formatNumber(psi.max),
            since: before ? shortDate(before.date) : '',
            nth: stats.veryUnhealthyCount(day.date),
        };
        return {
            type: 'day',
            chrome: { meter: 's_psi', extinguish: true, money: 'act1' },
            date: day.date,
            psi: psi.max,
            photo: day.photo,
            story: t(`act1.days.${day.date}.story`),
            event: { text: t(`act1.days.${day.date}.event`, eventVars), source: day.source },
            choices: state => choiceList(day, state),
            nextLabel: t('common.nextDay'),
        };
    }

    const lastDay = byDate.get(DAYS[DAYS.length - 1].date);

    return [
        { type: 'card', chrome: {}, ...t('act1.card') },
        ...t('act1.intro').map(block => ({
            type: 'paras',
            chrome: { meter: 's_psi', extinguish: true },
            paras: block.paras,
            vars: () => ({ money: money(A.budget) }),
        })),
        ...DAYS.map(dayScene),
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
