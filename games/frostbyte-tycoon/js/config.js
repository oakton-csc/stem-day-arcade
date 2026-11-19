/**
 * config.js — ALL game balance and content data for Frostbyte Tycoon.
 *
 * Rule: every number that affects balance lives here. Changing a value in this
 * file rebalances the game (and the Node simulator in /tools/sim.js) with no
 * other edits required.
 *
 * STEM DAY ARCADE BALANCE: tuned so a visitor sees most of the game in one short session.
 * Compared with the online version: costExponent 5.5 -> 3.5, startingCash 0 -> 50,
 * Snow Shoveling pays 2 instead of 1, managers and global upgrades cost a fifth as much
 * (globals also unlock at a fifth), the Blizzard Reset unlocks at 30M instead of 1B,
 * and random events come every 1-2 minutes instead of every 3-6.
 * A greedy test player gets its first manager at 0:14, tier 4 at 3:00, tier 5 at 4:40,
 * the Blizzard Reset at 6:40 and all ten businesses at about 7:15
 * (was: first manager 2:47, tier 4 at 11:49, tier 5 at 29:01).
 */

export const CONFIG = Object.freeze({
  /** Current save schema version. Bump when the save format changes and add a migration in save.js. */
  saveVersion: 1,
  saveKey: 'frostbyte_save_v1',
  autosaveSeconds: 10,

  /** Starting conditions for a fresh game (and after every Blizzard Reset). */
  startingCash: 50,
  /** Units owned at start, indexed by tier (tier 1 = index 0). */
  startingOwned: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],

  /**
   * Business cost formula: cost(n) = baseCost * (1 + costGrowth * n) ^ costExponent
   * where n = number currently owned.
   *
   * BALANCE NOTE: the original brief used exponent 2 (quadratic). With the
   * milestone (x8 speed, x243 profit), upgrade (x90) and global (x270)
   * multipliers, a quadratic curve lets every business pay for itself in
   * seconds and the sim reached tier 10 in ~7 minutes. 5.5 was chosen with
   * tools/sim.js so the pacing targets land within +/-25% (see README).
   */
  costGrowth: 0.1,
  costExponent: 3.5,
  /** Safety cap for bulk/max purchase loops. */
  bulkSafetyCap: 10000,
  /** Buy-quantity modes offered in the UI. 'max' = largest affordable amount. */
  buyModes: ['1', '10', '100', 'max'],

  /**
   * Businesses, unlocked in order. cycle is in seconds.
   * Revenue per cycle = baseRevenue * owned * all multipliers.
   *
   * BALANCE NOTE: baseCost, cycle and managerCost match the original brief.
   * baseRevenue was retuned so the un-multiplied payback time of the first
   * unit (baseCost * cycle / baseRevenue) is 10s * 3.3^(tier-1): tier 1 = 10s,
   * tier 10 ~ 5.4 days. Higher tiers are long-term investments that only
   * become worthwhile once upgrades and milestones multiply them.
   */
  businesses: [
    { id: 'shovel',   name: 'Snow Shoveling',        icon: '❄️', baseCost: 10,      baseRevenue: 2,       cycle: 1,   managerCost: 50,
      manager: 'Frosty Fred',
      upgrades: ['Ergonomic Handle', 'Heated Gloves', 'Snow Blower Attachment', 'Plow Truck'] },
    { id: 'cocoa',    name: 'Hot Cocoa Stand',       icon: '☕', baseCost: 120,     baseRevenue: 11,      cycle: 3,   managerCost: 600,
      manager: 'Cocoa Clara',
      upgrades: ['Marshmallow Topping', 'Premium Cocoa Beans', 'Cocoa Food Truck', 'Cocoa Franchise'] },
    { id: 'melt',     name: 'Ice Melting Crew',      icon: '🧂', baseCost: 1500,    baseRevenue: 83,      cycle: 6,   managerCost: 7500,
      manager: 'Salty Sam',
      upgrades: ['Rock Salt Bulk Deal', 'Heated Sprayers', 'Melt-o-Matic Trucks', 'Citywide Contract'] },
    { id: 'snowman',  name: 'Snowman Workshop',      icon: '⛄', baseCost: 18000,   baseRevenue: 600,     cycle: 12,  managerCost: 90000,
      manager: 'Button-Eyed Betty',
      upgrades: ['Carrot Supply Chain', 'Top Hat Imports', 'Snowman Assembly Line', 'Animatronic Snowmen'] },
    { id: 'sled',     name: 'Sled Rental Co.',       icon: '🛷', baseCost: 220000,  baseRevenue: 4500,    cycle: 24,  managerCost: 1100000,
      manager: 'Slippery Sid',
      upgrades: ['Waxed Runners', 'Toboggan Fleet', 'Dog Sled Teams', 'Hill Lift Network'] },
    { id: 'lodge',    name: 'Cozy Ski Lodge',        icon: '🏔️', baseCost: 2.6e6,   baseRevenue: 32000,   cycle: 48,  managerCost: 13000000,
      manager: 'Fireside Fiona',
      upgrades: ['Plush Armchairs', 'Hot Tub Deck', 'Gondola Access', 'Five-Star Chalets'] },
    { id: 'gallery',  name: 'Ice Sculpture Gallery', icon: '🧊', baseCost: 31e6,    baseRevenue: 230000,  cycle: 96,  managerCost: 155000000,
      manager: 'Chisel Chen',
      upgrades: ['Diamond Chisels', 'Neon Ice Lighting', 'Crystal Atrium', 'Touring Exhibitions'] },
    { id: 'festival', name: 'Winter Festival',       icon: '🎪', baseCost: 375e6,   baseRevenue: 1.7e6,   cycle: 192, managerCost: 1880000000,
      manager: 'Jolly Jasper',
      upgrades: ['Lantern Parade', 'Ice Rink Stage', 'Fireworks Finale', 'Global Livestream'] },
    { id: 'factory',  name: 'Snow Machine Factory',  icon: '🏭', baseCost: 4.5e9,   baseRevenue: 12e6,    cycle: 384, managerCost: 22400000000,
      manager: 'Gearhead Greta',
      upgrades: ['Turbo Nozzles', 'Cryo Compressors', 'Robotic Assembly', 'Weather Control Patent'] },
    { id: 'aurora',   name: 'Aurora Borealis Resort', icon: '🌌', baseCost: 54e9,   baseRevenue: 89e6,    cycle: 768, managerCost: 270000000000,
      manager: 'Starlight Stella',
      upgrades: ['Glass Igloo Suites', 'Northern Lights Tours', 'Orbital Viewing Deck', 'Aurora Ownership Rights'] },
  ],

  /**
   * Per-business milestones by owned count.
   * speed: cycle time is divided by mult. profit: revenue is multiplied by mult.
   */
  milestones: [
    { at: 25,  type: 'speed',  mult: 2 },
    { at: 50,  type: 'speed',  mult: 2 },
    { at: 100, type: 'speed',  mult: 2 },
    { at: 150, type: 'profit', mult: 3 },
    { at: 200, type: 'profit', mult: 3 },
    { at: 300, type: 'profit', mult: 3 },
    { at: 400, type: 'profit', mult: 3 },
    { at: 500, type: 'profit', mult: 3 },
  ],

  /**
   * Individual upgrade template applied to every business (names come from each business).
   * cost = costMult * business.baseCost, requires `requires` owned units.
   */
  upgradeTemplate: [
    { costMult: 25,     requires: 5,   mult: 2 },
    { costMult: 400,    requires: 25,  mult: 3 },
    { costMult: 6000,   requires: 75,  mult: 3 },
    { costMult: 100000, requires: 150, mult: 5 },
  ],

  /** Global upgrades: multiply all businesses. Unlock (become visible) when all-time lifetime earnings >= unlockAt. */
  globalUpgrades: [
    { id: 'socks',     name: 'Thermal Socks',      icon: '🧦', cost: 1000,  unlockAt: 500,  mult: 1.5 },
    { id: 'mittens',   name: 'Mittens Pro',        icon: '🧤', cost: 100000,  unlockAt: 50000,  mult: 2 },
    { id: 'fireplace', name: 'Fireplace Network',  icon: '🔥', cost: 10000000,  unlockAt: 5000000,  mult: 2 },
    { id: 'cocoasub',  name: 'Cocoa Subscription', icon: '🍫', cost: 1000000000,  unlockAt: 500000000,  mult: 3 },
    { id: 'satellite', name: 'Weather Satellite',  icon: '🛰️', cost: 5e11, unlockAt: 2.5e11, mult: 3 },
    { id: 'charter',   name: 'Winter Charter',     icon: '📜', cost: 5e13, unlockAt: 2.5e13, mult: 5 },
  ],

  /** Prestige ("Blizzard Reset"). */
  prestige: {
    unlockLifetime: 3e7,       // all-time lifetime earnings required to unlock
    divisor: 3e7,              // total flakes = floor(sqrt(lifetime / divisor))
    bonusPerFlake: 0.02,       // +2% income per snowflake held (additive between flakes)
  },

  /** Permanent Snowflake shop upgrades (cost paid in snowflakes; survive resets). */
  snowflakeShop: [
    { id: 'autoManagers', name: 'Auto-Start Tier 1-3 Managers', icon: '🤖', cost: 50,
      desc: 'Managers for the first 3 businesses are hired for free and survive every Blizzard Reset.', managerTiers: 3 },
    { id: 'startShovelers', name: 'Start With 10 Shovelers', icon: '🧑‍🔧', cost: 100,
      desc: 'Every new run starts with 10 Snow Shoveling units.', startOwnedTier1: 10 },
    { id: 'offlineBoost', name: 'Offline Cap +4 hours', icon: '🌙', cost: 200,
      desc: 'Offline earnings accumulate for 4 extra hours.', offlineBonusHours: 4 },
  ],

  /** Offline progress. Only businesses with managers earn while away. */
  offline: {
    baseCapHours: 8,
    minSecondsForModal: 10,
  },

  /** Random events (Snowstorm / Golden Snowflake). Times in seconds. */
  events: {
    minInterval: 60,
    maxInterval: 120,
    visibleFor: 15,
    boostMult: 7,
    boostDuration: 30,
    cashMinutes: 10,
    /** Chance the reward is the income boost (otherwise instant cash). */
    boostChance: 0.5,
  },
});
