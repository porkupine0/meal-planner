// Golden regression test for the grocery engine.
// Runs every ingredient line in recipes.json through the app's own parser and Walmart matcher
// and compares the result to tests/grocery-golden.json.
//
//   node tests/grocery.js            check (exit 1 on any difference)
//   node tests/grocery.js --update   accept the current output as the new golden file
//
// Needs Playwright (npm i -D playwright, or a global install). Serves the repo itself on a free port.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), GOLD = path.join(__dirname, 'grocery-golden.json');
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json'};

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': TYPES[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // Block the Firebase SDK so the test never signs in or talks to the network.
  await page.route(/gstatic|googleapis|firebase/, r => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug&nosw`);
  await page.waitForFunction(() => window.__T && __T.S.recipes.length, null, {timeout: 20000});
  const out = await page.evaluate(() => {
    const T = window.__T, res = {};
    for (const r of T.S.recipes) for (const line of r.i) {
      if (line in res) continue;
      res[line] = T.parseIngredient(line).map(it => {
        const p = T.wmPick('i:' + it.core, it.name, [it]);
        return [it.name, [it.qty == null ? it.qty : Math.round(it.qty * 1000) / 1000, it.unit].filter(x => x !== '' && x != null).join(' '), T.aisleOf(it), p ? p.label || p.id : ''].join(' | ');
      });
    }
    return res;
  });
  await browser.close(); server.close();
  if (errors.length) { console.error('Page errors:\n' + errors.join('\n')); process.exit(1); }

  const sorted = Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]));
  if (process.argv.includes('--update') || !fs.existsSync(GOLD)) {
    fs.writeFileSync(GOLD, JSON.stringify(sorted, null, 1) + '\n');
    console.log(`Wrote ${Object.keys(sorted).length} lines to tests/grocery-golden.json`); return;
  }
  const gold = JSON.parse(fs.readFileSync(GOLD, 'utf8'));
  const diffs = [];
  for (const k of new Set([...Object.keys(gold), ...Object.keys(sorted)])) {
    const a = JSON.stringify(gold[k]), b = JSON.stringify(sorted[k]);
    if (a !== b) diffs.push(`  ${k}\n    was: ${a || '(new line)'}\n    now: ${b || '(removed)'}`);
  }
  if (!diffs.length) { console.log(`OK: ${Object.keys(sorted).length} ingredient lines match the golden file`); return; }
  console.log(`${diffs.length} ingredient line(s) changed:\n` + diffs.slice(0, 60).join('\n') + (diffs.length > 60 ? `\n  …and ${diffs.length - 60} more` : ''));
  console.log('\nIf these changes are intended, run: node tests/grocery.js --update');
  process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
