// Boot, screen flow and saved progress.
import { setDict, t } from './i18n.js';
import { el, rich, sourceChip, assumptionTag, formatDate, formatNumber, toast, load, save, remove, reducedMotion } from './ui.js';
import { createMeter, clearHaze } from './meter.js';
import { initSources, renderSourceList } from './sources.js';
import { renderScene } from './scenes.js';
import { act1Scenes, newAct1State } from './acts/act1.js';
import { act2Scenes, newAct2State } from './acts/act2.js';
import { act3Scenes, newAct3State } from './acts/act3.js';
import { act4Scenes, newAct4State } from './acts/act4.js';
import { act5Scenes, newAct5State } from './acts/act5.js';
import { endingScenes } from './acts/ending.js';
import { setImages } from './images.js';
import { epilogueScenes } from './acts/epilogue.js';

const PROGRESS_KEY = 'psi-progress-v1';
const $ = id => document.getElementById(id);

const app = {
    data: null,
    meter: null,
    meterKey: null,
    current: null,      // { screen, index, state }
};

// The acts, in order. Each builds its scenes from the loaded data.
const ACTS = [
    { key: 'act1', scenes: d => act1Scenes({ psiDays: d.psi.days, assumptions: d.assumptions }), state: d => newAct1State(d.assumptions) },
    { key: 'act2', scenes: d => act2Scenes({ psiDays: d.psi.days }), state: () => newAct2State() },
    { key: 'act3', scenes: d => act3Scenes({ assumptions: d.assumptions }), state: d => newAct3State(d.assumptions) },
    { key: 'act4', scenes: d => act4Scenes({ assumptions: d.assumptions }), state: () => newAct4State() },
    { key: 'ending', scenes: () => endingScenes(), state: () => ({}) },
    { key: 'act5', scenes: () => act5Scenes(), state: () => newAct5State() },
    {
        key: 'epilogue',
        scenes: d => epilogueScenes({ now: d.now }, { onSources: showSources, onRestart: restart }),
        state: () => ({}),
    },
];

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

function moneyText(key, n) {
    return key === 'act1' ? t('common.money', { n: formatNumber(n) }) : formatNumber(n);
}

// Header, footer and the extinguish button follow what each scene asks for.
function applyChrome(scene, state) {
    const chrome = scene.chrome || {};
    const reading = scene.reading !== undefined ? scene.reading : scene.psi;

    if (chrome.meter && chrome.meter !== app.meterKey) {
        app.meter.configure(chrome.meter);
        app.meterKey = chrome.meter;
    }
    $('meter').hidden = !chrome.meter;
    if (!chrome.meter) clearHaze();
    else if (reading !== undefined) app.meter.set(reading);

    $('extinguish').hidden = !chrome.extinguish;
    $('date').textContent = scene.date ? formatDate(scene.date) : '';
    $('date').hidden = !scene.date;

    const sub = $('money');
    if (chrome.money) {
        sub.replaceChildren(
            `${t(`${chrome.money}.moneyLabel`)} ${moneyText(chrome.money, state.money)}　`,
            assumptionTag(),
        );
        sub.hidden = false;
    } else if (scene.counter) {
        sub.replaceChildren(
            el('span', {}, `${scene.counter.label}　`),
            el('b', {}, scene.counter.text),
            '　',
            sourceChip(scene.counter.source),
        );
        sub.hidden = false;
    } else {
        sub.hidden = true;
    }

    $('top').hidden = !(chrome.meter || chrome.money || scene.date || scene.counter || chrome.extinguish);

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

function startAct(i, index = 0, state) {
    const act = ACTS[i];
    const scenes = act.scenes(app.data);
    const s = state || act.state(app.data);
    playScenes(act.key, scenes, Math.min(index, scenes.length - 1), s, () => {
        if (i + 1 < ACTS.length) startAct(i + 1);
    });
}

function restart() {
    remove(PROGRESS_KEY);
    app.meterKey = null;
    startAct(0);
}

function showSources() {
    hideChrome();
    mount(renderSourceList({ assumptions: app.data.assumptions, accessed: app.data.psi.generated }, showTitle));
}

function resume(progress) {
    const i = ACTS.findIndex(a => a.key === progress.screen);
    if (i < 0) restart();
    else startAct(i, progress.index, progress.state);
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
            el('button', { class: 'btn wide', type: 'button', onclick: restart }, t('title.restart')),
        ]
        : [el('button', { class: 'btn primary wide', type: 'button', onclick: () => startAct(0) }, t('title.start'))];

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
    const icon = el('span', { 'aria-hidden': 'true', class: 'ext-icon' });
    icon.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="6" height="9.5" rx="2"/><path d="M7 5V3h2v2M9 3h3l1 1.5"/></svg>';
    btn.replaceChildren(icon, t('extinguish.label'));
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
    try {
        setDict(await loadJSON('i18n/ja.json'));
    } catch (err) {
        // Without the text file there is no translated message to show.
        console.error(err);
        main.textContent = 'Could not load i18n/ja.json. Serve this folder over HTTP (e.g. python3 -m http.server).';
        return;
    }
    try {
        const [sources, psi, assumptions, now, images] = await Promise.all([
            loadJSON('data/sources.json'),
            loadJSON('data/s_psi_2015.json'),
            loadJSON('data/assumptions.json'),
            loadJSON('data/now.json'),
            loadJSON('data/images.json'),
        ]);
        app.data = { sources: sources.sources, psi, assumptions, now };
        setImages(images.images);
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
