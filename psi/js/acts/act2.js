// Act 2: a family in P city, October 2015. Fewer choices than in Act 1.
import { t } from '../i18n.js';

// Meter readings come from the sources named here; act2.readingOver ("over 1,000") is the two-week average in D-14.
const DAYS = [
    { date: '2015-10-16', reading: { value: 1889, display: '1,889', source: 'D-15' }, event: 'D-15', counter: 'D-16', choices: ['purifier', 'mask', 'inside'] },
    { date: '2015-10-24', reading: { value: 1000, display: 'act2.readingOver', source: 'D-14' }, event: 'D-14', counter: 'D-14', choices: ['clinic', 'purifier', 'wait'] },
    { date: '2015-10-26', reading: { value: 1000, display: 'act2.readingOver', source: 'D-14' }, event: 'D-14', counter: 'D-14', choices: ['leave', 'stay'] },
];

export function newAct2State() {
    return { picks: {} };
}

// A display given as a text key is looked up in the current language.
const localReading = r => (r.display.startsWith('act2.') ? { ...r, display: t(r.display) } : r);

export function act2Scenes({ psiDays }) {
    const sPsiOct16 = psiDays.find(d => d.date === '2015-10-16');

    function dayScene(day) {
        const texts = t(`act2.days.${day.date}`);
        return {
            type: 'day',
            chrome: { meter: 'p_pm10' },
            date: day.date,
            reading: localReading(day.reading),
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
        ...t('act2.intro').map((block, i) => ({ type: 'paras', chrome: { meter: 'p_pm10' }, paras: block.paras, photo: i === 0 ? 'act2-haze-mosque' : undefined })),
        dayScene(DAYS[0]),
        {
            type: 'compare',
            chrome: {},
            ...t('act2.compare'),
            meters: [
                { indicator: 's_psi', reading: { value: sPsiOct16.max, source: 'D-01' } },
                { indicator: 'p_pm10', reading: localReading(DAYS[0].reading) },
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
                { label: t('act2.bars.official'), value: 19, display: t('act2.bars.officialValue') },
                { label: t('act2.bars.estimate'), value: 91600, display: t('act2.bars.estimateValue') },
            ],
            note: t('act2.bars.note'),
        },
        ...t('act2.after').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        { type: 'breath', chrome: {}, ...t('act2.breath') },
    ];
}
