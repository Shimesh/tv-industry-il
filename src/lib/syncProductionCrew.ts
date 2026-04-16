export type SyncResult = {
  scanned: number;
  crewFound: number;
  added: number;
  skipped: number;
};

export async function syncProductionCrew(): Promise<SyncResult> {
  // TODO: implement real production crew sync logic.
  // For now this helper is a safe stub so the admin page compiles.
  return {
    scanned: 0,
    crewFound: 0,
    added: 0,
    skipped: 0,
  };
}
