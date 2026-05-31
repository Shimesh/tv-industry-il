export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { checkAndAnnounceVersion } = await import('@/lib/server/announceVersion');
      await checkAndAnnounceVersion();
    } catch {
      // Non-fatal — VersionAnnouncer client component serves as fallback
    }
  }
}
