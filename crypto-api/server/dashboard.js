// Układ startowy: przegląd rynku + kapitalizacja i wolumen sektorów.
export function defaultDashboard() {
  const w = (id, dataset, params, chart, size) => ({ id, dataset, params, chart, size, title: '' });
  return {
    version: 1,
    currency: 'USD',
    refreshMinutes: 10,
    widgets: [
      w('w-mcap', 'global.kpi', { metric: 'total_market_cap' }, 'kpi', 's'),
      w('w-vol', 'global.kpi', { metric: 'total_volume_24h' }, 'kpi', 's'),
      w('w-btcd', 'global.kpi', { metric: 'btc_dominance' }, 'kpi', 's'),
      w('w-fng', 'sentiment.fng', {}, 'gauge', 's'),
      w('w-sector-mcap', 'sectors.ranking', { metric: 'market_cap', group: 'sectors', limit: 15 }, 'hbar', 'm'),
      w('w-sector-vol', 'sectors.ranking', { metric: 'volume', group: 'sectors', limit: 15 }, 'hbar', 'm'),
      w('w-sector-map', 'sectors.ranking', { metric: 'market_cap', group: 'sectors', limit: 30 }, 'treemap', 'l'),
      w('w-vol-seg', 'global.volume_segments', {}, 'hbar', 'm'),
      w('w-coin-vol', 'coins.ranking', { metric: 'volume_24h', limit: 12, noStable: true }, 'hbar', 'm'),
      w('w-sector-hist', 'history.sectors', { metric: 'market_cap', mode: 'index', range: '30' }, 'line', 'l'),
    ],
  };
}
