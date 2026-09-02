import { get } from '@vercel/blob';
import { requireStaff } from '../lib/staff-auth.js';

/**
 * Serves one proof-of-payment file to signed-in staff.
 *
 *   GET /api/receipt?p=proof-of-payment/2026-11-22/receipt-x9f2.png
 *
 * Receipts are stored with private access, so this route is the only way to
 * see one — a stray link in a spreadsheet is useless to anyone without a
 * staff session. The blob pathname is never trusted as a filesystem path; it
 * is passed straight to the Blob API, which only ever looks inside our store.
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'GET only' });
  }
  if (!requireStaff(req, res)) return;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ ok: false, error: 'File storage is not configured.' });
  }

  const pathname = String(req.query?.p ?? '').trim();
  if (!pathname || !pathname.startsWith('proof-of-payment/')) {
    return res.status(400).json({ ok: false, error: 'Unknown receipt.' });
  }

  try {
    const found = await get(pathname, { access: 'private' });
    if (!found) return res.status(404).json({ ok: false, error: 'That receipt no longer exists.' });

    const type = found.blob?.contentType || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    // Shown in the browser, never cached by a shared proxy.
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const buf = Buffer.from(await new Response(found.stream).arrayBuffer());
    res.statusCode = 200;
    return res.end(buf);
  } catch (err) {
    console.error('[receipt] fetch failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not load that receipt.' });
  }
}
