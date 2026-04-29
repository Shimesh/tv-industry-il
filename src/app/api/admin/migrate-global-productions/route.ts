import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { runQuery, patchDocument } from '@/lib/server/firestoreAdminRest';

// GlobalProductionDoc is fully JSON-serializable; cast satisfies FirestorePrimitive at runtime
function writeDoc(path: string, data: Record<string, unknown>): Promise<void> {
  return patchDocument(path, data as unknown as Record<string, string>);
}
import { toGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import type { Production } from '@/lib/productionDiff';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RawProductionDoc = Record<string, unknown> & {
  id?: string;
  date?: string;
  name?: string;
  lastUpdatedAt?: string;
  lastUpdatedBy?: string;
  _path?: string;
  crew?: unknown[];
};

function shouldInclude(path: string, doc: RawProductionDoc): boolean {
  return path.includes('/weeks/') && !!doc.name && !!doc.date && Array.isArray(doc.crew);
}

function extractSourcePath(fullPath: string): string {
  // e.g. "productions/{uid}/weeks/{weekId}/productions/{prodId}"
  //  → "productions/{uid}/weeks/{weekId}"
  const parts = fullPath.split('/');
  const weeksIdx = parts.indexOf('weeks');
  return weeksIdx >= 0 ? parts.slice(0, weeksIdx + 2).join('/') : fullPath;
}

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  let dryRun = true;
  try {
    const body = await request.json();
    dryRun = body.dryRun !== false;
  } catch {
    // default to dryRun = true for safety
  }

  try {
    // Fetch all production documents across all users (same query as contactsSync)
    const allDocs = await runQuery<RawProductionDoc>({
      from: [{ collectionId: 'productions', allDescendants: true }],
      limit: 5000,
    });

    // Filter to only real production docs (not week-metadata docs)
    const filtered = allDocs.filter((doc) =>
      shouldInclude(String(doc._path || ''), doc),
    );

    // Dedup by production id — keep the most recently updated version
    const byId = new Map<string, RawProductionDoc>();
    for (const doc of filtered) {
      const id = doc.id as string | undefined;
      if (!id) continue;
      const existing = byId.get(id);
      if (!existing || String(doc.lastUpdatedAt ?? '') > String(existing.lastUpdatedAt ?? '')) {
        byId.set(id, doc);
      }
    }

    const unique = Array.from(byId.values());

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        total: allDocs.length,
        filtered: filtered.length,
        unique: unique.length,
        message: 'Dry run complete — no writes performed',
      });
    }

    // Write in batches of 50
    const BATCH = 50;
    let written = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < unique.length; i += BATCH) {
      const batch = unique.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (raw) => {
          const prod = raw as unknown as Production;
          if (!prod.id || !prod.date || !prod.name) {
            skipped++;
            return;
          }
          const sourcePath = extractSourcePath(String(raw._path || ''));
          const uploaderUid = (raw.lastUpdatedBy as string) || 'migration';
          const doc: GlobalProductionDoc = toGlobalProduction(prod, uploaderUid, sourcePath);
          await writeDoc(
            `global_productions/${doc.id}`,
            doc as unknown as Record<string, unknown>,
          );
          written++;
        }),
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        }
      }
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      total: allDocs.length,
      filtered: filtered.length,
      unique: unique.length,
      written,
      skipped,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    console.error('[migrate-global-productions]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Migration failed' },
      { status: 500 },
    );
  }
}
