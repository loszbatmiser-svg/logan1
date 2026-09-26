import { escapeHtml, formatAxis, formatDate, formatValue } from './format.js';
import { icon } from './icons.js';

/* global echarts */

// ------------------------------------------------------------------ kolory

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    surface: v('--surface'),
    text: v('--text-primary'),
    text2: v('--text-secondary'),
    muted: v('--axis-ink'),
    grid: v('--grid'),
    axis: v('--axis'),
    series: Array.from({ length: 8 }, (_, i) => v(`--series-${i + 1}`)),
    pos: v('--pos'),
    neg: v('--neg'),
    posStrong: v('--pos-strong'),
    negStrong: v('--neg-strong'),
    mid: v('--mid'),
    font: v('--font'),
  };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

function luminance(hex) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const inkOn = (hex) => (luminance(hex) > 0.36 ? '#0b0b0b' : '#ffffff');

// Skala rozbieżna: czerwony (spadek) – szary (0) – niebieski (wzrost).
function divergingColor(value, maxAbs, t) {
  if (value == null) return t.mid;
  const x = Math.max(-1, Math.min(1, value / maxAbs));
  const [pole, strong] = x >= 0 ? [t.pos, t.posStrong] : [t.neg, t.negStrong];
  const a = Math.abs(x);
  return a <= 0.6 ? mix(t.mid, pole, a / 0.6) : mix(pole, strong, (a - 0.6) / 0.4);
}

function robustMax(values) {
  const abs = values.filter((v) => v != null && Number.isFinite(v)).map(Math.abs).sort((a, b) => a - b);
  if (!abs.length) return 1;
  return Math.max(1, abs[Math.floor((abs.length - 1) * 0.9)]);
}

// ------------------------------------------------------------------ wspólne

function baseOption(t) {
  return {
    animationDuration: 350,
    animationDurationUpdate: 300,
    textStyle: { fontFamily: t.font, color: t.text2 },
    tooltip: {
      confine: true,
      backgroundColor: t.surface,
      borderColor: t.axis,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t.text, fontSize: 12 },
      extraCssText: 'box-shadow: 0 6px 24px rgba(0,0,0,.14); border-radius: 8px;',
    },
  };
}

function tooltipRows(pairs) {
  return pairs
    .filter(([, value]) => value != null && value !== '—')
    .map(([label, value]) => `<div style="display:flex;justify-content:space-between;gap:16px"><span style="opacity:.75">${escapeHtml(label)}</span><b style="font-variant-numeric:tabular-nums">${escapeHtml(value)}</b></div>`)
    .join('');
}

function rowTooltip(row, payload) {
  const pairs = [[payload.valueLabel || 'Wartość', sfx(formatValue(row.value, payload.unit, { signed: payload.polarity }), payload.suffix)]];
  for (const e of row.extra || []) {
    if (e.label === payload.valueLabel) continue;
    pairs.push([e.label, formatValue(e.value, e.unit, { signed: e.unit === 'pct' && /zmiana/i.test(e.label) })]);
  }
  return `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(row.name || row.label)}</div>${tooltipRows(pairs)}`;
}

// Dopisek jednostki czasu przy prędkości, np. "2,4%/d".
const sfx = (text, suffix) => (!suffix || text === '—' || text === '' ? text : `${text}${suffix}`);

function valueAxis(t, unit, extra = {}, suffix = '') {
  return {
    type: 'value',
    axisLabel: { color: t.muted, formatter: (v) => sfx(formatAxis(v, unit), suffix), hideOverlap: true },
    splitLine: { lineStyle: { color: t.grid, width: 1 } },
    axisLine: { show: false },
    axisTick: { show: false },
    ...extra,
  };
}

function categoryAxis(t, labels, extra = {}) {
  return {
    type: 'category',
    data: labels,
    axisLabel: { color: t.text2, hideOverlap: false },
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    ...extra,
  };
}

// ------------------------------------------------------------------ opcje wykresów

let measureCtx = null;
function labelWidth(labels, font, max = 170) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  measureCtx.font = `12px ${font}`;
  const widest = Math.max(0, ...labels.map((l) => measureCtx.measureText(String(l)).width));
  return Math.ceil(Math.min(max, widest + 6));
}

// Szerokość etykiet osi Y liczona z góry: automatyczne mieszczenie etykiet
// w ECharts 6 potrafi uciąć pierwszą cyfrę ("800 tys." -> "00 tys.").
function yLabelWidth(values, unit, suffix, font) {
  const finite = values.filter((v) => v != null && Number.isFinite(v));
  if (!finite.length) return 40;
  const min = Math.min(0, ...finite);
  const max = Math.max(...finite);
  const candidates = [min, max, max * 1.25, min * 1.25, (min + max) / 2].map((v) => sfx(formatAxis(v, unit), suffix));
  return labelWidth(candidates, font, 150);
}

function hbarOption(payload, t, containerWidth) {
  const rows = payload.rows;
  const width = labelWidth(rows.map((r) => r.label), t.font, Math.min(170, Math.max(60, containerWidth * 0.36)));
  return {
    ...baseOption(t),
    grid: { left: width + 12, right: 32, top: 6, bottom: 26, containLabel: false },
    tooltip: {
      ...baseOption(t).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: t.grid, opacity: 0.5 } },
      formatter: (items) => rowTooltip(rows[items[0].dataIndex], payload),
    },
    xAxis: valueAxis(t, payload.unit, {}, payload.suffix),
    yAxis: categoryAxis(t, rows.map((r) => r.label), {
      inverse: true,
      axisLabel: { color: t.text2, fontSize: 12, width, overflow: 'truncate', ellipsis: '…' },
    }),
    series: [{
      type: 'bar',
      barMaxWidth: 16,
      barCategoryGap: '28%',
      data: rows.map((r) => ({
        value: r.value,
        itemStyle: {
          color: payload.polarity ? (r.value >= 0 ? t.pos : t.neg) : t.series[0],
          borderRadius: r.value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
        },
      })),
    }],
  };
}

function columnOption(payload, t) {
  const rows = payload.rows;
  const showLabels = rows.length <= 8;
  return {
    ...baseOption(t),
    grid: { left: yLabelWidth(rows.map((r) => r.value), payload.unit, payload.suffix, t.font) + 12, right: 8, top: showLabels ? 24 : 10, bottom: 28, containLabel: false },
    tooltip: {
      ...baseOption(t).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: t.grid, opacity: 0.5 } },
      formatter: (items) => rowTooltip(rows[items[0].dataIndex], payload),
    },
    xAxis: categoryAxis(t, rows.map((r) => r.label), { axisLabel: { color: t.text2, interval: 0, width: 90, overflow: 'truncate' } }),
    yAxis: valueAxis(t, payload.unit, {}, payload.suffix),
    series: [{
      type: 'bar',
      barMaxWidth: 40,
      data: rows.map((r) => ({
        value: r.value,
        itemStyle: {
          color: payload.polarity ? (r.value >= 0 ? t.pos : t.neg) : t.series[0],
          borderRadius: r.value >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4],
        },
        label: {
          show: showLabels,
          position: r.value >= 0 ? 'top' : 'bottom',
          color: t.text2,
          fontSize: 11,
          formatter: () => sfx(formatValue(r.value, payload.unit, { signed: payload.polarity }), payload.suffix),
        },
      })),
    }],
  };
}

function treemapOption(payload, t, size) {
  const rows = payload.rows.filter((r) => (r.size ?? r.value) > 0);
  const hasChange = rows.some((r) => r.change != null);
  const maxAbs = robustMax(rows.map((r) => r.change));
  const total = rows.reduce((sum, r) => sum + (r.size ?? r.value), 0);
  const minShare = size === 'l' ? 0.012 : 0.025;
  return {
    ...baseOption(t),
    tooltip: {
      ...baseOption(t).tooltip,
      formatter: (p) => {
        const row = rows[p.data?.rowIndex];
        return row ? rowTooltip(row, payload) : '';
      },
    },
    series: [{
      type: 'treemap',
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      left: 0, right: 0, top: 0, bottom: 0,
      itemStyle: { borderColor: t.surface, borderWidth: 1, gapWidth: 2, borderRadius: 3 },
      label: {
        show: true,
        overflow: 'truncate',
        ellipsis: '…',
        fontSize: 12,
        lineHeight: 16,
        formatter: (p) => {
          const row = rows[p.data?.rowIndex];
          if (!row) return p.name;
          const second = hasChange && payload.unit !== 'pct'
            ? formatValue(row.change, 'pct', { signed: true })
            : sfx(formatValue(row.value, payload.unit, { signed: payload.polarity }), payload.suffix);
          return `{b|${row.label}}\n${second}`;
        },
        rich: { b: { fontWeight: 600, fontSize: 12, lineHeight: 16 } },
      },
      upperLabel: { show: false },
      emphasis: { itemStyle: { borderColor: t.text, borderWidth: 1 } },
      data: rows.map((r, i) => {
        const color = hasChange ? divergingColor(r.change, maxAbs, t) : t.series[0];
        return {
          rowIndex: i,
          name: r.label,
          value: r.size ?? r.value,
          itemStyle: { color },
          label: { color: inkOn(color), show: (r.size ?? r.value) / total >= minShare },
        };
      }),
    }],
  };
}

function donutOption(payload, t) {
  const rows = payload.rows;
  return {
    ...baseOption(t),
    tooltip: {
      ...baseOption(t).tooltip,
      trigger: 'item',
      formatter: (p) => rowTooltip(rows[p.dataIndex], payload),
    },
    legend: {
      orient: 'vertical', right: 8, top: 'middle', icon: 'roundRect', itemWidth: 12, itemHeight: 12,
      textStyle: { color: t.text2 },
      formatter: (name) => {
        const row = rows.find((r) => r.label === name);
        return `${name}  ${formatValue(row?.value, payload.unit)}`;
      },
    },
    series: [{
      type: 'pie',
      radius: ['52%', '80%'],
      center: ['32%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
      label: { show: false },
      data: rows.map((r, i) => ({ name: r.label, value: r.value, itemStyle: { color: t.series[i % 8] } })),
    }],
  };
}

const FNG_BANDS = [[0, 25], [75, 100]];

const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

// Etykiety osi czasu po polsku: rok pogrubiony na początku roku, dalej miesiące, dni, godziny.
function timeLabel(value) {
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  if (d.getHours() || d.getMinutes()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.getDate() !== 1) return `${d.getDate()} ${MONTHS_PL[d.getMonth()]}`;
  if (d.getMonth() !== 0) return MONTHS_PL[d.getMonth()];
  return `{y|${d.getFullYear()}}`;
}

const DAY_MS = 86_400_000;
// Tygodnie pokazujemy do ~2 lat widocznego okresu – dalej kreski zlewają się w pasek.
const WEEKS_MAX_SPAN = 2.1 * 365 * DAY_MS;

function weekStarts(start, end) {
  const out = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  while (d.getTime() <= end) {
    // Poniedziałek, który jest zarazem 1. dniem miesiąca, ma już kreskę miesiąca.
    if (d.getTime() >= start && d.getDate() !== 1) out.push(d.getTime());
    d.setDate(d.getDate() + 7);
  }
  return out;
}

function monthStarts(payload) {
  const [min, max] = extentOf(payload);
  if (!Number.isFinite(min)) return [];
  const out = [];
  const d = new Date(min);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  while (d.getTime() <= max) {
    if (d.getTime() >= min) out.push(d.getTime());
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

function lineOption(payload, t, area) {
  const series = payload.series.slice(0, 8);
  const multi = series.length > 1;
  const option = {
    ...baseOption(t),
    grid: {
      left: yLabelWidth(payload.bands ? [0, 100] : series.flatMap((x) => x.points.map((pt) => pt[1])), payload.unit, payload.suffix, t.font) + 12,
      right: 16, top: multi ? 40 : 12, bottom: hasSlider(payload) ? 74 : 28, containLabel: false,
    },
    tooltip: {
      ...baseOption(t).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: t.axis, width: 1 } },
      formatter: (items) => {
        const time = items[0]?.value?.[0];
        const pairs = items.map((it) => [it.seriesName, sfx(formatValue(it.value[1], payload.unit, { compact: true, signed: payload.zeroLine }), payload.suffix)]);
        return `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(formatDate(time, true))}</div>${tooltipRows(pairs)}`;
      },
    },
    legend: multi ? {
      top: 0, left: 0, type: 'scroll', icon: 'roundRect', itemWidth: 12, itemHeight: 4,
      textStyle: { color: t.text2 }, pageTextStyle: { color: t.text2 },
    } : undefined,
    xAxis: [
      {
        type: 'time',
        axisLabel: { color: t.muted, hideOverlap: true, formatter: timeLabel, rich: { y: { fontWeight: 600, color: t.text2 } } },
        axisLine: { lineStyle: { color: t.axis } },
        // Dłuższa kreska na początku każdego miesiąca – także gdy etykiety pokazują tylko lata.
        axisTick: { show: true, interval: 0, customValues: monthStarts(payload), length: 7, lineStyle: { color: t.axis } },
        splitLine: { show: false },
      },
      // Druga, niewidoczna oś tylko na krótkie kreski tygodni (poniedziałki); zakres ustawia refreshWeeks().
      {
        type: 'time', position: 'bottom', silent: true, axisPointer: { show: false },
        axisLine: { show: false }, axisLabel: { show: false }, splitLine: { show: false },
        axisTick: { show: true, interval: 0, customValues: [], length: 3, lineStyle: { color: t.axis } },
      },
    ],
    yAxis: valueAxis(t, payload.unit, payload.bands ? { min: 0, max: 100 } : payload.logScale ? { type: 'log', logBase: 10 } : { scale: !area && !payload.zeroLine }, payload.suffix),
    series: series.map((s, i) => ({
      type: 'line',
      name: s.name,
      // Skala logarytmiczna nie przyjmuje zera ani wartości ujemnych.
      data: payload.logScale ? s.points.map(([x, v]) => [x, v > 0 ? v : null]) : s.points,
      sampling: 'lttb',
      color: t.series[i],
      showSymbol: s.points.length < 3,
      symbolSize: 8,
      lineStyle: { width: 2 },
      itemStyle: { borderColor: t.surface, borderWidth: 2 },
      areaStyle: area ? { opacity: multi ? 0.08 : 0.14 } : undefined,
      emphasis: { focus: multi ? 'series' : 'none' },
      markArea: payload.bands && i === 0 ? {
        silent: true,
        data: FNG_BANDS.map(([a, b]) => [{ yAxis: a, itemStyle: { color: a === 0 ? t.neg : t.pos, opacity: 0.07 } }, { yAxis: b }]),
      } : undefined,
    })),
  };
  if ((payload.unit === 'index' || payload.zeroLine) && !payload.bands && option.series.length) {
    option.series[0].markLine = {
      silent: true, symbol: 'none', label: { show: false },
      lineStyle: { color: t.axis, type: 'solid', width: 1 },
      data: [{ yAxis: payload.zeroLine ? 0 : 100 }],
    };
  }
  return option;
}

// ------------------------------------------------------------------ HTML

function kpiHtml(p) {
  const change = p.change;
  const dir = change == null ? null : change > 0.0001 ? 'up' : change < -0.0001 ? 'down' : 'flat';
  const delta = dir
    ? `<div class="delta ${dir}">${icon(dir)}${formatValue(change, p.changeUnit || 'pct', { signed: true })} <small>${escapeHtml(p.changeLabel || '')}</small></div>`
    : '';
  return `<div class="kpi"><div class="kpi-value">${sfx(formatValue(p.value, p.unit, { signed: p.signed }), p.suffix)}</div>${delta}</div>`;
}

function gaugeHtml(p) {
  const pct = Math.max(0, Math.min(100, ((p.value - p.min) / (p.max - p.min)) * 100));
  return `<div class="gauge">
    <div class="gauge-row"><span class="gauge-value">${formatValue(p.value, 'count')}</span><span class="gauge-label">${escapeHtml(p.label || '')}</span></div>
    <div class="gauge-track" role="meter" aria-valuemin="${p.min}" aria-valuemax="${p.max}" aria-valuenow="${p.value}" aria-label="${escapeHtml(p.title)}">
      <span class="gauge-marker" style="left:${pct}%"></span>
    </div>
    <div class="gauge-scale"><span>Strach</span><span>Neutralnie</span><span>Chciwość</span></div>
  </div>`;
}

function metersHtml(p) {
  const items = p.meters.map((m) => {
    const ratio = m.limit ? Math.min(1, (m.used ?? 0) / m.limit) : null;
    const cls = ratio == null ? '' : ratio >= 0.9 ? 'crit' : ratio >= 0.75 ? 'warn' : '';
    const value = `${formatValue(m.used, 'count', { compact: false })}${m.limit ? ` / ${formatValue(m.limit, 'count', { compact: false })}` : ''}`;
    return `<div>
      <div class="meter-head"><span>${escapeHtml(m.label)}</span><span>${value}</span></div>
      ${ratio != null ? `<div class="meter-track"><div class="meter-fill ${cls}" style="width:${(ratio * 100).toFixed(1)}%"></div></div>` : ''}
      ${m.hint ? `<div class="meter-hint">${escapeHtml(m.hint)}</div>` : ''}
    </div>`;
  }).join('');
  return `<div class="meters">${items}</div>${p.footnote ? `<p class="card-note">${escapeHtml(p.footnote)}</p>` : ''}`;
}

export function tableHtml(p) {
  if (p.type === 'categorical') {
    const extraLabels = [...new Set(p.rows.flatMap((r) => (r.extra || []).map((e) => e.label)))].filter((l) => l !== p.valueLabel);
    const head = `<tr><th>#</th><th>Nazwa</th><th>${escapeHtml(p.valueLabel || 'Wartość')}</th>${extraLabels.map((l) => `<th>${escapeHtml(l)}</th>`).join('')}</tr>`;
    const cell = (value, unit, signed, suffix = '') => {
      const cls = signed && value != null ? (value > 0 ? 'num-pos' : value < 0 ? 'num-neg' : '') : '';
      return `<td class="${cls}">${sfx(formatValue(value, unit, { signed, compact: unit !== 'money' || Math.abs(value) >= 1e9 }), suffix)}</td>`;
    };
    const body = p.rows.map((r, i) => {
      const extras = extraLabels.map((l) => {
        const e = (r.extra || []).find((x) => x.label === l);
        return e ? cell(e.value, e.unit, e.unit === 'pct' && /zmiana/i.test(l)) : '<td>—</td>';
      }).join('');
      return `<tr><td>${i + 1}</td><td class="name">${escapeHtml(r.name || r.label)}</td>${cell(r.value, p.unit, p.polarity, p.suffix)}${extras}</tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="data"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  if (p.type === 'timeseries') {
    const times = [...new Set(p.series.flatMap((s) => s.points.map(([ts]) => ts)))].sort((a, b) => b - a).slice(0, 500);
    const lookup = p.series.map((s) => new Map(s.points));
    const head = `<tr><th>#</th><th>Data</th>${p.series.map((s) => `<th>${escapeHtml(s.name)}</th>`).join('')}</tr>`;
    const body = times.map((ts, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(formatDate(ts, true))}</td>${lookup.map((m) => `<td>${sfx(formatValue(m.get(ts), p.unit, { signed: p.zeroLine }), p.suffix)}</td>`).join('')}</tr>`).join('');
    return `<div class="table-wrap"><table class="data"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  return '';
}

function stateHtml(kind, title, detail = '') {
  return `<div class="state ${kind}">${kind === 'loading' ? '<div class="spinner"></div>' : ''}<strong>${escapeHtml(title)}</strong>${detail ? `<span class="small">${detail}</span>` : ''}</div>`;
}

export function loadingHtml() {
  return stateHtml('loading', 'Ładowanie danych…');
}

export function errorHtml(err) {
  const hint = err.paidPlanRequired
    ? 'Ten wykres korzysta z endpointu dostępnego od planu Hobbyist. Na darmowym planie użyj wykresów z grupy „Historia (lokalne snapshoty)”.'
    : err.code ? `Kod błędu: <code>${escapeHtml(err.code)}</code>` : '';
  return stateHtml('error', err.message || 'Nie udało się pobrać danych.', hint);
}

// ------------------------------------------------------------------ render

function chartHeight(payload, chart, size) {
  if (chart === 'hbar') return Math.max(200, payload.rows.length * 26 + 40);
  if (chart === 'treemap') return size === 'l' ? 440 : 360;
  if (chart === 'donut') return 260;
  if (chart === 'column') return 280;
  return size === 'l' ? 340 : 300;
}

function isEmpty(payload) {
  if (payload.type === 'categorical') return !payload.rows.length;
  if (payload.type === 'timeseries') return !payload.series.some((s) => s.points.length);
  return false;
}

// Suwak zakresu pod osią czasu – przy wykresach, które mają z czego wybierać.
const hasSlider = (payload) => payload.type === 'timeseries' && payload.series.some((s) => s.points.length > 20);

function extentOf(payload) {
  let min = Infinity;
  let max = -Infinity;
  for (const s of payload.series) {
    if (!s.points.length) continue;
    min = Math.min(min, s.points[0][0]);
    max = Math.max(max, s.points.at(-1)[0]);
  }
  return [min, max];
}

// Pionowy suwak po lewej: zakres wartości osi Y (od–do).
function yZoomOption(t, payload, yRange, grid) {
  return {
    type: 'slider', yAxisIndex: 0, orient: 'vertical', left: 6, width: 16, top: grid.top + 14, bottom: grid.bottom + 14,
    filterMode: 'none', showDataShadow: false, brushSelect: false,
    ...(yRange ? { startValue: yRange.start, endValue: yRange.end } : { start: 0, end: 100 }),
    labelFormatter: (v) => sfx(formatAxis(v, payload.unit), payload.suffix),
    textStyle: { color: t.muted, fontSize: 10 },
    borderColor: t.axis, backgroundColor: 'transparent', fillerColor: `${t.series[0]}22`,
    handleStyle: { color: t.surface, borderColor: t.series[0], borderWidth: 1.5 },
    moveHandleStyle: { color: t.series[0], opacity: 0.35 }, moveHandleSize: 5,
  };
}

function zoomOption(t, range, left) {
  const window = range ? { startValue: range.start, endValue: range.end } : { start: 0, end: 100 };
  return [
    {
      // Daty przy uchwytach wyświetlają się obok suwaka, więc zostawiamy na nie miejsce.
      type: 'slider', xAxisIndex: 0, bottom: 8, height: 26, left: Math.max(left, 78), right: 78,
      ...window, filterMode: 'filter',
      labelFormatter: (v) => formatDate(v),
      textStyle: { color: t.muted, fontSize: 11 },
      borderColor: t.axis, backgroundColor: 'transparent',
      fillerColor: `${t.series[0]}22`,
      dataBackground: { lineStyle: { color: t.axis, width: 1 }, areaStyle: { color: t.grid, opacity: 0.6 } },
      selectedDataBackground: { lineStyle: { color: t.series[0], width: 1 }, areaStyle: { color: t.series[0], opacity: 0.15 } },
      handleStyle: { color: t.surface, borderColor: t.series[0], borderWidth: 1.5 },
      moveHandleStyle: { color: t.series[0], opacity: 0.35 },
      emphasis: { handleStyle: { borderColor: t.series[0] }, moveHandleStyle: { opacity: 0.6 } },
    },
    // Ctrl + kółko myszy przybliża, przeciąganie po wykresie przesuwa okno.
    { type: 'inside', xAxisIndex: 0, filterMode: 'filter', zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false, moveOnMouseMove: true },
  ];
}

const noop = { dispose() {}, getRange: () => null, setRange() {}, setLocked() {} };

/**
 * Rysuje dane w kontenerze. Zwraca uchwyt: dispose(), getRange(), setRange(range), setLocked(bool).
 * view: typ wykresu (hbar, treemap, line…) albo 'table'.
 * range: zakres osi czasu { start, end } w ms albo null = widok domyślny wykresu (payload.defaultStart).
 * locked: wykres nie reaguje na suwaki innych wykresów. onRange(range): zakres zmieniony przez użytkownika.
 * sync: udział we wspólnym kursorze i zakresie (podgląd w konfiguratorze – nie).
 */
export function renderPayload(container, payload, view, { size = 'm', range = null, locked = false, onRange = null, yRange = null, onYRange = null, sync = true } = {}) {
  container.innerHTML = '';
  const note = payload.note ? `<p class="card-note">${escapeHtml(payload.note)}</p>` : '';

  if (payload.type === 'kpi') {
    container.innerHTML = kpiHtml(payload);
    return noop;
  }
  if (payload.type === 'gauge') {
    container.innerHTML = gaugeHtml(payload);
    return noop;
  }
  if (payload.type === 'meters') {
    container.innerHTML = metersHtml(payload);
    return noop;
  }
  if (isEmpty(payload)) {
    const h = payload.history;
    const detail = payload.type === 'timeseries' && h
      ? (h.enabled
        ? `Serwer zapisuje snapshot rynku co ${h.intervalMinutes} min – wykres wypełni się po kolejnych zapisach.`
        : 'Snapshoty są wyłączone (SNAPSHOT_INTERVAL_MINUTES=0 w .env).')
      : '';
    container.innerHTML = stateHtml('empty', 'Brak danych do pokazania', detail);
    return noop;
  }
  if (view === 'table') {
    container.innerHTML = tableHtml(payload) + note;
    return noop;
  }

  const t = tokens();
  const el = document.createElement('div');
  el.className = 'chart';
  const slider = hasSlider(payload) && ['line', 'area'].includes(view);
  el.style.height = `${chartHeight(payload, view, size) + (slider ? 46 : 0)}px`;
  container.appendChild(el);
  if (note) container.insertAdjacentHTML('beforeend', note);

  let option;
  switch (view) {
    case 'hbar': option = hbarOption(payload, t, el.clientWidth); break;
    case 'column': option = columnOption(payload, t); break;
    case 'treemap': option = treemapOption(payload, t, size); break;
    case 'donut': option = donutOption(payload, t); break;
    case 'area': option = lineOption(payload, t, true); break;
    case 'line': option = lineOption(payload, t, false); break;
    default:
      option = payload.type === 'timeseries' ? lineOption(payload, t, false) : hbarOption(payload, t, el.clientWidth);
  }

  const [minT, maxT] = payload.type === 'timeseries' ? extentOf(payload) : [0, 0];
  const defaultRange = payload.defaultStart && payload.defaultStart > minT ? { start: payload.defaultStart, end: maxT } : null;
  if (slider) {
    option.grid.left += 30;
    option.dataZoom = [...zoomOption(t, range || defaultRange, option.grid.left), yZoomOption(t, payload, yRange, option.grid)];
  }
  else if (option.grid && Array.isArray(option.xAxis)) option.grid.bottom = 28;

  const chart = echarts.init(el, null, { renderer: 'canvas' });
  chart.setOption(option);
  const ro = new ResizeObserver(() => chart.resize());
  ro.observe(el);

  const isTime = payload.type === 'timeseries' && Array.isArray(option.xAxis);
  const entry = { chart, series: (payload.series || []).slice(0, 8), slider, locked, defaultRange };

  entry.getRange = () => {
    if (!slider) return null;
    const dz = chart.getOption().dataZoom?.[0];
    if (!dz) return null;
    const start = dz.startValue ?? minT + ((maxT - minT) * dz.start) / 100;
    const end = dz.endValue ?? minT + ((maxT - minT) * dz.end) / 100;
    return { start: Math.round(start), end: Math.round(end) };
  };
  // Kreski tygodni dopasowane do widocznego okresu.
  const refreshWeeks = () => {
    if (!isTime || !Number.isFinite(minT)) return;
    const r = entry.getRange() || { start: minT, end: maxT };
    const weeks = r.end - r.start <= WEEKS_MAX_SPAN ? weekStarts(r.start, r.end) : [];
    chart.setOption({ xAxis: [{}, { min: r.start, max: r.end, axisTick: { customValues: weeks } }] });
  };
  entry.setRange = (r) => {
    if (!slider) return;
    const target = r || defaultRange;
    zoomSyncing = true;
    try {
      chart.dispatchAction(target ? { type: 'dataZoom', dataZoomIndex: 0, startValue: target.start, endValue: target.end } : { type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
    } finally {
      zoomSyncing = false;
    }
    refreshWeeks();
  };
  refreshWeeks();

  if (slider) {
    let frame = 0;
    const userZoom = (r) => {
      if (entry.locked || !sync) {
        onRange?.(r);
        return;
      }
      // Wspólny zakres: przesuń wszystkie niezablokowane wykresy w czasie.
      for (const other of timeCharts) if (other !== entry && !other.locked) other.setRange(r);
      onRange?.(r);
    };
    const yOf = () => {
      const dz = chart.getOption().dataZoom?.[2];
      if (!dz || (dz.start <= 0.01 && dz.end >= 99.99)) return null;
      return dz.startValue != null ? { start: dz.startValue, end: dz.endValue } : null;
    };
    let lastX = JSON.stringify(entry.getRange());
    let lastY = JSON.stringify(yOf());
    chart.on('datazoom', () => {
      if (zoomSyncing) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = entry.getRange();
        const y = yOf();
        if (JSON.stringify(x) !== lastX) {
          lastX = JSON.stringify(x);
          refreshWeeks();
          userZoom(x);
        }
        if (JSON.stringify(y) !== lastY) {
          lastY = JSON.stringify(y);
          onYRange?.(y);
        }
      });
    });
    // Podwójne kliknięcie wraca do widoku domyślnego (czas – dla niezablokowanych wszystkich; wartości – tego wykresu).
    chart.getZr().on('dblclick', () => {
      entry.setRange(null);
      userZoom(null);
      chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 2, start: 0, end: 100 });
    });
  }

  const unsync = isTime && sync ? syncTime(entry) : () => {};
  return {
    dispose() {
      unsync();
      ro.disconnect();
      chart.dispose();
    },
    getRange: entry.getRange,
    setRange: entry.setRange,
    setLocked(value) {
      entry.locked = value;
    },
  };
}

// ------------------------------------------------------------------ wspólny kursor czasu
// Najechanie na jeden wykres w czasie pokazuje ten sam moment na wszystkich pozostałych.

const timeCharts = new Set();
let syncing = false;
let zoomSyncing = false;

function nearestIndex(points, t) {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1][0] - t) <= Math.abs(points[lo][0] - t)) lo--;
  return lo;
}

function showMoment(entry, t) {
  const { chart, series } = entry;
  const s = series.findIndex((x) => x.points.length);
  if (s < 0) return;
  const points = series[s].points;
  const step = points.length > 1 ? (points.at(-1)[0] - points[0][0]) / (points.length - 1) : 0;
  if (t < points[0][0] - step || t > points.at(-1)[0] + step) {
    chart.dispatchAction({ type: 'hideTip' });
    chart.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' });
    return;
  }
  chart.dispatchAction({ type: 'showTip', seriesIndex: s, dataIndex: nearestIndex(points, t) });
}

function syncTime(entry) {
  const { chart } = entry;
  timeCharts.add(entry);
  chart.on('updateAxisPointer', (e) => {
    if (syncing) return;
    const t = e.axesInfo?.find((a) => a.axisDim === 'x' && !a.axisIndex)?.value;
    if (t == null) return;
    syncing = true;
    try {
      for (const other of timeCharts) if (other !== entry) showMoment(other, t);
    } finally {
      syncing = false;
    }
  });
  chart.on('globalout', () => {
    if (syncing) return;
    syncing = true;
    try {
      for (const other of timeCharts) {
        if (other === entry) continue;
        other.chart.dispatchAction({ type: 'hideTip' });
        other.chart.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' });
      }
    } finally {
      syncing = false;
    }
  });
  return () => timeCharts.delete(entry);
}
