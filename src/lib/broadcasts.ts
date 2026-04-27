export type BroadcastSourceType = 'official-html' | 'official-json' | 'isramedia-html' | 'cache' | 'unavailable';

export type BroadcastSnapshotStatus = 'ok' | 'stale' | 'unavailable' | 'error';

export type BroadcastNowStatus = 'ok' | 'gap' | 'unavailable';

export interface BroadcastProgram {
  id: string;
  channelId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  genre: string | null;
  isLive: boolean;
  sourceUrl: string | null;
}

export interface BroadcastNowState {
  current: BroadcastProgram | null;
  next: BroadcastProgram | null;
  status: BroadcastNowStatus;
  serverTime: string;
}

export interface BroadcastChannelState {
  channelId: string;
  programs: BroadcastProgram[];
  fetchedAt: string | null;
  expiresAt: string | null;
  sourceUrl: string | null;
  sourceType: BroadcastSourceType;
  status: BroadcastSnapshotStatus;
  lastError: string | null;
  stale: boolean;
  now: BroadcastNowState;
}

export interface BroadcastsApiResponse {
  scope: string;
  serverTime: string;
  channels: BroadcastChannelState[];
}

function toTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function sortPrograms(programs: BroadcastProgram[]): BroadcastProgram[] {
  return [...programs].sort((a, b) => toTimestamp(a.startAt) - toTimestamp(b.startAt));
}

export function getCurrentAndNextProgram(
  programs: BroadcastProgram[],
  channelId: string,
  referenceTime: Date | string = new Date(),
): BroadcastNowState {
  const now = referenceTime instanceof Date ? referenceTime : new Date(referenceTime);
  const sortedPrograms = sortPrograms(programs).filter((program) => program.channelId === channelId);
  const nowMs = now.getTime();

  if (sortedPrograms.length === 0) {
    return {
      current: null,
      next: null,
      status: 'unavailable',
      serverTime: now.toISOString(),
    };
  }

  const current = sortedPrograms
    .filter((program) => {
      const start = toTimestamp(program.startAt);
      const end = toTimestamp(program.endAt);
      return Number.isFinite(start) && Number.isFinite(end) && start <= nowMs && nowMs < end;
    })
    .sort((a, b) => toTimestamp(b.startAt) - toTimestamp(a.startAt))[0] || null;

  const next = sortedPrograms.find((program) => {
    const start = toTimestamp(program.startAt);
    return Number.isFinite(start) && start > nowMs;
  }) || null;

  return {
    current,
    next,
    status: current ? 'ok' : next ? 'gap' : 'unavailable',
    serverTime: now.toISOString(),
  };
}

export function deriveBroadcastChannelState(
  state: BroadcastChannelState,
  referenceTime: Date | string,
): BroadcastChannelState {
  const now = getCurrentAndNextProgram(state.programs, state.channelId, referenceTime);

  return {
    ...state,
    now: state.status === 'unavailable' && state.programs.length === 0
      ? { ...now, status: 'unavailable' }
      : now,
  };
}

export function formatBroadcastTime(value: string | null | undefined): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatBroadcastDuration(startAt: string, endAt: string): string {
  const start = toTimestamp(startAt);
  const end = toTimestamp(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return '';
  }

  const minutes = Math.round((end - start) / 60000);
  if (minutes < 60) return `${minutes} דק׳`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  return remainder === 0 ? `${hours} ש׳` : `${hours} ש׳ ${remainder} דק׳`;
}
