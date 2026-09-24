import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('./register-project-ts.cjs');
require('@next/env').loadEnvConfig(process.cwd());
const { syncContactsFromSavedProductions } = require('../src/lib/server/contactsSync.ts');

// Default to a read-only preview. --apply uses the exact service used by the app.
try {
  const apply = process.argv.includes('--apply');
  const result = await syncContactsFromSavedProductions(apply);
  console.log(JSON.stringify({ apply, ...result }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
