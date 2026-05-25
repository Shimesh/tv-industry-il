import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminFirestore } from '@/lib/server/firebaseAdmin';

export const runtime = 'nodejs';

type AttachmentRouteContext = {
  params: Promise<{ attachmentId: string }>;
};

type AttachmentDoc = {
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  chunkCount?: number;
  token?: string;
};

type AdminDocumentSnapshot = {
  exists: boolean;
  data: () => unknown;
};

type AdminChunkCollection = {
  orderBy: (field: string, direction: 'asc' | 'desc') => {
    get: () => Promise<{ docs: Array<{ data: () => { data?: unknown } }> }>;
  };
};

type AdminDocumentRef = {
  get: () => Promise<AdminDocumentSnapshot>;
  collection: (path: string) => AdminChunkCollection;
};

type AdminFirestoreDb = {
  doc: (path: string) => AdminDocumentRef;
};

export async function GET(request: NextRequest, context: AttachmentRouteContext) {
  const { attachmentId } = await context.params;
  const token = request.nextUrl.searchParams.get('token') || '';

  if (!attachmentId || !token) {
    return NextResponse.json({ error: 'קישור קובץ לא תקין' }, { status: 400 });
  }

  try {
    const db = getFirebaseAdminFirestore() as unknown as AdminFirestoreDb;
    const attachmentRef = db.doc(`chatAttachments/${attachmentId}`);
    const attachmentSnap = await attachmentRef.get();
    const attachment = attachmentSnap.data() as AttachmentDoc | undefined;

    if (!attachmentSnap.exists || !attachment || attachment.token !== token) {
      return NextResponse.json({ error: 'הקובץ לא נמצא' }, { status: 404 });
    }

    const chunksSnap = await attachmentRef.collection('chunks').orderBy('index', 'asc').get();
    const buffers = (chunksSnap.docs as Array<{ data: () => { data?: unknown } }>)
      .map((docSnap) => docSnap.data().data)
      .filter((value): value is string => typeof value === 'string')
      .map((value) => Buffer.from(value, 'base64'));

    if (buffers.length === 0 || (attachment.chunkCount && buffers.length !== attachment.chunkCount)) {
      return NextResponse.json({ error: 'הקובץ לא שלם' }, { status: 500 });
    }

    const body = Buffer.concat(buffers);
    const headers = new Headers({
      'Content-Type': attachment.mimeType || 'application/octet-stream',
      'Content-Length': String(body.length),
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName || 'attachment')}`,
    });

    return new NextResponse(body, { status: 200, headers });
  } catch (error) {
    console.error('[chat-attachments] download failed:', error);
    return NextResponse.json({ error: 'טעינת הקובץ נכשלה' }, { status: 500 });
  }
}
