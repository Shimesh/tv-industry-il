import { NextRequest, NextResponse } from 'next/server';
import { parseScheduleHTML, parseManualText } from '@/lib/productionScheduleParser';
import { recordJobMetric, recordRouteMetric } from '@/lib/server/adminTelemetry';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, manualText, rawHtml } = body;

    if (rawHtml) {
      const parsed = parseScheduleHTML(rawHtml, '');
      await recordRouteMetric({ route: '/api/productions/fetch-schedule', ok: true, statusCode: 200 });
      return NextResponse.json({
        success: true,
        data: parsed,
        source: 'raw_html',
      });
    }

    if (manualText) {
      const parsed = parseManualText(manualText);
      await recordRouteMetric({ route: '/api/productions/fetch-schedule', ok: true, statusCode: 200 });
      return NextResponse.json({
        success: true,
        data: parsed,
        source: 'manual',
      });
    }

    if (!url) {
      await recordRouteMetric({
        route: '/api/productions/fetch-schedule',
        ok: false,
        statusCode: 400,
        error: 'missing_url',
      });
      return NextResponse.json(
        { error: 'missing_url', message: 'לא סופק לינק' },
        { status: 400 },
      );
    }

    try {
      new URL(url);
    } catch {
      await recordRouteMetric({
        route: '/api/productions/fetch-schedule',
        ok: false,
        statusCode: 400,
        error: 'invalid_url',
      });
      return NextResponse.json(
        { error: 'invalid_url', message: 'הלינק לא תקין' },
        { status: 400 },
      );
    }

    let personalHtml = '';
    let deptHtml = '';

    try {
      const fetchOptions: RequestInit = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        },
        // @ts-expect-error - Node.js 20 experimental option
        rejectUnauthorized: false,
      };

      const deptUrl = new URL(url);
      deptUrl.searchParams.set('HSELWEBprgnameShowFmp', '1');
      const deptUrl2 = new URL(url);
      deptUrl2.searchParams.set('showdept', '1');

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
      await Promise.all([
        recordRouteMetric({
          route: '/api/productions/fetch-schedule',
          ok: false,
          statusCode: 502,
          error,
        }),
        recordJobMetric({
          job: 'productions-fetch-schedule',
          ok: false,
          message: 'שליפת לוח ההפקות מהשרת נכשלה',
          detail: error instanceof Error ? error.message : error,
        }),
      ]);
      return NextResponse.json({
        error: 'network',
        message: 'השרת לא הצליח לגשת ללינק. נסה את ה־CORS proxy מהדפדפן.',
      }, { status: 502 });
    }

    const parsed = parseScheduleHTML(personalHtml, deptHtml);
    await Promise.all([
      recordRouteMetric({ route: '/api/productions/fetch-schedule', ok: true, statusCode: 200 }),
      recordJobMetric({
        job: 'productions-fetch-schedule',
        ok: true,
        message: 'שליפת לוח ההפקות הושלמה בהצלחה',
        detail: { productions: parsed.productions.length, source: 'server' },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: parsed,
      source: 'server',
      rawHtmlPreview: parsed.productions.length === 0 ? personalHtml.substring(0, 1000) : undefined,
      warning: parsed.productions.length === 0 ? 'לא נמצאו הפקות בלינק.' : undefined,
    });
  } catch (error) {
    console.error('API error:', error);
    await recordRouteMetric({
      route: '/api/productions/fetch-schedule',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: 'server', message: 'שגיאת שרת' },
      { status: 500 },
    );
  }
}
