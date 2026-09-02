/**
 * Creates the registrations table. Safe to run repeatedly.
 *   npm run db:init
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
for (const file of ['.env.local', '.env']) {
  const p = path.join(root, file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const { dbConfigured, connectionString, initSchema, sql } = await import('../lib/db.js');

if (!dbConfigured()) {
  console.error('No DATABASE_URL (or POSTGRES_URL) found.');
  console.error('Add it to .env.local, then run this again.');
  process.exit(1);
}

const host = (() => {
  try { return new URL(connectionString()).host; } catch { return 'unknown host'; }
})();
console.log(`Connecting to ${host} ...`);

try {
  await initSchema();
  const rows = await sql()`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_name = 'registrations'
     ORDER BY ordinal_position`;
  console.log(`\nTable "registrations" ready — ${rows.length} columns:\n`);
  for (const r of rows) console.log(`  ${r.column_name.padEnd(16)} ${r.data_type}`);
  const [{ n }] = await sql()`SELECT count(*)::int AS n FROM registrations`;
  console.log(`\n${n} registration(s) currently stored.\n`);
} catch (err) {
  console.error('\nFailed:', err.message);
  if (/password|auth/i.test(err.message)) console.error('Check the credentials in the connection string.');
  if (/ENOTFOUND|ETIMEDOUT/i.test(err.message)) console.error('Check the host is reachable and the string is complete.');
  process.exit(1);
}
