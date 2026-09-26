async function request(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Błąd serwera (HTTP ${res.status})`);
    err.code = body.code ?? null;
    err.endpoint = body.endpoint ?? null;
    err.paidPlanRequired = !!body.paidPlanRequired;
    throw err;
  }
  return body;
}

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

let categoriesPromise = null;

export const api = {
  status: () => request('/api/status'),
  catalog: () => request('/api/catalog'),
  dashboard: () => request('/api/dashboard'),
  saveDashboard: (dashboard) => request('/api/dashboard', json('PUT', dashboard)),
  resetDashboard: () => request('/api/dashboard', { method: 'DELETE' }),
  snapshot: () => request('/api/snapshot', { method: 'POST' }),
  data: (dataset, params, currency) => {
    const qs = new URLSearchParams({ params: JSON.stringify(params || {}), currency });
    return request(`/api/data/${encodeURIComponent(dataset)}?${qs}`);
  },
  categories: () => {
    categoriesPromise ??= request('/api/options/categories').catch((err) => {
      categoriesPromise = null;
      throw err;
    });
    return categoriesPromise;
  },
  searchCoins: (q, limit = 10) => request(`/api/options/coins?${new URLSearchParams({ q, limit })}`),
  coinsByIds: (ids) => (ids.length ? request(`/api/options/coins?ids=${ids.join(',')}`) : Promise.resolve([])),
};
