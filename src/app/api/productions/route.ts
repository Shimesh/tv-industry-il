import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

/**
 * AI-powered production schedule parser
 * Takes raw text/CSV content and uses Claude to extract structured production data
 */
export async function POST(request: NextRequest) {
  try {
    const { content, fileName } = await request.json();

    if (!content) {
      return NextResponse.json({ error: 'לא התקבל תוכן לפרסור' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'מפתח API של Anthropic לא מוגדר' }, { status: 500 });
    }

    const systemPrompt = `אתה עוזר מומחה בפרסור לוחות הפקות טלוויזיה בישראל.
תפקידך לקבל תוכן גולמי מקובץ (Excel, CSV, או טקסט חופשי) ולהפוך אותו למבנה JSON מסודר.

עליך לזהות את הפרטים הבאים מכל שורה/הפקה:
- name: שם ההפקה/תוכנית
- date: תאריך בפורמט YYYY-MM-DD
- startTime: שעת התחלה בפורמט HH:MM
- endTime: שעת סיום בפורמט HH:MM
- location: מיקום/כתובת
- studio: שם האולפן
- notes: הערות נוספות
- crew: מערך של אנשי צוות, כל אחד עם:
  - name: שם מלא
  - role: תפקיד (צלם, קול, תאורן, כתוביות, טלפרומפטר, ניתוב, CCU, VTR, ניהול במה, תפאורן, במאי, מפיק, עורך, גרפיקה, פיקוח קול, מנהל הפקה, עוזר במאי, צלם רחף)
  - department: מחלקה (צילום, סאונד, תאורה, טכני, הפקה)

כללים חשובים:
1. זהה כותרות עמודות גם אם הן לא סטנדרטיות
2. פרסר תאריכים בכל פורמט (DD/MM/YYYY, DD.MM.YY, יום בשבוע + תאריך)
3. שמות צוות יכולים להיות מופרדים בפסיקים, קווים, או בתאי טבלה נפרדים
4. אם אותו אדם מופיע עם מספר (למשל "צלם 1", "צלם 2") - אלו שני אנשים נפרדים
5. שמור על שמות בעברית כמו שהם
6. אם מידע חסר, השאר כ-string ריק

החזר תשובה אך ורק כ-JSON בפורמט:
{
  "productions": [
    {
      "name": "...",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "location": "...",
      "studio": "...",
      "notes": "...",
      "crew": [
        { "name": "...", "role": "...", "department": "..." }
      ]
    }
  ],
  "summary": "תיאור קצר של מה נמצא בקובץ"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `פרסר את לוח ההפקות הבא מהקובץ "${fileName || 'unknown'}":\n\n${content}`,
        },
      ],
      system: systemPrompt,
    });

    // Extract text content from Claude's response
    const textBlock = message.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'לא התקבלה תשובה מהמודל' }, { status: 500 });
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = textBlock.text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    return NextResponse.json({
      success: true,
      productions: parsed.productions || [],
      summary: parsed.summary || '',
      aiPowered: true,
    });
  } catch (error) {
    console.error('AI parse error:', error);
    const message = error instanceof Error ? error.message : 'שגיאה בפרסור AI';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
