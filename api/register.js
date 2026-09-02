import { FORM, validate } from '../lib/form-schema.js';
import { appendRegistration } from '../lib/sheets.js';
import { sendConfirmation, explainMailError, missingEnv } from '../lib/mailer.js';
import { confirmationHtml, confirmationText } from '../lib/template.js';
import { deleteBlob } from './blob-upload.js';
import { dbConfigured, saveRegistration, markSheetSynced, markEmailSent } from '../lib/db.js';

const APP_NAME = process.env.APP_NAME || 'Southville Run For A Cause 2026';

// Very small in-memory rate limit. Serverless instances are recycled, so this
// only blunts bursts against a warm instance — it is not a hard guarantee.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 5;
  const rec = hits.get(ip)?.filter((t) => now - t < windowMs) ?? [];
  rec.push(now);
  hits.set(ip, rec);
  if (hits.size > 500) hits.clear();
  return rec.length > max;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many submissions. Please wait a minute.' });
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};

  // Honeypot: real people leave this hidden field empty.
  if (typeof body._hp === 'string' && body._hp.trim() !== '') {
    return res.status(200).json({ ok: true, ref: 'IGNORED' });
  }

  const errors = validate(body);
  if (errors.length) {
    return res.status(422).json({ ok: false, errors });
  }

  const values = {};
  for (const f of FORM.fields) {
    const v = body[f.name];
    values[f.name] = typeof v === 'string' ? v.trim() : '';
  }

  const when = new Date().toLocaleString('en-PH', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  });
  const answers = FORM.fields.map((f) => [f.label, values[f.name]]);
  const labelled = Object.fromEntries(answers);

  // --- 1. record the registration — the database decides ------------
  // Postgres is the source of truth. If this fails, nobody is registered,
  // so nothing is emailed and the uploaded receipt is cleaned up.
  if (!dbConfigured()) {
    console.error('[register] no DATABASE_URL configured');
    return res.status(503).json({
      ok: false,
      error: 'Registrations are not open yet. Please contact the organisers.',
    });
  }

  let ref;
  try {
    ({ reference: ref } = await saveRegistration({ values, labelled, ip }));
  } catch (err) {
    console.error('[register] database write failed:', err.message);

    // The receipt was uploaded before this point, so it is now orphaned.
    for (const f of FORM.fields) {
      if (f.type === 'file' && values[f.name]) {
        const gone = await deleteBlob(values[f.name]);
        console.log(`[register] orphaned upload ${gone ? 'removed' : 'left behind'}: ${values[f.name]}`);
      }
    }

    return res.status(502).json({
      ok: false,
      error: 'We could not record your registration, so no email was sent. Please try again.',
      detail: err.message,
      uploadCleared: true,
    });
  }

  // --- 2. mirror into the Google Sheet — best effort ----------------
  // The runner is already registered, so a Sheet failure must never turn into
  // an error for them. It is recorded on the row and can be replayed.
  appendRegistration({ reference: ref, labelled })
    .then((r) => markSheetSynced(ref, r.ok, r.error).catch(() => {}))
    .catch((err) => markSheetSynced(ref, false, err.message).catch(() => {}));

  const to = values[FORM.emailField];
  const name = values[FORM.nameField] || to;

  const miss = missingEnv();
  if (miss.length) {
    console.error('[register] mail not configured:', miss.join(', '));
    return res.status(200).json({
      ok: true,
      ref,
      mailSent: false,
      mailError: `Registration saved, but email is not configured (missing ${miss.join(', ')}).`,
    });
  }

  try {
    await sendConfirmation({
      to,
      name,
      subject: `Registration confirmed — ${APP_NAME}`,
      html: confirmationHtml({ answers, appName: APP_NAME, ref, when }),
      text: confirmationText({ answers, appName: APP_NAME, ref, when }),
    });
    markEmailSent(ref, true).catch(() => {});
    return res.status(200).json({ ok: true, ref, mailSent: true });
  } catch (err) {
    const explained = explainMailError(err);
    console.error('[register] mail failed:', explained);
    markEmailSent(ref, false, explained).catch(() => {});
    // The registration is already in the Sheet — never report it as lost.
    return res.status(200).json({
      ok: true,
      ref,
      mailSent: false,
      mailError: 'Your registration was saved, but the confirmation email could not be sent.',
      detail: explained,
    });
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
