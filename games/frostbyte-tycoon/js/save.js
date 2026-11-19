/**
 * save.js — persistence: localStorage (with private-mode fallback), autosave
 * helpers, export/import (base64), validation, migrations, offline progress.
 */
import { CONFIG } from './config.js';
import { createDefaultState } from './state.js';
import { applyOffline } from './engine.js';

/** True while localStorage works. When false the game keeps running in memory. */
let storageWorks = true;
export const isStorageAvailable = () => storageWorks;

/** Probe localStorage once at boot (throws in some private modes / blocked storage). */
export function probeStorage() {
  try {
    const k = '__frostbyte_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    storageWorks = true;
  } catch {
    storageWorks = false;
  }
  return storageWorks;
}

/* ======================================================================
 * Migrations
 * ==================================================================== */

/**
 * MIGRATIONS[v] upgrades a save from version v to v+1 and must set
 * data.version = v + 1. Add an entry whenever CONFIG.saveVersion is bumped.
 * Example:
 *   1: (data) => { data.stats.newStat = 0; data.version = 2; return data; },
 */
const MIGRATIONS = {};

/** Run migrations in order until data.version === CONFIG.saveVersion. */
export function migrate(data) {
  let v = Number.isInteger(data.version) ? data.version : 1;
  if (v > CONFIG.saveVersion) {
    throw new Error(`This save is from a newer version of the game (v${v}). Please update the game.`);
  }
  while (v < CONFIG.saveVersion) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration path from save version ${v}.`);
    data = step(data);
    if (data.version !== v + 1) throw new Error(`Migration from v${v} did not advance the version.`);
    v = data.version;
  }
  return data;
}

/* ======================================================================
 * Validation / normalisation
 * ==================================================================== */

const num = (x, fallback = 0, min = 0) => (typeof x === 'number' && Number.isFinite(x) && x >= min ? x : fallback);
const int = (x, fallback = 0) => Math.floor(num(x, fallback));
const bool = (x) => x === true;

/**
 * Validate a parsed save and merge it onto a fresh default state, so missing
 * or corrupt fields fall back to sane defaults. Throws a readable Error if the
 * data is not a Frostbyte save at all.
 */
export function normalizeSave(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Save data is not an object.');
  if (!Array.isArray(raw.businesses)) throw new Error('Save data has no businesses list — not a Frostbyte Tycoon save.');
  if (typeof raw.cash !== 'number' || !Number.isFinite(raw.cash)) throw new Error('Save data has an invalid cash value.');

  const data = migrate(structuredClone(raw));
  const s = createDefaultState();

  s.cash = num(data.cash);
  s.runEarnings = num(data.runEarnings);
  s.businesses = s.businesses.map((d, i) => {
    const b = data.businesses[i] || {};
    return {
      owned: int(b.owned),
      managed: bool(b.managed),
      running: bool(b.running),
      progress: Math.min(0.999999, num(b.progress)),
    };
  });
  s.upgrades = s.upgrades.map((row, i) => row.map((_, j) => bool(data.upgrades?.[i]?.[j])));
  s.globals = s.globals.map((_, j) => bool(data.globals?.[j]));
  s.snowflakes = int(data.snowflakes);
  s.snowflakesClaimed = Math.max(int(data.snowflakesClaimed), s.snowflakes);
  for (const k of Object.keys(s.shop)) s.shop[k] = bool(data.shop?.[k]);

  const st = data.stats || {};
  s.stats.lifetimeEarnings = Math.max(num(st.lifetimeEarnings), s.runEarnings);
  s.stats.playtime = num(st.playtime);
  s.stats.resets = int(st.resets);
  s.stats.highestTier = Math.min(CONFIG.businesses.length, Math.max(1, int(st.highestTier, 1)));
  s.stats.totalClicks = int(st.totalClicks);
  s.stats.eventsClaimed = int(st.eventsClaimed);
  s.stats.createdAt = num(st.createdAt, Date.now());

  const se = data.settings || {};
  s.settings.snow = se.snow !== false;
  s.settings.numberFormat = se.numberFormat === 'scientific' ? 'scientific' : 'suffix';
  s.settings.buyMode = CONFIG.buyModes.includes(se.buyMode) ? se.buyMode : '1';

  s.lastSaved = num(data.lastSaved, Date.now());
  s.version = CONFIG.saveVersion;
  return s;
}

/* ======================================================================
 * localStorage
 * ==================================================================== */

/** Persist the state. Returns true on success. */
export function saveGame(s) {
  s.lastSaved = Date.now();
  s.version = CONFIG.saveVersion;
  if (!storageWorks) return false;
  try {
    localStorage.setItem(CONFIG.saveKey, JSON.stringify(s));
    return true;
  } catch (e) {
    console.warn('[Frostbyte] Save failed:', e);
    storageWorks = false;
    return false;
  }
}

/**
 * Load the stored save. Returns { state } on success, { state: null } when
 * there is no save, or { state: null, error } when the save is corrupt.
 */
export function loadGame() {
  if (!storageWorks) return { state: null };
  let text = null;
  try {
    text = localStorage.getItem(CONFIG.saveKey);
  } catch {
    storageWorks = false;
    return { state: null };
  }
  if (!text) return { state: null };
  try {
    return { state: normalizeSave(JSON.parse(text)) };
  } catch (e) {
    // Keep the corrupt data around so it is not lost forever.
    try { localStorage.setItem(CONFIG.saveKey + '_corrupt_backup', text); } catch { /* ignore */ }
    return { state: null, error: e.message || String(e) };
  }
}

/** Remove the stored save (hard reset). */
export function deleteSave() {
  try { localStorage.removeItem(CONFIG.saveKey); } catch { /* ignore */ }
}

/* ======================================================================
 * Export / import (base64 of UTF-8 JSON)
 * ==================================================================== */

export function encodeSave(s) {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...s, version: CONFIG.saveVersion, lastSaved: Date.now() }));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Decode + validate an exported string. Throws a readable Error on bad input. */
export function decodeSave(text) {
  const cleaned = String(text || '').replace(/\s+/g, '');
  if (!cleaned) throw new Error('Paste a save string first.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) throw new Error('That is not a valid save string (unexpected characters).');
  let json;
  try {
    const bin = atob(cleaned);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('That save string could not be decoded. Make sure you copied all of it.');
  }
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That save string is damaged (invalid JSON inside).');
  }
  return normalizeSave(parsed);
}

/** Copy text to the clipboard (with a fallback for older browsers / insecure contexts). */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Trigger a .txt download of the export string. */
export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ======================================================================
 * Offline progress
 * ==================================================================== */

/**
 * Credit time since s.lastSaved. Negative elapsed (system clock moved back)
 * is treated as 0. Returns applyOffline's summary.
 */
export function processOffline(s, now = Date.now()) {
  const elapsed = Math.max(0, (now - num(s.lastSaved, now)) / 1000);
  const result = applyOffline(s, elapsed);
  s.lastSaved = now;
  return result;
}
