const H = require('./h'); const { sleep, rnd, clone } = H; const { PROFILES, WID } = require('./scen');
const go = (P, v) => P.ev(v => { __T.S.view = v; __T.S.weekOffset = 0; __T.render(); }, v);
const click = (P, sel) => P.ev(s => { const e = document.querySelector(s); if (!e) throw new Error('missing ' + s); e.click(); }, sel);
const toLS = docs => Object.fromEntries(Object.entries(docs).map(([p, d]) => ['sb.' + p, JSON.stringify(d)]));
const rids = w => JSON.stringify(Object.entries(w.days).sort().map(([k, d]) => [k, d.rid]));
const signIn = async P => { await P.page.waitForFunction(() => window.__FS && __FS.authCb, null, { timeout: 10000 }); await P.ev(() => __FS.signIn()); await P.page.waitForFunction(() => __T.S.mode === 'db' && __T.S.weeksLoaded, null, { timeout: 10000 }); };
const setIn = (P, sel, val) => P.ev(([s, v]) => { const e = document.querySelector(s); e.value = v; }, [sel, val]);
const SP = {};
SP['signout-signin'] = async ({ browser, docs, prof }) => {
  const R = new H.Relay(clone(docs)); const A = await H.phone(browser, R, 'A', { lat: prof }), B = await H.phone(browser, R, 'B', { lat: prof });
  await go(A, 'grocery'); await go(B, 'grocery'); const ks = (await A.ev(() => [...document.querySelectorAll('[data-check]')].map(e => e.dataset.check)));
  await click(A, `[data-check="${ks[0]}"]`); await H.quiesce(R, 600);
  const before = clone(R.store[WID]);
  await go(A, 'settings'); await click(A, '[data-act="fbsignout"]');
  await A.page.waitForFunction(() => window.__T && __T.S.mode === 'local' && __T.S.recipes.length, null, { timeout: 10000 });
  const localWeek = await A.ev(() => JSON.stringify(__T.S.weeks['2026-11-13'] || null)); const lost = [];
  if (!localWeek || localWeek === 'null' || JSON.stringify(JSON.parse(localWeek).days) !== JSON.stringify(before.days)) lost.push('local copy after sign-out differs from board');
  await go(A, 'grocery'); await go(B, 'grocery');
  const xt = 'XT' + Math.random().toString(36).slice(2, 6);
  await click(A, `[data-check="${ks[1]}"]`); await click(A, `[data-check="${ks[2]}"]`);   // checked while signed out
  await setIn(A, '#extra-in', xt); await click(A, '[data-act="addextra"]');                  // extra added while signed out
  await click(B, `[data-check="${ks[3]}"]`); await click(B, `[data-check="${ks[4]}"]`); await H.quiesce(R, 600);
  await signIn(A); await H.quiesce(R, 1200);
  const c = R.store[WID].checked; const other = [];
  for (const k of [ks[0], ks[3], ks[4]]) if (!c[k]) lost.push('shared check ' + k);
  for (const k of [ks[1], ks[2]]) if (!c[k]) lost.push('signed-out check ' + k);
  if (!(R.store[WID].extras || []).some(e => e.name === xt)) lost.push('signed-out extra');
  // afterwards B undoes what A merged; a reload of A must not bring it back
  await go(B, 'grocery'); await sleep(300);
  await B.ev(([k]) => { const e = document.querySelector('[data-check="' + k + '"]'); if (e && e.checked) e.click(); }, [ks[1]]);
  const xid = (R.store[WID].extras || []).find(e => e.name === xt)?.id;
  if (xid) await B.ev(i => { const e = document.querySelector('[data-act="rmextra"][data-id="' + i + '"]'); if (e) e.click(); }, xid);
  await H.quiesce(R, 800);
  await A.page.reload(); await A.page.waitForFunction(() => window.__T && __T.S.recipes.length && __T.S.mode === 'db' && __T.S.weeksLoaded, null, { timeout: 15000 }); await H.quiesce(R, 1200);
  if (R.store[WID].checked?.[ks[1]]) lost.push('stale local check re-applied after reload (undid the other phone)');
  if (xid && (R.store[WID].extras || []).some(e => e.id === xid)) lost.push('stale local extra re-added after reload');
  return { lost, extra: {}, relay: R, phones: [A, B] };
};
SP['first-signin-local'] = async ({ browser, docs, prof }) => {
  const R = new H.Relay({}); const A = await H.phone(browser, R, 'A', { lat: prof, ls: toLS(docs), fbInit: { user: null }, noWait: true });
  await A.page.waitForFunction(() => __T.S.mode !== 'loading'); await signIn(A); await H.quiesce(R, 1000);
  const lost = Object.keys(docs).filter(p => JSON.stringify(R.store[p]?.days ?? R.store[p]?.family) !== JSON.stringify(docs[p].days ?? docs[p].family)).map(p => 'not copied ' + p);
  return { lost, relay: R, phones: [A] };
};
SP['first-signin-two-local'] = async ({ browser, docs, docs2, prof }) => { // each parent used the app alone before; first phone signs in, then the second
  const R = new H.Relay({}); const A = await H.phone(browser, R, 'A', { lat: prof, ls: toLS(docs), fbInit: { user: null }, noWait: true });
  await A.page.waitForFunction(() => __T.S.mode !== 'loading'); await signIn(A); await H.quiesce(R, 800);
  const d2 = clone(docs2); d2[WID].checked = { 'staple|Milk': true, 'staple|Eggs': true }; d2[WID].extras = [{ id: 'old1', name: 'stale extra' }];
  const B = await H.phone(browser, R, 'B', { lat: prof, ls: toLS(d2), fbInit: { user: null }, noWait: true });
  await B.page.waitForFunction(() => __T.S.mode !== 'loading'); await signIn(B); await H.quiesce(R, 1000);
  const w = R.store[WID]; const warn = [], lost2 = []; if (rids(w) !== rids(docs[WID])) warn.push("first phone's plan changed");
  if (w.checked?.['staple|Milk'] || (w.extras || []).some(e => e.id === 'old1')) lost2.push("second phone's old local checks/extras merged into the shared week");
  if (rids(docs2[WID]) !== rids(docs[WID])) warn.push("second phone's own local plan silently not merged (toast only)");
  return { lost: lost2, warn, relay: R, phones: [A, B] };
};
SP['bug-a-no-settings-doc'] = async ({ browser, docs, docs2, prof }) => {
  const d1 = clone(docs); delete d1['app/settings']; // phone 1 started on an empty phone, planned a week, never touched a setting
  const R = new H.Relay(clone(d1)); const B = await H.phone(browser, R, 'B', { lat: prof, ls: toLS(docs2), fbInit: { user: null }, noWait: true });
  await B.page.waitForFunction(() => __T.S.mode !== 'loading'); await signIn(B); await H.quiesce(R, 1200);
  const lost = []; if (rids(R.store[WID]) !== rids(d1[WID])) lost.push('shared week overwritten by 2nd phone local week');
  return { lost, relay: R, phones: [B] };
};
SP['bug-b-hold'] = async ({ browser, docs, prof }) => { // weeks snapshot not yet delivered when the user taps Plan this week
  const R = new H.Relay(clone(docs)); const B = await H.phone(browser, R, 'B', { lat: prof, fbInit: { stage: { weeks: 'hold' } }, noWait: true });
  await B.page.waitForFunction(() => __T.S.mode === 'db'); await go(B, 'plan');
  const has = await B.ev(() => !!document.querySelector('[data-act="generate"]')); if (!has) { await B.ev(() => __FS.release('weeks')); await H.quiesce(R, 800); return { lost: rids(R.store[WID]) !== rids(docs[WID]) ? ['changed'] : [], extra: { note: 'no Plan button while the shared weeks are still loading' }, relay: R, phones: [B] }; }
  if (false) return { lost: [], extra: { note: 'x' }, relay: R, phones: [B] };
  await click(B, '[data-act="generate"]'); await sleep(900); await B.ev(() => __FS.release('weeks')); await H.quiesce(R, 1200);
  const lost = []; if (rids(R.store[WID]) !== rids(docs[WID])) lost.push('shared week overwritten by plan made before weeks loaded'); return { lost, relay: R, phones: [B] };
};
SP['bug-b-empty-cache'] = async ({ browser, docs, prof }) => { // cold start offline: empty local cache answers the weeks query, then phone reconnects
  const R = new H.Relay(clone(docs)); const B = await H.phone(browser, R, 'B', { lat: prof, fbInit: { offline: true, cache: {}, stage: {} }, noWait: true });
  await B.page.waitForFunction(() => __T.S.mode === 'db'); await sleep(700); await go(B, 'plan');
  if (!(await B.ev(() => !!document.querySelector('[data-act="generate"]')))) { await B.setOnline(true); await H.quiesce(R, 800); return { lost: rids(R.store[WID]) !== rids(docs[WID]) ? ['changed'] : [], extra: { note: 'no Plan button while the shared weeks are not loaded' }, relay: R, phones: [B] }; }
  await click(B, '[data-act="generate"]'); await sleep(900); await B.setOnline(true); await H.quiesce(R, 1500);
  const lost = []; if (rids(R.store[WID]) !== rids(docs[WID])) lost.push('shared week overwritten after offline plan'); return { lost, relay: R, phones: [B] };
};
SP['bug-c-delete-custom'] = async ({ browser, docs, prof }) => {
  const d = clone(docs); const id = 'c-test1'; const day = '2026-11-17';
  d['custom/' + id] = { id, n: 'Grandma Test Casserole', k: 'main', c: ['M'], t: 40, h: 15, s: '4', r: 0, i: ['1 lb ground beef', '2 cups rice'], d: 'Bake.', no: '', de: '', src: 'Added by you', u: '', nu: '', red: null, img: false, created: 1 };
  d[WID].days[day].rid = id; d[WID].days[day].locked = true;
  const R = new H.Relay(d); const A = await H.phone(browser, R, 'A', { lat: prof }), B = await H.phone(browser, R, 'B', { lat: prof });
  await go(A, 'plan'); await go(B, 'plan');
  await A.ev(i => { __T.S.modal = { type: 'recipe', id: i }; __T.render(); }, id); await click(A, '[data-act="delrecipe"]'); await click(A, '[data-act="delrecipe"]');
  await H.quiesce(R, 1000); await go(B, 'grocery'); await sleep(300); await go(B, 'plan'); await sleep(300);
  const lost = []; if (R.store[WID].days[day].rid === id) lost.push('week still plans deleted recipe ' + id);
  const shown = await B.ev(d => { const el = document.querySelector(`[data-act="reroll"][data-day="${d}"]`)?.closest('.day'); return el ? el.innerText.replace(/\s+/g, ' ').slice(0, 160) : null; }, day);
  return { lost, extra: { nightShows: shown, errors: [...A.errors, ...B.errors] }, relay: R, phones: [A, B] };
};
SP['bug-b-stale-cache'] = async ({ browser, docs, prof }) => { // offline cold start: the cache only holds an older week, the other phone has planned this week
  const old = clone(docs[WID]); old.start = '2026-11-06';
  const cache = { 'app/settings': clone(docs['app/settings']), 'weeks/2026-11-06': old };
  const R = new H.Relay({ ...clone(docs), 'weeks/2026-11-06': clone(old) }); const B = await H.phone(browser, R, 'B', { lat: prof, fbInit: { offline: true, cache }, noWait: true });
  await B.page.waitForFunction(() => __T.S.mode === 'db'); await sleep(700); await go(B, 'plan');
  if (!(await B.ev(() => !!document.querySelector('[data-act="generate"]')))) { await B.setOnline(true); await H.quiesce(R, 1000); return { lost: rids(R.store[WID]) !== rids(docs[WID]) ? ['changed'] : [], extra: { note: 'no Plan button until synced' }, relay: R, phones: [B] }; }
  await click(B, '[data-act="generate"]'); await sleep(900); await B.setOnline(true); await H.quiesce(R, 1500);
  const lost = []; if (rids(R.store[WID]) !== rids(docs[WID])) lost.push('shared week overwritten after planning from a stale cache'); return { lost, relay: R, phones: [B] };
};
SP['plan-draft-both'] = async ({ browser, docs, prof }) => { // week unplanned on both phones: A taps Make my plan, B picks meals by hand 0-800 ms later
  const d = clone(docs); delete d[WID];
  const R = new H.Relay(d); const A = await H.phone(browser, R, 'A', { lat: prof }), B = await H.phone(browser, R, 'B', { lat: prof });
  await go(A, 'plan'); await go(B, 'plan'); let aDid = false, bDid = false;
  // if the other phone's plan already reached this screen the button is gone and there is nothing to race
  const planA = async () => { aDid = await A.ev(() => { const e = document.querySelector('[data-act="generate"]'); if (e) e.click(); return !!e; }); };
  const planB = async () => { bDid = await B.ev(() => { const e = document.querySelector('[data-act="planhand"]'); if (e) e.click(); return !!e; }); if (!bDid) return; await sleep(150); await B.ev(() => { const s = document.querySelector('select[data-cat]'); if (s) { s.value = 'M'; s.dispatchEvent(new Event('change', { bubbles: true })); } }); };
  const off = H.rnd([0, 800]), first = Math.random() < .5;
  await Promise.all([first ? planA() : sleep(off).then(planA), first ? sleep(off).then(planB) : planB()]); await H.quiesce(R, 1500);
  const cnt = w => Object.values(w?.days || {}).filter(x => x.rid).length; const lost = [];
  if (!(aDid && bDid)) return { lost, warn: ['not a race: the other phone\'s plan had already arrived'], relay: R, phones: [A, B] };
  const fin = cnt(R.store[WID]); if (!R.store[WID]) lost.push('week missing'); else if (fin < 5) lost.push('plan wiped: only ' + fin + ' nights planned in the shared week');
  return { lost, relay: R, phones: [A, B] };
};
module.exports = { SP };
