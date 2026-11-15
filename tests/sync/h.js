// two-phone harness: shared server relay in node, one browser context (own localStorage) per phone
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const MOCK = fs.readFileSync(path.join(__dirname, process.env.MOCKFILE || 'fbmock2.js'), 'utf8');
const norm = x => JSON.stringify(x, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(q => [q, v[q]])) : v);
const clone = x => JSON.parse(JSON.stringify(x));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = ([a, b]) => a + Math.random() * (b - a);
const TIME = '2026-11-13T09:00:00-06:00'; // Friday (default week start), whole week still ahead
let PORT = +process.env.PORT || 8800;

const isObj = v => v && typeof v === 'object' && !Array.isArray(v) && !v.__del && !v.__union && !v.__remove;
function mergeInto(t, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && v.__del) delete t[k];
    else if (v && v.__union) { const a = Array.isArray(t[k]) ? t[k] : (t[k] = []); for (const x of v.__union) if (!a.some(y => norm(y) === norm(x))) a.push(clone(x)); }
    else if (v && v.__remove) { if (Array.isArray(t[k])) t[k] = t[k].filter(y => !v.__remove.some(x => norm(x) === norm(y))); }
    else if (isObj(v)) { if (!isObj(t[k])) t[k] = {}; mergeInto(t[k], v); }
    else t[k] = clone(v);
  }
}
class Relay {
  constructor(store = {}) { this.store = store; this.ver = {}; this.phones = {}; this.log = []; this.net = []; for (const p of Object.keys(store)) this.ver[p] = 1; }
  snapshotAll() { const c = {}; for (const p of new Set([...Object.keys(this.store), ...Object.keys(this.ver)])) c[p] = [this.ver[p] || 0, p in this.store ? clone(this.store[p]) : null]; return c; }
  apply(m) { // returns {ok, code, changes}
    const s = this.store, ch = {};
    if (m.t === 'set') { if (m.merge) { const t = s[m.p] || (s[m.p] = {}); mergeInto(t, m.d); } else s[m.p] = clone(m.d); ch[m.p] = clone(s[m.p]); }
    else if (m.t === 'delete') { delete s[m.p]; ch[m.p] = null; }
    else if (m.t === 'batch') for (const [p, d] of m.sets) { s[p] = clone(d); ch[p] = clone(d); }
    else if (m.t === 'update') {
      if (!(m.p in s)) return { ok: false, code: 'not-found', changes: {} };
      for (const [fp, v] of m.ops) { let o = s[m.p]; for (let j = 0; j < fp.length - 1; j++) o = (o[fp[j]] ||= {}); const lk = fp[fp.length - 1]; if (v && v.__del) delete o[lk]; else if (v && v.__union) { const a = Array.isArray(o[lk]) ? o[lk] : (o[lk] = []); for (const x of v.__union) if (!a.some(y => norm(y) === norm(x))) a.push(clone(x)); } else if (v && v.__remove) { if (Array.isArray(o[lk])) o[lk] = o[lk].filter(y => !v.__remove.some(x => norm(x) === norm(y))); } else o[lk] = clone(v); }
      ch[m.p] = clone(s[m.p]);
    }
    this.log.push([m.t, m.p || '(batch)']);
    const out = {}; for (const [p, d] of Object.entries(ch)) { this.ver[p] = (this.ver[p] || 0) + 1; out[p] = [this.ver[p], d]; }
    return { ok: true, changes: out };
  }
}
async function phone(browser, relay, name, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const P = { name, ctx, page, errors: [], lat: o.lat || { up: [20, 120], down: [20, 120] }, q: Promise.resolve() };
  relay.phones[name] = P;
  page.on('pageerror', e => P.errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.clock.setFixedTime(new Date(o.time || TIME));
  await ctx.route(u => !/^https?:\/\/localhost[:\/]/.test(u.href), r => { relay.net.push(r.request().url()); r.abort(); });
  await ctx.route(/gstatic\.com\/firebasejs/, r => r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: MOCK }));
  await ctx.exposeFunction('__relayInit', async () => { await sleep(rnd(P.lat.down)); return { changes: relay.snapshotAll() }; });
  await ctx.exposeFunction('__relaySend', async m => {
    // uplink is pipelined: each write arrives up-latency after it was sent, but never before an earlier write from this phone
    const t = Math.max((P.lastArr || 0) + 1, Date.now() + rnd(P.lat.up)); P.lastArr = t; await sleep(Math.max(0, t - Date.now()));
    const r = relay.apply(m);
    for (const [n, Q] of Object.entries(relay.phones)) if (Q !== P && !Q.offline) Q.q = Q.q.then(async () => { await sleep(rnd(Q.lat.down)); await Q.page.evaluate(c => window.__FS && __FS.onServer(c), r.changes).catch(e => { relay.net.push('PUSHFAIL ' + e.message.slice(0, 100)); }); });
    await sleep(rnd(P.lat.down));
    return r;
  });
  if (o.ls) await page.addInitScript(({ ls }) => { try { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded', '1'); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); } catch {} }, { ls: o.ls });
  await page.addInitScript(v => { window.__FBINIT = v; }, o.fbInit || {});
  await page.goto(`http://localhost:${PORT}/?debug&nosw`);
  await page.waitForFunction(() => window.__T && __T.S.recipes.length, null, { timeout: 20000 });
  if (!o.noWait) await page.waitForFunction(() => __T.S.mode === 'db' && __T.S.weeksLoaded, null, { timeout: 10000 });
  P.offline = false; P.relay = relay;
  P.setOnline = async on => { P.offline = !on; await page.evaluate(v => __FS.setOnline(v), on); };
  P.ev = (f, a) => page.evaluate(f, a);
  return P;
}
// build a realistic board by planning a week on a local-mode phone, return docs {path: data}
async function seedDocs(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'America/Chicago' });
  const page = await ctx.newPage(); await page.clock.setFixedTime(new Date(opts.time || TIME));
  await ctx.route(u => !/^https?:\/\/localhost[:\/]/.test(u.href), r => r.abort());
  await page.goto(`http://localhost:${PORT}/?debug&nosw`);
  await page.waitForFunction(() => window.__T && __T.S.recipes.length);
  await page.waitForFunction(() => __T.S.mode === 'local');
  await page.evaluate(() => { __T.S.view = 'plan'; __T.render(); });
  await page.click('[data-act="generate"]'); await page.waitForTimeout(700);
  if (opts.settings !== false) { await page.evaluate(() => { __T.S.view = 'settings'; __T.render(); }); await page.selectOption('#fam', '3'); await page.waitForTimeout(600); }
  await page.waitForTimeout(100);
  const ls = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('sb.')).map(k => [k, localStorage.getItem(k)])));
  await ctx.close();
  const docs = {}; for (const [k, v] of Object.entries(ls)) { const p = k.slice(3); if (/^(app|weeks|overrides|custom)\//.test(p)) docs[p] = JSON.parse(v); }
  return docs;
}
async function quiesce(relay, ms = 1200) {
  await sleep(700);
  for (let i = 0; i < 60; i++) {
    const busy = await Promise.all(Object.values(relay.phones).map(P => P.offline ? 0 : P.page.evaluate(() => __FS.pending.length).catch(() => 0)));
    if (busy.every(x => !x)) break; await sleep(150);
  }
  await sleep(ms);
  for (let i = 0; i < 20; i++) { await Promise.all(Object.values(relay.phones).map(P => P.q)); await sleep(100); }
}
module.exports = { chromium, Relay, phone, seedDocs, quiesce, sleep, rnd, clone, TIME };
