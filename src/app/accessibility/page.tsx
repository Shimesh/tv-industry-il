import type { Metadata } from 'next';
import { LegalDocumentPage, LegalSection } from '@/components/LegalDocumentPage';

export const metadata: Metadata = {
  title: 'הצהרת נגישות - TV Industry IL',
  description: 'הצהרת נגישות באתר תעשיית הטלוויזיה הישראלית - TV Industry IL',
};

export default function AccessibilityPage() {
  return (
    <LegalDocumentPage title="הצהרת נגישות">
      <p>
        אנו ב-תעשיית הטלוויזיה הישראלית - TV Industry IL רואים חשיבות עליונה במתן שירות שוויוני ונגיש לכלל משתמשי האינטרנט, לרבות אנשים עם מוגבלויות.
      </p>

      <LegalSection title="אמצעי הנגישות באתר:">
        <ul className="list-disc space-y-2 pr-6">
          <li>הותקן רכיב נגישות המאפשר שליטה בגודל הטקסט, ניגודיות הצבעים, עצירת אנימציות והדגשת קישורים.</li>
          <li>האתר נבנה בצורה המאפשרת ניווט תקין באמצעות המקלדת (מקש Tab).</li>
          <li>הוספנו, ככל הניתן, תגיות ARIA וטקסט חלופי לתמונות.</li>
        </ul>
      </LegalSection>

      <LegalSection title="סייגים לנגישות:">
        <p>מכיוון שהאתר שואב חלק מהמידע ממקורות חיצוניים ומציג מסמכים שנוצרו על ידי צדדים שלישיים, ייתכן שחלק מהתכנים לא יהיו נגישים באופן מלא.</p>
      </LegalSection>

      <LegalSection title="יצירת קשר בנושא נגישות:">
        <p>אם נתקלת בבעיית נגישות באתר, נשמח אם תעדכן אותנו כדי שנוכל לתקנה.</p>
        <p>
          דוא&quot;ל:{' '}
          <a className="font-semibold text-[var(--theme-accent)] underline-offset-4 hover:underline" href="mailto:yaron.orb@gmail.com">
            yaron.orb@gmail.com
          </a>
        </p>
        <p>
          טלפון / ווצאפ:{' '}
          <a className="font-semibold text-[var(--theme-accent)] underline-offset-4 hover:underline" href="https://wa.me/972547603436" target="_blank" rel="noopener noreferrer">
            054-7603436
          </a>
        </p>
      </LegalSection>
    </LegalDocumentPage>
  );
}
