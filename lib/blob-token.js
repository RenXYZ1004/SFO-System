/**
 * Finds the Vercel Blob token whatever Vercel decided to call it.
 *
 * With a single Blob store connected, Vercel injects BLOB_READ_WRITE_TOKEN.
 * Connect a second store — or recreate one — and it namespaces the variable
 * per store instead, e.g.
 *
 *   sfo_run_2026_receipts_READ_WRITE_TOKEN
 *   STORE_ABC123_READ_WRITE_TOKEN
 *
 * Hard-coding the plain name means uploads silently 503 after any store
 * change, so resolve it by shape: a Blob read-write token always begins
 * "vercel_blob_rw_".
 */

const PREFIX = 'vercel_blob_rw_';

export function blobToken() {
  const direct = process.env.BLOB_READ_WRITE_TOKEN;
  if (direct && direct.startsWith(PREFIX)) return direct;

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && value.startsWith(PREFIX)) {
      if (!direct) console.log(`[blob] using token from ${key}`);
      return value;
    }
  }
  return '';
}

export const blobConfigured = () => Boolean(blobToken());

/** Names only — never values — so a misconfiguration can be diagnosed safely. */
export function blobTokenCandidates() {
  return Object.keys(process.env).filter(
    (k) => /BLOB|READ_WRITE_TOKEN/i.test(k)
  );
}
