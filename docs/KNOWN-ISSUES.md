# Known issues and follow-ups (from the team reviews)

Not fixed yet, from the bug sweep:
- Changing the week start day on one phone while the other phone is checking off items can lose some of those check-offs (rare; changing it re-dates the week).
- Offline cold start: the Firebase SDK is not cached, so a first open with no signal runs in local mode.
- The service worker never refreshes index.html on a slow connection, so the update banner can loop.

Walmart: about 130 names have no default on purpose (alcohol, fish, starters, non-product names) or have no confirmed product (hummus, French onion dip, ground veal, protein powder).

From the four-week test (not fixed yet):
- "Use up first" items now stop steering the plan after a week (and say so), but never leave the list until you remove them.
- Milk and sandwich bread are doubled in the Walmart cart for 5 or more eaters, but the grocery list and Sam's list still show one; other staples don't scale.
- "Taco Tuesday" often brings casseroles or breakfast items; the Tacos & Mexican group is broad.
- With the white-sauce swap on, cook mode's steps still say "spread the pizza sauce" while the banner says making it white.
- Lettuce lines don't always merge (iceberg and romaine).

Other open items:
- Two phones switching different pantry items on or off at the very same moment can keep only one change (the list keeps its order instead).
- Offline cold start (first open with no signal runs in local mode) and the update banner looping on a slow connection are not fixed.
- Walmart: the existing ~890 product matches were not audited one by one, and about 77 junk ingredient names from badly written recipe lines were not cleaned up.
- Not built from the product roadmap: real tacos/pasta in the category buckets, white-sauce note on cook steps, same-protein warning (docs/ROADMAP.md items 4-6).
