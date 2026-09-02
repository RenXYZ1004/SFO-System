/**
 * Checks every moving part of the system and says exactly what is missing.
 *
 *   npm run doctor
 *
 * Reads .env.local (then .env) so it tests the same values the app will use.
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

const OK = 'PASS', BAD = 'FAIL', WARN = 'WARN';
const results = [];
const add = (area, state, msg, fix = '') => results.push({ area, state, msg, fix });

/* ---------- 1. the Google Sheet mirror ---------- */

const { FORM } = await import('../lib/form-schema.js');
add('Fields', OK, `${FORM.fields.length} questions defined in lib/form-schema.js`);

const { sheetsConfigured, sheetId, sheetTab, ensureSheet, headerRow } = await import('../lib/sheets.js');
const { oauthConfigured } = await import('../lib/google-auth.js');

if (!sheetId()) {
  add('Sheet', BAD, 'SHEET_ID is not set',
    'Open the Google Sheet and copy the id from its URL:\n' +
    '     docs.google.com/spreadsheets/d/<THIS PART>/edit');
} else if (!oauthConfigured()) {
  add('Sheet', BAD, 'SHEET_ID is set but Google OAuth is not',
    'Run "npm run token" — the same consent covers Gmail and Sheets.');
} else {
  try {
    const r = await ensureSheet();
    if (r.headers === 'differ') {
      add('Sheet', WARN,
        `tab "${sheetTab()}" exists but its header row does not match the form`,
        'Existing headers are left alone. Clear row 1 and re-run to rewrite them.');
    } else {
      add('Sheet', OK,
        `tab "${sheetTab()}" ready, ${headerRow().length} columns (${r.headers === 'written' ? 'headers written' : 'headers match'})`);
    }
  } catch (err) {
    add('Sheet', BAD, err.message);
  }
}

/* ---------- 2. SMTP ---------- */

const usingOAuth = !process.env.SMTP_PASSWORD;
const smtpVars = usingOAuth
  ? ['GMAIL_USER', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']
  : ['GMAIL_USER', 'SMTP_PASSWORD'];
const missingSmtp = smtpVars.filter((v) => !process.env[v]);

if (missingSmtp.length) {
  add('SMTP config', BAD, `missing ${missingSmtp.join(', ')}`,
    usingOAuth
      ? 'Run "npm run token" to mint a refresh token, then put the values in .env.local.'
      : 'Set SMTP_PASSWORD to a 16-character Gmail App Password.');
} else {
  add('SMTP config', OK, `${usingOAuth ? 'OAuth2 (XOAUTH2)' : 'App Password'} as ${process.env.GMAIL_USER}`);

  try {
    const { createTransport, explainMailError } = await import('../lib/mailer.js');
    await createTransport().verify();
    add('SMTP login', OK, 'connected to smtp.gmail.com:587 and authenticated');
  } catch (err) {
    const { explainMailError } = await import('../lib/mailer.js');
    add('SMTP login', BAD, explainMailError(err),
      'Then re-run this. "npm run test:smtp you@example.com" sends a real message.');
  }
}

/* ---------- 3. Database (source of truth) ---------- */

const { dbConfigured, connectionString, sql } = await import('../lib/db.js');

if (!dbConfigured()) {
  add('Database', BAD, 'no DATABASE_URL / POSTGRES_URL set',
    'Vercel -> Storage -> Create -> Neon (Postgres) -> connect to this project,\n' +
    '     then copy DATABASE_URL into .env.local and run "npm run db:init".');
} else {
  let host = 'unknown host';
  try { host = new URL(connectionString()).host; } catch {}
  try {
    const rows = await sql()`SELECT to_regclass('public.registrations') AS t`;
    if (!rows[0].t) {
      add('Database', BAD, `connected to ${host}, but the registrations table is missing`,
        'Run "npm run db:init".');
    } else {
      const [{ n }] = await sql()`SELECT count(*)::int AS n FROM registrations`;
      add('Database', OK, `connected to ${host} — ${n} registration(s) stored`);
    }
  } catch (err) {
    add('Database', BAD, `could not query ${host}: ${err.message}`,
      'Check DATABASE_URL is complete and the database allows connections.');
  }
}

/* ---------- 4. Vercel Blob (proof-of-payment uploads) ---------- */

const needsBlob = FORM.fields.some((f) => f.type === 'file');
if (!needsBlob) {
  add('Blob storage', OK, 'no file-upload field, so none needed');
} else if (!(await import('../lib/blob-token.js')).blobConfigured()) {
  add('Blob storage', BAD, 'BLOB_READ_WRITE_TOKEN is not set',
    'Vercel dashboard -> Storage -> Create -> Blob -> connect to this project,\n' +
    '     then copy the token into .env.local for local runs.');
} else {
  try {
    const { list } = await import('@vercel/blob');
    const { blobToken } = await import('../lib/blob-token.js');
    const out = await list({ limit: 1, token: blobToken() });
    add('Blob storage', OK, `store reachable (${out.blobs.length ? 'has files' : 'empty'})`);
  } catch (err) {
    add('Blob storage', BAD, `token set but the store rejected it: ${err.message}`,
      'Check the token belongs to a store connected to this project.');
  }
}

/* ---------- report ---------- */

const pad = (s, n) => String(s).padEnd(n);
const colour = { PASS: '\x1b[32m', FAIL: '\x1b[31m', WARN: '\x1b[33m' };
const reset = '\x1b[0m';

console.log('\n  Southville Run For A Cause — setup check\n');
console.log('  ' + pad('CHECK', 15) + pad('', 8) + 'DETAIL');
console.log('  ' + '-'.repeat(74));
for (const r of results) {
  console.log(`  ${pad(r.area, 15)}${colour[r.state]}${pad(r.state, 8)}${reset}${r.msg}`);
}

const failed = results.filter((r) => r.state === BAD);
console.log('');
if (!failed.length) {
  console.log('  Everything is wired up. Registrations will record and email.\n');
} else {
  console.log(`  ${failed.length} thing${failed.length > 1 ? 's' : ''} still to fix:\n`);
  failed.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.area}: ${r.msg}`);
    if (r.fix) console.log(`     -> ${r.fix}`);
  });
  console.log('');
}

process.exitCode = failed.length ? 1 : 0;
