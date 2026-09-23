import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = new URL('../', import.meta.url);

async function createApp() {
  let html = await readFile(new URL('index.html', root), 'utf8');
  for (const file of ['storage-models.js', 'local-repository.js', 'sync-status.js', 'cloud-repository.js', 'legacy-migration.js', 'sync-service.js', 'silk-v11.js', 'silk-v12.js', 'silk-v13.js']) {
    const source = await readFile(new URL(file, root), 'utf8');
    html = html.replace(new RegExp(`<script src="${file.replace('.', '\\.')}(?:\\?[^\"]*)?">\\s*</script>`), `<script>${source}</script>`);
  }
  html = html.replace(/<script src="jsQR[^>]*><\/script><script src="silk-import[^>]*><\/script>/, '');
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(html, {
    url: 'https://golden-master.invalid/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole
  });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.alert = () => {};
  dom.window.confirm = () => true;
  return dom;
}

async function calculateFixture({ state, staff, shifts, mode, from, to }) {
  const dom = await createApp();
  const { window } = dom;
  window.localStorage.setItem('silk_staff', JSON.stringify(staff));
  window.localStorage.setItem('silk_shifts', JSON.stringify(shifts));
  window.localStorage.setItem('silk_v12_data', JSON.stringify(state));
  window.eval(`STAFF=${JSON.stringify(staff)};SHIFTS=${JSON.stringify(shifts)};rebuild();`);
  if (mode === 'period') {
    window.setPeriodRange(from, to);
    window.setMode('period');
  } else {
    window.singleDate.value = from;
    window.setMode('day');
  }
  window.buildVisibleDays();
  window.calculate();
  const rows = [...window.document.querySelectorAll('#result .resrow')].map((row) => ({
    label: row.querySelector('span')?.childNodes[0]?.textContent.trim(),
    detail: row.querySelector('small')?.textContent.trim() || '',
    amount: row.querySelector('b')?.textContent.trim()
  }));
  const total = window.document.querySelector('#result .resulthead strong')?.textContent.trim();
  dom.window.close();
  return { total, rows };
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
    total: 'CHF 146',
    rows: [
      { label: 'Emily', detail: '1 Tag(e) · 03.09. · MD', amount: 'CHF 10' },
      { label: 'Marco Wilczek', detail: '1 Tag(e) · 03.09. · F1', amount: 'CHF 68' },
      { label: 'Sandra Porepp', detail: '1 Tag(e) · 03.09. · SP1', amount: 'CHF 21' },
      { label: 'Küche gesamt', detail: '', amount: 'CHF 43' },
      { label: 'Housekeeping gesamt', detail: '', amount: 'CHF 4' }
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
    total: 'CHF 341',
    rows: [
      { label: 'Marco Wilczek', detail: '2 Tag(e) · 03.09. · F1 · 04.09. · MD', amount: 'CHF 137' },
      { label: 'Sandra Porepp', detail: '2 Tag(e) · 03.09. · SP1 · 04.09. · MD', amount: 'CHF 96' },
      { label: 'Küche gesamt', detail: '', amount: 'CHF 100' },
      { label: 'Housekeeping gesamt', detail: '', amount: 'CHF 9' }
    ]
  });
});
