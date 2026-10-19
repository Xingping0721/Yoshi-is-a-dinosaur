// Act 5: October 2026, a person living in M-country's P state, watching the smoke come closer.
// Meter values are shown only on days when a P-state reading was reported.
import { t } from '../i18n.js';

const DAYS = [
    { date: '2026-10-01', reading: { value: null, display: '—', source: 'D-36' }, event: 'D-36', choices: ['close', 'read'] },
    { date: '2026-10-08', reading: { value: 154, source: 'D-37' }, event: 'D-38', photo: 'act5-haze-tower', choices: ['window', 'laundry', 'run'] },
    { date: '2026-10-09', reading: { value: null, display: '—', source: 'D-39' }, event: 'D-39', choices: ['neighbour', 'check'] },
    { date: '2026-10-11', reading: { value: 49, source: 'D-40' }, event: 'D-40', photo: 'act5-sky', choices: ['open', 'app'] },
    { date: '2026-10-13', reading: { value: null, display: '—', source: 'D-30' }, event: 'D-30', choices: ['close', 'send'] },
    { date: '2026-10-15', reading: { value: null, display: '150未満', source: 'D-41' }, event: 'D-41', choices: ['mask', 'nomask'] },
];

export function newAct5State() {
    return { picks: {} };
}

export function act5Scenes() {
    function dayScene(day) {
        const texts = t(`act5.days.${day.date}`);
        return {
            type: 'day',
            chrome: { meter: 'm_api' },
            date: day.date,
            reading: day.reading,
            photo: day.photo,
            story: texts.story,
            event: { text: texts.event, source: day.event },
            nextLabel: t('common.nextDay'),
            choices: () => day.choices.map(key => ({
                key,
                label: texts.choices[key].label,
                vars: {},
                disabled: false,
                pick: s => {
                    s.picks[day.date] = key;
                    return texts.choices[key].result;
                },
            })),
        };
    }

    return [
        { type: 'card', chrome: {}, ...t('act5.card') },
        ...t('act5.intro').map(block => ({ type: 'paras', chrome: { meter: 'm_api' }, paras: block.paras })),
        ...DAYS.map(dayScene),
        ...t('act5.end').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        { type: 'breath', chrome: {}, ...t('act5.breath') },
    ];
}
