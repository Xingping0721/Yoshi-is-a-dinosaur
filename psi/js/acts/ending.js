// Ending: estimated deaths by country (one scale), the range between studies, the economic cost.
import { t } from '../i18n.js';

export function endingScenes() {
    const rows = t('ending.bars.rows');
    const values = t('ending.bars.values');
    return [
        { type: 'card', chrome: {}, ...t('ending.card') },
        {
            type: 'bars',
            chrome: {},
            title: t('ending.bars.title'),
            rows: [
                { label: rows.I, value: 91600, display: values.I },
                { label: rows.M, value: 6500, display: values.M },
                { label: rows.S, value: 2200, display: values.S },
            ],
            note: t('ending.bars.note'),
        },
        ...t('ending.range').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        ...t('ending.economy').map(block => ({ type: 'paras', chrome: {}, paras: block.paras, nextLabel: t('ending.next') })),
    ];
}
