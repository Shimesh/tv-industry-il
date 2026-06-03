'use client';

import type { ErrorInfo } from 'react';
import { auth } from '@/lib/firebase';


const APP_VERSION = '2.8.25';
const RECENT_ERROR_TTL_MS = 60_000;
const recentErrors = new Map<string, number>();

type ClientErrorLogInput = {
  error: unknown;
  errorInfo?: ErrorInfo | null;
  source: string;
};

function toErrorRecord(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || null,
    };
  }

  return {
    name: 'NonError',
    message: typeof error === 'string' ? error : 'Unknown client error',
    stack: null,
  };
}

function browserSnapshot() {
  if (typeof window === 'undefined') {
    return {
      href: null,
      pathname: null,
      userAgent: null,
      platform: null,
      language: null,
    };
  }

  return {
    href: window.location.href,
    pathname: window.location.pathname,
    userAgent: typeof window.navigator !== 'undefined' ? window.navigator.userAgent : null,
    platform: typeof window.navigator !== 'undefined' ? window.navigator.platform : null,
    language: typeof window.navigator !== 'undefined' ? window.navigator.language : null,
  };
}

export function logClientError(input: ClientErrorLogInput): void {
  if (typeof window === 'undefined') return;

  const errorRecord = toErrorRecord(input.error);
  const dedupeKey = [
    input.source,
    errorRecord.name,
    errorRecord.message,
    window.location.pathname,
  ].join('|');
  const now = Date.now();
  const lastSeen = recentErrors.get(dedupeKey);
  if (lastSeen && now - lastSeen < RECENT_ERROR_TTL_MS) return;
  recentErrors.set(dedupeKey, now);

  const payload = {
    ...errorRecord,
    componentStack: input.errorInfo?.componentStack || null,
    source: input.source,
    version: APP_VERSION,
    uid: auth.currentUser?.uid || null,
    ...browserSnapshot(),
  };

  const body = JSON.stringify(payload);

  try {
    if (typeof window.navigator !== 'undefined' && typeof window.navigator.sendBeacon === 'function') {
      const sent = window.navigator.sendBeacon(
        '/api/client-system-logs',
        new Blob([body], { type: 'application/json' }),
      );
      if (sent) return;
    }
  } catch {}

  void fetch('/api/client-system-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
