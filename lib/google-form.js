import { FORM } from './form-schema.js';

/**
 * Posts one registration into the Google Form, which writes the row into the
 * Sheet linked to that form.
 *
 * The form MUST be set to "Anyone with the link". A form restricted to an
 * organisation answers anonymous posts with HTTP 401 and nothing is recorded.
 */
export async function submitToGoogleForm(values) {
  const body = new URLSearchParams();
  for (const f of FORM.fields) {
    const v = values[f.name];
    if (v === undefined || v === null || v === '') continue;
    body.append(f.entry, String(v));
  }

  if ([...body.keys()].length === 0) {
    return { ok: false, status: 0, error: 'Nothing to submit.' };
  }

  let res;
  try {
    res = await fetch(FORM.responseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; RegistrationSystem/1.0)',
      },
      body,
      redirect: 'follow',
    });
  } catch (err) {
    return { ok: false, status: 0, error: `Network error reaching Google Forms: ${err.message}` };
  }

  if (res.ok) return { ok: true, status: res.status, error: '' };

  const hint =
    res.status === 401 || res.status === 403
      ? 'the form requires sign-in — set it to "Anyone with the link"'
      : res.status === 400
        ? 'an entry id is wrong or a required question was not filled'
        : 'unexpected response';

  return { ok: false, status: res.status, error: `Google Forms returned HTTP ${res.status} (${hint}).` };
}
