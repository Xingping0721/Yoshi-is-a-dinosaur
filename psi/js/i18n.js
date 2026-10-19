// Text lookup. Every string shown to the player lives in i18n/<lang>.json.
export const LANGS = ['ja', 'en'];
const LANG_KEY = 'psi-lang';

let dict = {};
let lang = 'ja';

export function setDict(d, code = lang) {
    dict = d;
    lang = code;
    document.documentElement.lang = code;
}

export const getLang = () => lang;

// ?lang=en in the URL, then the saved choice, then the browser's language.
export function initialLang() {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (LANGS.includes(fromUrl)) return fromUrl;
    try {
        const saved = localStorage.getItem(LANG_KEY);
        if (LANGS.includes(saved)) return saved;
    } catch (e) {
        /* storage unavailable */
    }
    const nav = (navigator.languages || [navigator.language || '']).map(l => String(l).toLowerCase());
    return nav.some(l => l.startsWith('ja')) || !nav.some(l => l.startsWith('en')) ? 'ja' : 'en';
}

export function saveLang(code) {
    try {
        localStorage.setItem(LANG_KEY, code);
    } catch (e) {
        /* storage unavailable */
    }
}

// t('act1.card.title') -> string (or array/object for structured entries)
export function t(path, vars) {
    const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
    if (v === undefined) {
        console.warn(`missing text: ${path}`);
        return path;
    }
    return typeof v === 'string' ? fill(v, vars) : v;
}

// A data value that may be given per language: "322" or { "ja": "約89.6万ha", "en": "about 896,000 ha" }.
export const local = v => (v && typeof v === 'object' && !Array.isArray(v) ? (v[lang] ?? v.ja) : v);

// Replace {name} placeholders. {{...|D-xx}} source markers are left for rich().
export function fill(str, vars = {}) {
    return String(str).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
