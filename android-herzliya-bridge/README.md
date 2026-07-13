# Herzliya Bridge Android

אפליקציית Android קטנה שמריצה את חילוץ יומן הרצליה בתוך `WebView` נשלט.

המטרה: לפתוח את קישור `ShowEmp6`, ללחוץ בפועל על כל הפקות `openmd2(id)`, לקרוא את כל פופ־אפי `ShowCrew`, ולשלוח חבילה אחת ל־`/api/admin/calendar-phone-bridge/ingest`.

## פתיחה מאנדרואיד סטודיו

1. פתח את התיקייה:
   `android-herzliya-bridge`
2. סנכרן Gradle.
3. חבר Pixel 7 Pro עם USB debugging.
4. הרץ את `app`.

## שימוש

הדרך המומלצת היא מהממשק:

1. פתח `/admin/calendar-phone-bridge`.
2. הדבק הודעת/לינק הרצליה.
3. צור הפעלת טלפון חדשה.
4. לחץ על "פתח באפליקציית Android".

האפליקציה תקבל את:

- `url` — קישור היומן המלא.
- `token` — טוקן גשר זמני.
- `ingestUrl` — endpoint לשמירת החבילה.

אפשר גם להדביק אותם ידנית באפליקציה.
