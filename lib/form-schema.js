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
  // Which answer separates SISC employees paying by payroll deduction from
  // everybody else. The staff dashboard splits its figures on this.
  employeeField: 'payment_method',
  employeeValue: 'Employee',

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
      options: ['1K', '3K', "5K", '10K'],
    },
    {
      name: 'shirt_size',
      section: "Race details",
      label: 'Shirt size',
      type: 'choice',
      required: true,
      options: ['#14','#16','#18', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
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
      name: 'payment_method',
      section: 'Payment',
      label: 'Payment method',
      type: 'choice',
      required: true,
      options: ['Bank transfer', 'Employee'],
      help: 'SISC employees may choose "Employee" to settle the fee through salary deduction.',
    },

    // --- SISC salary deduction ---------------------------------------
    // These four live in a pop-up rather than the main flow: they are asked
    // only of employees, and only once "Employee" is the chosen method.
    // "panel" tells the page where to render them; "showIf" decides whether
    // they are asked at all, on both the page and the server.
    {
      name: 'sd_full_name',
      section: 'Payment',
      panel: 'salary-deduction',
      showIf: { field: 'payment_method', equals: 'Employee' },
      label: 'Employee full name',
      type: 'short',
      required: true,
      maxLength: 120,
      placeholder: 'Juan Dela Cruz',
    },
    {
      name: 'sd_employee_number',
      section: 'Payment',
      panel: 'salary-deduction',
      showIf: { field: 'payment_method', equals: 'Employee' },
      label: 'Employee number',
      type: 'short',
      required: true,
      maxLength: 40,
      placeholder: 'e.g. 2019-0431',
    },
    {
      name: 'sd_department',
      section: 'Payment',
      panel: 'salary-deduction',
      showIf: { field: 'payment_method', equals: 'Employee' },
      label: 'Department / Office',
      type: 'short',
      required: true,
      maxLength: 120,
      placeholder: 'e.g. Alumni Department',
    },
    {
      name: 'sd_authorization',
      section: 'Payment',
      panel: 'salary-deduction',
      showIf: { field: 'payment_method', equals: 'Employee' },
      label: 'Salary deduction authorization',
      type: 'short',
      required: true,
      maxLength: 120,
      placeholder: 'DELA CRUZ, JUAN',
      help: 'By placing your name, you agree that the deduction as such will be made from your payroll. Please type your LAST NAME, FIRST NAME.',
      pattern: '^[^,]{2,},[^,]{2,}$',
      patternMessage: 'Type it as LAST NAME, FIRST NAME — with a comma between them.',
    },

    {
      name: 'proof_of_payment',
      section: 'Payment',
      label: 'Proof of payment',
      // Uploaded to Vercel Blob; the resulting link is what reaches the Sheet.
      type: 'file',
      required: true,
      // There is no receipt to show for a payroll deduction — the authorisation
      // in the panel above is the record — so the question is not asked at all.
      showIf: { field: 'payment_method', notEquals: 'Employee' },
      help: 'Photo or PDF of your deposit slip or bank transfer receipt. Max 4 MB.',
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


/**
 * Is this question actually being asked, given the answers so far?
 *
 * A field with no `showIf` is always asked. One with `showIf` is asked only
 * while the field it depends on holds the matching answer — which is how the
 * salary-deduction questions stay out of the way of everybody who is paying
 * by GCash or bank transfer. The page and the server share this rule so they
 * can never disagree about what is required.
 */
export function isActive(field, answers) {
  const cond = field.showIf;
  if (!cond) return true;
  const raw = answers?.[cond.field];
  const current = typeof raw === 'string' ? raw.trim() : '';
  if (cond.equals !== undefined) return current === cond.equals;
  if (cond.notEquals !== undefined) return current !== cond.notEquals;
  return current !== '';
}

/**
 * The question whose answer marks a registration as an employee's, and the
 * answer that does it. Returns null if the schema no longer has one.
 */
export function employeeQuestion() {
  const f = FORM.fields.find((x) => x.name === FORM.employeeField);
  return f ? { label: f.label, value: FORM.employeeValue } : null;
}

/** The questions that apply to this particular set of answers. */
export function activeFields(answers) {
  return FORM.fields.filter((f) => isActive(f, answers));
}

/** Server-side validation. Returns an array of human-readable errors. */
export function validate(body) {
  const errors = [];
  for (const f of FORM.fields) {
    // A question that is not being asked is neither required nor checked.
    if (!isActive(f, body)) continue;
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
