/**
 * Shared parser for Google Forms' FB_PUBLIC_LOAD_DATA_ payload.
 * Used by both tools/fetch-form-schema.js (live fetch) and
 * tools/import-form-source.js (saved page / pasted payload).
 */

// Google's item type codes.
const TYPE = {
  0: 'short', 1: 'paragraph', 2: 'choice', 3: 'choice', 4: 'checkbox',
  5: 'scale', 7: 'grid', 9: 'date', 10: 'time', 13: 'file',
};

export const slug = (s, id) =>
  (String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `field_${id}`).slice(0, 40);

/** Pulls the payload array out of a full page of HTML. */
export function extractPayload(html) {
  if (!html.includes('FB_PUBLIC_LOAD_DATA_')) return null;
  const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

/** Turns the payload into our schema shape. */
export function parseForm(data) {
  const title = data[3] || data[1]?.[8] || 'Registration Form';
  const description = data[1]?.[0] || '';
  const items = data[1]?.[1] || [];

  const fields = [];
  let section = '';
  for (const item of items) {
    const label = item[1] || '';
    const code = item[3];
    const itemHelp = item[2] || '';

    // Type 6 = section header, type 8 = page break. Neither takes an answer,
    // but both start a new group that following questions belong to.
    if (code === 6 || code === 8) {
      section = label || '';
      continue;
    }
    if (!Array.isArray(item[4])) continue; // image / video / unsupported

    for (const entry of item[4]) {
      const id = entry?.[0];
      if (id == null) continue;

      const options = Array.isArray(entry[1])
        ? entry[1].map((o) => o?.[0]).filter((o) => o != null && o !== '')
        : [];

      const f = {
        name: slug(label, id),
        entry: `entry.${id}`,
        label,
        type: /e-?mail/i.test(label) ? 'email' : (TYPE[code] ?? 'short'),
        required: !!entry[2],
      };
      if (itemHelp) f.help = itemHelp;
      if (section) f.section = section;
      if (options.length) f.options = options;
      fields.push(f);
    }
  }

  // De-duplicate slugs so two questions never collide on one name.
  const seen = new Map();
  for (const f of fields) {
    const n = seen.get(f.name) ?? 0;
    seen.set(f.name, n + 1);
    if (n > 0) f.name = `${f.name}_${n + 1}`;
  }

  const emailField =
    (fields.find((f) => f.type === 'email') || fields.find((f) => /mail/i.test(f.label)) || {}).name || '';
  const nameField = (fields.find((f) => /name/i.test(f.label)) || {}).name || '';

  return { title, description, fields, emailField, nameField };
}

/** Renders the generated lib/form-schema.js source. */
export function buildSchemaFile({ responseUrl, title, description, emailField, nameField, fields }) {
  return `/**
 * The cloned Google Form definition.
 * GENERATED on ${new Date().toISOString()} — do not hand-edit.
 * Re-run tools/fetch-form-schema.js or tools/import-form-source.js to refresh.
 */

export const FORM = {
  responseUrl: ${JSON.stringify(responseUrl)},

  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(description)},

  emailField: ${JSON.stringify(emailField)},
  nameField: ${JSON.stringify(nameField)},

  fields: ${JSON.stringify(fields, null, 2).replace(/\n/g, '\n  ')},
};

/** True once the placeholder entry ids have been replaced with real ones. */
export function schemaIsConfigured() {
  return FORM.fields.every((f) => ${String.raw`/^entry\.\d+$/`}.test(f.entry) && f.entry !== 'entry.000000000');
}

/** Server-side validation. Returns an array of human-readable errors. */
export function validate(body) {
  const errors = [];
  for (const f of FORM.fields) {
    const raw = body[f.name];
    const value = typeof raw === 'string' ? raw.trim() : '';

    if (f.required && value === '') { errors.push(\`\${f.label} is required.\`); continue; }
    if (value === '') continue;

    if (f.maxLength && value.length > f.maxLength) errors.push(\`\${f.label} is too long.\`);
    if (f.type === 'email' && !${String.raw`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`}.test(value)) {
      errors.push(\`\${f.label} does not look like a valid email address.\`);
    }
    if (f.pattern && !new RegExp(f.pattern).test(value)) {
      errors.push(f.patternMessage || \`\${f.label} is not in the expected format.\`);
    }
    if (f.type === 'file' && !${String.raw`/^https:\/\/\S+$/`}.test(value)) {
      errors.push(\`\${f.label} must be uploaded before submitting.\`);
    }
    if (f.type === 'choice' && f.options?.length && !f.options.includes(value)) {
      errors.push(\`\${f.label} must be one of: \${f.options.join(', ')}.\`);
    }
  }
  return errors;
}
`;
}

/** Pretty console summary of a parsed form. */
export function printSummary({ title, fields, emailField }) {
  console.log(`Title : ${title}`);
  console.log(`Fields: ${fields.length}\n`);
  for (const f of fields) {
    console.log(`  ${f.entry.padEnd(20)} ${(f.required ? 'req' : '   ')}  ${f.type.padEnd(9)} ${f.label}`);
    if (f.options) f.options.forEach((o) => console.log(`${' '.repeat(38)}- ${o}`));
  }
  if (!emailField) console.warn('\n!! No email question detected — set FORM.emailField by hand.');
}
