// Tryb demo: generuje odpowiedzi o takim samym kształcie jak CoinMarketCap API,
// żeby dashboard działał bez klucza i bez zużywania kredytów.

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function random(seed) {
  let a = typeof seed === 'string' ? hash(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hexId = (name) => {
  const r = random(name);
  let out = '';
  while (out.length < 24) out += Math.floor(r() * 16).toString(16);
  return out;
};

// [id, nazwa, symbol, kapitalizacja w mld USD, cena USD, tagi, czy token]
const BASE_COINS = [
  [1, 'Bitcoin', 'BTC', 2150, 108000, ['layer-1', 'pow'], false],
  [1027, 'Ethereum', 'ETH', 470, 3900, ['layer-1', 'smart-contracts', 'eth'], false],
  [825, 'Tether USDt', 'USDT', 172, 1, ['stablecoin', 'eth', 'sol'], true],
  [52, 'XRP', 'XRP', 165, 2.8, ['layer-1', 'payments'], false],
  [1839, 'BNB', 'BNB', 128, 900, ['layer-1', 'smart-contracts', 'bnb'], false],
  [5426, 'Solana', 'SOL', 112, 205, ['layer-1', 'smart-contracts', 'sol'], false],
  [3408, 'USDC', 'USDC', 74, 1, ['stablecoin', 'eth', 'sol', 'base'], true],
  [74, 'Dogecoin', 'DOGE', 36, 0.24, ['memes', 'pow', 'payments'], false],
  [1958, 'TRON', 'TRX', 31, 0.33, ['layer-1', 'smart-contracts'], false],
  [2010, 'Cardano', 'ADA', 30, 0.83, ['layer-1', 'smart-contracts'], false],
  [32196, 'Hyperliquid', 'HYPE', 16, 48, ['defi', 'dex', 'derivatives'], false],
  [1975, 'Chainlink', 'LINK', 14.5, 22, ['oracles', 'defi', 'rwa', 'interop', 'eth'], true],
  [5805, 'Avalanche', 'AVAX', 12.8, 30, ['layer-1', 'smart-contracts'], false],
  [512, 'Stellar', 'XLM', 11.5, 0.37, ['layer-1', 'payments'], false],
  [20947, 'Sui', 'SUI', 11.8, 3.4, ['layer-1', 'smart-contracts'], false],
  [1831, 'Bitcoin Cash', 'BCH', 10.9, 550, ['pow', 'payments'], false],
  [4642, 'Hedera', 'HBAR', 9.6, 0.23, ['layer-1', 'smart-contracts'], false],
  [2, 'Litecoin', 'LTC', 8.3, 110, ['pow', 'payments'], false],
  [11419, 'Toncoin', 'TON', 7.9, 3.1, ['layer-1', 'smart-contracts'], false],
  [5994, 'Shiba Inu', 'SHIB', 7.4, 0.0000125, ['memes', 'eth'], true],
  [6636, 'Polkadot', 'DOT', 6.4, 4.1, ['layer-1', 'interop'], false],
  [7083, 'Uniswap', 'UNI', 6.2, 9.9, ['defi', 'dex', 'eth', 'base', 'arb'], true],
  [328, 'Monero', 'XMR', 5.9, 320, ['privacy', 'pow'], false],
  [24478, 'Pepe', 'PEPE', 4.6, 0.0000109, ['memes', 'eth'], true],
  [7278, 'Aave', 'AAVE', 4.5, 295, ['defi', 'lending', 'eth', 'base', 'arb'], true],
  [4943, 'Dai', 'DAI', 4.4, 1, ['stablecoin', 'eth'], true],
  [6535, 'NEAR Protocol', 'NEAR', 3.4, 2.7, ['layer-1', 'ai', 'smart-contracts'], false],
  [21794, 'Aptos', 'APT', 3.3, 4.6, ['layer-1', 'smart-contracts'], false],
  [8916, 'Internet Computer', 'ICP', 2.9, 5.4, ['layer-1', 'ai', 'storage'], false],
  [22974, 'Bittensor', 'TAO', 3.6, 370, ['ai', 'depin'], false],
  [30171, 'Ethena', 'ENA', 3.9, 0.62, ['defi', 'eth'], true],
  [21159, 'Ondo', 'ONDO', 3.0, 0.95, ['rwa', 'defi', 'eth'], true],
  [1321, 'Ethereum Classic', 'ETC', 2.9, 19.5, ['pow', 'smart-contracts'], false],
  [28321, 'POL (ex-MATIC)', 'POL', 2.4, 0.23, ['layer-2', 'eth'], true],
  [11841, 'Arbitrum', 'ARB', 2.2, 0.45, ['layer-2', 'arb', 'eth'], true],
  [5690, 'Render', 'RENDER', 1.9, 3.7, ['ai', 'depin', 'sol'], true],
  [3773, 'Artificial Superintelligence Alliance', 'FET', 1.6, 0.64, ['ai', 'eth'], true],
  [11840, 'Optimism', 'OP', 1.3, 0.72, ['layer-2', 'eth'], true],
  [2280, 'Filecoin', 'FIL', 1.6, 2.4, ['storage', 'depin'], false],
  [3794, 'Cosmos', 'ATOM', 1.8, 4.5, ['layer-1', 'interop'], false],
  [7226, 'Injective', 'INJ', 1.3, 13.2, ['defi', 'derivatives', 'layer-1'], false],
  [13502, 'Worldcoin', 'WLD', 2.5, 1.3, ['ai', 'eth'], true],
  [29210, 'Jupiter', 'JUP', 1.5, 0.48, ['defi', 'dex', 'sol'], true],
  [23095, 'Bonk', 'BONK', 1.7, 0.000021, ['memes', 'sol'], true],
  [28752, 'dogwifhat', 'WIF', 0.9, 0.9, ['memes', 'sol'], true],
  [10603, 'Immutable', 'IMX', 1.1, 0.58, ['gaming', 'layer-2', 'eth'], true],
  [6210, 'The Sandbox', 'SAND', 0.7, 0.28, ['gaming', 'metaverse', 'eth'], true],
  [1966, 'Decentraland', 'MANA', 0.6, 0.31, ['gaming', 'metaverse', 'eth'], true],
  [6783, 'Axie Infinity', 'AXS', 0.4, 2.5, ['gaming', 'metaverse', 'eth'], true],
  [6719, 'The Graph', 'GRT', 0.9, 0.09, ['ai', 'eth', 'arb'], true],
  [8000, 'Lido DAO', 'LDO', 1.0, 1.15, ['defi', 'lsd', 'eth'], true],
  [1518, 'Maker', 'MKR', 1.6, 1800, ['defi', 'lending', 'eth'], true],
  [6538, 'Curve DAO Token', 'CRV', 1.0, 0.78, ['defi', 'dex', 'eth', 'arb'], true],
  [22861, 'Celestia', 'TIA', 1.1, 1.6, ['layer-1', 'interop'], false],
  [4847, 'Stacks', 'STX', 1.0, 0.65, ['layer-2'], false],
  [20396, 'Kaspa', 'KAS', 2.1, 0.08, ['layer-1', 'pow'], false],
  [23149, 'Sei', 'SEI', 1.6, 0.29, ['layer-1', 'smart-contracts'], false],
  [10804, 'FLOKI', 'FLOKI', 0.9, 0.0000092, ['memes', 'eth', 'bnb'], true],
  [4030, 'Algorand', 'ALGO', 2.1, 0.24, ['layer-1', 'smart-contracts'], false],
  [3077, 'VeChain', 'VET', 2.0, 0.024, ['layer-1', 'rwa'], false],
  [5632, 'Arweave', 'AR', 0.4, 6.5, ['storage', 'depin'], false],
  [2416, 'Theta Network', 'THETA', 0.8, 0.8, ['depin'], false],
  [7080, 'Gala', 'GALA', 0.7, 0.016, ['gaming', 'eth'], true],
  [28177, 'Pyth Network', 'PYTH', 0.8, 0.14, ['oracles', 'sol'], true],
  [3155, 'Quant', 'QNT', 1.3, 105, ['interop', 'rwa', 'eth'], true],
  [27075, 'Mantle', 'MNT', 3.7, 1.15, ['layer-2', 'eth'], true],
  [8425, 'JasmyCoin', 'JASMY', 0.7, 0.015, ['depin', 'eth'], true],
  [5864, 'yearn.finance', 'YFI', 0.2, 5600, ['defi', 'eth'], true],
];

const TAG_TO_CATEGORY = [
  ['layer-1', 'Layer 1'],
  ['smart-contracts', 'Smart Contracts'],
  ['stablecoin', 'Stablecoins'],
  ['defi', 'DeFi'],
  ['dex', 'Decentralized Exchange (DEX) Token'],
  ['lending', 'Lending & Borrowing'],
  ['memes', 'Memes'],
  ['ai', 'Artificial Intelligence (AI)'],
  ['gaming', 'Gaming'],
  ['metaverse', 'Metaverse'],
  ['layer-2', 'Layer 2'],
  ['rwa', 'Real World Assets (RWA)'],
  ['depin', 'DePIN'],
  ['oracles', 'Oracles'],
  ['privacy', 'Privacy'],
  ['storage', 'Storage'],
  ['lsd', 'Liquid Staking Derivatives'],
  ['payments', 'Payments'],
  ['interop', 'Interoperability'],
  ['derivatives', 'Derivatives'],
  ['pow', 'Proof of Work (PoW)'],
  ['eth', 'Ethereum Ecosystem'],
  ['sol', 'Solana Ecosystem'],
  ['bnb', 'BNB Chain Ecosystem'],
  ['base', 'Base Ecosystem'],
  ['arb', 'Arbitrum Ecosystem'],
  ['vc-coinbase', 'Coinbase Ventures Portfolio'],
  ['vc-a16z', 'a16z Portfolio'],
  ['vc-binance', 'YZi Labs (Prev. Binance Labs) Portfolio'],
  ['vc-pantera', 'Pantera Capital Portfolio'],
  ['launchpool', 'Binance Launchpool'],
  ['made-in-usa', 'Made in America'],
];

const SYNTHETIC_TAGS = ['defi', 'ai', 'memes', 'gaming', 'depin', 'rwa', 'layer-2', 'dex', 'metaverse', 'storage', 'oracles', 'eth', 'sol', 'bnb', 'base'];
const VC_TAGS = ['vc-coinbase', 'vc-a16z', 'vc-binance', 'vc-pantera', 'launchpool', 'made-in-usa'];

function buildUniverse() {
  const r = random('universe');
  const coins = BASE_COINS.map(([id, name, symbol, capBn, price, tags, token]) => ({
    id, name, symbol, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    baseCap: capBn * 1e9, basePrice: price, tags: [...tags], token,
  }));
  for (let i = 0; i < 230; i++) {
    const name = `Demo Token ${i + 1}`;
    const tagCount = 1 + Math.floor(r() * 3);
    const tags = new Set();
    while (tags.size < tagCount) tags.add(SYNTHETIC_TAGS[Math.floor(r() * SYNTHETIC_TAGS.length)]);
    coins.push({
      id: 40000 + i, name, symbol: `DT${i + 1}`, slug: `demo-token-${i + 1}`,
      baseCap: 400e6 * Math.pow(0.985, i) * (0.6 + r() * 0.8),
      basePrice: Math.pow(10, -3 + r() * 5), tags: [...tags], token: true,
    });
  }
  for (const coin of coins) {
    if (coin.tags.includes('stablecoin')) continue;
    for (const tag of VC_TAGS) if (r() < 0.12) coin.tags.push(tag);
  }
  return coins;
}

const UNIVERSE = buildUniverse();

// Rynek "żyje": wartości zmieniają się co 10 minut, deterministycznie.
function marketState(now = Date.now()) {
  const bucket = Math.floor(now / 600_000);
  const coins = UNIVERSE.map((c, idx) => {
    const r = random(`${c.id}:${bucket}`);
    const wave = Math.sin(bucket / 400 + idx * 0.7) * 0.08 + Math.sin(bucket / 61 + idx * 1.3) * 0.025;
    const drift = c.tags.includes('stablecoin') ? 0 : wave + (r() - 0.5) * 0.008;
    const pct = (spread, weight) => (c.tags.includes('stablecoin') ? (r() - 0.5) * 0.04 : (r() - 0.45) * spread + drift * weight);
    const mult = 1 + drift;
    const price = c.basePrice * mult;
    const marketCap = c.baseCap * mult;
    const volume = marketCap * (c.tags.includes('stablecoin') ? 0.55 : 0.02 + r() * 0.12);
    return {
      ...c,
      price, marketCap, volume,
      p1h: pct(1.6, 5), p24h: pct(9, 40), p7d: pct(22, 100), p30d: pct(40, 150), p60d: pct(60, 200), p90d: pct(80, 250),
      volumeChange: (r() - 0.45) * 40,
    };
  }).sort((a, b) => b.marketCap - a.marketCap);
  const total = coins.reduce((s, c) => s + c.marketCap, 0) * 1.07;
  coins.forEach((c, i) => { c.rank = i + 1; c.dominance = (c.marketCap / total) * 100; });
  return { coins, total, bucket };
}

const iso = (t = Date.now()) => new Date(t).toISOString();

function coinPayload(c, full = true) {
  const quote = {
    price: c.price,
    volume_24h: c.volume,
    volume_change_24h: c.volumeChange,
    percent_change_1h: c.p1h,
    percent_change_24h: c.p24h,
    percent_change_7d: c.p7d,
    percent_change_30d: c.p30d,
    percent_change_60d: c.p60d,
    percent_change_90d: c.p90d,
    market_cap: c.marketCap,
    market_cap_dominance: c.dominance,
    fully_diluted_market_cap: c.marketCap * 1.2,
    last_updated: iso(),
  };
  return {
    id: c.id, name: c.name, symbol: c.symbol, slug: c.slug, cmc_rank: c.rank,
    num_market_pairs: 100, circulating_supply: c.marketCap / c.price,
    total_supply: (c.marketCap / c.price) * 1.1, max_supply: null, infinite_supply: false,
    last_updated: iso(), date_added: '2020-01-01T00:00:00.000Z',
    tags: full ? c.tags : undefined,
    platform: c.token ? { id: 1027, name: 'Ethereum', symbol: 'ETH', slug: 'ethereum', token_address: '0x0' } : null,
    quote: { USD: quote },
  };
}

function categories(state) {
  return TAG_TO_CATEGORY.map(([tag, name]) => {
    const members = state.coins.filter((c) => c.tags.includes(tag));
    const cap = members.reduce((s, c) => s + c.marketCap, 0);
    const vol = members.reduce((s, c) => s + c.volume, 0);
    const r = random(`${tag}:${state.bucket}`);
    const weighted = cap ? members.reduce((s, c) => s + c.p24h * c.marketCap, 0) / cap : 0;
    return {
      id: hexId(name), name, title: name, description: `Kategoria demo: ${name}`,
      num_tokens: members.length,
      avg_price_change: members.length ? members.reduce((s, c) => s + c.p24h, 0) / members.length : 0,
      market_cap: cap, market_cap_change: weighted,
      volume: vol, volume_change: (r() - 0.45) * 30,
      last_updated: iso(),
      _tag: tag,
    };
  });
}

function globalMetrics(state) {
  const cats = Object.fromEntries(categories(state).map((c) => [c._tag, c]));
  const btc = state.coins.find((c) => c.id === 1);
  const eth = state.coins.find((c) => c.id === 1027);
  const totalVolume = state.coins.reduce((s, c) => s + c.volume, 0) * 1.1;
  const r = random(`global:${state.bucket}`);
  const btcDom = (btc.marketCap / state.total) * 100;
  const ethDom = (eth.marketCap / state.total) * 100;
  const quote = {
    total_market_cap: state.total,
    total_volume_24h: totalVolume,
    total_volume_24h_reported: totalVolume * 1.4,
    altcoin_volume_24h: totalVolume - btc.volume,
    altcoin_volume_24h_reported: (totalVolume - btc.volume) * 1.4,
    altcoin_market_cap: state.total - btc.marketCap,
    defi_volume_24h: cats.defi.volume,
    defi_volume_24h_reported: cats.defi.volume * 1.3,
    defi_market_cap: cats.defi.market_cap,
    stablecoin_volume_24h: cats.stablecoin.volume,
    stablecoin_volume_24h_reported: cats.stablecoin.volume * 1.3,
    stablecoin_market_cap: cats.stablecoin.market_cap,
    derivatives_volume_24h: totalVolume * 6.5,
    derivatives_volume_24h_reported: totalVolume * 7,
    total_market_cap_yesterday: state.total / (1 + (r() - 0.45) * 0.05),
    total_volume_24h_yesterday: totalVolume / (1 + (r() - 0.5) * 0.3),
    total_market_cap_yesterday_percentage_change: (r() - 0.45) * 5,
    total_volume_24h_yesterday_percentage_change: (r() - 0.5) * 30,
    last_updated: iso(),
  };
  return {
    active_cryptocurrencies: 9800, total_cryptocurrencies: 31000000,
    active_market_pairs: 102000, active_exchanges: 820, total_exchanges: 10800,
    eth_dominance: ethDom, btc_dominance: btcDom,
    eth_dominance_yesterday: ethDom - (r() - 0.5) * 0.4,
    btc_dominance_yesterday: btcDom - (r() - 0.5) * 0.6,
    eth_dominance_24h_percentage_change: (r() - 0.5) * 2,
    btc_dominance_24h_percentage_change: (r() - 0.5) * 1.5,
    defi_volume_24h: quote.defi_volume_24h, defi_market_cap: quote.defi_market_cap,
    defi_24h_percentage_change: (r() - 0.45) * 8,
    stablecoin_volume_24h: quote.stablecoin_volume_24h, stablecoin_market_cap: quote.stablecoin_market_cap,
    stablecoin_24h_percentage_change: (r() - 0.5) * 1,
    derivatives_volume_24h: quote.derivatives_volume_24h,
    derivatives_24h_percentage_change: (r() - 0.5) * 20,
    quote: { USD: quote },
    last_updated: iso(),
  };
}

const FNG_LABELS = [[25, 'Extreme fear'], [45, 'Fear'], [56, 'Neutral'], [76, 'Greed'], [101, 'Extreme greed']];
const fngLabel = (v) => FNG_LABELS.find(([limit]) => v < limit)[1];

function fngSeries(days) {
  const r = random('fng');
  const today = Math.floor(Date.now() / 86_400_000);
  const out = [];
  let v = 50;
  for (let d = today - 600; d <= today; d++) {
    v = Math.min(95, Math.max(5, v + (r() - 0.5) * 9 + (50 - v) * 0.03));
    out.push({ timestamp: String(d * 86_400), value: Math.round(v), value_classification: fngLabel(Math.round(v)) });
  }
  return out.slice(-days).reverse();
}

function walkBack(end, days, seed, volatility) {
  const r = random(seed);
  const points = [end];
  for (let i = 1; i < days; i++) points.push(points[i - 1] / (1 + (r() - 0.48) * volatility));
  return points.reverse();
}

function dayStarts(count, endTime = Date.now()) {
  const end = Math.floor(endTime / 86_400_000) * 86_400_000;
  return Array.from({ length: count }, (_, i) => end - (count - 1 - i) * 86_400_000);
}

const ok = (data, credits = 1) => ({
  status: { timestamp: iso(), error_code: 0, error_message: null, elapsed: 5, credit_count: credits },
  data,
});

export class MockError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const FIAT_RATES = { USD: 1, EUR: 0.86, PLN: 3.66, GBP: 0.75 };

export function mockResponse(endpoint, params = {}) {
  const state = marketState();
  const coinsById = new Map(state.coins.map((c) => [c.id, c]));
  const ids = () => String(params.id || '').split(',').filter(Boolean).map(Number);

  switch (endpoint) {
    case '/v1/global-metrics/quotes/latest':
      return ok(globalMetrics(state));

    case '/v1/cryptocurrency/categories':
      return ok(categories(state).map(({ _tag, ...c }) => c));

    case '/v1/cryptocurrency/category': {
      const cat = categories(state).find((c) => c.id === params.id);
      if (!cat) throw new MockError(400, 'Invalid value for "id"');
      const { _tag, ...rest } = cat;
      const limit = Number(params.limit || 100);
      const coins = state.coins.filter((c) => c.tags.includes(_tag)).slice(0, limit).map((c) => coinPayload(c));
      return ok({ ...rest, coins });
    }

    case '/v1/cryptocurrency/listings/latest': {
      const start = Number(params.start || 1);
      const limit = Number(params.limit || 100);
      return ok(state.coins.slice(start - 1, start - 1 + limit).map((c) => coinPayload(c)), Math.ceil(limit / 200));
    }

    case '/v2/cryptocurrency/quotes/latest': {
      const data = {};
      for (const id of ids()) {
        const c = coinsById.get(id);
        if (c) data[id] = coinPayload(c);
      }
      if (!Object.keys(data).length) throw new MockError(400, 'Invalid value for "id"');
      return ok(data);
    }

    case '/v1/cryptocurrency/map':
      return ok(state.coins.map((c) => ({
        id: c.id, rank: c.rank, name: c.name, symbol: c.symbol, slug: c.slug, is_active: 1,
        first_historical_data: '2020-01-01T00:00:00.000Z', last_historical_data: iso(),
        platform: c.token ? { id: 1027, name: 'Ethereum', symbol: 'ETH', slug: 'ethereum', token_address: '0x0' } : null,
      })));

    case '/v3/fear-and-greed/latest': {
      const [latest] = fngSeries(1);
      return ok({ value: latest.value, update_time: iso(), value_classification: latest.value_classification });
    }

    case '/v3/fear-and-greed/historical':
      return ok(fngSeries(Math.min(500, Number(params.limit || 50))));

    case '/v1/key/info':
      return ok({
        plan: {
          credit_limit_monthly: 10000, credit_limit_monthly_reset: 'In 5 days',
          credit_limit_monthly_reset_timestamp: iso(Date.now() + 5 * 86_400_000),
          rate_limit_minute: 30,
        },
        usage: {
          current_minute: { requests_made: 2, requests_left: 28 },
          current_day: { credits_used: 41 },
          current_month: { credits_used: 1873, credits_left: 8127 },
        },
      }, 0);

    case '/v2/tools/price-conversion': {
      const target = String(params.convert || 'USD').toUpperCase();
      const rate = FIAT_RATES[target];
      if (!rate) throw new MockError(400, `Invalid value for "convert": "${target}"`);
      return ok({ id: 2781, symbol: 'USD', name: 'United States Dollar', amount: Number(params.amount || 1), last_updated: iso(), quote: { [target]: { price: rate * Number(params.amount || 1), last_updated: iso() } } });
    }

    case '/v1/global-metrics/quotes/historical': {
      const count = Math.min(400, Number(params.count || 30));
      const g = globalMetrics(state);
      const caps = walkBack(g.quote.USD.total_market_cap, count, 'ghist', 0.05);
      const vols = walkBack(g.quote.USD.total_volume_24h, count, 'ghist-v', 0.25);
      const doms = walkBack(g.btc_dominance, count, 'ghist-d', 0.01);
      const days = dayStarts(count);
      return ok({
        quotes: days.map((t, i) => ({
          timestamp: iso(t), btc_dominance: doms[i], eth_dominance: g.eth_dominance,
          active_cryptocurrencies: 9800, active_exchanges: 820, active_market_pairs: 102000,
          quote: { USD: { total_market_cap: caps[i], total_volume_24h: vols[i], total_volume_24h_reported: vols[i] * 1.4, altcoin_market_cap: caps[i] * (1 - doms[i] / 100), altcoin_volume_24h: vols[i] * 0.6, timestamp: iso(t) } },
        })),
      });
    }

    case '/v2/cryptocurrency/quotes/historical': {
      const count = Math.min(400, Number(params.count || 30));
      const days = dayStarts(count);
      const data = {};
      for (const id of ids()) {
        const c = coinsById.get(id);
        if (!c) continue;
        const prices = walkBack(c.price, count, `hist-${id}`, 0.06);
        data[id] = {
          id: c.id, name: c.name, symbol: c.symbol, is_active: 1, is_fiat: 0,
          quotes: days.map((t, i) => ({
            timestamp: iso(t),
            quote: { USD: { price: prices[i], volume_24h: c.volume * (0.7 + (i % 5) / 10), market_cap: (prices[i] / c.price) * c.marketCap, timestamp: iso(t) } },
          })),
        };
      }
      if (!Object.keys(data).length) throw new MockError(400, 'Invalid value for "id"');
      return ok(data);
    }

    default:
      throw new MockError(404, `Endpoint ${endpoint} nie jest obsługiwany w trybie demo`, 404);
  }
}

// Wstecznie wygenerowane snapshoty dla trybu demo, żeby wykresy historyczne
// miały co pokazać od razu po uruchomieniu.
export function mockSnapshots(days = 14, stepMinutes = 60, now = Date.now()) {
  const out = [];
  const step = stepMinutes * 60_000;
  for (let t = now - days * 86_400_000; t < now - step; t += step) {
    const state = marketState(t);
    const g = globalMetrics(state);
    out.push({
      t,
      data: {
        global: g,
        categories: categories(state).map(({ _tag, ...c }) => c),
        listings: state.coins.slice(0, 200).map((c) => coinPayload(c, false)),
      },
    });
  }
  return out;
}
