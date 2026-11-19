/**
 * events.js — random events. Every minInterval..maxInterval seconds (only
 * while the tab is visible) a clickable Snowstorm or Golden Snowflake appears
 * for `visibleFor` seconds. Only one event can be active at a time.
 *
 *   Snowstorm        -> x boostMult income for boostDuration seconds
 *   Golden Snowflake -> instant cash = cashMinutes of current income
 */
import { CONFIG } from './config.js';
import { incomePerSecond, earn } from './engine.js';

export const EVENT_TYPES = {
  snowstorm: { id: 'snowstorm', name: 'Snowstorm', icon: '🌨️' },
  golden: { id: 'golden', name: 'Golden Snowflake', icon: '❄️' },
};

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Create the event system.
 * @param {object} s       game state
 * @param {object} rt      runtime (boost values)
 * @param {object} hooks   { onSpawn(event), onExpire(event), onClaim(event, reward) }
 */
export function createEventSystem(s, rt, hooks = {}) {
  const C = CONFIG.events;
  let untilNext = rand(C.minInterval, C.maxInterval);
  let active = null; // { type, remaining }

  function spawn() {
    const type = Math.random() < C.boostChance ? EVENT_TYPES.snowstorm : EVENT_TYPES.golden;
    active = { type, remaining: C.visibleFor };
    hooks.onSpawn?.(active);
  }

  return {
    get active() { return active; },

    /** Advance timers. Does nothing while the tab is hidden. */
    update(dt, hidden) {
      if (hidden || !(dt > 0)) return;
      dt = Math.min(dt, 1); // never let a long frame skip a whole event
      if (active) {
        active.remaining -= dt;
        if (active.remaining <= 0) {
          const ev = active;
          active = null;
          untilNext = rand(C.minInterval, C.maxInterval);
          hooks.onExpire?.(ev);
        }
        return;
      }
      untilNext -= dt;
      if (untilNext <= 0) spawn();
    },

    /** Player clicked the event. Returns a reward description or null. */
    claim() {
      if (!active) return null;
      const ev = active;
      active = null;
      untilNext = rand(C.minInterval, C.maxInterval);
      let reward;
      if (ev.type.id === 'snowstorm') {
        rt.boostMult = C.boostMult;
        rt.boostRemaining = C.boostDuration;
        reward = { kind: 'boost', mult: C.boostMult, duration: C.boostDuration };
      } else {
        const amount = earn(s, incomePerSecond(s) * C.cashMinutes * 60);
        reward = { kind: 'cash', amount };
      }
      s.stats.eventsClaimed += 1;
      hooks.onClaim?.(ev, reward);
      return reward;
    },

    /** Debug helper: force an event to appear now. */
    forceSpawn() { if (!active) spawn(); },
  };
}
