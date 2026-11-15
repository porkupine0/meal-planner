# Known issues and follow-ups (from the team reviews)

Not fixed yet, from the bug sweep:
- Changing the week start day on one phone while the other phone is checking off items can lose some of those check-offs (rare; changing it re-dates the week).
- Offline cold start: the Firebase SDK is not cached, so a first open with no signal runs in local mode.
- The service worker never refreshes index.html on a slow connection, so the update banner can loop.
- Rerolling a night keeps the old "Keep the red sauce" choice.
- Low: November clock change skips the oldest week in the recent-recipes window; "1 1/2 hours" timer reads as 2 hours; planning before weeks load can overwrite the shared week; a deleted custom recipe stays planned; a wake lock can leak; canned mandarin oranges map to fresh oranges.

Walmart: about 130 names have no default on purpose (alcohol, fish, starters, non-product names) or have no confirmed product (hummus, French onion dip, ground veal, protein powder).
