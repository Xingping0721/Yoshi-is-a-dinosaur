// Builds data/s_psi_2015.json from dataset D-01 (data.gov.sg, "Historical 24-hr PSI").
// Run once during development:  node scripts/build_psi.js
//
// The dataset has one row per hour. Its timestamp column is named "24hr_psi"
// (format "d/m/yyyy h:mm", Singapore time) and the readings are in the
// columns north / south / east / west / central.
// For each day from FROM to TO we keep the highest reading of any region.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RESOURCE_ID = 'd_b4cf557f8750260d229c49fd768e11ed';
const API = 'https://data.gov.sg/api/action/datastore_search';
const DATASET_PAGE = `https://data.gov.sg/datasets/${RESOURCE_ID}/view`;
const FROM = '2015-08-01';
const TO = '2015-11-30';
const REGIONS = ['north', 'south', 'east', 'west', 'central'];
const PAGE = 5000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getPage(offset) {
    const url = `${API}?resource_id=${RESOURCE_ID}&limit=${PAGE}&offset=${offset}&sort=_id%20asc`;
    for (let attempt = 1; attempt <= 6; attempt++) {
        const res = await fetch(url);
        if (res.ok) {
            const body = await res.json();
            if (!body.success) throw new Error('API returned success=false');
            return body.result;
        }
        if (res.status === 429 || res.status >= 500) {
            const wait = 5000 * attempt;
            console.warn(`HTTP ${res.status}, retrying in ${wait / 1000}s`);
            await sleep(wait);
            continue;
        }
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    throw new Error('Too many retries');
}

// "25/9/2015 13:00" -> { date: "2015-09-25", hour: 13 }
function parseStamp(s) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(String(s).trim());
    if (!m) return null;
    const [, d, mo, y, h] = m;
    return { date: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`, hour: Number(h) };
}

async function main() {
    const days = new Map();
    let offset = 0;
    let done = false;
    while (!done) {
        const result = await getPage(offset);
        const rows = result.records;
        if (!rows.length) break;
        for (const row of rows) {
            const stamp = parseStamp(row['24hr_psi']);
            if (!stamp) continue;
            if (stamp.date > TO) { done = true; break; }
            if (stamp.date < FROM) continue;
            let day = days.get(stamp.date);
            if (!day) {
                day = { date: stamp.date, max: null, region: null, hour: null, readings: 0 };
                days.set(stamp.date, day);
            }
            for (const region of REGIONS) {
                const v = Number(row[region]);
                if (row[region] === '' || row[region] === null || !Number.isFinite(v)) continue;
                day.readings++;
                if (day.max === null || v > day.max) {
                    day.max = v;
                    day.region = region;
                    day.hour = stamp.hour;
                }
            }
        }
        offset += rows.length;
        console.log(`read ${offset} rows (last: ${rows[rows.length - 1]['24hr_psi']})`);
        if (offset >= result.total) break;
        await sleep(1500);
    }

    const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    const out = {
        source: 'D-01',
        dataset: DATASET_PAGE,
        api: `${API}?resource_id=${RESOURCE_ID}`,
        licence: 'Singapore Open Data Licence',
        indicator: '24-hr PSI',
        method: 'Highest hourly 24-hr PSI reading of any of the five regions on each calendar day (Singapore time).',
        range: { from: FROM, to: TO },
        generated: new Date().toISOString().slice(0, 10),
        days: list,
    };
    const here = path.dirname(fileURLToPath(import.meta.url));
    const file = path.join(here, '..', 'data', 's_psi_2015.json');
    await writeFile(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
    const peak = list.reduce((a, b) => (b.max > a.max ? b : a));
    console.log(`wrote ${list.length} days to ${file}; peak ${peak.max} on ${peak.date} (${peak.region}, ${peak.hour}:00)`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
