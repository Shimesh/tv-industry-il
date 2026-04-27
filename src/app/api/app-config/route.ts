import { NextResponse } from 'next/server';
import { getDocument } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const config = await getDocument<{
      maintenanceMode?: boolean;
      boardAnnouncement?: string;
      updatedAt?: string | null;
    }>('appConfig/global');

    return NextResponse.json({
      maintenanceMode: Boolean(config?.maintenanceMode),
      boardAnnouncement: String(config?.boardAnnouncement || ''),
      updatedAt: config?.updatedAt || null,
    });
  } catch {
    return NextResponse.json(
      {
        maintenanceMode: false,
        boardAnnouncement: '',
        updatedAt: null,
      },
      { status: 200 },
    );
  }
}
