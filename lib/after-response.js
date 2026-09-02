/**
 * Runs work after the HTTP response has been sent, without it being killed.
 *
 * A Vercel serverless function is frozen the instant it responds, so a plain
 * fire-and-forget promise gets cut off mid-flight — that is what left rows
 * with sheet_synced = false even when the credentials were fine.
 *
 * waitUntil() tells the platform to keep the instance alive until the promise
 * settles. Locally there is no platform, so we simply await instead, which
 * keeps the dev server behaving like production.
 */

let waitUntil = null;
try {
  ({ waitUntil } = await import('@vercel/functions'));
} catch {
  waitUntil = null;
}

export const hasWaitUntil = () => typeof waitUntil === 'function' && Boolean(process.env.VERCEL);

/**
 * @param {Promise|Function} work
 * @returns {Promise<void>} resolves immediately on Vercel, or after the work
 *                          completes locally.
 */
export async function afterResponse(work) {
  const promise = typeof work === 'function' ? work() : work;
  const guarded = Promise.resolve(promise).catch((err) => {
    console.error('[after-response] background work failed:', err?.message || err);
  });

  if (hasWaitUntil()) {
    waitUntil(guarded);
    return;
  }
  await guarded;
}
