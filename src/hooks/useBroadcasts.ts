'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  deriveBroadcastChannelState,
  type BroadcastChannelState,
  type BroadcastsApiResponse,
} from '@/lib/broadcasts';

type UseBroadcastsOptions = {
  scope?: string;
  channelId?: string | null;
  pollMs?: number;
};

type UseBroadcastsResult = {
  channels: BroadcastChannelState[];
  byChannelId: Record<string, BroadcastChannelState>;
  loading: boolean;
  error: string | null;
  serverConfirmed: boolean;
  updatedAt: string | null;
};

export function useBroadcasts({
  scope = 'all',
  channelId = null,
  pollMs = 60_000,
}: UseBroadcastsOptions = {}): UseBroadcastsResult {
  const [response, setResponse] = useState<BroadcastsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const serverOffsetMsRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchBroadcasts = async () => {
      try {
        const params = new URLSearchParams();
        if (scope) params.set('scope', scope);
        if (channelId) params.set('channelId', channelId);

        const res = await fetch(`/api/broadcasts?${params.toString()}`, {
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error(`Broadcasts API failed with ${res.status}`);
        }

        const data = (await res.json()) as BroadcastsApiResponse;

        if (cancelled || !mountedRef.current) return;

        serverOffsetMsRef.current = Date.parse(data.serverTime) - Date.now();
        setResponse(data);
        setError(null);
      } catch (fetchError) {
        if (cancelled || !mountedRef.current) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Broadcasts fetch failed');
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    };

    setLoading(true);
    void fetchBroadcasts();

    const interval = window.setInterval(() => {
      void fetchBroadcasts();
    }, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [scope, channelId, pollMs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const channels = useMemo(() => {
    if (!response) return [];

    const referenceTime = new Date(Date.now() + serverOffsetMsRef.current + tick * 0);
    return response.channels.map((state) => deriveBroadcastChannelState(state, referenceTime));
  }, [response, tick]);

  const byChannelId = useMemo(
    () => Object.fromEntries(channels.map((channelState) => [channelState.channelId, channelState])),
    [channels],
  );

  return {
    channels,
    byChannelId,
    loading,
    error,
    serverConfirmed: Boolean(response),
    updatedAt: response?.serverTime || null,
  };
}
