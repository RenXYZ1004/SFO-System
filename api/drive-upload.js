import { uploadToDrive, deleteDriveFile, driveConfigured } from '../lib/google-drive.js';

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = { 'image/webp': 'webp', 'application/pdf': 'pdf' };
const SIGNATURES = [
  { ext: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
];

function sniff(buf) {
  for (const sig of SIGNATURES) {
    if (sig.bytes.every((b, i) => buf[i] === b)) return sig.ext;
  }
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
      buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'binary');
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BYTES + 1024) throw new Error('TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const safeName = (s) => String(s || 'receipt')
  .replace(/[^a-zA-Z0-9._-]/g, '_')
  .replace(/_{2,}/g, '_')
  .slice(-80) || 'receipt';

const uploads = new Map();
function uploadThrottled(ip) {
  const now = Date.now();
  const recent = (uploads.get(ip) || []).filter((t) => now - t < 60 * 60_000);
  recent.push(now);
  uploads.set(ip, recent);
  if (uploads.size > 500) uploads.clear();
  return recent.length > 12;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (uploadThrottled(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many uploads from this connection. Please wait a while and try again.' });
  }
  if (!driveConfigured()) {
    return res.status(503).json({ ok: false, error: 'Google Drive storage is not configured yet. Please contact the organisers.' });
  }

  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED[contentType]) {
    return res.status(415).json({ ok: false, error: 'Please upload a WEBP image or PDF file.' });
  }

  let buf;
  try { buf = await readBody(req); }
  catch (err) {
    if (err.message === 'TOO_LARGE') return res.status(413).json({ ok: false, error: 'That file is too large. Please keep it under 4 MB.' });
    return res.status(400).json({ ok: false, error: 'Could not read the uploaded file.' });
  }
  if (!buf.length) return res.status(400).json({ ok: false, error: 'The uploaded file was empty.' });
  if (buf.length > MAX_BYTES) return res.status(413).json({ ok: false, error: 'That file is too large. Please keep it under 4 MB.' });

  const actual = sniff(buf);
  if (actual !== ALLOWED[contentType]) {
    return res.status(415).json({ ok: false, error: 'That file does not look like a valid image or PDF.' });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${stamp}-${safeName(req.headers['x-filename'])}`;
  try {
    const file = await uploadToDrive({ buffer: buf, filename, contentType });
    console.log(`[drive-upload] stored ${file.name} (${buf.length} bytes) as ${file.id}`);
    return res.status(200).json({
      ok: true,
      id: file.id,
      url: `/api/receipt?id=${encodeURIComponent(file.id)}`,
      name: file.name,
      size: buf.length,
      contentType,
    });
  } catch (err) {
    console.error('[drive-upload] upload failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not store the file in Google Drive. Please try again.' });
  }
}

export { deleteDriveFile };
