// Tryb demo dla darmowych źródeł (Coin Metrics, DefiLlama, mempool.space):
// odpowiedzi w tym samym formacie co prawdziwe API, dane wygenerowane.

const DAY = 86_400_000;

function random(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) >>> 0);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Dzienny spacer losowy kończący się na wartości `end`.
function walk(seed, days, end, vol = 0.03) {
  const r = random(seed);
  const today = Math.floor(Date.now() / DAY) * DAY;
  const values = [end];
  for (let i = 1; i < days; i++) values.push(values[i - 1] / (1 + (r() - 0.49) * vol));
  return values.reverse().map((v, i) => [today - (days - 1 - i) * DAY, v]);
}

const CM_BASE = {
  btc: { AdrActCnt: 650e3, TxCnt: 450e3, TxTfrCnt: 950e3, AdrBalCnt: 57e6, CapMVRVCur: 1.6, CapMrktCurUSD: 1.7e12, PriceUSD: 84e3, HashRate: 1.05e9, SplyCur: 19.9e6, IssTotUSD: 38e6, SplyExNtv: 2.4e6, SplyExUSD: 2.0e11, FlowInExUSD: 2.6e9, FlowOutExUSD: 2.5e9, ROI30d: 6, BlkCnt: 144 },
  eth: { AdrActCnt: 900e3, TxCnt: 2.1e6, TxTfrCnt: 3e6, AdrBalCnt: 150e6, CapMVRVCur: 1.15, CapMrktCurUSD: 3.3e11, PriceUSD: 2700, HashRate: 825, SplyCur: 122e6, IssTotUSD: 7.9e6, SplyExNtv: 15e6, SplyExUSD: 4e10, FlowInExUSD: 3.8e8, FlowOutExUSD: 3.9e8, ROI30d: 3, BlkCnt: 7150 },
};
const CM_OTHER = ['AdrActCnt', 'TxCnt', 'TxTfrCnt', 'AdrBalCnt', 'CapMVRVCur', 'CapMrktCurUSD', 'PriceUSD', 'SplyCur', 'ROI30d', 'BlkCnt'];

function coinMetrics(url) {
  const asset = url.searchParams.get('assets');
  const metrics = url.searchParams.get('metrics').split(',');
  const days = Math.min(1830, Number(url.searchParams.get('page_size')) || 100);
  const base = CM_BASE[asset] || Object.fromEntries(CM_OTHER.map((m, i) => [m, (CM_BASE.btc[m] || 1) / (5 + (asset.charCodeAt(0) % 7) + i % 3)]));
  const columns = {};
  for (const m of metrics) {
    if (base[m] == null) continue;
    const vol = m === 'CapMVRVCur' || m === 'ROI30d' ? 0.02 : m.startsWith('Flow') ? 0.4 : 0.04;
    columns[m] = walk(`${asset}:${m}`, days, base[m], vol);
  }
  const first = Object.values(columns)[0] || [];
  return {
    data: first.map(([t], i) => {
      const row = { asset, time: new Date(t).toISOString() };
      for (const [m, pts] of Object.entries(columns)) row[m] = String(pts[i][1]);
      return row;
    }),
  };
}

const CHAINS = [['Ethereum', 53.6e9], ['Solana', 6.6e9], ['BSC', 5.9e9], ['Bitcoin', 5.1e9], ['Tron', 4.5e9], ['Base', 3.8e9], ['Arbitrum', 2.4e9], ['Hyperliquid L1', 2.1e9], ['Avalanche', 1.3e9], ['Polygon', 1.1e9], ['Sui', 1.0e9], ['Aptos', 0.8e9], ['Optimism', 0.5e9], ['Sonic', 0.4e9], ['Cardano', 0.3e9]];
const CATEGORIES = [['Liquid Staking', 61e9], ['Bridge', 57e9], ['Lending', 55e9], ['Staking Pool', 16e9], ['Dexs', 15e9], ['Restaking', 11e9], ['CDP', 8e9], ['Basis Trading', 7.6e9], ['Yield', 5e9], ['Derivatives', 4e9], ['RWA', 3.5e9], ['CEX', 320e9]];

function protocols() {
  const r = random('protocols');
  const out = [];
  for (const [cat, total] of CATEGORIES) {
    for (let i = 0; i < 6; i++) {
      out.push({
        name: `${cat} Demo ${i + 1}`, slug: `${cat}-${i}`.toLowerCase().replace(/\s+/g, '-'), category: cat,
        tvl: total * [0.4, 0.2, 0.15, 0.1, 0.1, 0.05][i], change_1d: (r() - 0.5) * 6, change_7d: (r() - 0.45) * 18, chains: ['Ethereum'],
      });
    }
  }
  return out;
}

function overview(kind) {
  const r = random(kind);
  const end = kind === 'dexs' ? 10e9 : 78e6;
  const names = kind === 'dexs' ? ['Uniswap V3', 'Uniswap V4', 'PancakeSwap', 'Aerodrome', 'Raydium', 'Curve', 'Orca', 'Meteora'] : ['Tether', 'Circle USDC', 'PumpSwap', 'Uniswap V4', 'Aave', 'Lido', 'Hyperliquid', 'Jupiter'];
  return {
    totalDataChart: walk(`ov:${kind}`, 1500, end, 0.25).map(([t, v]) => [t / 1000, v]),
    total24h: end, change_1d: -1.2,
    protocols: names.map((name, i) => {
      const t24 = end * 0.3 / (i + 1);
      return { name, displayName: name, defillamaId: String(i), category: kind === 'dexs' ? 'Dexs' : 'Various', total24h: t24, total7d: t24 * 7 * (0.8 + r() * 0.4), total30d: t24 * 30, change_1d: (r() - 0.5) * 30, change_7dover7d: (r() - 0.5) * 40 };
    }),
  };
}

function llama(url) {
  const path = url.pathname;
  if (path.startsWith('/v2/historicalChainTvl')) {
    const chain = decodeURIComponent(path.split('/')[3] || '');
    const end = chain ? CHAINS.find(([c]) => c === chain)?.[1] || 1e9 : 95e9;
    return walk(`tvl:${chain}`, 2000, end, 0.03).map(([t, v]) => ({ date: t / 1000, tvl: v }));
  }
  if (path === '/v2/chains') return CHAINS.map(([name, tvl]) => ({ name, tvl, tokenSymbol: null }));
  if (path === '/protocols') return protocols();
  if (path.startsWith('/overview/')) return overview(path.split('/')[2]);
  throw new Error(`Brak danych demo dla ${path}`);
}

function stablecoins(url) {
  if (url.pathname === '/stablecoincharts/all') {
    return walk('stables', 2000, 311e9, 0.006).map(([t, v]) => ({ date: String(t / 1000), totalCirculatingUSD: { peggedUSD: v, peggedEUR: v * 0.003 } }));
  }
  if (url.pathname === '/stablecoins') {
    const list = [['Tether', 'USDT', 183e9], ['USD Coin', 'USDC', 74e9], ['Ethena USDe', 'USDe', 12e9], ['Dai', 'DAI', 5e9], ['USDS', 'USDS', 7e9], ['First Digital USD', 'FDUSD', 1.2e9], ['PayPal USD', 'PYUSD', 1.1e9], ['Euro Coin', 'EURC', 0.2e9]];
    const r = random('stablelist');
    return {
      peggedAssets: list.map(([name, symbol, v], i) => ({
        id: String(i + 1), name, symbol, pegType: symbol === 'EURC' ? 'peggedEUR' : 'peggedUSD',
        circulating: { [symbol === 'EURC' ? 'peggedEUR' : 'peggedUSD']: v },
        circulatingPrevDay: { peggedUSD: v / (1 + (r() - 0.5) * 0.01) },
        circulatingPrevWeek: { peggedUSD: v / (1 + (r() - 0.4) * 0.04) },
        circulatingPrevMonth: { peggedUSD: v / (1 + (r() - 0.4) * 0.1) },
      })),
    };
  }
  throw new Error(`Brak danych demo dla ${url.pathname}`);
}

function mempool(url) {
  const path = url.pathname.replace(/^\/api/, '');
  const periodDays = (p) => ({ '24h': 1, '3d': 3, '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365, '2y': 730, '3y': 1095 })[p] || 365;
  if (path === '/v1/fees/recommended') return { fastestFee: 4, halfHourFee: 2, hourFee: 1, economyFee: 1, minimumFee: 1 };
  if (path === '/mempool') return { count: 84507, vsize: 42568701, total_fee: 10010572 };
  if (path === '/v1/difficulty-adjustment') return { progressPercent: 49.6, difficultyChange: -3.85, remainingBlocks: 1017, previousRetarget: 4.16 };
  let m = path.match(/^\/v1\/mining\/hashrate\/(\w+)$/);
  if (m) {
    const days = periodDays(m[1]);
    const pts = walk('hash', days, 1.05e21, 0.05);
    return {
      hashrates: pts.map(([t, v]) => ({ timestamp: t / 1000, avgHashrate: v })),
      difficulty: pts.filter((_, i) => i % 14 === 0).map(([t, v]) => ({ time: t / 1000, difficulty: v / 7.2e9 })),
    };
  }
  m = path.match(/^\/v1\/mining\/blocks\/(fees|rewards)\/(\w+)$/);
  if (m) {
    const price = walk('btcusd', periodDays(m[2]), 84100, 0.03);
    const fees = walk('blockfees', periodDays(m[2]), 2.2e6, 0.2);
    return price.map(([t, usd], i) => ({ timestamp: t / 1000, USD: usd, [m[1] === 'fees' ? 'avgFees' : 'avgRewards']: m[1] === 'fees' ? fees[i][1] : 3.125e8 + fees[i][1] }));
  }
  m = path.match(/^\/v1\/mining\/pools\/(\w+)$/);
  if (m) {
    const blocks = [['Foundry USA', 240], ['AntPool', 206], ['ViaBTC', 110], ['F2Pool', 95], ['MARA Pool', 60], ['SpiderPool', 55], ['Luxor', 30], ['SECPOOL', 20], ['Braiins', 15], ['Ocean', 8]];
    const k = periodDays(m[1]) / 7;
    return { pools: blocks.map(([name, c]) => ({ name, slug: name.toLowerCase().replace(/\s+/g, ''), blockCount: Math.round(c * k) })), blockCount: Math.round(839 * k) };
  }
  throw new Error(`Brak danych demo dla ${path}`);
}

export function mockExternal(rawUrl) {
  const url = new URL(rawUrl);
  switch (url.hostname) {
    case 'community-api.coinmetrics.io': return coinMetrics(url);
    case 'api.llama.fi': return llama(url);
    case 'stablecoins.llama.fi': return stablecoins(url);
    case 'mempool.space': return mempool(url);
    default: throw new Error(`Nieznane źródło demo: ${url.hostname}`);
  }
}
