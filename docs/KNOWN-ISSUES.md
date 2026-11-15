# Known issues and follow-ups (from the team reviews)

Not fixed yet, from the bug sweep:
- Changing the week start day on one phone while the other phone is checking off items can lose some of those check-offs (rare; changing it re-dates the week).
- Offline cold start: the Firebase SDK is not cached, so a first open with no signal runs in local mode.
- The service worker never refreshes index.html on a slow connection, so the update banner can loop.

Walmart: about 130 names have no default on purpose (alcohol, fish, starters, non-product names) or have no confirmed product (hummus, French onion dip, ground veal, protein powder).

From the four-week test (not fixed yet):
- "Use up first" items now stop steering the plan after a week (and say so), but never leave the list until you remove them.
- Milk and sandwich bread are doubled in the Walmart cart for 5 or more eaters, but the grocery list and Sam's list still show one; other staples don't scale.
- With the white-sauce swap on, cook mode's steps still say "spread the pizza sauce" while the banner says making it white.
- Lettuce lines don't always merge (iceberg and romaine).

Other open items:
- Two phones switching different pantry items on or off at the very same moment can keep only one change (the list keeps its order instead).
- Offline cold start (first open with no signal runs in local mode) and the update banner looping on a slow connection are not fixed.
- Walmart: the existing ~890 product matches were not audited one by one, and about 77 junk ingredient names from badly written recipe lines were not cleaned up.
- Not built from the product roadmap: the white-sauce note on cook steps (docs/ROADMAP.md item 5).

- The "Beef again" style note and the planner's protein variety rule use a best guess of each recipe's main protein, read from its name and first 12 ingredient lines (broth, stock, gravy and optional add-on lines are ignored). A few can still be off (for example Cincinnati Chili reads as meatless). The sturdier fix, if it bothers you, is to show the note only when the recipe name carries the protein word.
- Under 12 g protein is hidden on the chip but still counts as low in the planner's 28 g preference.

- Protein numbers copied from recipe sites are sometimes wrong. The estimator (tools/nutrition.js) puts these favorites well above the site number, so they got no add-on: 5 Minute Buffalo Chicken Wraps (site 20 g, estimate 42), Bacon Cheeseburger Ground Beef Pasta Skillet (26 vs 44), Chicken Sausage and Peppers Macaroni Casserole (19 vs 30), Croque Madame Sandwich (15 vs 47), Pesto Rice with Chicken, Tomatoes and Spinach (22 vs 47), Sailor Sandwiches (20 vs 39). In most of these the site also lists far fewer calories, so it is probably counting a smaller serving. Eight favorites under 12 g (for example Antipasto Sliders, Roasted Tomato Basil Soup) and six with no number were left alone.
- BBQ Chicken Sliders has no add-on: a serving is one slider.
- Add-ons exist for catalog favorites rated 4 or 5 stars only; recipes you rate later don't get one automatically.
