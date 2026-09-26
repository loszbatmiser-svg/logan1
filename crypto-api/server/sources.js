import { config } from './config.js';
import { cmc } from './cmc.js';

// Jedno miejsce z parametrami zapytań do CMC. Wspólne parametry = wspólny cache,
// więc kilka wykresów korzysta z jednego zapytania i jednego zużycia kredytów.
const fast = () => config.cacheTtlMinutes;
const slow = () => Math.max(15, config.cacheTtlMinutes);

export const sources = {
  global: () => cmc('/v1/global-metrics/quotes/latest', { convert: 'USD' }, { ttlMinutes: fast() }),

  categories: () => cmc('/v1/cryptocurrency/categories', { start: 1, limit: 5000 }, { ttlMinutes: slow() }),

  category: (id) => cmc('/v1/cryptocurrency/category', { id, start: 1, limit: 100, convert: 'USD' }, { ttlMinutes: slow() }),

  // Top 200 = 1 kredyt. Z tej jednej listy liczone są rankingi, heatmapa i wzrosty/spadki.
  listings: () => cmc('/v1/cryptocurrency/listings/latest', { start: 1, limit: 200, convert: 'USD', sort: 'market_cap' }, { ttlMinutes: fast() }),

  quotes: (ids) => cmc('/v2/cryptocurrency/quotes/latest', { id: [...new Set(ids)].sort((a, b) => a - b).join(','), convert: 'USD' }, { ttlMinutes: fast() }),

  map: () => cmc('/v1/cryptocurrency/map', { listing_status: 'active', start: 1, limit: 5000, sort: 'cmc_rank' }, { ttlMinutes: 24 * 60 }),

  fearGreed: () => cmc('/v3/fear-and-greed/latest', {}, { ttlMinutes: 60 }),

  fearGreedHistory: (limit) => cmc('/v3/fear-and-greed/historical', { start: 1, limit }, { ttlMinutes: 6 * 60 }),

  keyInfo: () => cmc('/v1/key/info', {}, { ttlMinutes: 1 }),

  // 2781 = USD w CoinMarketCap. Kurs służy do przeliczania kwot na wybraną walutę.
  fiatRate: (currency) => cmc('/v2/tools/price-conversion', { id: 2781, amount: 1, convert: currency }, { ttlMinutes: 60 }),

  globalHistory: (days) => cmc('/v1/global-metrics/quotes/historical', { interval: 'daily', count: days, convert: 'USD' }, { ttlMinutes: 60 }),

  coinHistory: (ids, days) => cmc('/v2/cryptocurrency/quotes/historical', { id: [...new Set(ids)].sort((a, b) => a - b).join(','), interval: 'daily', count: days, convert: 'USD' }, { ttlMinutes: 60 }),
};
