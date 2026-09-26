import { fetchJson } from './external.js';

// Darmowe źródła danych on-chain i DeFi (bez klucza API):
//   Coin Metrics Community API – wskaźniki sieci (adresy, transakcje, MVRV, przepływy giełdowe…)
//   DefiLlama – TVL, stablecoiny, wolumen DEX-ów, opłaty protokołów
//   mempool.space – sieć Bitcoin: opłaty, mempool, hashrate, trudność, pule wydobywcze

export const EXTERNAL_GROUPS = [
  {
    id: 'onchain', name: 'On-chain (Coin Metrics)',
    description: 'Aktywność sieci blockchain: aktywne adresy, transakcje, MVRV, hashrate, podaż i przepływy na giełdy. Darmowe Community API, dane dzienne.',
    endpoints: ['community-api.coinmetrics.io /v4/timeseries/asset-metrics'], plan: 'free',
  },
  {
    id: 'defi', name: 'DeFi (DefiLlama)',
    description: 'TVL sieci i protokołów, kategorie DeFi, podaż stablecoinów, wolumen DEX-ów i opłaty protokołów.',
    endpoints: ['api.llama.fi', 'stablecoins.llama.fi'], plan: 'free',
  },
  {
    id: 'bitcoin', name: 'Sieć Bitcoin (mempool.space)',
    description: 'Opłaty transakcyjne, zatłoczenie mempoola, hashrate, trudność wydobycia, opłaty w blokach i udziały pul.',
    endpoints: ['mempool.space /api'], plan: 'free',
  },
];

const DAY = 86_400_000;
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// ---------------------------------------------------------------- Coin Metrics

const CM_URL = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics';
export const CM_ASSETS = {
  btc: 'Bitcoin', eth: 'Ethereum', xrp: 'XRP', ada: 'Cardano', doge: 'Dogecoin',
  ltc: 'Litecoin', bch: 'Bitcoin Cash', xlm: 'Stellar', trx: 'TRON',
};
const CM_METRICS = {
  AdrActCnt: { label: 'Aktywne adresy', unit: 'count' },
  TxCnt: { label: 'Liczba transakcji', unit: 'count' },
  TxTfrCnt: { label: 'Liczba transferów', unit: 'count' },
  AdrBalCnt: { label: 'Adresy z niezerowym saldem', unit: 'count' },
  CapMVRVCur: { label: 'MVRV (kapitalizacja / zrealizowana)', unit: 'ratio' },
  CapMrktCurUSD: { label: 'Kapitalizacja', unit: 'money' },
  PriceUSD: { label: 'Cena', unit: 'money' },
  HashRate: { label: 'Hashrate', unit: 'count', suffix: ' TH/s' },
  SplyCur: { label: 'Podaż w obiegu (monety)', unit: 'count' },
  IssTotUSD: { label: 'Dzienna emisja nowych monet (USD)', unit: 'money' },
  SplyExNtv: { label: 'Podaż na giełdach (monety)', unit: 'count' },
  SplyExUSD: { label: 'Podaż na giełdach (USD)', unit: 'money' },
  FlowInExUSD: { label: 'Wpływy na giełdy (USD)', unit: 'money' },
  FlowOutExUSD: { label: 'Wypływy z giełd (USD)', unit: 'money' },
  FlowNetExUSD: { label: 'Saldo przepływów giełdowych (USD, + = na giełdy)', unit: 'money', polarity: true, derived: true },
  ROI30d: { label: 'Zwrot 30 dni', unit: 'pct', polarity: true },
  BlkCnt: { label: 'Bloki dziennie', unit: 'count' },
};
const CM_FETCH = Object.keys(CM_METRICS).filter((k) => !CM_METRICS[k].derived);

async function cmAsset(asset) {
  const url = `${CM_URL}?assets=${asset}&metrics=${CM_FETCH.join(',')}&frequency=1d&page_size=1830&paging_from=end`;
  const res = await fetchJson(url, { ttlMinutes: 360, timeoutMs: 45_000 });
  const series = {};
  for (const row of res.data?.data || []) {
    const t = Date.parse(row.time);
    for (const k of CM_FETCH) {
      const v = num(row[k]);
      if (v != null) (series[k] ??= []).push([t, v]);
    }
  }
  for (const k of Object.keys(series)) series[k].sort((a, b) => a[0] - b[0]);
  if (series.FlowInExUSD && series.FlowOutExUSD) {
    const out = new Map(series.FlowOutExUSD);
    series.FlowNetExUSD = series.FlowInExUSD.filter(([t]) => out.has(t)).map(([t, v]) => [t, v - out.get(t)]);
  }
  return { series, fetchedAt: res.fetchedAt };
}

// ---------------------------------------------------------------- DefiLlama

const LLAMA = 'https://api.llama.fi';
const STABLES = 'https://stablecoins.llama.fi';
const TVL_CHAINS = ['Ethereum', 'Solana', 'BSC', 'Bitcoin', 'Tron', 'Base', 'Arbitrum', 'Hyperliquid L1', 'Avalanche', 'Polygon', 'Sui', 'Aptos', 'Optimism', 'Sonic', 'Berachain', 'Cronos', 'TON', 'Near', 'Cardano', 'Starknet'];
const EXCLUDED_CATEGORIES = new Set(['CEX', 'Chain']);
const llamaDate = (d) => Number(d) * 1000;

const tvlHistory = (chain) => fetchJson(chain === 'all' ? `${LLAMA}/v2/historicalChainTvl` : `${LLAMA}/v2/historicalChainTvl/${encodeURIComponent(chain)}`, { ttlMinutes: 60 });
const chains = () => fetchJson(`${LLAMA}/v2/chains`, { ttlMinutes: 30 });
const protocols = () => fetchJson(`${LLAMA}/protocols`, { ttlMinutes: 60, timeoutMs: 60_000 });
const stableHistory = () => fetchJson(`${STABLES}/stablecoincharts/all`, { ttlMinutes: 60 });
const stableList = () => fetchJson(`${STABLES}/stablecoins?includePrices=false`, { ttlMinutes: 30 });
const overview = (kind) => fetchJson(`${LLAMA}/overview/${kind}?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true`, { ttlMinutes: 60, timeoutMs: 90_000 });

const OVERVIEW_KINDS = [
  { value: 'dexs', label: 'Wolumen DEX-ów' },
  { value: 'fees', label: 'Opłaty protokołów' },
];

// ---------------------------------------------------------------- mempool.space

const MEMPOOL = 'https://mempool.space/api';
const PERIODS = [
  { value: '1m', label: '1 miesiąc' }, { value: '3m', label: '3 miesiące' }, { value: '6m', label: '6 miesięcy' },
  { value: '1y', label: '1 rok' }, { value: '2y', label: '2 lata' }, { value: '3y', label: '3 lata' },
];
const mp = (path, ttlMinutes = 10) => fetchJson(`${MEMPOOL}${path}`, { ttlMinutes });

// ---------------------------------------------------------------- zbiory danych

export function externalDatasets(h) {
  const { categorical, timeseries, sortRows, toIndex, options, MODE_OPTIONS } = h;
  const assetOptions = Object.entries(CM_ASSETS).map(([value, label]) => ({ value, label: `${label} (${value.toUpperCase()})` }));
  const RANGE = [
    { value: '30', label: '30 dni' }, { value: '90', label: '90 dni' }, { value: '180', label: '180 dni' },
    { value: '365', label: '1 rok' }, { value: '730', label: '2 lata' }, { value: '1825', label: '5 lat' },
  ];
  const LLAMA_RANGE = [...RANGE, { value: '0', label: 'Cała historia' }];
  const since = (days) => (Number(days) ? Date.now() - Number(days) * DAY : 0);
  const byRange = (points, days) => points.filter(([t]) => t >= since(days));
  const ORDER = [{ value: 'desc', label: 'Od najwyższych' }, { value: 'asc', label: 'Od najniższych' }];

  return [
    // ------------------------------------------------ Coin Metrics
    {
      speed: true,
      id: 'onchain.series', group: 'onchain',
      title: 'Wskaźnik on-chain w czasie',
      description: 'Aktywne adresy, transakcje, MVRV, hashrate, podaż i przepływy giełdowe dla wybranych sieci – dziennie, do 5 lat wstecz.',
      endpoint: 'Coin Metrics /v4/timeseries/asset-metrics', plan: 'free', charts: ['line', 'area', 'table'], size: 'l',
      params: [
        { key: 'assets', label: 'Sieci (max 4)', type: 'multiselect', options: assetOptions, max: 4, default: ['btc'] },
        { key: 'metric', label: 'Wskaźnik', type: 'select', options: options(CM_METRICS), default: 'AdrActCnt' },
        { key: 'range', label: 'Zakres', type: 'select', options: RANGE, default: '365' },
        { key: 'mode', label: 'Skala', type: 'select', options: MODE_OPTIONS, default: 'absolute' },
      ],
      presets: [
        { title: 'Aktywne adresy BTC i ETH', params: { assets: ['btc', 'eth'], metric: 'AdrActCnt' }, keywords: 'active addresses on-chain aktywność użytkownicy glassnode' },
        { title: 'MVRV Bitcoina', description: 'Kapitalizacja rynkowa / zrealizowana. Powyżej ~3 rynek historycznie przegrzany, poniżej 1 niedowartościowany.', params: { assets: ['btc'], metric: 'CapMVRVCur', range: '1825' }, keywords: 'mvrv realized cap wycena cykl glassnode' },
        { title: 'Saldo przepływów BTC na giełdy', description: 'Dodatnie = więcej BTC trafia na giełdy (presja sprzedaży), ujemne = odpływ do portfeli.', params: { assets: ['btc'], metric: 'FlowNetExUSD', range: '180' }, keywords: 'exchange flows netflow giełdy przepływy glassnode' },
        { title: 'Podaż BTC i ETH na giełdach', params: { assets: ['btc', 'eth'], metric: 'SplyExNtv', mode: 'index', range: '730' }, keywords: 'exchange balance supply giełdy rezerwy' },
        { title: 'Hashrate Bitcoina (Coin Metrics)', params: { assets: ['btc'], metric: 'HashRate', range: '1825' }, keywords: 'hashrate mining wydobycie' },
        { title: 'Liczba transakcji – porównanie sieci (indeks)', params: { assets: ['btc', 'eth', 'ltc', 'doge'], metric: 'TxCnt', mode: 'index' }, keywords: 'transactions transakcje aktywność' },
        { title: 'Tempo wzrostu aktywnych adresów (%/tydzień)', params: { assets: ['btc', 'eth'], metric: 'AdrActCnt', transform: 'rate', window: '720', per: 'week' }, keywords: 'prędkość tempo adresy speed' },
      ],
      async load(p) {
        const m = CM_METRICS[p.metric];
        const results = await Promise.allSettled(p.assets.map((a) => cmAsset(a)));
        const missing = [];
        let series = [];
        results.forEach((r, i) => {
          const asset = p.assets[i];
          const points = r.status === 'fulfilled' ? byRange(r.value.series[p.metric] || [], p.range) : [];
          if (!points.length) missing.push(asset.toUpperCase());
          else series.push({ key: asset, name: CM_ASSETS[asset], points });
        });
        if (!series.length) {
          const err = results.find((r) => r.status === 'rejected')?.reason;
          if (err) throw err;
        }
        if (p.mode === 'index') series = toIndex(series);
        const fetchedAt = Math.max(0, ...results.filter((r) => r.status === 'fulfilled').map((r) => r.value.fetchedAt));
        return timeseries({
          title: `${m.label}${p.mode === 'index' ? ' (indeks)' : ''}`,
          unit: p.mode === 'index' ? 'index' : m.unit, suffix: p.mode === 'index' ? '' : m.suffix || '',
          zeroLine: !!m.polarity, series, updatedAt: fetchedAt || null,
          note: missing.length ? `Coin Metrics nie udostępnia tego wskaźnika za darmo dla: ${missing.join(', ')}.` : 'Źródło: Coin Metrics Community API (dane dzienne).',
        });
      },
    },
    {
      id: 'onchain.kpi', group: 'onchain',
      title: 'Wskaźnik on-chain (liczba)',
      description: 'Ostatnia dzienna wartość wybranego wskaźnika sieci ze zmianą dzień do dnia.',
      endpoint: 'Coin Metrics /v4/timeseries/asset-metrics', plan: 'free', charts: ['kpi'], size: 's',
      params: [
        { key: 'asset', label: 'Sieć', type: 'select', options: assetOptions, default: 'btc' },
        { key: 'metric', label: 'Wskaźnik', type: 'select', options: options(CM_METRICS), default: 'CapMVRVCur' },
      ],
      presets: [
        { title: 'MVRV Bitcoina – teraz', params: { asset: 'btc', metric: 'CapMVRVCur' }, keywords: 'mvrv on-chain' },
        { title: 'Aktywne adresy Bitcoina – wczoraj', params: { asset: 'btc', metric: 'AdrActCnt' }, keywords: 'active addresses' },
      ],
      async load(p) {
        const { series, fetchedAt } = await cmAsset(p.asset);
        const m = CM_METRICS[p.metric];
        const points = series[p.metric] || [];
        if (!points.length) throw Object.assign(new Error(`Coin Metrics nie udostępnia za darmo „${m.label}” dla ${p.asset.toUpperCase()}.`), { httpStatus: 404 });
        const [t, value] = points.at(-1);
        const prev = points.at(-2)?.[1];
        const change = prev ? (m.polarity ? value - prev : (value / prev - 1) * 100) : null;
        return {
          type: 'kpi', title: `${CM_ASSETS[p.asset]} – ${m.label}`, unit: m.unit, suffix: m.suffix || '',
          value, change, changeUnit: m.polarity ? m.unit : 'pct', changeLabel: `d/d · dane z ${new Date(t).toLocaleDateString('pl-PL')}`,
          updatedAt: fetchedAt,
        };
      },
    },
    {
      id: 'onchain.compare', group: 'onchain',
      title: 'Porównanie sieci (on-chain)',
      description: 'Ostatnia dzienna wartość wskaźnika dla wszystkich dostępnych sieci obok siebie.',
      endpoint: 'Coin Metrics /v4/timeseries/asset-metrics', plan: 'free', charts: ['hbar', 'table'], size: 'm',
      params: [{ key: 'metric', label: 'Wskaźnik', type: 'select', options: options(CM_METRICS), default: 'AdrActCnt' }],
      presets: [
        { title: 'Aktywne adresy – porównanie sieci', params: { metric: 'AdrActCnt' }, keywords: 'active addresses sieci blockchain' },
        { title: 'MVRV – porównanie sieci', params: { metric: 'CapMVRVCur' }, keywords: 'mvrv wycena' },
        { title: 'Liczba transakcji – porównanie sieci', params: { metric: 'TxCnt' }, keywords: 'transactions' },
      ],
      async load(p) {
        const m = CM_METRICS[p.metric];
        const assets = Object.keys(CM_ASSETS);
        const results = await Promise.allSettled(assets.map((a) => cmAsset(a)));
        const rows = [];
        results.forEach((r, i) => {
          const last = r.status === 'fulfilled' ? r.value.series[p.metric]?.at(-1) : null;
          if (last) rows.push({ key: assets[i], label: CM_ASSETS[assets[i]], value: last[1] });
        });
        if (!rows.length) throw results.find((r) => r.status === 'rejected')?.reason || new Error('Brak danych.');
        return categorical({
          title: `${m.label} – porównanie sieci`, unit: m.unit, suffix: m.suffix || '', valueLabel: m.label, polarity: !!m.polarity,
          rows: sortRows(rows, 'desc'), note: 'Ostatni pełny dzień. Źródło: Coin Metrics Community API.',
        });
      },
    },

    // ------------------------------------------------ DefiLlama
    {
      speed: true,
      id: 'defi.tvl_history', group: 'defi',
      title: 'TVL w czasie',
      description: 'Wartość zablokowana w DeFi (TVL) – całość albo wybrana sieć.',
      endpoint: 'DefiLlama /v2/historicalChainTvl', plan: 'free', charts: ['area', 'line', 'table'], size: 'l',
      params: [
        { key: 'chain', label: 'Sieć', type: 'select', default: 'all', options: [{ value: 'all', label: 'Wszystkie sieci' }, ...TVL_CHAINS.map((c) => ({ value: c, label: c }))] },
        { key: 'range', label: 'Zakres', type: 'select', options: LLAMA_RANGE, default: '365' },
      ],
      presets: [
        { title: 'TVL całego DeFi w czasie', keywords: 'tvl total value locked defi llama' },
        { title: 'TVL Ethereum w czasie', params: { chain: 'Ethereum' }, keywords: 'tvl ethereum' },
        { title: 'TVL Solany w czasie', params: { chain: 'Solana' }, keywords: 'tvl solana' },
        { title: 'Tempo zmian TVL (%/tydzień)', params: { transform: 'rate', window: '168', per: 'week' }, keywords: 'tvl prędkość tempo' },
      ],
      async load(p) {
        const res = await tvlHistory(p.chain);
        const points = byRange((res.data || []).map((d) => [llamaDate(d.date), num(d.tvl)]).filter(([, v]) => v != null), p.range);
        const name = p.chain === 'all' ? 'DeFi – wszystkie sieci' : p.chain;
        return timeseries({ title: `TVL – ${name}`, unit: 'money', series: [{ key: p.chain, name: `TVL ${name}`, points }], updatedAt: res.fetchedAt, note: 'Źródło: DefiLlama.' });
      },
    },
    {
      id: 'defi.chains', group: 'defi',
      title: 'TVL wg sieci',
      description: 'Ranking blockchainów według wartości zablokowanej w DeFi.',
      endpoint: 'DefiLlama /v2/chains', plan: 'free', charts: ['hbar', 'treemap', 'table'], size: 'm',
      params: [{ key: 'limit', label: 'Liczba sieci', type: 'number', min: 3, max: 50, default: 15 }],
      presets: [{ title: 'TVL wg sieci blockchain', keywords: 'tvl chains sieci ranking defi' }],
      async load(p) {
        const res = await chains();
        const rows = (res.data || []).map((c) => ({ key: c.name, label: c.name, value: num(c.tvl) })).filter((r) => r.value > 0);
        return categorical({ title: `TVL – top ${p.limit} sieci`, unit: 'money', valueLabel: 'TVL', rows: sortRows(rows, 'desc', p.limit), updatedAt: res.fetchedAt, note: 'Źródło: DefiLlama.' });
      },
    },
    {
      id: 'defi.categories', group: 'defi',
      title: 'TVL wg kategorii DeFi',
      description: 'Sektory DeFi: liquid staking, lending, DEX-y, bridge, restaking… – TVL i jego zmiany.',
      endpoint: 'DefiLlama /protocols', plan: 'free', charts: ['hbar', 'treemap', 'table'], size: 'm',
      params: [
        {
          key: 'metric', label: 'Miara', type: 'select', default: 'tvl',
          options: [{ value: 'tvl', label: 'TVL' }, { value: 'change_1d', label: 'Zmiana TVL 24h' }, { value: 'change_7d', label: 'Zmiana TVL 7 dni' }, { value: 'count', label: 'Liczba protokołów' }],
        },
        { key: 'limit', label: 'Liczba kategorii', type: 'number', min: 3, max: 40, default: 15 },
        { key: 'order', label: 'Kolejność', type: 'select', options: ORDER, default: 'desc' },
      ],
      presets: [
        { title: 'TVL wg kategorii DeFi', keywords: 'defi sektory kategorie lending staking dex tvl' },
        { title: 'Zmiana TVL kategorii DeFi – 7 dni', params: { metric: 'change_7d' }, keywords: 'defi zmiana wzrost rotacja' },
      ],
      async load(p) {
        const res = await protocols();
        const groups = new Map();
        for (const pr of res.data || []) {
          if (!pr.category || EXCLUDED_CATEGORIES.has(pr.category) || !(pr.tvl > 0)) continue;
          const g = groups.get(pr.category) || { tvl: 0, prev1: 0, prev7: 0, count: 0 };
          g.tvl += pr.tvl;
          g.prev1 += pr.change_1d != null ? pr.tvl / (1 + pr.change_1d / 100) : pr.tvl;
          g.prev7 += pr.change_7d != null ? pr.tvl / (1 + pr.change_7d / 100) : pr.tvl;
          g.count++;
          groups.set(pr.category, g);
        }
        const value = (g) => ({ tvl: g.tvl, change_1d: (g.tvl / g.prev1 - 1) * 100, change_7d: (g.tvl / g.prev7 - 1) * 100, count: g.count })[p.metric];
        const pct = p.metric.startsWith('change');
        const rows = [...groups].filter(([, g]) => !pct || g.tvl > 100e6).map(([name, g]) => ({
          key: name, label: name, value: value(g), size: g.tvl, change: (g.tvl / g.prev1 - 1) * 100,
          extra: [{ label: 'TVL', value: g.tvl, unit: 'money' }, { label: 'Zmiana 24h', value: (g.tvl / g.prev1 - 1) * 100, unit: 'pct' }, { label: 'Zmiana 7 dni', value: (g.tvl / g.prev7 - 1) * 100, unit: 'pct' }, { label: 'Protokoły', value: g.count, unit: 'count' }],
        }));
        const label = { tvl: 'TVL', change_1d: 'Zmiana TVL 24h', change_7d: 'Zmiana TVL 7 dni', count: 'Liczba protokołów' }[p.metric];
        return categorical({
          title: `${label} wg kategorii DeFi`, unit: pct ? 'pct' : p.metric === 'count' ? 'count' : 'money', valueLabel: label, polarity: pct,
          rows: sortRows(rows, p.order, p.limit), updatedAt: res.fetchedAt,
          note: `Bez giełd scentralizowanych (CEX)${pct ? ', tylko kategorie z TVL powyżej 100 mln USD' : ''}. Źródło: DefiLlama.`,
        });
      },
    },
    {
      id: 'defi.protocols', group: 'defi',
      title: 'Top protokoły DeFi',
      description: 'Największe protokoły wg TVL albo największe zmiany – całość lub wybrana kategoria.',
      endpoint: 'DefiLlama /protocols', plan: 'free', charts: ['hbar', 'treemap', 'table'], size: 'm',
      params: [
        {
          key: 'category', label: 'Kategoria', type: 'select', default: 'all',
          options: ['all', 'Liquid Staking', 'Lending', 'Dexs', 'Bridge', 'Restaking', 'Liquid Restaking', 'CDP', 'Yield', 'Derivatives', 'Basis Trading', 'RWA', 'Launchpad']
            .map((c) => ({ value: c, label: c === 'all' ? 'Wszystkie (bez CEX)' : c })),
        },
        { key: 'metric', label: 'Miara', type: 'select', default: 'tvl', options: [{ value: 'tvl', label: 'TVL' }, { value: 'change_1d', label: 'Zmiana TVL 24h' }, { value: 'change_7d', label: 'Zmiana TVL 7 dni' }] },
        { key: 'limit', label: 'Liczba protokołów', type: 'number', min: 3, max: 50, default: 15 },
        { key: 'order', label: 'Kolejność', type: 'select', options: ORDER, default: 'desc' },
      ],
      presets: [
        { title: 'Największe protokoły DeFi (TVL)', keywords: 'protocols aave lido uniswap tvl' },
        { title: 'Największe protokoły lending', params: { category: 'Lending' }, keywords: 'lending pożyczki aave' },
        { title: 'Protokoły DeFi – największe wzrosty 7 dni', params: { metric: 'change_7d' }, keywords: 'wzrosty gainers defi' },
      ],
      async load(p) {
        const res = await protocols();
        const pct = p.metric !== 'tvl';
        const list = (res.data || []).filter((pr) => pr.tvl > (pct ? 50e6 : 0) && !EXCLUDED_CATEGORIES.has(pr.category) && (p.category === 'all' || pr.category === p.category));
        const rows = list.map((pr) => ({
          key: pr.slug || pr.name, label: pr.name, value: num(pr[p.metric]), size: pr.tvl, change: num(pr.change_1d),
          extra: [{ label: 'TVL', value: pr.tvl, unit: 'money' }, { label: 'Zmiana 24h', value: num(pr.change_1d), unit: 'pct' }, { label: 'Zmiana 7 dni', value: num(pr.change_7d), unit: 'pct' }],
        }));
        const label = { tvl: 'TVL', change_1d: 'Zmiana TVL 24h', change_7d: 'Zmiana TVL 7 dni' }[p.metric];
        return categorical({
          title: `${label} – ${p.category === 'all' ? 'protokoły DeFi' : p.category}`, unit: pct ? 'pct' : 'money', valueLabel: label, polarity: pct,
          rows: sortRows(rows, p.order, p.limit), updatedAt: res.fetchedAt,
          note: pct ? 'Tylko protokoły z TVL powyżej 50 mln USD. Źródło: DefiLlama.' : 'Źródło: DefiLlama.',
        });
      },
    },
    {
      speed: true,
      id: 'defi.stablecoins_history', group: 'defi',
      title: 'Podaż stablecoinów w czasie',
      description: 'Łączna wartość wszystkich stablecoinów w obiegu – miara płynności czekającej na rynku.',
      endpoint: 'DefiLlama /stablecoincharts/all', plan: 'free', charts: ['area', 'line', 'table'], size: 'l',
      params: [{ key: 'range', label: 'Zakres', type: 'select', options: LLAMA_RANGE, default: '365' }],
      presets: [
        { title: 'Podaż stablecoinów w czasie', keywords: 'stablecoin supply usdt usdc płynność' },
        { title: 'Tempo przyrostu stablecoinów (mld USD/tydzień)', params: { transform: 'rate_abs', window: '720', per: 'week' }, keywords: 'stablecoin prędkość tempo mint' },
      ],
      async load(p) {
        const res = await stableHistory();
        const sum = (o) => Object.values(o || {}).reduce((s, v) => s + (Number(v) || 0), 0);
        const points = byRange((res.data || []).map((d) => [llamaDate(d.date), sum(d.totalCirculatingUSD)]).filter(([, v]) => v > 0), p.range);
        return timeseries({ title: 'Podaż stablecoinów (USD)', unit: 'money', series: [{ key: 'stables', name: 'Stablecoiny w obiegu', points }], updatedAt: res.fetchedAt, note: 'Źródło: DefiLlama.' });
      },
    },
    {
      id: 'defi.stablecoins', group: 'defi',
      title: 'Ranking stablecoinów',
      description: 'Największe stablecoiny i zmiana ich podaży (dzień, tydzień, miesiąc).',
      endpoint: 'DefiLlama /stablecoins', plan: 'free', charts: ['hbar', 'treemap', 'table'], size: 'm',
      params: [
        {
          key: 'metric', label: 'Miara', type: 'select', default: 'circulating',
          options: [{ value: 'circulating', label: 'Podaż w obiegu' }, { value: 'd1', label: 'Zmiana podaży 24h' }, { value: 'd7', label: 'Zmiana podaży 7 dni' }, { value: 'd30', label: 'Zmiana podaży 30 dni' }],
        },
        { key: 'limit', label: 'Liczba pozycji', type: 'number', min: 3, max: 40, default: 12 },
        { key: 'order', label: 'Kolejność', type: 'select', options: ORDER, default: 'desc' },
      ],
      presets: [
        { title: 'Największe stablecoiny', keywords: 'stablecoin usdt usdc ranking' },
        { title: 'Stablecoiny – zmiana podaży 30 dni', params: { metric: 'd30' }, keywords: 'stablecoin mint burn zmiana' },
      ],
      async load(p) {
        const res = await stableList();
        const peg = (o, type) => num(o?.[type]);
        const rows = [];
        for (const a of res.data?.peggedAssets || []) {
          if (a.pegType !== 'peggedUSD') continue;
          const now = peg(a.circulating, a.pegType);
          if (!now) continue;
          const prev = { d1: peg(a.circulatingPrevDay, a.pegType), d7: peg(a.circulatingPrevWeek, a.pegType), d30: peg(a.circulatingPrevMonth, a.pegType) };
          const ch = (k) => (prev[k] ? (now / prev[k] - 1) * 100 : null);
          rows.push({
            key: String(a.id), label: a.symbol, name: `${a.name} (${a.symbol})`, value: p.metric === 'circulating' ? now : ch(p.metric), size: now, change: ch('d7'),
            extra: [{ label: 'Podaż', value: now, unit: 'money' }, { label: 'Zmiana 24h', value: ch('d1'), unit: 'pct' }, { label: 'Zmiana 7 dni', value: ch('d7'), unit: 'pct' }, { label: 'Zmiana 30 dni', value: ch('d30'), unit: 'pct' }],
          });
        }
        const pct = p.metric !== 'circulating';
        const filtered = pct ? rows.filter((r) => r.size > 100e6) : rows;
        const label = { circulating: 'Podaż w obiegu', d1: 'Zmiana podaży 24h', d7: 'Zmiana podaży 7 dni', d30: 'Zmiana podaży 30 dni' }[p.metric];
        return categorical({
          title: `Stablecoiny – ${label.toLowerCase()}`, unit: pct ? 'pct' : 'money', valueLabel: label, polarity: pct,
          rows: sortRows(filtered, p.order, p.limit), updatedAt: res.fetchedAt,
          note: `Stablecoiny powiązane z USD${pct ? ' o podaży powyżej 100 mln' : ''}. Źródło: DefiLlama.`,
        });
      },
    },
    {
      speed: true,
      id: 'defi.volume_history', group: 'defi',
      title: 'Wolumen DEX-ów / opłaty w czasie',
      description: 'Dzienny wolumen zdecentralizowanych giełd albo łączne opłaty płacone protokołom.',
      endpoint: 'DefiLlama /overview/dexs, /overview/fees', plan: 'free', charts: ['line', 'area', 'table'], size: 'l',
      params: [
        { key: 'kind', label: 'Dane', type: 'select', options: OVERVIEW_KINDS, default: 'dexs' },
        { key: 'range', label: 'Zakres', type: 'select', options: LLAMA_RANGE, default: '365' },
      ],
      presets: [
        { title: 'Wolumen DEX-ów w czasie', keywords: 'dex volume wolumen uniswap zdecentralizowane' },
        { title: 'Opłaty protokołów w czasie', params: { kind: 'fees' }, keywords: 'fees revenue opłaty przychody' },
      ],
      async load(p) {
        const res = await overview(p.kind);
        const points = byRange((res.data?.totalDataChart || []).map(([t, v]) => [llamaDate(t), num(v)]).filter(([, v]) => v != null), p.range);
        const label = OVERVIEW_KINDS.find((k) => k.value === p.kind).label;
        return timeseries({ title: `${label} (dziennie)`, unit: 'money', series: [{ key: p.kind, name: label, points }], updatedAt: res.fetchedAt, note: 'Źródło: DefiLlama.' });
      },
    },
    {
      id: 'defi.volume_ranking', group: 'defi',
      title: 'Ranking DEX-ów / opłat protokołów',
      description: 'Które giełdy DEX mają największy wolumen albo które protokoły zarabiają najwięcej opłat.',
      endpoint: 'DefiLlama /overview/dexs, /overview/fees', plan: 'free', charts: ['hbar', 'treemap', 'table'], size: 'm',
      params: [
        { key: 'kind', label: 'Dane', type: 'select', options: OVERVIEW_KINDS, default: 'dexs' },
        {
          key: 'metric', label: 'Miara', type: 'select', default: 'total24h',
          options: [{ value: 'total24h', label: 'Ostatnie 24h' }, { value: 'total7d', label: 'Ostatnie 7 dni' }, { value: 'total30d', label: 'Ostatnie 30 dni' }, { value: 'change_7dover7d', label: 'Zmiana tydzień do tygodnia' }],
        },
        { key: 'limit', label: 'Liczba pozycji', type: 'number', min: 3, max: 50, default: 15 },
      ],
      presets: [
        { title: 'Największe DEX-y wg wolumenu 24h', keywords: 'dex ranking uniswap pancakeswap wolumen' },
        { title: 'Protokoły z największymi opłatami (30 dni)', params: { kind: 'fees', metric: 'total30d' }, keywords: 'fees revenue opłaty przychody' },
      ],
      async load(p) {
        const res = await overview(p.kind);
        const pct = p.metric.startsWith('change');
        const rows = (res.data?.protocols || [])
          .filter((x) => (pct ? (x.total7d || 0) > 10e6 : true))
          .map((x) => ({
            key: x.defillamaId || x.name, label: x.displayName || x.name, value: num(x[p.metric]), size: num(x.total24h), change: num(x.change_1d),
            extra: [{ label: '24h', value: num(x.total24h), unit: 'money' }, { label: '7 dni', value: num(x.total7d), unit: 'money' }, { label: 'Zmiana 24h', value: num(x.change_1d), unit: 'pct' }],
          }));
        const kind = OVERVIEW_KINDS.find((k) => k.value === p.kind).label;
        const label = { total24h: '24h', total7d: '7 dni', total30d: '30 dni', change_7dover7d: 'zmiana tydzień do tygodnia' }[p.metric];
        return categorical({
          title: `${kind} – ${label}`, unit: pct ? 'pct' : 'money', valueLabel: `${kind} (${label})`, polarity: pct,
          rows: sortRows(rows, 'desc', p.limit), updatedAt: res.fetchedAt, note: 'Źródło: DefiLlama.',
        });
      },
    },

    // ------------------------------------------------ mempool.space
    {
      id: 'btc.fees', group: 'bitcoin',
      title: 'Opłaty transakcyjne Bitcoina – teraz',
      description: 'Rekomendowana opłata (sat/vB) zależnie od tego, jak szybko transakcja ma wejść do bloku.',
      endpoint: 'mempool.space /api/v1/fees/recommended', plan: 'free', charts: ['column', 'table'], size: 'm',
      params: [],
      presets: [{ title: 'Opłaty BTC – ile zapłacić teraz (sat/vB)', keywords: 'fees opłaty sat vbyte mempool' }],
      async load() {
        const res = await mp('/v1/fees/recommended', 2);
        const f = res.data || {};
        const rows = [
          ['fastestFee', 'Następny blok'], ['halfHourFee', '~30 min'], ['hourFee', '~1 godz.'], ['economyFee', 'Ekonomiczna'], ['minimumFee', 'Minimalna'],
        ].map(([k, label]) => ({ key: k, label, value: num(f[k]) })).filter((r) => r.value != null);
        return categorical({ title: 'Rekomendowane opłaty Bitcoina', unit: 'count', suffix: ' sat/vB', valueLabel: 'Opłata', rows, updatedAt: res.fetchedAt, note: 'Źródło: mempool.space.' });
      },
    },
    {
      id: 'btc.network', group: 'bitcoin',
      title: 'Stan sieci Bitcoin (liczba)',
      description: 'Zatłoczenie mempoola, następna zmiana trudności, bloki do korekty.',
      endpoint: 'mempool.space /api/mempool, /api/v1/difficulty-adjustment', plan: 'free', charts: ['kpi'], size: 's',
      params: [{
        key: 'metric', label: 'Wskaźnik', type: 'select', default: 'difficulty',
        options: [
          { value: 'difficulty', label: 'Szacowana zmiana trudności' }, { value: 'mempool_count', label: 'Transakcje w mempoolu' },
          { value: 'mempool_vsize', label: 'Rozmiar mempoola (vMB)' }, { value: 'remaining_blocks', label: 'Bloki do zmiany trudności' },
        ],
      }],
      presets: [
        { title: 'Następna zmiana trudności BTC', keywords: 'difficulty trudność mining' },
        { title: 'Transakcje czekające w mempoolu', params: { metric: 'mempool_count' }, keywords: 'mempool zatłoczenie' },
      ],
      async load(p) {
        if (p.metric.startsWith('mempool')) {
          const res = await mp('/mempool', 2);
          const d = res.data || {};
          return p.metric === 'mempool_count'
            ? { type: 'kpi', title: 'Transakcje w mempoolu', unit: 'count', value: num(d.count), change: null, updatedAt: res.fetchedAt }
            : { type: 'kpi', title: 'Rozmiar mempoola', unit: 'count', suffix: ' vMB', value: num(d.vsize) / 1e6, change: null, updatedAt: res.fetchedAt };
        }
        const res = await mp('/v1/difficulty-adjustment', 10);
        const d = res.data || {};
        if (p.metric === 'remaining_blocks') {
          return { type: 'kpi', title: 'Bloki do zmiany trudności', unit: 'count', value: num(d.remainingBlocks), change: null, updatedAt: res.fetchedAt };
        }
        return {
          type: 'kpi', title: 'Szacowana zmiana trudności', unit: 'pct', value: num(d.difficultyChange), change: num(d.previousRetarget),
          changeUnit: 'pct', changeLabel: 'poprzednia korekta', signed: true, updatedAt: res.fetchedAt,
        };
      },
    },
    {
      speed: true,
      id: 'btc.hashrate', group: 'bitcoin',
      title: 'Hashrate i trudność Bitcoina',
      description: 'Moc obliczeniowa sieci (EH/s) albo trudność wydobycia w czasie.',
      endpoint: 'mempool.space /api/v1/mining/hashrate', plan: 'free', charts: ['line', 'area', 'table'], size: 'l',
      params: [
        { key: 'metric', label: 'Wskaźnik', type: 'select', default: 'hashrate', options: [{ value: 'hashrate', label: 'Hashrate (EH/s)' }, { value: 'difficulty', label: 'Trudność (T)' }] },
        { key: 'period', label: 'Okres', type: 'select', options: PERIODS, default: '1y' },
      ],
      presets: [
        { title: 'Hashrate Bitcoina', keywords: 'hashrate mining wydobycie górnicy' },
        { title: 'Trudność wydobycia Bitcoina', params: { metric: 'difficulty', period: '2y' }, keywords: 'difficulty trudność' },
      ],
      async load(p) {
        const res = await mp(`/v1/mining/hashrate/${p.period}`, 60);
        const d = res.data || {};
        const hash = p.metric === 'hashrate';
        const points = hash
          ? (d.hashrates || []).map((x) => [x.timestamp * 1000, x.avgHashrate / 1e18])
          : (d.difficulty || []).map((x) => [x.time * 1000, x.difficulty / 1e12]);
        return timeseries({
          title: hash ? 'Hashrate Bitcoina' : 'Trudność wydobycia Bitcoina', unit: 'count', suffix: hash ? ' EH/s' : ' T',
          series: [{ key: p.metric, name: hash ? 'Hashrate' : 'Trudność', points: points.sort((a, b) => a[0] - b[0]) }],
          updatedAt: res.fetchedAt, note: 'Źródło: mempool.space.',
        });
      },
    },
    {
      speed: true,
      id: 'btc.block_fees', group: 'bitcoin',
      title: 'Opłaty i nagrody w blokach BTC',
      description: 'Średnie opłaty albo całkowita nagroda za blok (w BTC lub USD) – przychód górników.',
      endpoint: 'mempool.space /api/v1/mining/blocks/fees, /rewards', plan: 'free', charts: ['line', 'area', 'table'], size: 'l',
      params: [
        {
          key: 'metric', label: 'Wskaźnik', type: 'select', default: 'fees_usd',
          options: [{ value: 'fees_usd', label: 'Opłaty na blok (USD)' }, { value: 'fees_btc', label: 'Opłaty na blok (BTC)' }, { value: 'rewards_usd', label: 'Nagroda za blok (USD)' }],
        },
        { key: 'period', label: 'Okres', type: 'select', options: PERIODS, default: '1y' },
      ],
      presets: [{ title: 'Opłaty w blokach Bitcoina', keywords: 'fees block górnicy przychód miners revenue' }],
      async load(p) {
        const rewards = p.metric === 'rewards_usd';
        const res = await mp(`/v1/mining/blocks/${rewards ? 'rewards' : 'fees'}/${p.period}`, 60);
        const field = rewards ? 'avgRewards' : 'avgFees';
        const points = (res.data || []).map((x) => {
          const btc = x[field] / 1e8;
          return [x.timestamp * 1000, p.metric === 'fees_btc' ? btc : btc * x.USD];
        }).sort((a, b) => a[0] - b[0]);
        const label = { fees_usd: 'Średnie opłaty na blok', fees_btc: 'Średnie opłaty na blok', rewards_usd: 'Średnia nagroda za blok' }[p.metric];
        return timeseries({
          title: label, unit: p.metric === 'fees_btc' ? 'count' : 'money', suffix: p.metric === 'fees_btc' ? ' BTC' : '',
          series: [{ key: p.metric, name: label, points }], updatedAt: res.fetchedAt, note: 'USD po cenie BTC z danego dnia. Źródło: mempool.space.',
        });
      },
    },
    {
      id: 'btc.pools', group: 'bitcoin',
      title: 'Udział pul wydobywczych',
      description: 'Które pule wydobyły najwięcej bloków – koncentracja mocy w sieci Bitcoin.',
      endpoint: 'mempool.space /api/v1/mining/pools', plan: 'free', charts: ['hbar', 'donut', 'table'], size: 'm',
      params: [{
        key: 'period', label: 'Okres', type: 'select', default: '1w',
        options: [{ value: '24h', label: '24 godziny' }, { value: '3d', label: '3 dni' }, { value: '1w', label: '1 tydzień' }, { value: '1m', label: '1 miesiąc' }, { value: '3m', label: '3 miesiące' }],
      }],
      presets: [{ title: 'Udział pul wydobywczych Bitcoina', keywords: 'mining pools pule foundry antpool decentralizacja' }],
      async load(p) {
        const res = await mp(`/v1/mining/pools/${p.period}`, 30);
        const pools = res.data?.pools || [];
        const total = res.data?.blockCount || pools.reduce((s, x) => s + x.blockCount, 0);
        const sorted = [...pools].sort((a, b) => b.blockCount - a.blockCount);
        const top = sorted.slice(0, 7);
        const rest = sorted.slice(7).reduce((s, x) => s + x.blockCount, 0);
        const rows = top.map((x) => ({ key: x.slug, label: x.name, value: (x.blockCount / total) * 100, extra: [{ label: 'Bloki', value: x.blockCount, unit: 'count' }] }));
        if (rest) rows.push({ key: 'rest', label: 'Pozostałe', value: (rest / total) * 100, extra: [{ label: 'Bloki', value: rest, unit: 'count' }] });
        return categorical({ title: 'Udział pul w wydobytych blokach', unit: 'pct', valueLabel: 'Udział w blokach', rows, partToWhole: true, updatedAt: res.fetchedAt, note: `${total} bloków w okresie. Źródło: mempool.space.` });
      },
    },
  ];
}
