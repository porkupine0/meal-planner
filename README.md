# Supper Board

A weekly family meal planner. It runs entirely in the browser: open `index.html` from a web server (GitHub Pages works).

## What it does

- **Plan:** pick a category for each day (Pasta, Soup, Quick & Easy, Leftovers, Eat Out, Surprise Me and more), then fill the week. Reroll, lock or hand-pick any day, and add a side. Rerolling never changes nights you've already eaten (or tonight), and big changes have an Undo.
- **Variety:** the planner avoids the same main protein or two soups on back-to-back nights and caps chicken nights per week (Settings). Single-serving recipes and ones without directions are never planned, and recipes that need a marinade or overnight rise aren't planned for tonight or tomorrow.
- **Groceries:** builds a list from the week's meals, sorted by store aisle with amounts combined (cups and tablespoons add up, cans and ounces add up by weight). Each item shows the nights that use it. Mid-week, the list covers tonight onward (tap **Whole week** for everything). Pantry staples stay off the list, weekly staples are added every week (a skipped staple can be added back), optional and "for serving" items are marked, and you check items off as you shop or copy the list as text. Check-offs sync item by item, so two people can shop at once.
- **White-sauce swap:** on a red-sauce night the plan says how to make it white, and the grocery list leaves out the marinara or tomatoes and buys Alfredo (or green enchilada sauce, cream, green chiles) instead. Tap **Keep the red sauce** to buy it as written.
- **Household size:** set how many you cook for. Recipes that serve fewer are scaled up on the plan, cook view and grocery list; party-size recipes are halved.
- **Cook once, eat twice:** point a Leftovers night at an earlier dinner and that dinner becomes a double batch.
- **Week setup:** each new week starts with a short setup: list what needs to be used up, confirm each night's category, then make the plan. The first meals of the week are chosen to clear out those leftovers.
- **Sides:** pick a side recipe or just type one, like "fruit" or "chips", and it goes on the grocery list.
- **Create with Claude:** describe what you're in the mood for, match a night's category, or ask for something new, and Claude writes a recipe that follows the family rules (no seafood, no red sauce). On this GitHub site it needs an Anthropic API key, which you add in Settings and which is stored only in your browser.
- **Use up first:** track leftover ingredients from the Plan page. The planner favors recipes that use them early in the week.
- **One meal from your leftovers:** Claude writes a single recipe that uses every leftover you've listed, checks which ones it used, and lets you plan it for any night.
- **Busy nights:** mark nights as busy (in Settings for every week, or per week) and they get a quick or slow cooker meal.
- **Ratings:** rate past nights with stars and a separate "the kids loved it / not a hit." Both steer future plans.
- **Batch size:** make a half, 1½ or double batch on any night; the recipe and grocery amounts adjust, including ranges like "2-3 cloves" and the number of servings.
- **Cook view:** big checkable ingredients and steps, the screen stays on, and any "simmer 20 minutes" in a step becomes a tap-to-start timer.
- **What can I make tonight?** and **History and stats** are in the ••• menu: dinners ranked by how little you'd need to buy, a month calendar, most-made meals and favorites you haven't made lately.
- **Tonight and tomorrow:** the Plan page shows tonight's dinner with a Cook button, plus reminders for tomorrow (thaw the meat, start the slow cooker).
- **Usual sides:** sides you've paired with a meal before are suggested first.
- **Send:** share the grocery list or the week's menu by text.
- **Recipes:** 670 recipes (no seafood) with ratings, times and categories, all editable, plus a way to add your own. Includes pizzas, takeout favorites, mild curries, BBQ, holiday mains, air fryer, meatless dinners, sides and desserts. Recipes without a photo get an illustrated tile.
- **Settings:** week start day (default Friday; changing it moves your planned meals into the new weeks), your usual week, red-sauce handling, household size, chicken nights per week, the no-repeat window, pantry staples (searchable) and appearance (Light, Dark or Match my phone).
- **Works offline:** after the first visit the app, recipes and your list open without signal (handy in the store).

## Files

- `index.html`: the whole app (HTML, CSS and JavaScript, no build step)
- `recipes.json`: recipe data
- `thumbs.json`: recipe photo thumbnails
- `icons/` and `manifest.webmanifest`: app logo and home-screen icon
- `sw.js`: offline support (keeps a copy of the app and recipes on the phone)

## Saving

- **Family sync (GitHub Pages):** sign in under Settings → Family sync and the plan, grocery list, check-offs, ratings and settings are shared through Firebase, so everyone in the house sees the same board live. Changes made offline are kept and sent when the phone reconnects.
- **Not signed in:** everything is saved in that browser only (localStorage), so each device keeps its own copy until you sign in.
- **claude.ai copy:** the artifact version saves to its own shared storage and syncs across devices on its own.
- **Backup or move:** Settings → Copy my data copies your settings, weeks, Walmart links and recipe edits as text; paste it back in with Load pasted data.

## Running locally

```
python3 -m http.server
```

Then open http://localhost:8000. It has to be served over http because the app fetches the JSON files, so opening the file directly won't work.

## Add it to your phone's home screen

- **iPhone (Safari):** tap Share, then **Add to Home Screen**.
- **Android (Chrome):** tap ⋮, then **Add to Home screen** (or **Install app**).

It opens full screen with the Supper Board bowl icon.

## Walmart and Sam's Club

Each item on the grocery list has a store menu (Walmart or Sam's Club). Recipe ingredients also have **In my pantry**: it adds the ingredient to your pantry list in Settings, so it stays off the list every week (tap **Need it** under "Left off: in your pantry" when you run low). The choice is remembered for that item every week. Filter the list by store, send just the Sam's Club items with **Send Sam's list**, and the full list ends with a Sam's Club section. The Walmart cart button only includes Walmart items.

### Walmart pickup

On the grocery list, tap **+ Walmart** next to an item and paste the link of the exact Walmart product you buy (or its item number). It's remembered for every week. **Add to Walmart cart** then opens Walmart with every saved product still on your list in the cart, so you can choose a pickup time and check out. Check off anything you already have first so it isn't added.

About 310 common items (milk, eggs, butter, cheeses, bread, tortillas, chicken, ground beef and turkey, broth, canned beans, pasta, egg noodles, rice, Greek yogurt, and produce like onions, baby carrots, bell peppers (green unless the recipe says red) and cilantro) already link to a Great Value product (or Walmart's own produce) found on walmart.com, so they go in the cart without any setup. Some swaps happen on the list itself. Plain "chicken" is bought as chicken breasts, or as a rotisserie chicken (from Sam's Club) when the recipe uses it cooked or shredded. Prosciutto and pancetta are bought as bacon. Tomatoes are Roma, lettuce is romaine, bell peppers are green unless the recipe names a color, and yellow or orange peppers use red. Tap the **Great Value ✓** / **Default ✓** button to pick a different product, or choose **Don't add from Walmart** to leave that item out. **Use this** brings the default back.

## Family sync (Firebase)

The GitHub Pages site syncs through a Firebase project, so everyone signed in sees the same plan, grocery list and check-offs. Sign in under **Settings → Family sync** (Google, or email and password). The first phone to sign in copies its plan into the shared board.

Only the accounts listed in the Firestore security rules can read or write. Paste these into **Firestore Database → Rules** in the Firebase console, with your own addresses in lowercase:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function family() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email.lower() in ['you@example.com', 'partner@example.com'];
    }
    match /{document=**} {
      allow read, write: if family();
    }
  }
}
```

In **Authentication → Settings → Authorized domains**, add the GitHub Pages domain (for example `yourname.github.io`). The Claude version of the board keeps using Claude's own storage and doesn't use Firebase.

## Editing and adjusting recipes

Open any recipe and tap **Edit or adjust**. Change the name, servings, ingredients (one per line) or directions and tap **Save changes**. The grocery list uses the edited version. **Adjust with Claude** rewrites the recipe for a change you describe (white sauce instead of red, healthier, quicker, slow cooker, use the fridge leftovers, or anything you type); review what it filled in, then save or tap **Undo**. **Restore original** puts back the imported version of one of your recipes.

## Tests

`node tests/grocery.js` runs every ingredient line in `recipes.json` through the app's parser and Walmart matcher and compares the result to `tests/grocery-golden.json`. After an intended change to the grocery engine or the catalog, review the differences it prints and accept them with `node tests/grocery.js --update`. Needs Playwright.
