const { main } = require('../functions/calendar-sync.cjs');

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
