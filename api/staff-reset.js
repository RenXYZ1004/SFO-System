import { requireStaff } from '../lib/staff-auth.js';
import { sql, dbConfigured } from '../lib/db.js';

/**
 * Clears every registration.
 *
 *   POST /api/staff-reset   { "confirm": "I Accept" }
 *
 * This is the "start clean" button — it exists so the test entries made while
 * the form was being built can be cleared before the real thing opens. There
 * is no undo, so the dashboard downloads a CSV of everything first.
 *
 * The typed phrase is checked here as well as in the browser: a stray fetch,
 * a mis-wired button or a replayed request should not be able to empty the
 * table on its own. The staff cookie is SameSite=Strict, so another site
 * cannot make this call at all.
 */

// Must match the phrase the dashboard asks staff to type.
const CONFIRM = 'I Accept';

export default async function handler(req, res) {
  // Set before the guard: the 401 that turns a stranger away is a response
  // like any other, and must not sit in a shared cache either.
  res.setHeader('Cache-Control', 'no-store, private');

  if (!requireStaff(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  if (!dbConfigured()) {
    return res.status(503).json({ ok: false, error: 'No database configured.' });
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  if (String(body.confirm ?? '').trim() !== CONFIRM) {
    return res.status(400).json({ ok: false, error: `Type "${CONFIRM}" exactly to confirm.` });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  try {
    const db = sql();
    // Counted before the delete so the dashboard can report what went.
    const [{ n }] = await db`SELECT count(*)::int AS n FROM registrations`;
    // RESTART IDENTITY so the next event starts from a clean id sequence.
    // References are random, so nothing else depends on where it resumes.
    await db`TRUNCATE registrations RESTART IDENTITY`;
    // warn, not log: this is the one action on the dashboard worth finding
    // again in the platform logs afterwards.
    console.warn(`[staff] registrations reset from ${ip} — ${n} row(s) deleted`);
    return res.status(200).json({ ok: true, deleted: n });
  } catch (err) {
    console.error('[staff-reset] failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not clear the registrations.' });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
