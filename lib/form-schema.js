/**
 * The cloned Google Form definition.
 *
 * >>> PLACEHOLDER SCHEMA <<<
 * The source form is currently sign-in restricted, so its real questions and
 * entry ids could not be read. Regenerate this file with:
 *
 *     node tools/fetch-form-schema.js
 *
 * once the form is set to "Anyone with the link". Everything else in the app
 * (the rendered page, validation, and the Google Forms POST) is driven from
 * this one file, so nothing else needs editing.
 */

export const FORM = {
  // Where a submission is posted. Must be the /formResponse endpoint.
  responseUrl:
    'https://docs.google.com/forms/d/e/1FAIpQLScBZqedITw-OxfijySW_QNe2S2FKp1GicrGrnvtT5JtgkgWnw/formResponse',

  title: 'Registration Form',
  description:
    'Complete the form below. A confirmation email is sent to you only after your registration has been recorded.',

  // Which field holds the respondent's address (used as the mail recipient).
  emailField: 'email',
  // Which field to greet them by.
  nameField: 'full_name',

  fields: [
    {
      name: 'full_name',
      entry: 'entry.000000000',
      label: 'Full name',
      type: 'short',
      required: true,
      maxLength: 120,
    },
    {
      name: 'email',
      entry: 'entry.000000000',
      label: 'Email address',
      type: 'email',
      required: true,
      help: 'Your confirmation will be sent here.',
    },
    {
      name: 'phone',
      entry: 'entry.000000000',
      label: 'Contact number',
      type: 'short',
      required: false,
      pattern: '^[0-9 +().-]{7,20}$',
      patternMessage: 'That contact number does not look valid.',
    },
    {
      name: 'course',
      entry: 'entry.000000000',
      label: 'Course / Program',
      type: 'choice',
      required: false,
      options: ['BSIT', 'BSCS', 'BSBA', 'BSED', 'Other'],
    },
  ],
};

/** True once the placeholder entry ids have been replaced with real ones. */
export function schemaIsConfigured() {
  return FORM.fields.every((f) => /^entry\.\d+$/.test(f.entry) && f.entry !== 'entry.000000000');
}

/** Server-side validation. Returns an array of human-readable errors. */
export function validate(body) {
  const errors = [];
  for (const f of FORM.fields) {
    const raw = body[f.name];
    const value = typeof raw === 'string' ? raw.trim() : '';

    if (f.required && value === '') {
      errors.push(`${f.label} is required.`);
      continue;
    }
    if (value === '') continue;

    if (f.maxLength && value.length > f.maxLength) {
      errors.push(`${f.label} is too long.`);
    }
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push(`${f.label} does not look like a valid email address.`);
    }
    if (f.pattern && !new RegExp(f.pattern).test(value)) {
      errors.push(f.patternMessage || `${f.label} is not in the expected format.`);
    }
    if (f.type === 'choice' && f.options?.length && !f.options.includes(value)) {
      errors.push(`${f.label} must be one of: ${f.options.join(', ')}.`);
    }
  }
  return errors;
}
