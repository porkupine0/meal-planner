# Supper Board roadmap (steps 10+)

Data rule for everything below: new saved fields are additive and optional; code treats missing as "old behavior". Old phones ignore them. Where a new map goes in settings, add it to DIFF_MAPS (index.html:1197) so two phones writing different keys don't clobber each other.

## Next version (6 items)

### 1. Use-up-first items expire (closes F7)  [S, low risk]
- Problem: leftover chips (ground beef, sour cream) never clear, so weeks 3 and 4 get built around stale food.
- On screen: chips older than 7 days show a muted "from 9 days ago" label and stop steering generateWeek. A one-line prompt on the fridge panel: "3 old items. Still have them? Keep / Clear". Once the night that claims an item is in the past, show "Used it?" on the chip (one tap removes).
- Hooks: fridge chips ~1639 (already knows the claiming night via leftoverClaims, ~806); remove path is `case 'usedfridge'` (3198); steering in generateWeek (1551-1567) and fridgeMatches (~799); week-setup chips 1603.
- Data: items already carry `added: Date.now()` (3123, 3124). No new field. Optional `keep:true` on an item to pin it (additive; old phones ignore it and still list it).
- Writes: saveFridge -> persistDiff('app/fridge') (1266), list diffed by id (DIFF_LISTS has 'items').
- Test: seed fridge item with added = 10 days ago; assert generateWeek ignores it, chip shows age, "Clear" removes only that id; an item with no `added` is treated as fresh.

### 2. Weekly staple quantities for 5 eaters (closes F8)  [S-M, low risk]
- Problem: cart has 1 gallon milk, 1 loaf, 1 apple.
- On screen: Settings > Weekly staples row gets a small stepper (x1, x2, x3). Defaults for NEW installs: milk 2, bread 2, bananas/apples via min. List line reads "Milk, 2 gallons".
- Hooks: DEFAULT_STAPLES (515), staples settings row (2628), staple merge in groceryModel (1848-1852), packsFrom/PACK_RULES (2407, 2452) for the multiplier; list row at 2388/2500.
- Data: separate map `settings.stapleQty = {"Milk":2}` rather than a field on the staple object, so an old phone toggling `on` (which rewrites the staple item) cannot erase it. Add 'stapleQty' to DIFF_MAPS. Missing = 1. Also set PACK_RULES apple min:6 already present ('44390953'); verify it is hit (F8 says apple x1 still).
- Test: run tests/grocery.js golden; with stapleQty milk=2 the cart quantity is 2; delete the key and it returns to 1; old-phone simulation: toggle a staple and confirm stapleQty survives.

### 3. Protein badge on tiles (display only)  [S, none]
- Problem: dad wants protein; nothing shows it until you open a recipe.
- On screen: a chip "38 g protein" in badges(), green at 30 g or more, nothing when unknown. Also on day cards and picker rows.
- Hooks: badges() (892-905) using nuOf (1354); add a chip next to the clock chip. README says planner uses 28 g, so use 28 as the green line to match.
- Data: none.
- Test: skirt steak recipe shows 38 g; recipe with no nu shows no chip; snapshot 20 random recipes; check no layout wrap at 390px.

### 4. Real tacos for Taco night (closes F9, F10)  [M, low risk]
- Problem: "Tacos & Mexican" gives breakfast burritos, posole, casseroles.
- On screen: no new picker. Inside the M bucket, planner prefers recipes whose name matches taco|fajita|burrito bowl|quesadilla|nacho|enchilada and drops breakfast and soup (posole) for the Tuesday-style night. Search "taco" ranks name-starts-with first. Same for Slow Cooker night: require t >= 180 or an SC-tag-and-"slow cooker" in name; Pasta night requires a real-pasta ingredient (not zucchini or sesame noodles).
- Hooks: the category pool filter near fitsDay (941) and pool build at 1447; CATS (482) unchanged. Derive at load time from name and ingredients, so recipes.json is untouched.
- Data: none (computed). Optional later: `r.sub` tag in recipes.json (additive; old versions ignore).
- Test: for 500 simulated M nights assert >=90 percent name or ingredient taco-family and 0 breakfast/soup; SC nights all >=180 min; pasta nights all contain pasta.

### 5. Cook steps match the white-sauce swap (closes F11)  [M, medium risk]
- Problem: banner says "Making it white" but step 2 still says "spread the pizza sauce".
- On screen: when m.white, steps that mention sauce/marinara/pizza sauce/tomato are prefixed with a struck-through or replaced note: "Use Alfredo instead:" and the banner text is moved directly above the first affected step. Do not rewrite recipe text silently.
- Hooks: cook modal steps render (2986-2995, `steps.map`), RED_ING already used for ingredients (~2996); SWAP table (493). Use the same RED_ING-style regex on step text.
- Data: none.
- Test: Chicken Parm Pizza with white=1 flags step 2; a step without sauce words is untouched; white=0 renders exactly as today (diff the HTML).

### 6. Same-protein warning on hand picks (closes F16)  [S, none]
- Problem: parents pick beef five nights without noticing.
- On screen: when picking a recipe for a night, if the same main protein is already planned on an adjacent night or 3+ times that week, show a quiet inline note "Beef again: Tue and Wed too" with the pick still allowed.
- Hooks: proteinOf (used by tileEmoji, 871), picker modal and the 'pick' action; reuse the variety rule inside generateWeek.
- Data: none.
- Test: plan beef Mon, open picker Tue with a beef recipe, note shows; chicken is not flagged; locked/auto behavior unchanged.

## Later (medium)
- "Rate it" prompt after Done cooking (F12): a one-tap 3-star toast when closing cook mode. Ratings already a week field; additive. M.
- Cooked-ingredient pack counts (F14: "6 cups rice cooled" buys 2 bags): teach packNeed about "cooked/cooled/shredded". M.
- Lettuce and egg merging, unsalted butter default, Root beer product (F13, F17). S each.
- Holiday awareness (Thanksgiving night shouldn't default to Leftovers, a guests-count that scales one night). M.
- Shopping mode on Groceries (aisle order, big rows, checked sink down; UI designer's idea). M.
- Cook-mode ingredient list should drop the "Family notes" paragraph that leaks in from some recipes (F15). S.
- Bug backlog: week-start-change check-off loss, SW index.html refresh loop (see KNOWN-ISSUES).

## Big bets
- Version-skew guard: stamp each doc write with `appVer` and show "Your other phone runs an older version, reload" banner. Solves the real two-phone problem. M-L, worth doing before any schema change beyond the above.
- Own photos after cooking, stored small per recipe (about 224x168 jpeg), for the ~450 emoji-tile recipes. L (sync size, storage).
- Smart leftovers: when Cook once eat twice is used, auto-add the leftover to the Use-up list with an expiry. M-L.
- Per-person plates (dad lifts: high-protein portion note, boys larger scale). L.

## Don't build
- Accounts, sharing, social, growth, subscriptions: personal tool.
- Calorie tracking or macro logging: the dietitian's soft rules are enough; logging would be nagging.
- Barcode scanning or live Walmart price/stock: needs a new service and breaks on Walmart changes.
- Real-time Walmart or Sam's cart automation beyond links: fragile, ToS risk.
- A build step or splitting index.html into modules: breaks the single-file offline-friendly deploy.
- Native push notifications: iOS home-screen PWA support is unreliable; the Plan page reminders cover it.
- Schema changes that rename or reshape existing fields: the phones run different versions.

## Recommended order (top 3)
1. Use-up expiry (#1): fixes the most visible daily annoyance, no data change, no new field.
2. Staple quantities (#2): fixes the cart every single week; use the separate map so the two phones can't clobber it.
3. Protein badge (#3): display-only, tiny, safest and dad-friendly; ship together with #1 as a patch release.
Then #4 (tacos), #6, #5. If two phones are ever on mixed versions for long, do the version-skew guard before #5.
