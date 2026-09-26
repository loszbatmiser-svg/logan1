import { api } from './api.js';
import { renderPayload, loadingHtml, errorHtml } from './charts.js';
import { escapeHtml, formatTime, formatValue, setCurrency } from './format.js';
import { icon, CHART_LABELS } from './icons.js';
import { initSearch, openConfigurator, openSearch, setCatalog } from './search.js';

const state = {
  catalog: null,
  dashboard: null,
  status: null,
  cards: new Map(),
  refreshTimer: null,
};

const $ = (sel) => document.querySelector(sel);
const grid = $('#grid');
const SIZES = ['s', 'm', 'l'];
const SIZE_NAMES = { s: 'mały', m: 'średni', l: 'pełna szerokość' };

const datasetById = (id) => state.catalog.datasets.find((d) => d.id === id);
const uid = () => `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// ------------------------------------------------------------------ zapis układu

let saveTimer = null;
function saveDashboard() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await api.saveDashboard(state.dashboard);
    } catch (err) {
      toast(`Nie udało się zapisać układu: ${err.message}`);
    }
  }, 300);
}

// ------------------------------------------------------------------ karty

function sourceLabel(payload, ds, short) {
  if (ds.plan === 'local') {
    const h = payload?.history;
    return h?.last ? `Snapshoty lokalne · ostatni ${formatTime(h.last)}` : 'Snapshoty lokalne';
  }
  const time = payload?.updatedAt ? ` · ${formatTime(payload.updatedAt)}` : '';
  // Endpointy CoinMarketCap zaczynają się od "/", pozostałe źródła mają nazwę na początku.
  const cmcSource = ds.endpoint.startsWith('/');
  const source = cmcSource ? 'CMC' : ds.endpoint.split(' ')[0];
  return `${short ? source : cmcSource ? `CMC ${ds.endpoint}` : ds.endpoint}${time}`;
}

function createCard(widget) {
  const ds = datasetById(widget.dataset);
  const el = document.createElement('section');
  el.className = `card size-${widget.size}`;
  el.dataset.id = widget.id;
  const views = ds.charts;
  const tableable = !['kpi', 'gauge', 'meters'].includes(views[0]);
  el.innerHTML = `
    <header class="card-head">
      <span class="drag-handle" draggable="true" title="Przeciągnij, aby zmienić kolejność">${icon('grip')}</span>
      <div class="card-titles"><h2></h2><p></p></div>
      <div class="card-tools">
        ${views.length > 1 ? `<select data-act="chart" aria-label="Typ wykresu">${views.map((v) => `<option value="${v}">${CHART_LABELS[v] || v}</option>`).join('')}</select>` : ''}
        ${tableable ? `<button type="button" data-act="table" aria-pressed="false" title="Pokaż dane w tabeli">${icon('table')}</button>` : ''}
        <button type="button" data-act="edit" title="Ustawienia wykresu">${icon('sliders')}</button>
        <button type="button" data-act="size" title="Zmień rozmiar">${icon('resize')}</button>
        <button type="button" data-act="remove" title="Usuń z dashboardu">${icon('x')}</button>
      </div>
    </header>
    <div class="card-body">${loadingHtml()}</div>`;

  const card = { el, widget, payload: null, handle: null, table: false, seq: 0, error: null };
  state.cards.set(widget.id, card);

  const select = el.querySelector('[data-act="chart"]');
  if (select) {
    select.value = widget.chart;
    select.addEventListener('change', () => {
      widget.chart = select.value;
      card.table = false;
      drawCard(card);
      saveDashboard();
    });
  }
  el.querySelector('[data-act="table"]')?.addEventListener('click', () => {
    card.table = !card.table;
    drawCard(card);
  });
  el.querySelector('[data-act="edit"]').addEventListener('click', () => openConfigurator(widget, { mode: 'edit', id: widget.id }));
  el.querySelector('[data-act="size"]').addEventListener('click', () => {
    widget.size = SIZES[(SIZES.indexOf(widget.size) + 1) % SIZES.length];
    el.className = `card size-${widget.size}`;
    drawCard(card);
    saveDashboard();
    toast(`Rozmiar: ${SIZE_NAMES[widget.size]}`);
  });
  el.querySelector('[data-act="remove"]').addEventListener('click', () => removeWidget(widget.id));
  setupDrag(card);
  updateHeader(card);
  return card;
}

function updateHeader(card) {
  const ds = datasetById(card.widget.dataset);
  const title = card.widget.title || card.payload?.title || ds.title;
  card.el.querySelector('.card-titles h2').textContent = title;
  card.el.querySelector('.card-titles h2').title = title;
  const sub = card.el.querySelector('.card-titles p');
  const currency = card.payload?.unit === 'money' ? ` · ${state.dashboard.currency}` : '';
  sub.textContent = sourceLabel(card.payload, ds, card.widget.size === 's') + currency;
  sub.title = sourceLabel(card.payload, ds, false) + currency;
  const tableBtn = card.el.querySelector('[data-act="table"]');
  if (tableBtn) {
    tableBtn.setAttribute('aria-pressed', String(card.table));
    tableBtn.hidden = card.widget.chart === 'table';
  }
}

function drawCard(card) {
  const body = card.el.querySelector('.card-body');
  card.handle?.dispose();
  card.handle = null;
  body.classList.remove('loading');
  if (card.error && !card.payload) {
    body.innerHTML = errorHtml(card.error);
  } else if (card.payload) {
    const view = card.table ? 'table' : card.widget.chart;
    card.handle = renderPayload(body, card.payload, view, { size: card.widget.size });
    if (card.error) {
      body.insertAdjacentHTML('beforeend', `<p class="card-note">Nie udało się odświeżyć: ${escapeHtml(card.error.message)} Pokazuję ostatnie dane.</p>`);
    }
  }
  updateHeader(card);
}

async function loadCard(card) {
  const seq = ++card.seq;
  const body = card.el.querySelector('.card-body');
  if (card.payload) body.classList.add('loading');
  try {
    const payload = await api.data(card.widget.dataset, card.widget.params, state.dashboard.currency);
    if (seq !== card.seq) return;
    card.payload = payload;
    card.error = null;
  } catch (err) {
    if (seq !== card.seq) return;
    card.error = err;
  }
  drawCard(card);
}

function renderAll() {
  for (const card of state.cards.values()) card.handle?.dispose();
  state.cards.clear();
  grid.innerHTML = '';
  for (const widget of state.dashboard.widgets) {
    if (!datasetById(widget.dataset)) continue;
    grid.appendChild(createCard(widget).el);
  }
  $('#empty').hidden = state.dashboard.widgets.length > 0;
  refreshAll();
}

function refreshAll() {
  for (const card of state.cards.values()) loadCard(card);
  loadStatus();
}

function redrawAll() {
  for (const card of state.cards.values()) if (card.payload || card.error) drawCard(card);
}

// ------------------------------------------------------------------ operacje na widgetach

function addWidget(widget) {
  const full = { id: uid(), ...widget };
  state.dashboard.widgets.push(full);
  const card = createCard(full);
  grid.appendChild(card.el);
  $('#empty').hidden = true;
  loadCard(card);
  saveDashboard();
  card.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast('Dodano wykres');
}

function updateWidget(id, changes) {
  const widget = state.dashboard.widgets.find((w) => w.id === id);
  const card = state.cards.get(id);
  if (!widget || !card) return;
  Object.assign(widget, changes);
  card.el.className = `card size-${widget.size}`;
  const select = card.el.querySelector('[data-act="chart"]');
  if (select) select.value = widget.chart;
  card.table = false;
  loadCard(card);
  saveDashboard();
}

function removeWidget(id) {
  const index = state.dashboard.widgets.findIndex((w) => w.id === id);
  if (index < 0) return;
  const [widget] = state.dashboard.widgets.splice(index, 1);
  const card = state.cards.get(id);
  card?.handle?.dispose();
  card?.el.remove();
  state.cards.delete(id);
  $('#empty').hidden = state.dashboard.widgets.length > 0;
  saveDashboard();
  toast('Usunięto wykres', {
    label: 'Cofnij',
    run: () => {
      state.dashboard.widgets.splice(index, 0, widget);
      const restored = createCard(widget);
      const next = state.dashboard.widgets[index + 1];
      const before = next ? state.cards.get(next.id)?.el : null;
      grid.insertBefore(restored.el, before || null);
      $('#empty').hidden = true;
      loadCard(restored);
      saveDashboard();
    },
  });
}

// Zmiana kolejności przeciąganiem za uchwyt.
let dragId = null;
function setupDrag(card) {
  const handle = card.el.querySelector('.drag-handle');
  handle.addEventListener('dragstart', (e) => {
    dragId = card.widget.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    e.dataTransfer.setDragImage(card.el, 20, 20);
    card.el.classList.add('dragging');
  });
  handle.addEventListener('dragend', () => {
    card.el.classList.remove('dragging');
    document.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    dragId = null;
  });
  card.el.addEventListener('dragover', (e) => {
    if (!dragId || dragId === card.widget.id) return;
    e.preventDefault();
    card.el.classList.add('drop-target');
  });
  card.el.addEventListener('dragleave', (e) => {
    if (!card.el.contains(e.relatedTarget)) card.el.classList.remove('drop-target');
  });
  card.el.addEventListener('drop', (e) => {
    e.preventDefault();
    card.el.classList.remove('drop-target');
    if (!dragId || dragId === card.widget.id) return;
    const widgets = state.dashboard.widgets;
    const from = widgets.findIndex((w) => w.id === dragId);
    const [moved] = widgets.splice(from, 1);
    const rect = card.el.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2 || (e.clientX > rect.left + rect.width / 2 && e.clientY > rect.top);
    const to = widgets.findIndex((w) => w.id === card.widget.id) + (after ? 1 : 0);
    widgets.splice(to, 0, moved);
    const movedEl = state.cards.get(moved.id).el;
    card.el.insertAdjacentElement(after ? 'afterend' : 'beforebegin', movedEl);
    saveDashboard();
  });
}

// ------------------------------------------------------------------ status i pasek

async function loadStatus() {
  try {
    state.status = await api.status();
  } catch {
    return;
  }
  const s = state.status;
  $('#source-line').textContent = s.mock
    ? `Tryb demo – dane wygenerowane (${s.mockReason})`
    : `CoinMarketCap API · cache ${s.cacheTtlMinutes} min`;

  const banner = $('#banner');
  if (s.mock) {
    banner.hidden = false;
    banner.innerHTML = `<div><strong>Tryb demo.</strong> Wykresy pokazują wygenerowane dane. Aby podłączyć prawdziwe dane, wpisz klucz w pliku <code>.env</code> (<code>CMC_API_KEY=…</code>) i uruchom serwer ponownie.</div>`;
  } else if (s.key?.error) {
    banner.hidden = false;
    banner.innerHTML = `<div><strong>Problem z kluczem API:</strong> ${escapeHtml(s.key.error)}</div>`;
  } else {
    banner.hidden = true;
  }

  const k = s.key || {};
  $('#credits').textContent = k.creditsUsed != null
    ? `Kredyty CMC: ${formatValue(k.creditsUsed, 'count', { compact: false })}${k.creditLimit ? ` / ${formatValue(k.creditLimit, 'count', { compact: false })}` : ''} w tym miesiącu${k.reset ? ` (reset: ${k.reset})` : ''}`
    : '';
  const h = s.history || {};
  $('#history-info').textContent = h.enabled
    ? `Snapshoty: ${h.count}${h.last ? ` · ostatni ${formatTime(h.last)}` : ''} · co ${h.intervalMinutes} min${h.lastError ? ` · błąd: ${h.lastError}` : ''}`
    : 'Snapshoty wyłączone';
}

function scheduleRefresh() {
  clearInterval(state.refreshTimer);
  const minutes = state.dashboard.refreshMinutes;
  if (minutes > 0) state.refreshTimer = setInterval(refreshAll, minutes * 60_000);
}

let toastTimer = null;
function toast(message, action) {
  const el = $('#toast');
  el.innerHTML = `${escapeHtml(message)}${action ? ` <button type="button" class="btn small ghost" style="color:inherit;margin-left:8px">${escapeHtml(action.label)}</button>` : ''}`;
  el.hidden = false;
  if (action) {
    el.querySelector('button').addEventListener('click', () => {
      el.hidden = true;
      action.run();
    }, { once: true });
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 2200);
}

// ------------------------------------------------------------------ motyw

const THEMES = ['auto', 'light', 'dark'];
const THEME_NAMES = { auto: 'automatyczny', light: 'jasny', dark: 'ciemny' };

function currentTheme() {
  return document.documentElement.dataset.theme || 'auto';
}

function applyTheme(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('crypto-api:theme', theme);
  } catch {
    // Brak dostępu do localStorage – motyw tylko do końca sesji.
  }
  $('#theme-name').textContent = THEME_NAMES[theme];
  redrawAll();
}

// ------------------------------------------------------------------ menu

function setupMenu() {
  const btn = $('#btn-menu');
  const menu = $('#menu');
  const close = () => {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) close();
  });
  menu.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    close();
    if (action === 'theme') {
      applyTheme(THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]);
    } else if (action === 'export') {
      const blob = new Blob([JSON.stringify(state.dashboard, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'crypto-dashboard.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } else if (action === 'import') {
      $('#import-file').click();
    } else if (action === 'snapshot') {
      try {
        await api.snapshot();
        toast('Zapisano snapshot rynku');
        refreshAll();
      } catch (err) {
        toast(`Błąd snapshotu: ${err.message}`);
      }
    } else if (action === 'reset') {
      if (!confirm('Przywrócić domyślny układ? Twoje wykresy zostaną zastąpione.')) return;
      state.dashboard = await api.resetDashboard();
      await api.saveDashboard(state.dashboard);
      applyDashboardSettings();
      renderAll();
    }
  });
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      state.dashboard = await api.saveDashboard(data);
      applyDashboardSettings();
      renderAll();
      toast(`Zaimportowano ${state.dashboard.widgets.length} wykresów`);
    } catch (err) {
      toast(`Nie udało się zaimportować: ${err.message}`);
    }
  });
}

function applyDashboardSettings() {
  setCurrency(state.dashboard.currency);
  $('#currency').value = state.dashboard.currency;
  $('#refresh').value = String(state.dashboard.refreshMinutes);
  scheduleRefresh();
}

// ------------------------------------------------------------------ start

async function init() {
  try {
    const [catalog, dashboard] = await Promise.all([api.catalog(), api.dashboard()]);
    state.catalog = catalog;
    state.dashboard = dashboard;
  } catch (err) {
    grid.innerHTML = `<div class="card size-l"><div class="card-body">${errorHtml(err)}</div></div>`;
    return;
  }
  setCatalog(state.catalog);
  initSearch({
    onAdd: addWidget,
    onUpdate: updateWidget,
  });
  applyDashboardSettings();
  $('#theme-name').textContent = THEME_NAMES[currentTheme()];

  $('#currency').addEventListener('change', (e) => {
    state.dashboard.currency = e.target.value;
    setCurrency(e.target.value);
    saveDashboard();
    refreshAll();
  });
  $('#refresh').addEventListener('change', (e) => {
    state.dashboard.refreshMinutes = Number(e.target.value);
    scheduleRefresh();
    saveDashboard();
  });
  $('#btn-refresh').addEventListener('click', refreshAll);
  $('#btn-add').addEventListener('click', () => openSearch());
  document.querySelectorAll('[data-open-search]').forEach((b) => b.addEventListener('click', () => openSearch()));
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]') && !$('#search').open) {
      e.preventDefault();
      openSearch();
    }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme() === 'auto') redrawAll();
  });
  setupMenu();
  renderAll();
  setInterval(loadStatus, 60_000);
}

init();
