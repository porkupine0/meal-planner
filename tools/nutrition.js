#!/usr/bin/env node
/*
 * nutrition.js: nutrition parser + ingredient-based estimator for Supper Board (read-only against the app).
 *
 *   node nutrition.js test            unit tests for the nu parser
 *   node nutrition.js parse-report    coverage of the parser over catalog.json (all 700)
 *   node nutrition.js parse-lines     run the app's parseIngredient (Playwright, port 8800) over every
 *                                     ingredient line -> parsed-lines.json (cache used by the estimator)
 *   node nutrition.js estimate-report estimator coverage / confidence over the catalog
 *   node nutrition.js validate        held-out validation against trusted site nu (bias / error)
 *   node nutrition.js fixes           build nutrition-fixes.json + fix-report.json
 *
 * As a module: { parseNu, isConsistent, estimateRecipe, parseServings, openApp }
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const J = f => {
  const p = path.join(DIR, f);
  // catalog.json is built from the app's recipes.json when it isn't next to this file
  if (f === 'catalog.json' && !fs.existsSync(p)) return JSON.parse(fs.readFileSync(path.join(DIR, '..', 'recipes.json'), 'utf8')).map(r => ({id: r.id, n: r.n, k: r.k, c: r.c || [], s: r.s, i: r.i, nu: r.nu || '', ai: r.src === 'Added by Claude'}));
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

/* ============================== (a) NU PARSER ============================== */
// Returns {kcal, protein, carb, fat, servings}; every field independently null when unknown.
const num = s => { if (s == null) return null; const v = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(v) ? v : null; };
const NUM = '(~?\\s*\\d[\\d,]*(?:\\.\\d+)?)';
const TOTAL_MARK = /\b(?:full|whole|entire|total)\s+(?:recipe|batch|dish)\b|\bentire batch\b|\bfull recipe\b/i;
const PERSERV_MARK = /\b(?:amount\s+)?per\s+(?:adult\s+)?serving\b|\(per serving\)|\bper serving\b/i;

function normalize(t) {
  return String(t || '')
    .replace(/[•·\t]/g, ' ').replace(/≈|~/g, ' ').replace(/[   ]/g, ' ')
    .replace(/\bgrams?\b/gi, 'g').replace(/\bcalories?\b(?=\s*[;,.|)\n]|$)/gi, 'kcal').replace(/\bcalories\b/gi, 'Calories')
    .replace(/(\d),(\d{3})\b/g, '$1$2');
}
// choose the per-serving part of strings that also carry whole-recipe totals
function perServingSegment(t) {
  // 1) a per-serving marker: take text after the LAST one, cut at the next "total / full recipe" marker
  const marks = [...t.matchAll(new RegExp(PERSERV_MARK.source, 'gi'))];
  if (marks.length) {
    const m = marks[marks.length - 1];
    let seg = t.slice(m.index);
    const cut = seg.slice(m[0].length).search(TOTAL_MARK);
    if (cut >= 0) seg = seg.slice(0, m[0].length + cut);
    // a marker like "(per serving)\n350 Calories 16g Fat..." keeps its trailing "Nutrition Facts" panel
    if (/\bcalories|\bkcal/i.test(seg)) return seg;
  }
  // 2) several repeated Calories blocks: pick the calorie value repeated most often (smallest on ties)
  const cal = [...t.matchAll(/calories\s*:?\s*(\d[\d.]*)|(\d[\d.]*)\s*kcal/gi)].map(m => ({ v: num(m[1] || m[2]), i: m.index }));
  const uniq = [...new Set(cal.map(c => c.v))];
  if (uniq.length > 1) {
    const cnt = v => cal.filter(c => c.v === v).length;
    const best = uniq.slice().sort((a, b) => cnt(b) - cnt(a) || a - b)[0];
    const first = cal.find(c => c.v === best);
    const next = cal.find(c => c.i > first.i && c.v !== best);
    return t.slice(first.i, next ? next.i : undefined);
  }
  return t;
}
function field(seg, kind) {
  let re, m;
  if (kind === 'kcal') {
    // "Calories: 520", "CALORIES: 365", "Calories per Serving 853", "Cals: 326"; never "Calories from Fat"
    re = new RegExp('\\b(?:calories|cals)(?!\\s+from)(?:\\s+per\\s+serving)?\\s*[:=]?\\s*' + NUM, 'i');
    if ((m = seg.match(re))) return num(m[1]);
    re = new RegExp(NUM + '\\s*(?:kcal|cals?\\b|calories?)', 'i');
    if ((m = seg.match(re))) return num(m[1]);
    return null;
  }
  if (kind === 'protein') {
    re = new RegExp('\\bprotein\\s*[:=]?\\s*' + NUM, 'i'); if ((m = seg.match(re))) return num(m[1]);
    re = new RegExp(NUM + '\\s*g?\\s*(?:of\\s+)?protein', 'i'); if ((m = seg.match(re))) return num(m[1]);
    return null;
  }
  if (kind === 'carb') {
    re = new RegExp('(?<!net )\\b(?:total\\s+)?carbohydrates?\\s*[:=]?\\s*' + NUM, 'i'); if ((m = seg.match(re))) return num(m[1]);
    re = new RegExp('(?<!net )\\b(?:total\\s+)?carbs?\\s*[:=]?\\s*' + NUM, 'i'); if ((m = seg.match(re))) return num(m[1]);
    re = new RegExp(NUM + '\\s*g?\\s*(?:of\\s+)?(?:carbohydrates?|carbs)\\b', 'i'); if ((m = seg.match(re))) return num(m[1]);
    return null;
  }
  if (kind === 'fat') {
    // not Saturated / Trans / Polyunsaturated / Monounsaturated / Unsaturated Fat, not "Calories from Fat"
    re = new RegExp('(?<!saturated )(?<!trans )(?<!from )(?<!polyunsaturated )(?<!monounsaturated )(?<!unsaturated )(?<!high-)(?<!low )\\b(?:total\\s+)?fats?\\s*[:=]?\\s*' + NUM, 'i');
    for (const mm of seg.matchAll(new RegExp(re.source, 'gi'))) { return num(mm[1]); }
    re = new RegExp(NUM + '\\s*g?\\s*(?:of\\s+)?(?:total\\s+)?fat\\b', 'i'); if ((m = seg.match(re))) return num(m[1]);
    return null;
  }
  return null;
}
function parseNu(text) {
  const out = { kcal: null, protein: null, carb: null, fat: null, servings: null };
  if (!text || !String(text).trim()) return out;
  const t = normalize(text);
  const seg = perServingSegment(t);
  for (const k of ['kcal', 'protein', 'carb', 'fat']) out[k] = field(seg, k);
  // servings: "1 of 6 servings", "Servings: 8", "(~1/9 of recipe)", "(1/6 of recipe)"
  let m;
  if ((m = t.match(/\b1\s+of\s+(\d+(?:\.\d+)?)\s+servings?\b/i))) out.servings = +m[1];
  else if ((m = t.match(/\bservings?\s*:\s*(\d+)\b(?![ \t]*[a-z])/i)) || (m = t.match(/\bkeyword:.*\bservings:\s*(\d+)/i))) out.servings = +m[1];
  else if ((m = t.match(/\(\s*1\/(\d+)\s+of\s+(?:the\s+)?recipe\s*\)/i))) out.servings = +m[1];
  // sanity: implausible fields -> unknown (never "low")
  if (out.kcal != null && out.kcal <= 0) out.kcal = null;
  for (const k of ['protein', 'carb', 'fat']) if (out[k] != null && out[k] > 1500) out[k] = null;
  return out;
}
// kcal vs 4/4/9; null when it can't be judged (calories or any macro unknown)
function isConsistent(p, tol = 0.15, floor = 30) {
  if (p.kcal == null || p.protein == null || p.carb == null || p.fat == null) return null;
  const calc = 4 * p.protein + 4 * p.carb + 9 * p.fat;
  return Math.abs(calc - p.kcal) <= Math.max(tol * p.kcal, floor);
}
// per-serving kcal above this is almost certainly a whole-recipe total, not a serving
const SUSPECT_KCAL = 1800;
const suspect = p => p.kcal != null && p.kcal > SUSPECT_KCAL;

const NU_TESTS = [
  ['Calories: 520\nProtein: 38g\nCarbohydrate: 42g\nFat: 18g\nServing Size: 1 of 6 servings', { kcal: 520, protein: 38, carb: 42, fat: 18, servings: 6 }],
  ['Fat: 49g\nCalories: 608\nSaturated Fat: 17g\nSodium: 759mg\nFiber: 3g\nCholesterol: 142mg\nCarbohydrate: 6g\nSugar: 2g\nServing Size: 1 of 4 servings\nProtein: 38g', { kcal: 608, protein: 38, carb: 6, fat: 49, servings: 4 }],
  ['Calories: 453kcal | Carbohydrates: 39g | Protein: 25g | Fat: 22g | Saturated Fat: 8g', { kcal: 453, protein: 25, carb: 39, fat: 22 }],
  ['Fat: 75 g\nCalories: 1029 Calories\nSaturated Fat: 12 g\nTrans Fat: 0 g\nCarbohydrate: 26 g\nProtein: 55 g', { kcal: 1029, protein: 55, carb: 26, fat: 75 }],
  ['Amount Per Serving: CALORIES: 365 TOTAL FAT: 16g CARBOHYDRATES: 25g PROTEIN: 26g', { kcal: 365, protein: 26, carb: 25, fat: 16 }],
  ['Trans Fat: 1 grams\nFat: 15 grams\nCalories: 251\nSaturated Fat: 5 grams\nCarbohydrate: 8 grams\nProtein: 19 grams', { kcal: 251, protein: 19, carb: 8, fat: 15 }],
  ['Macros: ~520 kcal | 42g protein | 45g carbs | 18g fat', { kcal: 520, protein: 42, carb: 45, fat: 18 }],
  ['Per Serving (~1/9 of recipe):\n\t•\tCalories: ~761\n\t•\tProtein: ~31 g\n\t•\tCarbohydrates: ~54 g\n\t•\tFat: ~48 g\n\nFull Recipe (9 servings):\n\t•\tCalories: ~6,850\n\t•\tProtein: ~280 g\n\t•\tCarbohydrates: ~486 g\n\t•\tFat: ~434 g', { kcal: 761, protein: 31, carb: 54, fat: 48, servings: 9 }],
  ['Total recipe (serves ~6)\n\t•\tCalories: ~3,803\n\t•\tProtein: ~185 g\n\t•\tCarbs: ~378 g\n\t•\tFat: ~161 g\n\n⸻\n\nPer serving (1/6 of recipe)\n\t•\tCalories: ~634\n\t•\tProtein: ~31 g\n\t•\tCarbs: ~63 g\n\t•\tFat: ~27 g', { kcal: 634, protein: 31, carb: 63, fat: 27, servings: 6 }],
  ['The entire batch of cucumber crunch has 430 calories, 9g protein, 24g carbs, and 33g fat.\nAmount Per Serving: CALORIES: 205 TOTAL FAT: 5g CARBOHYDRATES: 7g PROTEIN: 30g', { kcal: 205, protein: 30, carb: 7, fat: 5 }],
  ['about 20 oz or 5 cups of rice: 510 calories, 16g protein, 106g carbs, 0g fat\nabout 1/2 cup of sauce: 240 calories, 1g protein, 30g carbs, 14g fat\nAmount Per Serving: CALORIES: 330 TOTAL FAT: 9g CARBOHYDRATES: 35g FIBER: 4g\nPROTEIN: 23g', { kcal: 330, protein: 23, carb: 35, fat: 9 }],
  ['Calories: 2162\nFat: 50g\nSaturated Fat: 24g\nSodium: 2780mg\nCarbs: 222g\nFiber: 20g\nSugar: 49g\nProtein: 206g\nCalories: 360\nFat: 8.3g\nSaturated Fat: 4g\nSodium: 463.3mg\nCarbs: 37g\nFiber: 3.3g\nSugar: 8.1g\nProtein: 34.3g\nCalories: 2201\nFat: 57g\nSaturated Fat: 28g\nProtein: 200g\nCalories: 360kcal | Carbohydrates: 37g | Protein: 34.3g | Fat: 8.3g | Saturated Fat: 4g', { kcal: 360, protein: 34.3, carb: 37, fat: 8.3 }],
  ['Serving Size: Calories 210 (Calories from Fat 80); Total Fat 9g (Saturated Fat 4g, Trans Fat 0g); Cholesterol 5mg; Sodium 170mg; Total Carbohydrate 29g (Dietary Fiber 1g, Sugars 16g); Protein 3g', { kcal: 210, protein: 3, carb: 29, fat: 9 }],
  ['(per serving)\n350 Calories 16g Fat 27g Carbs 25g Protein\nNutrition Facts\nServings: 8\nAmount per serving\nCalories 350\n% Daily Value*\nTotal Fat 16g 21%\nSaturated Fat 7g 36%\nTotal Carbohydrate 27g 10%\nProtein 25g', { kcal: 350, protein: 25, carb: 27, fat: 16, servings: 8 }],
  ['1 piece: 468 calories, 27g fat (14g saturated fat), 104mg cholesterol, 1064mg sodium, 26g carbohydrate (3g sugars, 3g fiber), 28g protein.', { kcal: 468, protein: 28, carb: 26, fat: 27 }],
  ['One serving yields 235 calories, 9 grams of fat, 11 grams of carbs, and 22 grams of protein.', { kcal: 235, protein: 22, carb: 11, fat: 9 }],
  ['Calories: 3864 calories', { kcal: 3864, protein: null, carb: null, fat: null }],
  ['Calories: 463kcal', { kcal: 463, protein: null, carb: null, fat: null }],
  ['Saturated Fat\nCholesterol\nSodium\nCarbohydrates', { kcal: null, protein: null, carb: null, fat: null }],
  ['Iron-Rich: Each serving provides 10 mg of iron, supporting energy levels. High-Fiber: Contains 24 g of fiber.', { kcal: null, protein: null, carb: null, fat: null }],
  ['Low Carb - only 3g total carbs, and 2 g net carbs per serving 290 kcal\nCalories: 290kcal Carbohydrates: 3g Protein: 17g\nFat: 23g Saturated Fat: 11g', { kcal: 290, protein: 17, carb: 3, fat: 23 }],
  ['Calories 291\nFat 17.1 g (26.4%)\nSaturated 7.0 g (35.0%)\nCarbs 16.7 g (5.6%)\nFiber 1.0 g (4.1%)\nProtein 17.0 g (33.9%)', { kcal: 291, protein: 17, carb: 16.7, fat: 17.1 }],
  ['Serving: 1 plate | Calories: 354kcal | Carbohydrates: 8.9g | Protein: 26g | Fat: 24g | Saturated Fat: 11g | Polyunsaturated Fat: 4.3g | Trans Fat: 0.2g', { kcal: 354, protein: 26, carb: 8.9, fat: 24 }],
  ['Nutrition (Per Adult Serving):\n\t•\tCalories: ~510\n\t•\tProtein: 45g\n\t•\tCarbs: 38g\n\t•\tFat: 21g', { kcal: 510, protein: 45, carb: 38, fat: 21 }],
  ['515 Calories | 48g Protein | 49g Carbs | 12g Fat', { kcal: 515, protein: 48, carb: 49, fat: 12 }],
  ['Calories per Serving 853\nTotal Fat 41.2 g\nSaturated Fat 14.2 g\nTotal Carbohydrates 66.7 g\nProtein 52.9 g', { kcal: 853, protein: 52.9, carb: 66.7, fat: 41.2 }],
  ['', { kcal: null, protein: null, carb: null, fat: null }],
];
function runTests() {
  let bad = 0;
  NU_TESTS.forEach(([t, want], i) => {
    const got = parseNu(t);
    for (const k of Object.keys(want)) if (got[k] !== want[k]) { bad++; console.log(`FAIL #${i} ${k}: got ${got[k]} want ${want[k]}  <- ${JSON.stringify(t.slice(0, 70))}`); }
  });
  console.log(bad ? `${bad} field failures` : `all ${NU_TESTS.length} parser tests pass`);
  return !bad;
}

/* coverage over catalog */
function parseReport() {
  const cat = J('catalog.json');
  const rows = cat.map(r => ({ id: r.id, n: r.n, k: r.k, p: parseNu(r.nu), blank: !String(r.nu || '').trim() }));
  const c = { total: rows.length, blank: 0, full4: 0, kcalOnly: 0, partial: 0, unparsedNonBlank: 0, consistent: 0, inconsistent: 0, notJudgeable: 0, suspect: 0, servings: 0 };
  const unparsed = [], partial = [];
  for (const x of rows) {
    const p = x.p; if (x.blank) { c.blank++; continue; }
    const known = ['kcal', 'protein', 'carb', 'fat'].filter(k => p[k] != null).length;
    if (known === 4) c.full4++; else if (known === 0) { c.unparsedNonBlank++; unparsed.push(x); } else if (known === 1 && p.kcal != null) c.kcalOnly++; else { c.partial++; partial.push(x); }
    const ok = isConsistent(p); if (ok === true) c.consistent++; else if (ok === false) c.inconsistent++; else c.notJudgeable++;
    if (suspect(p)) c.suspect++;
    if (p.servings) c.servings++;
  }
  return { c, rows, unparsed, partial };
}

/* ============================ (b) ESTIMATOR ============================ */
/*
 * FOODS: USDA-style values per 100 g, AS PURCHASED (raw meat, dry pasta/rice/beans, drained for canned beans).
 *   [regex on cleaned ingredient name, kcal, protein, carb, fat, gPerCup, gEach, extras]
 * extras: y = edible fraction for weight units (bone-in cuts, trim); can/pkg/jar/bag/box = default grams of a container;
 *         drain = drained fraction of a can; head/bunch/slice/stalk/clove = grams; tiny = true (spice, ignorable when unmapped)
 * First match wins, so specific rows come before generic ones.
 */
const FOODS = [
  // ---- fats and oils
  [/\b(olive|vegetable|canola|avocado|peanut|sunflower|safflower|corn|neutral|cooking|grapeseed|sesame|toasted sesame|frying|cooking) oil\b|^oil\b|\bshortening\b/, 884, 0, 0, 100, 218, 14, { oil: 1 }],
  [/\bcoconut oil\b/, 862, 0, 0, 100, 218, 14, { oil: 1 }],
  [/\bcooking spray\b|\bnonstick spray\b|\bbaking spray\b/, 0, 0, 0, 0, 100, 1, { tiny: 1 }],
  [/\blard\b|\bbacon (fat|grease|drippings)\b|\bschmaltz\b/, 902, 0, 0, 100, 205, 13, { oil: 1 }],
  [/\bghee\b/, 876, 0, 0, 99, 205, 14, {}],
  [/\bbutter\b(?!\s*(beans?|lettuce|nut|milk|scotch|cream cheese))|\bmargarine\b/, 717, 0.9, 0.1, 81, 227, 14, { stick: 113 }],
  [/\bbuttermilk\b/, 40, 3.3, 4.8, 0.9, 245, 245, {}],
  [/\b(mayonnaise|mayo|miracle whip)\b/, 680, 1, 0.6, 75, 220, 14, {}],
  // ---- dairy and eggs
  [/\begg whites?\b/, 52, 11, 0.7, 0.2, 243, 33, {}],
  [/\begg yolks?\b/, 322, 16, 3.6, 27, 243, 17, {}],
  [/\begg substitute\b/, 60, 12, 1, 1, 243, 50, {}],
  [/\beggs?\b(?!\s*(noodles?|roll|wrap))/, 143, 12.6, 0.7, 9.5, 243, 50, {}],
  [/\b(half[ -]and[ -]half)\b|\bhalf & half\b/, 131, 3, 4.3, 11.5, 242, 15, {}],
  [/\bheavy (whipping )?cream\b|\bwhipping cream\b|\bheavy whipping\b|\bdouble cream\b/, 340, 2.8, 2.7, 36, 238, 15, {}],
  [/\bcoconut (milk|cream)\b/, 197, 2, 3, 21, 226, 15, { can: 400 }],
  [/\bsweetened condensed milk\b|\bcondensed milk\b/, 321, 7.9, 54, 8.7, 306, 20, { can: 397 }],
  [/\bevaporated milk\b/, 134, 6.8, 10, 7.6, 252, 15, { can: 354 }],
  [/\b(skim|nonfat|fat[- ]free) milk\b/, 34, 3.4, 5, 0.1, 245, 245, {}],
  [/\b(milk|oat milk|almond milk|soy milk|whole milk|2% milk|reduced-fat milk|low-fat milk)\b(?! (chocolate|powder))/, 55, 3.3, 4.8, 2.7, 244, 244, {}],
  [/\bsour cream\b|\bcrema\b|\bcreme fraiche\b|\bcrème fraîche\b/, 193, 2.4, 4.6, 19, 230, 15, {}],
  [/\bcream cheese\b/, 342, 6, 4, 34, 232, 14, { pkg: 227 }],
  [/\bgreek yogurt\b|\bplain yogurt\b|\byogurt\b|\bskyr\b/, 70, 8, 4, 2, 245, 170, {}],
  [/\bcottage cheese\b/, 98, 11, 3.4, 4.3, 226, 226, {}],
  [/\bricotta\b/, 174, 11, 3, 13, 246, 246, {}],
  [/\bparmesan|\bpecorino|\bromano\b|\basiago\b/, 431, 38, 4, 29, 100, 5, {}],
  [/\bmozzarella\b|\bburrata\b|\bscamorza\b/, 290, 22, 2.5, 21, 113, 28, {}],
  [/\bfeta\b|\bcotija\b|\bqueso fresco\b/, 264, 14, 4, 21, 150, 28, {}],
  [/\bgoat cheese\b|\bchevre\b/, 364, 22, 0.1, 30, 150, 28, {}],
  [/\bblue cheese\b|\bgorgonzola\b|\bgorgonzola\b/, 353, 21, 2.3, 29, 135, 28, {}],
  [/\b(queso|cheese sauce|nacho cheese|cheese dip)\b/, 150, 5, 8, 11, 250, 30, {}],
  [/\bcheese\b|\bcheddar\b|\bgruy|\bswiss\b|\bprovolone\b|\bjack\b|\bfontina\b|\bgouda\b|\bhavarti\b|\bmuenster\b|\bcolby\b|\bmanchego\b|\bhalloumi\b|\bpaneer\b/, 380, 25, 2, 30, 113, 28, {}],
  [/\bwhipped (topping|cream)\b|\bcool whip\b|\bwhipped cream\b/, 257, 1, 22, 18, 60, 5, {}],
  [/\bice cream\b/, 207, 3.5, 24, 11, 132, 66, {}],
  // ---- poultry / meats (raw, as purchased)
  [/\brotisserie chicken\b|\bcooked chicken\b|\bshredded chicken\b|\bleftover chicken\b|\bchicken, cooked\b|\bgrilled chicken\b|\bgrilled breast\b|\bdiced chicken\b|\bcanned chicken\b|\bchicken meat\b/, 165, 31, 0, 3.6, 140, 450, { cookedMeat: 1, y: 0.6 }],
  [/\bchicken wings?\b|\bwingettes?\b|\bdrumettes?\b/, 203, 17.5, 0, 14.4, 450, 40, { y: 1 }],
  [/\bchicken drumsticks?\b|\bchicken legs?\b|\bdrumsticks?\b/, 170, 17, 0, 11, 450, 100, { y: 1 }],
  [/\bchicken thighs?\b/, 135, 18.5, 0, 6.5, 140, 115, { y: 1 }],
  [/\bchicken (breasts?|tenders?|tenderloins?|cutlets?)\b|\bchicken\b(?!\s*(broth|stock|bouillon|soup|sausage|salad|seasoning|noodle|base|gravy|nuggets?|bites?|strips?|patties|patty|apple))/, 120, 22.5, 0, 2.6, 140, 200, { y: 1 }],
  [/\bchicken (sausage|apple)\b/, 170, 15, 5, 10, 100, 85, {}],
  [/\bchicken (nuggets?|tenders? breaded|strips?|patties|patty)\b|\bchicken bites\b/, 260, 14, 16, 15, 140, 20, {}],
  [/\bground (turkey|chicken)\b|\bturkey\b(?!\s*(bacon|sausage|kielbasa|pepperoni|ham|breast slices|deli))/, 150, 19, 0, 8, 225, 454, { y: 1 }],
  [/\bturkey (bacon)\b/, 226, 18, 3, 16, 100, 8, {}],
  [/\bturkey (sausage|kielbasa|pepperoni)\b|\bsmoked turkey\b/, 150, 14, 3, 9, 100, 56, {}],
  [/\b(deli|sliced|lunch) ?(turkey|chicken)\b|\bturkey (slices|breast slices)\b|\bdeli turkey\b/, 104, 17, 3, 2, 140, 28, {}],
  [/\b(deli )?(ham|ham steak|diced ham|cubed ham|black forest ham|smoked ham|spiral ham)\b|\bhamhock\b/, 120, 18, 1.5, 4.5, 135, 28, {}],
  [/\bprosciutto\b|\bpancetta\b|\bspeck\b|\bguanciale\b/, 280, 20, 0, 22, 100, 14, {}],
  [/\bcanadian bacon\b/, 110, 17, 1, 4, 100, 28, {}],
  [/\b(thick[- ]cut |center[- ]cut )?bacon\b(?! bits)|\bbacon slices\b/, 541, 37, 1.4, 42, 100, 10, { y: 0.45, slice: 10 }],
  [/\bbacon bits\b|\bbacon pieces\b/, 470, 33, 3, 35, 100, 7, {}],
  [/\bpepperoni\b/, 504, 23, 4, 44, 100, 3, { slice: 3 }],
  [/\bsalami\b|\bsoppressata\b|\bcapicola\b|\bmortadella\b|\bgenoa\b/, 380, 20, 2, 32, 100, 10, { slice: 10 }],
  [/\b(hot ?dogs?|frankfurters?|franks|wieners?)\b(?! bun)/, 300, 11, 3, 27, 100, 50, {}],
  [/\b(kielbasa|andouille|smoked sausage|polish sausage|chorizo|bratwurst|brats|sausage links?|sausage patties|breakfast sausage|ground sausage|italian sausage|pork sausage|sausage)\b/, 310, 14, 2, 27, 225, 70, {}],
  [/\b(meatballs?)\b/, 240, 12, 8, 17, 150, 28, {}],
  [/\bground (beef|chuck|round|sirloin)\b|\bbeef chuck, ground\b|\blean ground beef\b|\bhamburger meat\b|\bground meat\b/, 215, 18.6, 0, 15, 225, 454, { y: 1, lean: 1 }],
  [/\bground (pork)\b|\bpork, ground\b/, 263, 17, 0, 21, 225, 454, { y: 1 }],
  [/\bground (lamb)\b|\blamb\b/, 230, 17, 0, 18, 225, 454, { y: 1 }],
  [/\b(pork )?(tenderloins?)\b/, 120, 21, 0, 3.5, 140, 400, { y: 1 }],
  [/\bpork (chops?|loin|cutlets?)\b|\bloin (roast|chops?)\b/, 150, 21, 0, 7, 140, 200, { y: 0.9 }],
  [/\bpork (shoulder|butt|roast)\b|\bboston butt\b|\bpulled pork\b|\bcarnitas\b|\bpork\b/, 195, 17, 0, 14, 140, 1500, { y: 0.9 }],
  [/\b(spare ?ribs|baby back ribs|pork ribs|ribs|country[- ]style ribs)\b/, 230, 15, 0, 19, 140, 454, { y: 0.55 }],
  [/\bshort ribs?\b/, 290, 15, 0, 26, 140, 454, { y: 0.55 }],
  [/\b(beef )?(chuck roast|chuck|pot roast|round roast|rump roast|stew meat|beef stew meat|beef roast|bottom round|eye of round|roast beef)\b(?! deli)/, 200, 19.5, 0, 13, 140, 1360, { y: 0.9 }],
  [/\bbrisket\b/, 230, 18, 0, 17, 140, 1800, { y: 0.8 }],
  [/\b(deli roast beef|roast beef slices|deli beef|corned beef|pastrami|shaved beef|shaved beef steak|chipped beef|beef slices)\b/, 150, 20, 1, 7, 140, 28, {}],
  [/\b(skirt|flank|sirloin|ribeye|rib-eye|ny strip|new york strip|strip|tri-tip|tenderloin|filet|hanger|flat iron|top round|london broil|steaks?|beef)\b/, 190, 20.5, 0, 11.5, 140, 250, { y: 1 }],
  [/\bveal\b|\bvenison\b|\bbison\b/, 150, 21, 0, 7, 140, 454, { y: 1 }],
  [/\bduck\b/, 200, 18, 0, 14, 140, 454, { y: 0.6 }],
  [/\bshrimp\b|\bprawns?\b/, 99, 24, 0.2, 0.3, 140, 15, { y: 1 }],
  [/\banchov(y|ies)\b/, 210, 29, 0, 10, 100, 4, { tiny: 1 }],
  [/\b(tuna|salmon|cod|tilapia|fish|haddock|mahi|halibut|trout|catfish|crab|scallops?|lobster|clams?|mussels?|sardines?)\b/, 120, 22, 0, 3, 140, 170, { y: 1, can: 142 }],
  // ---- beans, legumes, nuts
  [/\b(refried|re-fried) beans\b/, 100, 5.5, 15, 2, 252, 252, { can: 430, drain: 1 }],
  [/\b(baked beans|chili beans|pork and beans)\b/, 105, 5, 21, 0.6, 253, 253, { can: 425, drain: 1 }],
  [/\bhummus\b/, 166, 8, 14, 10, 246, 15, {}],
  [/\b(black|pinto|kidney|cannellini|great northern|navy|white|red|garbanzo|butter|lima|fava|northern|black-eyed|chili) beans?\b|\bchickpeas?\b|\bbeans\b|\bgarbanzos?\b|\bbeans, drained\b/, 112, 7.2, 19, 1.0, 175, 175, { can: 425, drain: 0.62, dry: 1 }],
  [/\blentils?\b|\bsplit peas?\b/, 353, 26, 60, 1, 192, 192, { can: 425 }],
  [/\bedamame\b/, 121, 12, 9, 5, 155, 155, {}],
  [/\bpeanut butter\b|\bpb\b/, 588, 25, 20, 50, 258, 16, {}],
  [/\b(almond|cashew|sunflower seed|sunflower) butter\b|\bnut butter\b/, 610, 21, 19, 55, 258, 16, {}],
  [/\btahini\b/, 595, 17, 21, 54, 240, 15, {}],
  [/\balmonds?\b/, 579, 21, 22, 50, 143, 1.2, {}],
  [/\bwalnuts?\b|\bpecans?\b|\bhazelnuts?\b|\bmacadamias?\b|\bbrazil nuts?\b/, 670, 12, 14, 66, 115, 4, {}],
  [/\bcashews?\b/, 553, 18, 30, 44, 137, 1.5, {}],
  [/\bpine nuts?\b|\bpignoli\b/, 673, 14, 13, 68, 135, 1, {}],
  [/\bpeanuts?\b/, 567, 26, 16, 49, 146, 1, {}],
  [/\bpistachios?\b/, 560, 20, 28, 45, 123, 1, {}],
  [/\b(sesame|poppy|sunflower|pumpkin|pepitas|hemp|chia|flax|flaxseed|seeds?)\b/, 570, 20, 22, 47, 140, 9, {}],
  [/\b(shredded |flaked |sweetened )?coconut\b(?! (milk|cream|oil|water|aminos))/, 400, 3, 24, 35, 85, 85, {}],
  [/\bnutritional yeast\b/, 350, 50, 36, 4, 60, 5, {}],
  // ---- grains, pasta, bread
  [/\bcooked (white |brown |jasmine |basmati )?rice\b|\bcooked rice\b|\bmexican rice\b|\bmicrowave rice\b|\bcauliflower rice\b(?!x)/, 130, 2.7, 28, 0.3, 158, 158, { cooked: 1 }],
  [/\b(rice)\b(?! (noodles?|vinegar|wine|paper|flour|krispies|cereal|cakes?))/, 365, 7, 80, 0.7, 185, 185, { dry: 1 }],
  [/\bcooked (pasta|spaghetti|noodles|macaroni|quinoa)\b/, 158, 5.8, 31, 0.9, 140, 140, { cooked: 1 }],
  [/\b(rice noodles?|rice sticks|vermicelli|pad thai noodles|glass noodles|cellophane noodles)\b/, 360, 6, 83, 0.6, 100, 100, {}],
  [/\bramen( noodles?)?\b|\binstant noodles\b/, 440, 9, 62, 17, 85, 85, {}],
  [/\begg noodles?\b|\bnoodles\b|\bkluski\b/, 384, 14, 71, 4.4, 45, 45, {}],
  [/\b(gnocchi)\b/, 150, 3.5, 32, 1, 150, 150, { pkg: 500 }],
  [/\b(ravioli|tortellini|agnolotti|tortelloni)\b/, 260, 11, 35, 8, 125, 125, { pkg: 250 }],
  [/\b(pasta|spaghetti|penne|rigatoni|fettuccine|fettucine|linguine|macaroni|rotini|ziti|farfalle|orzo|lasagn[ae]|lasagna noodles|(?<!taco )(?<!tostada )shells|elbows?|bucatini|cavatappi|angel hair|tagliatelle|pappardelle|capellini|manicotti|cannelloni|rotelle|fusilli|campanelle|gemelli|mafalda|noodle|bowtie|bow tie|conchiglie|ditalini|tortiglioni|paccheri|radiatori|mostaccioli)\b/, 371, 13, 75, 1.5, 105, 105, { dry: 1 }],
  [/\bcouscous\b|\bbulgur\b|\bfarro\b|\bfreekeh\b/, 365, 12.5, 76, 1.5, 170, 170, {}],
  [/\bquinoa\b/, 368, 14, 64, 6, 170, 170, {}],
  [/\b(old[- ]fashioned |rolled |quick |steel[- ]cut )?oats?\b|\boatmeal\b/, 379, 13, 68, 6.5, 81, 81, {}],
  [/\bbread ?crumbs?\b|\bpanko\b|\bcracker crumbs?\b|\bcrushed (crackers|ritz)\b/, 395, 13, 72, 5, 108, 108, {}],
  [/\bcroutons?\b|\bstuffing mix\b|\bstuffing\b/, 400, 11, 72, 7, 40, 28, {}],
  [/\b(hawaiian (sweet )?rolls?|sweet hawaiian rolls)\b/, 290, 8, 53, 4.5, 100, 30, {}],
  [/\b(hamburger|burger|hoagie|sub|hot dog|brioche|slider|sandwich) (buns?|rolls?)\b|\bbuns?\b|\b(dinner |crusty |kaiser |sandwich |potato )?rolls?\b|\bhoagies?\b/, 285, 9, 50, 4.5, 100, 70, {}],
  [/\b(pita|naan|flatbreads?|wraps?|lavash)\b/, 275, 9, 54, 2.5, 100, 75, {}],
  [/\b(corn|street taco) tortillas?\b|\btostada\b/, 218, 5.7, 45, 2.9, 100, 24, {}],
  [/\btortillas?\b|\bburrito\b/, 310, 8, 51, 8, 100, 50, {}],
  [/\btaco shells?\b|\btostada shells\b/, 480, 7, 62, 22, 100, 13, {}],
  [/\b(whole[- ]wheat |whole grain )?(all[- ]purpose |ap |bread |cake |self[- ]rising |plain |wheat |almond |white )?flour\b/, 364, 10, 76, 1, 125, 125, {}],
  [/\bcornmeal\b|\bmasa\b|\bgrits\b|\bpolenta\b/, 362, 8, 77, 3.6, 138, 138, {}],
  [/\bcornstarch\b|\bcorn starch\b|\barrowroot\b|\btapioca\b|\bpotato starch\b/, 381, 0.3, 91, 0.1, 128, 128, {}],
  [/\b(sourdough starter)\b/, 140, 5, 29, 0.5, 240, 240, {}],
  [/\b(tortilla chips|corn chips|fritos|nacho chips|doritos)\b/, 489, 7, 63, 25, 30, 3, { bag: 340 }],
  [/\bpizza dough\b|(?<!crescent )(?<!cookie )\bdough\b(?! (hooks?))|\bbread dough\b/, 270, 8, 52, 3, 240, 454, { pkg: 454 }],
  [/\b(pie crust|pie shell|pastry|crust)\b(?!y)/, 450, 5, 45, 28, 100, 200, {}],
  [/\bpuff pastry\b|\bphyllo\b|\bfilo\b/, 450, 7, 45, 28, 100, 250, {}],
  [/\bcrescent (rolls?|dough)\b|\bbiscuits?\b|\bcinnamon rolls?\b/, 310, 6, 40, 14, 100, 60, { pkg: 300 }],
  [/\bwonton wrappers?\b|\begg roll wrappers?\b|\bdumpling wrappers?\b/, 285, 9, 57, 0.6, 100, 8, {}],
  [/\benglish muffins?\b/, 227, 8, 44, 2, 100, 57, {}],
  [/\b(sourdough|french|italian|white|wheat|sandwich|ciabatta|baguette|rye|texas toast|whole wheat|brioche|potato|garlic|cuban|focaccia|challah)?\s*(bread|toast|loaf)\b/, 265, 9, 49, 3.2, 100, 28, { slice: 30, loaf: 454 }],
  [/\b(graham crackers?|crackers?|ritz|saltines?|club crackers?)\b/, 440, 7, 72, 14, 100, 10, {}],
  [/\bchips\b|\bpretzels?\b|\bpotato chips\b/, 520, 6, 52, 32, 30, 28, {}],
  [/\bcake mix\b|\bbrownie mix\b|\bcornbread mix\b|\bbaking mix\b|\bbisquick\b|\bpancake mix\b|\bmuffin mix\b|\bjiffy\b/, 400, 5, 74, 9, 120, 120, { pkg: 425 }],
  [/\bpudding mix\b|\bgelatin\b|\bjell-?o\b/, 380, 1, 90, 0.5, 100, 85, {}],
  // ---- sugars and sweet
  [/\b(powdered|confectioners'?|icing) sugar\b|\bpowdered sugar\b/, 389, 0, 100, 0, 120, 120, {}],
  [/\bbrown sugar\b/, 380, 0, 98, 0, 220, 220, {}],
  [/\b(granulated |white |caster |cane |raw |coconut )?sugar\b|\bturbinado\b|\bswerve\b|\bstevia\b|\bsweetener\b/, 387, 0, 100, 0, 200, 200, {}],
  [/\bhoney\b|\bhot honey\b|\bagave\b/, 304, 0.3, 82, 0, 340, 21, {}],
  [/\bmaple syrup\b|\bsyrup\b|\bmolasses\b|\bcorn syrup\b|\bsorghum\b/, 275, 0, 70, 0, 315, 20, {}],
  [/\b(jam|jelly|preserves|marmalade|fruit spread)\b/, 250, 0.4, 64, 0.1, 320, 20, {}],
  [/\b(chocolate chips?|chocolate chunks?|semi-?sweet chocolate|dark chocolate|milk chocolate|white chocolate|chocolate bar|baking chocolate|chocolate)\b(?! (syrup|sauce|milk|pudding))/, 500, 5, 62, 30, 170, 28, {}],
  [/\bcocoa( powder)?\b/, 228, 20, 58, 14, 86, 86, {}],
  [/\bnutella\b|\bhazelnut spread\b|\bchocolate (syrup|sauce|hazelnut)\b|\bfudge\b|\bcaramel( sauce)?\b|\bdulce de leche\b/, 400, 4, 60, 17, 300, 20, {}],
  [/\bmarshmallows?\b|\bmarshmallow (creme|fluff)\b/, 318, 2, 81, 0, 50, 7, {}],
  [/\bsprinkles\b|\bcandy\b|\bcandies\b|\bm&ms?\b|\bheath\b|\btoffee\b|\bbutterscotch\b/, 450, 3, 75, 15, 150, 5, {}],
  [/\b(oreos?|cookies?|vanilla wafers?|nilla wafers?|ladyfingers|biscotti|cookie crumbs?|wafers?)\b/, 470, 5, 70, 20, 100, 11, {}],
  [/\bfrosting\b|\bicing\b|\bglaze\b/, 400, 0.5, 65, 15, 270, 20, {}],
  [/\bpie filling\b|\bcherry pie\b|\bapple pie\b/, 100, 0.3, 25, 0.1, 300, 300, { can: 595 }],
  [/\bvanilla( extract| bean)?\b|\balmond extract\b|\bextract\b|\bflavoring\b|\bessence\b/, 288, 0.1, 13, 0.1, 208, 4.2, { tiny: 1 }],
  [/\bbaking (powder|soda)\b|\bcream of tartar\b|\byeast\b|\bpectin\b|\bagar\b|\bxanthan\b/, 10, 0, 2, 0, 230, 4, { tiny: 1 }],
  // ---- fruit
  [/\bavocados?\b/, 160, 2, 8.5, 14.7, 150, 136, {}],
  [/\bguacamole\b/, 150, 2, 8, 13, 240, 30, {}],
  [/\bbananas?\b/, 89, 1.1, 23, 0.3, 225, 118, {}],
  [/\bapples?\b(?!sauce)(?! cider vinegar)/, 52, 0.3, 14, 0.2, 125, 182, {}],
  [/\bapplesauce\b/, 42, 0.2, 11, 0.1, 245, 245, {}],
  [/\bpineapple( chunks| tidbits| juice)?\b|\bcrushed pineapple\b/, 50, 0.5, 13, 0.1, 165, 165, { can: 560, drain: 0.7 }],
  [/\b(strawberr(y|ies)|blueberr(y|ies)|raspberr(y|ies)|blackberr(y|ies)|cherr(y|ies)|berries|grapes?|mangos?|peach(es)?|pears?|plums?|nectarines?|melon|watermelon|cantaloupe|kiwis?|papaya|apricots?|figs?|cranberries)\b(?! (sauce|juice|jam|jelly|preserves))/, 55, 0.8, 14, 0.3, 150, 120, {}],
  [/\b(dried cranberries|craisins|raisins|dried (fruit|cherries|apricots|figs|blueberries)|dates|prunes|currants)\b/, 300, 2, 78, 0.5, 145, 8, {}],
  [/\b(lemon|lime)s?\b(?! (juice|zest|pepper))/, 29, 1.1, 9.3, 0.3, 200, 60, {}],
  [/\b(lemon|lime|orange) (juice|zest)\b|\bjuice of\b|\bzest\b|\bbottled lemon\b|\bbottled lime\b/, 22, 0.4, 7, 0.1, 244, 15, {}],
  [/\boranges?\b|\bclementines?\b|\btangerines?\b|\bmandarins?\b/, 47, 0.9, 12, 0.1, 180, 130, {}],
  [/\b(orange|apple|cranberry|pineapple|grape|tomato|vegetable|pomegranate) juice\b|\bjuice\b/, 45, 0.5, 11, 0.1, 248, 248, {}],
  // ---- vegetables
  [/\b(seasoning|seasonings|spice|spices|rub|seasoning mix|spice blend|spice mix)\b(?! (sauce))/, 290, 11, 56, 8, 110, 8, { tiny: 1 }],
  [/\bpotato(es)? (chips|skins)\b/, 520, 6, 52, 32, 30, 28, {}],
  [/\b(tater tots?|hash browns?|frozen (shredded )?hash brown potatoes|shredded potatoes|french fries|fries|frozen potatoes|steak fries|waffle fries|potato wedges)\b/, 160, 2.4, 24, 6, 120, 28, {}],
  [/\b(mashed potatoes|refrigerated mashed potatoes|potato salad)\b/, 110, 2, 17, 4, 210, 210, { pkg: 680 }],
  [/\bsweet potatoes?\b|\byams?\b/, 86, 1.6, 20, 0.1, 133, 130, { y: 0.92 }],
  [/\b(russet|yukon|yukon gold|red|baby|new|white|gold|fingerling|idaho|petite|mini)? ?(potato(es)?)\b|\bbaby potatoes\b/, 77, 2, 17, 0.1, 150, 170, { y: 0.88 }],
  [/\b(corn on the cob|ears? of corn|corn cobs?)\b/, 86, 3.2, 19, 1.2, 165, 90, {}],
  [/\b(corn|corn kernels|whole kernel corn|sweet corn|hominy|white hominy|frozen corn)\b/, 86, 3.2, 19, 1.2, 165, 165, { can: 425, drain: 0.75 }],
  [/\b(peas|green peas|frozen peas|snap peas|snow peas|sugar snap peas)\b|\bpeas and carrots\b/, 77, 5, 14, 0.4, 145, 145, { pkg: 340 }],
  [/\bgreen beans\b|\bharicots verts\b|\bstring beans\b|\bwax beans\b/, 31, 1.8, 7, 0.2, 110, 110, { pkg: 340 }],
  [/\b(yellow |white |red |sweet |vidalia |spanish |brown )?onions?\b(?! (powder|soup|rings|dip))/, 40, 1.1, 9.3, 0.1, 160, 110, { y: 0.9 }],
  [/\b(crispy|fried) onions\b|\bfrench fried onions\b/, 580, 6, 45, 40, 50, 10, {}],
  [/\b(green onions?|scallions?|spring onions?)\b/, 32, 1.8, 7, 0.2, 100, 15, { bunch: 75 }],
  [/\bshallots?\b/, 72, 2.5, 17, 0.1, 160, 30, {}],
  [/\bleeks?\b/, 61, 1.5, 14, 0.3, 89, 90, { y: 0.5 }],
  [/\bgarlic (powder|salt)\b|\bgranulated garlic\b/, 331, 16, 73, 0.7, 150, 3.1, { tiny: 1 }],
  [/\bgarlic\b|\bgarlic cloves?\b|\bminced garlic\b/, 149, 6.4, 33, 0.5, 136, 3, { clove: 3, head: 40 }],
  [/\bcelery\b/, 16, 0.7, 3, 0.2, 101, 40, { stalk: 40 }],
  [/\bcarrots?\b/, 41, 0.9, 10, 0.2, 128, 61, { y: 0.9 }],
  [/\b(bell )?pepper(s)?\b(?! (flakes|jack|sauce|powder|seasoning|jelly|corns?))|\bbell peppers?\b|\bpimientos?\b|\bpoblanos?\b|\bbanana peppers?\b/, 27, 1, 6.2, 0.3, 150, 120, { y: 0.85 }],
  [/\b(jalape[nñ]os?|serranos?|chiles?|chilies|chili peppers?|habaneros?|fresno|thai chil)\b(?! (powder|sauce|flakes|crisp|garlic|paste|oil|beans?|seasoning))/, 40, 2, 9, 0.4, 100, 14, { can: 113, y: 0.9 }],
  [/\bchipotles?\b|\badobo\b/, 70, 2, 12, 2, 250, 15, { can: 200 }],
  [/\b(sun[- ]?dried tomatoes)\b/, 258, 14, 56, 3, 54, 3, {}],
  [/\b(tomato paste)\b/, 82, 4.3, 19, 0.5, 262, 16, { can: 170 }],
  [/\b(tomato sauce|pizza sauce|marinara|pasta sauce|spaghetti sauce|tomato puree|passata|tomato soup|crushed tomatoes?|tomato purée|enchilada sauce|red enchilada sauce|arrabbiata|vodka sauce|bolognese)\b/, 45, 1.6, 8, 1.2, 250, 250, { can: 425, jar: 680 }],
  [/\b(salsa|pico de gallo|salsa verde|taco sauce|green enchilada sauce|green sauce|mild green enchilada sauce|picante)\b/, 36, 1.5, 7, 0.2, 260, 17, { jar: 450, can: 283 }],
  [/\b(canned )?(diced |whole peeled |peeled |stewed |fire[- ]roasted )?tomatoes\b|\btomato\b|\bplum tomatoes\b|\bcherry tomatoes\b|\bgrape tomatoes\b|\bcanned diced tomatoes\b|\bcanned whole tomatoes\b|\broma\b/, 20, 0.9, 4.2, 0.2, 180, 123, { can: 425, drain: 1 }],
  [/\bsweet pepper\b|\broasted (red )?peppers?\b|\bpepperoncini\b|\bbanana pepper rings\b/, 27, 1, 6, 0.3, 140, 28, {}],
  [/\bmushrooms?\b|\bcremini\b|\bshiitake\b|\bportobello\b|\bportabella\b/, 22, 3.1, 3.3, 0.3, 70, 18, { pkg: 227 }],
  [/\bzucchini\b|\bsummer squash\b|\byellow squash\b|\bcourgette\b/, 17, 1.2, 3.1, 0.3, 113, 196, { y: 0.95 }],
  [/\bbutternut squash\b|\bsquash\b|\bpumpkin\b|\bacorn squash\b|\bspaghetti squash\b/, 40, 1, 10, 0.1, 140, 900, { y: 0.65, can: 425 }],
  [/\beggplant\b|\baubergine\b/, 25, 1, 5.9, 0.2, 82, 450, { y: 0.9 }],
  [/\bbroccoli\b|\bbroccolini\b|\bbroccoli florets\b/, 34, 2.8, 6.6, 0.4, 71, 300, { y: 0.65, bag: 340 }],
  [/\bcauliflower\b/, 25, 1.9, 5, 0.3, 100, 600, { y: 0.55, bag: 340 }],
  [/\bbrussels sprouts?\b/, 43, 3.4, 9, 0.3, 88, 20, { y: 0.9 }],
  [/\b(green |red |napa |savoy )?cabbage\b|\bcoleslaw( mix)?\b|\bslaw\b/, 25, 1.3, 5.8, 0.1, 70, 900, { y: 0.85, bag: 400 }],
  [/\b(baby )?spinach\b/, 23, 2.9, 3.6, 0.4, 30, 30, { bag: 284, pkg: 284 }],
  [/\b(kale|collard greens?|chard|swiss chard|bok choy|mustard greens?|greens)\b/, 35, 2.9, 4.4, 0.5, 40, 100, { bunch: 250 }],
  [/\b(romaine|iceberg|lettuce|butter lettuce|bibb|boston lettuce|salad mix|mixed greens|spring mix|salad greens|salad kit|coleslaw)\b|\bbaby greens\b/, 17, 1.2, 3.3, 0.3, 47, 100, { head: 400, bag: 284, y: 0.85 }],
  [/\b(arugula|watercress|endive|radicchio|frisee|microgreens|sprouts)\b/, 25, 2.6, 3.7, 0.7, 20, 30, {}],
  [/\bcucumbers?\b/, 15, 0.7, 3.6, 0.1, 104, 300, { y: 0.95 }],
  [/\b(dill pickles?|pickles?|pickle chips|pickle spears|gherkins?|pickled (jalape[nñ]os?|onions?|peppers?|vegetables|red onions?|ginger)|jalape[nñ]o slices|relish|sauerkraut|kimchi)\b/, 15, 0.5, 3, 0.2, 140, 35, {}],
  [/\b(asparagus)\b/, 20, 2.2, 3.9, 0.1, 134, 16, { y: 0.55 }],
  [/\bradish(es)?\b|\bjicama\b|\bturnips?\b|\bparsnips?\b|\brutabaga\b|\bkohlrabi\b|\bbeets?\b|\bbeetroot\b/, 35, 1, 8, 0.1, 120, 40, {}],
  [/\b(artichoke( hearts)?|hearts of palm)\b/, 50, 2, 9, 0.5, 170, 30, { can: 400, drain: 0.6 }],
  [/\bolives?\b|\bkalamata\b/, 145, 1, 6, 15, 135, 4, {}],
  [/\bcapers?\b/, 23, 2.4, 4.9, 0.9, 140, 4, { tiny: 1 }],
  [/\bwater chestnuts?\b|\bbamboo shoots?\b|\bbean sprouts?\b|\bbaby corn\b|\bstir[- ]fry vegetables?\b|\bmixed vegetables\b|\bfrozen vegetables\b|\bvegetables\b|\bveggies\b|\bgiardiniera\b/, 40, 2, 8, 0.2, 140, 100, { can: 227, drain: 0.6, bag: 340, pkg: 340 }],
  [/\b(ginger|fresh ginger|ginger root)\b(?! (ale|beer|snap))/, 80, 1.8, 18, 0.8, 96, 6, { tiny: 1 }],
  [/\b(parsley|cilantro|basil|dill|mint|chives|thyme|rosemary|sage|oregano|tarragon|marjoram|herbs|basil leaves|bay leaf|bay leaves|fresh herbs|lemongrass|curry leaves|chervil)\b(?! (powder|pesto|seasoning))/, 40, 3, 6, 0.8, 30, 2, { bunch: 30, tiny: 1 }],
  // ---- seasonings and condiments
  [/\bsalt\b|\bmsg\b|\bpeppercorns?\b|\bblack pepper\b|\bpepper\b(?! (jack|sauce|jelly))|\bwhite pepper\b|\bseasoned salt\b|\bkosher\b|\bmaldon\b|\bflaky\b/, 0, 0, 0, 0, 288, 6, { tiny: 1 }],
  [/\b(taco|fajita|ranch|italian|cajun|creole|jerk|chili|burger|steak|bbq|bbq rub|poultry|pork|rib|blackened|seafood|everything bagel|old bay|lemon pepper|montreal|greek|cowboy|southwest|ranch dip|onion soup|dry onion soup|brown gravy|gravy|au jus|country gravy|hollandaise|sazon|adobo|cumin|taco seasoning|seasoning|seasoning mix|spice mix|spice rub|dry rub|rub|spices?|blend|powder|za'?atar|garam masala|curry|turmeric|cinnamon|nutmeg|cloves?|allspice|cardamom|paprika|cayenne|oregano|thyme|rosemary|basil|sage|dill|dry mustard|mustard powder|mustard seed|red pepper flakes|crushed red pepper|pepper flakes|chili flakes|chile flakes|ancho|chipotle powder|saffron|coriander|fennel|caraway|celery seed|celery salt|bouillon|boullion|stock cube|stock concentrate|better than bouillon|sumac|msg|togarashi|furikake|berbere|ras el hanout|herbes de provence|poultry seasoning|pumpkin pie spice|apple pie spice|ground ginger|ground cumin|ground cinnamon|ground nutmeg|ground coriander|whole cloves|star anise|vanilla bean|liquid smoke|dried \w+|ground \w+|cumin seeds?)\b/, 290, 11, 56, 8, 110, 6, { tiny: 1 }],
  [/\b(ketchup|catsup)\b/, 101, 1, 27, 0.1, 270, 17, {}],
  [/\b(bbq sauce|barbecue sauce|steak sauce|a1|sweet baby ray|hot honey|honey bbq|bbq|sweet chili sauce|sweet and sour|duck sauce|plum sauce|japanese bbq sauce|teriyaki|teriyaki sauce|stir[- ]fry sauce|general tso|orange sauce|katsu sauce|tonkatsu|sriracha mayo)\b/, 160, 1, 38, 0.5, 280, 18, {}],
  [/\b(mustard|dijon|honey mustard|yellow mustard|whole grain mustard|spicy brown mustard)\b(?! (powder|seed))/, 66, 4, 6, 4, 250, 15, {}],
  [/\b(soy sauce|tamari|coconut aminos|liquid aminos|worcestershire|worcestershire sauce)\b/, 60, 7, 6, 0.1, 270, 16, {}],
  [/\b(hot sauce|buffalo sauce|franks?|frank'?s red hot|tabasco|sriracha|chili garlic sauce|chili crisp|sambal|harissa|gochujang|chili paste|chili sauce|chile sauce|cholula|valentina|crystal)\b/, 70, 2, 12, 1.5, 270, 15, {}],
  [/\b(hoisin|oyster sauce|miso|miso paste|curry paste|red curry paste|green curry paste|thai curry paste|tikka masala sauce|curry sauce|korma|enchilada|tikka|jerk sauce|marinade|teriyaki marinade)\b/, 180, 5, 30, 3, 270, 17, {}],
  [/\b(balsamic glaze|balsamic|balsamic vinegar|vinegar|apple cider vinegar|red wine vinegar|white wine vinegar|rice vinegar|rice wine vinegar|sherry vinegar|champagne vinegar|malt vinegar|white vinegar|distilled vinegar|cider vinegar|rice wine|mirin|sherry|cooking wine|marsala|vermouth)\b/, 40, 0.2, 7, 0, 240, 15, {}],
  [/\b(wine|white wine|red wine|dry white wine|dry red wine|beer|lager|bourbon|whiskey|vodka|rum|brandy|tequila|stout|ale|sake|liqueur|amaretto|kahlua|baileys|cognac|champagne|prosecco)\b/, 80, 0.1, 2.5, 0, 236, 30, { boil: 0.35 }],
  [/\b(chicken|beef|vegetable|veggie|turkey|pork|bone|mushroom|seafood|fish|ham|low[- ]sodium|reduced[- ]sodium)? ?(broth|stock|consomme|consommé|bouillon|au jus)\b/, 8, 1, 0.6, 0.2, 240, 240, { can: 411 }],
  [/\b(ranch|ranch dressing|caesar|caesar dressing|italian dressing|blue cheese dressing|thousand island|vinaigrette|honey mustard dressing|dressing|salad dressing|french dressing|russian|green goddess|poppy seed dressing|balsamic vinaigrette|greek dressing|sesame dressing|asian dressing|ginger dressing|catalina|dip|ranch dip|french onion dip|spinach dip)\b/, 400, 1.2, 8, 40, 240, 15, {}],
  [/\b(pesto|basil pesto|sun-dried tomato pesto|chimichurri|romesco|tapenade)\b/, 470, 5, 6, 47, 240, 16, {}],
  [/\b(alfredo( sauce)?|cream sauce|white sauce|bechamel|béchamel|cheese sauce|queso blanco|garlic parmesan sauce|creamy garlic sauce)\b/, 140, 3, 5, 12, 250, 250, { jar: 425 }],
  [/\bcream of (chicken|mushroom|celery|onion|potato|broccoli|cheddar|bacon)( soup)?\b|\bcondensed (soup|cream)\b|\bcream soup\b|\bsoup\b/, 80, 1.7, 8, 4.5, 250, 250, { can: 298 }],
  [/\b(onion soup mix|dry onion soup mix|lipton|ranch seasoning mix|taco seasoning mix|gravy mix|brown gravy mix|seasoning packet|packet)\b/, 300, 8, 60, 3, 150, 28, {}],
  [/\b(water|ice|club soda|seltzer|sparkling water|tonic|diet soda|ice cubes)\b/, 0, 0, 0, 0, 237, 237, { tiny: 1 }],
  [/\b(coffee|espresso|tea|green tea|matcha)\b/, 2, 0.1, 0, 0, 237, 237, { tiny: 1 }],
  [/\b(cola|coke|soda|ginger ale|root beer|lemonade|sprite)\b/, 40, 0, 10.5, 0, 240, 355, {}],
  [/\b(tofu|tempeh|seitan|beyond|impossible|veggie burger|plant[- ]based)\b/, 120, 14, 3, 6, 250, 85, { pkg: 400 }],
  [/\bbrioche\b/, 350, 9, 49, 14, 100, 40, { slice: 40, loaf: 454 }],
  [/\bbagels?\b/, 270, 10, 53, 1.5, 100, 105, {}],
  [/\b(toaster waffles?|waffles?|pancakes?|french toast sticks)\b/, 260, 6, 38, 10, 100, 35, {}],
  [/\b(mini )?croissants?\b/, 406, 8, 46, 21, 100, 57, { pkg: 375 }],
  [/\bvelveeta\b|\bprocessed cheese\b|\bamerican cheese\b/, 300, 17, 9, 21, 240, 21, {}],
  [/\b(frozen )?(mini )?(dumplings|potstickers|pot stickers|gyoza|wontons|pierogi|egg rolls|spring rolls)\b/, 200, 8, 28, 6, 100, 25, { pkg: 454 }],
  [/\b(levain|sourdough discard|sourdough starter|bubbly starter|starter)\b/, 140, 5, 29, 0.5, 240, 240, {}],
  [/\bfocaccia\b/, 270, 8, 45, 7, 100, 100, {}],
  [/\bzucchinis\b|\bsquashes\b/, 17, 1.2, 3.1, 0.3, 113, 196, { y: 0.95 }],
  [/\b(tzatziki|horseradish( sauce)?|cocktail sauce|tartar sauce|remoulade|aioli|sauce)\b/, 150, 2, 6, 13, 240, 15, {}],
  [/\bbrie\b|\bcamembert\b|\bmascarpone\b/, 334, 21, 0.5, 28, 240, 28, {}],
  [/\b(cornflakes|corn flakes|cereal|chex|rice krispies|crispy rice cereal|granola|wheat chex|cheerios|bran flakes)\b/, 390, 7, 82, 3, 40, 30, {}],
  [/\brotel\b|\bdiced tomatoes and (green )?chil(i|e)s?\b/, 20, 1, 4, 0.2, 240, 240, { can: 283, drain: 1 }],
  [/\b(bratwursts?|knockwurst|chicken sausages|sausages)\b/, 290, 14, 3, 25, 225, 85, {}],
  [/\b(orecchiette|pearl barley|barley|wheat berries|farro|spelt)\b/, 352, 10, 73, 1.2, 200, 200, {}],
  [/\b(tomatillos?)\b/, 32, 1, 5.8, 1, 130, 34, {}],
  [/\b(pitas?|wheat pitas|breads)\b/, 275, 9, 55, 1.5, 100, 60, {}],
  [/\b(sriacha|chilli flakes|chilli|chile flakes)\b/, 80, 2, 15, 1, 270, 15, { tiny: 1 }],
  [/\b(mixed nuts|nuts|trail mix)\b/, 600, 18, 21, 52, 140, 1.5, {}],
  [/\b(frozen )?(fruit|mixed fruit)\b/, 55, 0.8, 14, 0.3, 150, 120, {}],
  [/\b(toasted )?baguette\b|\bsub rolls?\b/, 270, 9, 54, 1.5, 100, 70, { slice: 30 }],
  [/\b(sauce|gravy)\b/, 70, 1.5, 9, 3, 245, 245, {}],
  [/\b(protein powder|protein shake|whey)\b/, 380, 75, 10, 5, 100, 30, {}],
];
FOODS.forEach(f => { f.re = f[0]; });

const U = { tsp: 1 / 48, tbsp: 1 / 16, cup: 1 };
const OZ = 28.35, LB = 453.6;
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

const CAL = 0.93;
function parseServings(s) {
  s = String(s || '').trim();
  if (!s || /^serving size/i.test(s)) return null;
  if (/\b(jar|cup|cups|quart|pint|gallon|loaf|batch|bottle|pan)\b/i.test(s) && !/\bservings?\b/i.test(s)) return null;
  if (/\bserves\s+\d+\s+cups?\b/i.test(s)) return null;
  let m = s.match(/(\d+)\s*(?:to|-|–|or)\s*(\d+)/i);
  if (m) return (+m[1] + +m[2]) / 2;
  m = s.match(/(\d+)/);
  if (m) return +m[1];
  return null;
}

// grams of one parsed ingredient (from the app's parseIngredient) + how it was resolved
function ingredientGrams(it, rawLine) {
  let name = String(it.name || '').toLowerCase();
  const raw = String(rawLine || it.raw || '').toLowerCase();
  // the app's cleanName drops words that matter for nutrition ("taco shells" -> "soft shells")
  if (/\b(taco|tostada) shells?\b/.test(raw)) name = 'taco shells';
  if (/\bturkey (?:italian |smoked )?(sausage|kielbasa)|\bitalian turkey sausage/.test(raw)) name = 'turkey sausage';
  else if (/\bchicken (?:italian |smoked )?sausage|\bitalian chicken sausage/.test(raw)) name = 'chicken sausage';
  if (/\bcanadian bacon\b/.test(raw)) name = 'canadian bacon';
  if (/\b(ravioli|tortellini)\b/.test(raw)) name = 'ravioli';
  let ent = null;
  const target = name + ' | ' + (/cooked|rotisserie|leftover|shredded/.test(raw) ? raw : '');
  for (const f of FOODS) if (f[0].test(name) || (f[0].test(target) && /cooked|rotisserie|leftover/.test(raw))) { ent = f; break; }
  if (!ent) for (const f of FOODS) if (f[0].test(raw.replace(/\(.*?\)/g, ''))) { ent = f; break; }
  if (!ent) return { unmapped: true, name };
  const ex = ent[7] || {};
  let [, kcal, P, C, F, cupG, eachG] = ent;
  if (ex.lean) { // "96/4", "93% lean", "lean ground beef"
    const m = raw.match(/\b(9[0-9]|8[0-9]|7[0-9])\s*(?:\/|%)\s*(?:lean|\d+)?/);
    const L = m ? +m[1] : /\blean\b/.test(raw) ? 90 : 0;
    if (L) { const f = Math.max(2, 100 - L); const lerp = (a, b, t) => a + (b - a) * t; const t = Math.min(1, (f - 4) / 16);
      kcal = lerp(121, 254, t); P = lerp(21.4, 17.2, t); F = lerp(4.5, 20, t); }
  }
  // "cooked" rice / pasta / beans use cooked densities
  let cooked = ex.cooked;
  if (ex.dry && /\bcooked\b/.test(raw)) { cooked = true; const k = 0.36; kcal *= k; P *= k; C *= k; F *= k; }
  let q = it.qty, unit = it.unit, g = null, how = '';
  const small = /\b(small|snack[- ]size|individual|mini|lunch)\b/.test(raw) && ['bag', 'package', 'packet', 'box'].includes(unit);
  if (q == null) { return { ent, name, g: 0, kcal: 0, P: 0, C: 0, F: 0, tiny: !!ex.tiny, noqty: true }; }
  if (/\d\s*(?:-|–|to)\s*\d/.test(raw.slice(0, 14))) q *= 0.85; // the app takes the top of a range
  if (unit in U) g = q * U[unit] * cupG;
  else if (unit === 'oz') g = q * OZ * (ex.y || 1);
  else if (unit === 'lb') g = q * LB * (ex.y || 1);
  else if (unit === 'g') g = q * (ex.y || 1);
  else if (unit === 'ml') g = q;
  else if (unit === 'liter') g = q * 1000;
  else if (unit === 'qt' || unit === 'quart' || unit === 'qts') g = q * 4 * cupG;
  else if (unit === 'pint') g = q * 2 * cupG;
  else if (unit === 'clove') g = q * (ex.clove || 3);
  else if (unit === 'slice') g = q * (ex.slice || Math.min(eachG, 30));
  else if (unit === 'stalk') g = q * (ex.stalk || eachG);
  else if (unit === 'stick') g = q * (ex.stick || eachG);
  else if (unit === 'head') g = q * (ex.head || eachG);
  else if (unit === 'bunch') g = q * (ex.bunch || 100);
  else if (unit === 'sprig' || unit === 'sprigs') g = q * 1.5;
  else if (unit === 'pinch') g = q * 0.4;
  else if (unit === 'loaf') g = q * (ex.loaf || eachG);
  else if (['can', 'jar', 'package', 'packet', 'bag', 'box', 'bottle', 'container', 'tub', 'clamshell', 'sleeve', 'ball'].includes(unit)) {
    const base = small ? 35 : it.eachOz ? it.eachOz * OZ : ex[unit] || ex.pkg || ex.can || ex.bag || ex.jar || (unit === 'packet' ? 28 : unit === 'ball' ? 227 : unit === 'can' ? 400 : 340);
    g = q * base * (unit === 'can' && ex.drain ? ex.drain : 1) * (unit !== 'can' && ex.y ? ex.y : 1);
    if (unit === 'can' && it.eachOz && ex.drain) g = q * it.eachOz * OZ * ex.drain;
  } else if (unit == null && /\((?:about|approximately|approx\.?)\s*([\d.\/ ]+)\s*(lb|lbs|pound|pounds|oz|ounces?)\b/.test(raw)) {
    const m = raw.match(/\((?:about|approximately|approx\.?)\s*([\d.\/ ]+)\s*(lb|lbs|pound|pounds|oz|ounces?)\b/); // "2 tenderloins (about 2 lb)": the weight is the whole line
    const w = m[1].trim().split(/\s+/).reduce((a, t) => a + (t.includes('/') ? t.split('/')[0] / t.split('/')[1] : +t), 0);
    g = w * (/^(lb|pound)/.test(m[2]) ? LB : OZ) * (ex.y || 1);
  } else if (unit == null || unit === 'sheets' || unit === 'sheet' || unit === 'pieces' || unit === 'scoop') {
    g = q * eachG;
    if (ex.y && eachG >= 400) g *= ex.y; // "1 chicken" style whole items
  } else g = q * eachG;
  if (['cup', 'tbsp', 'tsp'].includes(unit) && ex.y && eachG >= 100 && !ex.cookedMeat) { kcal *= 1.35; P *= 1.35; C *= 1.35; F *= 1.35; cupG = Math.min(cupG, 140); } // a measured cup of meat is cooked meat
  if (ex.oil && g > 56) g = 56 + (g - 56) * 0.25; // frying / marinade oil mostly stays in the pan
  if (ex.boil) g *= ex.boil; // wine and beer cook down
  if (it.opt) g *= 0.5; // optional / for serving: count half
  const k = g / 100;
  return { ent, name, g, kcal: kcal * k, P: P * k, C: C * k, F: F * k, tiny: !!ex.tiny, cooked };
}

// parsedLines: {rawLine: [items]} from the app's parseIngredient (parse-lines)
function estimateRecipe(recipe, parsedLines, servingsOverride) {
  const tot = { kcal: 0, P: 0, C: 0, F: 0 };
  const unmapped = [], bigUnmapped = [];
  let mapped = 0, n = 0, qtyless = 0, idx = 0;
  for (const line of recipe.i || []) {
    idx++;
    const items = parsedLines[line] || [];
    for (const it of items) {
      n++;
      const r = ingredientGrams(it, line);
      if (r.unmapped) {
        unmapped.push(line);
        const big = it.qty != null && (['lb', 'oz', 'cup', 'can', 'package', 'bag', 'box', 'jar', 'g', 'container', 'loaf', 'head', 'bunch'].includes(it.unit) || (it.unit == null && it.qty >= 1)) && !it.opt;
        if (big || (idx <= 3 && !it.opt)) bigUnmapped.push(line);
        continue;
      }
      mapped++;
      if (r.noqty && !r.tiny && !it.opt) qtyless++;
      tot.kcal += r.kcal; tot.P += r.P; tot.C += r.C; tot.F += r.F;
    }
  }
  const sv = servingsOverride || parseServings(recipe.s);
  const out = { servings: sv, mapped, n, unmapped, bigUnmapped, total: tot };
  out.qtyless = qtyless;
  out.confident = !!sv && n >= 3 && mapped / Math.max(n, 1) >= 0.7 && bigUnmapped.length === 0 && tot.kcal > 0 && qtyless / Math.max(n, 1) <= 0.3;
  // CAL: one global factor fitted on the tuning half only (median est/site kcal = 1.077): site-provided numbers run a bit lower than ingredient sums
  if (sv) { out.kcal = CAL * tot.kcal / sv; out.protein = CAL * tot.P / sv; out.carb = CAL * tot.C / sv; out.fat = CAL * tot.F / sv; }
  return out;
}
const fmtNu = (e, sv) => `Calories: ${Math.round(e.kcal)}\nProtein: ${Math.round(e.protein)}g\nCarbohydrate: ${Math.round(e.carb)}g\nFat: ${Math.round(e.fat)}g\nServing Size: 1 of ${Math.round(sv)} servings`;

/* ---- Playwright access to the app's own parseIngredient ---- */
async function openApp(port = 8800) {
  const { chromium } = require('/opt/node22/lib/node_modules/playwright');
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.route(/firebase|gstatic|googleapis|anthropic/, r => r.abort());
  await page.goto(`http://localhost:${port}/?debug&nosw`);
  await page.waitForFunction(() => window.__T && window.__T.S && window.__T.S.recipes && window.__T.S.recipes.length > 0, null, { timeout: 30000 });
  return { browser, page };
}
async function parseLinesViaApp(lines, port = 8800) {
  const { browser, page } = await openApp(port);
  const out = await page.evaluate(L => {
    const o = {};
    for (const l of L) { try { o[l] = window.__T.parseIngredient(l).map(x => ({ name: x.name, core: x.core, qty: x.qty, unit: x.unit, size: x.size, eachOz: x.eachOz, opt: x.opt, raw: l })); } catch (e) { o[l] = []; } }
    return o;
  }, lines);
  await browser.close();
  return out;
}
function loadParsed() {
  const f = path.join(DIR, 'parsed-lines.json');
  if (!fs.existsSync(f)) throw new Error('run: node nutrition.js parse-lines');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
module.exports = { parseNu, isConsistent, suspect, SUSPECT_KCAL, NU_TESTS, runTests, parseReport, FOODS, parseServings, ingredientGrams, estimateRecipe, fmtNu, openApp, parseLinesViaApp, loadParsed };

/* ============================ validate + fixes ============================ */
const FIX_KINDS = ['main', 'side', 'dessert', 'bkfst'];
const hashId = s => { let x = 2166136261; for (const c of s) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };
const median = a => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const r1 = v => Math.round(v * 10) / 10;
function trustedRows(cat, pl) {
  const rows = [];
  for (const r of cat) {
    if (r.ai || !r.nu || !FIX_KINDS.includes(r.k)) continue; // site-provided only
    const p = parseNu(r.nu); if (isConsistent(p) !== true || suspect(p)) continue;
    const e = estimateRecipe(r, pl); if (!e.confident) continue;
    rows.push({ r, p, e });
  }
  return rows;
}
function validate(cat, pl, verbose) {
  const rows = trustedRows(cat, pl);
  // stratify by kind x ESTIMATED-kcal tertile (stratifying on the site value would bake in regression-to-the-mean bias); every 2nd member of each stratum (by id hash order) is held out
  const kc = rows.map(x => x.e.kcal).sort((a, b) => a - b); const t1 = kc[Math.floor(kc.length / 3)], t2 = kc[Math.floor(2 * kc.length / 3)];
  const strata = {};
  rows.forEach(x => { x.stratum = x.r.k + '/' + (x.e.kcal <= t1 ? 'low' : x.e.kcal <= t2 ? 'mid' : 'high'); (strata[x.stratum] = strata[x.stratum] || []).push(x); });
  Object.values(strata).forEach(g => { g.sort((a, b) => hashId(a.r.id) - hashId(b.r.id)); g.forEach((x, i) => { x.set = i % 2 ? 'holdout' : 'tune'; }); });
  const summ = (rs) => {
    const pe = rs.map(x => (x.e.kcal - x.p.kcal) / x.p.kcal * 100);
    const pa = rs.map(x => x.e.protein - x.p.protein);
    const pp = rs.map(x => (x.e.protein - x.p.protein) / Math.max(x.p.protein, 5) * 100);
    const d = (x) => x.e.protein >= 30 === x.p.protein >= 30;
    return { n: rs.length, kcal_bias_pct_median: r1(median(pe)), kcal_abs_err_pct_median: r1(median(pe.map(Math.abs))), kcal_within_25pct: Math.round(100 * pe.filter(v => Math.abs(v) <= 25).length / rs.length),
      protein_bias_g_median: r1(median(pa)), protein_abs_err_g_median: r1(median(pa.map(Math.abs))), protein_abs_err_pct_median: r1(median(pp.map(Math.abs))), protein_30g_class_agreement_pct: Math.round(100 * rs.filter(d).length / rs.length) };
  };
  const out = { tertile_cuts_kcal: [t1, t2], all: summ(rows), tune: summ(rows.filter(x => x.set === 'tune')), holdout: summ(rows.filter(x => x.set === 'holdout')), strata: {} };
  for (const [k, g] of Object.entries(strata)) { const h = g.filter(x => x.set === 'holdout'); out.strata[k] = { size: g.length, ...summ(h.length ? h : g), on: h.length ? 'holdout' : 'all' }; };
  if (verbose) out.rows = rows.map(x => ({ id: x.r.id, n: x.r.n, set: x.set, stratum: x.stratum, est: [x.e.kcal, x.e.protein].map(Math.round), site: [x.p.kcal, x.p.protein] }));
  return out;
}
function buildFixes(cat, pl) {
  const stale = new Set(J('stale-ids.json'));
  const fixes = {}, rep = { blank: [], stale: [], unreadable: [], inconsistent: [], skippedKind: [], skippedUnsure: [], partial: [] };
  for (const r of cat) {
    const p = parseNu(r.nu); const blank = !String(r.nu || '').trim();
    const known = ['kcal', 'protein', 'carb', 'fat'].filter(k => p[k] != null).length;
    let reason = null;
    if (stale.has(r.id)) reason = 'stale';
    else if (blank) reason = 'blank';
    else if (known === 0) reason = 'unreadable'; // text holds no numbers we can read: nothing site-provided to protect
    else if (isConsistent(p) === false) reason = 'inconsistent';
    else if (known < 4) { rep.partial.push({ id: r.id, n: r.n, have: p }); continue; }
    if (!reason) continue;
    const rec = { id: r.id, n: r.n, k: r.k, ai: r.ai };
    const e = estimateRecipe(r, pl);
    if (!FIX_KINDS.includes(r.k) && !(reason === 'stale' && r.k !== 'drink')) { rep.skippedKind.push({ ...rec, reason }); continue; } // stale estimates must be redone for every non-drink kind
    if (reason === 'inconsistent') { // site-provided / earlier estimate: never overwritten; listed for review
      rep.inconsistent.push({ ...rec, nu: parseNu(r.nu), suggest: e.servings ? { kcal: Math.round(e.kcal), protein: Math.round(e.protein), carb: Math.round(e.carb), fat: Math.round(e.fat), confident: e.confident } : null });
      continue;
    }
    if (!e.servings || e.kcal == null || !(e.kcal > 0)) { rep.skippedUnsure.push({ ...rec, reason, why: 'servings unreadable: ' + JSON.stringify(r.s) }); continue; }
    if (!e.confident && reason !== 'stale') { rep.skippedUnsure.push({ ...rec, reason, why: 'low confidence', unmapped: e.bigUnmapped }); continue; }
    if (reason === 'unreadable') { rep.unreadableReview = rep.unreadableReview || []; rep.unreadableReview.push({ ...rec, existing: String(r.nu).slice(0, 120), proposed: fmtNu(e, e.servings), confident: e.confident }); continue; } // text exists but is not nutrition: a person decides
    fixes[r.id] = fmtNu(e, e.servings);
    rep[reason].push({ ...rec, confident: e.confident, est: [Math.round(e.kcal), Math.round(e.protein)], servings: e.servings, unmapped: e.unmapped });
  }
  return { fixes, rep };
}
async function cli(cmd, cat) {
  const pl = loadParsed();
  if (cmd === 'validate') { const v = validate(cat, pl, process.argv.includes('--rows')); fs.writeFileSync(path.join(DIR, 'validation.json'), JSON.stringify(v, null, 1)); console.log(JSON.stringify({ all: v.all, tune: v.tune, holdout: v.holdout, strata: v.strata }, null, 1)); return; }
  if (cmd === 'fixes') {
    const { fixes, rep } = buildFixes(cat, pl);
    fs.writeFileSync(path.join(DIR, 'nutrition-fixes.json'), JSON.stringify(fixes, null, 1));
    fs.writeFileSync(path.join(DIR, 'fix-report.json'), JSON.stringify(rep, null, 1));
    const c = k => rep[k].length;
    console.log(JSON.stringify({ fixes_written: Object.keys(fixes).length, blank_filled: c('blank'), stale_recomputed: c('stale'), unreadable_filled: c('unreadable'), inconsistent_listed_not_replaced: c('inconsistent'), skipped_wrong_kind: c('skippedKind'), skipped_unsure: c('skippedUnsure'), partial_left: c('partial') }, null, 1)); return;
  }
  console.log('unknown command');
}

/* ============================ CLI ============================ */
async function main() {
  const cmd = process.argv[2];
  const cat = J('catalog.json');
  if (cmd === 'test') return process.exit(runTests() ? 0 : 1);
  if (cmd === 'parse-report') { const r = parseReport(); console.log(JSON.stringify(r.c, null, 1)); return; }
  if (cmd === 'parse-lines') {
    const lines = [...new Set(cat.flatMap(r => r.i || []))];
    const o = await parseLinesViaApp(lines);
    fs.writeFileSync(path.join(DIR, 'parsed-lines.json'), JSON.stringify(o));
    console.log('parsed', lines.length, 'distinct ingredient lines'); return;
  }
  if (cmd === 'estimate-report') {
    const pl = loadParsed(); const un = {}; let conf = 0, n = 0;
    for (const r of cat) { const e = estimateRecipe(r, pl); n++; if (e.confident) conf++; for (const l of e.unmapped) un[l] = (un[l] || 0) + 1; }
    console.log(`confident ${conf}/${n}`);
    const names = {}; for (const l of Object.keys(un)) for (const it of pl[l] || []) if (ingredientGrams(it, l).unmapped) names[it.name] = (names[it.name] || 0) + un[l];
    console.log(Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, +process.argv[3] || 80).map(e => e[1] + ' ' + e[0]).join('; '));
    return;
  }
  if (typeof cli === 'function') return cli(cmd, cat);
  console.log('commands: test | parse-report | parse-lines | estimate-report | validate | fixes');
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
