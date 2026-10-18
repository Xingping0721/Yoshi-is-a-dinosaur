// Text lookup. Every string shown to the player lives in i18n/<lang>.json.
let dict = {};

export function setDict(d) {
    dict = d;
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

// Replace {name} placeholders. {{...|D-xx}} source markers are left for rich().
export function fill(str, vars = {}) {
    return String(str).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
