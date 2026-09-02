import {
  passwordMatches, issueToken, sessionCookie, clearCookie,
  staffAuthConfigured, loginThrottled, noteFailedLogin, clearLoginAttempts,
  tokenValid, readCookie,
} from '../lib/staff-auth.js';

export default function handler(req, res) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  // GET = "am I already signed in?", so the page can skip the login form.
  if (req.method === 'GET') {
    if (!staffAuthConfigured()) {
      return res.status(503).json({ ok: false, error: 'Staff dashboard is not enabled.' });
    }
    return res.status(200).json({ ok: true, signedIn: tokenValid(readCookie(req)) });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearCookie());
    return res.status(200).json({ ok: true, signedIn: false });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!staffAuthConfigured()) {
    return res.status(503).json({
      ok: false,
      error: 'The staff dashboard is not enabled. Set STAFF_PASSWORD to turn it on.',
    });
  }

  if (loginThrottled(ip)) {
    return res.status(429).json({
      ok: false,
      error: 'Too many attempts. Please wait 15 minutes and try again.',
    });
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};

  if (!passwordMatches(body.password)) {
    noteFailedLogin(ip);
    console.warn(`[staff] failed sign-in from ${ip}`);
    // Deliberately vague, and identical timing regardless of why it failed.
    return res.status(401).json({ ok: false, error: 'That passcode is not correct.' });
  }

  clearLoginAttempts(ip);
  res.setHeader('Set-Cookie', sessionCookie(issueToken()));
  console.log(`[staff] signed in from ${ip}`);
  return res.status(200).json({ ok: true, signedIn: true });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
