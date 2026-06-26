/**
 * ui.js — Keryx Patrimonio Tracker
 * All rendering logic, DOM manipulation, and UI helpers.
 * Uses esc() for every user-supplied value to prevent XSS.
 */

'use strict';

import { esc, euro, plain, uid, toEUR, $ } from './utils.js';
import { state, saveToStorage, loadFromStorage, clearStorage } from './state.js';

/* ── Static data ────────────────────────────────────────────── */

/**
 * TAX_RATES_BY_CATEGORY
 * Capital-gains / disposal tax rates for private individuals at the point of sale.
 * Sources (2024-2025):
 *   Italy   — TUIR art.67-68; L.197/2022 (crypto 26% → 33% from 2026); DPR 917/1986
 *   Switzerland — Federal Tax Administration; cantonal real-estate CGT (avg ~20%)
 *   Germany — EStG §20 Abgeltungsteuer 25%+Soli=26.375%; §23 Spekulationssteuer
 *   France  — CGI art.150 UA/VI; PFU 30%; TFOP 6%+0.5% CRDS on precious objects
 *   UAE     — No personal income or capital-gains tax (Federal Decree-Law 47/2022)
 *
 * Rates are the most commonly applicable rate for a private individual.
 * 0 = no tax / exempt for private individuals in normal conditions.
 */
export const TAX_RATES_BY_CATEGORY = {
  //           Italy   Switzerland  Germany  France   UAE
  Car:       { Italy: 0,      Switzerland: 0,    Germany: 0,       France: 0,     UAE: 0 },
  // Cars sold by private individuals are generally not subject to capital-gains tax
  // (Italy: no CGT on personal-use vehicles; DE: exempt if held >1yr or personal use;
  //  FR: movable property CGT only on collector/classic cars >€5k; CH/UAE: 0)

  Motorbike: { Italy: 0,      Switzerland: 0,    Germany: 0,       France: 0,     UAE: 0 },
  // Same treatment as cars — personal-use vehicles are CGT-exempt in all 5 countries

  Home:      { Italy: 0.26,   Switzerland: 0.20, Germany: 0.25,    France: 0.362, UAE: 0 },
  // Italy: 26% substitute tax on gain if sold within 5 yrs (primary residence exempt)
  // Switzerland: avg cantonal real-estate CGT ~20% (range 10-60% depending on canton/holding)
  // Germany: personal income tax rate on gain if sold within 10 yrs (avg ~25%); exempt after 10 yrs
  // France: 19% IR + 17.2% social contributions = 36.2% (primary residence exempt)
  // UAE: 0%

  Cash:      { Italy: 0.26,   Switzerland: 0,    Germany: 0.26375, France: 0.30,  UAE: 0 },
  // Interest/savings gains: Italy 26% substitute tax; CH: income tax on interest (no CGT);
  // DE: 26.375% Abgeltungsteuer; FR: 30% PFU; UAE: 0%

  Stocks:    { Italy: 0.26,   Switzerland: 0,    Germany: 0.26375, France: 0.30,  UAE: 0 },
  // Italy: 26% imposta sostitutiva (art.67 TUIR); CH: 0% for private investors;
  // DE: 26.375% Abgeltungsteuer; FR: 30% PFU; UAE: 0%

  Crypto:    { Italy: 0.33,   Switzerland: 0,    Germany: 0,       France: 0.30,  UAE: 0 },
  // Italy: 33% from 01/01/2026 (was 26%); CH: 0% private investor;
  // DE: 0% if held >1 year (personal income rate if <1yr); FR: 30% PFU; UAE: 0%

  Gold:      { Italy: 0.26,   Switzerland: 0,    Germany: 0,       France: 0.115, UAE: 0 },
  // Italy: 26% on investment gold gains (GGI/Agenzia Entrate);
  // CH: 0% private investor; DE: 0% if held >1yr (26.375% if <1yr);
  // FR: TFOP 11% + 0.5% CRDS = 11.5% on sale price (or 36.2% CGT by option); UAE: 0%

  Jewelry:   { Italy: 0.26,   Switzerland: 0,    Germany: 0.26375, France: 0.065, UAE: 0 },
  // Italy: 26% if gain realised (private sales generally not tracked, but taxable in principle);
  // CH: 0%; DE: 26.375% if sold within 1yr and gains >€1k;
  // FR: TFOP 6% + 0.5% CRDS = 6.5% on sale price (Council of State 2023); UAE: 0%

  Watches:   { Italy: 0.26,   Switzerland: 0,    Germany: 0.26375, France: 0.065, UAE: 0 },
  // Italy: 26% on gain; CH: 0%; DE: 26.375% if <1yr holding;
  // FR: TFOP 6.5% (watches = jewelry per Council of State Dec 2023); UAE: 0%

  Art:       { Italy: 0,      Switzerland: 0,    Germany: 0.26375, France: 0.065, UAE: 0 },
  // Italy: no CGT on art for private individuals (not listed in art.67 TUIR);
  // CH: 0%; DE: 26.375% if <1yr; FR: TFOP 6.5% on sale price; UAE: 0%

  Business:  { Italy: 0.26,   Switzerland: 0,    Germany: 0.26375, France: 0.30,  UAE: 0 },
  // Italy: 26% on non-qualified shareholdings (art.68 TUIR);
  // CH: 0% private investor; DE: 26.375% Abgeltungsteuer;
  // FR: 30% PFU; UAE: 0%

  Other:     { Italy: 0.26,   Switzerland: 0,    Germany: 0.26375, France: 0.30,  UAE: 0 },
  // Generic fallback: standard capital-gains rates
};

/** Countries shown in the tax scenario panel */
export const TAX_COUNTRIES = ['Italy', 'Switzerland', 'Germany', 'France', 'UAE'];

/**
 * Compute total tax and net value for a given country,
 * applying the per-category rate to each asset's EUR value.
 * @param {string} country
 * @param {Array}  assets
 * @returns {{ country, grossTotal, totalTax, netTotal, effectiveRate }}
 */
export function computeTaxForCountry(country, assets) {
  let grossTotal = 0;
  let totalTax   = 0;
  for (const asset of assets) {
    const val  = asset.valueEUR || 0;
    const rates = TAX_RATES_BY_CATEGORY[asset.category] || TAX_RATES_BY_CATEGORY.Other;
    const rate  = rates[country] ?? 0;
    grossTotal += val;
    totalTax   += val * rate;
  }
  const netTotal      = grossTotal - totalTax;
  const effectiveRate = grossTotal > 0 ? totalTax / grossTotal : 0;
  return { country, grossTotal, totalTax, netTotal, effectiveRate };
}

export const CATEGORY_DEFS = [
  ['Car',       'Sedan / SUV / sports car'],
  ['Motorbike', 'Naked / sport / touring'],
  ['Home',      'Apartment / villa / land'],
  ['Cash',      'Account / cash / deposit'],
  ['Stocks',    'ETF / single stocks'],
  ['Crypto',    'Coin / token'],
  ['Gold',      'Bar / coin'],
  ['Jewelry',   'Ring / necklace / bracelet'],
  ['Watches',   'Model / reference'],
  ['Art',       'Artwork / collection'],
  ['Business',  'Shares / equity'],
  ['Other',     'Generic asset'],
];

export const CATEGORY_COLORS = {
  Car:       '#d8873f',
  Motorbike: '#e0b14f',
  Home:      '#11818c',
  Cash:      '#33a06f',
  Stocks:    '#6092ff',
  Crypto:    '#8c6bff',
  Gold:      '#d4a43d',
  Jewelry:   '#cf6ca8',
  Watches:   '#7f7ce6',
  Art:       '#d86e64',
  Business:  '#2a8f8d',
  Other:     '#7f8b99',
};

const RANDOM_ASSETS_POOL = [
  { name: 'Patek Philippe Nautilus',  category: 'Watches',  subType: 'Sport luxury', reference: '5711/1A',    country: 'Switzerland' },
  { name: 'Diamond tennis necklace',  category: 'Jewelry',  subType: 'Necklace',     reference: '18kt VVS',   country: 'Italy' },
  { name: 'Tesla Model 3',            category: 'Car',      subType: 'Sedan',        reference: 'Highland',   country: 'Italy' },
  { name: 'Beach apartment',          category: 'Home',     subType: 'Apartment',    reference: '70sqm',      country: 'Spain' },
  { name: 'Ethereum bag',             category: 'Crypto',   subType: 'ETH',          reference: 'Cold wallet',country: 'Ledger' },
  { name: 'MSCI World ETF',           category: 'Stocks',   subType: 'ETF',          reference: 'SWDA',       country: 'Ireland' },
  { name: 'Ducati Panigale V4',       category: 'Motorbike',subType: 'Sport',        reference: 'V4 S',       country: 'Italy' },
  { name: 'Krugerrand stack',         category: 'Gold',     subType: 'Coins',        reference: '1 oz',       country: 'South Africa' },
  { name: 'Cash reserve',             category: 'Cash',     subType: 'Account',      reference: 'Banking',    country: 'Italy' },
  { name: 'Contemporary artwork',     category: 'Art',      subType: 'Canvas',       reference: 'Signed',     country: 'France' },
  { name: 'Startup equity',           category: 'Business', subType: 'Shares',       reference: 'Seed round', country: 'UK' },
  { name: 'Cartier Love bracelet',    category: 'Jewelry',  subType: 'Bracelet',     reference: 'Rose gold',  country: 'France' },
];

/* ── Theme management ───────────────────────────────────────── */
const THEMES = ['light', 'dark', 'theme-gold', 'theme-silver', 'theme-platinum', 'theme-ruby', 'theme-diamond'];

export function setTheme(theme) {
  THEMES.forEach(t => document.documentElement.classList.remove(t));
  document.documentElement.setAttribute('data-theme', theme);
}

export function nextTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const idx = THEMES.indexOf(current);
  setTheme(THEMES[(idx + 1) % THEMES.length]);
}

/* ── Toast notifications ────────────────────────────────────── */
export function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  // Use textContent — never innerHTML — for user-controlled text
  node.textContent = message;
  $('toastWrap').appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(-4px)';
  }, 2200);
  setTimeout(() => node.remove(), 2600);
}

/* ── Sheet (modal bottom drawer) ───────────────────────────── */
export function openSheet() {
  $('sheet').classList.add('open');
  document.querySelector('.app').classList.add('sheet-active');
  // Trap focus inside the sheet for accessibility
  $('assetName').focus();
}

export function closeSheet() {
  $('sheet').classList.remove('open');
  document.querySelector('.app').classList.remove('sheet-active');
}

/* ── Category chips ─────────────────────────────────────────── */
export function initCategories() {
  $('assetCategory').innerHTML =
    '<option value="">Select category</option>' +
    CATEGORY_DEFS.map(([name]) => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  renderCategoryChips();
}

export function renderCategoryChips() {
  const cats = ['all', ...CATEGORY_DEFS.map(([name]) => name)];
  $('categoryChips').innerHTML = cats.map(cat =>
    `<button class="chip ${state.filter === cat ? 'active' : ''}" data-filter="${esc(cat)}" aria-pressed="${state.filter === cat}">
      ${cat === 'all' ? 'All' : esc(cat)}
    </button>`
  ).join('');

  document.querySelectorAll('[data-filter]').forEach(btn =>
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      renderCategoryChips();
      renderAssets();
    })
  );
}

/* ── Computed totals ────────────────────────────────────────── */
function totals() {
  const total = state.assets.reduce((s, a) => s + a.valueEUR, 0);
  const liquidInvested = state.assets
    .filter(a => ['Cash', 'Stocks', 'Crypto'].includes(a.category))
    .reduce((s, a) => s + a.valueEUR, 0);
  const byCategory = state.assets.reduce((acc, a) => {
    acc[a.category] = (acc[a.category] || 0) + a.valueEUR;
    return acc;
  }, {});
  const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  return { total, liquidInvested, byCategory, topCategory };
}

/* ── Filtered asset list ────────────────────────────────────── */
function filteredAssets() {
  const term = state.search.trim().toLowerCase();
  let items = [...state.assets];
  if (state.filter !== 'all') items = items.filter(a => a.category === state.filter);
  if (term) {
    items = items.filter(a =>
      [a.name, a.category, a.subType, a.reference, a.ticker, a.country, a.notes]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }
  return items.sort((a, b) => b.valueEUR - a.valueEUR);
}

/* ── Wealth bracket ─────────────────────────────────────────── */
function getWealthBracket(total) {
  if (total >= 13000000) return { headline: 'Top 1%',        copy: 'With wealth above roughly €13M, you fall into a bracket comparable to the top 1% in U.S. household wealth estimates.' };
  if (total >= 3800000)  return { headline: 'Top 5%',        copy: 'Above roughly €3.8M, you are in a bracket comparable to the top 5% in U.S. household estimates.' };
  if (total >= 1900000)  return { headline: 'Top 10%',       copy: 'Above roughly €1.9M, you enter a bracket comparable to the top 10% in U.S. household estimates.' };
  if (total >= 1000000)  return { headline: 'Top 1.6% global', copy: 'With over €1M, you are in the over-one-million range often used in global personal wealth reports.' };
  if (total >= 193000)   return { headline: 'Top 50%+',      copy: 'Above roughly €193k, you exceed the median household wealth level in several recent U.S. benchmarks.' };
  if (total > 0)         return { headline: 'Below top 50%', copy: 'The portfolio is still below the benchmark used for the median bracket in several demo wealth comparisons.' };
  return { headline: 'Top 50%', copy: 'Add assets to estimate your wealth bracket.' };
}

/* ── Render: Hero ───────────────────────────────────────────── */
export function renderHero() {
  const { total, liquidInvested, topCategory, byCategory } = totals();
  $('grandTotal').textContent = euro(total);
  $('assetCount').textContent = plain(state.assets.length);
  $('topCategory').textContent = topCategory;
  $('liquidInvested').textContent = euro(liquidInvested);

  const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3);
  $('heroCategoryPercentages').innerHTML = top.length
    ? top.map(([name, val]) => {
        const pct = total ? (val / total) * 100 : 0;
        const color = CATEGORY_COLORS[name] || '#7f8b99';
        return `
          <div class="hero-cat-row">
            <div class="hero-cat-top">
              <span>${esc(name)}</span>
              <strong>${plain(pct.toFixed(0))}%</strong>
            </div>
            <div class="hero-cat-bar" role="progressbar" aria-valuenow="${pct.toFixed(0)}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(name)} share">
              <div class="hero-cat-fill" style="width:${pct}%;background:linear-gradient(90deg,${color},color-mix(in srgb,${color} 55%,white));"></div>
            </div>
          </div>`;
      }).join('')
    : '<div class="small muted">Add assets to see category shares.</div>';

  const bracket = getWealthBracket(total);
  $('wealthPercentileHeadline').textContent = bracket.headline;
  $('wealthPercentileText').textContent = bracket.copy;
}

/* ── Render: Taxes ──────────────────────────────────────────── */
export function renderTaxes() {
  if (!state.assets.length) {
    const empty = `<div class="empty">
      <div class="empty-badge sf-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-tax"></use></svg></div>
      <strong>No assets</strong>
      <p class="small muted">Add assets to see the tax scenario.</p>
    </div>`;
    $('taxOverview').innerHTML = empty;
    $('taxCountryTable').innerHTML = empty;
    return;
  }

  const markup = TAX_COUNTRIES.map(country => {
    const { grossTotal, totalTax, netTotal, effectiveRate } = computeTaxForCountry(country, state.assets);
    const retainedPct = grossTotal > 0 ? (netTotal / grossTotal) * 100 : 100;
    const taxPct      = 100 - retainedPct;

    // Build per-category tax breakdown rows
    const catBreakdown = CATEGORY_DEFS
      .map(([name]) => {
        const catAssets = state.assets.filter(a => a.category === name);
        if (!catAssets.length) return null;
        const catGross = catAssets.reduce((s, a) => s + a.valueEUR, 0);
        const rates    = TAX_RATES_BY_CATEGORY[name] || TAX_RATES_BY_CATEGORY.Other;
        const rate     = rates[country] ?? 0;
        const catTax   = catGross * rate;
        const catNet   = catGross - catTax;
        return `<div class="tax-cat-row">
          <span class="tax-cat-name">${esc(name)}</span>
          <span class="tax-cat-rate muted">${plain((rate * 100).toFixed(1))}%</span>
          <span class="tax-cat-tax">&minus;${euro(catTax)}</span>
          <span class="tax-cat-net asset-value">${euro(catNet)}</span>
        </div>`;
      })
      .filter(Boolean)
      .join('');

    return `
      <article class="tax-card rise-in">
        <div class="row">
          <div><strong>${esc(country)}</strong></div>
          <div class="asset-value" style="font-size:17px">${euro(netTotal)}</div>
        </div>
        <div class="bar" role="progressbar" aria-valuenow="${retainedPct.toFixed(0)}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(country)} net retained">
          <div class="fill" style="width:${retainedPct}%"></div>
        </div>
        <div class="row small muted">
          <span>Net after tax</span>
          <span>${plain(retainedPct.toFixed(1))}% retained &middot; &minus;${euro(totalTax)} tax</span>
        </div>
        <div class="row small muted" style="margin-top:2px">
          <span>Effective rate</span>
          <span>${plain((effectiveRate * 100).toFixed(2))}%</span>
        </div>
        ${catBreakdown ? `<details class="tax-breakdown">
          <summary class="small muted">Per-category breakdown</summary>
          <div class="tax-cat-grid">
            <div class="tax-cat-row tax-cat-header">
              <span>Category</span><span>Rate</span><span>Tax</span><span>Net</span>
            </div>
            ${catBreakdown}
          </div>
        </details>` : ''}
      </article>`;
  }).join('');

  $('taxOverview').innerHTML = markup;
  $('taxCountryTable').innerHTML = markup;
}

/* ── Render: Category breakdown ─────────────────────────────── */
export function renderCategoryBreakdown() {
  const { total, byCategory } = totals();
  const rows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  $('categoryBreakdown').innerHTML = rows.length
    ? rows.map(([name, val]) => {
        const pct = total ? (val / total) * 100 : 0;
        const color = CATEGORY_COLORS[name] || '#7f8b99';
        return `
          <article class="category-row rise-in">
            <div class="row">
              <strong>${esc(name)}</strong>
              <div class="asset-value" style="font-size:17px">${euro(val)}</div>
            </div>
            <div class="bar" role="progressbar" aria-valuenow="${pct.toFixed(1)}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(name)} share of total">
              <div class="fill" style="width:${pct}%;background:linear-gradient(90deg,${color},color-mix(in srgb,${color} 60%,white));"></div>
            </div>
            <div class="row small muted">
              <span>Share of total</span>
              <span>${plain(pct.toFixed(1))}%</span>
            </div>
          </article>`;
      }).join('')
    : `<div class="empty">
        <div class="empty-badge sf-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-categories"></use></svg></div>
        <strong>No categories</strong>
        <p class="small muted">Add at least one asset to see the composition.</p>
      </div>`;
}

/* ── Render: Asset list ─────────────────────────────────────── */
export function renderAssets() {
  const items = filteredAssets();
  $('assetList').innerHTML = items.length
    ? items.map(a => {
        const accent = CATEGORY_COLORS[a.category] || '#7f8b99';
        const meta = [a.category, a.subType, a.reference, a.country].filter(Boolean).join(' · ');
        return `
          <article class="list-item rise-in" aria-label="${esc(a.name)}, ${esc(a.category)}, ${euro(a.valueEUR)}">
            <div class="row">
              <div class="asset-main">
                <span class="dot" style="background:${accent}" aria-hidden="true"></span>
                <div>
                  <h3>${esc(a.name)}</h3>
                  <div class="asset-meta">${esc(meta) || 'Portfolio asset'}</div>
                </div>
              </div>
              <span class="pill">${esc(a.currency)}</span>
            </div>
            <div class="row">
              <div class="small muted">${esc(a.ticker || a.notes || 'No notes')}</div>
              <div class="asset-value">${euro(a.valueEUR)}</div>
            </div>
            <div class="actions">
              <button class="icon-btn springy" data-edit="${esc(a.id)}" aria-label="Edit ${esc(a.name)}">
                <span class="sf-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-edit"></use></svg></span>
                <span>Edit</span>
              </button>
              <button class="icon-btn springy" data-delete="${esc(a.id)}" aria-label="Delete ${esc(a.name)}">
                <span class="sf-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-trash"></use></svg></span>
                <span>Delete</span>
              </button>
            </div>
          </article>`;
      }).join('')
    : `<div class="empty">
        <div class="empty-badge sf-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-plus"></use></svg></div>
        <strong>No assets found</strong>
        <p class="small muted">Add a property, watch, jewelry, crypto, or cash from the central tab.</p>
      </div>`;
}

/* ── Render: All ────────────────────────────────────────────── */
export function renderAll() {
  renderHero();
  renderTaxes();
  renderCategoryBreakdown();
  renderAssets();
}

/* ── Form helpers ───────────────────────────────────────────── */
export function resetForm() {
  $('assetForm').reset();
  $('assetId').value = '';
  state.editingId = null;
  $('formTitle').textContent = 'Add portfolio item';
  $('saveBtn').innerHTML = '<span class="sf-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-check"></use></svg></span> Save asset';
}

export function fillForm(asset) {
  $('assetId').value = asset.id;
  $('assetName').value = asset.name;
  $('assetCategory').value = asset.category;
  $('assetValue').value = asset.rawValue;
  $('assetCurrency').value = asset.currency;
  $('assetCountry').value = asset.country || '';
  $('assetSubType').value = asset.subType || '';
  $('assetReference').value = asset.reference || '';
  $('assetTicker').value = asset.ticker || '';
  $('assetNotes').value = asset.notes || '';
  state.editingId = asset.id;
  $('formTitle').textContent = 'Edit portfolio item';
  $('saveBtn').innerHTML = '<span class="sf-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-check"></use></svg></span> Update asset';
  openSheet();
}

export function saveAsset(e) {
  e.preventDefault();
  const rawValue = Number($('assetValue').value || 0);
  const asset = {
    id:        $('assetId').value || uid(),
    name:      $('assetName').value.trim(),
    category:  $('assetCategory').value,
    rawValue,
    currency:  $('assetCurrency').value,
    country:   $('assetCountry').value.trim(),
    subType:   $('assetSubType').value.trim(),
    reference: $('assetReference').value.trim(),
    ticker:    $('assetTicker').value.trim(),
    notes:     $('assetNotes').value.trim(),
    valueEUR:  toEUR(rawValue, $('assetCurrency').value),
  };

  if (!asset.name || !asset.category || !rawValue) {
    toast('Complete name, category, and value.');
    return;
  }

  const idx = state.assets.findIndex(a => a.id === asset.id);
  if (idx >= 0) {
    state.assets[idx] = asset;
    toast('Asset updated.');
  } else {
    state.assets.unshift(asset);
    toast('Asset added.');
  }

  saveToStorage();
  resetForm();
  closeSheet();
  setTab('assets');
  renderAll();
}

export function removeAsset(id) {
  state.assets = state.assets.filter(a => a.id !== id);
  saveToStorage();
  renderAll();
  toast('Asset deleted.');
}

/* ── Tab navigation ─────────────────────────────────────────── */
export function setTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('[data-view]').forEach(s =>
    s.classList.toggle('hidden', s.dataset.view !== tab)
  );
  document.querySelectorAll('[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
}

/* ── Demo data ──────────────────────────────────────────────── */
export function loadDemo() {
  state.assets = [
    { id: uid(), name: 'Main villa',       category: 'Home',    rawValue: 850000, currency: 'EUR', country: 'Italy',       subType: 'Villa',         reference: 'Residential', ticker: '', notes: 'Primary residence',   valueEUR: 850000 },
    { id: uid(), name: 'Rolex Daytona',    category: 'Watches', rawValue: 28500,  currency: 'EUR', country: 'Italy',       subType: 'Chronograph',   reference: '116500LN',    ticker: '', notes: 'Box and papers',      valueEUR: 28500 },
    { id: uid(), name: 'Nasdaq portfolio', category: 'Stocks',  rawValue: 180000, currency: 'USD', country: 'USA',         subType: 'ETF + blue chip',reference: 'VOO / AAPL', ticker: 'AAPL', notes: 'International broker', valueEUR: toEUR(180000, 'USD') },
    { id: uid(), name: 'Bitcoin reserve',  category: 'Crypto',  rawValue: 92000,  currency: 'EUR', country: 'Cold wallet', subType: 'BTC',           reference: 'Long term',   ticker: 'BTC',  notes: 'Hardware custody',    valueEUR: 92000 },
    { id: uid(), name: 'Bracelet collection',category:'Jewelry', rawValue: 36000, currency: 'EUR', country: 'Italy',       subType: 'Bracelets',     reference: '18kt',        ticker: '', notes: 'Insured value',       valueEUR: 36000 },
    { id: uid(), name: 'Cash account',     category: 'Cash',    rawValue: 64000,  currency: 'EUR', country: 'Italy',       subType: 'Account',       reference: 'Operating',   ticker: '', notes: 'Available cash',      valueEUR: 64000 },
  ];
  saveToStorage();
  renderAll();
  toast('Demo loaded.');
}

/* ── Admin test mode ────────────────────────────────────────── */
export function toggleAdminEgg() {
  if (!state.adminInjected) {
    const generated = Array.from({ length: 10 }, (_, i) => {
      const base = RANDOM_ASSETS_POOL[Math.floor(Math.random() * RANDOM_ASSETS_POOL.length)];
      const currency = ['EUR', 'USD', 'GBP', 'CHF'][Math.floor(Math.random() * 4)];
      const rawValue = Math.round((Math.random() * 450000 + 2500) / 100) * 100;
      return {
        id: uid(),
        name: `${base.name} ${i + 1}`,
        category: base.category,
        rawValue,
        currency,
        country: base.country,
        subType: base.subType,
        reference: base.reference,
        ticker: base.reference,
        notes: 'Random asset generated for admin testing.',
        valueEUR: toEUR(rawValue, currency),
        injected: true,
      };
    });
    state.assets = [...generated, ...state.assets];
    state.injectedIds = generated.map(a => a.id);
    state.adminInjected = true;
    $('adminEggBtn').classList.add('active');
    $('adminEggBtn').innerHTML = '<span class="sf-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-admin"></use></svg></span> Admin test mode · remove random assets';
    renderAll();
    toast('Added 10 random test assets.');
  } else {
    state.assets = state.assets.filter(a => !state.injectedIds.includes(a.id));
    state.injectedIds = [];
    state.adminInjected = false;
    $('adminEggBtn').classList.remove('active');
    $('adminEggBtn').innerHTML = '<span class="sf-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-admin"></use></svg></span> Admin test mode · +10 random assets';
    renderAll();
    toast('Random assets removed.');
  }
}
