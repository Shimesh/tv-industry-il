import { NextResponse } from 'next/server';
import { getDocument } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const config = await getDocument<{
      maintenanceMode?: boolean;
      boardAnnouncement?: string;
      ratingsAutomation?: {
        midrugEnabled?: boolean;
        telegramEnabled?: boolean;
        weeklyMode?: 'sunday' | 'always';
        cronSchedule?: string;
        cronTimezone?: string;
      };
      updatedAt?: string | null;
    }>('appConfig/global');

    return NextResponse.json({
      maintenanceMode: Boolean(config?.maintenanceMode),
      boardAnnouncement: String(config?.boardAnnouncement || ''),
      ratingsAutomation: {
        midrugEnabled: config?.ratingsAutomation?.midrugEnabled !== false,
        telegramEnabled: config?.ratingsAutomation?.telegramEnabled !== false,
        weeklyMode: config?.ratingsAutomation?.weeklyMode === 'always' ? 'always' : 'sunday',
        cronSchedule: '0 6 * * *',
        cronTimezone: 'UTC',
      },
      updatedAt: config?.updatedAt || null,
    });
  } catch {
    return NextResponse.json(
      {
        maintenanceMode: false,
        boardAnnouncement: '',
        ratingsAutomation: {
          midrugEnabled: true,
          telegramEnabled: true,
          weeklyMode: 'sunday',
          cronSchedule: '0 6 * * *',
          cronTimezone: 'UTC',
        },
        updatedAt: null,
      },
      { status: 200 },
    );
  }
}
