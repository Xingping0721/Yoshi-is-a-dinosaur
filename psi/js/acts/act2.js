// Act 2: a family in P city, October 2015. Fewer choices than in Act 1.
import { t } from '../i18n.js';

// Meter readings come from the sources named here; "1,000超" is the two-week average in D-14.
const DAYS = [
    { date: '2015-10-16', reading: { value: 1889, display: '1,889', source: 'D-15' }, event: 'D-15', counter: 'D-16', choices: ['purifier', 'mask', 'inside'] },
    { date: '2015-10-24', reading: { value: 1000, display: '1,000超', source: 'D-14' }, event: 'D-14', counter: 'D-14', choices: ['clinic', 'purifier', 'wait'] },
    { date: '2015-10-26', reading: { value: 1000, display: '1,000超', source: 'D-14' }, event: 'D-14', counter: 'D-14', choices: ['leave', 'stay'] },
];

export function newAct2State() {
    return { picks: {} };
}

export function act2Scenes({ psiDays }) {
    const sPsiOct16 = psiDays.find(d => d.date === '2015-10-16');

    function dayScene(day) {
        const texts = t(`act2.days.${day.date}`);
        return {
            type: 'day',
            chrome: { meter: 'p_pm10' },
            date: day.date,
            reading: day.reading,
            counter: { label: t('act2.counterLabel'), text: texts.counter, source: day.counter },
            story: texts.story,
            event: { text: texts.event, source: day.event },
            nextLabel: t('common.nextDay'),
            choices: () => day.choices.map(key => {
                const c = texts.choices[key];
                // The purifier is always out of reach here (game setting).
                if (key === 'purifier') return { key, label: c.label, vars: {}, disabled: true, reason: c.reason };
                return {
                    key, label: c.label, vars: {}, disabled: false,
                    pick: s => {
                        s.picks[day.date] = key;
                        return c.result;
                    },
                };
            }),
        };
    }

    return [
        { type: 'card', chrome: {}, ...t('act2.card') },
        ...t('act2.intro').map(block => ({ type: 'paras', chrome: { meter: 'p_pm10' }, paras: block.paras })),
        dayScene(DAYS[0]),
        {
            type: 'compare',
            chrome: {},
            ...t('act2.compare'),
            meters: [
                { indicator: 's_psi', reading: { value: sPsiOct16.max, source: 'D-01' } },
                { indicator: 'p_pm10', reading: DAYS[0].reading },
            ],
        },
        dayScene(DAYS[1]),
        dayScene(DAYS[2]),
        ...t('act2.end').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        {
            type: 'bars',
            chrome: {},
            title: t('act2.bars.title'),
            rows: [
                { label: t('act2.bars.official'), value: 19, display: '{{19人|D-05}}' },
                { label: t('act2.bars.estimate'), value: 91600, display: '{{91,600人|D-03}}' },
            ],
            note: t('act2.bars.note'),
        },
        ...t('act2.after').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        { type: 'breath', chrome: {}, ...t('act2.breath') },
    ];
}
