const H = require('./h'); const { SC, PROFILES, WID } = require('./scen'); const { SP } = require('./scen2'); const fs = require('fs');
const [name, N = 20] = process.argv.slice(2); const sleep = H.sleep;
const strip = s => JSON.stringify(s);
async function diverged(R, phones) {
  const out = [];
  for (const P of phones) {
    const st = await P.ev(() => ({ weeks: JSON.stringify(Object.fromEntries(Object.entries(__T.S.weeks).map(([k, w]) => [k, w]))), settings: [__T.S.settings.family, __T.S.settings.weekStart, __T.S.settings.pantry.filter(p => p.on).length], walmart: JSON.stringify(__T.S.walmart.stores || {}), fridge: (__T.S.fridge.items || []).length })).catch(e => null);
    if (!st) continue;
    const sw = Object.fromEntries(Object.entries(R.store).filter(([p]) => p.startsWith('weeks/')).map(([p, w]) => [p.slice(6), w]));
    const same = (a, b) => JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());
    const norm = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);
    if (norm(JSON.parse(st.weeks)) !== norm(sw)) { const a = JSON.parse(st.weeks); const dk = []; for (const k of new Set([...Object.keys(a), ...Object.keys(sw)])) { if (norm(a[k]) !== norm(sw[k])) for (const f of new Set([...Object.keys(a[k] || {}), ...Object.keys(sw[k] || {})])) if (norm(a[k]?.[f]) !== norm(sw[k]?.[f])) dk.push(k + '.' + f + ' phone=' + norm(a[k]?.[f])?.slice(0, 900) + ' server=' + norm(sw[k]?.[f])?.slice(0, 900)); } out.push(P.name + ':weeks ' + dk.join(' | ')); }
    const s = R.store['app/settings']; if (s && (s.family !== st.settings[0] || s.weekStart !== st.settings[1] || s.pantry.filter(p => p.on).length !== st.settings[2])) out.push(P.name + ':settings');
    if (norm(R.store['app/walmart']?.stores || {}) !== norm(JSON.parse(st.walmart))) out.push(P.name + ':walmart');
    if ((R.store['app/fridge']?.items || []).length !== st.fridge) out.push(P.name + ':fridge');
  }
  return out;
}
(async () => {
  const browser = await H.chromium.launch(); const docs = await H.seedDocs(browser); const docs2 = await H.seedDocs(browser);
  const res = { name, runs: 0, lostRuns: 0, divergedRuns: 0, errRuns: 0, lostItems: {}, warns: {}, samples: [], extra: [], net: 0, skip: null }; const profs = Object.keys(PROFILES);
  for (let i = 0; i < +N; i++) {
    const pn = profs[i % 3], prof = PROFILES[pn]; let out, R, phones;
    try {
      if (SP[name]) { out = await SP[name]({ browser, docs, docs2, prof }); R = out.relay; phones = out.phones; }
      else {
        R = new H.Relay(JSON.parse(JSON.stringify(docs))); const A = await H.phone(browser, R, 'A', { lat: prof }), B = await H.phone(browser, R, 'B', { lat: prof }); phones = [A, B];
        out = await SC[name]({ A, B, R, docs });
      }
      if (out.skip) { res.skip = out.skip; break; }
      res.runs++; const dv = await diverged(R, phones);
      const errs = phones.flatMap(P => P.errors); res.net += R.net.length;
      if (out.lost.length) { res.lostRuns++; for (const l of out.lost) { const k = l.replace(/[:|][^ ]*$/, '').slice(0, 60); res.lostItems[k] = (res.lostItems[k] || 0) + 1; } if (res.samples.length < 3) res.samples.push({ prof: pn, lost: out.lost.slice(0, 6) }); }
      for (const w of out.warn || []) res.warns[w.replace(/ [^ ]*$/, '')] = (res.warns[w.replace(/ [^ ]*$/, '')] || 0) + 1;
      if (dv.length) { res.divergedRuns++; if (res.samples.length < 5) res.samples.push({ prof: pn, diverged: dv }); }
      if (errs.length) { res.errRuns++; res.samples.push({ errors: [...new Set(errs)].slice(0, 3) }); }
      if (out.extra && res.extra.length < 2) res.extra.push(out.extra);
      if (out.converged === false) { res.divergedRuns++; }
    } catch (e) { res.crash = (res.crash || 0) + 1; res.samples.push({ crash: e.message.slice(0, 200) }); }
    for (const c of browser.contexts()) await c.close().catch(() => {});
  }
  fs.writeFileSync(`results/${process.env.TAG || ''}${name}.json`, JSON.stringify(res, null, 1)); console.log(name, JSON.stringify({ runs: res.runs, lostRuns: res.lostRuns, div: res.divergedRuns, err: res.errRuns, crash: res.crash || 0 }));
  await browser.close();
})();
