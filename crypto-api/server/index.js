import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import express from 'express';
import { config } from './config.js';
import { endpointAvailability, stats } from './cmc.js';
import { sources } from './sources.js';
import {
  categoryOptions, coinsByIds, convertPayload, getDataset, publicCatalog, resolveParams, searchCoins,
} from './catalog.js';
import { historyStatus, loadHistory, startSnapshots, takeSnapshot } from './history.js';
import { defaultDashboard } from './dashboard.js';

const require = createRequire(import.meta.url);
const CURRENCIES = ['USD', 'EUR', 'PLN'];
const DASHBOARD_FILE = path.join(config.dataDir, 'dashboard.json');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

function sendError(res, err) {
  const status = err.httpStatus && err.httpStatus >= 400 && err.httpStatus < 600 ? err.httpStatus : 500;
  res.status(status).json({
    error: err.message || 'Nieznany błąd',
    code: err.code ?? null,
    endpoint: err.endpoint ?? null,
    paidPlanRequired: err.code === 1006,
  });
}

async function fiatRate(currency) {
  if (currency === 'USD') return 1;
  const res = await sources.fiatRate(currency);
  const data = Array.isArray(res.data) ? res.data[0] : res.data;
  const rate = Number(data?.quote?.[currency]?.price);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Nie udało się pobrać kursu USD → ${currency}.`);
  return rate;
}

app.get('/api/status', async (req, res) => {
  let key = null;
  try {
    const info = await sources.keyInfo();
    const month = info.data?.usage?.current_month || {};
    key = {
      creditsUsed: month.credits_used ?? null,
      creditsLeft: month.credits_left ?? null,
      creditLimit: info.data?.plan?.credit_limit_monthly ?? null,
      reset: info.data?.plan?.credit_limit_monthly_reset ?? null,
    };
  } catch (err) {
    key = { error: err.message };
  }
  res.json({
    mock: config.mock,
    mockReason: config.mock ? config.mockReason : null,
    cacheTtlMinutes: config.cacheTtlMinutes,
    currencies: CURRENCIES,
    key,
    server: { ...stats },
    history: historyStatus(),
  });
});

app.get('/api/catalog', (req, res) => {
  res.json(publicCatalog(endpointAvailability()));
});

app.get('/api/options/categories', async (req, res) => {
  try {
    res.json(await categoryOptions());
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/options/coins', async (req, res) => {
  try {
    if (req.query.ids) {
      const ids = String(req.query.ids).split(',').map(Number).filter(Number.isInteger).slice(0, 50);
      res.json(await coinsByIds(ids));
    } else {
      const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 10));
      res.json(await searchCoins(String(req.query.q || ''), limit));
    }
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/data/:id', async (req, res) => {
  const dataset = getDataset(req.params.id);
  if (!dataset) return res.status(404).json({ error: `Nieznany zbiór danych: ${req.params.id}` });
  let raw = {};
  try {
    raw = req.query.params ? JSON.parse(String(req.query.params)) : {};
  } catch {
    return res.status(400).json({ error: 'Parametr "params" musi być poprawnym JSON-em.' });
  }
  const currency = CURRENCIES.includes(String(req.query.currency)) ? String(req.query.currency) : 'USD';
  try {
    const params = resolveParams(dataset, raw);
    const [payload, rate] = await Promise.all([dataset.load(params), fiatRate(currency)]);
    const converted = convertPayload(payload, rate);
    res.json({ ...converted, dataset: dataset.id, params, currency, rate, endpoint: dataset.endpoint, plan: dataset.plan });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/dashboard', (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(DASHBOARD_FILE, 'utf8')));
  } catch {
    res.json(defaultDashboard());
  }
});

// Zapisany zakres suwaka wykresu w procentach osi czasu.
function validZoom(z) {
  const start = Number(z?.start);
  const end = Number(z?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 100 || end - start < 0.01) return null;
  return { start, end };
}

app.put('/api/dashboard', (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.widgets) || body.widgets.length > 100) {
    return res.status(400).json({ error: 'Nieprawidłowy układ dashboardu.' });
  }
  const widgets = body.widgets
    .filter((w) => w && typeof w.id === 'string' && getDataset(w.dataset))
    .map((w) => ({
      id: w.id.slice(0, 40),
      dataset: w.dataset,
      params: resolveParams(getDataset(w.dataset), w.params),
      chart: getDataset(w.dataset).charts.includes(w.chart) ? w.chart : getDataset(w.dataset).charts[0],
      size: ['s', 'm', 'l'].includes(w.size) ? w.size : getDataset(w.dataset).size,
      title: typeof w.title === 'string' ? w.title.slice(0, 120) : '',
      zoom: validZoom(w.zoom),
    }));
  const dashboard = {
    version: 1,
    currency: CURRENCIES.includes(body.currency) ? body.currency : 'USD',
    refreshMinutes: [0, 5, 10, 30, 60].includes(body.refreshMinutes) ? body.refreshMinutes : 10,
    widgets,
  };
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(DASHBOARD_FILE, JSON.stringify(dashboard, null, 2));
  res.json(dashboard);
});

app.delete('/api/dashboard', (req, res) => {
  fs.rmSync(DASHBOARD_FILE, { force: true });
  res.json(defaultDashboard());
});

app.post('/api/snapshot', async (req, res) => {
  try {
    const snap = await takeSnapshot();
    res.json({ ok: true, t: snap.t, history: historyStatus() });
  } catch (err) {
    sendError(res, err);
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Nie ma takiego endpointu.' }));

const echartsDir = path.dirname(require.resolve('echarts/package.json'));
app.get('/vendor/echarts.min.js', (req, res) => res.sendFile(path.join(echartsDir, 'dist', 'echarts.min.js')));
app.use(express.static(config.publicDir, { extensions: ['html'] }));

const count = loadHistory();
startSnapshots();

app.listen(config.port, config.host, () => {
  const mode = config.mock ? `TRYB DEMO (${config.mockReason})` : 'CoinMarketCap API';
  console.log(`Crypto API dashboard: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log(`Źródło danych: ${mode}. Cache: ${config.cacheTtlMinutes} min. Snapshoty: ${config.snapshotIntervalMinutes ? `co ${config.snapshotIntervalMinutes} min` : 'wyłączone'} (w pamięci: ${count}).`);
});
