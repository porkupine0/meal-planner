// Breakfast and lunch slots, driven through the real screens. Needs the app served on :8800 (python3 -m http.server 8800).
// Exits 1 on the first failed check.
const { chromium } = require('playwright');
let failed = 0; const ok = (c, m) => { if (!c) { failed++; console.log('FAIL', m); } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch(), c = await b.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  await c.route(/firebase|gstatic|googleapis|anthropic/, r => r.abort());
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8800/?debug&nosw'); await p.waitForSelector('.tab'); await p.waitForTimeout(400);
  await p.click('[data-act="generate"]'); await p.waitForTimeout(500);
  const state = () => p.evaluate(() => { const T = __T, m = T.groceryModel(), w = T.getWeek(T.curStart()); return { total: m.total, url: T.walmartModel(m).url, noRecipe: m.noRecipe.length, days: JSON.parse(JSON.stringify(w.days)), groups: Object.fromEntries(Object.values(m.groups).map(g => [g.core, g.qty])) }; });
  const base = await state();
  const night = await p.evaluate(() => { const w = __T.getWeek(__T.curStart()); return Object.keys(w.days).sort().find(k => w.days[k].rid && k >= new Date().toISOString().slice(0, 10)); });
  ok(!!night, 'a future planned night exists: ' + night);
  // switches are off by default: no rows
  ok(await p.$$eval('.meal-lines', a => a.length) === 0, 'off by default: no breakfast or lunch rows');
  // turn them on in Settings
  await p.$eval('.tab[data-view="settings"]', e => e.click()); await p.waitForTimeout(300);
  await p.$eval('[data-meal-slot="b"]', e => e.click()); await p.$eval('[data-meal-slot="l"]', e => e.click()); await p.waitForTimeout(300);
  await p.$eval('.tab[data-view="plan"]', e => e.click()); await p.waitForTimeout(300);
  ok(await p.$$eval('.meal-lines', a => a.length) > 0, 'on: rows appear');
  // typed breakfast, with the Enter key; nothing changes on the list or in the cart
  await p.evaluate(k => document.querySelector(`[data-act="meal"][data-slot="b"][data-day="${k}"]`).click(), night); await p.waitForTimeout(300);
  await p.fill('#meal-text', 'Pancakes'); await p.press('#meal-text', 'Enter'); await p.waitForTimeout(400);
  let s1 = await state();
  ok(s1.days[night].b && s1.days[night].b.t === 'Pancakes', 'typed breakfast saved with Enter');
  ok(s1.total === base.total && s1.url === base.url, 'typed breakfast adds nothing to the list or cart');
  ok(s1.noRecipe === 1, 'typed breakfast shows as a reminder');
  ok(s1.days[night].rid === base.days[night].rid && s1.days[night].locked === base.days[night].locked, 'dinner and its lock untouched');
  // a lunch recipe through the picker; list and cart grow, doubling the batch doubles the amounts
  await p.evaluate(k => document.querySelector(`[data-act="meal"][data-slot="l"][data-day="${k}"]`).click(), night); await p.waitForTimeout(300);
  const lunchId = await p.evaluate(() => document.querySelector('.pick').dataset.choose); await p.click('.pick'); await p.waitForTimeout(400);
  let s2 = await state();
  ok(s2.days[night].l && s2.days[night].l.r === lunchId, 'lunch recipe saved');
  ok(s2.total > s1.total, 'lunch recipe adds ingredients to the list');
  ok(s2.url !== s1.url, 'lunch recipe adds products to the cart');
  ok(s2.days[night].rid === base.days[night].rid && s2.days[night].locked === base.days[night].locked, 'dinner and its lock still untouched');
  await p.selectOption(`[data-mscale="${night}|l"]`, '2'); await p.waitForTimeout(400);
  const s3 = await state(); const dbl = Object.keys(s3.groups).filter(k => s2.groups[k] && s3.groups[k] !== s2.groups[k]).length;
  ok(dbl > 0, 'a 2x batch changes the amounts on the list (' + dbl + ' lines)');
  // off: the list and cart are exactly what they were with no slots, and what was entered is kept (compare before anything is cleared)
  await p.evaluate(() => { __T.S.settings.mealB = false; __T.S.settings.mealL = false; __T.render(); }); await p.waitForTimeout(300);
  ok(await p.$$eval('.meal-lines', a => a.length) === 0, 'off hides the rows');
  const off = await state(); ok(off.days[night].l && off.days[night].l.r === lunchId, 'off keeps what was entered');
  ok(off.total === base.total && off.url === base.url, 'off: the list and cart are the same as with no slots');
  await p.evaluate(() => { __T.S.settings.mealB = true; __T.S.settings.mealL = true; __T.render(); }); await p.waitForTimeout(300);
  // changing the week start day keeps breakfast and lunch (the week is re-dated)
  const wsBefore = await p.evaluate(() => { const w = __T.getWeek(__T.curStart()); return Object.values(w.days).filter(d => d.l || d.b).length; });
  await p.$eval('.tab[data-view="settings"]', e => e.click()); await p.waitForTimeout(300);
  await p.selectOption('#ws', '1'); await p.waitForTimeout(600);
  const wsAfter = await p.evaluate(() => { let n = 0; for (const w of Object.values(__T.S.weeks)) for (const d of Object.values(w.days)) if (d.l || d.b) n++; return n; });
  ok(wsAfter >= wsBefore && wsBefore > 0, 'week start change keeps breakfast and lunch (' + wsBefore + ' before, ' + wsAfter + ' after)');
  await p.selectOption('#ws', '5'); await p.waitForTimeout(600); await p.$eval('.tab[data-view="plan"]', e => e.click()); await p.waitForTimeout(300);
  const before = JSON.stringify([s3.days[night].b, s3.days[night].l]);
  // clear the night: slots stay
  await p.evaluate(k => document.querySelector(`[data-act="clear"][data-day="${k}"]`).click(), night); await p.waitForTimeout(400);
  const s4 = await state(); ok(JSON.stringify([s4.days[night].b, s4.days[night].l]) === before && !s4.days[night].rid, 'Clear night keeps breakfast and lunch');
  // remove with the X
  await p.evaluate(k => document.querySelector(`[data-act="unmeal"][data-slot="b"][data-day="${k}"]`).click(), night); await p.waitForTimeout(300);
  ok(!(await state()).days[night].b, 'X removes the breakfast');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
