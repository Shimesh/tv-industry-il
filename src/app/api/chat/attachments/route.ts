import { randomBytes, randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { unauthorizedResponse, verifyAuthToken } from '@/lib/apiAuth';
import { getFirebaseAdminFirestore } from '@/lib/server/firebaseAdmin';

export const runtime = 'nodejs';

const MAX_ATTACHMENT_BYTES = 3.5 * 1024 * 1024;
const CHUNK_BYTES = 512 * 1024;

type AdminDocumentRef = {
  get: () => Promise<{ exists: boolean; data: () => unknown }>;
  collection: (path: string) => { doc: (id: string) => AdminDocumentRef };
};

type AdminFirestoreDb = {
  doc: (path: string) => AdminDocumentRef;
  batch: () => {
    set: (ref: AdminDocumentRef, data: Record<string, unknown>) => void;
    commit: () => Promise<unknown>;
  };
};

function cleanFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140) || 'attachment';
}

function getOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'http';
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  try {
    const form = await request.formData();
    const chatId = String(form.get('chatId') || '').trim();
    const file = form.get('file');
    const duration = Number(form.get('duration') || 0);

    if (!chatId || !(file instanceof File)) {
      return NextResponse.json({ error: 'חסר קובץ או מזהה שיחה' }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: 'הקובץ ריק' }, { status: 400 });
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({
        error: 'הקובץ גדול מדי להעלאה זמנית. עד שיופעל Firebase Storage אפשר להעלות קבצים עד 3.5MB.',
      }, { status: 413 });
    }

    const db = getFirebaseAdminFirestore() as unknown as AdminFirestoreDb;
    const chatRef = db.doc(`chats/${chatId}`);
    const chatSnap = await chatRef.get();
    const chatData = chatSnap.data() as { members?: string[] } | undefined;

    if (!chatSnap.exists || !Array.isArray(chatData?.members) || !chatData.members.includes(authUser.uid)) {
      return NextResponse.json({ error: 'אין הרשאה להעלות קובץ לשיחה הזו' }, { status: 403 });
    }

    const attachmentId = randomUUID();
    const token = randomBytes(24).toString('base64url');
    const safeFileName = cleanFileName(file.name || 'attachment');
    const mimeType = file.type || 'application/octet-stream';
    const bytes = Buffer.from(await file.arrayBuffer());
    const chunkCount = Math.ceil(bytes.length / CHUNK_BYTES);
    const attachmentRef = db.doc(`chatAttachments/${attachmentId}`);
    const batch = db.batch();

    batch.set(attachmentRef, {
      chatId,
      uploaderId: authUser.uid,
      fileName: safeFileName,
      mimeType,
      sizeBytes: bytes.length,
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
      chunkCount,
      token,
      createdAt: FieldValue.serverTimestamp(),
    });

    for (let index = 0; index < chunkCount; index += 1) {
      const start = index * CHUNK_BYTES;
      const end = Math.min(start + CHUNK_BYTES, bytes.length);
      batch.set(attachmentRef.collection('chunks').doc(String(index).padStart(5, '0')), {
        index,
        data: bytes.subarray(start, end).toString('base64'),
      });
    }

    await batch.commit();

    const url = `${getOrigin(request)}/api/chat/attachments/${attachmentId}?token=${encodeURIComponent(token)}`;

    return NextResponse.json({
      ok: true,
      attachment: {
        id: attachmentId,
        url,
        fileName: safeFileName,
        mimeType,
        sizeBytes: bytes.length,
        durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
      },
    });
  } catch (error) {
    console.error('[chat-attachments] upload failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'העלאת הקובץ נכשלה',
    }, { status: 500 });
  }
}
