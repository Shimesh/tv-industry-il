# Weekly Calendar Widget — Personal Schedule Design
Date: 2026-03-27

## Goal
Upgrade the homepage WeeklyCalendarWidget to show the logged-in user's personal shifts with an orange highlight, and open a day-detail popup when clicking a working day.

## Architecture & Data Flow

```
WeeklyCalendarWidget
  ├── useAuth() → profile.displayName, profile.phone
  ├── Phase 1 (instant): localStorage productions_cache_v2[weekId]
  ├── Phase 2 (background): Firestore productions/global/weeks/{weekId}/productions
  │     → silently updates state when done
  └── filterMyProductions(productions, profile)
        → isCurrentUserShift === true
        OR crew[].name includes profile.displayName
        OR crew[].normalizedPhone === normalize(profile.phone)
```

## User Identity Matching (3 layers)
1. `production.isCurrentUserShift === true` (stored flag)
2. `crew[].name` includes `profile.displayName` (or vice versa)
3. `crew[].phone` normalized matches `profile.phone` normalized

## UI States

| Day Type | Background | Top border | Content |
|---|---|---|---|
| No productions | transparent | none | grey dot |
| Productions (not mine) | transparent | none | production name chip (grey) |
| My shift | `rgba(251,146,60,0.12)` | 2px orange | production name chip (orange) |
| Today | purple circle on number | purple gradient | same as above |
| Today + my shift | both | purple + orange | both styles |
| Past day | 40% opacity | none | same |

## Popup Design
- Triggered by clicking any day that has productions
- Clicking empty day → no-op
- Shows ALL productions for that day
- My productions highlighted orange, others neutral
- Each production row: name, time, studio, user's role in that production
- Footer: "לצפייה בלוח המלא" → /productions
- Close: X button, ESC key, backdrop click

## Performance
- Phase 1: localStorage read, 0ms, shown immediately
- Phase 2: Firestore read in background useEffect, updates state silently
- No loading spinner — stale data is better than blank
- Not authenticated → show all productions without personal highlighting

## Files to Modify
- `src/components/WeeklyCalendarWidget.tsx` — full rewrite
