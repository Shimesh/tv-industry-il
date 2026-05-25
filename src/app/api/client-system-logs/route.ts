import { NextRequest, NextResponse } from 'next/server';
import { createDocument } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';

const MAX_TEXT = 2000;

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function context(value: Record<string, unknown>): string | null {
  const omitted = new Set([
    'source',
    'version',
    'uid',
    'name',
    'message',
    'stack',
    'componentStack',
    'href',
    'pathname',
    'userAgent',
    'platform',
    'language',
  ]);
  const extra: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (!omitted.has(key)) extra[key] = nested;
  }
  const serialized = JSON.stringify(extra);
  return serialized === '{}' ? null : serialized.slice(0, 4000);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const createdAt = new Date().toISOString();
    const docId = `client-${Date.now()}-${crypto.randomUUID()}`;

    await createDocument('client_system_logs', {
      createdAt,
      level: 'error',
      source: text(body.source, 120) || 'client',
      version: text(body.version, 40),
      uid: text(body.uid, 128),
      name: text(body.name, 120),
      message: text(body.message) || 'Unknown client error',
      stack: text(body.stack, 6000),
      componentStack: text(body.componentStack, 6000),
      href: text(body.href),
      pathname: text(body.pathname, 500),
      userAgent: text(body.userAgent, 1000) || text(request.headers.get('user-agent'), 1000),
      platform: text(body.platform, 200),
      language: text(body.language, 80),
      context: context(body),
      ip: text(request.headers.get('x-forwarded-for'), 500) || text(request.headers.get('x-real-ip'), 200),
    }, docId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[client-system-logs] failed to record client error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
