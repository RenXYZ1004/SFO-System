/**
 * Creates the Registrations tab and writes its header row.
 *   npm run sheet:init
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

const { sheetId, sheetTab, ensureSheet, headerRow, sheetsConfigured } = await import('../lib/sheets.js');

if (!sheetsConfigured()) {
  console.error('Not configured yet. Needs SHEET_ID plus GOOGLE_CLIENT_ID / _SECRET / _REFRESH_TOKEN.');
  console.error('Run "npm run token" first, then put SHEET_ID in .env.local.');
  process.exit(1);
}

console.log(`Spreadsheet: ${sheetId()}`);
console.log(`Tab        : ${sheetTab()}\n`);

try {
  const r = await ensureSheet();
  if (r.headers === 'written') console.log('Header row written.');
  else if (r.headers === 'match') console.log('Header row already correct.');
  else {
    console.log('Header row exists but differs from the form fields.');
    console.log('  in sheet:', (r.existing || []).join(' | '));
    console.log('  expected:', headerRow().join(' | '));
    console.log('\nLeft untouched. Clear row 1 and re-run to rewrite it.');
  }
  console.log(`\nColumns (${headerRow().length}):`);
  headerRow().forEach((h, i) => console.log(`  ${String(i + 1).padStart(2)}. ${h}`));
  console.log('');
} catch (err) {
  console.error('\nFailed:', err.message);
  process.exit(1);
}
