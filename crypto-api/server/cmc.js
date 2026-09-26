import { config } from './config.js';
import { mockResponse } from './mock.js';

// Kody błędów CoinMarketCap: https://coinmarketcap.com/api/documentation/v1/#section/Errors-and-Rate-Limits
const ERROR_MESSAGES = {
  1001: 'Nieprawidłowy klucz API CoinMarketCap.',
  1002: 'Brak klucza API CoinMarketCap.',
  1003: 'Klucz API wymaga aktywacji planu.',
  1004: 'Plan klucza API wygasł.',
  1005: 'Klucz API jest wymagany.',
  1006: 'Twój plan CoinMarketCap nie obejmuje tego endpointu (wymagany plan płatny).',
  1007: 'Klucz API został wyłączony.',
  1008: 'Przekroczono limit zapytań na minutę – spróbuj za chwilę.',
  1009: 'Przekroczono dzienny limit kredytów.',
  1010: 'Przekroczono miesięczny limit kredytów.',
  1011: 'Przekroczono limit zapytań z tego adresu IP.',
};

export class CmcError extends Error {
  constructor(message, { code = null, httpStatus = 502, endpoint = null, transient = false } = {}) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.endpoint = endpoint;
    this.transient = transient;
  }
}

const cache = new Map();
const availability = new Map();
export const stats = { startedAt: Date.now(), requests: 0, credits: 0, cacheHits: 0, errors: 0 };

function cacheKey(endpoint, params) {
  const sorted = Object.keys(params).sort().map((k) => [k, String(params[k])]);
  return `${endpoint}?${new URLSearchParams(sorted)}`;
}

function sweepCache() {
  if (cache.size < 300) return;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (!entry.promise && entry.expires < now - 3_600_000) cache.delete(key);
  }
}

function markAvailability(endpoint, ok, error) {
  availability.set(endpoint, { ok, code: error?.code ?? null, message: error?.message ?? null, checkedAt: Date.now() });
}

async function request(endpoint, params) {
  stats.requests++;
  if (config.mock) {
    try {
      const body = mockResponse(endpoint, params);
      stats.credits += body.status.credit_count;
      return { data: body.data, fetchedAt: Date.now() };
    } catch (err) {
      throw new CmcError(err.message, { code: err.code, httpStatus: err.httpStatus, endpoint });
    }
  }

  const url = new URL(endpoint, config.baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  let res;
  try {
    res = await fetch(url, {
      headers: { 'X-CMC_PRO_API_KEY': config.apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new CmcError(`Brak połączenia z CoinMarketCap (${err.cause?.code || err.message}).`, { endpoint, transient: true });
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // Odpowiedź bez JSON-a – obsłużona niżej jako błąd HTTP.
  }
  const status = body?.status || {};
  stats.credits += Number(status.credit_count) || 0;
  const code = Number(status.error_code) || 0;

  if (!res.ok || code) {
    const message = ERROR_MESSAGES[code] || status.error_message || `CoinMarketCap zwrócił HTTP ${res.status}.`;
    throw new CmcError(message, {
      code: code || res.status,
      httpStatus: res.status,
      endpoint,
      transient: res.status >= 500 || code === 1008,
    });
  }
  return { data: body.data, fetchedAt: Date.now() };
}

/**
 * Zapytanie do CMC z cache w pamięci. Równoległe zapytania o to samo są łączone,
 * a przy chwilowej awarii zwracamy ostatnie znane dane zamiast błędu.
 */
export async function cmc(endpoint, params = {}, { ttlMinutes = config.cacheTtlMinutes } = {}) {
  const key = cacheKey(endpoint, params);
  const now = Date.now();
  const entry = cache.get(key);
  if (entry?.value && entry.expires > now) {
    stats.cacheHits++;
    return entry.value;
  }
  if (entry?.promise) return entry.promise;

  const promise = request(endpoint, params)
    .then((value) => {
      cache.set(key, { value, expires: Date.now() + ttlMinutes * 60_000 });
      markAvailability(endpoint, true);
      sweepCache();
      return value;
    })
    .catch((err) => {
      stats.errors++;
      if (err.code === 1006) markAvailability(endpoint, false, err);
      if (entry?.value && err.transient) {
        cache.set(key, { value: entry.value, expires: Date.now() + 60_000 });
        return { ...entry.value, stale: true };
      }
      if (entry?.value) cache.set(key, { value: entry.value, expires: 0 });
      else cache.delete(key);
      throw err;
    });

  cache.set(key, { ...entry, promise });
  return promise;
}

export function endpointAvailability() {
  return Object.fromEntries(availability);
}
