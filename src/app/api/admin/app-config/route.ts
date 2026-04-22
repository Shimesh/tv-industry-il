import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';
import { recordRouteMetric, recordSystemEvent } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

type AppConfigPayload = {
  maintenanceMode?: boolean;
  boardAnnouncement?: string;
};

export async function GET(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  try {
    const config = await getDocument<{
      maintenanceMode?: boolean;
      boardAnnouncement?: string;
      updatedAt?: string | null;
    }>('appConfig/global');

    await recordRouteMetric({ route: '/api/admin/app-config', ok: true, statusCode: 200 });
    return NextResponse.json({
      maintenanceMode: Boolean(config?.maintenanceMode),
      boardAnnouncement: String(config?.boardAnnouncement || ''),
      updatedAt: config?.updatedAt || null,
    });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/app-config',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load app config' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  try {
    const body = (await request.json()) as AppConfigPayload;
    const current = await getDocument<{
      maintenanceMode?: boolean;
      boardAnnouncement?: string;
    }>('appConfig/global');

    const nextConfig = {
      maintenanceMode:
        typeof body.maintenanceMode === 'boolean'
          ? body.maintenanceMode
          : Boolean(current?.maintenanceMode),
      boardAnnouncement:
        typeof body.boardAnnouncement === 'string'
          ? body.boardAnnouncement.trim()
          : String(current?.boardAnnouncement || ''),
      updatedAt: new Date().toISOString(),
    };

    await patchDocument('appConfig/global', nextConfig);
    await recordSystemEvent({
      type: 'app_config_update',
      level: 'success',
      source: 'admin',
      message: 'הגדרות המערכת הגלובליות עודכנו',
      detail: `updatedBy=${authUser.uid}`,
    });
    await recordRouteMetric({ route: '/api/admin/app-config', ok: true, statusCode: 200 });

    return NextResponse.json({ success: true, ...nextConfig });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/app-config',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update app config' },
      { status: 500 },
    );
  }
}
