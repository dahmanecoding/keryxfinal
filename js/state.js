/**
 * state.js — Keryx Patrimonio Tracker
 * Application state + localStorage persistence.
 */

'use strict';

const STORAGE_KEY = 'keryx_assets_v1';

/* ── Initial state ──────────────────────────────────────────── */
export const state = {
  assets: [],
  currentTab: 'home',
  search: '',
  filter: 'all',
  editingId: null,
  adminInjected: false,
  injectedIds: [],
};

/* ── Persistence ────────────────────────────────────────────── */

/**
 * Load assets from localStorage into state.
 * Silently ignores malformed data.
 */
export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      state.assets = parsed;
    }
  } catch {
    // Corrupted storage — start fresh
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Persist current assets to localStorage.
 * Called after every mutation to state.assets.
 */
export function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.assets));
  } catch {
    // Storage quota exceeded or unavailable — fail silently
  }
}

/**
 * Clear all persisted data from localStorage.
 */
export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}
