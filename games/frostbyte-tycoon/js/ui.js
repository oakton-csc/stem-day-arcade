/**
 * ui.js — DOM rendering, event binding, animations, toasts, modals and the
 * falling-snow background.
 *
 * Rendering strategy: every element is built once and then updated in place
 * (text/classes only change when values change). Lists that can change shape
 * (upgrades) are reconciled by key, so focus and scroll position survive.
 * Progress bars update every animation frame; text updates ~10x per second.
 */
import { CONFIG } from './config.js';
import * as E from './engine.js';
import { formatMoney, formatNumber, formatTime, setNumberMode } from './format.js';

/* ======================================================================
 * Small DOM helpers
 * ==================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);

/** Income bonus (in %) for n snowflakes, without float noise (0.02*7*100 = 14.000000000000002). */
const bonusPct = (n) => formatNumber(Number((n * CONFIG.prestige.bonusPerFlake * 100).toPrecision(12)));

/** Create an element: h('button', { class: 'x', dataset: {...}, 'aria-label': '..' }, ...children) */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && !k.includes('-')) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

/** Only touch the DOM when the text actually changes. */
function setText(el, t) {
  if (el.textContent !== t) el.textContent = t;
}
function setAttr(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function setHidden(el, hidden) {
  if (el.hidden !== hidden) el.hidden = hidden;
}

/**
 * Keyed list reconciliation. items: [{ key, create(): Element, update(el) }]
 * Elements are reused by key and re-ordered without being recreated.
 */
function syncList(container, items) {
  const map = container._keyed || (container._keyed = new Map());
  const seen = new Set();
  let prev = null;
  for (const item of items) {
    seen.add(item.key);
    let el = map.get(item.key);
    if (!el) {
      el = item.create();
      el.dataset.key = item.key;
      map.set(item.key, el);
    }
    item.update(el);
    const expectedNext = prev ? prev.nextSibling : container.firstChild;
    if (expectedNext !== el) container.insertBefore(el, expectedNext);
    prev = el;
  }
  for (const [key, el] of map) {
    if (!seen.has(key)) { el.remove(); map.delete(key); }
  }
}

/** Replay a CSS animation class on an element. */
function flash(el, cls = 'pop') {
  el.classList.remove(cls);
  void el.offsetWidth; // restart animation
  el.classList.add(cls);
}

/* ======================================================================
 * Toasts + modal
 * ==================================================================== */

export function toast(message, kind = 'info', ms = 2600) {
  const host = $('#toasts');
  const el = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  host.append(el);
  while (host.children.length > 4) host.firstChild.remove();
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/**
 * Show a modal dialog. Resolves true if the primary button was pressed.
 * body: string or Node(s).
 */
export function modal({ title, body, okText = 'OK', cancelText = null, danger = false }) {
  const dlg = $('#modal');
  return new Promise((resolve) => {
    const titleEl = h('h2', { id: 'modal-title', text: title });
    const bodyEl = h('div', { class: 'modal-body' }, typeof body === 'string' ? h('p', { text: body }) : body);
    const ok = h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: okText });
    const cancel = cancelText ? h('button', { type: 'button', class: 'btn btn-ghost', text: cancelText }) : null;
    dlg.replaceChildren(h('div', { class: 'modal-card' }, titleEl, bodyEl, h('div', { class: 'modal-actions' }, cancel, ok)));
    dlg.setAttribute('aria-labelledby', 'modal-title');

    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      dlg.removeEventListener('cancel', onCancel);
      if (dlg.open) dlg.close();
      resolve(result);
    };
    const onCancel = (e) => { e.preventDefault(); finish(false); };
    dlg.addEventListener('cancel', onCancel);
    ok.addEventListener('click', () => finish(true));
    cancel?.addEventListener('click', () => finish(false));
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    (cancel || ok).focus();
  });
}

/* ======================================================================
 * Falling snow (canvas). Lightweight; off when disabled or reduced motion.
 * ==================================================================== */

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const snow = { canvas: null, ctx: null, flakes: [], enabled: false, raf: 0, last: 0 };

function resizeSnow() {
  const c = snow.canvas;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.floor(window.innerWidth * dpr);
  c.height = Math.floor(window.innerHeight * dpr);
  snow.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const target = Math.round(Math.min(110, (window.innerWidth * window.innerHeight) / 14000));
  while (snow.flakes.length < target) snow.flakes.push(newFlake(true));
  snow.flakes.length = target;
}

function newFlake(anywhere) {
  return {
    x: Math.random() * window.innerWidth,
    y: anywhere ? Math.random() * window.innerHeight : -10,
    r: 0.8 + Math.random() * 2.4,
    vy: 18 + Math.random() * 40,
    drift: Math.random() * Math.PI * 2,
    a: 0.35 + Math.random() * 0.5,
  };
}

function snowFrame(t) {
  if (!snow.enabled) return;
  const dt = Math.min(0.05, (t - (snow.last || t)) / 1000);
  snow.last = t;
  const { ctx } = snow;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.fillStyle = '#ffffff';
  for (const f of snow.flakes) {
    f.drift += dt * 0.8;
    f.y += f.vy * dt;
    f.x += Math.sin(f.drift) * 12 * dt;
    if (f.y > window.innerHeight + 5) Object.assign(f, newFlake(false));
    ctx.globalAlpha = f.a;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  snow.raf = requestAnimationFrame(snowFrame);
}

/** Enable/disable the snow effect (always off under prefers-reduced-motion). */
export function setSnowEnabled(on) {
  const want = !!on && !reducedMotion?.matches;
  if (want === snow.enabled) return;
  snow.enabled = want;
  snow.canvas.hidden = !want;
  if (want) {
    resizeSnow();
    snow.last = 0;
    snow.raf = requestAnimationFrame(snowFrame);
  } else {
    cancelAnimationFrame(snow.raf);
    snow.ctx.clearRect(0, 0, snow.canvas.width, snow.canvas.height);
  }
}

/* ======================================================================
 * UI controller
 * ==================================================================== */

/**
 * Build and wire the whole UI.
 * ctx = { state, runtime, events, actions: { save, exportCopy, exportDownload, importText, hardReset } }
 * Returns { frame(now), refreshAll(), showEvent(ev), hideEvent(ev) }.
 */
export function initUI(ctx) {
  const s = ctx.state;
  const rt = ctx.runtime;
  const desktop = window.matchMedia('(min-width: 960px)');

  /* ---------- Snow ---------- */
  snow.canvas = $('#snow');
  snow.ctx = snow.canvas.getContext('2d');
  window.addEventListener('resize', () => { if (snow.enabled) resizeSnow(); });
  reducedMotion?.addEventListener?.('change', () => { setSnowEnabled(false); setSnowEnabled(s.settings.snow); });

  /* ---------- Header ---------- */
  const hud = {
    cash: $('#hud-cash'),
    income: $('#hud-income'),
    flakes: $('#hud-flakes'),
    flakesCount: h('span'),
    flakesBonus: h('span', { class: 'hide-sm' }),
    boost: $('#boost-banner'),
  };

  // Keep sticky offsets in sync with the real header/tab-bar heights.
  const headerEl = $('.topbar');
  const tabsEl = $('.tabs');
  const syncHeights = () => {
    document.documentElement.style.setProperty('--header-h', `${headerEl.offsetHeight}px`);
    document.documentElement.style.setProperty('--tabs-h', `${tabsEl.offsetHeight}px`);
  };
  if ('ResizeObserver' in window) new ResizeObserver(syncHeights).observe(headerEl);
  window.addEventListener('resize', syncHeights);
  syncHeights();

  hud.flakes.replaceChildren(hud.flakesCount, hud.flakesBonus);

  /* ---------- Tabs ---------- */
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  let activeTab = 'businesses';
  let sideTab = 'upgrades';

  function selectTab(name, focus = false) {
    if (desktop.matches && name === 'businesses') name = sideTab;
    activeTab = name;
    if (name !== 'businesses') sideTab = name;
    for (const t of tabs) {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
      setHidden($('#' + t.getAttribute('aria-controls')), !on);
    }
    // On desktop the business list is always visible in its own column.
    if (desktop.matches) setHidden($('#panel-businesses'), false);
    refreshText();
  }
  tabs.forEach((t) => {
    t.addEventListener('click', () => selectTab(t.dataset.tab));
    t.addEventListener('keydown', (e) => {
      const visibleTabs = tabs.filter((x) => x.offsetParent !== null);
      const idx = visibleTabs.indexOf(t);
      let next = null;
      if (e.key === 'ArrowRight') next = visibleTabs[(idx + 1) % visibleTabs.length];
      else if (e.key === 'ArrowLeft') next = visibleTabs[(idx - 1 + visibleTabs.length) % visibleTabs.length];
      else if (e.key === 'Home') next = visibleTabs[0];
      else if (e.key === 'End') next = visibleTabs[visibleTabs.length - 1];
      if (next) { e.preventDefault(); selectTab(next.dataset.tab, true); }
    });
  });
  desktop.addEventListener('change', () => selectTab(activeTab));

  /* ---------- Buy-mode selector ---------- */
  const modeBtns = [...document.querySelectorAll('[data-buy-mode]')];
  function syncBuyMode() {
    for (const b of modeBtns) b.setAttribute('aria-checked', String(b.dataset.buyMode === s.settings.buyMode));
  }
  modeBtns.forEach((b) => b.addEventListener('click', () => {
    s.settings.buyMode = b.dataset.buyMode;
    syncBuyMode();
    refreshText();
  }));

  /* ---------- Business cards ---------- */
  const bizList = $('#biz-list');
  const cards = CONFIG.businesses.map((b, i) => {
    const r = {};
    r.ownedEl = h('span', { class: 'owned', 'aria-hidden': 'true' });
    r.runBtn = h('button', { type: 'button', class: 'biz-icon', dataset: { action: 'run', i } },
      h('span', { class: 'emoji', 'aria-hidden': 'true', text: b.icon }), r.ownedEl);
    r.name = h('h3', { class: 'biz-name', text: b.name });
    r.mgr = h('span', { class: 'mgr-badge' });
    r.fill = h('div', { class: 'bar-fill' });
    r.barRev = h('span', { class: 'bar-rev' });
    r.barTime = h('span', { class: 'bar-time' });
    r.bar = h('div', { class: 'bar', role: 'progressbar', 'aria-label': `${b.name} cycle progress`, 'aria-valuemin': '0', 'aria-valuemax': '100' },
      r.fill, r.barRev, r.barTime);
    r.msText = h('span', { class: 'ms-text' });
    r.msFill = h('div', { class: 'ms-fill' });
    r.ms = h('div', { class: 'ms' }, r.msText, h('div', { class: 'ms-track', 'aria-hidden': 'true' }, r.msFill));
    r.lockInfo = h('p', { class: 'lock-info' });
    r.buyQty = h('span', { class: 'buy-qty' });
    r.buyCost = h('span', { class: 'buy-cost' });
    r.buyNext = h('span', { class: 'buy-next' });
    r.buy = h('button', { type: 'button', class: 'buy', dataset: { action: 'buy', i } }, r.buyQty, r.buyCost, r.buyNext);
    r.card = h('article', { class: 'biz', 'aria-label': b.name },
      r.runBtn,
      h('div', { class: 'biz-body' }, h('div', { class: 'biz-top' }, r.name, r.mgr), r.bar, r.ms, r.lockInfo),
      r.buy);
    bizList.append(r.card);
    return r;
  });

  function updateCardProgress(i) {
    const r = cards[i];
    const bs = s.businesses[i];
    if (bs.owned <= 0) { r.fill.style.transform = 'scaleX(0)'; return; }
    const st = E.businessStats(s, i);
    const fast = st.cycle < 0.25 && (bs.managed || bs.running);
    r.bar.classList.toggle('fast', fast);
    r.fill.style.transform = `scaleX(${fast ? 1 : Math.min(1, bs.progress)})`;
  }

  function updateCard(i) {
    const b = CONFIG.businesses[i];
    const r = cards[i];
    const bs = s.businesses[i];
    const unlocked = E.isUnlocked(s, i);
    r.card.classList.toggle('locked', !unlocked);
    r.card.classList.toggle('owned-none', bs.owned === 0);
    setText(r.ownedEl, String(bs.owned));
    setHidden(r.bar, !unlocked || bs.owned === 0);
    setHidden(r.ms, !unlocked || bs.owned === 0);
    setHidden(r.lockInfo, unlocked && bs.owned > 0);
    setHidden(r.mgr, !unlocked);

    // Run button (manual cycle)
    const canRun = bs.owned > 0 && !bs.managed && !bs.running;
    r.runBtn.classList.toggle('ready', canRun);
    setAttr(r.runBtn, 'aria-disabled', String(!canRun));
    setAttr(r.runBtn, 'aria-label', bs.managed ? `${b.name}: running automatically (manager hired), ${bs.owned} owned`
      : `Start ${b.name} cycle, ${bs.owned} owned`);

    // Manager badge
    setText(r.mgr, bs.managed ? `🤖 ${b.manager}` : 'Manual');
    r.mgr.classList.toggle('on', bs.managed);

    if (!unlocked) {
      setText(r.lockInfo, `🔒 Buy a ${CONFIG.businesses[i - 1].name} to unlock`);
    } else if (bs.owned === 0) {
      setText(r.lockInfo, `Earns ${formatMoney(b.baseRevenue)} every ${formatTime(b.cycle)} per unit (before bonuses)`);
    }

    if (bs.owned > 0) {
      const st = E.businessStats(s, i);
      setText(r.barRev, `${formatMoney(st.revenue)} / cycle`);
      const left = bs.managed || bs.running ? st.cycle * (1 - bs.progress) : st.cycle;
      setText(r.barTime, bs.managed || bs.running ? formatTime(left) : `▶ ${formatTime(st.cycle)}`);
      setAttr(r.bar, 'aria-valuenow', String(Math.round(Math.min(1, bs.progress) * 100)));
      const ms = st.milestone;
      if (ms.next) {
        setText(r.msText, `Next milestone ${bs.owned}/${ms.next.at}: ${ms.next.type === 'speed' ? 'Speed' : 'Profit'} ×${ms.next.mult}`);
        r.msFill.style.transform = `scaleX(${(bs.owned - ms.prevAt) / (ms.next.at - ms.prevAt)})`;
      } else {
        setText(r.msText, 'All milestones reached ✨');
        r.msFill.style.transform = 'scaleX(1)';
      }
    }

    // Buy button
    const q = E.purchaseQuote(s, i, s.settings.buyMode);
    const affordable = unlocked && s.cash >= q.cost;
    setText(r.buyQty, unlocked ? `Buy ×${q.k}` : 'Locked');
    setText(r.buyCost, formatMoney(q.cost));
    setText(r.buyNext, q.k > 1 ? `next: ${formatMoney(E.unitCost(i, bs.owned))}` : '');
    r.buy.classList.toggle('affordable', affordable);
    setAttr(r.buy, 'aria-disabled', String(!affordable));
    setAttr(r.buy, 'aria-label', unlocked ? `Buy ${q.k} ${b.name} for ${formatMoney(q.cost)}` : `${b.name} locked, costs ${formatMoney(q.cost)}`);
  }

  /* ---------- Upgrades panel ---------- */
  const globalList = $('#global-list');
  const upgList = $('#upgrade-list');
  const ownedUpgList = $('#owned-upgrade-list');
  const ownedSummary = $('#owned-upgrade-summary');

  function upgradeItem(key, create, update) {
    return { key, create, update };
  }

  function makeUpgradeButton(action, data) {
    const icon = h('span', { class: 'u-icon', 'aria-hidden': 'true' });
    const name = h('span', { class: 'u-name' });
    const desc = h('span', { class: 'u-desc' });
    const req = h('span', { class: 'u-req' });
    const cost = h('span', { class: 'u-cost' });
    const btn = h('button', { type: 'button', class: 'u-item', dataset: { action, ...data } },
      icon, h('span', { class: 'u-main' }, name, desc, req), cost);
    btn._r = { icon, name, desc, req, cost };
    return btn;
  }

  function renderUpgrades() {
    // Global upgrades: unlocked + the next locked teaser
    const gItems = [];
    let teaser = false;
    CONFIG.globalUpgrades.forEach((g, j) => {
      if (s.globals[j]) return;
      const unlocked = E.globalUnlocked(s, j);
      if (!unlocked && teaser) return;
      if (!unlocked) teaser = true;
      gItems.push(upgradeItem(`g${j}`, () => makeUpgradeButton('global', { j }), (el) => {
        const r = el._r;
        setText(r.icon, unlocked ? g.icon : '❔');
        setText(r.name, unlocked ? g.name : '??? Global upgrade');
        setText(r.desc, `All profits ×${g.mult}`);
        setText(r.req, unlocked ? '' : `Unlocks at ${formatMoney(g.unlockAt)} lifetime earnings`);
        setText(r.cost, formatMoney(g.cost));
        const ok = E.canBuyGlobal(s, j);
        el.classList.toggle('affordable', ok);
        el.classList.toggle('locked', !E.globalUnlocked(s, j));
        setAttr(el, 'aria-disabled', String(!ok));
        setAttr(el, 'aria-label', `${unlocked ? g.name : 'Locked global upgrade'}: all profits times ${g.mult}, costs ${formatMoney(g.cost)}`);
      }));
    });
    syncList(globalList, gItems);
    setHidden($('#global-empty'), gItems.length > 0);

    // Business upgrades for unlocked businesses, cheapest first
    const items = [];
    const owned = [];
    CONFIG.businesses.forEach((b, i) => {
      if (!E.isUnlocked(s, i)) return;
      CONFIG.upgradeTemplate.forEach((u, j) => {
        const entry = { i, j, b, u, cost: E.upgradeCost(i, j) };
        (s.upgrades[i][j] ? owned : items).push(entry);
      });
    });
    items.sort((a, c) => a.cost - c.cost);
    syncList(upgList, items.map(({ i, j, b, u, cost }) => upgradeItem(`u${i}-${j}`, () => makeUpgradeButton('upgrade', { i, j }), (el) => {
      const r = el._r;
      const met = E.upgradeRequirementMet(s, i, j);
      setText(r.icon, b.icon);
      setText(r.name, b.upgrades[j]);
      setText(r.desc, `${b.name} profit ×${u.mult}`);
      setText(r.req, met ? '' : `Requires ${u.requires} owned (${s.businesses[i].owned}/${u.requires})`);
      setText(r.cost, formatMoney(cost));
      const ok = E.canBuyUpgrade(s, i, j);
      el.classList.toggle('affordable', ok);
      el.classList.toggle('locked', !met);
      setAttr(el, 'aria-disabled', String(!ok));
      setAttr(el, 'aria-label', `${b.upgrades[j]}: ${b.name} profit times ${u.mult}, costs ${formatMoney(cost)}${met ? '' : `, requires ${u.requires} owned`}`);
    })));
    setHidden($('#upgrade-empty'), items.length > 0);

    // Purchased list (compact)
    const boughtGlobals = CONFIG.globalUpgrades.filter((_, j) => s.globals[j]);
    setText(ownedSummary, `Purchased upgrades (${owned.length + boughtGlobals.length})`);
    syncList(ownedUpgList, [
      ...boughtGlobals.map((g) => ({ key: `og-${g.id}`, create: () => h('li'), update: (el) => setText(el, `${g.icon} ${g.name} — all profits ×${g.mult}`) })),
      ...owned.map(({ i, j, b, u }) => ({ key: `ou${i}-${j}`, create: () => h('li'), update: (el) => setText(el, `${b.icon} ${b.upgrades[j]} — ${b.name} ×${u.mult}`) })),
    ]);
  }

  /* ---------- Managers panel ---------- */
  const mgrList = $('#manager-list');
  const mgrRows = CONFIG.businesses.map((b, i) => {
    const status = h('span', { class: 'm-status' });
    const cost = h('span', { class: 'u-cost' });
    const btn = h('button', { type: 'button', class: 'u-item', dataset: { action: 'manager', i } },
      h('span', { class: 'u-icon', 'aria-hidden': 'true', text: '🤖' }),
      h('span', { class: 'u-main' }, h('span', { class: 'u-name', text: b.manager }), h('span', { class: 'u-desc', text: `Runs ${b.name} automatically` }), status),
      cost);
    mgrList.append(h('li', {}, btn));
    return { btn, status, cost };
  });

  function renderManagers() {
    CONFIG.businesses.forEach((b, i) => {
      const r = mgrRows[i];
      const bs = s.businesses[i];
      const unlocked = E.isUnlocked(s, i);
      let status = '';
      if (bs.managed) status = '✓ Hired';
      else if (!unlocked) status = `🔒 Unlock ${b.name} first`;
      else if (bs.owned === 0) status = `Buy a ${b.name} first`;
      setText(r.status, status);
      setText(r.cost, bs.managed ? 'Hired' : formatMoney(b.managerCost));
      const ok = E.canHireManager(s, i);
      r.btn.classList.toggle('affordable', ok);
      r.btn.classList.toggle('hired', bs.managed);
      r.btn.classList.toggle('locked', !unlocked);
      setAttr(r.btn, 'aria-disabled', String(!ok));
      setAttr(r.btn, 'aria-label', `${b.manager}, manager for ${b.name}. ${bs.managed ? 'Hired' : `Costs ${formatMoney(b.managerCost)}`}${status && !bs.managed ? '. ' + status : ''}`);
    });
  }

  /* ---------- Prestige panel ---------- */
  const pr = {
    flakes: $('#pr-flakes'),
    bonus: $('#pr-bonus'),
    lifetime: $('#pr-lifetime'),
    unlockWrap: $('#pr-unlock'),
    unlockFill: $('#pr-unlock-fill'),
    unlockText: $('#pr-unlock-text'),
    preview: $('#pr-preview'),
    next: $('#pr-next'),
    btn: $('#pr-reset'),
    shop: $('#shop-list'),
  };
  const shopRows = CONFIG.snowflakeShop.map((item) => {
    const cost = h('span', { class: 'u-cost' });
    const status = h('span', { class: 'm-status' });
    const btn = h('button', { type: 'button', class: 'u-item', dataset: { action: 'shop', id: item.id } },
      h('span', { class: 'u-icon', 'aria-hidden': 'true', text: item.icon }),
      h('span', { class: 'u-main' }, h('span', { class: 'u-name', text: item.name }), h('span', { class: 'u-desc', text: item.desc }), status),
      cost);
    pr.shop.append(h('li', {}, btn));
    return { item, btn, cost, status };
  });

  function renderPrestige() {
    const pending = E.pendingSnowflakes(s);
    const unlocked = E.prestigeUnlocked(s);
    setText(pr.flakes, formatNumber(s.snowflakes));
    setText(pr.bonus, `+${bonusPct(s.snowflakes)}%`);
    setText(pr.lifetime, formatMoney(s.stats.lifetimeEarnings));
    setHidden(pr.unlockWrap, unlocked);
    if (!unlocked) {
      const frac = Math.min(1, s.stats.lifetimeEarnings / CONFIG.prestige.unlockLifetime);
      pr.unlockFill.style.transform = `scaleX(${frac})`;
      setText(pr.unlockText, `Blizzard Reset unlocks at ${formatMoney(CONFIG.prestige.unlockLifetime)} lifetime earnings (${(frac * 100).toFixed(1)}%)`);
    }
    const gainPct = bonusPct(pending);
    setText(pr.preview, unlocked
      ? `Reset now to gain ${formatNumber(pending)} Snowflake${pending === 1 ? '' : 's'} (+${gainPct}% income)`
      : 'Reset now to gain 0 Snowflakes (+0% income)');
    const nextTotal = s.snowflakesClaimed + pending + 1;
    const nextAt = nextTotal * nextTotal * CONFIG.prestige.divisor;
    setText(pr.next, `Next Snowflake at ${formatMoney(nextAt)} lifetime earnings`);
    const can = E.canPrestige(s);
    pr.btn.classList.toggle('affordable', can);
    setAttr(pr.btn, 'aria-disabled', String(!can));

    for (const r of shopRows) {
      const owned = !!s.shop[r.item.id];
      setText(r.cost, owned ? 'Owned' : `❄ ${formatNumber(r.item.cost)}`);
      setText(r.status, owned ? '✓ Active forever' : '');
      const ok = E.canBuyShop(s, r.item.id);
      r.btn.classList.toggle('affordable', ok);
      r.btn.classList.toggle('hired', owned);
      setAttr(r.btn, 'aria-disabled', String(!ok));
      setAttr(r.btn, 'aria-label', `${r.item.name}: ${r.item.desc} ${owned ? 'Owned.' : `Costs ${r.item.cost} snowflakes.`}`);
    }
  }

  /* ---------- Stats panel ---------- */
  const statsEl = $('#stats-list');
  const statRows = {};
  const STAT_DEFS = [
    ['lifetime', 'Lifetime earnings', () => formatMoney(s.stats.lifetimeEarnings)],
    ['run', 'Earned this run', () => formatMoney(s.runEarnings)],
    ['income', 'Income (all businesses)', () => `${formatMoney(E.incomePerSecond(s))}/s`],
    ['managed', 'Income while away', () => `${formatMoney(E.managedIncomePerSecond(s))}/s`],
    ['playtime', 'Total playtime', () => formatTime(s.stats.playtime)],
    ['resets', 'Blizzard Resets', () => formatNumber(s.stats.resets)],
    ['flakes', 'Snowflakes (held / claimed)', () => `${formatNumber(s.snowflakes)} / ${formatNumber(s.snowflakesClaimed)}`],
    ['highest', 'Highest tier reached', () => `${s.stats.highestTier} — ${CONFIG.businesses[s.stats.highestTier - 1].name}`],
    ['units', 'Businesses owned', () => formatNumber(s.businesses.reduce((a, b) => a + b.owned, 0))],
    ['clicks', 'Manual cycles started', () => formatNumber(s.stats.totalClicks)],
    ['events', 'Events claimed', () => formatNumber(s.stats.eventsClaimed)],
    ['gmult', 'Global upgrade multiplier', () => `×${formatNumber(E.globalMultiplier(s))}`],
    ['pmult', 'Snowflake multiplier', () => `×${E.prestigeMultiplier(s).toFixed(2)}`],
  ];
  for (const [key, label] of STAT_DEFS) {
    const dd = h('dd');
    statsEl.append(h('div', { class: 'stat' }, h('dt', { text: label }), dd));
    statRows[key] = dd;
  }
  function renderStats() {
    for (const [key, , fn] of STAT_DEFS) setText(statRows[key], fn());
  }

  /* ---------- Settings panel ---------- */
  const snowToggle = $('#set-snow');
  const fmtSelect = $('#set-format');
  const importBox = $('#import-text');
  const importErr = $('#import-error');
  const storageNote = $('#storage-note');

  snowToggle.addEventListener('change', () => {
    s.settings.snow = snowToggle.checked;
    setSnowEnabled(s.settings.snow);
  });
  fmtSelect.addEventListener('change', () => {
    s.settings.numberFormat = fmtSelect.value;
    setNumberMode(s.settings.numberFormat);
    refreshText();
  });
  $('#btn-save').addEventListener('click', () => ctx.actions.save(true));
  $('#btn-export-copy').addEventListener('click', () => ctx.actions.exportCopy());
  $('#btn-export-download').addEventListener('click', () => ctx.actions.exportDownload());
  $('#btn-import').addEventListener('click', async () => {
    importErr.hidden = true;
    const err = await ctx.actions.importText(importBox.value);
    if (err) {
      importErr.textContent = err;
      importErr.hidden = false;
      importBox.setAttribute('aria-invalid', 'true');
    } else {
      importBox.value = '';
      importBox.removeAttribute('aria-invalid');
    }
  });
  $('#btn-hard-reset').addEventListener('click', () => ctx.actions.hardReset());

  function syncSettings() {
    snowToggle.checked = s.settings.snow;
    fmtSelect.value = s.settings.numberFormat;
    setNumberMode(s.settings.numberFormat);
    setSnowEnabled(s.settings.snow);
    syncBuyMode();
    $('#reduced-motion-note').hidden = !reducedMotion?.matches;
    // Config-driven copy in the static HTML.
    const per = $('#pr-per');
    if (per) per.textContent = `+${bonusPct(1)}%`;
    const secs = $('#autosave-secs');
    if (secs) secs.textContent = String(CONFIG.autosaveSeconds);
  }

  /* ---------- Tab badges ---------- */
  const badgeUpg = $('#badge-upgrades');
  const badgeMgr = $('#badge-managers');
  const badgePr = $('#badge-prestige');
  function renderBadges() {
    let u = 0;
    CONFIG.businesses.forEach((_, i) => CONFIG.upgradeTemplate.forEach((__, j) => { if (E.canBuyUpgrade(s, i, j)) u++; }));
    CONFIG.globalUpgrades.forEach((_, j) => { if (E.canBuyGlobal(s, j)) u++; });
    let m = 0;
    CONFIG.businesses.forEach((_, i) => { if (E.canHireManager(s, i)) m++; });
    setText(badgeUpg, u ? String(u) : '');
    setText(badgeMgr, m ? String(m) : '');
    setText(badgePr, E.canPrestige(s) ? '!' : '');
  }

  /* ---------- Delegated click handling for game actions ---------- */
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.closest('dialog')) return;
    const { action } = el.dataset;
    const i = Number(el.dataset.i);
    const j = Number(el.dataset.j);
    let changed = false;
    switch (action) {
      case 'run':
        if (E.startCycle(s, i)) { changed = true; flash(cards[i].runBtn, 'press'); }
        break;
      case 'buy': {
        const n = E.buyBusiness(s, i, s.settings.buyMode);
        if (n > 0) { changed = true; flash(cards[i].card); }
        else flash(cards[i].buy, 'shake');
        break;
      }
      case 'manager':
        if (E.hireManager(s, i)) {
          changed = true;
          toast(`🤖 ${CONFIG.businesses[i].manager} now runs ${CONFIG.businesses[i].name}!`, 'success');
        } else flash(el, 'shake');
        break;
      case 'upgrade':
        if (E.buyUpgrade(s, i, j)) {
          changed = true;
          toast(`⬆️ ${CONFIG.businesses[i].upgrades[j]} purchased`, 'success');
        } else flash(el, 'shake');
        break;
      case 'global':
        if (E.buyGlobal(s, j)) {
          changed = true;
          toast(`🌍 ${CONFIG.globalUpgrades[j].name}: all profits ×${CONFIG.globalUpgrades[j].mult}`, 'success');
        } else flash(el, 'shake');
        break;
      case 'shop': {
        const item = CONFIG.snowflakeShop.find((x) => x.id === el.dataset.id);
        if (item && E.canBuyShop(s, item.id)) {
          const ok = await modal({
            title: `Buy ${item.name}?`,
            body: `Spend ${item.cost} Snowflakes? Spent Snowflakes no longer give their +${bonusPct(1)}% income bonus.`,
            okText: 'Buy', cancelText: 'Cancel',
          });
          if (ok && E.buyShop(s, item.id)) { changed = true; toast(`❄ ${item.name} unlocked forever!`, 'success'); }
        } else flash(el, 'shake');
        break;
      }
      case 'prestige':
        await confirmPrestige();
        changed = true;
        break;
      default:
        return;
    }
    if (changed) refreshText();
  });

  async function confirmPrestige() {
    if (!E.canPrestige(s)) {
      flash(pr.btn, 'shake');
      toast(E.prestigeUnlocked(s) ? 'Earn more to gain your next Snowflake first.' : `Reach ${formatMoney(CONFIG.prestige.unlockLifetime)} lifetime earnings to unlock.`, 'info');
      return;
    }
    const gain = E.pendingSnowflakes(s);
    const body = h('div', {},
      h('p', { text: `You will gain ${formatNumber(gain)} Snowflake${gain === 1 ? '' : 's'} (+${bonusPct(gain)}% income, total +${bonusPct((s.snowflakes + gain))}%).` }),
      h('p', { text: 'Resets: cash, businesses, upgrades and managers.' }),
      h('p', { text: 'Keeps: Snowflakes, lifetime stats, Snowflake shop purchases and settings.' }));
    const ok = await modal({ title: '🌨️ Blizzard Reset?', body, okText: 'Reset & claim', cancelText: 'Not yet', danger: true });
    if (!ok) return;
    const got = E.doPrestige(s);
    if (got > 0) {
      ctx.actions.save(false);
      toast(`🌨️ The blizzard passes… +${formatNumber(got)} Snowflakes!`, 'success', 4000);
      selectTab('businesses');
    }
  }

  /* ---------- Random event button ---------- */
  const eventLayer = $('#event-layer');
  let eventBtn = null;
  function showEvent(ev) {
    hideEvent();
    const x = 10 + Math.random() * 70;
    const y = 20 + Math.random() * 60;
    eventBtn = h('button', {
      type: 'button',
      class: `event-btn event-${ev.type.id}`,
      style: `left:${x}vw; top:${y}vh; --life:${CONFIG.events.visibleFor}s`,
      'aria-label': `${ev.type.name}! Click to claim a reward`,
    }, h('span', { class: 'event-icon', 'aria-hidden': 'true', text: ev.type.icon }), h('span', { class: 'event-label', text: ev.type.name }));
    eventBtn.addEventListener('click', () => {
      const reward = ctx.events.claim();
      hideEvent();
      if (!reward) return;
      if (reward.kind === 'boost') toast(`🌨️ Snowstorm! Income ×${reward.mult} for ${reward.duration}s`, 'event', 3500);
      else toast(`❄️ Golden Snowflake! +${formatMoney(reward.amount)}`, 'event', 3500);
      refreshText();
    });
    eventLayer.append(eventBtn);
  }
  function hideEvent() {
    eventBtn?.remove();
    eventBtn = null;
  }

  /* ---------- Frame + text refresh ---------- */
  let lastText = 0;

  function refreshText() {
    setText(hud.cash, formatMoney(s.cash));
    setText(hud.income, `${formatMoney(E.incomePerSecond(s, rt))}/s`);
    const pctText = `+${bonusPct(s.snowflakes)}%`;
    setText(hud.flakesCount, formatNumber(s.snowflakes));
    setText(hud.flakesBonus, ` (${pctText})`);
    setAttr(hud.flakes, 'title', `${formatNumber(s.snowflakes)} Snowflakes: ${pctText} income`);
    setHidden(hud.boost, !(rt.boostRemaining > 0));
    if (rt.boostRemaining > 0) setText(hud.boost, `🌨️ Snowstorm ×${rt.boostMult} income — ${Math.ceil(rt.boostRemaining)}s`);

    for (let i = 0; i < cards.length; i++) updateCard(i);
    // Only the visible side panel needs updating; badges always.
    if (activeTab === 'upgrades') renderUpgrades();
    else if (activeTab === 'managers') renderManagers();
    else if (activeTab === 'prestige') renderPrestige();
    else if (activeTab === 'stats') renderStats();
    renderBadges();
  }

  function frame(now) {
    for (let i = 0; i < cards.length; i++) updateCardProgress(i);
    if (now - lastText >= 100) {
      lastText = now;
      refreshText();
    }
  }

  function refreshAll() {
    syncSettings();
    renderUpgrades();
    renderManagers();
    renderPrestige();
    renderStats();
    refreshText();
  }

  $('#pr-reset').dataset.action = 'prestige';
  selectTab(desktop.matches ? 'upgrades' : 'businesses');
  refreshAll();

  return { frame, refreshAll, showEvent, hideEvent, selectTab };
}
