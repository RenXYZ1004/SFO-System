import { requireStaff } from '../lib/staff-auth.js';
import { sql, dbConfigured } from '../lib/db.js';
import { FORM } from '../lib/form-schema.js';
import { normaliseReference } from '../lib/reference.js';

/**
 * Registrations for the staff dashboard.
 *
 *   GET /api/staff-data                  -> newest 50, plus totals
 *   GET /api/staff-data?q=SFO-4K7M2X     -> exact reference lookup
 *   GET /api/staff-data?q=juan           -> name / email / contact search
 *   GET /api/staff-data?limit=200&offset=50
 *
 * Every response is behind requireStaff, because these rows contain contact
 * numbers, emergency contacts and medical notes.
 */

const MAX_LIMIT = 200;

export default async function handler(req, res) {
  if (!requireStaff(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'GET only' });
  }
  if (!dbConfigured()) {
    return res.status(503).json({ ok: false, error: 'No database configured.' });
  }

  // Never let a dashboard page be cached by a shared proxy.
  res.setHeader('Cache-Control', 'no-store, private');

  const q = String(req.query?.q ?? '').trim();
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query?.limit) || 50));
  const offset = Math.max(0, Number(req.query?.offset) || 0);

  try {
    const db = sql();
    let rows;
    let matchedReference = null;

    if (q) {
      // A tidy reference wins outright — that is the race-day path.
      const ref = normaliseReference(q);
      if (ref) {
        matchedReference = ref;
        rows = await db`
          SELECT reference, created_at, full_name, email, proof_url,
                 answers, sheet_synced, sheet_error, email_sent, email_error
            FROM registrations
           WHERE reference = ${ref}`;
      }
      if (!rows || rows.length === 0) {
        const like = `%${q.replace(/[%_]/g, (c) => '\\' + c)}%`;
        rows = await db`
          SELECT reference, created_at, full_name, email, proof_url,
                 answers, sheet_synced, sheet_error, email_sent, email_error
            FROM registrations
           WHERE reference ILIKE ${like}
              OR full_name ILIKE ${like}
              OR email     ILIKE ${like}
              OR answers::text ILIKE ${like}
           ORDER BY created_at DESC
           LIMIT ${limit}`;
        matchedReference = null;
      }
    } else {
      rows = await db`
        SELECT reference, created_at, full_name, email, proof_url,
               answers, sheet_synced, sheet_error, email_sent, email_error
          FROM registrations
         ORDER BY created_at DESC
         LIMIT ${limit} OFFSET ${offset}`;
    }

    const [{ total }] = await db`SELECT count(*)::int AS total FROM registrations`;

    // Per-category and per-shirt-size counts, so staff can see the split
    // without exporting anything.
    const categoryField = FORM.fields.find((f) => /race|category|distance/i.test(f.label));
    const shirtField = FORM.fields.find((f) => /shirt|size/i.test(f.label));
    const breakdown = {};
    for (const [key, field] of [['category', categoryField], ['shirt', shirtField]]) {
      if (!field) { breakdown[key] = null; continue; }
      const counts = await db`
        SELECT answers ->> ${field.label} AS value, count(*)::int AS n
          FROM registrations
         WHERE answers ->> ${field.label} IS NOT NULL
         GROUP BY 1 ORDER BY 2 DESC`;
      breakdown[key] = { label: field.label, counts };
    }

    const problems = await db`
      SELECT count(*)::int AS n FROM registrations
       WHERE sheet_synced = FALSE OR email_sent = FALSE`;

    return res.status(200).json({
      ok: true,
      total,
      returned: rows.length,
      matchedReference,
      needsAttention: problems[0].n,
      fields: FORM.fields.map((f) => ({ label: f.label, type: f.type })),
      breakdown,
      rows,
    });
  } catch (err) {
    console.error('[staff-data] query failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not read registrations.' });
  }
}
