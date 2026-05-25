'use client';

import { auth } from '@/lib/firebase';

type TraceLevel = 'debug' | 'info' | 'warn' | 'error';

type TraceOptions = {
  level?: TraceLevel;
  force?: boolean;
};

const CHAT_DEBUG_STORAGE_KEY = 'tv-chat-debug';
const CHAT_LOG_ENDPOINT = '/api/client-system-logs';
const APP_VERSION = '2.6.12';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function isChatDebugEnabled(force = false): boolean {
  if (force) return true;
  if (!isBrowser()) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('chatDebug') === '1') {
      window.localStorage.setItem(CHAT_DEBUG_STORAGE_KEY, '1');
      return true;
    }
    return window.localStorage.getItem(CHAT_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: (value as { code?: unknown }).code,
    };
  }
  if (value instanceof File) {
    return {
      name: value.name,
      type: value.type,
      size: value.size,
    };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeValue);
  if (!value || typeof value !== 'object') return value;

  const blocked = new Set(['text', 'messageText', 'body', 'stack']);
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    output[key] = blocked.has(key) ? '[redacted]' : sanitizeValue(nested);
  }
  return output;
}

function shouldPrint(level: TraceLevel, force?: boolean): boolean {
  return level === 'warn' || level === 'error' || isChatDebugEnabled(force);
}

export function chatTrace(
  area: string,
  step: string,
  details: Record<string, unknown> = {},
  options: TraceOptions = {},
): void {
  const level = options.level ?? 'debug';
  if (!shouldPrint(level, options.force)) return;
  const payload = {
    at: new Date().toISOString(),
    ...(sanitizeValue(details) as Record<string, unknown>),
  };
  const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  method(`[chat:${area}] ${step}`, payload);
}

export function createChatTraceId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function logChatPipelineIssue(
  source: string,
  details: Record<string, unknown>,
  error?: unknown,
): void {
  if (!isBrowser()) return;
  const payload = {
    source: `chat.pipeline.${source}`,
    version: APP_VERSION,
    uid: auth.currentUser?.uid || null,
    name: error instanceof Error ? error.name : 'ChatPipeline',
    message: error instanceof Error ? error.message : String(details.step || source),
    href: window.location.href,
    pathname: window.location.pathname,
    ...(sanitizeValue(details) as Record<string, unknown>),
  };
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(CHAT_LOG_ENDPOINT, new Blob([body], { type: 'application/json' }));
      if (sent) return;
    }
  } catch {}
  void fetch(CHAT_LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export async function withChatTimeout<T>(
  promise: Promise<T>,
  ms: number,
  area: string,
  step: string,
  details: Record<string, unknown> = {},
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const startedAt = performance.now();
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(`פעולת הצ׳אט "${step}" לקחה יותר מדי זמן`);
        chatTrace(area, `${step}:timeout`, { ...details, durationMs: Math.round(performance.now() - startedAt), timeoutMs: ms }, { level: 'error' });
        logChatPipelineIssue(area, { ...details, step, timeoutMs: ms }, error);
        reject(error);
      }, ms);
    });
    const result = await Promise.race([promise, timeout]);
    chatTrace(area, `${step}:ok`, { ...details, durationMs: Math.round(performance.now() - startedAt) });
    return result;
  } catch (error) {
    chatTrace(area, `${step}:failed`, { ...details, durationMs: Math.round(performance.now() - startedAt), error }, { level: 'error' });
    logChatPipelineIssue(area, { ...details, step }, error);
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
