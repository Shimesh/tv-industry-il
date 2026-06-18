# Production Calendar Sync System — Complete Reference

> **Use this skill before touching any code related to:**
> productions, calendar, Herzliya sync, crew, global_productions, widgets, rebuild, resync, deduplication, vacation filter, IDs.
>
> When a bug appears: identify which process in this document is responsible, then fix ONLY that process's code.

---

## 1. Architecture Overview

```
Herzliya (MagicXPA)          Firestore                     Frontend
────────────────────         ─────────────────────────     ─────────────────
ShowEmp3 (personal)  ──┐     global_productions/{id}  ──→  productions page
ShowFmp/ShowEmp6     ──┼──→  user_calendar_sync/{uid}      widget
  (dept, ,-Atrue)   ──┤     productions/{uid}/weeks/…      admin panel
ShowCrew (popup)     ──┤     calendar_sync_snapshots/
sendwa.html (GUID)   ──┘     scheduleRequests/          ←── paste message
                              userSchedules/{uid}/weeks/
```

**Two sync paths:**
- **API path** (`herzliyaSync.ts`): triggered by save-sync-url / resync button / hourly cron
- **GitHub Action path** (`functions/calendar-sync.cjs`): triggered by user pasting a message (creates `scheduleRequests` doc)

---

## 2. Firestore Collections

### `global_productions/{id}`
Unified, merged production index. ONE document per production (identified by herzliyaId or generateProductionId hash).

Key fields:
- `id`: String(herzliyaId) OR generateProductionId hash
- `herzliyaId`: number (Herzliya's internal production ID)
- `name`, `studio`, `date` (YYYY-MM-DD), `day`, `startTime`, `endTime`, `status`
- `crew_list[]`: `{name, profession, phone_number, normalizedPhone, shadowKey, startTime, endTime}`
- `crew_phones[]`: flat normalized phones — supports `ARRAY_CONTAINS` queries
- `crew_shadow_keys[]`: `"normName::normRole"` for phoneless crew — supports `ARRAY_CONTAINS`
- `lastUpdatedAt`, `lastUpdatedBy`, `sourceWeekPath`, `crewSource`

**Firestore indexes required:** date range + crew_phones ARRAY_CONTAINS, date range + crew_shadow_keys ARRAY_CONTAINS.

### `user_calendar_sync/{uid}`
Per-user Herzliya sync config. Written by `/api/calendar/save-sync-url`.

Key fields: `uid`, `url` (sendwa.html or ShowEmp3 URL), `workerName`, `sessionCookie`, `herzliyaUser`, `herzliyaPass`, `savedAt`, `weekStart`, `lastSyncAt`, `lastSyncStatus`, `lastSyncCount`, `lastSyncError`

### `productions/{uid}/weeks/{weekId}/productions/{prodId}`
Personal schedules. Source of truth for user's own edits. Written by the productions page via REST PATCH.

### `calendar_sync_snapshots/{runId}/entries/`
Audit trail. Snapshot of before/after state for every production during sync.

---

## 3. Production ID Scheme

**CRITICAL: IDs must be consistent across users for mergeGlobalProduction to work.**

| Source | ID Value | When Used |
|--------|----------|-----------|
| Herzliya openmd2 event | `String(herzliyaId)` (e.g. `"12345"`) | Preferred — always use this |
| No herzliyaId available | `generateProductionId(name, date, studio, startTime)` | Fallback only |

**Assignment pipeline** (in `fetchHerzliyaProductions`, line 714):
```typescript
id: prod.herzliyaId ? String(prod.herzliyaId) : (prod.id || generateProductionId(...))
```

**Enrichment loop** (herzliyaSync.ts line 678): for each production from parseScheduleHTML, looks up `nameToId[prod.name]` to find the herzliyaId, then assigns `prod.id = String(herzliyaId)`. This is what aligns IDs across users. If nameToId lookup fails → ID stays as generateProductionId → potential duplicate in global_productions.

**Root cause of duplicates:** nameToId lookup fails when Herzliya event name format doesn't match the parsed production name (e.g. "אסתטיקה 360 - צלם" vs "אסתטיקה 360"). Fix is in `nameToId` building logic (herzliyaSync.ts lines 496-503).

---

## 4. Data Parsing Paths

### ShowCrew popup HTML format
Table structure returned by `ShowCrew` / `openmd2(id)`:
```
Column index:  0        1        2      3         4
Header row:    שעות   | תפקיד | שם   | פרטים  | נייד
Data row ex:   14:00-05:30 | צילום | ירון אורבך | | 054-760-3436
```
**CRITICAL**: First Hebrew cell in a row is the ROLE (תפקיד), NOT the name (שם). Old code that used `findIndex(p => /[א-ת]{2,}/)` always returned the role column. Fixed in v2.8.161 via header-row column detection.

`parseHerzliyaPopupHtml` always delegates to `parseHerzliyaPopupText` (DOMParser unavailable in Node.js). `parseHerzliyaPopupText` now:
1. Replaces `</th>` → `\t` (in addition to `</td>`) so header cells are tab-delimited
2. Preserves empty cells (no `filter(Boolean)`) so column indices stay stable when a cell is empty
3. Scans all rows for one where `row.indexOf('שם') !== -1 && row.indexOf('נייד') !== -1` — those are the header row
4. Uses detected column positions (nameCol, roleCol, phoneCol, timeCol) for all data rows
5. Phone fallback: scans all cells if column value doesn't match `/^0\d{8,9}$/`

### Path A: `parseScheduleHTML` (browser DOMParser or regex server-side)
- Called by: `fetchHerzliyaProductions` with `effectivePersonalHtml` + optional `effectiveDeptHtml`
- Creates productions with: `generateProductionId` ID initially, then enrichment loop assigns `String(herzliyaId)`
- Populates crew from: ShowCrew popup HTML in `popupCache`
- Vacation filter: `productionScheduleParser.ts` line ~871 and ~901

### Path B: Event-based (fallback when all names are "הפקה")
- Triggered when: `parsed.productions.length === 0 OR allGenericNames`
- Source: `extractHerzliyaEventIds(effectivePersonalHtml + deptHtml)` → `events[]`
- ID: always `String(event.herzliyaId)`
- Crew: from `popupCache[event.herzliyaId]` OR workerName fallback
- Vacation filter: herzliyaSync.ts line 629 — `/^(חופש|ביטול|מחלה|שמירה|היעדרות)/i`
- **workerName fallback**: only for events in `personalEventIds` (Set of IDs from personal HTML only) — prevents adding user to dept-only productions

### Path C: `parseManualText` (WhatsApp paste)
- Triggered when: user pastes text into the textarea
- ID: `generateProductionId(name, date, studio, startTime)` — no herzliyaId
- Vacation filter: productionScheduleParser.ts line ~728

### Path D: `rebuildFromPersonalSchedules` (fallback when no Herzliya URLs work)
- Source: Firestore `productions` collection (all users, allDescendants)
- ID: from stored prod.id (whatever was stored when user saved it)
- Vacation filter: rebuild route line ~170

---

## 5. Vacation / Duty-Role Filter — All Locations

Pattern: `/(^|[-–\s/|,])(חופש|ביטול|מחלה|שמירה|היעדרות|טכנאי\s+תורן)/i`

Broad pattern: catches the keyword at start OR after a separator such as " - " (e.g. "צלם - חופש עח שישי"). Previously used `/^.../` which missed role-prefixed names.

**"טכנאי תורן"** is a duty-role entry that appears in the department schedule but is NOT a production. It must be excluded at every filter point:

| # | File | Line | What is filtered |
|---|------|------|------|
| 1 | herzliyaSync.ts | ~631 | Event-based path (Path B) |
| 2 | productionScheduleParser.ts | ~728 | parseManualText (Path C) |
| 3 | productionScheduleParser.ts | ~871 | parseHerzliyaHTMLServer strategy 1 (Path A) |
| 4 | productionScheduleParser.ts | ~901 | parseHerzliyaHTMLServer strategy 2 (Path A fallback) |
| 5 | rebuild/route.ts | ~170 | Safety net before writing to freshProductionMap |
| 6 | rebuild/route.ts | ~250 | Cleanup: deletes existing vacation entries from global_productions by date range |
| 7 | calendar-sync.cjs `DEPT_VACATION_RE` | ~800 | GitHub Action dept loop — blocks "טכנאי תורן" from being written to global_productions |
| 8 | productions/page.tsx `visibleProductions` | ~1442 | Client-side: `/^טכנאי\s+תורן/i` filter before render |
| 9 | WeeklyCalendarWidget.tsx `byDate` | ~428 | Widget client-side: same regex before grouping by day |

**Resync also cleans up:** `syncHerzliyaUrl` now runs a date-range scan after writing and deletes any vacation-named entries in `global_productions` that are not in the current sync batch (same logic as rebuild Step 5).

---

## 6. Process: `fetchHerzliyaProductions`
File: `src/lib/server/herzliyaSync.ts` lines 252–725

**Input:** url, sessionCookie?, herzliyaUser?, herzliyaPass?, workerName?

**Steps:**
1. Fetch `personalHtml` (url) + `deptHtml` (url + `&HSELWEBprgnameShowFmp=1`) in parallel
2. If `sendwa.html` URL AND personalHtml has **no** openmd2: extract GUID from URL A param → build ShowEmp3 URL → try to get session cookie (root init, then ShowEmp3 response cookie)
3. **NEW (v2.8.156)** If `sendwa.html` URL AND personalHtml **does** have openmd2 (productions embedded, no session needed): extract employee GUID from embedded JS (`ShowEmp6&arguments=-N{GUID}`) → build ShowEmp6 URL → fetch dept view → set `effectiveDeptHtml`. Also always sets `effectivePopupBaseUrl = mgrqispi.dll` (not sendwa.html) so ShowCrew calls go to the right endpoint.
4. If still no session and credentials stored: try `herzliyaLogin()` (MagicXPA form login)
5. Extract `magicXpaSession` from HTML
6. Build `events` by merging `extractHerzliyaEventIds(personalHtml)` + `extractHerzliyaEventIds(deptHtml)`. Track `personalHerzliyaIds: number[]` (personal only) — used for: workerName fallback gate + `syncedIds` scoping in `syncHerzliyaUrl`.
7. Fetch ShowCrew for all unique herzliyaIds in parallel → `popupCache`
   - **Primary URL** (when `magicXpaSession` exists): `appname=HsILWEB&prgname=ShowCrew&arguments={session}-N{id}` (session-token path)
   - **Primary URL** (when no `magicXpaSession`): `buildHerzliyaPopupUrl()` → `appname=HsILWeb&prgname=ShowCrew&arguments=-N{id}` (confirmed URL for freelancer sendwa)
   - **Fallback** (when primary returns no table): always tries `buildHerzliyaPopupUrl()` if URL differs from primary
   - **Auto-login retry** (when all popups fail + credentials stored): re-authenticates, retries all failed IDs
8. Enrichment loop: for each prod from parseScheduleHTML, add popup crew + assign herzliyaId
9. If all productions generic (Path B): build from events with popup crew
10. Final ID assignment: `prod.herzliyaId ? String(prod.herzliyaId) : generateProductionId(...)`

**Returns:** `{ productions[], debug: string, finalUrl?, personalHerzliyaIds: number[] }`

---

## 7. Process: `syncHerzliyaUrl`
File: `src/lib/server/herzliyaSync.ts` lines 729–990

**Signature:** `syncHerzliyaUrl(uid, url, sessionCookie?, herzliyaUser?, herzliyaPass?, workerName?, verifiedPhone?)`

**Trigger:** `/api/calendar/save-sync-url` POST, `/api/calendar/resync` POST, `/api/cron/sync-calendar` GET

Both `save-sync-url` and `resync` routes pass `authUser.phoneNumber || undefined` as `verifiedPhone`. The cron route passes `undefined`.

**Steps:**
1. Call `fetchHerzliyaProductions(url, ...credentials, workerName)` → returns productions + `personalHerzliyaIds`
2. Create audit snapshot in `calendar_sync_snapshots/{runId}`
3. For each production: read existing `global_productions/{id}`, record before/after in snapshot
4. Write ALL productions (personal + dept) via `toGlobalProduction()` + `mergeGlobalProduction()` + `patchDocument`
5. **Post-write cleanup** — single date-range scan of `global_productions` for the synced date window:
   - **Vacation cleanup:** delete any doc whose name matches vacation regex and is NOT in the current sync batch
   - **Name-based disown (Case 3):** for any doc NOT in syncedIds, if `workerName` matches a crew entry by name → remove that name entry from `crew_list`/`crew_shadow_keys`/`crew_phones`. Runs **before** Case 2 to cover all IDs including numeric herzliyaIds.
   - **Slug-ID dedup (Case 2):** for any non-numeric-ID doc whose name is a prefix-match of a freshly synced production (same date) → merge crew into numeric-ID entry via `mergeGlobalProduction`, then delete slug doc
6. **NEW (v2.8.157) `syncedIds` scoping**: `syncedIds` contains ONLY productions from the user's PERSONAL schedule (`personalHerzliyaIds`), NOT dept-only productions from ShowEmp6. Productions without herzliyaId (slug-ID from parseScheduleHTML) are always included (they come from personal HTML). This is critical: if all dept productions were in syncedIds, the disown step would skip them and the user's phone would remain in crew_phones for productions they're not personally scheduled for.

7. **Disown step** — remove user's phone from stale productions (productions where user's phone appears but they are NOT personally scheduled):
   - Collect all known phones via `getLinkedProductionIdentity(authUser)` — aggregates from `users/{uid}`, `profiles/{profileId}`, `industry_people/{profileId}`, `contacts/{linkedContactId}`. Also tries `verifiedPhone` and `users/{uid}.phone` directly.
   - Crew fallback: if still no phone found, scan synced productions' crew for an entry matching `workerName` to find the phone
   - For each found phone: query `global_productions` by `crew_phones ARRAY_CONTAINS phone` + **full week date range** (`scanWeekStart` to `scanWeekEnd`) → remove ALL the user's known phones from those docs' `crew_list` and `crew_phones`
   - **Date range is the FULL week** (Sun–Sat via `getCurrentWeekStartIsrael()` + 6 days), NOT just the exact dates of synced productions. Critical: if user only synced Mon+Wed but stale production is on Fri, the old narrow range would miss it.
   - **Why `getLinkedProductionIdentity`:** `authUser.phoneNumber` is null for Google-authenticated users (phone_number only in phone-auth tokens). Profile-linked phone is the reliable source.
8. Background: `syncContactsFromSavedProductions()`

**Slug-ID dedup detail:** `nameSimilar(a, b)` returns true when one name starts-with the other and shortest is ≥3 chars.

**Fallback:** If error → patch `lastSyncStatus: 'error'` and propagate.

---

## 8. Process: Admin Rebuild
File: `src/app/api/admin/productions/rebuild/route.ts`

**Trigger:** POST with admin Firebase token OR CRON_SECRET/ADMIN_SYNC_SECRET header

**Steps (in order):**

**Step 1 — Herzliya (primary):**
- List all `user_calendar_sync` docs with non-empty URL
- For each user: call `fetchHerzliyaProductions` with stored cookie/credentials/workerName
- Filter: skip if `VACATION_RE.test(prod.name)`
- Merge into `freshProductionMap` via `mergeGlobalProduction`

**Step 2 — Fallback (if freshProductionMap empty):**
- `rebuildFromPersonalSchedules(weekStart, weekEnd)` from Firestore
- Unions crew from all users for same production ID

**Step 3 — Write (smart REPLACE/MERGE):**
- For each entry in `freshProductionMap`:
  - If **any crew member has a phone_number** (i.e., real ShowCrew data was fetched) → **REPLACE**: write `enriched` directly to Firestore. This removes stale crew entries (e.g., user incorrectly added by old workerName bug).
  - If **no phone numbers** (all crew from workerName fallback, session expired) → **MERGE**: read existing doc from Firestore, call `mergeGlobalProduction(existing, enriched)`, write result. This preserves crew accumulated from other users.
- Set `lastUpdatedAt=now`, `lastUpdatedBy='rebuild'`

```typescript
const hasShowCrewData = (enriched.crew_list ?? []).some(c =>
  (c as { phone_number?: string }).phone_number?.trim()
);
let finalDoc: GlobalProductionDoc;
if (hasShowCrewData) {
  finalDoc = enriched; // REPLACE — removes stale entries
} else {
  const existingDoc = await getDocument<GlobalProductionDoc>(`global_productions/${id}`).catch(() => null);
  finalDoc = existingDoc ? mergeGlobalProduction(existingDoc, enriched) : enriched; // MERGE
}
```

**Step 4 — Delete generic "הפקה":**
- Query `global_productions` where `name == 'הפקה'`
- Delete if not in `freshProductionMap`

**Step 5 — Delete vacation entries:**
- Query `global_productions` by date range
- Filter client-side: `VACATION_RE_CLEANUP.test(doc.name)`
- Delete if not in `freshProductionMap`

**Step 6 — Optional simulation:**
- If `body.simulatePhone` provided, return all productions matching that phone

**Auth:** Requires `PRIMARY_ADMIN_UID` Firebase token OR CRON_SECRET/ADMIN_SYNC_SECRET bearer token.

---

## 9. Process: User Resync (Refresh Button)
Files: `src/app/productions/page.tsx` handleReload, `src/app/api/calendar/resync/route.ts`

**Trigger:** User clicks "רענן" button

**Steps:**
1. GET user's Firebase token
2. POST `/api/calendar/resync` (no body needed) → reads stored URL+credentials from `user_calendar_sync/{uid}` → runs `syncHerzliyaUrl`
3. Show status: "עודכנו X הפקות" or "טוען מהשרת..."
4. Update `lastSyncAt` display
5. Clear `productionsByWeekRef.current` cache for current week
6. Call `loadExistingWeek(currentWeekId)` → fetch fresh data from 4 APIs
7. Set new productions in state

**Fallback:** If resync fails, continues to step 5-7 (shows old data).

**Cleanup included:** resync now deletes vacation entries and slug-ID duplicates for the synced date range (same as rebuild). The only thing resync does NOT do is delete productions that belong to OTHER users and are no longer in Herzliya.

---

## 10. Process: `loadExistingWeek` (4 API calls)
File: `src/app/productions/page.tsx` lines 523–614

**4 parallel API calls:**
1. `GET /api/productions/personal?weekId={weekId}` — user's personal Firestore schedule
2. `GET /api/productions/week?weekStart={start}&weekEnd={end}` — ALL global_productions for date range (no filter)
3. `GET /api/productions/global?phone={phone}&weekStart={start}&weekEnd={end}` — productions where user's phone is in `crew_phones`
4. `GET /api/productions/global?profileId={id}&weekStart={start}&weekEnd={end}` — productions where `crew_shadow_keys` contains profile identity

**Merge order:**
```
personalRes
  → mergeGlobalProductions(personal, globalRes, displayName)    [name-exact match]
  → mergeGlobalProductions(above,   phoneRes,  displayName)     [phone confirmed]
  → mergeGlobalProductions(above,   profileRes,displayName)     [shadow key confirmed]
  → mark confirmedIds (personalRes + phoneRes ONLY) as isCurrentUserShift=true
  → deduplicateProductionsByIdentity()
```

**IMPORTANT:** `profileRes` (API call 4) is used for enriching name/studio data but is **NOT included in `confirmedIds`**. Name-only matching is unreliable — a user sharing a common name (e.g. "ירון") would be falsely highlighted in productions they don't work on. Only phone-confirmed (`phoneRes`) and personally-scheduled (`personalRes`) productions get `isCurrentUserShift=true`. Same rule applies in `WeeklyCalendarWidget.tsx`.

---

## 11. `mergeGlobalProductions` (client-side)
File: `src/app/productions/page.tsx` lines 208–228

- Productions already in `userIds` → enriched with studio field only, keep existing `isCurrentUserShift`
- Productions NOT in `userIds` → added as "extras" with `isCurrentUserShift: isCrewMatch(crew, displayName)` (exact full-name match)
- After all merges: `confirmedIds` (from phone+profile queries) force `isCurrentUserShift=true`

---

## 12. `mergeGlobalProduction` (server-side)
File: `src/lib/globalProductions.ts` lines 66–100

Merges TWO GlobalProductionDocs (existing + incoming):
- **Name:** Keep non-generic over "הפקה"; incoming wins if both real names
- **Studio/date/time/status:** incoming wins if non-empty
- **Crew:** union by `normalizedPhone` (primary) or `normalizedName::normalizedRole` shadow key
- **crewSource:** prefer 'department' source

---

## 13. `deduplicateProductionsByIdentity` (productions page) + `deduplicateByIdentity` (widget)
Files: `src/app/productions/page.tsx` lines 174–, `src/components/WeeklyCalendarWidget.tsx` lines 106–

**Both functions use the same three-pass logic. They are NOT shared — each file has its own copy. Any change to dedup logic must be applied to BOTH.**

### Pass 1 — time-based key
Key: `canonicalProductionName(name) :: date :: sorted(roundTime30(startTime), roundTime30(endTime))`
- Strips draft qualifiers from name
- Rounds times to 30-min slots to absorb minor differences
- Keeps entry with MORE crew, merges all crew together
- Intentionally keeps different-shift shows separate (19:00-25:00 vs 25:00-15:00)

### Pass 2 — startTime-only key (catches same-production duplicate IDs)
Key: `canonicalProductionName(name) :: date :: roundTime30(startTime)`
- Merges two entries that share name+date+startTime but have different endTimes
- **Root cause it fixes:** same production in Firestore with two IDs (slug-ID "אסתטיקה" and numeric-ID "אסתטיקה 360") having slightly different recorded endTimes (17:30 vs 19:30) → Pass 1 doesn't merge them → Pass 2 does
- Studio guard: only merges when studios are compatible (same or one is empty)
- Takes the LATER endTime and unions crew from both entries
- Productions with different start times are never merged by Pass 2

### Pass 3 — draft deduplication `(לוז לא סופי)`
Key: `canonicalProductionName(name) :: date` (ignoring time entirely)
- Merges a `(לוז לא סופי)` draft entry into its confirmed counterpart when canonName+date match (times often differ between draft and final schedule)
- If a confirmed counterpart exists: crew is merged into it, draft name/times discarded
- If NO confirmed counterpart: draft entry is kept but the `(לוז לא סופי)` qualifier is stripped from the display name
- Uses `DRAFT_RE = /\s*\(לוז לא סופי\)/g`

**Safe editing rules for dedup:**
- Never remove Pass 1 — it protects split-shift shows
- Never remove Pass 2 — it fixes slug-vs-numeric-ID duplicates
- Never remove Pass 3 — it prevents duplicate cards for "אסנהיים" + "אסנהיים (לוז לא סופי)"
- Always edit BOTH files when changing dedup logic

---

## 14. `isProductionAssignedToUser`
File: `src/app/productions/page.tsx` lines 151–170

```
if isCurrentUserShift → true
else check crew for any name matching userNames:
  1. Exact string match
  2. Partial match: ONLY if user's search name is single-word (not if crew entry is single-word)
     → prevents "ירון" in crew from matching "ירון אורבך" as user
```

Used in: myProds filter, calendar menu, weekly summary, widget.

---

## 15. Widget
File: `src/components/WeeklyCalendarWidget.tsx`

**Same 4 APIs** as productions page. Cache: localStorage `productions_global_widget_cache_v3` (30-min TTL). Auto-refresh every 5 minutes or on visibility change.

---

## 16. Cron Job
File: `src/app/api/cron/sync-calendar/route.ts`

**Trigger:** Vercel CRON (hourly), Bearer CRON_SECRET header

**Steps:**
1. List all `user_calendar_sync` docs
2. For each user: `syncHerzliyaUrl()` sequentially (to avoid rate limiting)
3. `migrateGlobalProductions()` — copies personal schedule docs to global_productions
4. Record metrics to `system/calendarSync`

---

## 17. GitHub Action Paste Flow
Files: `.github/workflows/fetch-schedule.yml`, `functions/calendar-sync.cjs`, `scripts/fetch-schedules.js`

**Trigger:** User pastes a WhatsApp message containing their Herzliya sendwa URL → frontend writes to `scheduleRequests/{docId}` with `status: 'pending'`. GitHub Action runs every 5 min and picks up pending docs.

**Key difference from API path:** Runs in GitHub Actions (Node.js + Puppeteer with real Chromium). The API path uses server-side HTML parsing with no browser. This path does TRUE browser automation.

**Steps in `fetchSchedule(browser, url)`:**

1. Open Puppeteer page → navigate to sendwa URL → waits for calendar cells
2. Extract schedule from **personal page** (ShowEmp3): `schedule.productions[]`
   - Each event: `herzliyaId`, `name`, `date`, `startTime`, `endTime`, `crew[]`, `isCurrentUserShift`
3. Load **department page** (same URL, prgname → ShowEmp6, append `,-Atrue`):
   - Extracts ALL dept events including `herzliyaId` from onclick attrs
   - Enriches personal productions with dept crew (existing behavior)
4. **NEW — Full department popup fetch**: for EACH dept event with `herzliyaId`:
   - Calls `POPUP_EVAL_FN` via `departmentContext.evaluate()` → opens `openmd2(id)` popup
   - Extracts crew table with phones
   - Stores in `schedule.allDepartmentProductions[]`
5. Personal popup fetch: for each personal production, opens popup via `context.evaluate(POPUP_EVAL_FN, herzliyaId)` (ShowEmp3 page)

**`POPUP_EVAL_FN`** (module-level const, line 288):
Browser-side async function that calls `openmd2(hId)`, waits for crew table popup, snapshots all table rows. Returns `{ tables[], studio, title, invalid, reason }`. If `openmd2` is not defined → returns `{ reason: 'openmd2_missing' }` (graceful fallback).

**`saveSchedule(schedule, userId, workerName)`:**
1. Saves personal productions to `productions/{uid}/weeks/{weekId}/productions`
2. Saves personal productions to `global_productions` — always **MERGE** at JS level:
   - Reads existing global doc, calls `mergeCrewPreservingExisting(existingCrewList, incomingCrew)` before writing
   - Uses `batch.set(ref, globalFields, { merge: true })` — crew is already merged in JS so Firestore level merge only prevents field deletion
3. Saves `schedule.allDepartmentProductions` to `global_productions` — also **MERGE** at JS level:
   - Pre-fetches ALL existing global docs for dept prod IDs before the loop
   - Calls `mergeCrewPreservingExisting(existingDeptCrewList, incomingCrew)` for each production
   - Skips productions already saved in step 2 (same prodId)
   - Vacation entries (DEPT_VACATION_RE) skipped — pattern includes `טכנאי\s+תורן`
   - **Why JS-level merge is required:** Firestore `{ merge: true }` only prevents other top-level fields from being deleted — it still REPLACES the entire `crew_list` array. Without pre-fetching and merging in JS, each user's dept sync would overwrite the other's crew contribution.

**ShowEmp6 herzliyaId availability:**
The code tries to extract `openmd2(\d+)` from onclick attrs in ShowEmp6. If ShowEmp6 doesn't expose them (`herzliyaId = 0`), popup fetch is skipped for that event — it's saved with BR-parsed crew only (no phones, MERGE semantics). The personal productions are unaffected either way.

**Consequences of paste:** 
- ALL ~34 dept productions written to global_productions (not just the 5 personal ones)
- If ShowCrew session is alive: full crew + phones for all → REPLACE semantics
- If session expired: names only from BR parsing → MERGE semantics
- Production IDs: `String(herzliyaId)` if available, else `createVisibleProductionId(name, date, studio, startTime)`

---

## 18. Common Bugs & Root Causes (was 17)

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Duplicate production in UI | Two different IDs in global_productions (herzliyaId vs generateProductionId) | syncHerzliyaUrl now runs name-similarity scan after write and merges+deletes slug entries |
| Vacation entry persists after resync | Fixed: syncHerzliyaUrl now runs Firestore cleanup for the synced date range | If still visible, run admin rebuild (covers all users' date ranges) |
| User appears in wrong production (partial match) | Partial name match too loose | `isProductionAssignedToUser`: only partial-match when user's target is single-word |
| User appears in wrong production (stale crew) | Old workerName bug (before personalEventIds gate) added user to dept-only productions; data persists via MERGE | Run admin rebuild — it will REPLACE crew if ShowCrew returns phone data, cleaning up the stale entry |
| Production has only 1 crew member | No ShowCrew session → workerName only | Get valid session for that user's sendwa URL |
| "הפקה" generic name overwrites real name | `mergeGlobalProduction` name logic | Fixed: preserve non-generic name over "הפקה" |
| Crew not merging across users | Production ID mismatch | Ensure herzliyaId assignment in enrichment loop covers all name formats |
| phone-matched production not highlighted | `isCurrentUserShift` not set | `confirmedIds` post-merge step forces it true for phoneRes+profileRes |
| User appears in all dept productions (ShowFmp) | workerName fallback ran for dept-only events | Fixed: `personalEventIds` gate prevents it |
| Calendar didn't update after paste (user saw nothing) | `firestoreRestWrite` was fire-and-forget → `docId` stayed `''` → polling guard `if (!docId) return` skipped every tick → `applyLoadedProductions` never called | Fixed (v2.8.143): `firestoreRestWrite` is now `await`-ed before polling starts |
| Progress banner hidden during Action wait | `{fetchProgress && loading && ...}` — `setLoading(false)` is called before `submitScheduleRequest` in URL path → banner always hidden | Fixed (v2.8.143): removed `loading &&` guard |
| Pasted text disappears from textarea | `handlePaste` only called `setText()` inside the `if (info.url \|\| info.weekStart)` block → controlled component reverted to empty | Fixed (v2.8.143): `setText(pastedText)` called unconditionally; detection card shown when name found even without URL |
| No warning when pasted message has no URL | Detection card didn't appear at all if no URL/dates | Fixed (v2.8.143): show card when worker name detected; display amber warning + disable submit button |
| "אסנהיים" + "אסנהיים (לוז לא סופי)" appear as two separate cards | Two Firestore docs with same canonName+date but different startTimes (draft uses approximate times) → passes 1 and 2 don't catch this | Fixed (v2.8.144): Pass 3 in deduplicateProductionsByIdentity and deduplicateByIdentity merges draft into confirmed counterpart, or strips qualifier if no counterpart |
| "טכנאי תורן" appears as a production card | Duty-role entry from dept schedule written to global_productions; no client filter | Fixed (v2.8.144): DEPT_VACATION_RE in calendar-sync.cjs now blocks it server-side; visibleProductions and byDate filter it client-side |
| User still appears in מונדיאל (or other stale production) | global_productions not updated after crew was wrongly assigned; MERGE semantics preserved stale data | Fixed (v2.8.144): personal batch in calendar-sync.cjs now uses REPLACE (not MERGE) when crew has phone numbers — clears stale entries on next paste |
| Widget shows stale/wrong productions after calendar page was updated | WeeklyCalendarWidget.tsx had only 2-pass dedup and no טכנאי תורן filter | Fixed (v2.8.144): widget now has Pass 3 draft-merge and byDate exclusion for טכנאי תורן |
| User highlighted in production they don't work on (name match) | `profileRes` included in `confirmedIds` — name-only matching causes false positives for common names | Fixed (v2.8.147+): `profileRes` removed from `confirmedIds` in both productions/page.tsx and WeeklyCalendarWidget.tsx. Only `phoneRes` + `personalRes` set `isCurrentUserShift=true` |
| Disown step doesn't remove stale phone after resync | `users/{uid}.phone` empty + `authUser.phoneNumber` null for Google-auth users | Fixed (v2.8.150): disown now uses `getLinkedProductionIdentity()` to collect phones from ALL linked sources (profiles, industry_people, contacts). Runs query for each phone found. |
| Dept batch overwrites crew from other users | `{ merge: true }` in Firestore only prevents field deletion, still replaces the `crew_list` array | Fixed (v2.8.149): dept batch in calendar-sync.cjs pre-fetches existing global docs and uses `mergeCrewPreservingExisting()` before writing — same approach as personal batch |
| Personal batch REPLACE wiped accumulated crew | REPLACE semantics (when freshHasPhones) discarded crew written by other users | Fixed (v2.8.147+): personal batch always uses MERGE + JS-level `mergeCrewPreservingExisting()`. Disown step handles cleanup of stale personal entries instead |
| מונדיאל/stale production still highlighted after resync | Case 3 (name-based disown) phone filter was INVERTED: `filter(p => !updatedCrewList.some(m => m.normalizedPhone === p))` kept the removed worker's phone and removed all others. Phone remained in `crew_phones` → `phoneRes` query still found production → still highlighted | Fixed (v2.8.152): filter now extracts `normalizedPhone` of removed crew entries and removes exactly those phones from `crew_phones` |
| Disown misses productions on days user has no Ashheim shift | Date range for disown/cleanup used exact sync dates (e.g. Mon+Wed), missing stale production on Tue/Thu/Fri | Fixed (v2.8.152): date range scan and phone-based disown now use full 7-day week range (`scanWeekStart` to `scanWeekEnd`) instead of `syncDates[0]..syncDates[last]` |
| sendwa.html with embedded openmd2: only 5-6 personal productions get ShowCrew, not all 41 dept | sendwa.html that has openmd2 directly in HTML skipped the sendwa-specific branch (line 309 condition `!personalHtml.includes('openmd2')` false). deptUrl = sendwa + ignored param → deptHtml = personalHtml. effectivePopupBaseUrl = sendwa URL (wrong for ShowCrew). | Fixed (v2.8.156): new block after sendwa branch — extracts employee GUID from embedded JS regex `/ShowEmp[36]&arguments=-N([0-9A-Fa-f-]{20,50})/i`, constructs ShowEmp6 URL, fetches dept view. Also always sets `effectivePopupBaseUrl = mgrqispi.dll` for sendwa URLs. |
| User highlighted in ALL dept productions after ShowEmp6 enabled (false positive) | ShowEmp6 fetches 41 dept productions, all 41 go into `syncedIds = new Set(productions.map(p => p.id))`. Disown step skips all of them (`if syncedIds.has(docId) return`). If ShowCrew for any dept production includes the user's phone (even if wrong assignment in source), their phone is added and disown never removes it. | Fixed (v2.8.157): `syncedIds` now computed from `personalHerzliyaIds` only. Dept-only productions (not in user's personal sendwa schedule) are NOT in syncedIds → disown runs for them → phone removed after each sync. Immediate one-time patch via `GET /api/admin/disown-user?uid=<uid>&secret=<secret>`. |
| ShowCrew popup returns no data — only worker themselves appears (freelancer sendwa) | Primary ShowCrew URL built with `appname=HsILWEB` (wrong case). Confirmed appname for this server is `HsILWeb`. For freelancer sendwa pages, `magicXpaSession = ''` (no session token in HTML or URL). Fallback to `buildHerzliyaPopupUrl()` (correct appname) was gated by `if (magicXpaSession)` → never ran. Result: all popup calls fail silently, only workerName fallback crew appears. | Fixed (v2.8.159): when `magicXpaSession` is empty → use `buildHerzliyaPopupUrl()` directly as primary (appname=HsILWeb). Removed `if (magicXpaSession)` guard from fallback — fallback now always runs if URL differs. Cookie from fetching sendwa.html is sufficient for ShowCrew on same server. |
| Widget not highlighted orange / crew_phones empty even when ShowCrew succeeds | When ShowCrew fails, workerName fallback crew entry has `phone: ''`. `crew_phones` stays empty → widget query returns nothing. `verifiedPhone` from Firebase auth is null for Google-only users. | Fixed (v2.8.160): `syncHerzliyaUrl` now fetches user phone from `users/{uid}` and `profiles/{uid}` after parsing. Enriches any crew entry with `phone=''` where `name === workerName || isCurrentUser === true`. |
| Crew list shows wrong names — roles appear as names, names appear as roles | `parseHerzliyaPopupText` (always used server-side, DOMParser=undefined in Node.js) found the first Hebrew cell as "name" using `findIndex(p => /[א-ת]{2,}/)`. But column 1 (תפקיד/role) is always Hebrew and comes before column 2 (שם/name). Result: role="ירון אורבך", name="צילום". phones were correct. | Fixed (v2.8.161): `parseHerzliyaPopupText` now detects the header row (row containing "שם" AND "נייד"), records column indices (nameCol, roleCol, phoneCol, timeCol), and uses those for all data rows. Also handles `</th>` tags and preserves empty cells so column positions don't shift. |

---

## 19. Button → Action Map

| Button | Location | What it calls | What it does |
|--------|----------|---------------|--------------|
| רענן | productions page header | POST /api/calendar/resync + loadExistingWeek | Re-sync user's Herzliya URL, reload data |
| שמור לינק (save-sync-url modal) | productions page | POST /api/calendar/save-sync-url | Saves URL+credentials, runs syncHerzliyaUrl |
| הרץ שנוי (admin panel) | admin panel | POST /api/admin/productions/rebuild | Full rebuild: all users, all steps, vacation cleanup |
| הרץ (per-user in admin) | admin panel | POST /api/calendar/resync for specific user | Single-user resync |
| Google Calendar שמור לינק | productions page | POST /api/google/calendar | Saves Google Calendar URL |

**Admin one-time utilities:**
- `GET /api/admin/disown-user?uid=<UID>&secret=<ADMIN_SECRET>` — removes user's phone from ALL `global_productions` crew_phones for the current week. Use when a user's phone is stuck in productions they're not scheduled for. The user's next normal sync will re-add them to their legitimate productions (protected by personalHerzliyaIds gate).
- `GET /api/admin/cleanup-productions?secret=<s>` — deletes draft-qualifier productions superseded by clean versions.

---

## 20. UI Text Policy

**Do NOT write "הרצליה" in any user-facing UI string** — use neutral alternatives:
- "לוח השידורים" instead of "לוח הרצליה"
- "שרת השידורים" instead of "שרת הרצליה"
- "לוח ההפקות" or "שידורים" as generic terms

The word "הרצליה" may appear in code (variable names, regex patterns, comments, `isHerzliyaHTML`, `rawHtmlHasHerzliyaUrl`) — that is fine. It must NOT appear in `setFetchProgress`, `setStatusMessage`, button labels, or placeholder text in the productions, teams, or any other user-facing page.

---

## 21. Safe Editing Rules

1. **Never change ID assignment logic** without verifying it produces `String(herzliyaId)` — any deviation creates duplicates.
2. **Always add vacation filter** (`/(^|[-–\s/|,])(חופש|ביטול|מחלה|שמירה|היעדרות)/i`) to ALL new parsing code paths. Use the broad pattern — `/^.../` misses role-prefixed names like "צלם - חופש עח שישי".
3. **mergeGlobalProduction is additive** — it only adds crew, never removes. To fix bad data, run rebuild (which REPLACEs when real ShowCrew data is available, or MERGEs when only workerName fallback was used).
4. **deduplicateProductionsByIdentity** relies on times matching within 30min. Don't change roundTime30 rounding without testing all split-shift scenarios.
5. **resync now cleans up** vacation entries and slug-ID duplicates for the synced date range. For cross-user stale data (other users' productions no longer in Herzliya) → need admin rebuild.
6. **personalEventIds gate** must be maintained when modifying the event-based path. Without it, workerName fallback spreads user to all dept productions.
7. **crew_phones and crew_shadow_keys** must be flat arrays (for Firestore ARRAY_CONTAINS). Never store as nested objects.
8. **ID consistency test**: after any change to fetchHerzliyaProductions, verify that the same Herzliya event produces identical IDs when fetched by two different users.
9. **`syncedIds` must use `personalHerzliyaIds` only** — never include all productions. If you add new production sources (ShowEmp6, dept fetches), those productions must NOT be in syncedIds, otherwise disown never runs for them and users get false-positive highlights in productions they're not personally scheduled for.
10. **github action vs HTTP sync distinction**: `calendar-sync.cjs` uses CSS class `.sat` to identify personal events (`isCurrentUserShift`) — dept events from ShowEmp6 have class `.event` and are never marked personal. `herzliyaSync.ts` uses `personalHerzliyaIds` for the same gate. Both must be maintained independently — they are NOT shared code.
