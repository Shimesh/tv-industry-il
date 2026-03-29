'use client';

import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from 'firebase/auth';

/**
 * Hook that provides REST API helpers for loading/saving team production schedules.
 * Team schedules live at: teams/{teamId}/weeks/{weekId}/productions/{prodId}
 * Uses the same REST API pattern as the existing per-user productions page.
 */
export function useTeamSchedule() {
  const { user } = useAuth();

  const getTeamProductionsRoot = (teamId: string) => `teams/${teamId}/weeks`;

  const restListDocs = useCallback(async (
    collectionPath: string,
    authUser: User,
  ): Promise<Array<{ id: string; fields: Record<string, unknown> }>> => {
    try {
      const token = await authUser.getIdToken();
      const projectId = 'tv-industry-il';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      if (!data.documents) return [];

      return data.documents.map((doc: Record<string, unknown>) => {
        const name = doc.name as string;
        const id = name.split('/').pop() || '';
        const rawFields = (doc.fields || {}) as Record<string, Record<string, unknown>>;
        const fields: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(rawFields)) {
          if ('stringValue' in val) fields[key] = val.stringValue;
          else if ('integerValue' in val) fields[key] = Number(val.integerValue);
          else if ('booleanValue' in val) fields[key] = val.booleanValue;
          else if ('timestampValue' in val) fields[key] = val.timestampValue;
          else if ('nullValue' in val) fields[key] = null;
          else if ('arrayValue' in val) fields[key] = val.arrayValue;
          else if ('mapValue' in val) fields[key] = val.mapValue;
        }
        return { id, fields };
      });
    } catch {
      return [];
    }
  }, []);

  const loadTeamWeek = useCallback(async (teamId: string, weekId: string) => {
    if (!user) return [];
    const path = `${getTeamProductionsRoot(teamId)}/${weekId}/productions`;
    return restListDocs(path, user);
  }, [user, restListDocs]);

  const saveTeamProduction = useCallback(async (
    teamId: string,
    weekId: string,
    prodId: string,
    fields: Record<string, unknown>,
  ) => {
    if (!user) return;
    const token = await user.getIdToken(true);
    const projectId = 'tv-industry-il';
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const path = `teams/${teamId}/weeks/${weekId}/productions/${prodId}`;

    const toVal = (v: unknown): Record<string, unknown> => {
      if (typeof v === 'string') return { stringValue: v };
      if (typeof v === 'number') return { integerValue: String(v) };
      if (typeof v === 'boolean') return { booleanValue: v };
      if (v === null || v === undefined) return { nullValue: null };
      if (Array.isArray(v)) {
        return {
          arrayValue: {
            values: v.map(item => {
              if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                const f: Record<string, unknown> = {};
                for (const [k, val] of Object.entries(item)) f[k] = toVal(val);
                return { mapValue: { fields: f } };
              }
              return toVal(item);
            }),
          },
        };
      }
      if (typeof v === 'object' && v !== null) {
        const f: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v)) f[k] = toVal(val);
        return { mapValue: { fields: f } };
      }
      return { stringValue: String(v) };
    };

    const firestoreFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      firestoreFields[key] = toVal(value);
    }

    const res = await fetch(`${baseUrl}/${path}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: firestoreFields }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `REST error ${res.status}`);
    }
  }, [user]);

  const saveTeamWeekMeta = useCallback(async (
    teamId: string,
    weekId: string,
    meta: Record<string, unknown>,
  ) => {
    if (!user) return;
    const token = await user.getIdToken(true);
    const projectId = 'tv-industry-il';
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const path = `teams/${teamId}/weeks/${weekId}`;

    const toVal = (v: unknown): Record<string, unknown> => {
      if (typeof v === 'string') return { stringValue: v };
      if (typeof v === 'number') return { integerValue: String(v) };
      if (typeof v === 'boolean') return { booleanValue: v };
      if (v === null || v === undefined) return { nullValue: null };
      return { stringValue: String(v) };
    };

    const firestoreFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      firestoreFields[key] = toVal(value);
    }

    await fetch(`${baseUrl}/${path}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: firestoreFields }),
    });
  }, [user]);

  return {
    getTeamProductionsRoot,
    loadTeamWeek,
    saveTeamProduction,
    saveTeamWeekMeta,
  };
}
