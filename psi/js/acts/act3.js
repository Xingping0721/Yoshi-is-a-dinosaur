// Act 3: a small farmer who has to clear a new field in the dry season, then the view pulls back.
import { t } from '../i18n.js';
import { formatNumber } from '../ui.js';

export function newAct3State(assumptions) {
    return { money: assumptions.act3.money, method: null };
}

export function act3Scenes({ assumptions }) {
    const A = assumptions.act3;
    const levels = t('act3.levels');
    const zoom = t('act3.zoom');
    const choose = t('act3.choose');

    const choiceScene = {
        type: 'day',
        chrome: { money: 'act3' },
        story: choose.story,
        choices: state => ['burn', 'machine'].map(key => {
            const cost = A.cost[key];
            const c = choose.choices[key];
            return {
                key, label: c.label, vars: { price: formatNumber(cost) },
                disabled: state.money < cost, reason: t('common.notEnoughMoney'),
                pick: s => {
                    s.money -= cost;
                    s.method = key;
                    return c.result;
                },
            };
        }),
        afterPick: state => t(`act3.after.${state.method}`),
    };

    return [
        { type: 'card', chrome: {}, ...t('act3.card') },
        ...t('act3.intro').map(block => ({
            type: 'paras',
            chrome: {},
            paras: block.paras,
            vars: () => ({ money: formatNumber(A.money) }),
        })),
        choiceScene,
        ...zoom.map((step, i) => ({
            type: 'zoom',
            chrome: {},
            level: i,
            levels,
            kicker: t('act3.zoomKicker', { n: i + 1, total: zoom.length }),
            title: step.title,
            paras: step.paras,
        })),
        ...t('act3.end').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        { type: 'breath', chrome: {}, ...t('act3.breath') },
    ];
}
