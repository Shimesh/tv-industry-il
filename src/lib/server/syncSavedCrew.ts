import { syncContactsFromProductions } from '@/lib/server/contactsSync';
import { recordJobMetric } from '@/lib/server/adminTelemetry';

/** Await directory discovery before reporting a successful calendar import. */
export async function syncSavedCrew(
  productions: Parameters<typeof syncContactsFromProductions>[0],
) {
  try {
    const result = await syncContactsFromProductions(productions, true);
    await recordJobMetric({
      job: 'contacts-reconcile', ok: true,
      message: `עודכנו אנשי הצוות מהיומן: ${result.created} חדשים, ${result.updated} עודכנו`,
      detail: result,
    }).catch((error) => console.error('[contacts-reconcile] telemetry', error));
    return result;
  } catch (error) {
    console.error('[contacts-reconcile] saved crew sync failed', error);
    await recordJobMetric({
      job: 'contacts-reconcile', ok: false,
      message: 'ההפקות נשמרו, אך עדכון אנשי הקשר נכשל. נדרש סנכרון חוזר.',
      detail: error instanceof Error ? error.message : String(error),
    }).catch((metricError) => console.error('[contacts-reconcile] telemetry', metricError));
    throw new Error('ההפקות נשמרו, אך עדכון האלפון נכשל. יש להריץ שוב סנכרון אנשי קשר.');
  }
}
