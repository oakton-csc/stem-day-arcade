/**
 * state.js — the single game state object, its defaults, and small getters.
 *
 * The persisted state is a plain JSON-serialisable object. Runtime-only values
 * (active event boost, etc.) live in `runtime`, which is never saved.
 */
import { CONFIG } from './config.js';

/** Build the per-run portion of state (wiped by a Blizzard Reset). */
export function createRunState(shop = {}) {
  const startOwned = CONFIG.startingOwned.slice();
  const shopShovel = CONFIG.snowflakeShop.find((s) => s.id === 'startShovelers');
  if (shop.startShovelers && shopShovel) startOwned[0] = Math.max(startOwned[0], shopShovel.startOwnedTier1);

  const autoMgr = CONFIG.snowflakeShop.find((s) => s.id === 'autoManagers');
  const autoTiers = shop.autoManagers && autoMgr ? autoMgr.managerTiers : 0;

  return {
    cash: CONFIG.startingCash,
    runEarnings: 0,
    businesses: CONFIG.businesses.map((_, i) => ({
      owned: startOwned[i] || 0,
      managed: i < autoTiers,
      running: false,
      progress: 0, // 0..1 of the current cycle
    })),
    upgrades: CONFIG.businesses.map(() => CONFIG.upgradeTemplate.map(() => false)),
    globals: CONFIG.globalUpgrades.map(() => false),
  };
}

/** Build a brand new game state. */
export function createDefaultState() {
  const shop = Object.fromEntries(CONFIG.snowflakeShop.map((s) => [s.id, false]));
  return {
    version: CONFIG.saveVersion,
    ...createRunState(shop),
    snowflakes: 0,          // current spendable balance (each gives income bonus)
    snowflakesClaimed: 0,   // total ever claimed via resets (used by the prestige formula)
    shop,
    stats: {
      lifetimeEarnings: 0,  // all-time, survives resets
      playtime: 0,          // seconds
      resets: 0,
      highestTier: 1,
      totalClicks: 0,
      eventsClaimed: 0,
      createdAt: Date.now(),
    },
    settings: {
      snow: true,
      numberFormat: 'suffix', // 'suffix' | 'scientific'
      buyMode: '1',
    },
    lastSaved: Date.now(),
  };
}

/** Runtime-only (non-persisted) values. */
export function createRuntime() {
  return {
    boostMult: 1,
    boostRemaining: 0, // seconds of active event boost
  };
}

/** The one live game state used by the browser game. Mutated in place. */
export const state = createDefaultState();
export const runtime = createRuntime();

/** Replace the live state's contents in place (keeps the same object identity). */
export function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
}

/* ---------- Getters ---------- */
export const getBusiness = (s, i) => s.businesses[i];
export const getOwned = (s, i) => s.businesses[i].owned;
export const isManaged = (s, i) => s.businesses[i].managed;
export const hasUpgrade = (s, i, j) => !!s.upgrades[i][j];
export const hasGlobal = (s, j) => !!s.globals[j];
export const hasShop = (s, id) => !!s.shop[id];
