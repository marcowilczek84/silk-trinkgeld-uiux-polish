import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = new URL('../', import.meta.url);

import {app} from './app-helper.mjs';

async function calculateFixture({ state, staff, shifts, mode, from, to }) {
  const {dom} = await app();
  const { window } = dom;
  window.SilkLocalRepository.saveStaff(staff);
  window.SilkLocalRepository.saveShifts(shifts);
  window.SilkLocalRepository.saveState({...state,mode,singleDate:from,periodStart:from,periodEnd:to||from});
  window.eval(`STAFF=${JSON.stringify(staff)};SHIFTS=${JSON.stringify(shifts)};rebuild();`);
  window.loadState();
  window.calculate();
  const rows = [...window.document.querySelectorAll('#result .resrow')].map((row) => ({
    label: row.querySelector('span')?.childNodes[0]?.textContent.trim(),
    detail: row.querySelector('small')?.textContent.trim() || '',
    amount: row.querySelector('b')?.textContent.trim()
  }));
  const total = window.document.querySelector('#result .resulthead strong')?.textContent.trim();
  const candidates=Array.from(window.SilkCalculatedNumbers.lines,l=>l.candidatePayoutCents/100);dom.window.close();
  return { total, rows, candidates };
}

const shifts = [
  { name: 'F1', f: 1, s: 0, color: '#ddd' },
  { name: 'MD', f: 0.35, s: 0.65, color: '#ddd' },
  { name: 'SP1', f: 0, s: 1, color: '#ddd' }
];

test('golden master: day distribution including Emily cap, kitchen and housekeeping', async () => {
  const actual = await calculateFixture({
    staff: ['Emily', 'Marco Wilczek', 'Sandra Porepp'], shifts, mode: 'day', from: '2026-09-03',
    state: { version: 4, mode: 'day', singleDate: '2026-09-03', byDate: {
      '2026-09-03': { f: '104.50', s: '41.00', assignments: [
        { name: 'Emily', shift: 'MD' }, { name: 'Marco Wilczek', shift: 'F1' }, { name: 'Sandra Porepp', shift: 'SP1' }
      ] }
    } }
  });
  assert.deepEqual(actual, {
    total: 'CHF 145.50', candidates:[10,68,21,43,4],
    rows: [
      { label: 'Emily', detail: '1 Tag(e) · 2026-09-03 · MD', amount: 'Gesperrt' },
      { label: 'Marco Wilczek', detail: '1 Tag(e) · 2026-09-03 · F1', amount: 'Gesperrt' },
      { label: 'Sandra Porepp', detail: '1 Tag(e) · 2026-09-03 · SP1', amount: 'Gesperrt' },
      { label: 'Küche gesamt', detail: '', amount: 'Gesperrt' },
      { label: 'Housekeeping gesamt', detail: '', amount: 'Gesperrt' }
    ]
  });
});

test('golden master: multi-day weighted shifts and rounding display', async () => {
  const actual = await calculateFixture({
    staff: ['Marco Wilczek', 'Sandra Porepp'], shifts, mode: 'period', from: '2026-09-03', to: '2026-09-04',
    state: { version: 4, mode: 'period', periodStart: '2026-09-03', periodEnd: '2026-09-04', byDate: {
      '2026-09-03': { f: '100', s: '40', assignments: [{ name: 'Marco Wilczek', shift: 'F1' }, { name: 'Sandra Porepp', shift: 'SP1' }] },
      '2026-09-04': { f: '80.25', s: '120.75', assignments: [{ name: 'Marco Wilczek', shift: 'MD' }, { name: 'Sandra Porepp', shift: 'MD' }] }
    } }
  });
  assert.deepEqual(actual, {
    total: 'CHF 341.00', candidates:[137,96,100,9],
    rows: [
      { label: 'Marco Wilczek', detail: '2 Tag(e) · 2026-09-03 · F1 · 2026-09-04 · MD', amount: 'Gesperrt' },
      { label: 'Sandra Porepp', detail: '2 Tag(e) · 2026-09-03 · SP1 · 2026-09-04 · MD', amount: 'Gesperrt' },
      { label: 'Küche gesamt', detail: '', amount: 'Gesperrt' },
      { label: 'Housekeeping gesamt', detail: '', amount: 'Gesperrt' }
    ]
  });
});
