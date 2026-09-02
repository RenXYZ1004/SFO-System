import { getAccessToken, oauthConfigured, explainTokenError } from './google-auth.js';
import { FORM } from './form-schema.js';

/**
 * Appends registrations straight into a Google Sheet.
 *
 * This replaces posting to a Google Form's /formResponse endpoint. Writing to
 * the Sheet directly means:
 *   - no form has to be public (that was the HTTP 401 that blocked everything)
 *   - no entry.NNNN ids to scrape
 *   - we choose the columns, so a file-upload question is not a problem
 *   - it uses the documented Sheets API rather than an undocumented endpoint
 *
 * Config:
 *   SHEET_ID   the long id from the sheet URL:
 *              docs.google.com/spreadsheets/d/<SHEET_ID>/edit
 *   SHEET_TAB  optional tab name, defaults to "Registrations"
 */

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export const sheetId = () => process.env.SHEET_ID || '';
export const sheetTab = () => process.env.SHEET_TAB || 'Registrations';
export const sheetsConfigured = () => Boolean(sheetId()) && oauthConfigured();

/** Columns written, in order: our own metadata then one per question. */
export function headerRow() {
  return ['Timestamp', 'Reference', ...FORM.fields.map((f) => f.label)];
}

async function call(path, { method = 'GET', body, params } = {}) {
  const token = await getAccessToken();
  const qs = params ? '?' + new URLSearchParams(params) : '';
  const res = await fetch(`${API}/${sheetId()}${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(explainSheetError(res.status, msg));
  }
  return data;
}

export function explainSheetError(status, msg) {
  if (status === 404) {
    return `Spreadsheet not found — check SHEET_ID. (${msg})`;
  }
  if (status === 403) {
    return `Access denied to the spreadsheet. The Google account that issued the refresh ` +
           `token must be able to edit it, and the token needs the spreadsheets scope — ` +
           `re-run "npm run token". (${msg})`;
  }
  if (status === 401) {
    return `Google rejected the access token. Re-run "npm run token". (${msg})`;
  }
  return msg;
}

/** Creates the tab if it is missing, and writes the header row if row 1 is empty. */
export async function ensureSheet() {
  const meta = await call('', { params: { fields: 'sheets.properties.title' } });
  const titles = (meta.sheets || []).map((s) => s.properties.title);

  if (!titles.includes(sheetTab())) {
    await call(':batchUpdate', {
      method: 'POST',
      body: { requests: [{ addSheet: { properties: { title: sheetTab() } } }] },
    });
  }

  const head = await call(`/values/${encodeURIComponent(`${sheetTab()}!1:1`)}`);
  const existing = head.values?.[0] || [];
  const wanted = headerRow();

  if (existing.length === 0) {
    await call(`/values/${encodeURIComponent(`${sheetTab()}!A1`)}`, {
      method: 'PUT',
      params: { valueInputOption: 'RAW' },
      body: { values: [wanted] },
    });
    return { created: !titles.includes(sheetTab()), headers: 'written' };
  }

  // Headers already there — leave them alone rather than clobbering a sheet
  // someone has been working in.
  const matches = wanted.every((h, i) => existing[i] === h);
  return { created: false, headers: matches ? 'match' : 'differ', existing };
}

/**
 * Appends one registration. Returns {ok, error} rather than throwing, because
 * the caller treats the Sheet as a mirror and must not fail the request on it.
 */
/** Manila local time, sortable as plain text: 2026-11-22 08:05:31 */
export function sheetTimestamp(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export async function appendRegistration({ reference, labelled }) {
  if (!sheetsConfigured()) {
    return { ok: false, error: 'Sheet mirror not configured (SHEET_ID / Google OAuth).' };
  }
  try {
    const row = [
      sheetTimestamp(),
      reference,
      ...FORM.fields.map((f) => String(labelled[f.label] ?? '')),
    ];
    await call(`/values/${encodeURIComponent(`${sheetTab()}!A1`)}:append`, {
      method: 'POST',
      // RAW, not USER_ENTERED: Sheets would otherwise parse "09171234567" as a
      // number and strip the leading zero from every Philippine mobile number.
      params: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' },
      body: { values: [row] },
    });
    return { ok: true, error: '' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
