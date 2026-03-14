import { NextRequest, NextResponse } from 'next/server';
import { parseScheduleHTML, parseManualText } from '@/lib/productionScheduleParser';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, manualText } = body;

    // If manual text provided, parse it directly
    if (manualText) {
      const parsed = parseManualText(manualText);
      return NextResponse.json({
        success: true,
        data: parsed,
        source: 'manual',
      });
    }

    if (!url) {
      return NextResponse.json(
        { error: 'missing_url', message: 'לא סופק לינק' },
        { status: 400 }
      );
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'invalid_url', message: 'הלינק לא תקין' },
        { status: 400 }
      );
    }

    // Fetch personal schedule HTML
    let personalHtml = '';
    let deptHtml = '';

    try {
      // Bypass SSL for Herzliya internal system
      const fetchOptions: RequestInit = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        },
        // @ts-expect-error - Node.js specific option for self-signed certs
        rejectUnauthorized: false,
      };

      // Fetch personal view
      const personalResponse = await fetch(url, fetchOptions);
      if (!personalResponse.ok) {
        throw new Error(`HTTP ${personalResponse.status}`);
      }
      personalHtml = await personalResponse.text();

      // Fetch department view - try appending showdept parameter
      const deptUrl = new URL(url);
      deptUrl.searchParams.set('HSELWEBprgnameShowFmp', '1');

      try {
        const deptResponse = await fetch(deptUrl.toString(), fetchOptions);
        if (deptResponse.ok) {
          deptHtml = await deptResponse.text();
        }
      } catch {
        // Try alternative parameter
        const deptUrl2 = new URL(url);
        deptUrl2.searchParams.set('showdept', '1');
        try {
          const deptResponse2 = await fetch(deptUrl2.toString(), fetchOptions);
          if (deptResponse2.ok) {
            deptHtml = await deptResponse2.text();
          }
        } catch {
          // Department view unavailable - continue with personal only
          console.warn('Department view not available');
        }
      }
    } catch (error) {
      console.error('Fetch error:', error);
      return NextResponse.json({
        error: 'network',
        message: 'הלינק לא נגיש. ייתכן שהוא נגיש רק מרשת הרצליה. נסה מהבית או מה-VPN.',
      }, { status: 502 });
    }

    // Parse HTML
    const parsed = parseScheduleHTML(personalHtml, deptHtml);

    if (parsed.productions.length === 0) {
      return NextResponse.json({
        success: true,
        data: parsed,
        warning: 'לא נמצאו הפקות בלינק. ייתכן שהפורמט השתנה.',
        rawHtmlPreview: personalHtml.substring(0, 500),
      });
    }

    return NextResponse.json({
      success: true,
      data: parsed,
      source: 'url',
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'server', message: 'שגיאת שרת' },
      { status: 500 }
    );
  }
}
