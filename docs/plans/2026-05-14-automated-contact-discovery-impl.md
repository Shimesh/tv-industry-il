# Automated Contact Discovery v2.3.0 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-discover contacts from production boards (cron + on-save), assign ghost avatars to auto-created entries, log new discoveries in the admin panel, and ship as v2.3.0.

**Architecture:** The existing `syncContactsFromSavedProductions()` in `contactsSync.ts` already handles all deduplication and contact creation. This plan wires automation (Vercel Cron + on-save trigger), adds `isGhost`/`ghostAvatarSeed` fields to new contacts, writes per-person records to a new `contact_discoveries` Firestore collection, and surfaces them on the admin main page.

**Tech Stack:** Next.js 15 App Router, TypeScript, Firebase Admin SDK (server), Firestore REST API (`firestoreAdminRest.ts`), Tailwind CSS 4, Vercel Cron.

---

## Task 1: Add `ContactDiscovery` type to `adminTypes.ts`

**Files:**
- Modify: `src/lib/adminTypes.ts`

**Step 1: Add type at end of file**

```typescript
export type ContactDiscovery = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  sourceBoard: string;
  sourceBoardName: string | null;
  contactId: string;
  createdAt: string;
  discoveryDate: string;
};
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/lib/adminTypes.ts
git commit -m "feat: add ContactDiscovery type"
```

---

## Task 2: Extend `contactsSync.ts` — ghost fields + discovery log

**Files:**
- Modify: `src/lib/server/contactsSync.ts`

This is the core task. Four changes in one file.

**Step 1: Add ghost seed helper after `nowIso()`**

Find the `function nowIso()` block (around line 158) and add immediately after:

```typescript
function ghostSeed(name: string): number {
  return name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 8;
}
```

**Step 2: Add ghost fields to `buildContactPatch` — only for new contacts**

In `buildContactPatch`, the function already checks `const createdAt = existing ? undefined : nowIso();`.
Add ghost fields right after that line:

```typescript
const ghostFields = existing ? {} : { isGhost: true, ghostAvatarSeed: ghostSeed(candidate.normalizedName) };
```

Then add `...ghostFields,` to the returned object (before the closing `}`):

```typescript
  return {
    firstName: ...,
    // ... all existing fields ...
    ...(createdAt ? { createdAt } : {}),
    ...ghostFields,
  };
```

**Step 3: Add `writeDiscoveries` helper after `SafeFirestoreBatchWriter` class**

Import `createDocument` — it's already imported from `firestoreAdminRest`. Add this helper function:

```typescript
async function writeDiscoveries(
  entries: Array<{
    name: string;
    phone: string | null;
    role: string;
    sources: string[];
    contactId: string;
  }>,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await Promise.allSettled(
    entries.map((entry) => {
      const sourceBoard = entry.sources[0] || 'schedule';
      const sourceBoardName =
        sourceBoard === 'global_productions' ? 'הפקות גלובלי' : 'לוח הפקה';
      return createDocument(
        'contact_discoveries',
        {
          name: entry.name,
          phone: entry.phone ?? null,
          role: entry.role,
          sourceBoard,
          sourceBoardName,
          contactId: entry.contactId,
          createdAt: new Date().toISOString(),
          discoveryDate: today,
        } as Record<string, unknown>,
      );
    }),
  );
}
```

Note: `createDocument` signature is `createDocument(collectionPath, data, documentId?)` — omit `documentId` to let Firestore auto-generate it.

**Step 4: Collect discoveries in the main loop and write after commit**

In `syncContactsFromProductions`, find the `const sampleMissing` array declaration (around line 559) and add below it:

```typescript
const discoveryQueue: Array<{
  name: string;
  phone: string | null;
  role: string;
  sources: string[];
  contactId: string;
}> = [];
```

Then inside the `if (!existing)` block (after `writer?.set(...)` and the `createdRecord` lines), add:

```typescript
if (applyChanges) {
  discoveryQueue.push({
    name: candidate.normalizedName,
    phone: candidate.normalizedPhone,
    role: candidate.role,
    sources: candidate.sources,
    contactId: docId,
  });
}
```

Then after `await writer?.commit();` (near the end of the function), add:

```typescript
if (applyChanges && discoveryQueue.length > 0) {
  await writeDiscoveries(discoveryQueue);
}
```

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 6: Commit**

```bash
git add src/lib/server/contactsSync.ts
git commit -m "feat: add ghost fields and discovery log writes to contacts sync"
```

---

## Task 3: Create Vercel Cron endpoint

**Files:**
- Create: `src/app/api/cron/contacts-discovery/route.ts`
- Create: `vercel.json`

**Step 1: Create the cron route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { syncContactsFromSavedProductions } from '@/lib/server/contactsSync';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncContactsFromSavedProductions(true);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[cron/contacts-discovery]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron failed' },
      { status: 500 },
    );
  }
}
```

**Step 2: Create `vercel.json` at project root**

```json
{
  "crons": [
    {
      "path": "/api/cron/contacts-discovery",
      "schedule": "0 * * * *"
    }
  ]
}
```

This runs every hour on the hour. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` where `CRON_SECRET` is set in Vercel project settings.

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/app/api/cron/contacts-discovery/route.ts vercel.json
git commit -m "feat: add Vercel cron job for hourly contact discovery"
```

---

## Task 4: On-save trigger in `/api/productions/global`

**Files:**
- Modify: `src/app/api/productions/global/route.ts`

**Step 1: Add import at top of file**

After the existing imports, add:

```typescript
import { syncContactsFromProductions } from '@/lib/server/contactsSync';
import type { GlobalProductionInput } from '@/lib/server/contactsSync';
```

Wait — `GlobalProductionInput` is a local type in `contactsSync.ts`, not exported. Instead, we pass the raw productions list inline. The function `syncContactsFromProductions` accepts `ProductionInput[]` + `GlobalProductionInput[]`. We'll use the second argument.

Actually, the cleanest approach: call `syncContactsFromSavedProductions(true)` in the background after the POST writes complete, since the newly written docs are now in Firestore. This re-scans everything but is simpler.

Replace the import with just:

```typescript
import { syncContactsFromSavedProductions } from '@/lib/server/contactsSync';
```

**Step 2: Add background sync after successful writes in POST handler**

Find the `return NextResponse.json({ success: true, count, errors });` at the end of the POST handler. Before it, add:

```typescript
  // Fire-and-forget: sync new crew into contacts
  if (count > 0) {
    void syncContactsFromSavedProductions(true).catch((err) =>
      console.error('[api/productions/global] background sync error:', err),
    );
  }
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/app/api/productions/global/route.ts
git commit -m "feat: trigger contact sync on-save when global_productions updated"
```

---

## Task 5: Ghost avatar in `UserAvatar.tsx`

**Files:**
- Modify: `src/components/UserAvatar.tsx`

**Step 1: Add `isGhost` prop to the interface**

```typescript
interface UserAvatarProps {
  name: string;
  photoURL?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  isGhost?: boolean;
  className?: string;
}
```

**Step 2: Add ghost icon sizes map after `dotSizeMap`**

```typescript
const ghostIconSizeMap = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-7 h-7',
  xl: 'w-10 h-10',
};
```

**Step 3: Add ghost branch in the render, after destructuring props**

Update the function signature to destructure `isGhost`:

```typescript
export default function UserAvatar({ name, photoURL, size = 'md', isOnline, isGhost, className = '' }: UserAvatarProps) {
```

Replace the `return` block so the fallback (no imageSrc) renders the ghost when `isGhost` is true:

```typescript
  return (
    <div className={`relative shrink-0 ${className}`}>
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={name}
          className={`${sizeMap[size]} rounded-full object-cover ring-2 ring-[var(--theme-border)]`}
          referrerPolicy="no-referrer"
          onError={() => setFailedPhotoURL(imageSrc)}
        />
      ) : isGhost ? (
        <div className={`${sizeMap[size]} rounded-full bg-slate-700/80 flex items-center justify-center ring-2 ring-slate-500/40 animate-pulse`}>
          <svg
            className={`${ghostIconSizeMap[size]} text-slate-400`}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2a7 7 0 0 1 7 7v1.06l1.82 2.73A1 1 0 0 1 20 14h-1v2a1 1 0 0 1-1 1h-1v2a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-2H6a1 1 0 0 1-1-1v-2H4a1 1 0 0 1-.82-1.58L5 8.06V8a7 7 0 0 1 7-7z" />
          </svg>
        </div>
      ) : (
        <div className={`${sizeMap[size]} rounded-full bg-gradient-to-br ${colors[colorIdx]} flex items-center justify-center font-bold text-white`}>
          {initials}
        </div>
      )}
      {isOnline !== undefined && (
        <span className={`absolute bottom-0 right-0 ${dotSizeMap[size]} rounded-full border-[var(--theme-bg)] ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
      )}
    </div>
  );
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 5: Commit**

```bash
git add src/components/UserAvatar.tsx
git commit -m "feat: add ghost avatar rendering for auto-discovered contacts"
```

---

## Task 6: Create `/api/admin/contact-discoveries` route

**Files:**
- Create: `src/app/api/admin/contact-discoveries/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { getFirebaseAdminFirestore } from '@/lib/server/firebaseAdmin';
import type { ContactDiscovery } from '@/lib/adminTypes';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const { searchParams } = request.nextUrl;
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  try {
    const db = getFirebaseAdminFirestore();
    const snap = await db
      .collection('contact_discoveries')
      .where('discoveryDate', '==', date)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const discoveries: ContactDiscovery[] = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<ContactDiscovery, 'id'>),
    }));

    return NextResponse.json({ discoveries, date, total: discoveries.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load discoveries' },
      { status: 500 },
    );
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/app/api/admin/contact-discoveries/route.ts
git commit -m "feat: add admin API for contact discoveries log"
```

---

## Task 7: Add "גילויים חדשים" card to Admin main page

**Files:**
- Modify: `src/app/admin/page.tsx`

The admin page is large. This task makes targeted additions only.

**Step 1: Add `ContactDiscovery` to the import from `@/lib/adminTypes`**

Find the existing import:
```typescript
import type { AdminLoginMethod, AdminOverview, AdminRole, AdminUserSummary, PageViewEvent, SystemEventRecord } from '@/lib/adminTypes';
```

Add `ContactDiscovery` to it:
```typescript
import type { AdminLoginMethod, AdminOverview, AdminRole, AdminUserSummary, PageViewEvent, SystemEventRecord, ContactDiscovery } from '@/lib/adminTypes';
```

**Step 2: Add state and fetch logic**

Find the block of `useState` calls near the top of the component (look for `const [toast, setToast]` or similar). Add after the existing state declarations:

```typescript
const [discoveries, setDiscoveries] = useState<ContactDiscovery[]>([]);
const [discoveriesLoading, setDiscoveriesLoading] = useState(false);
```

Find the main `useEffect` that loads the overview data. After the overview fetch completes, add a separate `useEffect` for discoveries (add after the existing overview `useEffect`):

```typescript
useEffect(() => {
  if (!user || profile?.siteRole !== 'admin') return;
  setDiscoveriesLoading(true);
  const today = new Date().toISOString().slice(0, 10);
  user.getIdToken().then((token) =>
    fetch(`/api/admin/contact-discoveries?date=${today}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data: { discoveries?: ContactDiscovery[] }) => {
        setDiscoveries(data.discoveries ?? []);
      })
      .catch(() => {})
      .finally(() => setDiscoveriesLoading(false)),
  );
}, [user, profile?.siteRole]);
```

**Step 3: Add the card JSX**

Find the location in the JSX where the main stats cards are rendered (look for `totalUsers`, `onlineNow`, or `totalContacts` in the JSX). After the stats section, add the discoveries card:

```tsx
{/* גילויים חדשים */}
<section className="w-full rounded-2xl border p-5 space-y-3" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }} dir="rtl">
  <div className="flex items-center gap-2">
    <Contact2 className="w-5 h-5 text-emerald-400" />
    <h2 className="font-bold text-[var(--theme-text)]">גילויים חדשים היום</h2>
    {!discoveriesLoading && (
      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
        {discoveries.length}
      </span>
    )}
    {discoveriesLoading && <span className="text-xs text-[var(--theme-text-secondary)]">טוען...</span>}
  </div>

  {discoveries.length === 0 && !discoveriesLoading && (
    <p className="text-sm text-[var(--theme-text-secondary)]">אין גילויים חדשים היום.</p>
  )}

  {discoveries.length > 0 && (
    <div className="space-y-2 max-h-60 overflow-y-auto">
      {discoveries.map((d) => (
        <div key={d.id} className="flex items-center justify-between text-sm border-b border-[var(--theme-border)] pb-2 last:border-0 last:pb-0">
          <div>
            <span className="font-medium text-[var(--theme-text)]">{d.name}</span>
            <span className="text-[var(--theme-text-secondary)] mr-2">— {d.role || 'ללא תפקיד'}</span>
          </div>
          <span className="text-xs text-emerald-400 shrink-0">{d.sourceBoardName ?? d.sourceBoard}</span>
        </div>
      ))}
    </div>
  )}
</section>
```

Note: `Contact2` is already imported in the file (visible in line 16 of the admin page).

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 5: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: add New Discoveries card to admin panel"
```

---

## Task 8: Version bump to v2.3.0

**Files:**
- Modify: `package.json`
- Modify: `src/components/Footer.tsx`

**Step 1: Update `package.json`**

Find `"version": "2.2.8"` and change to `"version": "2.3.0"`.

**Step 2: Update `Footer.tsx`**

Find `Version 2.2.8 · By Yaron Orbach` and change to `Version 2.3.0 · By Yaron Orbach`.

**Step 3: Commit**

```bash
git add package.json src/components/Footer.tsx
git commit -m "feat: fully automated contact discovery from work-boards v2.3.0"
```

---

## Task 9: Production build verification + deploy

**Step 1: Run production build**

```bash
npx next build
```

Expected: Build completes with no errors. Warnings about `maxDuration` on cron route are fine.

**Step 2: Deploy to Vercel**

```bash
npx vercel --prod --yes
```

Expected: Deployment URL printed, no errors.

**Step 3: Set `CRON_SECRET` in Vercel (if not already set)**

In the Vercel dashboard → Project Settings → Environment Variables, add:
- `CRON_SECRET` = any secure random string (e.g. `openssl rand -hex 32`)

The cron job will use this to authenticate.

**Step 4: Verify cron is registered**

In the Vercel dashboard → Project → Cron Jobs tab, confirm `/api/cron/contacts-discovery` appears with `0 * * * *` schedule.

---

## Summary of new files

| File | Purpose |
|------|---------|
| `vercel.json` | Hourly cron job config |
| `src/app/api/cron/contacts-discovery/route.ts` | Cron endpoint (hourly full sync) |
| `src/app/api/admin/contact-discoveries/route.ts` | Admin API — query today's discoveries |

## Summary of modified files

| File | Change |
|------|--------|
| `src/lib/adminTypes.ts` | + `ContactDiscovery` type |
| `src/lib/server/contactsSync.ts` | + ghost fields, + discovery log writes |
| `src/app/api/productions/global/route.ts` | + background sync on POST |
| `src/components/UserAvatar.tsx` | + `isGhost` prop + animated ghost rendering |
| `src/app/admin/page.tsx` | + "גילויים חדשים" card |
| `package.json` | version `2.3.0` |
| `src/components/Footer.tsx` | version `v2.3.0` |
