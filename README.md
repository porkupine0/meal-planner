# Supper Board

A weekly family meal planner. It runs entirely in the browser: open `index.html` from a web server (GitHub Pages works).

## What it does

- **Plan:** pick a category for each day (Pasta, Soup, Quick & Easy, Leftovers, Eat Out, Surprise Me and more), then fill the week. Reroll, lock or hand-pick any day, and add a side.
- **Groceries:** builds a list from the week's meals, sorted by store aisle with amounts combined. Pantry staples stay off the list, weekly staples are added every week, and you check items off as you shop or copy the list as text.
- **Fridge:** track leftover ingredients. The planner favors recipes that use them early in the next week.
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
