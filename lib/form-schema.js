/**
 * The registration questions.
 *
 * This is the single source of truth for the whole app: the rendered page,
 * client and server validation, the Google Sheet columns, and the confirmation
 * email all derive from this list. Add or reorder a field here and everything
 * follows.
 *
 * Registrations are written to Postgres and mirrored into the Google Sheet via
 * the Sheets API — there is no Google Form in the path, so no entry ids.
 */

export const FORM = {
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
      label: 'Full name',
      type: 'short',
      required: true,
      maxLength: 120,
      help: 'As it should appear on your race bib.',
    },
    {
      name: 'email_address',
      section: "Runner details",
      label: 'Email address',
      type: 'email',
      required: true,
      help: 'Your confirmation and race details will be sent here.',
    },
    {
      name: 'contact_number',
      section: "Runner details",
      label: 'Contact number',
      type: 'short',
      required: true,
      pattern: '^[0-9 +().-]{7,20}$',
      patternMessage: 'That contact number does not look valid.',
    },
    {
      name: 'age',
      section: "Runner details",
      label: 'Age',
      type: 'short',
      required: true,
      pattern: '^[0-9]{1,3}$',
      patternMessage: 'Enter your age in years.',
    },
    {
      name: 'sex',
      section: "Runner details",
      label: 'Sex',
      type: 'choice',
      required: true,
      options: ['Male', 'Female', 'Prefer not to say'],
    },
    {
      name: 'race_category',
      section: "Race details",
      label: 'Race category',
      type: 'choice',
      required: true,
      options: ['3K', '5K', '10K', '21K'],
    },
    {
      name: 'shirt_size',
      section: "Race details",
      label: 'Shirt size',
      type: 'choice',
      required: true,
      options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    },
    {
      name: 'team_or_organization',
      section: "Race details",
      label: 'Team / Organization',
      type: 'short',
      required: false,
      help: 'Leave blank if running as an individual.',
    },
    {
      name: 'proof_of_payment',
      section: 'Payment',
      label: 'Proof of payment',
      // Uploaded to Vercel Blob; the resulting link is what reaches the Sheet.
      // The matching Google Form question must be SHORT ANSWER, not File upload.
      type: 'file',
      required: true,
      help: 'Screenshot or PDF of your GCash or bank transfer receipt. Max 4 MB.',
    },
    {
      name: 'payment_method',
      section: 'Payment',
      label: 'Payment method',
      type: 'choice',
      required: true,
      options: ['GCash', 'Bank transfer'],
    },
    {
      name: 'emergency_contact_name',
      section: "Emergency & medical",
      label: 'Emergency contact name',
      type: 'short',
      required: true,
    },
    {
      name: 'emergency_contact_number',
      section: "Emergency & medical",
      label: 'Emergency contact number',
      type: 'short',
      required: true,
      pattern: '^[0-9 +().-]{7,20}$',
      patternMessage: 'That emergency contact number does not look valid.',
    },
    {
      name: 'medical_conditions',
      section: "Emergency & medical",
      label: 'Medical conditions or allergies',
      type: 'paragraph',
      required: false,
      help: 'Tell us anything our medical team should know. Write "None" if not applicable.',
    },
  ],
};


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
