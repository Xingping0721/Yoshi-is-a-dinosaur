// Checks that i18n/en.json matches i18n/ja.json: the same keys and array lengths,
// the same {name} placeholders and {{…|D-xx}} source ids in each string,
// and identical non-text values (source ids, flags). Run from psi/: node scripts/check_i18n.js
const fs = require('fs');
const path = require('path');

const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const ja = read('i18n/ja.json');
const en = read('i18n/en.json');

// Keys whose values are allowed to differ in shape or content between languages.
const FREE = new Set(['_format']);
// Strings that are ids or flags rather than text (e.g. "source": "D-07", "when": "tried").
const isCode = s => /^(D-\d{2}|tried|notTried)$/.test(s);

// Dates may use the month number {m} or the month name {mon}.
const vars = s => [...s.matchAll(/(?<!\{)\{(\w+)\}(?!\})/g)].map(m => (m[1] === 'mon' ? 'm' : m[1])).sort().join(',');
const marks = s => [...s.matchAll(/\{\{[^{}|]+\|(D-\d{2})\}\}/g)].map(m => m[1]).sort().join(',');

const problems = [];
function walk(a, b, at) {
    const key = at.split('.').pop();
    if (FREE.has(key)) return;
    if (b === undefined) return problems.push(`${at}: missing in en.json`);
    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return problems.push(`${at}: array length differs`);
        return a.forEach((v, i) => walk(v, b[i], `${at}.${i}`));
    }
    if (a && typeof a === 'object') {
        if (!b || typeof b !== 'object') return problems.push(`${at}: not an object in en.json`);
        for (const k of Object.keys(b)) if (!(k in a) && !FREE.has(k)) problems.push(`${at}.${k}: only in en.json`);
        return Object.keys(a).forEach(k => walk(a[k], b[k], at ? `${at}.${k}` : k));
    }
    if (typeof a === 'string' && !isCode(a)) {
        if (typeof b !== 'string') return problems.push(`${at}: not a string in en.json`);
        if (vars(a) !== vars(b)) problems.push(`${at}: placeholders {${vars(a)}} vs {${vars(b)}}`);
        if (marks(a) !== marks(b)) problems.push(`${at}: sources [${marks(a)}] vs [${marks(b)}]`);
        if (a !== '' && b === '' && key !== 'checkLang') problems.push(`${at}: empty in en.json`);
        return;
    }
    if (a !== b) problems.push(`${at}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}
walk(ja, en, '');

// Source descriptions: every source needs an English label, and a note/check wherever Japanese has one.
const { sources } = read('data/sources.json');
for (const s of sources) {
    if (!s.en) { problems.push(`sources ${s.id}: no en block`); continue; }
    for (const k of ['label', 'note', 'check']) {
        if (s[k] && !s.en[k]) problems.push(`sources ${s.id}: en.${k} missing`);
    }
}

if (problems.length) {
    console.log(problems.join('\n'));
    process.exitCode = 1;
} else {
    console.log('ja.json and en.json match.');
}
