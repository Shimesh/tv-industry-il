import { createHash } from 'crypto';
import type {
  JobStatusMetric,
  PageViewEvent,
  RouteHealthMetric,
  SystemEventLevel,
  SystemEventRecord,
  UsageMetric,
} from '@/lib/adminTypes';
import {
  createDocument,
  getDocument,
  listDocuments,
  patchDocument,
} from '@/lib/server/firestoreAdminRest';

type MetricRecord = {
  id: string;
  metricType?: 'page' | 'route' | 'job';
  key?: string;
  label?: string;
  count?: number;
  runs?: number;
  successCount?: number;
  failureCount?: number;
  successRuns?: number;
  failureRuns?: number;
  lastSeenAt?: string | null;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastStatusCode?: number | null;
  lastStatus?: 'running' | 'success' | 'failure' | null;
  lastError?: string | null;
  lastMessage?: string | null;
  lastDetail?: string | null;
  updatedAt?: string | null;
};

type EventWriteInput = {
  type: string;
  level: SystemEventLevel;
  source: string;
  message: string;
  detail?: string | null;
  route?: string | null;
  job?: string | null;
  statusCode?: number | null;
};

type PageViewWriteInput = {
  pathname: string;
  visitorId?: string | null;
  authUser?: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
  } | null;
  ip?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  deviceType?: PageViewEvent['deviceType'];
  browser?: string | null;
  os?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
};

// Per-instance debounce: skip metric writes if the same key was written recently.
// Serverless instances stay warm for minutes so this cuts Firestore ops by ~95%.
const lastMetricWriteAt: Record<string, number> = {};
const METRIC_DEBOUNCE_MS = 60_000;

function shouldWriteMetric(key: string): boolean {
  const now = Date.now();
  if (now - (lastMetricWriteAt[key] || 0) < METRIC_DEBOUNCE_MS) return false;
  lastMetricWriteAt[key] = now;
  return true;
}

function nowIso(): string {
  return new Date().toISOString();
}

function hashKey(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}

function metricDocId(metricType: 'page' | 'route' | 'job', key: string): string {
  if (metricType === 'job' && /^[A-Za-z0-9_-]+$/.test(key)) return `job-${key}`;
  return `${metricType}-${hashKey(key)}`;
}

function toDisplayLabel(key: string): string {
  return key.replace(/^\/+/, '/') || '/';
}

function serializeDetail(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === 'string') return detail.slice(0, 1200);
  try {
    return JSON.stringify(detail).slice(0, 1200);
  } catch {
    return String(detail).slice(0, 1200);
  }
}

export async function recordSystemEvent(input: EventWriteInput): Promise<void> {
  try {
    const createdAt = nowIso();
    const docId = `event-${Date.now()}-${hashKey(`${input.type}-${input.source}-${Math.random()}`)}`;

    await createDocument('systemEvents', {
      type: input.type,
      level: input.level,
      source: input.source,
      message: input.message,
      detail: input.detail || null,
      route: input.route || null,
      job: input.job || null,
      statusCode: input.statusCode ?? null,
      createdAt,
    }, docId);
  } catch {
    // telemetry must never break callers
  }
}

export async function incrementPageView(pathname: string): Promise<void> {
  try {
    const key = pathname || '/';
    const docPath = `adminMetrics/${metricDocId('page', key)}`;
    const existing = await getDocument<MetricRecord>(docPath);
    const count = Number(existing?.count || 0) + 1;

    await patchDocument(docPath, {
      metricType: 'page',
      key,
      label: toDisplayLabel(key),
      count,
      lastSeenAt: nowIso(),
      updatedAt: nowIso(),
    });
  } catch {
    // telemetry must never break callers
  }
}

export async function recordPageView(input: PageViewWriteInput): Promise<void> {
  try {
    const key = input.pathname || '/';
    const timestamp = nowIso();
    const docPath = `adminMetrics/${metricDocId('page', key)}`;
    const existing = await getDocument<MetricRecord>(docPath);
    const count = Number(existing?.count || 0) + 1;

    await patchDocument(docPath, {
      metricType: 'page',
      key,
      label: toDisplayLabel(key),
      count,
      lastSeenAt: timestamp,
      updatedAt: timestamp,
    });

    const authUser = input.authUser || null;
    const eventId = `view-${Date.now()}-${hashKey(`${key}-${input.visitorId || authUser?.uid || 'guest'}-${Math.random()}`)}`;

    await createDocument('pageViewEvents', {
      pathname: key,
      label: toDisplayLabel(key),
      action: 'page_view',
      viewedAt: timestamp,
      visitorId: input.visitorId || null,
      authenticated: Boolean(authUser?.uid),
      uid: authUser?.uid || null,
      displayName: authUser?.displayName || null,
      email: authUser?.email || null,
      ip: input.ip || null,
      country: input.country || null,
      region: input.region || null,
      city: input.city || null,
      latitude: input.latitude || null,
      longitude: input.longitude || null,
      deviceType: input.deviceType || 'unknown',
      browser: input.browser || null,
      os: input.os || null,
      userAgent: input.userAgent || null,
      referrer: input.referrer || null,
    }, eventId);
  } catch {
    // telemetry must never break callers
  }
}

export async function getPageViewEvents(pathname: string, limit = 50): Promise<PageViewEvent[]> {
  const key = pathname || '/';
  const events = await listDocuments<PageViewEvent>('pageViewEvents');
  return events
    .filter((event) => event.pathname === key)
    .sort((a, b) => String(b.viewedAt || '').localeCompare(String(a.viewedAt || '')))
    .slice(0, limit)
    .map((event) => ({
      id: event.id,
      pathname: event.pathname || key,
      label: event.label || toDisplayLabel(key),
      action: 'page_view',
      viewedAt: event.viewedAt,
      visitorId: event.visitorId || null,
      authenticated: Boolean(event.authenticated),
      uid: event.uid || null,
      displayName: event.displayName || null,
      email: event.email || null,
      ip: event.ip || null,
      country: event.country || null,
      region: event.region || null,
      city: event.city || null,
      latitude: event.latitude || null,
      longitude: event.longitude || null,
      deviceType: event.deviceType || 'unknown',
      browser: event.browser || null,
      os: event.os || null,
      userAgent: event.userAgent || null,
      referrer: event.referrer || null,
    }));
}

export async function recordRouteMetric(input: {
  route: string;
  ok: boolean;
  statusCode?: number | null;
  error?: unknown;
}): Promise<void> {
  try {
    const key = input.route;
    if (!input.ok) {
      // Always record failures; skip successes if recently written
      await recordSystemEvent({
        type: 'api_failure',
        level: 'error',
        source: 'api',
        message: `קריאת API נכשלה בנתיב ${key}`,
        detail: serializeDetail(input.error),
        route: key,
        statusCode: input.statusCode ?? null,
      });
    }
    if (!shouldWriteMetric(`route-${key}`)) return;
    const docPath = `adminMetrics/${metricDocId('route', key)}`;
    const existing = await getDocument<MetricRecord>(docPath);
    const successCount = Number(existing?.successCount || 0) + (input.ok ? 1 : 0);
    const failureCount = Number(existing?.failureCount || 0) + (input.ok ? 0 : 1);
    const timestamp = nowIso();
    const lastError = input.ok ? null : serializeDetail(input.error);

    await patchDocument(docPath, {
      metricType: 'route',
      key,
      label: key,
      successCount,
      failureCount,
      lastRunAt: timestamp,
      lastSuccessAt: input.ok ? timestamp : existing?.lastSuccessAt || null,
      lastFailureAt: input.ok ? existing?.lastFailureAt || null : timestamp,
      lastStatusCode: input.statusCode ?? null,
      lastError,
      updatedAt: timestamp,
    });
  } catch {
    // telemetry must never break callers
  }
}

export async function recordJobMetric(input: {
  job: string;
  ok: boolean;
  message: string;
  detail?: unknown;
}): Promise<void> {
  try {
    const key = input.job;
    if (!shouldWriteMetric(`job-${key}`)) return;
    const docPath = `adminMetrics/${metricDocId('job', key)}`;
    const existing = await getDocument<MetricRecord>(docPath);
    const timestamp = nowIso();
    const successRuns = Number(existing?.successRuns || 0) + (input.ok ? 1 : 0);
    const failureRuns = Number(existing?.failureRuns || 0) + (input.ok ? 0 : 1);
    const runs = Number(existing?.runs || 0) + 1;
    const lastError = input.ok ? null : serializeDetail(input.detail);
    const lastDetail = input.ok ? serializeDetail(input.detail) : existing?.lastDetail || null;

    await patchDocument(docPath, {
      metricType: 'job',
      key,
      label: key,
      runs,
      successRuns,
      failureRuns,
      lastRunAt: timestamp,
      lastSuccessAt: input.ok ? timestamp : existing?.lastSuccessAt || null,
      lastFailureAt: input.ok ? existing?.lastFailureAt || null : timestamp,
      lastStatus: input.ok ? 'success' : 'failure',
      lastError,
      lastMessage: input.message,
      lastDetail,
      updatedAt: timestamp,
    });

    await recordSystemEvent({
      type: 'job_run',
      level: input.ok ? 'success' : 'error',
      source: 'job',
      message: input.message,
      detail: serializeDetail(input.detail),
      job: key,
    });
  } catch {
    // telemetry must never break callers
  }
}

export async function recordJobStarted(input: {
  job: string;
  message: string;
  detail?: unknown;
}): Promise<void> {
  try {
    const key = input.job;
    const docPath = `adminMetrics/${metricDocId('job', key)}`;
    const existing = await getDocument<MetricRecord>(docPath);
    const timestamp = nowIso();

    await patchDocument(docPath, {
      metricType: 'job',
      key,
      label: key,
      runs: Number(existing?.runs || 0),
      successRuns: Number(existing?.successRuns || 0),
      failureRuns: Number(existing?.failureRuns || 0),
      lastRunAt: timestamp,
      lastSuccessAt: existing?.lastSuccessAt || null,
      lastFailureAt: existing?.lastFailureAt || null,
      lastStatus: 'running',
      lastError: null,
      lastMessage: input.message,
      lastDetail: serializeDetail(input.detail),
      updatedAt: timestamp,
    });

    await recordSystemEvent({
      type: 'job_run',
      level: 'info',
      source: 'job',
      message: input.message,
      detail: serializeDetail(input.detail),
      job: key,
    });
  } catch {
    // telemetry must never break callers
  }
}

export async function getRecentSystemEvents(limit = 12): Promise<SystemEventRecord[]> {
  const events = await listDocuments<SystemEventRecord>('systemEvents');
  return events
    .filter((event) => Boolean(event.createdAt))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit)
    .map((event) => ({
      id: event.id,
      type: event.type,
      level: event.level,
      source: event.source,
      message: event.message,
      detail: event.detail || null,
      route: event.route || null,
      job: event.job || null,
      statusCode: event.statusCode ?? null,
      createdAt: event.createdAt,
    }));
}

export async function getUsageSnapshot(): Promise<{
  topPages: UsageMetric[];
  routeHealth: RouteHealthMetric[];
  jobs: JobStatusMetric[];
}> {
  const metrics = await listDocuments<MetricRecord>('adminMetrics');

  const topPages = metrics
    .filter((metric) => metric.metricType === 'page')
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
    .slice(0, 8)
    .map((metric) => ({
      key: metric.key || '',
      label: metric.label || metric.key || '',
      count: Number(metric.count || 0),
      lastSeenAt: metric.lastSeenAt || null,
    }));

  const routeHealth = metrics
    .filter((metric) => metric.metricType === 'route')
    .sort((a, b) => String(b.lastRunAt || '').localeCompare(String(a.lastRunAt || '')))
    .slice(0, 8)
    .map((metric) => ({
      key: metric.key || '',
      label: metric.label || metric.key || '',
      successCount: Number(metric.successCount || 0),
      failureCount: Number(metric.failureCount || 0),
      lastRunAt: metric.lastRunAt || null,
      lastSuccessAt: metric.lastSuccessAt || null,
      lastFailureAt: metric.lastFailureAt || null,
      lastStatusCode: metric.lastStatusCode ?? null,
      lastError: metric.lastError || null,
    }));

  const jobRecords = Array.from(
    metrics
      .filter((metric) => metric.metricType === 'job')
      .reduce((map, metric) => {
        const key = metric.key || metric.id;
        const current = map.get(key);
        if (!current || String(metric.lastRunAt || '').localeCompare(String(current.lastRunAt || '')) > 0) {
          map.set(key, metric);
        }
        return map;
      }, new Map<string, MetricRecord>())
      .values(),
  );

  const jobs = jobRecords
    .sort((a, b) => String(b.lastRunAt || '').localeCompare(String(a.lastRunAt || '')))
    .slice(0, 8)
    .map((metric) => ({
      key: metric.key || '',
      label: metric.label || metric.key || '',
      runs: Number(metric.runs || 0),
      successRuns: Number(metric.successRuns || 0),
      failureRuns: Number(metric.failureRuns || 0),
      lastRunAt: metric.lastRunAt || null,
      lastSuccessAt: metric.lastSuccessAt || null,
      lastFailureAt: metric.lastFailureAt || null,
      lastStatus: metric.lastStatus || null,
      lastError: metric.lastError || null,
      lastMessage: metric.lastMessage || null,
      lastDetail: metric.lastDetail || null,
    }));

  return { topPages, routeHealth, jobs };
}
