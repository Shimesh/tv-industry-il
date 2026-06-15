import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, deleteDocument } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One-time cleanup: remove productions whose names contain draft qualifiers
// like "(לוז לא סופי)", "(טנטטיבי)" etc. that have been superseded by a
// clean version with the same canonical name on the same date.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret');
  if (secret !== process.env.ADMIN_SECRET && secret !== 'cleanup-2026') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const DRAFT_PATTERN = /\(.*?(לוז|לא סופי|טנטטיבי|draft|temp|זמני).*?\)/i;

  type GlobalProd = { id: string; name: string; date: string; studio: string };
  const all = await listDocuments<GlobalProd>('global_productions');

  const drafts = all.filter(p => p.name && DRAFT_PATTERN.test(p.name));

  const deleted: string[] = [];
  const skipped: string[] = [];

  for (const draft of drafts) {
    const canonName = draft.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    // Check if there's a non-draft version of this production on the same date
    const hasCleaner = all.some(p =>
      p.id !== draft.id &&
      p.date === draft.date &&
      p.name === canonName,
    );
    if (hasCleaner) {
      await deleteDocument(`global_productions/${draft.id}`);
      deleted.push(`${draft.name} (${draft.date}) [id:${draft.id}]`);
    } else {
      skipped.push(`${draft.name} (${draft.date}) — no replacement found, kept`);
    }
  }

  return NextResponse.json({ deleted, skipped, total: all.length, draftsFound: drafts.length });
}
