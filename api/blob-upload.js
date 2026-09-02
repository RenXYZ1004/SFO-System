import { put, del } from '@vercel/blob';

/**
 * Receives one proof-of-payment file and stores it in Vercel Blob.
 * Returns the public URL, which the browser then submits as an ordinary
 * text answer on the Google Form — so the Sheet gets a clickable link.
 *
 * The browser sends raw bytes (not multipart) so no parser is needed:
 *   POST /api/blob-upload
 *   content-type: image/jpeg
 *   x-filename:   receipt.jpg
 *
 * Requires BLOB_READ_WRITE_TOKEN, which Vercel injects automatically once a
 * Blob store is connected to the project.
 */

// Vercel caps a serverless request body at 4.5 MB. Images are downscaled in
// the browser before they get here; this is the backstop.
const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

// Magic numbers, so a renamed .exe cannot pose as a receipt.
const SIGNATURES = [
  { ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
];

function sniff(buf) {
  for (const sig of SIGNATURES) {
    if (sig.bytes.every((b, i) => buf[i] === b)) return sig.ext;
  }
  // RIFF....WEBP
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF'
      && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  // ....ftypheic / ftypheix / ftypmif1
  if (buf.length > 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'heic';
  return null;
}

/** Reads the raw request body whether the platform pre-parsed it or not. */
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

const safeName = (s) =>
  String(s || 'receipt')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-60) || 'receipt';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[blob-upload] BLOB_READ_WRITE_TOKEN is not set');
    return res.status(503).json({
      ok: false,
      error: 'File uploads are not configured yet. Please contact the organisers.',
    });
  }

  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED[contentType]) {
    return res.status(415).json({
      ok: false,
      error: 'Please upload a JPG, PNG, WEBP, HEIC or PDF file.',
    });
  }

  let buf;
  try {
    buf = await readBody(req);
  } catch (err) {
    if (err.message === 'TOO_LARGE') {
      return res.status(413).json({ ok: false, error: 'That file is too large. Please keep it under 4 MB.' });
    }
    return res.status(400).json({ ok: false, error: 'Could not read the uploaded file.' });
  }

  if (!buf.length) return res.status(400).json({ ok: false, error: 'The uploaded file was empty.' });
  if (buf.length > MAX_BYTES) {
    return res.status(413).json({ ok: false, error: 'That file is too large. Please keep it under 4 MB.' });
  }

  // The declared type must match what the bytes actually are.
  const actual = sniff(buf);
  const declared = ALLOWED[contentType];
  const matches = actual === declared
    || (declared === 'heif' && actual === 'heic')
    || (declared === 'jpg' && actual === 'jpg');
  if (!actual || !matches) {
    return res.status(415).json({
      ok: false,
      error: 'That file does not look like a valid image or PDF.',
    });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const pathname = `proof-of-payment/${stamp}/${safeName(req.headers['x-filename'])}`;

  try {
    const blob = await put(pathname, buf, {
      access: 'public',
      contentType,
      addRandomSuffix: true, // unguessable URL
      cacheControlMaxAge: 31536000,
    });
    console.log(`[blob-upload] stored ${blob.pathname} (${buf.length} bytes)`);
    return res.status(200).json({ ok: true, url: blob.url, size: buf.length });
  } catch (err) {
    console.error('[blob-upload] put failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not store the file. Please try again.' });
  }
}

/** Removes an orphaned upload when the registration it belonged to failed. */
export async function deleteBlob(url) {
  if (!url || !process.env.BLOB_READ_WRITE_TOKEN) return false;
  try {
    await del(url);
    return true;
  } catch (err) {
    console.error('[blob-upload] cleanup failed:', err.message);
    return false;
  }
}
