import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

/**
 * A shared staff passcode guarding the registrations dashboard.
 *
 * The dashboard shows personal data — contact numbers, emergency contacts,
 * medical notes and payment receipts — so it must never be reachable without
 * this. A single shared passcode is proportionate for a small event team; if
 * you later need per-person accounts, this is the file to replace.
 *
 * Config:
 *   STAFF_PASSWORD   what staff type in. Required — no default, ever.
 *   STAFF_SECRET     key used to sign the session cookie. Optional; derived
 *                    from the password if unset, but set it explicitly so
 *                    changing the password does not have to invalidate it.
 */

const COOKIE = 'sfo_staff';
const MAX_AGE = 60 * 60 * 12;   // 12 hours — one event day

export const staffAuthConfigured = () => Boolean(process.env.STAFF_PASSWORD);

function secret() {
  if (process.env.STAFF_SECRET) return process.env.STAFF_SECRET;
  // Derived fallback so sessions are still signed with something unguessable.
  return createHmac('sha256', 'sfo-staff-derived').update(process.env.STAFF_PASSWORD || '').digest('hex');
}

/** Constant-time comparison so the passcode cannot be guessed by timing. */
export function passwordMatches(given) {
  const expected = process.env.STAFF_PASSWORD || '';
  if (!expected) return false;
  const a = Buffer.from(String(given ?? ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Hash both first so differing lengths do not leak via an early return.
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function issueToken() {
  const expires = Date.now() + MAX_AGE * 1000;
  const nonce = randomBytes(8).toString('hex');
  const payload = `${expires}.${nonce}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function tokenValid(token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expires, nonce, sig] = parts;
  const expected = createHmac('sha256', secret()).update(`${expires}.${nonce}`).digest('hex');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  return Number(expires) > Date.now();
}

export function readCookie(req, name = COOKIE) {
  const raw = req.headers?.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

export function sessionCookie(token) {
  // httpOnly so page scripts cannot read it; SameSite=Strict blocks CSRF.
  const flags = ['Path=/', `Max-Age=${MAX_AGE}`, 'HttpOnly', 'SameSite=Strict'];
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') flags.push('Secure');
  return `${COOKIE}=${encodeURIComponent(token)}; ${flags.join('; ')}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`;
}

/** Guard for every staff endpoint. Returns true when the request may proceed. */
export function requireStaff(req, res) {
  if (!staffAuthConfigured()) {
    res.status(503).json({
      ok: false,
      error: 'The staff dashboard is not enabled. Set STAFF_PASSWORD to turn it on.',
    });
    return false;
  }
  if (!tokenValid(readCookie(req))) {
    res.status(401).json({ ok: false, error: 'Please sign in.' });
    return false;
  }
  return true;
}

/* --- login throttling, per IP, on a warm instance --------------------- */
const attempts = new Map();

export function loginThrottled(ip) {
  const now = Date.now();
  const rec = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60_000);
  attempts.set(ip, rec);
  if (attempts.size > 500) attempts.clear();
  return rec.length >= 8;
}

export function noteFailedLogin(ip) {
  const rec = attempts.get(ip) || [];
  rec.push(Date.now());
  attempts.set(ip, rec);
}

export function clearLoginAttempts(ip) {
  attempts.delete(ip);
}
