const { main } = require('../functions/calendar-sync.cjs');

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal sync error:', error);
    process.exit(1);
  });
}
