import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.CMC_MOCK = '1';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'crypto-api-test-'));
process.env.SNAPSHOT_INTERVAL_MINUTES = '0';

let catalog;
let history;

before(async () => {
  catalog = await import('../server/catalog.js');
  history = await import('../server/history.js');
  history.loadHistory();
});

function checkPayload(payload, dataset) {
  assert.ok(payload.title, `${dataset.id}: brak tytułu`);
  switch (payload.type) {
    case 'kpi':
      assert.equal(typeof payload.value, 'number');
      break;
    case 'gauge':
      assert.ok(payload.value >= 0 && payload.value <= 100);
      break;
    case 'meters':
      assert.ok(payload.meters.length > 0);
      break;
    case 'categorical':
      assert.ok(payload.rows.length > 0, `${dataset.id}: brak wierszy`);
      for (const row of payload.rows) {
        assert.ok(row.key != null && row.label, `${dataset.id}: wiersz bez klucza/etykiety`);
        assert.equal(typeof row.value, 'number');
      }
      break;
    case 'timeseries':
      assert.ok(payload.series.length > 0);
      for (const s of payload.series) {
        for (let i = 1; i < s.points.length; i++) assert.ok(s.points[i][0] >= s.points[i - 1][0], 'punkty posortowane w czasie');
      }
      assert.ok(payload.series.some((s) => s.points.length > 0), `${dataset.id}: pusta seria`);
      break;
    default:
      assert.fail(`${dataset.id}: nieznany typ ${payload.type}`);
  }
}

test('każdy preset z katalogu zwraca poprawne dane (tryb demo)', async () => {
  const { datasets } = catalog.publicCatalog();
  assert.ok(datasets.length >= 15);
  for (const ds of datasets) {
    const full = catalog.getDataset(ds.id);
    assert.ok(ds.charts.length > 0 && ds.presets.length > 0, `${ds.id}: brak wykresów/presetów`);
    for (const preset of ds.presets) {
      if (preset.chart) assert.ok(ds.charts.includes(preset.chart), `${ds.id}: preset z nieobsługiwanym wykresem`);
      const params = catalog.resolveParams(full, preset.params || {});
      checkPayload(await full.load(params), ds);
    }
  }
});

test('resolveParams odrzuca niepoprawne wartości', () => {
  const ds = catalog.getDataset('sectors.ranking');
  const p = catalog.resolveParams(ds, { metric: 'DROP TABLE', limit: 999, categories: ['ok-id', '<script>', 5], order: 'asc' });
  assert.equal(p.metric, 'market_cap');
  assert.equal(p.limit, 50);
  assert.deepEqual(p.categories, ['ok-id']);
  assert.equal(p.order, 'asc');

  const coins = catalog.resolveParams(catalog.getDataset('cmc.coin_history'), { coins: [1, 2, 3, 4, 5, 6, 7, 'x', -1] });
  assert.deepEqual(coins.coins, [1, 2, 3, 4, 5]);
});

test('ranking sektorów respektuje grupę, limit i kolejność', async () => {
  const ds = catalog.getDataset('sectors.ranking');
  const payload = await ds.load(catalog.resolveParams(ds, { metric: 'market_cap', limit: 5, group: 'ecosystems', minCap: '0' }));
  assert.equal(payload.rows.length, 5);
  assert.ok(payload.rows.every((r) => /ecosystem/i.test(r.label)));
  for (let i = 1; i < payload.rows.length; i++) assert.ok(payload.rows[i - 1].value >= payload.rows[i].value);

  const asc = await ds.load(catalog.resolveParams(ds, { metric: 'market_cap_change', order: 'asc', limit: 4 }));
  for (let i = 1; i < asc.rows.length; i++) assert.ok(asc.rows[i - 1].value <= asc.rows[i].value);
  assert.equal(asc.polarity, true);
});

test('grupowanie kategorii CMC', () => {
  assert.equal(catalog.categoryGroup('Solana Ecosystem'), 'ecosystems');
  assert.equal(catalog.categoryGroup('a16z Portfolio'), 'portfolios');
  assert.equal(catalog.categoryGroup('Binance Launchpool'), 'other');
  assert.equal(catalog.categoryGroup('Artificial Intelligence (AI)'), 'sectors');
  assert.equal(catalog.categoryGroup('Real World Assets (RWA)'), 'sectors');
});

test('przeliczanie walut dotyczy tylko kwot', () => {
  const money = catalog.convertPayload({
    type: 'categorical', unit: 'money',
    rows: [{ key: 'a', label: 'A', value: 10, extra: [{ label: 'x', value: 2, unit: 'money' }, { label: 'y', value: 5, unit: 'pct' }] }],
  }, 4);
  assert.equal(money.rows[0].value, 40);
  assert.equal(money.rows[0].extra[0].value, 8);
  assert.equal(money.rows[0].extra[1].value, 5);

  const pct = catalog.convertPayload({ type: 'categorical', unit: 'pct', rows: [{ key: 'a', label: 'A', value: 10 }] }, 4);
  assert.equal(pct.rows[0].value, 10);

  const series = catalog.convertPayload({ type: 'timeseries', unit: 'money', series: [{ key: 's', name: 's', points: [[1, 2]] }] }, 3);
  assert.deepEqual(series.series[0].points, [[1, 6]]);
});

test('wyszukiwanie monet: symbol ma pierwszeństwo', async () => {
  const results = await catalog.searchCoins('sol');
  assert.equal(results[0].symbol, 'SOL');
  const eth = await catalog.searchCoins('ethereum');
  assert.equal(eth[0].symbol, 'ETH');
});

test('snapshot zapisuje dane i daje się odczytać jako seria', async () => {
  const before = history.historyStatus().count;
  const snap = await history.takeSnapshot();
  assert.equal(history.historyStatus().count, before + 1);
  assert.ok(snap.g.total_market_cap > 0);
  const btc = history.coinSeries(1, 'price', 0);
  assert.equal(btc.at(-1)[0], snap.t);
  const file = path.join(process.env.DATA_DIR, 'snapshots-demo.jsonl');
  assert.ok(fs.readFileSync(file, 'utf8').trim().split('\n').length >= before + 1);
});
