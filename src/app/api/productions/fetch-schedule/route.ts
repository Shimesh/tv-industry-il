import { NextRequest, NextResponse } from 'next/server';
import { parseScheduleHTML, parseManualText } from '@/lib/productionScheduleParser';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, manualText, rawHtml } = body;

    // If raw HTML provided (from browser fetch), parse it server-side
    if (rawHtml) {
      const parsed = parseScheduleHTML(rawHtml, '');
      return NextResponse.json({
        success: true,
        data: parsed,
        source: 'raw_html',
      });
    }

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
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'invalid_url', message: 'הלינק לא תקין' },
        { status: 400 }
      );
    }

    // Server-side fetch with SSL bypass for self-signed certs
    let personalHtml = '';
    let deptHtml = '';

    try {
      // Server-side fetch - note: browser CORS proxy is the primary path
      // This is a fallback for when the server CAN reach the URL
      const fetchOptions: RequestInit = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        },
        // @ts-expect-error - Node.js 20 experimental option
        rejectUnauthorized: false,
      };

      // Build department URL variants
      const deptUrl = new URL(url);
      deptUrl.searchParams.set('HSELWEBprgnameShowFmp', '1');
      const deptUrl2 = new URL(url);
      deptUrl2.searchParams.set('showdept', '1');

      // Fetch personal view and department view in parallel
      const [personalResponse, deptResult] = await Promise.all([
        fetch(url, fetchOptions),
        fetch(deptUrl.toString(), fetchOptions)
          .catch(() => fetch(deptUrl2.toString(), fetchOptions).catch(() => null)),
      ]);

      if (!personalResponse.ok) {
        throw new Error(`HTTP ${personalResponse.status}`);
      }
      personalHtml = await personalResponse.text();

      if (deptResult && deptResult.ok) {
        deptHtml = await deptResult.text();
      }
    } catch (error) {
      console.error('Server fetch error:', error);
      return NextResponse.json({
        error: 'network',
        message: 'השרת לא הצליח לגשת ללינק. נסה את ה-CORS proxy (הגישה מהדפדפן).',
      }, { status: 502 });
    }

    // Parse HTML
    const parsed = parseScheduleHTML(personalHtml, deptHtml);

    return NextResponse.json({
      success: true,
      data: parsed,
      source: 'server',
      rawHtmlPreview: parsed.productions.length === 0 ? personalHtml.substring(0, 1000) : undefined,
      warning: parsed.productions.length === 0 ? 'לא נמצאו הפקות בלינק.' : undefined,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'server', message: 'שגיאת שרת' },
      { status: 500 }
    );
  }
}
