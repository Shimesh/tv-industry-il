import { createHash } from 'crypto';
import type {
  JobStatusMetric,
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
  lastStatus?: 'success' | 'failure' | null;
  lastError?: string | null;
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

function nowIso(): string {
  return new Date().toISOString();
}

function hashKey(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}

function metricDocId(metricType: 'page' | 'route' | 'job', key: string): string {
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
}

export async function incrementPageView(pathname: string): Promise<void> {
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
}

export async function recordRouteMetric(input: {
  route: string;
  ok: boolean;
  statusCode?: number | null;
  error?: unknown;
}): Promise<void> {
  const key = input.route;
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

  if (!input.ok) {
    await recordSystemEvent({
      type: 'api_failure',
      level: 'error',
      source: 'api',
      message: `קריאת API נכשלה בנתיב ${key}`,
      detail: lastError,
      route: key,
      statusCode: input.statusCode ?? null,
    });
  }
}

export async function recordJobMetric(input: {
  job: string;
  ok: boolean;
  message: string;
  detail?: unknown;
}): Promise<void> {
  const key = input.job;
  const docPath = `adminMetrics/${metricDocId('job', key)}`;
  const existing = await getDocument<MetricRecord>(docPath);
  const timestamp = nowIso();
  const successRuns = Number(existing?.successRuns || 0) + (input.ok ? 1 : 0);
  const failureRuns = Number(existing?.failureRuns || 0) + (input.ok ? 0 : 1);
  const runs = Number(existing?.runs || 0) + 1;
  const lastError = input.ok ? null : serializeDetail(input.detail);

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

  const jobs = metrics
    .filter((metric) => metric.metricType === 'job')
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
    }));

  return { topPages, routeHealth, jobs };
}
