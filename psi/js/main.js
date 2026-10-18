// Boot, screen flow and saved progress.
import { setDict, t } from './i18n.js';
import { el, rich, sourceChip, assumptionTag, formatDate, formatNumber, toast, load, save, remove, reducedMotion } from './ui.js';
import { createMeter, clearHaze } from './meter.js';
import { initSources, renderSourceList } from './sources.js';
import { renderScene } from './scenes.js';
import { act1Scenes, newAct1State } from './acts/act1.js';

const PROGRESS_KEY = 'psi-progress-v1';
const $ = id => document.getElementById(id);

const app = {
    data: null,
    meter: null,
    current: null,      // { screen, index, state }
};

async function loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    return res.json();
}

function mount(node) {
    const main = $('main');
    main.replaceChildren(node);
    if (!reducedMotion()) node.classList.add('enter');
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
}

// Header, footer and the extinguish button follow what each scene asks for.
function applyChrome(scene, state) {
    const chrome = scene.chrome || {};
    $('top').hidden = !chrome.meter;
    $('extinguish').hidden = !chrome.extinguish;
    if (!chrome.meter) clearHaze();
    if (scene.psi !== undefined) app.meter.set(scene.psi);
    $('date').textContent = scene.date ? formatDate(scene.date) : '';

    const money = $('money');
    if (chrome.money) {
        money.replaceChildren(
            `${t('act1.moneyLabel')} ${t('common.money', { n: formatNumber(state.money) })}　`,
            assumptionTag(),
        );
        money.hidden = false;
    } else {
        money.hidden = true;
    }

    const footer = $('event');
    if (scene.event) {
        footer.replaceChildren(
            el('div', { class: 'event-body' },
                el('p', { class: 'event-label' }, t('common.event')),
                el('p', { class: 'event-text' }, rich(scene.event.text)),
            ),
            sourceChip(scene.event.source),
        );
        footer.hidden = false;
    } else {
        footer.hidden = true;
    }
}

function hideChrome() {
    $('top').hidden = true;
    $('event').hidden = true;
    $('extinguish').hidden = true;
    clearHaze();
}

// Plays a list of scenes, saving progress at the start of each one.
function playScenes(screen, scenes, index, state, onFinish) {
    if (index >= scenes.length) {
        onFinish(state);
        return;
    }
    const scene = scenes[index];
    app.current = { screen, index, state };
    save(PROGRESS_KEY, { screen, index, state });
    applyChrome(scene, state);
    mount(renderScene(scene, {
        state,
        next: () => playScenes(screen, scenes, index + 1, state, onFinish),
        onChange: () => {
            applyChrome(scene, state);
            save(PROGRESS_KEY, { screen, index, state, picked: true });
        },
    }));
}

function startAct1(index = 0, state = newAct1State(app.data.assumptions)) {
    app.meter.configure('s_psi');
    const scenes = act1Scenes({ psiDays: app.data.psi.days, assumptions: app.data.assumptions });
    playScenes('act1', scenes, Math.min(index, scenes.length - 1), state, () => showWip());
}

function showWip() {
    hideChrome();
    app.current = { screen: 'wip', index: 0, state: {} };
    save(PROGRESS_KEY, app.current);
    mount(el('section', { class: 'scene' },
        el('h1', { class: 'breath-title' }, t('wip.title')),
        el('p', { class: 'para' }, t('wip.body')),
        el('div', { class: 'stack' },
            el('button', { class: 'btn primary wide', type: 'button', onclick: () => { remove(PROGRESS_KEY); startAct1(); } }, t('wip.restart')),
            el('button', { class: 'btn wide', type: 'button', onclick: showSources }, t('title.sources')),
            el('button', { class: 'btn wide', type: 'button', onclick: showTitle }, t('common.close')),
        ),
    ));
}

function showSources() {
    hideChrome();
    mount(renderSourceList(showTitle));
}

function resume(progress) {
    if (progress.screen === 'act1') startAct1(progress.index, progress.state);
    else showWip();
}

function showTitle() {
    hideChrome();
    const progress = load(PROGRESS_KEY, null);
    const strip = el('div', { class: 'bandstrip', 'aria-hidden': 'true' },
        [0, 1, 2, 3, 4].map(i => {
            const s = el('span');
            s.style.background = `var(--band-${i})`;
            return s;
        }));
    const buttons = progress
        ? [
            el('button', { class: 'btn primary wide', type: 'button', onclick: () => resume(progress) }, t('title.resume')),
            el('button', { class: 'btn wide', type: 'button', onclick: () => { remove(PROGRESS_KEY); startAct1(); } }, t('title.restart')),
        ]
        : [el('button', { class: 'btn primary wide', type: 'button', onclick: () => startAct1() }, t('title.start'))];

    mount(el('section', { class: 'scene title-screen' },
        el('h1', { class: 'wordmark' }, t('title.heading'), el('small', {}, t('title.sub'))),
        strip,
        el('p', { class: 'lead' }, t('title.lead')),
        el('ul', { class: 'rules' }, t('title.rules').map(r => el('li', {}, r))),
        el('p', { class: 'time' }, t('title.time')),
        el('div', { class: 'stack' },
            ...buttons,
            el('button', { class: 'btn wide', type: 'button', onclick: showSources }, t('title.sources')),
        ),
    ));
}

function setupExtinguish() {
    const btn = $('extinguish');
    btn.replaceChildren(
        el('span', { 'aria-hidden': 'true', class: 'ext-icon' }),
        t('extinguish.label'),
    );
    btn.querySelector('.ext-icon').innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="6" height="9.5" rx="2"/><path d="M7 5V3h2v2M9 3h3l1 1.5"/></svg>';
    // Looks pressable, but never does anything except say so.
    btn.addEventListener('click', () => {
        if (app.current && app.current.state && 'tries' in app.current.state) {
            app.current.state.tries++;
            save(PROGRESS_KEY, { ...app.current });
        }
        toast(t('extinguish.message'));
    });
}

async function boot() {
    const main = $('main');
    main.textContent = '';
    try {
        setDict(await loadJSON('i18n/ja.json'));
    } catch (err) {
        // Without the text file there is no translated message to show.
        console.error(err);
        main.textContent = 'Could not load i18n/ja.json. Serve this folder over HTTP (e.g. python3 -m http.server).';
        return;
    }
    try {
        const [sources, psi, assumptions, now] = await Promise.all([
            loadJSON('data/sources.json'),
            loadJSON('data/s_psi_2015.json'),
            loadJSON('data/assumptions.json'),
            loadJSON('data/now.json'),
        ]);
        app.data = { sources: sources.sources, psi, assumptions, now };
    } catch (err) {
        console.error(err);
        main.textContent = t('common.loadError');
        return;
    }
    document.title = t('meta.title');
    initSources(app.data.sources);
    app.meter = createMeter($('meter'));
    setupExtinguish();
    showTitle();
}

boot();
