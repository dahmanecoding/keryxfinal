/**
 * app.js — Keryx Patrimonio Tracker
 * Entry point: bootstraps the app, registers all event listeners.
 */

'use strict';

import { fetchFXRates, $ } from './utils.js';
import { state, loadFromStorage } from './state.js';
import {
  setTheme, nextTheme,
  initCategories, renderAll,
  openSheet, closeSheet, resetForm, fillForm, saveAsset, removeAsset,
  setTab, loadDemo, toggleAdminEgg,
} from './ui.js';

/* ── Bootstrap ──────────────────────────────────────────────── */
async function init() {
  // 1. Apply theme based on OS preference
  setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  // 2. Attempt to fetch live FX rates (non-blocking)
  fetchFXRates();

  // 3. Load persisted assets from localStorage
  loadFromStorage();

  // 4. Initialise category select & chips
  initCategories();

  // 5. Render initial UI
  renderAll();

  // 6. Register event listeners
  registerEvents();
}

/* ── Event listeners ────────────────────────────────────────── */
function registerEvents() {
  // Theme toggle
  $('themeBtn').addEventListener('click', nextTheme);

  // Add asset sheet
  $('openAddBtn').addEventListener('click', () => { resetForm(); openSheet(); });
  $('closeSheetBtn').addEventListener('click', closeSheet);

  // Close sheet by clicking the backdrop overlay
  $('sheet').addEventListener('click', e => {
    if (e.target.id === 'sheet') closeSheet();
  });

  // Close sheet with Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('sheet').classList.contains('open')) closeSheet();
  });

  // Form submit & reset
  $('assetForm').addEventListener('submit', saveAsset);
  $('resetFormBtn').addEventListener('click', resetForm);

  // Search input
  $('searchInput').addEventListener('input', e => {
    state.search = e.target.value;
    // Render only the assets list for performance
    import('./ui.js').then(m => m.renderAssets());
  });

  // Demo data loader
  $('loadDemoBtn').addEventListener('click', loadDemo);

  // Admin test mode
  $('adminEggBtn').addEventListener('click', toggleAdminEgg);

  // Tab navigation
  document.querySelectorAll('[data-tab]').forEach(btn =>
    btn.addEventListener('click', () => setTab(btn.dataset.tab))
  );

  // Delegated click handler for edit / delete buttons in asset list
  document.addEventListener('click', e => {
    const editId  = e.target.closest('[data-edit]')?.dataset.edit;
    const deleteId = e.target.closest('[data-delete]')?.dataset.delete;
    if (editId) {
      const asset = state.assets.find(a => a.id === editId);
      if (asset) fillForm(asset);
    }
    if (deleteId) removeAsset(deleteId);
  });
}

/* ── Start ──────────────────────────────────────────────────── */
init();
