import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { cmc } from './cmc.js';

// Pełna dzienna historia rynku z CoinMarketCap (od 28.04.2013) trzymana na dysku.
// Pierwsze pobranie kosztuje ok. 50 kredytów, potem dociągane są tylko nowe dni (1 kredyt).

const FILE = path.join(config.dataDir, config.mock ? 'cmc-global-history-demo.json' : 'cmc-global-history.json');
const START = '2013-04-28T00:00:00Z';
const REFRESH_MS = 6 * 3_600_000;

let store = null;
let refreshing = null;

function load() {
  try {
    store = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    store = { quotes: [], checkedAt: 0 };
  }
}

const slim = (d) => {
  const q = d.quote?.USD || {};
  return {
    timestamp: d.timestamp,
    btc_dominance: d.btc_dominance,
    quote: { USD: { total_market_cap: q.total_market_cap, total_volume_24h: q.total_volume_24h, altcoin_market_cap: q.altcoin_market_cap } },
  };
};

async function refresh() {
  const last = store.quotes.at(-1);
  const params = {
    time_start: last ? new Date(Date.parse(last.timestamp) + 1000).toISOString() : START,
    interval: 'daily', count: 5000, convert: 'USD',
  };
  try {
    const res = await cmc('/v1/global-metrics/quotes/historical', params, { ttlMinutes: 60 });
    const byTime = new Map(store.quotes.map((q) => [q.timestamp, q]));
    for (const q of res.data?.quotes || []) byTime.set(q.timestamp, slim(q));
    store.quotes = [...byTime.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    store.checkedAt = Date.now();
    store.fetchedAt = res.fetchedAt;
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store));
  } catch (err) {
    // Przy błędzie zostają dane z dysku; bez nich zgłaszamy błąd dalej.
    if (!store.quotes.length) throw err;
  }
}

export async function globalHistoryAll() {
  if (!store) load();
  if (!store.quotes.length || Date.now() - store.checkedAt > REFRESH_MS) {
    refreshing ??= refresh().finally(() => { refreshing = null; });
    await refreshing;
  }
  return store;
}
