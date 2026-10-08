# Changelog — Leaderboard Feature

## Files Added
- `js/pages/Leaderboard.js` — New leaderboard page component with scenario/time filters, top-50 table, current-user highlight, and out-of-top-50 rank display

## Files Modified
- `index.html` — Added Leaderboard.js script tag; bumped cache versions for components.css, databaseService.js, Layout.js, app.js
- `css/components.css` — Added leaderboard styles (filters, table, medals, responsive layout)
- `js/app.js` — Added 'leaderboard' to PROTECTED_PAGES; added leaderboard route; hooked `submitLeaderboardEntry()` into `handleSaveResult` for automatic submission after each run
- `js/components/Layout.js` — Added leaderboard nav item (icon: △) between Statistics and Profile
- `js/services/databaseService.js` — Added leaderboard methods: `submitLeaderboardEntry()`, `getLeaderboardTop()`, `getUserLeaderboardEntry()`, `getUserLeaderboardRank()`
- `firestore.rules` — Added rules for `leaderboards/{scenarioId}/entries/{userId}` subcollection with ownership, score-improvement, and field-validation constraints; also added rules for `playlists` collection that was previously unguarded
- `firestore.indexes.json` — Added composite index for `entries` collection ordered by `score` descending

## Files Removed
- None

## Source of Truth
Used the top-level version (`aminedjaghout16-alt-aim-platform-1b50931/`) as the source of truth. It was more complete than the nested version (`aminedjaghout16-alt-aim-platform-8cbea27/`), containing saved-playlist functionality, playlist navigation guards, and additional databaseService methods.

## Deploy Commands
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
# Or both at once:
firebase deploy --only firestore
```

## Design Decisions
1. **Firestore structure**: `leaderboards/{scenarioId}/entries/{userId}` — one doc per user per scenario, using the userId as the document ID. This makes "one best entry per user per scenario" natural and efficient.
2. **Auto-submit**: Leaderboard entries are submitted automatically in `handleSaveResult` after every training run. The submission is fire-and-forget (wrapped in try/catch) so it never blocks the UI or breaks the existing save flow.
3. **Transaction for score comparison**: `submitLeaderboardEntry` uses a Firestore transaction to atomically check whether the new score beats the existing best, preventing race conditions.
4. **Client-side time filter**: The "this week" filter is applied client-side because Firestore server timestamps can't be used directly in query where-clauses. For large datasets, a Cloud Function that writes a separate `createdAtMs` number field would be more efficient.
5. **No weaponId filter on leaderboard**: The leaderboard currently shows the best score per scenario regardless of weapon. Weapon-specific leaderboards could be added later by keying entries as `{scenarioId}_{weaponId}`.

## Security Notes
The Firestore rules enforce:
- Users can only create/update their own entry (doc ID must match auth UID)
- Users can only replace their entry with a **higher or equal** score (`request.resource.data.score >= resource.data.score`)
- Required fields: `userId`, `displayName`, `score`, `accuracy`, `scenarioId`
- Score must be 0–1000, accuracy must be 0–100
- `displayName` must be 1–50 characters
- `scenarioId` in the document must match the path parameter
- Only admins can delete entries

### What can still be cheated (and what to do about it)
Client-submitted scores are inherently trustless. A malicious user can:
- Call the Firestore API directly with fabricated scores
- Modify the JavaScript to submit arbitrary score/accuracy values
- Automate runs with scripts/bots

**Recommended upgrade path**: Move score calculation to a Cloud Function. The client would submit raw session data (hits, misses, reaction times, duration) and the Cloud Function would replay the scoring algorithm server-side, making it impossible to submit inflated scores without actually performing the run. This also enables anti-cheat measures like session duration validation and replay detection.

## Not Done
- Weapon-specific leaderboards (data is stored but not filtered)
- Real-time leaderboard updates via `onSnapshot` listener (current implementation fetches on filter change)
- Cloud Function for server-side score validation
- Admin UI for managing/moderating leaderboard entries
