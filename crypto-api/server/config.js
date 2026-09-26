import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // Brak pliku .env – korzystamy tylko ze zmiennych środowiskowych.
}

const env = process.env;
const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const apiKey = (env.CMC_API_KEY || '').trim();
const mock = process.argv.includes('--mock') || env.CMC_MOCK === '1' || !apiKey;

export const config = {
  root: ROOT,
  dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(ROOT, 'data'),
  publicDir: path.join(ROOT, 'public'),
  port: num(env.PORT, 3000),
  host: env.HOST || '127.0.0.1',
  apiKey,
  mock,
  mockReason: !apiKey ? 'brak CMC_API_KEY w .env' : 'włączony tryb demo',
  baseUrl: env.CMC_BASE_URL || 'https://pro-api.coinmarketcap.com',
  cacheTtlMinutes: Math.max(1, num(env.CACHE_TTL_MINUTES, 10)),
  snapshotIntervalMinutes: Math.max(0, num(env.SNAPSHOT_INTERVAL_MINUTES, 60)),
  snapshotRetentionDays: Math.max(1, num(env.SNAPSHOT_RETENTION_DAYS, 365)),
};
