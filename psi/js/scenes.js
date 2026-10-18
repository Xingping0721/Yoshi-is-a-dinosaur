// Renders one scene: a title card, paragraphs, a day with choices, the "breath" recap,
// two meters side by side, proportional bars, or one step of the zoom-out diagram.
import { el, rich, sourceChip, assumptionTag, reducedMotion } from './ui.js';
import { t, fill } from './i18n.js';
import { miniMeter } from './meter.js';

const value = (v, state) => (typeof v === 'function' ? v(state) : v);

export function nextButton(label, onClick) {
    return el('div', { class: 'actions' },
        el('button', { class: 'btn primary', type: 'button', onclick: onClick }, label || t('common.next')));
}

export function para(p, vars) {
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
        scene.period ? el('p', { class: 'period' }, scene.period) : el('p', { class: 'period' }),
        nextButton(null, ctx.next),
    );
}

function paras(scene, ctx) {
    const vars = value(scene.vars, ctx.state) || {};
    const list = value(scene.paras, ctx.state);
    return el('section', { class: 'scene' },
        scene.title ? el('h1', { class: 'breath-title' }, scene.title) : null,
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
            const extra = scene.afterPick ? scene.afterPick(ctx.state) : [];
            resultBox.replaceChildren(
                assumptionTag(),
                el('p', { class: 'result' }, rich(text)),
                ...extra.map(p => para(p, {})),
                nextButton(scene.nextLabel, ctx.next),
            );
            resultBox.hidden = false;
            if (ctx.onChange) ctx.onChange();
            resultBox.querySelector('.btn').focus({ preventScroll: true });
            resultBox.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
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

// Two meters side by side (the same day in two places)
function compare(scene, ctx) {
    return el('section', { class: 'scene' },
        el('h1', { class: 'breath-title' }, scene.title),
        el('p', { class: 'breath-sub' }, scene.when),
        el('div', { class: 'compare' },
            ...scene.meters.map(m => miniMeter(m.indicator, m.reading)),
        ),
        el('p', { class: 'para' }, rich(scene.note)),
        nextButton(scene.nextLabel, ctx.next),
    );
}

// Horizontal bars drawn to one scale
function bars(scene, ctx) {
    const max = Math.max(...scene.rows.map(r => r.value));
    return el('section', { class: 'scene' },
        el('h1', { class: 'breath-title' }, scene.title),
        el('ul', { class: 'bars' }, scene.rows.map(r => {
            const fillBar = el('span', { class: 'bar-fill' });
            fillBar.style.width = `${(r.value / max) * 100}%`;
            return el('li', { class: 'bar-row' },
                el('div', { class: 'bar-head' },
                    el('span', { class: 'bar-label' }, r.label),
                    el('span', { class: 'bar-value' }, rich(r.display)),
                ),
                el('span', { class: 'bar-track', 'aria-hidden': 'true' }, fillBar),
            );
        })),
        scene.note ? el('p', { class: 'para small' }, rich(scene.note)) : null,
        ...(scene.paras || []).map(p => para(p, {})),
        nextButton(scene.nextLabel, ctx.next),
    );
}

// Zoom-out diagram: nested frames, from the field outwards
let lastZoomLevel = 0;
function zoom(scene, ctx) {
    const n = scene.levels.length;
    const size = i => 34 + (i * (200 - 34)) / (n - 1);
    const SVG = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('class', 'zoom-svg');
    svg.setAttribute('aria-hidden', 'true');
    const g = document.createElementNS(SVG, 'g');
    for (let i = scene.level; i >= 0; i--) {
        const s = size(i);
        const rect = document.createElementNS(SVG, 'rect');
        rect.setAttribute('x', String((200 - s) / 2));
        rect.setAttribute('y', String((200 - s) / 2));
        rect.setAttribute('width', String(s));
        rect.setAttribute('height', String(s));
        rect.setAttribute('rx', '6');
        rect.setAttribute('class', i === scene.level ? 'zoom-frame on' : 'zoom-frame');
        g.append(rect);
    }
    svg.append(g);

    // Scale so the current frame fills the box; start from the previous level's scale.
    const scaleFor = level => 200 / size(level);
    const from = scaleFor(Math.min(lastZoomLevel, scene.level));
    const to = scaleFor(scene.level);
    g.style.transformOrigin = '100px 100px';
    g.style.transform = `scale(${reducedMotion() ? to : from})`;
    if (!reducedMotion()) {
        requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transform = `scale(${to})`; }));
    }
    lastZoomLevel = scene.level;

    const steps = el('ol', { class: 'zoom-steps' }, scene.levels.map((name, i) =>
        el('li', { class: i === scene.level ? 'on' : i < scene.level ? 'past' : '' }, name)));

    return el('section', { class: 'scene' },
        el('p', { class: 'kicker' }, scene.kicker),
        el('div', { class: 'zoom' }, svg, steps),
        el('h1', { class: 'breath-title' }, scene.title),
        ...scene.paras.map(p => para(p, {})),
        nextButton(scene.nextLabel, ctx.next),
    );
}

const RENDER = { card, paras, day, breath, compare, bars, zoom };

export function renderScene(scene, ctx) {
    if (scene.type === 'node') return scene.render(ctx);
    return RENDER[scene.type](scene, ctx);
}
