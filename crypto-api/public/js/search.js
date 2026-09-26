import { api } from './api.js';
import { renderPayload, loadingHtml, errorHtml } from './charts.js';
import { escapeHtml, fold, formatValue, getCurrency } from './format.js';
import { icon, CHART_LABELS } from './icons.js';

// Wyszukiwarka wykresów: pole tekstowe + kategorie danych odpowiadające
// sekcjom CoinMarketCap API, a potem konfigurator z podglądem na żywo.

const PLAN_CHIP = {
  free: '<span class="chip free">darmowy plan</span>',
  paid: '<span class="chip paid">plan płatny (Hobbyist+)</span>',
  local: '<span class="chip local">lokalne snapshoty</span>',
};
// Plan płatny, ale endpoint już odpowiedział na Twoim kluczu – pokazujemy, że działa.
const planChip = (ds) => (ds.plan === 'paid' && ds.available ? '<span class="chip free">działa z Twoim kluczem</span>' : PLAN_CHIP[ds.plan] || '');
const GROUP_KIND_LABEL = { sectors: 'Sektor', ecosystems: 'Ekosystem', portfolios: 'Portfel VC', other: 'Kategoria' };
const SIZE_LABELS = { s: 'Mały', m: 'Średni', l: 'Pełna szerokość' };

let ctx = null;
let catalog = null;
let entries = [];
let activeGroup = 'all';
let dynamicEntries = [];
let queryToken = 0;
let config = null;
let previewHandle = null;
let previewTimer = null;
let previewToken = 0;

const $ = (sel) => document.querySelector(sel);

export function initSearch(options) {
  ctx = options;
  const dialog = $('#search');
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) closeSearch();
  });
  dialog.addEventListener('close', disposePreview);
  $('#search-input').addEventListener('input', onQuery);
  $('#search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = currentResults()[0];
      if (first) choose(first, first.configure);
    }
  });
  $('#config-back').addEventListener('click', showSearchView);
  $('#config-submit').addEventListener('click', submitConfig);
}

export function setCatalog(value) {
  catalog = value;
  entries = [];
  for (const ds of catalog.datasets) {
    ds.presets.forEach((preset, i) => {
      entries.push({
        key: `${ds.id}#${i}`,
        dataset: ds,
        title: preset.title,
        description: preset.description || ds.description,
        params: { ...defaults(ds), ...(preset.params || {}) },
        chart: preset.chart || ds.charts[0],
        configure: !!preset.configure,
        keywords: preset.keywords || '',
      });
    });
  }
  for (const e of entries) e.haystack = fold([e.title, e.description, e.keywords, e.dataset.title, groupName(e.dataset.group), e.dataset.endpoint].join(' '));
}

function defaults(ds) {
  return Object.fromEntries(ds.params.map((p) => [p.key, structuredClone(p.default)]));
}

const groupName = (id) => catalog.groups.find((g) => g.id === id)?.name || id;
const datasetById = (id) => catalog.datasets.find((d) => d.id === id);

// ------------------------------------------------------------------ wyszukiwarka

export function openSearch({ group = 'all', query = '' } = {}) {
  activeGroup = group;
  const input = $('#search-input');
  input.value = query;
  dynamicEntries = [];
  showSearchView();
  const dialog = $('#search');
  if (!dialog.open) dialog.showModal();
  onQuery();
  input.focus();
  // Załaduj listę kategorii w tle – potrzebna do wyszukiwania sektorów po nazwie.
  api.categories().catch(() => {});
}

function closeSearch() {
  $('#search').close();
}

function showSearchView() {
  $('#search-view').hidden = false;
  $('#config-view').hidden = true;
  $('#search-title').textContent = 'Dodaj wykres';
  disposePreview();
  config = null;
}

function tokens() {
  return fold($('#search-input').value).split(/\s+/).filter(Boolean);
}

// Każde słowo zapytania musi pasować do początku jakiegoś słowa w opisie wykresu
// ("ai" trafia w "(AI)", ale nie w "Chain").
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordStarts = (text, word) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}`).test(text);

function matches(entry, words) {
  return words.every((w) => wordStarts(entry.haystack, w));
}

function currentResults() {
  const words = tokens();
  const all = [...dynamicEntries, ...entries.filter((e) => matches(e, words))];
  return activeGroup === 'all' ? all : all.filter((e) => e.dataset.group === activeGroup);
}

async function onQuery() {
  const raw = $('#search-input').value.trim();
  const token = ++queryToken;
  renderGroups();
  renderResults();
  if (raw.length < 2) {
    if (dynamicEntries.length) {
      dynamicEntries = [];
      renderGroups();
      renderResults();
    }
    return;
  }
  const q = fold(raw);
  const [cats, coins] = await Promise.all([
    api.categories().catch(() => []),
    api.searchCoins(raw, 4).catch(() => []),
  ]);
  if (token !== queryToken) return;
  dynamicEntries = [
    ...cats.filter((c) => q.split(/\s+/).every((w) => wordStarts(fold(c.name), w))).slice(0, 4).flatMap(categoryEntries),
    ...coins.flatMap(coinEntries),
  ];
  renderGroups();
  renderResults();
}

function dynamicEntry(datasetId, title, params, chart, keywords = '') {
  const ds = datasetById(datasetId);
  if (!ds) return [];
  return [{
    key: `${datasetId}:${title}`,
    dataset: ds,
    title,
    description: ds.description,
    params: { ...defaults(ds), ...params },
    chart: chart || ds.charts[0],
    configure: false,
    dynamic: true,
    haystack: fold(`${title} ${keywords}`),
  }];
}

function categoryEntries(c) {
  const kind = GROUP_KIND_LABEL[c.group] || 'Kategoria';
  return [
    ...dynamicEntry('sectors.coins', `${kind} ${c.name}: top monety`, { category: c.id }),
    ...dynamicEntry('sectors.coins', `${kind} ${c.name}: mapa monet`, { category: c.id, limit: 30 }, 'treemap'),
    ...dynamicEntry('history.sectors', `${kind} ${c.name}: kapitalizacja w czasie`, { categories: [c.id], metric: 'market_cap', mode: 'absolute' }),
  ];
}

function coinEntries(c) {
  const name = `${c.name} (${c.symbol})`;
  return [
    ...dynamicEntry('coin.kpi', `${name}: cena`, { coin: c.id, metric: 'price' }),
    ...dynamicEntry('coin.performance', `${name}: zmiany ceny 1h–90d`, { coin: c.id }),
    ...dynamicEntry('history.coins', `${name}: cena w czasie`, { coins: [c.id], metric: 'price', mode: 'absolute' }),
    ...dynamicEntry('cmc.coin_history', `${name}: historia CMC`, { coins: [c.id] }),
  ];
}

function renderGroups() {
  const words = tokens();
  const pool = [...dynamicEntries, ...entries.filter((e) => matches(e, words))];
  const count = (id) => (id === 'all' ? pool.length : pool.filter((e) => e.dataset.group === id).length);
  const groups = [{ id: 'all', name: 'Wszystkie', endpoints: ['cały katalog'] }, ...catalog.groups];
  $('#search-groups').innerHTML = groups.map((g) => `
    <button type="button" class="group-btn" data-group="${g.id}" aria-current="${g.id === activeGroup}">
      <span class="name">${escapeHtml(g.name)}</span>
      <span class="count">${count(g.id)}</span>
      <span class="endpoint" title="${escapeHtml(g.endpoints.join(', '))}">${escapeHtml(g.endpoints[0])}${g.endpoints.length > 1 ? ` +${g.endpoints.length - 1}` : ''}</span>
    </button>`).join('');
  $('#search-groups').querySelectorAll('.group-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeGroup = btn.dataset.group;
      renderGroups();
      renderResults();
    });
  });
}

function highlight(text, words) {
  const folded = fold(text);
  const marks = [];
  for (const w of words) {
    const m = new RegExp(`(^|[^a-z0-9])${escapeRegExp(w)}`).exec(folded);
    const at = m ? m.index + m[1].length : -1;
    if (at >= 0 && !marks.some(([a, b]) => at < b && at + w.length > a)) marks.push([at, at + w.length]);
  }
  marks.sort((a, b) => a[0] - b[0]);
  let out = '';
  let pos = 0;
  for (const [a, b] of marks) {
    out += `${escapeHtml(text.slice(pos, a))}<mark>${escapeHtml(text.slice(a, b))}</mark>`;
    pos = b;
  }
  return out + escapeHtml(text.slice(pos));
}

function renderResults() {
  const words = tokens();
  const results = currentResults();
  const group = catalog.groups.find((g) => g.id === activeGroup);
  const summary = $('#search-summary');
  summary.textContent = results.length
    ? `${results.length} ${results.length === 1 ? 'wykres' : results.length < 5 ? 'wykresy' : 'wykresów'}${words.length ? ` dla „${$('#search-input').value.trim()}”` : ''}`
    : 'Brak wyników. Spróbuj: kapitalizacja, wolumen, AI, DeFi, bitcoin, fear.';

  const intro = group && !words.length
    ? `<li class="group-intro">${escapeHtml(group.description)}<br><span class="small">Endpointy: ${group.endpoints.map((e) => `<code>${escapeHtml(e)}</code>`).join(', ')}</span></li>`
    : '';

  $('#search-list').innerHTML = intro + results.map((e, i) => {
    const ds = e.dataset;
    const blocked = ds.unavailable ? `<span class="chip blocked" title="${escapeHtml(ds.unavailable)}">niedostępne dla Twojego klucza</span>` : '';
    return `<li class="result" data-index="${i}">
      <div class="result-icon">${icon(e.chart)}</div>
      <div>
        <h3>${highlight(e.title, words)}</h3>
        <p>${escapeHtml(e.description)}</p>
        <div class="result-meta">
          ${activeGroup === 'all' ? `<span class="chip">${escapeHtml(groupName(ds.group))}</span>` : ''}
          <span class="chip">${escapeHtml(CHART_LABELS[e.chart] || e.chart)}</span>
          ${planChip(ds)}${blocked}
          <span class="chip mono">${escapeHtml(ds.endpoint)}</span>
        </div>
      </div>
      <div class="result-actions">
        ${e.configure ? '' : '<button type="button" class="btn small" data-act="add">Dodaj</button>'}
        <button type="button" class="btn small ${e.configure ? 'primary' : 'ghost'}" data-act="configure">${e.configure ? 'Wybierz…' : 'Dostosuj'}</button>
      </div>
    </li>`;
  }).join('');

  $('#search-list').querySelectorAll('.result').forEach((li) => {
    const entry = results[Number(li.dataset.index)];
    li.querySelector('[data-act="add"]')?.addEventListener('click', () => choose(entry, false));
    li.querySelector('[data-act="configure"]').addEventListener('click', () => choose(entry, true));
  });
}

function choose(entry, configure) {
  const widget = {
    dataset: entry.dataset.id,
    params: structuredClone(entry.params),
    chart: entry.chart,
    size: entry.dataset.size,
    title: '',
  };
  if (configure) {
    openConfigurator(widget, { mode: 'add' });
  } else {
    ctx.onAdd(widget);
    closeSearch();
  }
}

// ------------------------------------------------------------------ konfigurator

export function openConfigurator(widget, { mode = 'add', id = null } = {}) {
  const ds = datasetById(widget.dataset);
  if (!ds) return;
  config = { mode, id, ds, widget: structuredClone(widget) };
  const dialog = $('#search');
  if (!dialog.open) dialog.showModal();
  $('#search-view').hidden = true;
  $('#config-view').hidden = false;
  $('#config-back').hidden = mode === 'edit';
  $('#search-title').textContent = mode === 'edit' ? 'Ustawienia wykresu' : 'Dostosuj wykres';
  $('#config-submit').textContent = mode === 'edit' ? 'Zapisz zmiany' : 'Dodaj do dashboardu';
  $('#config-meta').innerHTML = `
    <h3>${escapeHtml(ds.title)}</h3>
    <p>${escapeHtml(ds.description)}</p>
    <div class="result-meta">
      <span class="chip">${escapeHtml(groupName(ds.group))}</span>${planChip(ds)}
      <span class="chip mono">${escapeHtml(ds.endpoint)}</span>
    </div>`;
  buildForm();
  schedulePreview(0);
}

function buildForm() {
  const { ds, widget } = config;
  const form = $('#config-form');
  form.innerHTML = '';
  form.onsubmit = (e) => e.preventDefault();

  const title = fieldWrap('Tytuł (opcjonalnie)');
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = widget.title || '';
  titleInput.placeholder = 'Automatyczny – na podstawie ustawień';
  titleInput.maxLength = 120;
  titleInput.addEventListener('input', () => { widget.title = titleInput.value; });
  title.appendChild(titleInput);
  form.appendChild(title);

  for (const spec of ds.params) {
    const field = paramField(spec);
    if (spec.showIf) field.dataset.showIf = JSON.stringify(spec.showIf);
    form.appendChild(field);
  }
  updateVisibility();

  if (ds.charts.length > 1) {
    form.appendChild(segmented('Typ wykresu', 'chart', ds.charts.map((c) => [c, CHART_LABELS[c] || c, icon(c)]), widget.chart, (v) => {
      widget.chart = v;
      schedulePreview(0);
    }));
  }
  form.appendChild(segmented('Rozmiar na dashboardzie', 'size', Object.entries(SIZE_LABELS).map(([k, l]) => [k, l]), widget.size, (v) => {
    widget.size = v;
  }));
}

// Pola zależne (np. okno pomiaru) pokazujemy tylko, gdy mają znaczenie.
function updateVisibility() {
  const params = config?.widget.params || {};
  document.querySelectorAll('#config-form [data-show-if]').forEach((el) => {
    const rule = JSON.parse(el.dataset.showIf);
    el.hidden = !Object.entries(rule).every(([key, values]) => values.includes(String(params[key])));
  });
}

function fieldWrap(label, tag = 'label') {
  const el = document.createElement(tag);
  el.className = 'field';
  const span = document.createElement(tag === 'fieldset' ? 'legend' : 'span');
  span.textContent = label;
  el.appendChild(span);
  return el;
}

function segmented(label, name, options, value, onChange) {
  const fs = fieldWrap(label, 'fieldset');
  const wrap = document.createElement('div');
  wrap.className = 'seg';
  for (const [val, text, ico] of options) {
    const l = document.createElement('label');
    l.innerHTML = `<input type="radio" name="${name}" value="${val}" ${val === value ? 'checked' : ''}>${ico || ''}${escapeHtml(text)}`;
    l.querySelector('input').addEventListener('change', () => onChange(val));
    wrap.appendChild(l);
  }
  fs.appendChild(wrap);
  return fs;
}

function paramField(spec) {
  const { widget } = config;
  const params = widget.params;
  const update = (value) => {
    params[spec.key] = value;
    updateVisibility();
    schedulePreview();
  };

  if (spec.type === 'select') {
    const f = fieldWrap(spec.label);
    const sel = document.createElement('select');
    sel.innerHTML = spec.options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
    sel.value = String(params[spec.key] ?? spec.default);
    sel.addEventListener('change', () => update(sel.value));
    f.appendChild(sel);
    return f;
  }
  if (spec.type === 'number') {
    const f = fieldWrap(`${spec.label} (${spec.min}–${spec.max})`);
    const input = document.createElement('input');
    Object.assign(input, { type: 'number', min: spec.min, max: spec.max, step: 1, value: params[spec.key] ?? spec.default });
    input.addEventListener('input', () => {
      const n = Number(input.value);
      if (Number.isFinite(n) && n >= spec.min && n <= spec.max) update(n);
    });
    f.appendChild(input);
    return f;
  }
  if (spec.type === 'boolean') {
    const l = document.createElement('label');
    l.className = 'check';
    l.innerHTML = `<input type="checkbox" ${params[spec.key] ? 'checked' : ''}> ${escapeHtml(spec.label)}`;
    l.querySelector('input').addEventListener('change', (e) => update(e.target.checked));
    return l;
  }
  if (spec.type === 'category' || spec.type === 'categories') {
    const multiple = spec.type === 'categories';
    return picker({
      label: spec.label,
      multiple,
      max: 8,
      value: multiple ? params[spec.key] || [] : params[spec.key] ? [params[spec.key]] : [],
      placeholder: 'Szukaj kategorii: AI, DeFi, Layer 1…',
      search: async (q) => {
        const cats = await api.categories();
        const f = fold(q);
        return cats.filter((c) => !f || fold(c.name).includes(f)).slice(0, 60).map((c) => ({
          id: c.id, label: c.name, meta: `${GROUP_KIND_LABEL[c.group] || ''} · ${formatValue(c.marketCap, 'money')}`,
        }));
      },
      resolve: async (ids) => {
        const cats = await api.categories();
        return ids.map((id) => ({ id, label: cats.find((c) => c.id === id)?.name || id }));
      },
      onChange: (ids) => update(multiple ? ids : ids[0] ?? null),
    });
  }
  if (spec.type === 'coin' || spec.type === 'coins') {
    const multiple = spec.type === 'coins';
    return picker({
      label: spec.label,
      multiple,
      max: spec.max || 8,
      value: multiple ? params[spec.key] || [] : params[spec.key] ? [params[spec.key]] : [],
      placeholder: 'Szukaj: bitcoin, SOL, pepe…',
      search: async (q) => (await api.searchCoins(q, 15)).map((c) => ({ id: c.id, label: `${c.name} (${c.symbol})`, meta: c.rank ? `#${c.rank}` : '' })),
      resolve: async (ids) => {
        const found = await api.coinsByIds(ids);
        return ids.map((id) => {
          const c = found.find((x) => x.id === id);
          return { id, label: c ? `${c.name} (${c.symbol})` : `#${id}` };
        });
      },
      onChange: (ids) => update(multiple ? ids : ids[0] ?? null),
    });
  }
  return document.createElement('div');
}

function picker({ label, multiple, max, value, placeholder, search, resolve, onChange }) {
  const f = fieldWrap(label, 'div');
  const wrap = document.createElement('div');
  wrap.className = 'picker';
  wrap.innerHTML = `<div class="picker-chips"></div><input type="search" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(label)}"><div class="picker-list" role="listbox" aria-multiselectable="${multiple}"></div>`;
  f.appendChild(wrap);
  const chips = wrap.querySelector('.picker-chips');
  const input = wrap.querySelector('input');
  const list = wrap.querySelector('.picker-list');
  let selected = [];
  let token = 0;
  let timer = null;

  const renderChips = () => {
    chips.innerHTML = selected.map((s, i) => `<span class="chip">${escapeHtml(s.label)}${multiple || selected.length ? `<button type="button" data-i="${i}" aria-label="Usuń ${escapeHtml(s.label)}">${icon('x')}</button>` : ''}</span>`).join('')
      || '<span class="small muted">Nic nie wybrano – użyta zostanie wartość domyślna.</span>';
    chips.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      selected.splice(Number(b.dataset.i), 1);
      renderChips();
      refresh();
      onChange(selected.map((s) => s.id));
    }));
  };

  const refresh = async () => {
    const t = ++token;
    let items = [];
    try {
      items = await search(input.value.trim());
    } catch (err) {
      list.innerHTML = `<div class="picker-empty">${escapeHtml(err.message)}</div>`;
      return;
    }
    if (t !== token) return;
    list.innerHTML = items.length
      ? items.map((it, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${selected.some((s) => s.id === it.id)}"><span>${escapeHtml(it.label)}</span><span class="meta">${escapeHtml(it.meta || '')}</span></button>`).join('')
      : '<div class="picker-empty">Brak wyników.</div>';
    list.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const it = items[Number(b.dataset.i)];
      const at = selected.findIndex((s) => s.id === it.id);
      if (multiple) {
        if (at >= 0) selected.splice(at, 1);
        else if (selected.length < max) selected.push({ id: it.id, label: it.label });
      } else {
        selected = [{ id: it.id, label: it.label }];
      }
      renderChips();
      refresh();
      onChange(selected.map((s) => s.id));
    }));
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 180);
  });

  resolve(value).then((items) => {
    selected = items;
    renderChips();
  }).catch(() => renderChips());
  renderChips();
  refresh();
  return f;
}

function schedulePreview(delay = 350) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, delay);
}

async function renderPreview() {
  if (!config) return;
  const box = $('#config-preview');
  const token = ++previewToken;
  if (!previewHandle) box.innerHTML = `<div class="card-body">${loadingHtml()}</div>`;
  else box.querySelector('.card-body')?.classList.add('loading');
  try {
    const payload = await api.data(config.ds.id, config.widget.params, getCurrency());
    if (token !== previewToken || !config) return;
    disposePreview();
    box.innerHTML = `<div class="card-head"><div class="card-titles"><h2>${escapeHtml(config.widget.title || payload.title || config.ds.title)}</h2></div></div><div class="card-body"></div>`;
    previewHandle = renderPayload(box.querySelector('.card-body'), payload, config.widget.chart, { size: 'm' });
  } catch (err) {
    if (token !== previewToken) return;
    disposePreview();
    box.innerHTML = `<div class="card-body">${errorHtml(err)}</div>`;
  }
}

function disposePreview() {
  previewHandle?.dispose();
  previewHandle = null;
}

function submitConfig() {
  if (!config) return;
  const { mode, id, widget } = config;
  if (mode === 'edit') ctx.onUpdate(id, widget);
  else ctx.onAdd(widget);
  closeSearch();
}
