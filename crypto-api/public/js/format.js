// Formatowanie liczb po polsku: 2,15 bln USD, 54,9%, +1,2 p.p.
let currency = 'USD';

export function setCurrency(value) {
  currency = value;
}

export function getCurrency() {
  return currency;
}

const cache = new Map();
function nf(options) {
  const key = JSON.stringify(options);
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat('pl-PL', options));
  return cache.get(key);
}

const valid = (v) => v != null && Number.isFinite(v);

function money(value, { compact = true, signed = false } = {}) {
  const abs = Math.abs(value);
  const signDisplay = signed ? 'exceptZero' : 'auto';
  if (compact && abs >= 1e6) {
    return nf({ style: 'currency', currency, notation: 'compact', maximumFractionDigits: abs >= 1e12 ? 3 : 2, signDisplay }).format(value);
  }
  if (abs > 0 && abs < 1) {
    return nf({ style: 'currency', currency, maximumSignificantDigits: 4, signDisplay }).format(value);
  }
  return nf({ style: 'currency', currency, maximumFractionDigits: abs >= 1000 ? 0 : 2, signDisplay }).format(value);
}

export function formatValue(value, unit, { compact = true, signed = false } = {}) {
  if (!valid(value)) return '—';
  const signDisplay = signed ? 'exceptZero' : 'auto';
  switch (unit) {
    case 'money':
      return money(value, { compact, signed });
    case 'pct':
      return `${nf({ maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2, signDisplay }).format(value)}%`;
    case 'pp':
      return `${nf({ maximumFractionDigits: 2, signDisplay }).format(value)} p.p.`;
    case 'count':
      return nf({ maximumFractionDigits: 0, notation: compact && Math.abs(value) >= 1e6 ? 'compact' : 'standard', signDisplay }).format(value);
    case 'index':
      return nf({ maximumFractionDigits: 1, signDisplay }).format(value);
    default:
      return nf({ maximumFractionDigits: 2, signDisplay }).format(value);
  }
}

export function formatAxis(value, unit) {
  if (!valid(value)) return '';
  if (unit === 'pct') return `${nf({ maximumFractionDigits: 1 }).format(value)}%`;
  if (unit === 'money' && Math.abs(value) < 1e6) return money(value, { compact: true });
  return nf({ notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const time = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === today.toDateString() ? time : `${d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })} ${time}`;
}

export function formatDate(ts, withTime = false) {
  const d = new Date(ts);
  return withTime
    ? d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fold(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
