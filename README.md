# Supper Board

A weekly family meal planner. It runs entirely in the browser: open `index.html` from a web server (GitHub Pages works).

## What it does

- **Plan:** pick a category for each day (Pasta, Soup, Quick & Easy, Leftovers, Eat Out, Surprise Me and more), then fill the week. Reroll, lock or hand-pick any day, and add a side.
- **Groceries:** builds a list from the week's meals, sorted by store aisle with amounts combined. Pantry staples stay off the list, weekly staples are added every week, and you check items off as you shop or copy the list as text.
- **Week setup:** each new week starts with a short setup: list what needs to be used up, confirm each night's category, then make the plan. The first meals of the week are chosen to clear out those leftovers.
- **Sides:** pick a side recipe or just type one, like "fruit" or "chips", and it goes on the grocery list.
- **Create with Claude:** describe what you're in the mood for, match a night's category, or ask for something new, and Claude writes a recipe that follows the family rules (no seafood, no red sauce). On this GitHub site it needs an Anthropic API key, which you add in Settings and which is stored only in your browser.
- **Use up first:** track leftover ingredients from the Plan page. The planner favors recipes that use them early in the week.
- **One meal from your leftovers:** Claude writes a single recipe that uses every leftover you've listed, checks which ones it used, and lets you plan it for any night.
- **Busy nights:** mark nights as busy (in Settings for every week, or per week) and they get a quick or slow cooker meal.
- **Ratings:** rate past nights with stars and a separate "the kids loved it / not a hit." Both steer future plans.
- **Batch size:** make a half, 1½ or double batch on any night; the recipe and grocery amounts adjust.
- **Tonight and tomorrow:** the Plan page shows tonight's dinner with a Cook button, plus reminders for tomorrow (thaw the meat, start the slow cooker).
- **Usual sides:** sides you've paired with a meal before are suggested first.
- **Send:** share the grocery list or the week's menu by text.
- **Recipes:** 493 recipes (no seafood) with ratings, times and categories, all editable, plus a way to add your own.
- **Settings:** week start day (default Friday), your usual week, red-sauce handling, the no-repeat window and pantry staples.

## Files

- `index.html`: the whole app (HTML, CSS and JavaScript, no build step)
- `recipes.json`: recipe data
- `thumbs.json`: recipe photo thumbnails
- `icons/` and `manifest.webmanifest`: app logo and home-screen icon

## Saving

On GitHub Pages, plans and lists are saved in the browser you use (localStorage), so each device keeps its own copy. The claude.ai version of the app syncs across devices.

## Running locally

```
python3 -m http.server
```

Then open http://localhost:8000. It has to be served over http because the app fetches the JSON files, so opening the file directly won't work.

## Add it to your phone's home screen

- **iPhone (Safari):** tap Share, then **Add to Home Screen**.
- **Android (Chrome):** tap ⋮, then **Add to Home screen** (or **Install app**).

It opens full screen with the Supper Board bowl icon.

## Walmart pickup

On the grocery list, tap **+ Walmart** next to an item and paste the link of the exact Walmart product you buy (or its item number). It's remembered for every week. **Add to Walmart cart** then opens Walmart with every saved product still on your list in the cart, so you can choose a pickup time and check out. Check off anything you already have first so it isn't added.
