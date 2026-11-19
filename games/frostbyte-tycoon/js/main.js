/**
 * main.js — boot sequence and main loop.
 *
 * 1. Probe storage, load + validate the save (or start fresh).
 * 2. Apply offline progress and show "Welcome back".
 * 3. Build the UI and event system.
 * 4. Run the requestAnimationFrame loop with timestamp deltas.
 * 5. Autosave every N seconds, on tab hide and on unload.
 */
import { CONFIG } from './config.js';
import { state, runtime, createDefaultState, replaceState } from './state.js';
import * as engine from './engine.js';
import * as saves from './save.js';
import { createEventSystem } from './events.js';
import { initUI, toast, modal } from './ui.js';
import { formatMoney, formatTime } from './format.js';

let ui = null;
let events = null;
let lastTick = performance.now();

/* ---------- Time sync ---------- */

/** Advance the game to "now" (used by the loop and before every save). */
function syncTime() {
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (dt > 0) {
    // A tab hidden for hours resumes with one big delta; cap it like offline time.
    engine.tick(state, Math.min(dt, engine.offlineCapSeconds(state)), runtime);
  }
  return dt;
}

/* ---------- Saving ---------- */

function save(showToast) {
  syncTime();
  const ok = saves.saveGame(state);
  if (showToast) toast(ok ? '💾 Saved' : '⚠️ Could not save — progress is only kept in memory', ok ? 'success' : 'error');
  return ok;
}

/** Show the offline summary modal when the player was away long enough. */
function showWelcomeBack(result) {
  if (result.credited < CONFIG.offline.minSecondsForModal || result.earned <= 0) return;
  const lines = [
    `You were away for ${formatTime(result.elapsed)}.`,
    `Your managers earned ${formatMoney(result.earned)} while you were gone.`,
  ];
  if (result.capped) lines.push(`(Offline earnings are capped at ${formatTime(engine.offlineCapSeconds(state))}.)`);
  modal({ title: '☕ Welcome back!', body: lines.join(' '), okText: 'Collect' });
}

/* ---------- Settings actions (export / import / reset) ---------- */

const actions = {
  save,
  async exportCopy() {
    save(false);
    const ok = await saves.copyToClipboard(saves.encodeSave(state));
    toast(ok ? '📋 Save copied to clipboard' : 'Could not access the clipboard — use Download instead', ok ? 'success' : 'error');
  },
  exportDownload() {
    save(false);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    saves.downloadText(`frostbyte-save-${stamp}.txt`, saves.encodeSave(state));
    toast('⬇️ Save file downloaded', 'success');
  },
  /** Returns an error message string, or null on success. */
  async importText(text) {
    let next;
    try {
      next = saves.decodeSave(text);
    } catch (e) {
      toast('Import failed', 'error');
      return e.message || 'Invalid save.';
    }
    const ok = await modal({
      title: 'Import save?',
      body: 'This replaces your current progress with the imported save.',
      okText: 'Import', cancelText: 'Cancel', danger: true,
    });
    if (!ok) return null;
    replaceState(next);
    runtime.boostMult = 1;
    runtime.boostRemaining = 0;
    lastTick = performance.now();
    const offline = saves.processOffline(state);
    saves.saveGame(state);
    ui.refreshAll();
    toast('✅ Save imported', 'success');
    showWelcomeBack(offline);
    return null;
  },
  async hardReset() {
    const first = await modal({
      title: 'Hard reset?',
      body: 'This deletes ALL progress, including Snowflakes and stats. It cannot be undone.',
      okText: 'Continue', cancelText: 'Cancel', danger: true,
    });
    if (!first) return;
    const second = await modal({
      title: 'Are you absolutely sure?',
      body: 'Last chance: everything will be wiped and you will start over from one snow shovel.',
      okText: 'Yes, wipe everything', cancelText: 'Keep my progress', danger: true,
    });
    if (!second) return;
    const keepSettings = { ...state.settings };
    saves.deleteSave();
    replaceState(createDefaultState());
    state.settings = keepSettings;
    runtime.boostMult = 1;
    runtime.boostRemaining = 0;
    lastTick = performance.now();
    saves.saveGame(state);
    ui.refreshAll();
    ui.selectTab('businesses');
    toast('Game reset. Grab your shovel! ❄️', 'info');
  },
};

/* ---------- Main loop ---------- */

let lastFrameAt = 0;

/** One step: advance time, events and UI. */
function step() {
  const dt = syncTime();
  events.update(dt, document.hidden);
  ui.frame(performance.now());
}

function loop() {
  lastFrameAt = performance.now();
  step();
  requestAnimationFrame(loop);
}

/**
 * Fallback: browsers can pause requestAnimationFrame for occluded windows or
 * embedded views while the page still counts as visible. If no frame has run
 * for a second, step from a timer so income, events and UI keep moving.
 * (Time itself is always delta-based, so nothing is lost either way.)
 */
function watchdog() {
  if (performance.now() - lastFrameAt > 1000) step();
}

/* ---------- Boot ---------- */

function boot() {
  const storageOK = saves.probeStorage();
  const loaded = saves.loadGame();
  if (loaded.state) replaceState(loaded.state);

  events = createEventSystem(state, runtime, {
    onSpawn: (ev) => ui.showEvent(ev),
    onExpire: () => ui.hideEvent(),
  });

  ui = initUI({ state, runtime, events, actions });

  if (!storageOK) {
    document.getElementById('storage-warning').hidden = false;
    document.getElementById('storage-note').textContent = 'Storage is unavailable (private mode or blocked). Progress will NOT persist after closing — use Export to keep it.';
  }
  if (loaded.error) {
    toast(`Your save could not be loaded (${loaded.error}). A backup was kept; starting a new game.`, 'error', 7000);
  }

  // Offline progress (only when resuming an existing save).
  if (loaded.state) {
    const result = saves.processOffline(state);
    ui.refreshAll();
    showWelcomeBack(result);
  } else {
    state.lastSaved = Date.now();
  }

  lastTick = performance.now();
  requestAnimationFrame(loop);
  setInterval(watchdog, 1000);

  // Autosave + lifecycle saves.
  setInterval(() => save(false), CONFIG.autosaveSeconds * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save(false);
    else syncTime();
  });
  window.addEventListener('beforeunload', () => save(false));
  window.addEventListener('pagehide', () => save(false));

  // The one exposed global, for debugging and testing.
  window.FB_DEBUG = {
    CONFIG,
    state,
    runtime,
    engine,
    saves,
    get events() { return events; },
    save: () => save(true),
    addCash(n) { engine.earn(state, Number(n) || 0); ui.refreshAll(); },
    /** Simulate time passing while away (credits managers only, like offline). */
    offline(seconds) { state.lastSaved = Date.now() - seconds * 1000; const r = saves.processOffline(state); ui.refreshAll(); showWelcomeBack(r); return r; },
    spawnEvent() { events.forceSpawn(); },
  };
}

boot();
