# Changelog — VANTAGE Leaderboard

## Security Hardening & Weekly Leaderboards (2026-10-09)

### Critical Security Fixes

#### 1. Role Escalation Vulnerability (FIXED)
**Problem:** Users could set `role: 'admin'` on themselves in the `users/{userId}` collection, then pass `isAdmin()` checks to delete other users' leaderboard entries.

**Solution:**
- **Create:** `role` must be absent or `'user'`
- **Update:** `role` cannot be changed (must remain the same in both `resource.data` and `request.resource.data`)

**Test:** "user CANNOT set role:admin then delete another user's entry" — PASS

#### 2. Leaderboard Entry Field Validation (HARDENED)
**Added:**
- `validLeaderboardEntryFields()` — Restricts entries to exact field set: `userId`, `displayName`, `score`, `accuracy`, `scenarioId`, `weaponId`, `grade`, `createdAt`
- `displayNameMatches()` — Requires `displayName` to match `users/{uid}.displayName` via `get()`
- Score updates now require `>` (strictly greater) instead of `>=` to prevent same-score overwrites

**Tests:** All field validation tests — PASS

### Weekly Leaderboard Implementation

**Problem:** The previous "this week" filter was broken because `createdAt` only changed when a player beat their personal best, not when they submitted a new score for the week.

**Solution:** Implemented weekly buckets with separate collections:
- **All-time:** `leaderboards/{scenarioId}/entries/{userId}`
- **Weekly:** `leaderboards/{scenarioId}/weeks/{weekId}/entries/{userId}`

**Changes:**
- `submitLeaderboardEntry()` now writes to both all-time and current week's bucket
- `getLeaderboardTop()`, `getUserLeaderboardEntry()`, `getUserLeaderboardRank()` accept `timeRange` parameter
- "This week" view queries the weekly bucket directly (no client-side filtering)
- Week ID format: `YYYY-WNN` (ISO week, UTC), e.g., `2026-W41`

**Tests:** Weekly leaderboard create/update tests — PASS

### Firestore Rules Structure

```
users/{userId}
  - Create: owner only, role must be absent or 'user'
  - Update: owner only, role cannot change
  - Delete: owner or admin

leaderboards/{scenarioId}/entries/{userId}
  - Read: any authenticated user
  - Create: owner only, field validation, displayName match
  - Update: owner only, score must be strictly greater, field validation
  - Delete: admin only

leaderboards/{scenarioId}/weeks/{weekId}/entries/{userId}
  - Same rules as all-time entries
```

### Test Results

**27/27 tests passed** using Firestore emulator:

**User Profile Security (6 tests):**
- ✅ User can create profile without role
- ✅ User can create profile with role:user
- ✅ User CANNOT create profile with role:admin
- ✅ User CANNOT update profile to set role:admin
- ✅ User can update displayName without changing role
- ✅ User CANNOT create profile for another user

**Leaderboard Entry Security (17 tests):**
- ✅ User can create their own entry
- ✅ User CANNOT create entry for another user
- ✅ User CANNOT create entry with wrong userId field
- ✅ User CANNOT create entry with score > 1000
- ✅ User CANNOT create entry with score < 0
- ✅ User CANNOT create entry with accuracy > 100
- ✅ User CANNOT create entry with wrong scenarioId
- ✅ User CANNOT create entry with extra fields
- ✅ User CANNOT create entry with displayName mismatch
- ✅ User can update entry with higher score
- ✅ User CANNOT update entry with lower score
- ✅ User CANNOT update entry with same score
- ✅ User CANNOT update another user's entry
- ✅ User CANNOT delete their own entry
- ✅ User CANNOT delete another user's entry
- ✅ Any authenticated user can read entries
- ✅ Unauthenticated user CANNOT read entries

**Weekly Leaderboard Security (3 tests):**
- ✅ User can create weekly entry
- ✅ User can update weekly entry with higher score
- ✅ User CANNOT update weekly entry with lower score

**Privilege Escalation Attack (1 test):**
- ✅ User CANNOT set role:admin then delete another user's entry

### Files Modified
- `firestore.rules` — Fixed role escalation vulnerability, added weekly bucket rules, hardened field validation
- `js/services/databaseService.js` — Added weekly bucket logic, ISO week calculation, updated query methods
- `js/pages/Leaderboard.js` — Pass timeRange to query methods
- `index.html` — Bumped cache versions
- `firestore.test.js` — Added comprehensive test suite (27 tests)
- `firebase.json` — Added emulator configuration

---

## Initial Implementation (2026-10-09)

### Files Added
- `js/pages/Leaderboard.js` — Leaderboard page with scenario/time filters, top-50 table, current-user highlight
- `css/components.css` — Added leaderboard styles (filters, table, medals, responsive layout)

### Files Modified
- `index.html` — Added Leaderboard.js script tag
- `js/app.js` — Added 'leaderboard' to PROTECTED_PAGES, added route, hooked leaderboard submission into results flow
- `js/components/Layout.js` — Added leaderboard nav item (icon: △)
- `js/services/databaseService.js` — Added leaderboard methods
- `firestore.rules` — Added leaderboard rules
- `firestore.indexes.json` — Added composite index

---

## Deploy Commands

```bash
# Deploy Firestore rules and indexes
firebase deploy --only firestore

# Deploy hosting (if using Firebase Hosting)
firebase deploy --only hosting
```

---

## Known Limitations

1. **Client-submitted scores are trustless** — A malicious user can call the Firestore API directly with fabricated scores. The rules prevent field manipulation and role escalation, but cannot verify that scores were earned legitimately. **Mitigation:** Move score calculation to a Cloud Function.

2. **No rate limiting** — Users could spam leaderboard updates. Firestore has per-document rate limits, but not per-user. **Mitigation:** Add Cloud Function with rate limiting.

3. **No admin UI** — Admins can delete entries via the rules, but there's no UI for it. **Mitigation:** Build admin dashboard.

4. **Week boundary edge case** — If a user submits a score near the week boundary (Sunday/Monday UTC), it might go into the wrong week. This is acceptable for now but could be improved with timezone-aware weeks.
