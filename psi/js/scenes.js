// Renders one scene (card, paragraphs, a day with choices, or the "breath" recap).
import { el, rich, sourceChip, assumptionTag } from './ui.js';
import { t, fill } from './i18n.js';

const value = (v, state) => (typeof v === 'function' ? v(state) : v);

function nextButton(label, onClick) {
    return el('div', { class: 'actions' },
        el('button', { class: 'btn primary', type: 'button', onclick: onClick }, label || t('common.next')));
}

function para(p, vars) {
    return el('div', { class: 'para-wrap' },
        p.assumption ? assumptionTag() : null,
        el('p', { class: 'para' }, rich(p.text, vars)),
        p.source ? el('div', { class: 'para-src' }, sourceChip(p.source)) : null,
    );
}

function card(scene, ctx) {
    return el('section', { class: 'scene card-screen' },
        el('p', { class: 'kicker' }, scene.kicker),
        el('h1', { class: 'card-title' }, scene.title),
        el('p', { class: 'period' }, scene.period),
        nextButton(null, ctx.next),
    );
}

function paras(scene, ctx) {
    const vars = value(scene.vars, ctx.state) || {};
    const list = value(scene.paras, ctx.state);
    return el('section', { class: 'scene' },
        ...list.map(p => para(p, vars)),
        nextButton(scene.nextLabel, ctx.next),
    );
}

function day(scene, ctx) {
    const choices = scene.choices(ctx.state);
    const list = el('ul', { class: 'choices' });
    const resultBox = el('div', { class: 'para-wrap', hidden: true });
    const buttons = [];

    choices.forEach(c => {
        const btn = el('button', { class: 'choice', type: 'button', disabled: c.disabled },
            el('span', {}, fill(c.label, c.vars)),
            c.disabled && c.reason ? el('span', { class: 'why' }, c.reason) : null,
        );
        btn.addEventListener('click', () => {
            if (list.classList.contains('done')) return;
            const text = c.pick(ctx.state);
            list.classList.add('done');
            btn.classList.add('picked');
            btn.setAttribute('aria-pressed', 'true');
            buttons.forEach(b => { b.disabled = true; });
            resultBox.replaceChildren(
                assumptionTag(),
                el('p', { class: 'result' }, rich(text)),
                nextButton(scene.nextLabel, ctx.next),
            );
            resultBox.hidden = false;
            if (ctx.onChange) ctx.onChange();
            resultBox.querySelector('.btn').focus({ preventScroll: true });
            resultBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        buttons.push(btn);
        list.append(el('li', {}, btn));
    });

    return el('section', { class: 'scene' },
        el('div', { class: 'story para-wrap' }, assumptionTag(), el('p', { class: 'para' }, rich(scene.story))),
        list,
        resultBox,
    );
}

function breath(scene, ctx) {
    const vars = value(scene.vars, ctx.state) || {};
    return el('section', { class: 'scene' },
        el('h1', { class: 'breath-title' }, scene.title),
        el('p', { class: 'breath-sub' }, scene.sub),
        el('ul', { class: 'figures' }, scene.items.map(item => el('li', { class: 'figure' },
            el('span', { class: 'big' }, fill(item.value, vars)),
            sourceChip(item.source),
            el('span', { class: 'text' }, rich(item.text, vars)),
        ))),
        nextButton(scene.next, ctx.next),
    );
}

const RENDER = { card, paras, day, breath };

export function renderScene(scene, ctx) {
    if (scene.type === 'node') return scene.render(ctx);
    return RENDER[scene.type](scene, ctx);
}
