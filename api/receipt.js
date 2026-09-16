import { getReceipt, driveConfigured } from '../lib/google-drive.js';
import { requireStaff } from '../lib/staff-auth.js';

/** Serves one private Google Drive receipt to signed-in staff. */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'GET only' });
  }
  res.setHeader('Cache-Control', 'no-store, private');
  if (!requireStaff(req, res)) return;
  if (!driveConfigured()) return res.status(503).json({ ok: false, error: 'File storage is not configured.' });

  const fileId = String(req.query?.p ?? '').trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
    return res.status(400).json({ ok: false, error: 'Unknown receipt.' });
  }

  try {
    const found = await getReceipt(fileId);
    if (!found) return res.status(404).json({ ok: false, error: 'That receipt no longer exists.' });

    res.setHeader('Content-Type', found.metadata?.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new Response(found.stream).arrayBuffer().then((ab) => res.end(Buffer.from(ab)));
  } catch (err) {
    console.error('[receipt] Drive fetch failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not load that receipt.' });
  }
}
