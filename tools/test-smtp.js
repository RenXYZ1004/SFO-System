/**
 * Proves the Gmail credentials work before anything is deployed.
 *   node tools/test-smtp.js you@example.com
 * Reads GMAIL_USER / GOOGLE_* from the environment or .env.local
 */
import { readFileSync, existsSync } from 'node:fs';
import { createTransport, sendConfirmation, explainMailError, missingEnv } from '../lib/mailer.js';
import { confirmationHtml, confirmationText } from '../lib/template.js';

// Minimal .env.local loader so this works without extra dependencies.
for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('Usage: node tools/test-smtp.js <recipient@example.com>');
  process.exit(1);
}

const miss = missingEnv();
if (miss.length) {
  console.error('Missing environment variables:', miss.join(', '));
  console.error('Set them in .env.local, or run tools/get-refresh-token.js first.');
  process.exit(1);
}

console.log(`Auth  : ${process.env.SMTP_PASSWORD ? 'App Password' : 'OAuth2 (XOAUTH2)'}`);
console.log(`Sender: ${process.env.GMAIL_USER}`);
console.log(`To    : ${to}\n`);

try {
  console.log('Verifying SMTP connection…');
  await createTransport().verify();
  console.log('Connection and credentials OK. Sending test message…');

  const answers = [['Full name', 'SMTP Test'], ['Email', to], ['Course', 'Connectivity check']];
  const when = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Manila' });
  const id = await sendConfirmation({
    to, name: 'SMTP Test',
    subject: 'SMTP test — Registration System',
    html: confirmationHtml({ answers, appName: 'Registration System', ref: 'TESTONLY', when }),
    text: confirmationText({ answers, appName: 'Registration System', ref: 'TESTONLY', when }),
  });
  console.log(`\nSENT. Message id: ${id}\nCheck the inbox (and the spam folder).`);
} catch (err) {
  console.error('\nFAILED:', explainMailError(err));
  process.exit(1);
}
