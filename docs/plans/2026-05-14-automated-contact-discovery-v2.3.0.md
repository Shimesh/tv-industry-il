# Automated Contact Discovery & Ghost Profiles — v2.3.0

## Goal

Automatically harvest person records from `productions` and `global_productions` boards into the `contacts` collection without any admin action, assign animated ghost avatars to auto-created contacts, and surface a "New Discoveries" audit log on the admin main page.

## Approved Design

### 1. Automation Layer (Option C: Cron + On-Save)

- **Vercel Cron** — `vercel.json` cron calls `POST /api/internal/contacts-maintenance` every hour. Endpoint already exists; needs only the cron config wired.
- **On-save trigger** — `/api/productions/global` route calls `syncContactsFromProductions` for the affected production document after each create/update, server-side.
- Personal productions already handled by `/api/contacts/reconcile` (client-side, already built).

### 2. Ghost Profile Schema & Avatar

Schema additions to `buildContactPatch()` in `contactsSync.ts`:
- `isGhost: true` — set on every newly auto-created contact (cleared when user self-registers and links account)
- `ghostAvatarSeed: number` — 0–7, derived from `normalizedName` hash, picks one of 8 visual variants

Avatar rendering in `UserAvatar.tsx`:
- When `isGhost: true` and no `photoURL`: render an animated pulsing ghost-person silhouette with CSS keyframe animation (radial glow pulse, 2s loop)
- Ghost badge visible in Alfon directory immediately

### 3. New Discoveries Log

New Firestore collection `contact_discoveries`:
```
{
  id: string               // auto
  name: string             // display name
  phone: string | null
  role: string
  sourceBoard: string      // e.g. "global_productions" or "productions/{uid}/weeks/{wk}"
  sourceBoardName: string | null  // e.g. "הרצליה" if available
  contactId: string        // contacts/ doc ID
  createdAt: string        // ISO
  discoveryDate: string    // YYYY-MM-DD for daily queries
}
```

Write discovery records inside `syncContactsFromProductions` when `applyChanges === true` and a new contact is created.

New API: `GET /api/admin/contact-discoveries?date=YYYY-MM-DD` (admin-only).

### 4. Admin Panel — "גילויים חדשים" Card

New section on `/admin` main page (below stats):
- Header: "גילויים חדשים היום" + count badge
- Scrollable list: `"נוסף [name] מ[sourceBoard] — [role]"`
- Shows today's entries, max 20

### 5. Anti-Duplication

No changes needed — phone-first matching already implemented in `contactsSync.ts` via `byPhone`, `byComposite`, `byNameWithPhone`, `byNameWithoutPhone` indexes.

### 6. Version & Deploy

- `package.json` version: `2.3.0`
- `Footer.tsx` version string: `v2.3.0`
- Commit: `feat: fully automated contact discovery from work-boards v2.3.0`
- Deploy: `npx vercel --prod --yes`

## Files to Create

| File | Purpose |
|------|---------|
| `vercel.json` | Cron job config |
| `src/app/api/admin/contact-discoveries/route.ts` | GET discoveries by date |

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/server/contactsSync.ts` | Add `isGhost`, `ghostAvatarSeed`, discovery log writes |
| `src/lib/adminTypes.ts` | Add `ContactDiscovery` type |
| `src/app/api/productions/global/route.ts` | Trigger on-save sync |
| `src/components/UserAvatar.tsx` | Ghost avatar rendering |
| `src/app/admin/page.tsx` | "גילויים חדשים" card |
| `package.json` | Version bump to 2.3.0 |
| `src/components/Footer.tsx` | Version bump to v2.3.0 |
