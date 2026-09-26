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
  // Prawdziwe nazwy z CMC, które nie są branżami.
  for (const name of ['SEC/CFTC Digital Commodities', '2017/18 Alt season', 'Alleged SEC Securities', 'CMC Crypto Awards 2024', 'CMC Crypto Yearbook 2024-25', 'FTX Bankruptcy Estate ', 'Binance Liquidity Enhancement Program', 'ISO 20022']) {
    assert.equal(catalog.categoryGroup(name), 'other', name);
  }
  assert.equal(catalog.categoryGroup('Real Estate'), 'sectors');
  assert.equal(catalog.categoryGroup('Decentralized Exchange (DEX) Token'), 'sectors');
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

test('prędkość zmiany: okno i przeliczenie na jednostkę czasu', () => {
  const H = 3_600_000;
  // Wartość rośnie o 1 na godzinę: 100, 101, …, 148.
  const points = Array.from({ length: 49 }, (_, i) => [i * H, 100 + i]);
  const changes = catalog.windowChanges(points, 24 * H, 24 * H);
  const last = changes.at(-1);
  assert.equal(last.t, 48 * H);
  assert.equal(last.delta, 24);
  assert.ok(Math.abs(last.pct - 24 / 124 * 100) < 1e-9);
  assert.ok(Math.abs(last.rate - last.pct) < 1e-9, 'okno 24h w przeliczeniu na dzień = zmiana w oknie');
  const hourly = catalog.windowChanges(points, 24 * H, H).at(-1);
  assert.ok(Math.abs(hourly.rate - last.pct / 24) < 1e-9, 'na godzinę = 1/24 zmiany dobowej');
  assert.ok(Math.abs(hourly.rateAbs - 1) < 1e-9, 'wartość rośnie o 1 na godzinę');
  // Punkty bez danych sprzed okna (z tolerancją 10%) są pomijane.
  assert.ok(changes[0].t >= 22 * H && changes[0].t <= 24 * H);
  // Tempo liczone jest z faktycznego odstępu, więc przy 22 h okna nadal wynosi 1 na godzinę.
  assert.ok(Math.abs(catalog.windowChanges(points, 24 * H, H)[0].rateAbs - 1) < 1e-9);
});

test('przekształcenie serii w prędkość dodaje jednostkę i linię zera', async () => {
  const ds = catalog.getDataset('history.global');
  const payload = await ds.load(catalog.resolveParams(ds, { metric: 'total_market_cap', transform: 'rate', window: '24', per: 'day' }));
  assert.equal(payload.unit, 'pct');
  assert.equal(payload.suffix, '/d');
  assert.equal(payload.zeroLine, true);
  assert.ok(payload.series[0].points.length > 100);
  const perf = catalog.getDataset('coin.performance');
  const speed = await perf.load(catalog.resolveParams(perf, { coin: 1, per: 'day' }));
  const raw = await perf.load(catalog.resolveParams(perf, { coin: 1 }));
  const r7 = speed.rows.find((r) => r.label === '7d').value;
  const c7 = raw.rows.find((r) => r.label === '7d').value;
  assert.ok(Math.abs(r7 - c7 / 7) < 1e-9);
});

test('źródła on-chain: wybór wielu sieci i saldo przepływów giełdowych', async () => {
  const ds = catalog.getDataset('onchain.series');
  const p = catalog.resolveParams(ds, { assets: ['btc', 'eth', 'nieistnieje', 'btc', 'ltc', 'doge', 'xrp'], metric: 'FlowNetExUSD' });
  assert.deepEqual(p.assets, ['btc', 'eth', 'ltc', 'doge'], 'tylko znane sieci, bez duplikatów, max 4');
  const payload = await ds.load(catalog.resolveParams(ds, { assets: ['btc', 'xrp'], metric: 'FlowNetExUSD' }));
  assert.equal(payload.series.length, 1, 'XRP nie ma przepływów giełdowych w darmowym planie');
  assert.match(payload.note, /XRP/);
  assert.equal(payload.zeroLine, true);
});

test('najdłuższa historia: strony indeksu strachu i pełna historia rynku CMC', async () => {
  const fng = catalog.getDataset('sentiment.fng_history');
  const all = await fng.load(catalog.resolveParams(fng, { days: '0' }));
  const pts = all.series[0].points;
  assert.ok(pts.length > 1000, `oczekiwano >1000 dni, jest ${pts.length}`);
  assert.equal(new Set(pts.map(([t]) => t)).size, pts.length, 'bez duplikatów między stronami');

  const g = catalog.getDataset('cmc.global_history');
  const full = await g.load(catalog.resolveParams(g, { metric: 'total_market_cap', days: '0' }));
  const again = await g.load(catalog.resolveParams(g, { metric: 'total_market_cap', days: '365' }));
  assert.ok(full.series[0].points.length > 4000, 'historia od 2013');
  assert.ok(again.series[0].points.length <= 366);
});
