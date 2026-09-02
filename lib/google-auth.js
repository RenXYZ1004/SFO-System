/**
 * Exchanges the Google OAuth refresh token for a short-lived access token,
 * cached in memory until it is nearly expired.
 *
 * This is the SAME OAuth client already used for Gmail SMTP — adding the
 * Sheets scope to it means no second credential to set up or rotate.
 */

let cached = { token: '', expiresAt: 0 };

export function oauthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
}

/** For tests. */
export function __resetTokenCache() { cached = { token: '', expiresAt: 0 }; }

export async function getAccessToken() {
  if (!oauthConfigured()) {
    throw new Error('Google OAuth is not configured (GOOGLE_CLIENT_ID / _SECRET / _REFRESH_TOKEN).');
  }
  if (cached.token && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const code = data.error || `HTTP ${res.status}`;
    throw new Error(explainTokenError(code, data.error_description));
  }

  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

export function explainTokenError(code, detail = '') {
  if (code === 'invalid_client') {
    return 'invalid_client — GOOGLE_CLIENT_SECRET does not match GOOGLE_CLIENT_ID. ' +
           'Re-copy both from the SAME OAuth client in Google Cloud Console.';
  }
  if (code === 'invalid_grant') {
    return 'invalid_grant — the refresh token is expired or revoked. If the OAuth consent ' +
           'screen is still in "Testing", Google kills refresh tokens after 7 days; set it ' +
           'to "Internal" and re-run "npm run token".';
  }
  if (code === 'invalid_scope' || /scope/i.test(detail)) {
    return 'The token is missing a required scope. Re-run "npm run token" so the consent ' +
           'includes both Gmail and Sheets.';
  }
  return `${code}${detail ? ` — ${detail}` : ''}`;
}
