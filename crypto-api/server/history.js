import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { sources } from './sources.js';
import { mockSnapshots } from './mock.js';

// Darmowy plan CMC nie daje danych historycznych, więc serwer sam co jakiś czas
// zapisuje zwięzły snapshot rynku (JSON Lines) i z nich rysuje wykresy w czasie.

const FILE = path.join(config.dataDir, config.mock ? 'snapshots-demo.jsonl' : 'snapshots.jsonl');
const NAMES_FILE = path.join(config.dataDir, config.mock ? 'names-demo.json' : 'names.json');
const TOP_CATEGORIES = 150;
const DAY = 86_400_000;
const FULL_RESOLUTION_DAYS = 30;

export const GLOBAL_FIELDS = [
  'total_market_cap', 'total_volume_24h', 'btc_dominance', 'eth_dominance', 'altcoin_market_cap',
  'defi_market_cap', 'stablecoin_market_cap', 'defi_volume_24h', 'stablecoin_volume_24h', 'derivatives_volume_24h',
];
export const CATEGORY_FIELDS = ['market_cap', 'volume'];
export const COIN_FIELDS = ['price', 'market_cap', 'volume_24h'];

let snapshots = [];
let names = { categories: {}, coins: {} };
let timer = null;
let lastError = null;
let lastCompaction = 0;

const sig = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(Number(v).toPrecision(6)));

export function buildSnapshot(t, { global, categories, listings }) {
  const snap = { t, g: {}, s: {}, c: {} };
  if (global) {
    const q = global.quote?.USD || {};
    for (const field of GLOBAL_FIELDS) {
      snap.g[field] = sig(q[field] ?? global[field]);
    }
  }
  if (Array.isArray(categories)) {
    const top = categories
      .filter((c) => Number(c.market_cap) > 0)
      .sort((a, b) => b.market_cap - a.market_cap)
      .slice(0, TOP_CATEGORIES);
    for (const c of top) {
      snap.s[c.id] = [sig(c.market_cap), sig(c.volume)];
      names.categories[c.id] = c.name;
    }
  }
  if (Array.isArray(listings)) {
    for (const coin of listings) {
      const q = coin.quote?.USD || {};
      snap.c[coin.id] = [sig(q.price), sig(q.market_cap), sig(q.volume_24h)];
      names.coins[coin.id] = { name: coin.name, symbol: coin.symbol };
    }
  }
  return snap;
}

function compact(list, now = Date.now()) {
  const cutoff = now - config.snapshotRetentionDays * DAY;
  const fullFrom = now - FULL_RESOLUTION_DAYS * DAY;
  const seenDays = new Set();
  return list.filter((s) => {
    if (s.t < cutoff) return false;
    if (s.t >= fullFrom) return true;
    const day = Math.floor(s.t / DAY);
    if (seenDays.has(day)) return false;
    seenDays.add(day);
    return true;
  });
}

function writeAll() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, snapshots.map((s) => JSON.stringify(s)).join('\n') + (snapshots.length ? '\n' : ''));
  fs.renameSync(tmp, FILE);
  fs.writeFileSync(NAMES_FILE, JSON.stringify(names));
}

function maybeCompact() {
  if (Date.now() - lastCompaction < DAY) return;
  lastCompaction = Date.now();
  const before = snapshots.length;
  snapshots = compact(snapshots);
  if (snapshots.length !== before) writeAll();
}

export function loadHistory() {
  snapshots = [];
  try {
    const lines = fs.readFileSync(FILE, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const snap = JSON.parse(line);
        if (Number.isFinite(snap.t)) snapshots.push(snap);
      } catch {
        // Uszkodzona linia (np. przerwany zapis) – pomijamy.
      }
    }
  } catch {
    // Brak pliku – zaczynamy od zera.
  }
  try {
    names = { categories: {}, coins: {}, ...JSON.parse(fs.readFileSync(NAMES_FILE, 'utf8')) };
  } catch {
    names = { categories: {}, coins: {} };
  }
  if (config.mock && snapshots.length === 0) {
    snapshots = mockSnapshots().map(({ t, data }) => buildSnapshot(t, data));
    writeAll();
  }
  snapshots.sort((a, b) => a.t - b.t);
  maybeCompact();
  return snapshots.length;
}

export async function takeSnapshot() {
  const [global, categories, listings] = await Promise.allSettled([
    sources.global(), sources.categories(), sources.listings(),
  ]);
  const value = (r) => (r.status === 'fulfilled' ? r.value.data : null);
  const failed = [global, categories, listings].filter((r) => r.status === 'rejected');
  if (failed.length === 3) {
    lastError = failed[0].reason.message;
    throw failed[0].reason;
  }
  lastError = failed.length ? failed.map((r) => r.reason.message).join(' ') : null;

  const snap = buildSnapshot(Date.now(), { global: value(global), categories: value(categories), listings: value(listings) });
  snapshots.push(snap);
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.appendFileSync(FILE, JSON.stringify(snap) + '\n');
  fs.writeFileSync(NAMES_FILE, JSON.stringify(names));
  maybeCompact();
  return snap;
}

export function startSnapshots() {
  const minutes = config.snapshotIntervalMinutes;
  if (!minutes || timer) return;
  const run = () => takeSnapshot().catch((err) => {
    lastError = err.message;
    console.warn(`[snapshot] ${err.message}`);
  });
  const last = snapshots.at(-1)?.t ?? 0;
  const dueIn = Math.max(5_000, last + minutes * 60_000 - Date.now());
  timer = setTimeout(() => {
    run();
    timer = setInterval(run, minutes * 60_000);
    timer.unref?.();
  }, dueIn);
  timer.unref?.();
}

export function historyStatus() {
  return {
    enabled: config.snapshotIntervalMinutes > 0,
    intervalMinutes: config.snapshotIntervalMinutes,
    count: snapshots.length,
    first: snapshots[0]?.t ?? null,
    last: snapshots.at(-1)?.t ?? null,
    lastError,
  };
}

function inRange(rangeMs) {
  if (!rangeMs) return snapshots;
  const from = Date.now() - rangeMs;
  return snapshots.filter((s) => s.t >= from);
}

export function globalSeries(field, rangeMs) {
  return inRange(rangeMs).filter((s) => s.g?.[field] != null).map((s) => [s.t, s.g[field]]);
}

export function categorySeries(id, field, rangeMs) {
  const idx = CATEGORY_FIELDS.indexOf(field);
  return inRange(rangeMs).filter((s) => s.s?.[id]?.[idx] != null).map((s) => [s.t, s.s[id][idx]]);
}

export function coinSeries(id, field, rangeMs) {
  const idx = COIN_FIELDS.indexOf(field);
  return inRange(rangeMs).filter((s) => s.c?.[id]?.[idx] != null).map((s) => [s.t, s.c[id][idx]]);
}

export function categoryName(id) {
  return names.categories[id] || id;
}

export function coinName(id) {
  const n = names.coins[id];
  return n ? `${n.name} (${n.symbol})` : `#${id}`;
}

// Identyfikatory kategorii lub monet z najnowszego snapshotu.
export function latestIds(kind) {
  const last = snapshots.at(-1);
  if (!last) return [];
  return Object.keys(kind === 'coins' ? last.c : last.s).map((id) => (kind === 'coins' ? Number(id) : id));
}

export function latestSnapshot() {
  return snapshots.at(-1) || null;
}
