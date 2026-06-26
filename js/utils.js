/**
 * utils.js — Keryx Patrimonio Tracker
 * Utility functions: formatting, XSS escaping, UUID, FX rates.
 */

'use strict';

/* ── XSS-safe HTML escaping ─────────────────────────────────── */
/**
 * Escapes a string for safe insertion into HTML.
 * Prevents Cross-Site Scripting (XSS) attacks.
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Number / currency formatters ───────────────────────────── */
const _euroFmt = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const _plainFmt = new Intl.NumberFormat('it-IT');

/** Format a number as EUR currency string. */
export const euro = (v) => _euroFmt.format(Number(v || 0));

/** Format a number with locale separators. */
export const plain = (v) => _plainFmt.format(Number(v || 0));

/* ── UUID ───────────────────────────────────────────────────── */
/**
 * Generates a cryptographically secure UUID v4.
 * Uses the Web Crypto API exclusively — no fallback with collision risk.
 * @returns {string}
 */
export function uid() {
  return crypto.randomUUID();
}

/* ── FX conversion ──────────────────────────────────────────── */
/**
 * Static fallback FX rates (EUR base).
 * In production these should be fetched from a live API.
 */
const STATIC_FX = { EUR: 1, USD: 0.92, GBP: 1.17, CHF: 1.04 };

/** Live rates cache */
let _fxRates = { ...STATIC_FX };
let _fxFetched = false;

/**
 * Attempt to fetch live FX rates from a public API.
 * Falls back silently to static rates on failure.
 */
export async function fetchFXRates() {
  if (_fxFetched) return;
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/EUR', { cache: 'force-cache' });
    if (!res.ok) throw new Error('FX fetch failed');
    const data = await res.json();
    _fxRates = {
      EUR: 1,
      USD: data.rates.USD ? 1 / data.rates.USD : STATIC_FX.USD,
      GBP: data.rates.GBP ? 1 / data.rates.GBP : STATIC_FX.GBP,
      CHF: data.rates.CHF ? 1 / data.rates.CHF : STATIC_FX.CHF,
    };
    _fxFetched = true;
  } catch {
    // Silently fall back to static rates
    _fxRates = { ...STATIC_FX };
  }
}

/**
 * Convert a value in the given currency to EUR.
 * @param {number} value
 * @param {string} currency
 * @returns {number}
 */
export function toEUR(value, currency) {
  return Number(value || 0) * (_fxRates[currency] ?? 1);
}

/* ── DOM helper ─────────────────────────────────────────────── */
/** Shorthand for document.getElementById. */
export const $ = (id) => document.getElementById(id);
