/**
 * The cloned Google Form definition.
 *
 * >>> PLACEHOLDER SCHEMA — fun run registration <<<
 * The source form is sign-in restricted, so its real questions and entry ids
 * could not be read. These fields are a sensible fun-run shape so the page is
 * meaningful to preview, but the entry ids are NOT real and submissions are
 * refused until they are replaced.
 *
 * Replace with the real form by running either:
 *     npm run schema                    (if the form is "Anyone with the link")
 *     npm run import -- payload.json    (from FB_PUBLIC_LOAD_DATA_)
 *
 * Everything else — the rendered page, validation, the email — is driven from
 * this one file, so nothing else needs editing.
 */

export const FORM = {
  // Where a submission is posted. Must be the /formResponse endpoint.
  responseUrl:
    'https://docs.google.com/forms/d/e/1FAIpQLScBZqedITw-OxfijySW_QNe2S2FKp1GicrGrnvtT5JtgkgWnw/formResponse',

  title: 'Southville Run For A Cause 2026',
  description:
    'A community fun run by Southville for Others (SFO) and the Alumni Department. A confirmation email with your reference number is sent only after your registration has been recorded.',

  // Which field holds the runner's address (used as the mail recipient).
  emailField: 'email_address',
  // Which field to greet them by.
  nameField: 'full_name',

  fields: [
    {
      name: 'full_name',
      section: "Runner details",
      entry: 'entry.000000000',
      label: 'Full name',
      type: 'short',
      required: true,
      maxLength: 120,
      help: 'As it should appear on your race bib.',
    },
    {
      name: 'email_address',
      section: "Runner details",
      entry: 'entry.000000000',
      label: 'Email address',
      type: 'email',
      required: true,
      help: 'Your confirmation and race details will be sent here.',
    },
    {
      name: 'contact_number',
      section: "Runner details",
      entry: 'entry.000000000',
      label: 'Contact number',
      type: 'short',
      required: true,
      pattern: '^[0-9 +().-]{7,20}$',
      patternMessage: 'That contact number does not look valid.',
    },
    {
      name: 'age',
      section: "Runner details",
      entry: 'entry.000000000',
      label: 'Age',
      type: 'short',
      required: true,
      pattern: '^[0-9]{1,3}$',
      patternMessage: 'Enter your age in years.',
    },
    {
      name: 'sex',
      section: "Runner details",
      entry: 'entry.000000000',
      label: 'Sex',
      type: 'choice',
      required: true,
      options: ['Male', 'Female', 'Prefer not to say'],
    },
    {
      name: 'race_category',
      section: "Race details",
      entry: 'entry.000000000',
      label: 'Race category',
      type: 'choice',
      required: true,
      options: ['3K', '5K', '10K', '21K'],
    },
    {
      name: 'shirt_size',
      section: "Race details",
      entry: 'entry.000000000',
      label: 'Shirt size',
      type: 'choice',
      required: true,
      options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    },
    {
      name: 'team_or_organization',
      section: "Race details",
      entry: 'entry.000000000',
      label: 'Team / Organization',
      type: 'short',
      required: false,
      help: 'Leave blank if running as an individual.',
    },
    {
      name: 'proof_of_payment',
      section: 'Payment',
      entry: 'entry.000000000',
      label: 'Proof of payment',
      // Uploaded to Vercel Blob; the resulting link is what reaches the Sheet.
      // The matching Google Form question must be SHORT ANSWER, not File upload.
      type: 'file',
      required: true,
      help: 'Screenshot or PDF of your GCash / bank transfer receipt. Max 4 MB. Choose "on-site" below if you are paying at the venue.',
    },
    {
      name: 'payment_method',
      section: 'Payment',
      entry: 'entry.000000000',
      label: 'Payment method',
      type: 'choice',
      required: true,
      options: ['GCash', 'Bank transfer', 'On-site payment'],
    },
    {
      name: 'emergency_contact_name',
      section: "Emergency & medical",
      entry: 'entry.000000000',
      label: 'Emergency contact name',
      type: 'short',
      required: true,
    },
    {
      name: 'emergency_contact_number',
      section: "Emergency & medical",
      entry: 'entry.000000000',
      label: 'Emergency contact number',
      type: 'short',
      required: true,
      pattern: '^[0-9 +().-]{7,20}$',
      patternMessage: 'That emergency contact number does not look valid.',
    },
    {
      name: 'medical_conditions',
      section: "Emergency & medical",
      entry: 'entry.000000000',
      label: 'Medical conditions or allergies',
      type: 'paragraph',
      required: false,
      help: 'Tell us anything our medical team should know. Write "None" if not applicable.',
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

    if (f.required && value === '') { errors.push(`${f.label} is required.`); continue; }
    if (value === '') continue;

    if (f.maxLength && value.length > f.maxLength) errors.push(`${f.label} is too long.`);
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push(`${f.label} does not look like a valid email address.`);
    }
    if (f.pattern && !new RegExp(f.pattern).test(value)) {
      errors.push(f.patternMessage || `${f.label} is not in the expected format.`);
    }
    if (f.type === 'file' && !/^https:\/\/\S+$/.test(value)) {
      errors.push(`${f.label} must be uploaded before submitting.`);
    }
    if (f.type === 'choice' && f.options?.length && !f.options.includes(value)) {
      errors.push(`${f.label} must be one of: ${f.options.join(', ')}.`);
    }
  }
  return errors;
}
