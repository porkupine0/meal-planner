const H = require('./h'); const { sleep, rnd, clone } = H; const fs = require('fs');
const WID = 'weeks/2026-11-13';
const PROFILES = { low: { up: [5, 40], down: [5, 40] }, mid: { up: [40, 250], down: [40, 250] }, high: { up: [150, 900], down: [150, 900] } };
const go = (P, v) => P.ev(v => { __T.S.view = v; __T.S.weekOffset = 0; __T.render(); }, v);
const click = (P, sel) => P.ev(s => { const e = document.querySelector(s); if (!e) throw new Error('missing ' + s); e.click(); }, sel);
const setSel = (P, sel, val) => P.ev(([s, v]) => { const e = document.querySelector(s); if (!e) throw new Error('missing ' + s); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, val]);
const setIn = (P, sel, val) => P.ev(([s, v]) => { const e = document.querySelector(s); e.value = v; }, [sel, val]);
const keys = (P, sel) => P.ev(s => [...document.querySelectorAll(s)].map(e => e.dataset.check || e.dataset.store), sel);
const q = k => '[data-check="' + k.replace(/"/g, '\\"') + '"]';
const qs = k => '[data-store="' + k.replace(/"/g, '\\"') + '"]';
const shuffle = a => a.map(x => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
const week = R => R.store[WID];
const par = async (fa, fb, maxOff = 800) => { const off = rnd([0, maxOff]), first = Math.random() < .5; await Promise.all([first ? fa() : sleep(off).then(fa), first ? sleep(off).then(fb) : fb()]); };
const seq = async (arr, gap = [60, 200]) => { for (const f of arr) { await f(); await sleep(rnd(gap)); } };
const missing = (have, want) => want.filter(x => !have.includes(x));

const SC = {};
SC['check-diff'] = async ({ A, B, R }) => {
  await go(A, 'grocery'); await go(B, 'grocery'); const ks = shuffle(await keys(A, '[data-check]')); const ka = ks.slice(0, 3), kb = ks.slice(3, 6);
  await par(() => seq(ka.map(k => () => click(A, q(k)))), () => seq(kb.map(k => () => click(B, q(k)))), 500);
  await H.quiesce(R); return { lost: missing(Object.keys(week(R).checked || {}), [...ka, ...kb]) };
};
SC['check-same'] = async ({ A, B, R }) => {
  await go(A, 'grocery'); await go(B, 'grocery'); const k = shuffle(await keys(A, '[data-check]'))[0];
  const tap = P => P.ev(s => { const e = document.querySelector(s); if (e && !e.checked) e.click(); }, q(k)); // a person would not tap an item that already shows as checked
  await par(() => tap(A), () => tap(B), 300); await H.quiesce(R);
  return { lost: week(R).checked?.[k] ? [] : [k] };
};
SC['check-vs-uncheck'] = async ({ A, B, R, docs }) => {
  // pre-checked item on the shared board; A unchecks it while B checks another
  await go(A, 'grocery'); await go(B, 'grocery'); const ks = shuffle(await keys(A, '[data-check]')); const k1 = ks[0], k2 = ks[1];
  await click(A, q(k1)); await H.quiesce(R, 600); await go(A, 'grocery'); await go(B, 'grocery');
  await par(() => click(A, q(k1)), () => click(B, q(k2)), 500); await H.quiesce(R);
  const c = week(R).checked || {}; const lost = []; if (c[k1]) lost.push('uncheck ' + k1); if (!c[k2]) lost.push('check ' + k2); return { lost };
};
SC['extras-diff'] = async ({ A, B, R }) => {
  await go(A, 'grocery'); await go(B, 'grocery'); const id = Math.random().toString(36).slice(2, 5);
  const add = (P, n) => async () => { await setIn(P, '#extra-in', n); await click(P, '[data-act="addextra"]'); };
  const na = ['AA1' + id, 'AA2' + id], nb = ['BB1' + id, 'BB2' + id];
  await par(() => seq(na.map(n => add(A, n)), [100, 500]), () => seq(nb.map(n => add(B, n)), [100, 500]), 600); await H.quiesce(R);
  return { lost: missing((week(R).extras || []).map(e => e.name), [...na, ...nb]) };
};
SC['sams-vs-checks'] = async ({ A, B, R }) => {
  await go(A, 'grocery'); await go(B, 'grocery'); const ik = shuffle((await keys(A, '[data-store]')).filter(k => k.startsWith('i:'))); const mv = ik[0]; const cks = shuffle(await keys(B, '[data-check]')).slice(0, 4);
  await par(() => setSel(A, qs(mv), 'sams'), () => seq(cks.map(k => () => click(B, q(k))), [80, 250]), 500); await H.quiesce(R);
  const lost = missing(Object.keys(week(R).checked || {}), cks); if (R.store['app/walmart']?.stores?.[mv] !== 'sams') lost.push('sams ' + mv); return { lost };
};
SC['sams-both'] = async ({ A, B, R }) => {
  await go(A, 'grocery'); await go(B, 'grocery'); const ik = shuffle((await keys(A, '[data-store]')).filter(k => k.startsWith('i:'))); const [a, b] = ik;
  await par(() => setSel(A, qs(a), 'sams'), () => setSel(B, qs(b), 'sams'), 700); await H.quiesce(R);
  const st = R.store['app/walmart']?.stores || {}; return { lost: [a, b].filter(k => st[k] !== 'sams') };
};
SC['pantry-vs-checks'] = async ({ A, B, R }) => {
  await go(A, 'grocery'); await go(B, 'grocery'); const ik = shuffle((await keys(A, '[data-store]')).filter(k => k.startsWith('i:'))); const mv = ik[0].slice(2); const cks = shuffle(await keys(B, '[data-check]')).slice(0, 4);
  await par(() => setSel(A, qs(ik[0]), 'pantry'), () => seq(cks.map(k => () => click(B, q(k))), [80, 250]), 500); await H.quiesce(R);
  const lost = missing(Object.keys(week(R).checked || {}), cks); if (!(R.store['app/settings'].pantry || []).some(p => p.name === mv && p.on)) lost.push('pantry ' + mv); return { lost };
};
SC['pantry-both'] = async ({ A, B, R }) => {
  await go(A, 'grocery'); await go(B, 'grocery'); const ik = shuffle((await keys(A, '[data-store]')).filter(k => k.startsWith('i:'))); const [a, b] = [ik[0].slice(2), ik[1].slice(2)];
  await par(() => setSel(A, qs(ik[0]), 'pantry'), () => setSel(B, qs(ik[1]), 'pantry'), 700); await H.quiesce(R);
  const pn = R.store['app/settings'].pantry || []; return { lost: [a, b].filter(n => !pn.some(p => p.name === n && p.on)) };
};
SC['settings-both'] = async ({ A, B, R }) => { // A changes household size, B toggles a staple
  await go(A, 'settings'); await go(B, 'settings');
  await par(() => setSel(A, '#fam', '6'), () => click(B, '[data-staple="6"]'), 700); await H.quiesce(R);
  const s = R.store['app/settings']; const lost = []; if (s.family !== 6) lost.push('family'); if (!s.staples.find(x => x.name === 'Shredded cheese').on) lost.push('staple6'); return { lost };
};
SC['settings-vs-shopping'] = async ({ A, B, R }) => {
  await go(A, 'settings'); await go(B, 'grocery'); const cks = shuffle(await keys(B, '[data-check]')).slice(0, 4);
  await par(() => setSel(A, '#fam', '5'), () => seq(cks.map(k => () => click(B, q(k))), [80, 250]), 500); await H.quiesce(R);
  const lost = missing(Object.keys(week(R).checked || {}), cks); if (R.store['app/settings'].family !== 5) lost.push('family'); return { lost };
};
SC['weekstart-vs-shopping'] = async ({ A, B, R }) => {
  await go(A, 'settings'); await go(B, 'grocery'); const cks = shuffle(await keys(B, '[data-check]')).slice(0, 3);
  const tap = k => () => B.ev(s => { const e = document.querySelector(s); if (e) e.click(); }, q(k)); // B's screen may already have changed under it
  await par(() => setSel(A, '#ws', '1'), () => seq(cks.map(tap), [80, 250]), 600); await H.quiesce(R);
  const wk = Object.entries(R.store).filter(([p]) => p.startsWith('weeks/')); const allChecked = wk.flatMap(([, w]) => Object.keys(w.checked || {}));
  const lost = missing(allChecked, cks); if (R.store[WID] && R.store['app/settings'].weekStart === 1) lost.push('ghost old week ' + WID); return { lost };
};
const dayIds = P => P.ev(() => Object.keys(__T.getWeek(__T.curStart()).days).sort());
SC['reroll-vs-lock'] = async ({ A, B, R }) => {
  await go(A, 'plan'); await go(B, 'plan'); const w0 = clone(week(R)); const cook = Object.keys(w0.days).sort().filter(d => w0.days[d].rid && !w0.days[d].locked && d > '2026-11-13'); const [d1, d2] = shuffle(cook);
  await par(() => click(A, `[data-act="reroll"][data-day="${d1}"]`), () => click(B, `[data-act="lock"][data-day="${d2}"]`), 600); await H.quiesce(R);
  const w = week(R); const lost = []; if (w.days[d1].rid === w0.days[d1].rid) lost.push('reroll ' + d1); if (!w.days[d2].locked) lost.push('lock ' + d2); return { lost };
};
SC['reroll-same'] = async ({ A, B, R }) => {
  await go(A, 'plan'); await go(B, 'plan'); const w0 = clone(week(R)); const d = shuffle(Object.keys(w0.days).filter(d => w0.days[d].rid && d > '2026-11-13'))[0];
  await par(() => click(A, `[data-act="reroll"][data-day="${d}"]`), () => click(B, `[data-act="reroll"][data-day="${d}"]`), 500); await H.quiesce(R);
  const same = await Promise.all([A, B].map(P => P.ev(([id, d]) => __T.S.weeks[id].days[d].rid, [WID.slice(6), d])));
  return { lost: [], converged: same[0] === same[1] && same[0] === week(R).days[d].rid };
};
SC['generate-vs-lock'] = async ({ A, B, R }) => {
  await go(A, 'plan'); await go(B, 'plan'); const w0 = clone(week(R)); const d = shuffle(Object.keys(w0.days).filter(d => w0.days[d].rid && !w0.days[d].locked && d > '2026-11-13'))[0]; const rid0 = w0.days[d].rid;
  await par(() => click(A, '[data-act="rerollall"]'), () => click(B, `[data-act="lock"][data-day="${d}"]`), 500); await H.quiesce(R);
  const w = week(R); const lost = []; if (!w.days[d].locked) lost.push('lock ' + d + ' (rid kept: ' + (w.days[d].rid === rid0) + ')'); return { lost };
};
SC['generate-vs-rate'] = async ({ A, B, R }) => { // B rates a night's dinner (day.rate) while A rerolls everything
  await go(A, 'plan'); await go(B, 'plan'); const w0 = clone(week(R)); const d = shuffle(Object.keys(w0.days).filter(d => w0.days[d].rid && !w0.days[d].locked && d > '2026-11-13'))[0];
  const ok = await B.ev(d => !!document.querySelector(`[data-act="rateday"][data-day="${d}"]`), d); if (!ok) return { lost: [], skip: 'no rate button' };
  await par(() => click(A, '[data-act="rerollall"]'), () => click(B, `[data-act="rateday"][data-day="${d}"][data-n="5"]`), 500); await H.quiesce(R);
  return { lost: week(R).days[d].rate === 5 ? [] : ['rate ' + d] };
};
const offlineScenario = (mode) => async ({ A, B, R }) => {
  await go(B, 'grocery'); await go(A, 'plan'); const ks = shuffle(await keys(B, '[data-check]')).slice(0, 15); await B.setOnline(false);
  for (const k of ks) { await click(B, q(k)); await sleep(30); }
  await sleep(500);
  const w0 = clone(week(R)); let rer = [];
  if (mode === 'reroll') { const cook = shuffle(Object.keys(w0.days).filter(d => w0.days[d].rid && !w0.days[d].locked && d > '2026-11-13')).slice(0, 3); for (const d of cook) { await click(A, `[data-act="reroll"][data-day="${d}"]`); await sleep(100); } rer = cook; }
  if (mode === 'replan') { await click(A, '[data-act="replan"]'); await click(A, '[data-act="replan"]'); await sleep(300); await click(A, '[data-act="generate"]'); }
  if (mode === 'clear') { await click(A, '[data-act="replan"]'); await click(A, '[data-act="replan"]'); }
  await H.quiesce(R, 800); await B.setOnline(true); await H.quiesce(R, 1500);
  const w = week(R); const lost = [];
  if (!w) { if (mode !== 'clear') lost.push('week doc gone'); } else {
    if (mode !== 'clear') lost.push(...missing(Object.keys(w.checked || {}), ks).map(k => 'check ' + k)); // after "clear week" on the other phone, checks on the old plan have nowhere to go
    if (mode === 'reroll') for (const d of rer) if (w.days[d].rid === w0.days[d].rid) lost.push('A reroll ' + d + ' reverted');
    if (mode === 'clear' && Object.values(w.days).some(d => d.rid)) lost.push("A's clear undone: old plan resurrected");
    if (mode === 'replan' && Object.keys(w.days).some(d => w.days[d].rid !== w0.days[d].rid) === false) lost.push("A's replan reverted");
  }
  return { lost };
};
SC['offline15-reroll'] = offlineScenario('reroll'); SC['offline15-replan'] = offlineScenario('replan'); SC['offline15-clear'] = offlineScenario('clear');
const openFirstRecipe = async P => { await go(P, 'recipes'); await P.page.waitForSelector('#app [data-open]'); const id = await P.ev(() => document.querySelector('#app [data-open]').dataset.open); return id; };
SC['recipe-rate-edit'] = async ({ A, B, R }) => {
  await go(A, 'recipes'); const id = await A.ev(() => document.querySelector('#app [data-open]').dataset.open);
  for (const P of [A, B]) { await go(P, 'recipes'); await P.ev(i => document.querySelector(`#app [data-open="${i}"]`).click(), id); await P.page.waitForSelector('#m-t', { state: 'attached' }); }
  const cur = await A.ev(i => __T.S.byId[i].r || 0, id), rv = cur === 5 ? 4 : 5;
  await par(() => click(A, `[data-rate="${rv}"]`), async () => { await setIn(B, '#m-t', '47'); await B.ev(() => document.querySelector('#m-t').dispatchEvent(new Event('change', { bubbles: true }))); }, 700); await H.quiesce(R);
  const o = R.store['overrides/' + id] || {}; const lost = []; if (o.r !== rv) lost.push('rating'); if (o.t !== 47) lost.push('time'); return { lost };
};
SC['recipe-notes-vs-rate'] = async ({ A, B, R }) => {
  await go(A, 'recipes'); const id = await A.ev(() => document.querySelector('#app [data-open]').dataset.open);
  for (const P of [A, B]) { await go(P, 'recipes'); await P.ev(i => document.querySelector(`#app [data-open="${i}"]`).click(), id); await P.page.waitForSelector('#m-notes', { state: 'attached' }); }
  const cur = await A.ev(i => __T.S.byId[i].r || 0, id), rv = cur === 4 ? 3 : 4;
  await par(() => click(A, `[data-rate="${rv}"]`), async () => { await setIn(B, '#m-notes', 'less cayenne'); await B.ev(() => document.querySelector('#m-notes').dispatchEvent(new Event('change', { bubbles: true }))); }, 700); await H.quiesce(R);
  const o = R.store['overrides/' + id] || {}; const lost = []; if (o.r !== rv) lost.push('rating'); if (o.no !== 'less cayenne') lost.push('notes'); return { lost };
};
SC['fridge-both'] = async ({ A, B, R }) => {
  await go(A, 'plan'); await go(B, 'plan'); const hasIn = await A.ev(() => !!document.querySelector('#fridge-in')); if (!hasIn) { await go(A, 'settings'); await go(B, 'settings'); }
  const add = (P, n) => async () => { await setIn(P, '#fridge-in', n); await click(P, '[data-act="addfridge"]'); };
  await par(add(A, 'spinach'), add(B, 'leftover ham'), 700); await H.quiesce(R);
  const it = (R.store['app/fridge']?.items || []).map(x => x.name); return { lost: missing(it, ['spinach', 'leftover ham']) };
};
SC['leftover-link-vs-fridge'] = async ({ A, B, R }) => {
  await go(A, 'plan'); await go(B, 'plan'); const sel = await A.ev(() => { const s = document.querySelector('[data-lofrom]'); return s ? [s.dataset.lofrom, [...s.options].map(o => o.value).filter(Boolean)[0]] : null; });
  if (!sel) return { lost: [], skip: 'no LO day' };
  const add = async () => { await go(B, 'plan'); await setIn(B, '#fridge-in', 'cooked rice'); await click(B, '[data-act="addfridge"]'); };
  await par(() => setSel(A, `[data-lofrom="${sel[0]}"]`, sel[1]), add, 600); await H.quiesce(R);
  const lost = []; if (week(R).days[sel[0]].from !== sel[1]) lost.push('leftover link'); if (!(R.store['app/fridge']?.items || []).some(x => x.name === 'cooked rice')) lost.push('fridge item'); return { lost };
};
module.exports = { SC, PROFILES, WID };
