import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { patchDocument } from '@/lib/server/firestoreAdminRest';
import { generateProductionId, getHebrewDay, getWeekId, type Production } from '@/lib/productionDiff';

export const runtime = 'nodejs';

type ManualProduction = Pick<Production, 'name' | 'date' | 'studio' | 'startTime' | 'endTime'>;

function validTime(value: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(value) && Number(value.split(':')[0]) <= 29;
}

export async function POST(request: NextRequest) {
  const authUser = await requirePrimaryAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;
  const body = (await request.json()) as { targetUid?: string; productions?: ManualProduction[] };
  const targetUid = String(body.targetUid || '').trim();
  const rows = Array.isArray(body.productions) ? body.productions : [];
  if (!targetUid || rows.length === 0 || rows.length > 100) return NextResponse.json({ error: 'יש לבחור משתמש ולהוסיף לפחות הפקה אחת' }, { status: 400 });
  const now = new Date().toISOString();
  const written: string[] = [];
  for (const row of rows) {
    const name = String(row.name || '').trim();
    const date = String(row.date || '').trim();
    const studio = String(row.studio || '').trim();
    const startTime = String(row.startTime || '').trim();
    const endTime = String(row.endTime || '').trim();
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !validTime(startTime) || !validTime(endTime)) return NextResponse.json({ error: `שורה לא תקינה: ${name || date || 'ללא שם'}` }, { status: 400 });
    const id = `manual-${generateProductionId(name, date, studio, startTime)}`;
    const weekId = getWeekId(date);
    await patchDocument(`productions/${targetUid}/weeks/${weekId}/productions/${id}`, {
      id, name, date, day: getHebrewDay(date), studio, startTime, endTime,
      status: 'scheduled', crew: [], isCurrentUserShift: true, missingCandidate: false,
      source: 'manual-admin', crewSource: 'manual', lastUpdatedBy: authUser.uid, lastUpdatedAt: now,
    });
    written.push(id);
  }
  return NextResponse.json({ ok: true, written: written.length, ids: written });
}
