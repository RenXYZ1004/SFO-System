/**
 * One-time helper: exchanges a Google OAuth consent for a REFRESH TOKEN
 * that Nodemailer can use forever (as long as the consent screen is
 * "Internal" or the app is Published).
 *
 *   node tools/get-refresh-token.js
 *
 * Google Cloud Console setup first:
 *   1. APIs & Services -> Library -> enable "Gmail API".
 *   2. OAuth consent screen -> User type INTERNAL  (critical: "Testing"
 *      expires refresh tokens after 7 days).
 *   3. Credentials -> Create OAuth client ID -> Web application.
 *      Authorised redirect URI:  http://localhost:5555/oauth2callback
 *   4. Copy the Client ID and Client secret from THAT SAME client and put
 *      them below (or in the environment) — a mismatched pair is the
 *      "invalid_client" error.
 */

import http from 'node:http';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const PORT = 5555;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = 'https://mail.google.com/';

const rl = createInterface({ input: stdin, output: stdout });
const clientId = process.env.GOOGLE_CLIENT_ID || (await rl.question('Client ID: ')).trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || (await rl.question('Client secret: ')).trim();
rl.close();

if (!clientId || !clientSecret) {
  console.error('Both a client id and a client secret are required.');
  process.exit(1);
}

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token to be returned every time
  });

console.log('\nOpen this URL in the browser, signed in as the SENDING mailbox:\n');
console.log(authUrl + '\n');
console.log(`Waiting for the redirect on ${REDIRECT} …`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404).end('Not found');
    return;
  }

  const err = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  if (err || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html' })
       .end(`<h2>Authorisation failed</h2><p>${err || 'no code returned'}</p>`);
    console.error('\nAuthorisation failed:', err || 'no code returned');
    server.close();
    process.exit(1);
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });
  const tok = await tokenRes.json();

  if (!tokenRes.ok || !tok.refresh_token) {
    res.writeHead(500, { 'Content-Type': 'text/html' })
       .end('<h2>Token exchange failed</h2><p>See the terminal.</p>');
    console.error('\nToken exchange failed:', JSON.stringify(tok, null, 2));
    if (tok.error === 'invalid_client') {
      console.error('\ninvalid_client => the client id and secret are not from the same OAuth client.');
    }
    if (!tok.refresh_token && tokenRes.ok) {
      console.error('\nNo refresh_token returned. Revoke prior access at');
      console.error('https://myaccount.google.com/permissions and run this again.');
    }
    server.close();
    process.exit(1);
  }

  res.writeHead(200, { 'Content-Type': 'text/html' })
     .end('<h2>Done</h2><p>Refresh token issued. You can close this tab and return to the terminal.</p>');

  console.log('\n=== Add these to Vercel -> Settings -> Environment Variables ===\n');
  console.log(`GOOGLE_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
  console.log(`GOOGLE_REFRESH_TOKEN=${tok.refresh_token}`);
  console.log('\n(Keep the refresh token secret — it grants access to send as that mailbox.)');
  console.log('\nReminder: if the OAuth consent screen is still in "Testing", this token');
  console.log('dies in 7 days. Set it to "Internal" to make it permanent.\n');

  server.close();
  process.exit(0);
});

server.listen(PORT);
