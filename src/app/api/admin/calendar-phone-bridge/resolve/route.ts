import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';

export const runtime = 'nodejs';

const HERZLIYA_BASE = 'https://hsil.acc.co.il:5443/magicscripts/mgrqispi.dll';
const TOKEN_PATTERN = '[A-Za-z0-9-]{6,64}';

function extractHerzliyaUrl(input: string): string {
  return input.match(/https?:\/\/hsil\.acc\.co\.il:5443\/[^\s<>"']+/i)?.[0] || input.trim();
}

function parseSource(input: string): { guid: string; argument: string } | null {
  const candidate = extractHerzliyaUrl(input);
  const sendwaPattern = new RegExp(`[?&]A=([^,\\s&]+),(${TOKEN_PATTERN})`, 'i');
  const looseSendwaPattern = new RegExp(`\\bA=([A-F0-9-]{36}),(${TOKEN_PATTERN})`, 'i');
  const directPattern = new RegExp(`arguments=-N([^,\\s&]+),-A(${TOKEN_PATTERN})(?:,-A(?:true|false))?`, 'i');
  const match = candidate.match(directPattern)
    || input.match(directPattern)
    || candidate.match(sendwaPattern)
    || input.match(looseSendwaPattern);
  if (!match) return null;
  return { guid: match[1], argument: match[2] };
}

function buildFullDepartmentUrl(guid: string, argument: string): string {
  return `${HERZLIYA_BASE}?appname=HSiLWeb&prgname=ShowEmp6&arguments=-N${guid},-A${argument},-Atrue`;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 TV-Industry-IL/1.0',
      },
    });
    if (!response.ok) {
      throw new Error(`Herzliya returned HTTP ${response.status}`);
    }
    return response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('החיבור של האפליקציה להרצליה לא החזיר תשובה בזמן');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractEffectiveDateFromPersonalHtml(html: string): string {
  const direct = html.match(/arguments=-N[^,\s&"'<>]+,-A(\d{8})(?:,-A(?:\$\{inputValue2\}|true|false))?/i);
  if (direct) return direct[1];

  const headerDate = html.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (headerDate) return `${headerDate[1]}${headerDate[2]}${headerDate[3]}`;

  return '';
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requirePrimaryAdminRequest(request);
    if (authUser instanceof NextResponse) return authUser;

    const body = (await request.json().catch(() => ({}))) as { input?: string };
    const input = String(body.input || '').trim();
    const parsed = parseSource(input);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: 'לא זוהה קישור הרצליה תקין' }, { status: 400 });
    }

    const immediateUrl = buildFullDepartmentUrl(parsed.guid, parsed.argument);

    if (/^\d{8}$/.test(parsed.argument)) {
      return NextResponse.json({
        ok: true,
        fullDepartmentUrl: immediateUrl,
        guid: parsed.guid,
        sourceArgument: parsed.argument,
        resolvedArgument: parsed.argument,
        resolvedFrom: 'source-date',
      });
    }

    const personalUrl = `${HERZLIYA_BASE}?appname=HSiLWEB&prgname=ShowEmp3&arguments=-N${parsed.guid},-A${parsed.argument}`;
    const personalHtml = await fetchText(personalUrl);
    const resolvedDate = extractEffectiveDateFromPersonalHtml(personalHtml);

    if (!resolvedDate) {
      return NextResponse.json({
        ok: false,
        error: 'הרצליה פתחה את הקישור האישי, אבל לא נמצא בו תאריך עבודה לבניית יומן מלא',
        personalUrl,
      }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      fullDepartmentUrl: buildFullDepartmentUrl(parsed.guid, resolvedDate),
      guid: parsed.guid,
      sourceArgument: parsed.argument,
      resolvedArgument: resolvedDate,
      resolvedFrom: 'personal-page',
      personalUrl,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error
        ? error.message
        : 'לא הצלחתי לפתור את קישור הרצליה',
    }, { status: 502 });
  }
}
