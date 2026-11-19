/**
 * engine.js — pure game logic: cost math, income math, ticking, purchases,
 * managers, upgrades and prestige.
 *
 * Every function takes the state object explicitly (no DOM access), so the
 * same code drives both the browser game and the Node simulator (tools/sim.js).
 */
import { CONFIG } from './config.js';
import { createRunState } from './state.js';

const NEUTRAL_RUNTIME = Object.freeze({ boostMult: 1, boostRemaining: 0 });

/* ======================================================================
 * Safety
 * ==================================================================== */

/** Replace NaN/Infinity with a safe value and warn once per label. */
const warned = new Set();
export function safe(x, fallback = 0, label = 'value') {
  if (Number.isFinite(x)) return x;
  if (!warned.has(label)) {
    warned.add(label);
    console.warn(`[Frostbyte] Non-finite ${label} (${x}) clamped.`);
  }
  if (x === Infinity) return Number.MAX_VALUE;
  if (x === -Infinity) return -Number.MAX_VALUE;
  return fallback;
}

/* ======================================================================
 * Cost math
 * ==================================================================== */

/** Cost of the next unit when `n` are owned: baseCost * (1 + g*n)^e. */
export function unitCost(i, n) {
  const b = CONFIG.businesses[i];
  return b.baseCost * Math.pow(1 + CONFIG.costGrowth * n, CONFIG.costExponent);
}

/** Sum of cost(n) .. cost(n+k-1). */
export function bulkCost(i, n, k) {
  const cap = Math.min(k, CONFIG.bulkSafetyCap);
  let total = 0;
  for (let j = 0; j < cap; j++) total += unitCost(i, n + j);
  return total;
}

/** Largest k such that bulkCost(i, n, k) <= cash (capped). Returns { k, cost }. */
export function maxAffordable(i, n, cash) {
  let k = 0;
  let total = 0;
  while (k < CONFIG.bulkSafetyCap) {
    const next = unitCost(i, n + k);
    if (total + next > cash) break;
    total += next;
    k++;
  }
  return { k, cost: total };
}

/**
 * Quote a purchase for the given buy mode ('1' | '10' | '100' | 'max').
 * Returns { k, cost, affordable }. In max mode with nothing affordable,
 * quotes a single unit so the UI can still show the price.
 */
export function purchaseQuote(s, i, mode) {
  const n = s.businesses[i].owned;
  if (mode === 'max') {
    const m = maxAffordable(i, n, s.cash);
    if (m.k === 0) return { k: 1, cost: unitCost(i, n), affordable: false };
    return { k: m.k, cost: m.cost, affordable: true };
  }
  const k = Math.max(1, parseInt(mode, 10) || 1);
  const cost = bulkCost(i, n, k);
  return { k, cost, affordable: s.cash >= cost };
}

/* ======================================================================
 * Multipliers
 * ==================================================================== */

/** Milestone effects for an owned count. */
export function milestoneInfo(owned) {
  let speed = 1;
  let profit = 1;
  let next = null;
  let prevAt = 0;
  for (const m of CONFIG.milestones) {
    if (owned >= m.at) {
      if (m.type === 'speed') speed *= m.mult;
      else profit *= m.mult;
      prevAt = m.at;
    } else if (!next) {
      next = m;
    }
  }
  return { speed, profit, next, prevAt };
}

/** Product of a business's purchased individual upgrades. */
export function upgradeMultiplier(s, i) {
  let m = 1;
  CONFIG.upgradeTemplate.forEach((u, j) => { if (s.upgrades[i][j]) m *= u.mult; });
  return m;
}

/** Product of purchased global upgrades. */
export function globalMultiplier(s) {
  let m = 1;
  CONFIG.globalUpgrades.forEach((g, j) => { if (s.globals[j]) m *= g.mult; });
  return m;
}

/** Snowflake bonus: 1 + bonusPerFlake * snowflakes held. */
export function prestigeMultiplier(s) {
  return 1 + CONFIG.prestige.bonusPerFlake * s.snowflakes;
}

/**
 * Full stats for business i. `ownedOverride` lets callers (the sim, previews)
 * ask "what if I owned X units?".
 */
export function businessStats(s, i, ownedOverride) {
  const b = CONFIG.businesses[i];
  const owned = ownedOverride ?? s.businesses[i].owned;
  const ms = milestoneInfo(owned);
  const profitMult = ms.profit * upgradeMultiplier(s, i) * globalMultiplier(s) * prestigeMultiplier(s);
  const cycle = b.cycle / ms.speed;
  const revenue = safe(b.baseRevenue * owned * profitMult, 0, 'revenue');
  return { owned, cycle, revenue, rate: revenue / cycle, speedMult: ms.speed, profitMult, milestone: ms };
}

/** Income/sec if every owned business were running continuously (managed or not). */
export function incomePerSecond(s, rt = NEUTRAL_RUNTIME) {
  let total = 0;
  for (let i = 0; i < CONFIG.businesses.length; i++) {
    if (s.businesses[i].owned > 0) total += businessStats(s, i).rate;
  }
  return safe(total * (rt.boostRemaining > 0 ? rt.boostMult : 1), 0, 'incomePerSecond');
}

/** Income/sec from managed businesses only (what accrues offline). */
export function managedIncomePerSecond(s) {
  let total = 0;
  for (let i = 0; i < CONFIG.businesses.length; i++) {
    const bs = s.businesses[i];
    if (bs.managed && bs.owned > 0) total += businessStats(s, i).rate;
  }
  return safe(total, 0, 'managedIncome');
}

/* ======================================================================
 * Earning + ticking
 * ==================================================================== */

/** Credit cash and update earnings stats (NaN/Infinity guarded). */
export function earn(s, amount) {
  amount = safe(amount, 0, 'earned');
  if (amount <= 0) return 0;
  s.cash = safe(s.cash + amount, s.cash, 'cash');
  s.runEarnings = safe(s.runEarnings + amount, s.runEarnings, 'runEarnings');
  s.stats.lifetimeEarnings = safe(s.stats.lifetimeEarnings + amount, s.stats.lifetimeEarnings, 'lifetimeEarnings');
  return amount;
}

/**
 * Advance the simulation by dt seconds (delta-time based, any size).
 * Managed businesses loop and may complete several cycles per tick.
 * Unmanaged businesses complete at most their current cycle and then stop.
 * Returns cash earned this tick.
 */
export function tick(s, dt, rt = NEUTRAL_RUNTIME) {
  dt = safe(dt, 0, 'dt');
  if (dt <= 0) return 0;
  s.stats.playtime += dt;

  let earned = 0;
  for (let i = 0; i < CONFIG.businesses.length; i++) {
    const bs = s.businesses[i];
    if (bs.owned <= 0) continue;
    if (!bs.managed && !bs.running) continue;
    const st = businessStats(s, i);
    bs.progress += dt / st.cycle;
    if (bs.managed) {
      bs.running = true;
      const completions = Math.floor(bs.progress);
      if (completions > 0) {
        earned += completions * st.revenue;
        bs.progress -= completions;
      }
    } else if (bs.progress >= 1) {
      earned += st.revenue;
      bs.progress = 0;
      bs.running = false;
    }
    bs.progress = safe(bs.progress, 0, 'progress');
  }

  // Event boost applies to the fraction of this tick it was active for.
  if (rt.boostRemaining > 0) {
    const frac = Math.min(dt, rt.boostRemaining) / dt;
    earned *= 1 + (rt.boostMult - 1) * frac;
    rt.boostRemaining = Math.max(0, rt.boostRemaining - dt);
    if (rt.boostRemaining === 0) rt.boostMult = 1;
  }
  return earn(s, earned);
}

/* ======================================================================
 * Actions
 * ==================================================================== */

/** Tier N+1 is unlocked once tier N is owned at least once. */
export function isUnlocked(s, i) {
  return i === 0 || s.businesses[i - 1].owned > 0 || s.businesses[i].owned > 0;
}

/** Buy businesses using the given mode. Returns number bought (0 on failure). */
export function buyBusiness(s, i, mode = '1') {
  if (!isUnlocked(s, i)) return 0;
  const q = purchaseQuote(s, i, mode);
  if (q.k <= 0 || s.cash < q.cost) return 0;
  s.cash = Math.max(0, s.cash - q.cost);
  s.businesses[i].owned += q.k;
  if (s.businesses[i].managed) s.businesses[i].running = true;
  s.stats.highestTier = Math.max(s.stats.highestTier, i + 1);
  return q.k;
}

/** Manually start a cycle (click). Returns true if a cycle started. */
export function startCycle(s, i) {
  const bs = s.businesses[i];
  if (bs.owned <= 0 || bs.running || bs.managed) return false;
  bs.running = true;
  bs.progress = 0;
  s.stats.totalClicks++;
  return true;
}

export const managerCost = (i) => CONFIG.businesses[i].managerCost;

export function canHireManager(s, i) {
  const bs = s.businesses[i];
  return !bs.managed && bs.owned > 0 && s.cash >= managerCost(i);
}

export function hireManager(s, i) {
  if (!canHireManager(s, i)) return false;
  s.cash -= managerCost(i);
  const bs = s.businesses[i];
  bs.managed = true;
  bs.running = true;
  return true;
}

export const upgradeCost = (i, j) => CONFIG.upgradeTemplate[j].costMult * CONFIG.businesses[i].baseCost;

/** Upgrade j of business i is visible once the business is unlocked. */
export function upgradeRequirementMet(s, i, j) {
  return s.businesses[i].owned >= CONFIG.upgradeTemplate[j].requires;
}

export function canBuyUpgrade(s, i, j) {
  return !s.upgrades[i][j] && upgradeRequirementMet(s, i, j) && s.cash >= upgradeCost(i, j);
}

export function buyUpgrade(s, i, j) {
  if (!canBuyUpgrade(s, i, j)) return false;
  s.cash -= upgradeCost(i, j);
  s.upgrades[i][j] = true;
  return true;
}

export function globalUnlocked(s, j) {
  return s.stats.lifetimeEarnings >= CONFIG.globalUpgrades[j].unlockAt;
}

export function canBuyGlobal(s, j) {
  return !s.globals[j] && globalUnlocked(s, j) && s.cash >= CONFIG.globalUpgrades[j].cost;
}

export function buyGlobal(s, j) {
  if (!canBuyGlobal(s, j)) return false;
  s.cash -= CONFIG.globalUpgrades[j].cost;
  s.globals[j] = true;
  return true;
}

/* ======================================================================
 * Offline progress
 * ==================================================================== */

export function offlineCapSeconds(s) {
  const bonus = CONFIG.snowflakeShop.find((x) => x.id === 'offlineBoost');
  const hours = CONFIG.offline.baseCapHours + (s.shop.offlineBoost && bonus ? bonus.offlineBonusHours : 0);
  return hours * 3600;
}

/**
 * Credit offline earnings for `elapsed` seconds away. Negative elapsed (clock
 * changed) counts as 0; elapsed is capped by offlineCapSeconds.
 */
export function applyOffline(s, elapsed) {
  elapsed = safe(elapsed, 0, 'offlineElapsed');
  if (elapsed < 0) elapsed = 0;
  const credited = Math.min(elapsed, offlineCapSeconds(s));
  const rate = managedIncomePerSecond(s);
  const earned = earn(s, rate * credited);
  // Keep managed progress bars moving so they don't all restart at 0.
  for (let i = 0; i < CONFIG.businesses.length; i++) {
    const bs = s.businesses[i];
    if (bs.managed && bs.owned > 0) {
      const st = businessStats(s, i);
      bs.progress = (bs.progress + credited / st.cycle) % 1;
    }
  }
  return { elapsed, credited, earned, capped: elapsed > credited };
}

/* ======================================================================
 * Prestige — Blizzard Reset
 * ==================================================================== */

/** Total snowflakes a lifetime-earnings value is worth. */
export function totalSnowflakesFor(lifetime) {
  return Math.floor(Math.sqrt(Math.max(0, lifetime) / CONFIG.prestige.divisor));
}

export function pendingSnowflakes(s) {
  return Math.max(0, totalSnowflakesFor(s.stats.lifetimeEarnings) - s.snowflakesClaimed);
}

export function prestigeUnlocked(s) {
  return s.stats.lifetimeEarnings >= CONFIG.prestige.unlockLifetime;
}

export function canPrestige(s) {
  return prestigeUnlocked(s) && pendingSnowflakes(s) > 0;
}

/**
 * Perform a Blizzard Reset. Wipes run state (cash, businesses, upgrades,
 * managers); keeps snowflakes, stats, shop purchases and settings.
 * Returns snowflakes gained.
 */
export function doPrestige(s) {
  if (!canPrestige(s)) return 0;
  const gain = pendingSnowflakes(s);
  s.snowflakesClaimed += gain;
  s.snowflakes += gain;
  s.stats.resets += 1;
  Object.assign(s, createRunState(s.shop));
  return gain;
}

export function canBuyShop(s, id) {
  const item = CONFIG.snowflakeShop.find((x) => x.id === id);
  return !!item && !s.shop[id] && s.snowflakes >= item.cost;
}

/** Buy a permanent snowflake-shop upgrade (spends snowflakes). */
export function buyShop(s, id) {
  if (!canBuyShop(s, id)) return false;
  const item = CONFIG.snowflakeShop.find((x) => x.id === id);
  s.snowflakes -= item.cost;
  s.shop[id] = true;
  if (item.managerTiers) {
    for (let i = 0; i < item.managerTiers && i < s.businesses.length; i++) {
      s.businesses[i].managed = true;
      if (s.businesses[i].owned > 0) s.businesses[i].running = true;
    }
  }
  return true;
}
