// Shared pieces for the interactive acts: a status strip that shows what changed,
// a rules box, on/off plan switches, action cards, a strip of days and the decision review.
import { el, assumptionTag, reducedMotion } from './ui.js';
import { t } from './i18n.js';

// items: [{ id, label, value, display? }]. Remembers the last values per strip id so a change
// shows as "+2" / "−25" until the next update.
const lastValues = new Map();
export function statusStrip(key, items) {
    const prev = lastValues.get(key) || {};
    const next = {};
    const list = el('dl', { class: 'status' }, items.map(item => {
        next[item.id] = item.value;
        const before = prev[item.id];
        const delta = typeof item.value === 'number' && typeof before === 'number' ? item.value - before : 0;
        return el('div', { class: delta ? 'stat changed' : 'stat' },
            el('dt', {}, item.label),
            el('dd', {},
                item.display !== undefined ? item.display : String(item.value),
                delta ? el('span', { class: delta > 0 ? 'delta up' : 'delta down' }, `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`) : null,
            ),
        );
    }));
    lastValues.set(key, next);
    return el('div', { class: 'status-wrap' }, assumptionTag(), list);
}
export const resetStatus = key => lastValues.delete(key);

// Collapsible "how it works" box; the rules are game settings, so the box says so.
export function rulesBox(title, lines, open = false) {
    return el('details', { class: 'rules-box', open },
        el('summary', {}, title),
        el('p', { class: 'tag' }, t('common.assumption')),
        el('ul', {}, lines.map(line => el('li', {}, line))),
    );
}

// An on/off plan rule. Disabled switches show why.
export function planSwitch({ label, hint, on, disabled, reason, onToggle }) {
    const btn = el('button', {
        class: 'switch', type: 'button', role: 'switch',
        'aria-checked': String(!!on), disabled: !!disabled,
    },
        el('span', { class: 'switch-box', 'aria-hidden': 'true' }),
        el('span', { class: 'switch-text' },
            el('span', { class: 'switch-label' }, label),
            hint ? el('span', { class: 'switch-hint' }, hint) : null,
            disabled && reason ? el('span', { class: 'why' }, reason) : null,
        ),
    );
    btn.addEventListener('click', () => onToggle(!on));
    return btn;
}

// A card the player can use: label, what it costs, and (when locked) why.
export function actionCard({ label, cost, note, disabled, reason, picked, onClick, tone }) {
    const btn = el('button', {
        class: `action${picked ? ' picked' : ''}${tone ? ` ${tone}` : ''}`, type: 'button',
        disabled: !!disabled, 'aria-pressed': picked === undefined ? null : String(!!picked),
    },
        el('span', { class: 'action-label' }, label),
        cost ? el('span', { class: 'action-cost' }, cost) : null,
        note ? el('span', { class: 'action-note' }, note) : null,
        disabled && reason ? el('span', { class: 'why' }, reason) : null,
    );
    if (onClick) btn.addEventListener('click', onClick);
    return btn;
}

// One square per day, coloured by band (with the number written in, never colour alone).
// days: [{ label, value, band, mark? }], value null = not known yet.
export function dayStrip(days, caption) {
    return el('figure', { class: 'daystrip' },
        el('ol', {}, days.map(d => el('li', {
            class: d.value === null ? 'unknown' : `b${d.band}`,
            title: d.value === null ? d.label : `${d.label} ${d.value}`,
        },
            el('span', { class: 'ds-date' }, d.label),
            el('span', { class: 'ds-val' }, d.value === null ? '?' : String(d.value)),
            d.mark ? el('span', { class: 'ds-mark' }, d.mark) : null,
        ))),
        caption ? el('figcaption', {}, caption) : null,
    );
}

// Decision review: rows of [what you decided, what it led to].
export function reviewTable(title, head, rows) {
    return el('div', { class: 'review' },
        el('h2', { class: 'section-title' }, title),
        el('div', { class: 'review-scroll' },
            el('table', {},
                el('thead', {}, el('tr', {}, head.map(h => el('th', { scope: 'col' }, h)))),
                el('tbody', {}, rows.map(r => el('tr', {}, r.map((c, i) => (i === 0 ? el('th', { scope: 'row' }, c) : el('td', {}, c)))))),
            ),
        ),
    );
}

// "Why it turned out this way": a short list of causes, each marked as your decision or outside your control.
export function causeList(items) {
    return el('ul', { class: 'causes' }, items.map(c => el('li', { class: c.kind },
        el('span', { class: 'cause-kind' }, t(`play.cause.${c.kind}`)),
        el('span', {}, c.text),
    )));
}

export function replayRow(onReplay, onNext, nextLabel) {
    return el('div', { class: 'actions' },
        onReplay ? el('button', { class: 'btn', type: 'button', onclick: onReplay }, t('play.replay')) : null,
        el('button', { class: 'btn primary', type: 'button', onclick: onNext }, nextLabel || t('common.next')),
    );
}

// Keeps keyboard focus sensible after a redraw: refocus the element with the same data-focus key.
export function redraw(section, build) {
    const active = document.activeElement && section.contains(document.activeElement)
        ? document.activeElement.closest('[data-focus]') : null;
    const key = active ? active.dataset.focus : null;
    section.replaceChildren(...build().filter(Boolean));
    if (key) {
        const again = section.querySelector(`[data-focus="${key}"]`);
        if (again && !again.disabled) again.focus({ preventScroll: true });
    }
}

export const scrollTo = node => node.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });

