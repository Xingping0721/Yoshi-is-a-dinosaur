// Ending: estimated deaths by country (one scale), the range between studies, the economic cost.
import { t } from '../i18n.js';

export function endingScenes() {
    const rows = t('ending.bars.rows');
    return [
        { type: 'card', chrome: {}, ...t('ending.card') },
        {
            type: 'bars',
            chrome: {},
            title: t('ending.bars.title'),
            rows: [
                { label: rows.I, value: 91600, display: '{{91,600人|D-03}}' },
                { label: rows.M, value: 6500, display: '{{6,500人|D-03}}' },
                { label: rows.S, value: 2200, display: '{{2,200人|D-03}}' },
            ],
            note: t('ending.bars.note'),
        },
        ...t('ending.range').map(block => ({ type: 'paras', chrome: {}, paras: block.paras })),
        ...t('ending.economy').map(block => ({ type: 'paras', chrome: {}, paras: block.paras, nextLabel: t('ending.next') })),
    ];
}
