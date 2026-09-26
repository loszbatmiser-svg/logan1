const paths = {
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  resize: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  hbar: '<path d="M4 5h10M4 10h16M4 15h7M4 20h12"/>',
  column: '<path d="M6 20V10M12 20V4M18 20v-7M3 20h18"/>',
  treemap: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M12 12h9M3 14h9"/>',
  donut: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v4.5"/>',
  line: '<path d="M3 17l5-6 4 3 8-9"/>',
  area: '<path d="M3 20V16l5-6 4 3 8-8v15z"/>',
  kpi: '<path d="M5 8h4M5 12h14M5 16h9"/>',
  gauge: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/>',
  meters: '<path d="M4 7h16M4 12h16M4 17h16"/><path d="M4 7h10M4 12h6M4 17h13" stroke-width="3.5"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  flat: '<path d="M5 12h14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M9.5 9h4a1.5 1.5 0 0 1 0 3h-4h4.5a1.5 1.5 0 0 1 0 3h-4.5M11 7.5V9M11 15v1.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
};

export function icon(name, cls = 'icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg>`;
}

export const CHART_LABELS = {
  hbar: 'Słupki poziome',
  column: 'Słupki pionowe',
  treemap: 'Mapa (treemap)',
  donut: 'Pierścień',
  line: 'Linia',
  area: 'Obszar',
  table: 'Tabela',
  kpi: 'Liczba',
  gauge: 'Wskaźnik',
  meters: 'Liczniki',
};
