import { requireStaff } from '../lib/staff-auth.js';
import { getDriveFile, getDriveFileMetadata, driveConfigured } from '../lib/google-drive.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'GET only' });
  }
  res.setHeader('Cache-Control', 'no-store, private');
  if (!requireStaff(req, res)) return;
  if (!driveConfigured()) return res.status(503).json({ ok: false, error: 'File storage is not configured.' });

  const id = String(req.query?.id ?? '').trim();
  if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) {
    return res.status(400).json({ ok: false, error: 'Unknown receipt.' });
  }

  try {
    const meta = await getDriveFileMetadata(id);
    if (!meta) return res.status(404).json({ ok: false, error: 'That receipt no longer exists.' });
    const found = await getDriveFile(id);
    if (!found) return res.status(404).json({ ok: false, error: 'That receipt no longer exists.' });

    res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${String(meta.name || 'receipt').replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (meta.size) res.setHeader('Content-Length', meta.size);
    const buf = Buffer.from(await found.arrayBuffer());
    return res.status(200).end(buf);
  } catch (err) {
    console.error('[receipt] Drive fetch failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not load that receipt.' });
  }
}
