import { config } from './config.js';
import { mockExternal } from './mock-external.js';

// Pobieranie z darmowych API bez klucza (Coin Metrics, DefiLlama, mempool.space)
// z tym samym zachowaniem co klient CMC: cache, łączenie równoległych zapytań
// i ostatnie znane dane przy chwilowej awarii.

const cache = new Map();
export const externalStats = { requests: 0, cacheHits: 0, errors: 0 };

export class SourceError extends Error {
  constructor(message, { httpStatus = 502, source = null } = {}) {
    super(message);
    this.httpStatus = httpStatus;
    this.source = source;
  }
}

async function request(url, timeoutMs) {
  externalStats.requests++;
  const source = new URL(url).hostname;
  if (config.mock) {
    try {
      return { data: mockExternal(url), fetchedAt: Date.now() };
    } catch (err) {
      throw new SourceError(err.message, { httpStatus: 404, source });
    }
  }
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'przekroczono czas oczekiwania' : err.cause?.code || err.message;
    throw new SourceError(`Brak połączenia z ${source} (${reason}).`, { source });
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) {
    const detail = body?.error?.message || body?.message || `HTTP ${res.status}`;
    throw new SourceError(`${source}: ${detail}`, { httpStatus: res.status === 403 ? 403 : 502, source });
  }
  return { data: body, fetchedAt: Date.now() };
}

export async function fetchJson(url, { ttlMinutes = 15, timeoutMs = 30_000 } = {}) {
  const now = Date.now();
  const entry = cache.get(url);
  if (entry?.value && entry.expires > now) {
    externalStats.cacheHits++;
    return entry.value;
  }
  if (entry?.promise) return entry.promise;
  const promise = request(url, timeoutMs)
    .then((value) => {
      cache.set(url, { value, expires: Date.now() + ttlMinutes * 60_000 });
      return value;
    })
    .catch((err) => {
      externalStats.errors++;
      if (entry?.value) {
        cache.set(url, { value: entry.value, expires: Date.now() + 60_000 });
        return { ...entry.value, stale: true };
      }
      cache.delete(url);
      throw err;
    });
  cache.set(url, { ...entry, promise });
  return promise;
}
