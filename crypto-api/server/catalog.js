import { sources } from './sources.js';
import * as history from './history.js';
import { stats } from './cmc.js';

// Katalog wszystkich wykresów, które można dodać do dashboardu. Każdy zbiór danych
// opisuje: skąd bierze dane (endpoint CMC), jakie ma parametry, jakie typy wykresu
// pasują do jego danych i gotowe "presety" widoczne w wyszukiwarce.

export const GROUPS = [
  {
    id: 'global', name: 'Rynek globalny',
    description: 'Łączna kapitalizacja, wolumen, dominacja BTC/ETH, DeFi, stablecoiny i derywaty.',
    endpoints: ['/v1/global-metrics/quotes/latest'], plan: 'free',
  },
  {
    id: 'sectors', name: 'Sektory i kategorie',
    description: 'Branże (AI, DeFi, Memes, Layer 1…), ekosystemy i portfele funduszy – kapitalizacja, wolumen, zmiany.',
    endpoints: ['/v1/cryptocurrency/categories', '/v1/cryptocurrency/category'], plan: 'free',
  },
  {
    id: 'coins', name: 'Kryptowaluty',
    description: 'Rankingi top 200, heatmapa, wzrosty i spadki, porównania i wyniki pojedynczych monet.',
    endpoints: ['/v1/cryptocurrency/listings/latest', '/v2/cryptocurrency/quotes/latest', '/v1/cryptocurrency/map'], plan: 'free',
  },
  {
    id: 'sentiment', name: 'Sentyment',
    description: 'Indeks strachu i chciwości CoinMarketCap – bieżący i historyczny.',
    endpoints: ['/v3/fear-and-greed/latest', '/v3/fear-and-greed/historical'], plan: 'free',
  },
  {
    id: 'history', name: 'Historia (lokalne snapshoty)',
    description: 'Wykresy w czasie z danych, które serwer sam zapisuje co godzinę – działa na darmowym planie.',
    endpoints: ['snapshoty serwera'], plan: 'local',
  },
  {
    id: 'historical', name: 'Historia CMC (plan płatny)',
    description: 'Oficjalne dane historyczne CoinMarketCap. Wymagają planu Hobbyist lub wyższego.',
    endpoints: ['/v1/global-metrics/quotes/historical', '/v2/cryptocurrency/quotes/historical'], plan: 'paid',
  },
  {
    id: 'account', name: 'Konto API',
    description: 'Zużycie kredytów i limity Twojego klucza API.',
    endpoints: ['/v1/key/info'], plan: 'free',
  },
];

// ---------------------------------------------------------------- pomocnicze

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const usd = (item) => item?.quote?.USD || {};
const DAY = 86_400_000;

export function categoryGroup(name = '') {
  if (/ecosystem/i.test(name)) return 'ecosystems';
  if (/portfolio/i.test(name)) return 'portfolios';
  // Listy tematyczne CMC, klasyfikacje regulacyjne, launchpady i regiony – to nie są branże.
  if (/launchpad|launchpool|megadrop|hodler|binance alpha|liquidity enhancement|made in|bankruptcy|listing|reserve|\betf\b|sec\/cftc|\bsec\b|alt ?season|cmc crypto|yearbook|awards|iso 20022/i.test(name)) return 'other';
  return 'sectors';
}

const CATEGORY_GROUP_OPTIONS = [
  { value: 'sectors', label: 'Sektory (branże)' },
  { value: 'ecosystems', label: 'Ekosystemy blockchain' },
  { value: 'portfolios', label: 'Portfele funduszy VC' },
  { value: 'other', label: 'Inne (listy CMC, regulacje, launchpady, regiony)' },
  { value: 'all', label: 'Wszystkie kategorie' },
];
const GROUP_NOUN = { sectors: 'sektorów', ecosystems: 'ekosystemów', portfolios: 'portfeli VC', other: 'kategorii', all: 'kategorii' };

const ORDER_OPTIONS = [
  { value: 'desc', label: 'Od najwyższych' },
  { value: 'asc', label: 'Od najniższych' },
];

const RANGE_OPTIONS = [
  { value: '1', label: '24 godziny' },
  { value: '7', label: '7 dni' },
  { value: '30', label: '30 dni' },
  { value: '90', label: '90 dni' },
  { value: '365', label: '1 rok' },
  { value: '0', label: 'Cała historia' },
];

const DAYS_OPTIONS = [
  { value: '7', label: '7 dni' },
  { value: '30', label: '30 dni' },
  { value: '90', label: '90 dni' },
  { value: '180', label: '180 dni' },
  { value: '365', label: '1 rok' },
];

const MODE_OPTIONS = [
  { value: 'absolute', label: 'Wartości bezwzględne' },
  { value: 'index', label: 'Indeks (start = 100) – do porównań' },
];

const options = (metrics, keys = Object.keys(metrics)) => keys.map((k) => ({ value: k, label: metrics[k].label }));

function sortRows(rows, order, limit) {
  const sorted = rows.filter((r) => r.value != null).sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value));
  return limit ? sorted.slice(0, limit) : sorted;
}

function toIndex(series) {
  return series.map((s) => {
    const base = s.points.find(([, v]) => v)?.[1];
    return { ...s, points: base ? s.points.map(([t, v]) => [t, (v / base) * 100]) : [] };
  });
}

// ---------------------------------------------------------------- zmiana i prędkość w czasie

const HOUR = 3_600_000;
const PER_UNITS = {
  hour: { label: 'na godzinę', short: '/h', ms: HOUR },
  day: { label: 'na dzień', short: '/d', ms: 24 * HOUR },
  week: { label: 'na tydzień', short: '/tydz.', ms: 7 * 24 * HOUR },
  month: { label: 'na miesiąc (30 dni)', short: '/mies.', ms: 30 * 24 * HOUR },
  year: { label: 'na rok', short: '/rok', ms: 365 * 24 * HOUR },
};
const PER_OPTIONS = Object.entries(PER_UNITS).map(([value, u]) => ({ value, label: u.label }));

const WINDOW_OPTIONS = [
  { value: '1', label: '1 godzina' }, { value: '4', label: '4 godziny' }, { value: '12', label: '12 godzin' },
  { value: '24', label: '24 godziny' }, { value: '72', label: '3 dni' }, { value: '168', label: '7 dni' },
  { value: '720', label: '30 dni' },
];
const windowLabel = (hours) => WINDOW_OPTIONS.find((o) => o.value === String(hours))?.label || `${hours} h`;

const TRANSFORMS = {
  value: { label: 'Wartość' },
  change: { label: 'Zmiana od początku zakresu (%)', short: 'zmiana od początku' },
  pct: { label: 'Zmiana w oknie (%)', short: 'zmiana w oknie' },
  delta: { label: 'Zmiana w oknie (wartość)', short: 'zmiana w oknie' },
  rate: { label: 'Prędkość zmiany (% na jednostkę czasu)', short: 'prędkość' },
  rate_abs: { label: 'Prędkość zmiany (wartość na jednostkę czasu)', short: 'prędkość' },
  accel: { label: 'Przyspieszenie (o ile zmieniła się prędkość w oknie)', short: 'przyspieszenie' },
};

const TIME_PARAMS = [
  { key: 'transform', label: 'Pokaż', type: 'select', options: options(TRANSFORMS), default: 'value' },
  { key: 'window', label: 'Okno pomiaru zmiany', type: 'select', options: WINDOW_OPTIONS, default: '24', showIf: { transform: ['pct', 'delta', 'rate', 'rate_abs', 'accel'] } },
  { key: 'per', label: 'Prędkość w przeliczeniu', type: 'select', options: PER_OPTIONS, default: 'day', showIf: { transform: ['rate', 'rate_abs', 'accel'] } },
];

// Dla każdego punktu szuka punktu sprzed `windowMs` (z tolerancją 10%, bo snapshoty
// nie są idealnie równe) i liczy zmianę oraz jej tempo w przeliczeniu na `perMs`.
export function windowChanges(points, windowMs, perMs) {
  const out = [];
  const tol = windowMs * 0.1;
  let j = 0;
  for (let i = 1; i < points.length; i++) {
    const [t, v] = points[i];
    const target = t - windowMs;
    while (j + 1 < i && points[j + 1][0] <= target) j++;
    // Najbliższy punkt do początku okna: ostatni przed nim albo pierwszy po nim.
    let k = j;
    if (j + 1 < i && Math.abs(points[j + 1][0] - target) < Math.abs(points[j][0] - target)) k = j + 1;
    const [t0, v0] = points[k];
    if (Math.abs(t0 - target) > tol || !v0) continue;
    const dt = t - t0;
    const pct = (v / v0 - 1) * 100;
    out.push({ t, delta: v - v0, pct, rate: (pct * perMs) / dt, rateAbs: ((v - v0) * perMs) / dt });
  }
  return out;
}

function applyTransform(payload, p) {
  if (payload.type !== 'timeseries' || !p.transform || p.transform === 'value') return payload;
  const windowMs = Number(p.window) * HOUR;
  const per = PER_UNITS[p.per];
  let unit = 'pct';
  let suffix = '';
  const series = payload.series.map((s) => {
    let points;
    if (p.transform === 'change') {
      const base = s.points.find(([, v]) => v)?.[1];
      points = base ? s.points.map(([t, v]) => [t, (v / base - 1) * 100]) : [];
    } else {
      const changes = windowChanges(s.points, windowMs, per.ms);
      if (p.transform === 'accel') {
        const rates = changes.map((c) => [c.t, c.rate]);
        points = windowChanges(rates, windowMs, per.ms).map((c) => [c.t, c.delta]);
      } else {
        const key = { pct: 'pct', delta: 'delta', rate: 'rate', rate_abs: 'rateAbs' }[p.transform];
        points = changes.map((c) => [c.t, c[key]]);
      }
    }
    return { ...s, points };
  });
  if (p.transform === 'delta' || p.transform === 'rate_abs') unit = payload.unit;
  if (p.transform === 'rate' || p.transform === 'rate_abs') suffix = per.short;
  if (p.transform === 'accel') suffix = per.short;
  const detail = p.transform === 'change' ? '' : ` (okno ${windowLabel(p.window)}${suffix ? `, ${per.label}` : ''})`;
  return {
    ...payload,
    title: `${payload.title} – ${TRANSFORMS[p.transform].short}${detail}`,
    unit: p.transform === 'accel' ? 'pp' : unit,
    suffix,
    zeroLine: true,
    series,
  };
}

const categorical = (fields) => ({ type: 'categorical', ...fields });
const timeseries = (fields) => ({ type: 'timeseries', ...fields });

// ---------------------------------------------------------------- miary

const GLOBAL_METRICS = {
  total_market_cap: {
    label: 'Całkowita kapitalizacja rynku', unit: 'money',
    get: (g, q) => q.total_market_cap, change: (g, q) => q.total_market_cap_yesterday_percentage_change,
  },
  total_volume_24h: {
    label: 'Wolumen 24h (cały rynek)', unit: 'money',
    get: (g, q) => q.total_volume_24h, change: (g, q) => q.total_volume_24h_yesterday_percentage_change,
  },
  btc_dominance: {
    label: 'Dominacja BTC', unit: 'pct', changeUnit: 'pp',
    get: (g) => g.btc_dominance,
    change: (g) => (num(g.btc_dominance_yesterday) != null ? g.btc_dominance - g.btc_dominance_yesterday : null),
  },
  eth_dominance: {
    label: 'Dominacja ETH', unit: 'pct', changeUnit: 'pp',
    get: (g) => g.eth_dominance,
    change: (g) => (num(g.eth_dominance_yesterday) != null ? g.eth_dominance - g.eth_dominance_yesterday : null),
  },
  altcoin_market_cap: { label: 'Kapitalizacja altcoinów', unit: 'money', get: (g, q) => q.altcoin_market_cap },
  altcoin_volume_24h: { label: 'Wolumen altcoinów 24h', unit: 'money', get: (g, q) => q.altcoin_volume_24h },
  defi_market_cap: {
    label: 'Kapitalizacja DeFi', unit: 'money',
    get: (g, q) => q.defi_market_cap ?? g.defi_market_cap, change: (g) => g.defi_24h_percentage_change,
  },
  defi_volume_24h: { label: 'Wolumen DeFi 24h', unit: 'money', get: (g, q) => q.defi_volume_24h ?? g.defi_volume_24h },
  stablecoin_market_cap: {
    label: 'Kapitalizacja stablecoinów', unit: 'money',
    get: (g, q) => q.stablecoin_market_cap ?? g.stablecoin_market_cap, change: (g) => g.stablecoin_24h_percentage_change,
  },
  stablecoin_volume_24h: { label: 'Wolumen stablecoinów 24h', unit: 'money', get: (g, q) => q.stablecoin_volume_24h ?? g.stablecoin_volume_24h },
  derivatives_volume_24h: {
    label: 'Wolumen derywatów 24h', unit: 'money',
    get: (g, q) => q.derivatives_volume_24h ?? g.derivatives_volume_24h, change: (g) => g.derivatives_24h_percentage_change,
  },
  active_cryptocurrencies: { label: 'Aktywne kryptowaluty', unit: 'count', get: (g) => g.active_cryptocurrencies },
  active_exchanges: { label: 'Aktywne giełdy', unit: 'count', get: (g) => g.active_exchanges },
  active_market_pairs: { label: 'Aktywne pary rynkowe', unit: 'count', get: (g) => g.active_market_pairs },
};

const SECTOR_METRICS = {
  market_cap: { label: 'Kapitalizacja', unit: 'money', get: (c) => num(c.market_cap) },
  volume: { label: 'Wolumen 24h', unit: 'money', get: (c) => num(c.volume) },
  market_cap_change: { label: 'Zmiana kapitalizacji 24h', unit: 'pct', polarity: true, get: (c) => num(c.market_cap_change) },
  volume_change: { label: 'Zmiana wolumenu 24h', unit: 'pct', polarity: true, get: (c) => num(c.volume_change) },
  avg_price_change: { label: 'Średnia zmiana ceny 24h', unit: 'pct', polarity: true, get: (c) => num(c.avg_price_change) },
  turnover: {
    label: 'Obrót (wolumen / kapitalizacja)', unit: 'pct',
    get: (c) => (num(c.market_cap) > 0 && num(c.volume) != null ? (c.volume / c.market_cap) * 100 : null),
  },
  num_tokens: { label: 'Liczba tokenów', unit: 'count', get: (c) => num(c.num_tokens) },
};

const COIN_METRICS = {
  market_cap: { label: 'Kapitalizacja', unit: 'money', get: (q) => num(q.market_cap) },
  volume_24h: { label: 'Wolumen 24h', unit: 'money', get: (q) => num(q.volume_24h) },
  price: { label: 'Cena', unit: 'money', get: (q) => num(q.price) },
  turnover: {
    label: 'Obrót 24h (wolumen / kapitalizacja)', unit: 'pct',
    get: (q) => (num(q.market_cap) > 0 && num(q.volume_24h) != null ? (q.volume_24h / q.market_cap) * 100 : null),
  },
  market_cap_dominance: { label: 'Udział w całym rynku', unit: 'pct', get: (q) => num(q.market_cap_dominance) },
  percent_change_1h: { label: 'Zmiana ceny 1h', unit: 'pct', polarity: true, get: (q) => num(q.percent_change_1h) },
  percent_change_24h: { label: 'Zmiana ceny 24h', unit: 'pct', polarity: true, get: (q) => num(q.percent_change_24h) },
  percent_change_7d: { label: 'Zmiana ceny 7d', unit: 'pct', polarity: true, get: (q) => num(q.percent_change_7d) },
  percent_change_30d: { label: 'Zmiana ceny 30d', unit: 'pct', polarity: true, get: (q) => num(q.percent_change_30d) },
  percent_change_60d: { label: 'Zmiana ceny 60d', unit: 'pct', polarity: true, get: (q) => num(q.percent_change_60d) },
  percent_change_90d: { label: 'Zmiana ceny 90d', unit: 'pct', polarity: true, get: (q) => num(q.percent_change_90d) },
  volume_change_24h: { label: 'Zmiana wolumenu 24h', unit: 'pct', polarity: true, get: (q) => num(q.volume_change_24h) },
};
const COIN_RANKING_KEYS = Object.keys(COIN_METRICS).filter((k) => k !== 'price');
const COIN_SECTOR_KEYS = ['market_cap', 'volume_24h', 'share', 'turnover', 'percent_change_1h', 'percent_change_24h', 'percent_change_7d'];

const HISTORY_GLOBAL_METRICS = Object.fromEntries(history.GLOBAL_FIELDS.map((k) => [k, GLOBAL_METRICS[k]]));
const HISTORY_COIN_METRICS = { price: COIN_METRICS.price, market_cap: COIN_METRICS.market_cap, volume_24h: COIN_METRICS.volume_24h };
const HISTORY_SECTOR_METRICS = { market_cap: SECTOR_METRICS.market_cap, volume: SECTOR_METRICS.volume };

const PERFORMANCE = [
  ['percent_change_1h', '1h', 1], ['percent_change_24h', '24h', 24], ['percent_change_7d', '7d', 168],
  ['percent_change_30d', '30d', 720], ['percent_change_60d', '60d', 1440], ['percent_change_90d', '90d', 2160],
];

const FNG_PL = {
  'extreme fear': 'Skrajny strach', fear: 'Strach', neutral: 'Neutralnie', greed: 'Chciwość', 'extreme greed': 'Skrajna chciwość',
};
const fngLabel = (text) => FNG_PL[String(text || '').toLowerCase()] || text;

const isStable = (coin) => (coin.tags || []).some((t) => String(t).toLowerCase() === 'stablecoin');

function coinRow(coin, metric, extraChange = 'percent_change_24h') {
  const q = usd(coin);
  const value = metric.get(q, coin);
  return {
    key: String(coin.id),
    label: coin.symbol,
    name: `${coin.name} (${coin.symbol})`,
    value,
    size: num(q.market_cap),
    change: metric.polarity ? value : num(q[extraChange]),
    extra: [
      { label: 'Cena', value: num(q.price), unit: 'money' },
      { label: 'Kapitalizacja', value: num(q.market_cap), unit: 'money' },
      { label: 'Wolumen 24h', value: num(q.volume_24h), unit: 'money' },
      { label: 'Zmiana 24h', value: num(q.percent_change_24h), unit: 'pct' },
    ],
  };
}

function sectorRow(c, metric) {
  const value = metric.get(c);
  return {
    key: c.id,
    label: c.name,
    value,
    size: metric.unit === 'pct' ? num(c.market_cap) : value,
    change: metric.polarity ? value : num(c.market_cap_change),
    extra: [
      { label: 'Kapitalizacja', value: num(c.market_cap), unit: 'money' },
      { label: 'Wolumen 24h', value: num(c.volume), unit: 'money' },
      { label: 'Zmiana kap. 24h', value: num(c.market_cap_change), unit: 'pct' },
      { label: 'Śr. zmiana ceny 24h', value: num(c.avg_price_change), unit: 'pct' },
      { label: 'Tokeny', value: num(c.num_tokens), unit: 'count' },
    ],
  };
}

async function categoryList() {
  const res = await sources.categories();
  const list = (res.data || []).filter((c) => c && c.id && c.name);
  return { res, list };
}

async function defaultSectors(count) {
  const { list } = await categoryList();
  return list
    .filter((c) => categoryGroup(c.name) === 'sectors' && num(c.market_cap) > 0)
    .sort((a, b) => b.market_cap - a.market_cap)
    .slice(0, count)
    .map((c) => c.id);
}

// ---------------------------------------------------------------- zbiory danych

const DATASETS = [
  // ------------------------------------------------ rynek globalny
  {
    id: 'global.kpi', group: 'global',
    title: 'Wskaźnik rynku (liczba)',
    description: 'Jedna kluczowa liczba z dzienną zmianą – kapitalizacja, wolumen, dominacja, DeFi, stablecoiny.',
    endpoint: '/v1/global-metrics/quotes/latest', plan: 'free', charts: ['kpi'], size: 's',
    params: [{ key: 'metric', label: 'Wskaźnik', type: 'select', options: options(GLOBAL_METRICS), default: 'total_market_cap' }],
    presets: [
      { title: 'Całkowita kapitalizacja rynku', params: { metric: 'total_market_cap' }, keywords: 'market cap total' },
      { title: 'Wolumen 24h całego rynku', params: { metric: 'total_volume_24h' }, keywords: 'volume' },
      { title: 'Dominacja Bitcoina', params: { metric: 'btc_dominance' }, keywords: 'btc dominance' },
      { title: 'Dominacja Ethereum', params: { metric: 'eth_dominance' }, keywords: 'eth dominance' },
      { title: 'Kapitalizacja DeFi', params: { metric: 'defi_market_cap' }, keywords: 'defi market cap' },
      { title: 'Kapitalizacja stablecoinów', params: { metric: 'stablecoin_market_cap' }, keywords: 'stablecoin usdt usdc' },
      { title: 'Wolumen derywatów 24h', params: { metric: 'derivatives_volume_24h' }, keywords: 'derivatives futures volume' },
      { title: 'Liczba aktywnych kryptowalut', params: { metric: 'active_cryptocurrencies' }, keywords: 'count' },
    ],
    async load(p) {
      const res = await sources.global();
      const g = res.data || {};
      const m = GLOBAL_METRICS[p.metric];
      return {
        type: 'kpi', title: m.label, unit: m.unit,
        value: num(m.get(g, usd(g))),
        change: m.change ? num(m.change(g, usd(g))) : null,
        changeUnit: m.changeUnit || 'pct', changeLabel: 'vs wczoraj',
        updatedAt: res.fetchedAt,
      };
    },
  },
  {
    id: 'global.dominance', group: 'global',
    title: 'Dominacja rynkowa',
    description: 'Udział BTC, ETH, stablecoinów i reszty rynku w całkowitej kapitalizacji.',
    endpoint: '/v1/global-metrics/quotes/latest', plan: 'free', charts: ['donut', 'hbar', 'table'], size: 'm',
    params: [],
    presets: [{ title: 'Dominacja rynkowa BTC / ETH / stablecoiny', keywords: 'dominance udział share pie' }],
    async load() {
      const res = await sources.global();
      const g = res.data || {};
      const q = usd(g);
      const btc = num(g.btc_dominance) ?? 0;
      const eth = num(g.eth_dominance) ?? 0;
      const stable = num(q.stablecoin_market_cap ?? g.stablecoin_market_cap) && num(q.total_market_cap)
        ? ((q.stablecoin_market_cap ?? g.stablecoin_market_cap) / q.total_market_cap) * 100 : 0;
      const rows = [
        { key: 'btc', label: 'Bitcoin', value: btc },
        { key: 'eth', label: 'Ethereum', value: eth },
        { key: 'stable', label: 'Stablecoiny', value: stable },
        { key: 'rest', label: 'Pozostałe', value: Math.max(0, 100 - btc - eth - stable) },
      ];
      return categorical({ title: 'Dominacja rynkowa', unit: 'pct', valueLabel: 'Udział w kapitalizacji', rows, partToWhole: true, updatedAt: res.fetchedAt });
    },
  },
  {
    id: 'global.market_segments', group: 'global',
    title: 'Kapitalizacja wg segmentów rynku',
    description: 'Cały rynek, altcoiny, stablecoiny i DeFi obok siebie.',
    endpoint: '/v1/global-metrics/quotes/latest', plan: 'free', charts: ['hbar', 'column', 'table'], size: 'm',
    params: [],
    presets: [{ title: 'Kapitalizacja wg segmentów rynku', keywords: 'market cap defi stablecoin altcoin' }],
    async load() {
      const res = await sources.global();
      const g = res.data || {};
      const q = usd(g);
      const rows = [
        { key: 'total', label: 'Cały rynek', value: num(q.total_market_cap) },
        { key: 'alt', label: 'Altcoiny', value: num(q.altcoin_market_cap) },
        { key: 'stable', label: 'Stablecoiny', value: num(q.stablecoin_market_cap ?? g.stablecoin_market_cap) },
        { key: 'defi', label: 'DeFi', value: num(q.defi_market_cap ?? g.defi_market_cap) },
      ].filter((r) => r.value != null);
      return categorical({ title: 'Kapitalizacja wg segmentów rynku', unit: 'money', valueLabel: 'Kapitalizacja', rows, note: 'Segmenty się pokrywają – to nie są części jednej całości.', updatedAt: res.fetchedAt });
    },
  },
  {
    id: 'global.volume_segments', group: 'global',
    title: 'Wolumen 24h wg segmentów rynku',
    description: 'Wolumen spot całego rynku, altcoinów, stablecoinów, DeFi oraz derywatów.',
    endpoint: '/v1/global-metrics/quotes/latest', plan: 'free', charts: ['hbar', 'column', 'table'], size: 'm',
    params: [],
    presets: [{ title: 'Wolumen 24h wg segmentów rynku', keywords: 'volume derivatives defi stablecoin spot' }],
    async load() {
      const res = await sources.global();
      const g = res.data || {};
      const q = usd(g);
      const rows = [
        { key: 'total', label: 'Cały rynek (spot)', value: num(q.total_volume_24h) },
        { key: 'alt', label: 'Altcoiny', value: num(q.altcoin_volume_24h) },
        { key: 'stable', label: 'Stablecoiny', value: num(q.stablecoin_volume_24h ?? g.stablecoin_volume_24h) },
        { key: 'defi', label: 'DeFi', value: num(q.defi_volume_24h ?? g.defi_volume_24h) },
        { key: 'deriv', label: 'Derywaty', value: num(q.derivatives_volume_24h ?? g.derivatives_volume_24h) },
      ].filter((r) => r.value != null);
      return categorical({ title: 'Wolumen 24h wg segmentów rynku', unit: 'money', valueLabel: 'Wolumen 24h', rows, note: 'Segmenty się pokrywają – derywaty liczone są osobno od rynku spot.', updatedAt: res.fetchedAt });
    },
  },

  // ------------------------------------------------ sektory
  {
    id: 'sectors.ranking', group: 'sectors',
    title: 'Ranking sektorów',
    description: 'Porównanie branż krypto wg kapitalizacji, wolumenu, zmian 24h, obrotu lub liczby tokenów.',
    endpoint: '/v1/cryptocurrency/categories', plan: 'free', charts: ['hbar', 'treemap', 'table'], size: 'l',
    params: [
      { key: 'metric', label: 'Miara', type: 'select', options: options(SECTOR_METRICS), default: 'market_cap' },
      { key: 'group', label: 'Rodzaj kategorii', type: 'select', options: CATEGORY_GROUP_OPTIONS, default: 'sectors' },
      { key: 'limit', label: 'Liczba pozycji', type: 'number', min: 3, max: 50, default: 15 },
      { key: 'order', label: 'Kolejność', type: 'select', options: ORDER_OPTIONS, default: 'desc' },
      {
        key: 'minCap', label: 'Minimalna kapitalizacja', type: 'select', default: '100000000',
        options: [
          { value: '0', label: 'Bez limitu' }, { value: '10000000', label: '10 mln USD' },
          { value: '100000000', label: '100 mln USD' }, { value: '1000000000', label: '1 mld USD' },
        ],
      },
      { key: 'categories', label: 'Tylko wybrane kategorie (opcjonalnie)', type: 'categories', default: [] },
    ],
    presets: [
      { title: 'Kapitalizacja sektorów (branż)', description: 'Które branże krypto są największe: Layer 1, DeFi, AI, Memes, RWA…', params: { metric: 'market_cap' }, keywords: 'market cap branże industries sectors' },
      { title: 'Wolumen 24h sektorów', description: 'W których branżach jest największy obrót w ostatniej dobie.', params: { metric: 'volume' }, keywords: 'volume branże obrót' },
      { title: 'Zmiana kapitalizacji sektorów 24h', description: 'Które sektory rosną, a które tracą – procentowa zmiana kapitalizacji w 24h.', params: { metric: 'market_cap_change' }, keywords: 'change wzrost spadek' },
      { title: 'Średnia zmiana ceny w sektorach 24h', description: 'Przeciętny ruch ceny tokenów w każdej branży (bez ważenia kapitalizacją).', params: { metric: 'avg_price_change' }, keywords: 'price change' },
      { title: 'Obrót sektorów (wolumen / kapitalizacja)', description: 'Jaka część kapitalizacji sektora zmieniła właściciela w 24h – miara aktywności.', params: { metric: 'turnover' }, keywords: 'turnover płynność' },
      { title: 'Mapa sektorów (treemap)', description: 'Pole = kapitalizacja, kolor = zmiana 24h (niebieski wzrost, czerwony spadek).', params: { metric: 'market_cap', limit: 30 }, chart: 'treemap', keywords: 'heatmap treemap mapa' },
      { title: 'Kapitalizacja ekosystemów blockchain', description: 'Wartość tokenów działających na Ethereum, Solanie, BNB Chain, Base…', params: { group: 'ecosystems' }, keywords: 'ecosystem solana ethereum base' },
      { title: 'Kapitalizacja portfeli funduszy VC', description: 'Łączna wartość projektów wspieranych przez a16z, Coinbase Ventures, Pantera…', params: { group: 'portfolios' }, keywords: 'vc venture a16z coinbase' },
      { title: 'Porównaj wybrane sektory', description: 'Wybierz do 8 kategorii i porównaj je dowolną miarą.', configure: true, params: { metric: 'market_cap' }, keywords: 'compare porównanie' },
    ],
    async load(p) {
      const { res, list } = await categoryList();
      const metric = SECTOR_METRICS[p.metric];
      const picked = new Set(p.categories);
      const minCap = Number(p.minCap) || 0;
      const source = picked.size
        ? list.filter((c) => picked.has(c.id))
        : list.filter((c) => (p.group === 'all' || categoryGroup(c.name) === p.group) && (num(c.market_cap) ?? 0) >= Math.max(minCap, 1));
      const rows = sortRows(source.map((c) => sectorRow(c, metric)), p.order, picked.size ? 0 : p.limit);
      const scope = picked.size ? 'wybrane kategorie' : `${p.order === 'asc' ? 'najniższe' : 'top'} ${p.limit} ${GROUP_NOUN[p.group]}`;
      return categorical({
        title: `${metric.label} – ${scope}`, unit: metric.unit, valueLabel: metric.label, polarity: !!metric.polarity, rows,
        note: 'Kategorie CMC się pokrywają (moneta może należeć do wielu), więc wartości nie sumują się do całego rynku.',
        updatedAt: res.fetchedAt,
      });
    },
  },
  {
    id: 'sectors.coins', group: 'sectors',
    title: 'Top monety w sektorze',
    description: 'Najważniejsze kryptowaluty wybranej kategorii – kapitalizacja, wolumen, udział w sektorze, zmiany.',
    endpoint: '/v1/cryptocurrency/category', plan: 'free', charts: ['hbar', 'treemap', 'table'], size: 'm',
    params: [
      { key: 'category', label: 'Sektor / kategoria', type: 'category', default: null },
      {
        key: 'metric', label: 'Miara', type: 'select', default: 'market_cap',
        options: COIN_SECTOR_KEYS.map((k) => ({ value: k, label: k === 'share' ? 'Udział w kapitalizacji sektora' : COIN_METRICS[k].label })),
      },
      { key: 'limit', label: 'Liczba monet', type: 'number', min: 3, max: 50, default: 12 },
      { key: 'order', label: 'Kolejność', type: 'select', options: ORDER_OPTIONS, default: 'desc' },
    ],
    presets: [
      { title: 'Top monety w wybranym sektorze', configure: true, keywords: 'coins category sector tokens' },
      { title: 'Mapa wybranego sektora (treemap)', configure: true, chart: 'treemap', params: { limit: 30 }, keywords: 'treemap heatmap' },
    ],
    async load(p) {
      const id = p.category || (await defaultSectors(1))[0];
      if (!id) throw Object.assign(new Error('Brak dostępnych kategorii.'), { httpStatus: 404 });
      const res = await sources.category(id);
      const cat = res.data || {};
      const coins = cat.coins || [];
      const sectorCap = num(cat.market_cap) || coins.reduce((s, c) => s + (num(usd(c).market_cap) || 0), 0);
      const metric = p.metric === 'share'
        ? { label: 'Udział w kapitalizacji sektora', unit: 'pct', get: (q) => (sectorCap && num(q.market_cap) != null ? (q.market_cap / sectorCap) * 100 : null) }
        : COIN_METRICS[p.metric];
      const rows = sortRows(coins.map((c) => coinRow(c, metric)), p.order, p.limit);
      return categorical({
        title: `${cat.name || 'Sektor'}: ${metric.label.toLowerCase()} – ${p.order === 'asc' ? 'najniższe' : 'top'} ${p.limit}`,
        unit: metric.unit, valueLabel: metric.label, polarity: !!metric.polarity, rows, updatedAt: res.fetchedAt,
      });
    },
  },

  // ------------------------------------------------ kryptowaluty
  {
    id: 'coins.ranking', group: 'coins',
    title: 'Ranking kryptowalut',
    description: 'Top 200 wg kapitalizacji: rankingi wolumenu, zmian ceny (1h–90d), obrotu, heatmapa rynku.',
    endpoint: '/v1/cryptocurrency/listings/latest', plan: 'free', charts: ['hbar', 'treemap', 'table'], size: 'm',
    params: [
      { key: 'metric', label: 'Miara', type: 'select', options: options(COIN_METRICS, COIN_RANKING_KEYS), default: 'market_cap' },
      { key: 'limit', label: 'Liczba monet', type: 'number', min: 3, max: 100, default: 15 },
      { key: 'order', label: 'Kolejność', type: 'select', options: ORDER_OPTIONS, default: 'desc' },
      {
        key: 'kind', label: 'Rodzaj', type: 'select', default: 'all',
        options: [{ value: 'all', label: 'Monety i tokeny' }, { value: 'coins', label: 'Tylko monety (własny blockchain)' }, { value: 'tokens', label: 'Tylko tokeny' }],
      },
      { key: 'noStable', label: 'Pomiń stablecoiny', type: 'boolean', default: false },
    ],
    presets: [
      { title: 'Top kryptowaluty wg kapitalizacji', description: 'Największe kryptowaluty rynku.', params: { metric: 'market_cap' }, keywords: 'market cap top coins' },
      { title: 'Top kryptowaluty wg wolumenu 24h', description: 'Czym najwięcej się handluje (ze stablecoinami).', params: { metric: 'volume_24h' }, keywords: 'volume' },
      { title: 'Wolumen 24h bez stablecoinów', description: 'Ranking wolumenu bez USDT, USDC i innych stablecoinów.', params: { metric: 'volume_24h', noStable: true }, keywords: 'volume' },
      { title: 'Najwięksi wzrostowi 24h (top 200)', description: 'Monety z największym wzrostem ceny w ostatniej dobie.', params: { metric: 'percent_change_24h', order: 'desc', noStable: true }, keywords: 'gainers wzrosty' },
      { title: 'Najwięksi spadkowi 24h (top 200)', description: 'Monety z największym spadkiem ceny w ostatniej dobie.', params: { metric: 'percent_change_24h', order: 'asc', noStable: true }, keywords: 'losers spadki' },
      { title: 'Najlepsze wyniki 7 dni', description: 'Największe tygodniowe wzrosty w top 200.', params: { metric: 'percent_change_7d', noStable: true }, keywords: 'weekly performance' },
      { title: 'Najlepsze wyniki 30 dni', description: 'Największe miesięczne wzrosty w top 200.', params: { metric: 'percent_change_30d', noStable: true }, keywords: 'monthly performance' },
      { title: 'Obrót: wolumen / kapitalizacja', description: 'Monety z nietypowo dużym handlem w stosunku do swojej wielkości.', params: { metric: 'turnover', noStable: true }, keywords: 'turnover płynność' },
      { title: 'Heatmapa rynku (top 60)', description: 'Pole = kapitalizacja, kolor = zmiana ceny 24h.', params: { metric: 'market_cap', limit: 60 }, chart: 'treemap', keywords: 'heatmap treemap mapa' },
    ],
    async load(p) {
      const res = await sources.listings();
      const metric = COIN_METRICS[p.metric];
      const coins = (res.data || []).filter((c) => (p.kind === 'coins' ? !c.platform : p.kind === 'tokens' ? !!c.platform : true) && !(p.noStable && isStable(c)));
      const rows = sortRows(coins.map((c) => coinRow(c, metric)), p.order, p.limit);
      return categorical({
        title: `${metric.label} – ${p.order === 'asc' ? 'najniższe' : 'top'} ${p.limit}`,
        unit: metric.unit, valueLabel: metric.label, polarity: !!metric.polarity, rows,
        note: 'Ranking liczony w obrębie top 200 kryptowalut wg kapitalizacji.', updatedAt: res.fetchedAt,
      });
    },
  },
  {
    id: 'coins.compare', group: 'coins',
    title: 'Porównanie kryptowalut',
    description: 'Wybrane monety obok siebie – kapitalizacja, wolumen, cena, zmiany ceny.',
    endpoint: '/v2/cryptocurrency/quotes/latest', plan: 'free', charts: ['hbar', 'column', 'table'], size: 'm',
    params: [
      { key: 'coins', label: 'Kryptowaluty', type: 'coins', default: [1, 1027, 5426] },
      { key: 'metric', label: 'Miara', type: 'select', options: options(COIN_METRICS), default: 'market_cap' },
    ],
    presets: [{ title: 'Porównaj wybrane kryptowaluty', configure: true, keywords: 'compare porównanie' }],
    async load(p) {
      const res = await sources.quotes(p.coins);
      const metric = COIN_METRICS[p.metric];
      const coins = Object.values(res.data || {}).flat();
      const rows = sortRows(coins.map((c) => coinRow(c, metric)), 'desc');
      return categorical({ title: `${metric.label} – porównanie`, unit: metric.unit, valueLabel: metric.label, polarity: !!metric.polarity, rows, updatedAt: res.fetchedAt });
    },
  },
  {
    id: 'coin.performance', group: 'coins',
    title: 'Wyniki monety w horyzontach',
    description: 'Zmiana ceny wybranej kryptowaluty: 1h, 24h, 7d, 30d, 60d i 90d.',
    endpoint: '/v2/cryptocurrency/quotes/latest', plan: 'free', charts: ['column', 'table'], size: 'm',
    params: [
      { key: 'coin', label: 'Kryptowaluta', type: 'coin', default: 1 },
      {
        key: 'per', label: 'Pokaż', type: 'select', default: 'none',
        options: [{ value: 'none', label: 'Zmiana w każdym horyzoncie' }, ...PER_OPTIONS.map((o) => ({ value: o.value, label: `Średnie tempo ${o.label}` }))],
      },
    ],
    presets: [
      { title: 'Zmiany ceny wybranej monety (1h–90d)', configure: true, keywords: 'performance zwrot return' },
      { title: 'Tempo zmian ceny monety (% na dzień w każdym horyzoncie)', description: 'Czy ruch przyspiesza? Zmiany z 1h–90d przeliczone na % dziennie – działa od razu, bez historii.', configure: true, params: { per: 'day' }, keywords: 'prędkość tempo speed velocity rate dynamika przyspieszenie' },
    ],
    async load(p) {
      const res = await sources.quotes([p.coin]);
      const coin = Object.values(res.data || {}).flat()[0];
      if (!coin) throw Object.assign(new Error('Nie znaleziono kryptowaluty.'), { httpStatus: 404 });
      const q = usd(coin);
      const per = PER_UNITS[p.per];
      const rows = PERFORMANCE.map(([k, label, hours]) => {
        const change = num(q[k]);
        const value = per && change != null ? (change * per.ms) / (hours * HOUR) : change;
        return { key: k, label, value, extra: per ? [{ label: 'Zmiana w horyzoncie', value: change, unit: 'pct' }] : undefined };
      }).filter((r) => r.value != null);
      return categorical({
        title: per ? `${coin.name} (${coin.symbol}) – średnie tempo zmiany ceny ${per.label}` : `${coin.name} (${coin.symbol}) – zmiana ceny`,
        unit: 'pct', suffix: per?.short || '', valueLabel: per ? `Tempo (${per.short.slice(1)})` : 'Zmiana ceny', polarity: true, rows,
        note: per ? 'Każdy słupek to zmiana z danego horyzontu podzielona równo na jednostki czasu. Wyższe słupki po lewej = ruch przyspiesza.' : undefined,
        updatedAt: res.fetchedAt,
      });
    },
  },
  {
    id: 'coin.kpi', group: 'coins',
    title: 'Cena / kapitalizacja monety (liczba)',
    description: 'Kafelek z ceną, kapitalizacją lub wolumenem wybranej monety i zmianą 24h.',
    endpoint: '/v2/cryptocurrency/quotes/latest', plan: 'free', charts: ['kpi'], size: 's',
    params: [
      { key: 'coin', label: 'Kryptowaluta', type: 'coin', default: 1 },
      { key: 'metric', label: 'Wskaźnik', type: 'select', options: options(HISTORY_COIN_METRICS), default: 'price' },
    ],
    presets: [{ title: 'Cena wybranej kryptowaluty', configure: true, keywords: 'price kurs' }],
    async load(p) {
      const res = await sources.quotes([p.coin]);
      const coin = Object.values(res.data || {}).flat()[0];
      if (!coin) throw Object.assign(new Error('Nie znaleziono kryptowaluty.'), { httpStatus: 404 });
      const q = usd(coin);
      const metric = HISTORY_COIN_METRICS[p.metric];
      return {
        type: 'kpi', title: `${coin.name} (${coin.symbol}) – ${metric.label.toLowerCase()}`, unit: 'money',
        value: metric.get(q),
        change: num(p.metric === 'volume_24h' ? q.volume_change_24h : q.percent_change_24h),
        changeUnit: 'pct', changeLabel: '24h', updatedAt: res.fetchedAt,
      };
    },
  },

  // ------------------------------------------------ sentyment
  {
    id: 'sentiment.fng', group: 'sentiment',
    title: 'Indeks strachu i chciwości',
    description: 'Bieżący Fear & Greed Index CoinMarketCap (0 = skrajny strach, 100 = skrajna chciwość).',
    endpoint: '/v3/fear-and-greed/latest', plan: 'free', charts: ['gauge'], size: 's',
    params: [],
    presets: [{ title: 'Fear & Greed – teraz', keywords: 'fear greed strach chciwość sentiment' }],
    async load() {
      const res = await sources.fearGreed();
      const d = res.data || {};
      return { type: 'gauge', title: 'Indeks strachu i chciwości', value: num(d.value), min: 0, max: 100, label: fngLabel(d.value_classification), updatedAt: res.fetchedAt };
    },
  },
  {
    id: 'sentiment.fng_history', group: 'sentiment',
    title: 'Indeks strachu i chciwości – historia',
    description: 'Dzienne wartości Fear & Greed Index.',
    endpoint: '/v3/fear-and-greed/historical', plan: 'free', charts: ['line', 'area', 'table'], size: 'm',
    params: [{
      key: 'days', label: 'Okres', type: 'select', default: '90',
      options: [{ value: '30', label: '30 dni' }, { value: '90', label: '90 dni' }, { value: '180', label: '180 dni' }, { value: '365', label: '1 rok' }, { value: '500', label: '500 dni' }],
    }],
    presets: [{ title: 'Fear & Greed – historia', keywords: 'fear greed strach chciwość sentiment history' }],
    async load(p) {
      const res = await sources.fearGreedHistory(Number(p.days));
      const toMs = (t) => (/^\d+$/.test(String(t)) ? Number(t) * 1000 : Date.parse(t));
      const points = (res.data || []).map((d) => [toMs(d.timestamp), num(d.value)]).filter(([t, v]) => Number.isFinite(t) && v != null).sort((a, b) => a[0] - b[0]);
      return timeseries({ title: `Fear & Greed – ostatnie ${p.days} dni`, unit: 'index', series: [{ key: 'fng', name: 'Fear & Greed', points }], bands: true, updatedAt: res.fetchedAt });
    },
  },

  // ------------------------------------------------ historia z lokalnych snapshotów
  {
    speed: true,
    id: 'history.global', group: 'history',
    title: 'Rynek globalny w czasie',
    description: 'Kapitalizacja, wolumen lub dominacja w czasie – z lokalnych snapshotów serwera.',
    endpoint: 'snapshoty (/v1/global-metrics/quotes/latest)', plan: 'local', charts: ['line', 'area', 'table'], size: 'l',
    params: [
      { key: 'metric', label: 'Wskaźnik', type: 'select', options: options(HISTORY_GLOBAL_METRICS), default: 'total_market_cap' },
      { key: 'range', label: 'Zakres', type: 'select', options: RANGE_OPTIONS, default: '30' },
    ],
    presets: [
      { title: 'Całkowita kapitalizacja w czasie', params: { metric: 'total_market_cap' }, keywords: 'market cap history wykres' },
      { title: 'Wolumen 24h w czasie', params: { metric: 'total_volume_24h' }, keywords: 'volume history' },
      { title: 'Dominacja BTC w czasie', params: { metric: 'btc_dominance' }, keywords: 'btc dominance history' },
      { title: 'Kapitalizacja stablecoinów w czasie', params: { metric: 'stablecoin_market_cap' }, keywords: 'stablecoin history' },
    ],
    async load(p) {
      const m = HISTORY_GLOBAL_METRICS[p.metric];
      const points = history.globalSeries(p.metric, Number(p.range) * DAY);
      return timeseries({ title: `${m.label} w czasie`, unit: m.unit, series: [{ key: p.metric, name: m.label, points }], history: history.historyStatus() });
    },
  },
  {
    speed: true,
    id: 'history.sectors', group: 'history',
    title: 'Sektory w czasie',
    description: 'Kapitalizacja lub wolumen wybranych sektorów w czasie (do 8 serii) – z lokalnych snapshotów.',
    endpoint: 'snapshoty (/v1/cryptocurrency/categories)', plan: 'local', charts: ['line', 'area', 'table'], size: 'l',
    params: [
      { key: 'categories', label: 'Sektory (puste = 5 największych)', type: 'categories', default: [] },
      { key: 'metric', label: 'Miara', type: 'select', options: options(HISTORY_SECTOR_METRICS), default: 'market_cap' },
      { key: 'mode', label: 'Skala', type: 'select', options: MODE_OPTIONS, default: 'absolute' },
      { key: 'range', label: 'Zakres', type: 'select', options: RANGE_OPTIONS, default: '30' },
    ],
    presets: [
      { title: 'Kapitalizacja największych sektorów w czasie', params: { metric: 'market_cap' }, keywords: 'sectors history market cap branże' },
      { title: 'Wolumen największych sektorów w czasie', params: { metric: 'volume' }, keywords: 'sectors history volume branże' },
      { title: 'Siła względna sektorów (indeks = 100)', params: { mode: 'index' }, keywords: 'relative strength porównanie' },
    ],
    async load(p) {
      const ids = p.categories.length ? p.categories : await defaultSectors(5);
      const m = HISTORY_SECTOR_METRICS[p.metric];
      let series = ids.map((id) => ({ key: id, name: history.categoryName(id), points: history.categorySeries(id, p.metric, Number(p.range) * DAY) }));
      if (p.mode === 'index') series = toIndex(series);
      return timeseries({
        title: `${m.label} sektorów w czasie${p.mode === 'index' ? ' (indeks)' : ''}`,
        unit: p.mode === 'index' ? 'index' : m.unit, series, history: history.historyStatus(),
        note: 'Historia obejmuje 150 największych kategorii z chwili zapisu snapshotu.',
      });
    },
  },
  {
    speed: true,
    id: 'history.coins', group: 'history',
    title: 'Kryptowaluty w czasie',
    description: 'Cena, kapitalizacja lub wolumen wybranych monet (top 200) w czasie – z lokalnych snapshotów.',
    endpoint: 'snapshoty (/v1/cryptocurrency/listings/latest)', plan: 'local', charts: ['line', 'area', 'table'], size: 'l',
    params: [
      { key: 'coins', label: 'Kryptowaluty', type: 'coins', default: [1, 1027] },
      { key: 'metric', label: 'Miara', type: 'select', options: options(HISTORY_COIN_METRICS), default: 'price' },
      { key: 'mode', label: 'Skala', type: 'select', options: MODE_OPTIONS, default: 'index' },
      { key: 'range', label: 'Zakres', type: 'select', options: RANGE_OPTIONS, default: '30' },
    ],
    presets: [
      { title: 'BTC vs ETH – siła względna (indeks)', params: { coins: [1, 1027], mode: 'index' }, keywords: 'bitcoin ethereum porównanie history' },
      { title: 'Cena wybranych monet w czasie', configure: true, params: { mode: 'absolute' }, keywords: 'price history' },
    ],
    async load(p) {
      const m = HISTORY_COIN_METRICS[p.metric];
      let series = p.coins.map((id) => ({ key: String(id), name: history.coinName(id), points: history.coinSeries(id, p.metric, Number(p.range) * DAY) }));
      if (p.mode === 'index') series = toIndex(series);
      return timeseries({
        title: `${m.label} w czasie${p.mode === 'index' ? ' (indeks)' : ''}`,
        unit: p.mode === 'index' ? 'index' : m.unit, series, history: history.historyStatus(),
        note: 'Snapshoty obejmują 200 największych kryptowalut z chwili zapisu.',
      });
    },
  },

  {
    id: 'history.speed', group: 'history',
    title: 'Ranking tempa zmian',
    description: 'Co rośnie lub spada najszybciej: prędkość zmiany sektorów albo monet w wybranym oknie, w przeliczeniu na godzinę, dzień, tydzień…',
    endpoint: 'snapshoty (/v1/cryptocurrency/categories, /listings/latest)', plan: 'local', charts: ['hbar', 'table'], size: 'm',
    params: [
      { key: 'kind', label: 'Co porównać', type: 'select', default: 'sectors', options: [{ value: 'sectors', label: 'Sektory (branże)' }, { value: 'coins', label: 'Kryptowaluty (top 200)' }] },
      {
        key: 'metric', label: 'Miara', type: 'select', default: 'market_cap',
        options: [{ value: 'market_cap', label: 'Kapitalizacja' }, { value: 'volume', label: 'Wolumen 24h' }, { value: 'price', label: 'Cena (tylko monety)' }],
      },
      { key: 'window', label: 'Okno pomiaru zmiany', type: 'select', options: WINDOW_OPTIONS, default: '168' },
      { key: 'per', label: 'Prędkość w przeliczeniu', type: 'select', options: PER_OPTIONS, default: 'day' },
      { key: 'limit', label: 'Liczba pozycji', type: 'number', min: 3, max: 50, default: 12 },
      { key: 'order', label: 'Kolejność', type: 'select', options: [{ value: 'desc', label: 'Najszybciej rosnące' }, { value: 'asc', label: 'Najszybciej spadające' }], default: 'desc' },
    ],
    presets: [
      { title: 'Najszybciej rosnące sektory (%/dzień, okno 7 dni)', description: 'Tempo wzrostu kapitalizacji branż – kto przyspiesza.', keywords: 'prędkość tempo speed velocity rate dynamika rotacja' },
      { title: 'Najszybciej spadające sektory (%/dzień, okno 7 dni)', params: { order: 'asc' }, keywords: 'prędkość tempo spadek' },
      { title: 'Najszybciej rosnące monety (%/godzinę, okno 24h)', params: { kind: 'coins', metric: 'price', window: '24', per: 'hour' }, keywords: 'prędkość tempo speed momentum' },
      { title: 'Przyrost wolumenu sektorów (%/dzień)', params: { metric: 'volume', window: '72' }, keywords: 'prędkość tempo wolumen volume' },
    ],
    async load(p) {
      const per = PER_UNITS[p.per];
      const windowMs = Number(p.window) * HOUR;
      const isCoins = p.kind === 'coins';
      const metric = !isCoins && p.metric === 'price' ? 'market_cap' : p.metric;
      const field = isCoins && metric === 'volume' ? 'volume_24h' : metric;
      const ids = history.latestIds(isCoins ? 'coins' : 'categories');
      const range = windowMs * 2.2;
      const rows = [];
      for (const id of ids) {
        const name = isCoins ? history.coinName(id) : history.categoryName(id);
        if (!isCoins && categoryGroup(name) !== 'sectors') continue;
        const points = isCoins ? history.coinSeries(id, field, range) : history.categorySeries(id, field, range);
        const last = windowChanges(points, windowMs, per.ms).at(-1);
        if (!last) continue;
        rows.push({
          key: String(id), label: isCoins ? name.replace(/^.*\((.+)\)$/, '$1') : name, name, value: last.rate,
          extra: [{ label: `Zmiana w oknie ${windowLabel(p.window)}`, value: last.pct, unit: 'pct' }],
        });
      }
      const label = { market_cap: 'kapitalizacji', volume: 'wolumenu', price: 'ceny' }[metric];
      return categorical({
        title: `Tempo zmiany ${label} ${per.label} – okno ${windowLabel(p.window)}`,
        unit: 'pct', suffix: per.short, valueLabel: `Tempo (${per.short.slice(1)})`, polarity: true,
        rows: sortRows(rows, p.order, p.limit), history: history.historyStatus(),
        note: rows.length ? 'Liczone z lokalnych snapshotów: zmiana w oknie podzielona przez jego długość.' : undefined,
      });
    },
  },

  // ------------------------------------------------ historia CMC (plan płatny)
  {
    speed: true,
    id: 'cmc.global_history', group: 'historical',
    title: 'Rynek globalny – historia CMC',
    description: 'Oficjalne dzienne dane historyczne rynku. Wymaga płatnego planu CMC.',
    endpoint: '/v1/global-metrics/quotes/historical', plan: 'paid', charts: ['line', 'area', 'table'], size: 'l',
    params: [
      {
        key: 'metric', label: 'Wskaźnik', type: 'select', default: 'total_market_cap',
        options: options(GLOBAL_METRICS, ['total_market_cap', 'total_volume_24h', 'altcoin_market_cap', 'btc_dominance']),
      },
      { key: 'days', label: 'Okres', type: 'select', options: DAYS_OPTIONS, default: '30' },
    ],
    presets: [
      { title: 'Kapitalizacja rynku – historia CMC', params: { metric: 'total_market_cap' }, keywords: 'historical market cap' },
      { title: 'Wolumen rynku – historia CMC', params: { metric: 'total_volume_24h' }, keywords: 'historical volume' },
    ],
    async load(p) {
      const res = await sources.globalHistory(Number(p.days));
      const m = GLOBAL_METRICS[p.metric];
      const quotes = res.data?.quotes || [];
      const points = quotes
        .map((d) => [Date.parse(d.timestamp), num(p.metric === 'btc_dominance' ? d.btc_dominance : usd(d)[p.metric])])
        .filter(([t, v]) => Number.isFinite(t) && v != null)
        .sort((a, b) => a[0] - b[0]);
      return timeseries({ title: `${m.label} – ${p.days} dni (CMC)`, unit: m.unit, series: [{ key: p.metric, name: m.label, points }], updatedAt: res.fetchedAt });
    },
  },
  {
    speed: true,
    id: 'cmc.coin_history', group: 'historical',
    title: 'Kryptowaluty – historia CMC',
    description: 'Dzienne notowania wybranych monet (do 5). Wymaga płatnego planu CMC.',
    endpoint: '/v2/cryptocurrency/quotes/historical', plan: 'paid', charts: ['line', 'area', 'table'], size: 'l',
    params: [
      { key: 'coins', label: 'Kryptowaluty (max 5)', type: 'coins', max: 5, default: [1] },
      { key: 'metric', label: 'Miara', type: 'select', options: options(HISTORY_COIN_METRICS), default: 'price' },
      { key: 'mode', label: 'Skala', type: 'select', options: MODE_OPTIONS, default: 'absolute' },
      { key: 'days', label: 'Okres', type: 'select', options: DAYS_OPTIONS, default: '30' },
    ],
    presets: [{ title: 'Historia ceny wybranej monety (CMC)', configure: true, keywords: 'historical price' }],
    async load(p) {
      const res = await sources.coinHistory(p.coins, Number(p.days));
      const m = HISTORY_COIN_METRICS[p.metric];
      const raw = res.data || {};
      const entries = Array.isArray(raw.quotes) ? [raw] : Object.values(raw).flat();
      let series = entries.map((c) => ({
        key: String(c.id),
        name: `${c.name} (${c.symbol})`,
        points: (c.quotes || []).map((d) => [Date.parse(d.timestamp), num(usd(d)[p.metric])]).filter(([t, v]) => Number.isFinite(t) && v != null).sort((a, b) => a[0] - b[0]),
      }));
      if (p.mode === 'index') series = toIndex(series);
      return timeseries({ title: `${m.label} – ${p.days} dni (CMC)${p.mode === 'index' ? ' – indeks' : ''}`, unit: p.mode === 'index' ? 'index' : m.unit, series, updatedAt: res.fetchedAt });
    },
  },

  // ------------------------------------------------ konto API
  {
    id: 'account.usage', group: 'account',
    title: 'Zużycie kredytów API',
    description: 'Ile kredytów zużyto dziś i w tym miesiącu oraz limit zapytań na minutę.',
    endpoint: '/v1/key/info', plan: 'free', charts: ['meters'], size: 's',
    params: [],
    presets: [{ title: 'Zużycie kredytów API', keywords: 'credits limit usage klucz key' }],
    async load() {
      const res = await sources.keyInfo();
      const { plan = {}, usage = {} } = res.data || {};
      const meters = [];
      const month = usage.current_month || {};
      const monthLimit = num(plan.credit_limit_monthly) ?? ((num(month.credits_used) ?? 0) + (num(month.credits_left) ?? 0) || null);
      meters.push({ label: 'Kredyty w tym miesiącu', used: num(month.credits_used), limit: monthLimit, hint: plan.credit_limit_monthly_reset ? `reset: ${plan.credit_limit_monthly_reset}` : null });
      const day = usage.current_day || {};
      if (num(day.credits_used) != null) meters.push({ label: 'Kredyty dzisiaj', used: num(day.credits_used), limit: num(plan.credit_limit_daily) });
      const minute = usage.current_minute || {};
      if (num(minute.requests_made) != null) meters.push({ label: 'Zapytania w tej minucie', used: num(minute.requests_made), limit: num(plan.rate_limit_minute) });
      return {
        type: 'meters', title: 'Zużycie kredytów API', meters,
        footnote: `Ten serwer od startu: ${stats.requests} zapytań do CMC, ${stats.credits} kredytów, ${stats.cacheHits} odpowiedzi z cache.`,
        updatedAt: res.fetchedAt,
      };
    },
  },
];

const SPEED_PRESETS = {
  'history.global': [
    { title: 'Prędkość zmian kapitalizacji rynku (%/dzień)', params: { metric: 'total_market_cap', transform: 'rate', window: '24', per: 'day' }, keywords: 'prędkość tempo speed velocity rate dynamika' },
    { title: 'Przyspieszenie rynku (zmiana tempa)', description: 'Czy tempo zmian kapitalizacji rośnie, czy hamuje.', params: { metric: 'total_market_cap', transform: 'accel', window: '24', per: 'day' }, keywords: 'przyspieszenie acceleration momentum prędkość' },
  ],
  'history.sectors': [
    { title: 'Prędkość zmian kapitalizacji sektorów (%/dzień)', params: { transform: 'rate', window: '24', per: 'day' }, keywords: 'prędkość tempo speed velocity rate branże' },
  ],
  'history.coins': [
    { title: 'Prędkość zmian ceny BTC i ETH (%/godzinę)', params: { coins: [1, 1027], mode: 'absolute', transform: 'rate', window: '4', per: 'hour' }, keywords: 'prędkość tempo speed velocity rate momentum' },
  ],
};

for (const ds of DATASETS) {
  if (!ds.speed) continue;
  const timeParams = TIME_PARAMS.map((spec) => ({ ...spec }));
  // Dane CMC są dzienne, więc okna krótsze niż doba nie mają sensu.
  if (ds.group === 'historical') timeParams[1].options = WINDOW_OPTIONS.filter((o) => Number(o.value) >= 24);
  ds.params = [...ds.params, ...timeParams];
  ds.presets.push(...(SPEED_PRESETS[ds.id] || []));
  const load = ds.load;
  ds.load = async (p) => applyTransform(await load(p), p);
  delete ds.speed;
}

const BY_ID = new Map(DATASETS.map((d) => [d.id, d]));

export function getDataset(id) {
  return BY_ID.get(id) || null;
}

export function publicCatalog(availability = {}) {
  return {
    groups: GROUPS,
    datasets: DATASETS.map(({ load, ...d }) => ({
      ...d,
      unavailable: availability[d.endpoint]?.ok === false ? availability[d.endpoint].message : null,
      available: availability[d.endpoint]?.ok === true,
    })),
  };
}

// Walidacja parametrów z przeglądarki względem specyfikacji zbioru danych.
export function resolveParams(dataset, raw = {}) {
  const out = {};
  for (const spec of dataset.params) {
    const value = raw[spec.key];
    switch (spec.type) {
      case 'select': {
        const allowed = spec.options.map((o) => o.value);
        out[spec.key] = allowed.includes(String(value)) ? String(value) : spec.default;
        break;
      }
      case 'number': {
        const n = Math.round(Number(value));
        out[spec.key] = Number.isFinite(n) ? Math.min(spec.max, Math.max(spec.min, n)) : spec.default;
        break;
      }
      case 'boolean':
        out[spec.key] = value === undefined ? spec.default : value === true || value === 'true';
        break;
      case 'category':
        out[spec.key] = typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : spec.default;
        break;
      case 'categories':
        out[spec.key] = Array.isArray(value) ? value.filter((v) => typeof v === 'string' && /^[\w-]{1,64}$/.test(v)).slice(0, 8) : spec.default;
        break;
      case 'coin': {
        const n = Number(value);
        out[spec.key] = Number.isInteger(n) && n > 0 ? n : spec.default;
        break;
      }
      case 'coins': {
        const list = Array.isArray(value) ? value.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
        out[spec.key] = (list.length ? [...new Set(list)] : spec.default).slice(0, spec.max || 8);
        break;
      }
      default:
        out[spec.key] = spec.default;
    }
  }
  return out;
}

// Przeliczenie kwot z USD na wybraną walutę.
export function convertPayload(payload, rate) {
  if (!rate || rate === 1) return payload;
  const conv = (v) => (v == null ? v : v * rate);
  const money = payload.unit === 'money';
  switch (payload.type) {
    case 'kpi':
      return money ? { ...payload, value: conv(payload.value) } : payload;
    case 'categorical':
      return {
        ...payload,
        rows: payload.rows.map((r) => ({
          ...r,
          value: money ? conv(r.value) : r.value,
          size: r.size,
          extra: r.extra?.map((e) => (e.unit === 'money' ? { ...e, value: conv(e.value) } : e)),
        })),
      };
    case 'timeseries':
      return money ? { ...payload, series: payload.series.map((s) => ({ ...s, points: s.points.map(([t, v]) => [t, conv(v)]) })) } : payload;
    default:
      return payload;
  }
}

export async function categoryOptions() {
  const { list } = await categoryList();
  return list
    .map((c) => ({ id: c.id, name: c.name, group: categoryGroup(c.name), marketCap: num(c.market_cap), tokens: num(c.num_tokens) }))
    .sort((a, b) => (b.marketCap ?? -1) - (a.marketCap ?? -1));
}

const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const wordStart = (text, q) => text.split(/[^a-z0-9]+/).some((word) => word.startsWith(q));

export async function searchCoins(query, limit = 10) {
  const res = await sources.map();
  const list = res.data || [];
  const q = fold(query.trim());
  if (!q) return list.slice(0, limit).map(coinOption);
  const scored = [];
  for (const c of list) {
    const sym = fold(c.symbol);
    const name = fold(c.name);
    let score = null;
    if (sym === q) score = 0;
    else if (name === q) score = 1;
    else if (sym.startsWith(q)) score = 2;
    else if (name.startsWith(q)) score = 3;
    else if (wordStart(name, q) || wordStart(fold(c.slug), q)) score = 4;
    if (score != null) scored.push([score, c.rank ?? 1e9, c]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return scored.slice(0, limit).map(([, , c]) => coinOption(c));
}

export async function coinsByIds(ids) {
  const res = await sources.map();
  const wanted = new Set(ids.map(Number));
  return (res.data || []).filter((c) => wanted.has(c.id)).map(coinOption);
}

function coinOption(c) {
  return { id: c.id, name: c.name, symbol: c.symbol, rank: c.rank ?? null };
}
