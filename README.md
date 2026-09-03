# Fun Run Registration — cloned Google Form → Sheet → Gmail confirmation

A public fun run registration page (a clone of your Google Form) deployed on **Vercel**. A
submission is written into the Google Sheet through the Google Form, and a
confirmation email is sent over **Gmail SMTP with OAuth2 (XOAUTH2)** — but
**only after** the registration has actually been recorded.

```
Visitor -> public/index.html  (rendered from lib/form-schema.js)
              |
              v
        POST /api/register
              |
              |-- 1. POST to .../formResponse  -> row appears in the Sheet
              |      if this fails -> 502, and NO email is sent
              |
              '-- 2. Nodemailer -> smtp.gmail.com:587 (XOAUTH2) -> confirmation
```

## Why Nodemailer and not PHPMailer

Vercel has no PHP runtime — only Node, Python, Go and Ruby. PHPMailer cannot
run there. Nodemailer is the direct equivalent and speaks the same Gmail
XOAUTH2 that a Google Cloud OAuth client issues.

A PHP/PHPMailer build of the same system is at `C:\xampp\htdocs\gform-smtp`
if you ever host on Apache/cPanel instead.

---

## Before it will work

**The source Google Form must be shared as "Anyone with the link."**
It is currently restricted to your organisation, and Google answers anonymous
posts with **HTTP 401** — nothing gets recorded and no email goes out.

Open the form → Settings → Responses → turn **off** "Restrict to users in
Southville International School and Colleges".

---

## Setup

### 1. Clone the real form's fields
```bash
npm run schema                    # if the form is "Anyone with the link"
npm run import -- payload.json    # if it stays sign-in restricted
```

For the second, open the form signed in, press F12, and run:
```js
copy(JSON.stringify(FB_PUBLIC_LOAD_DATA_))
```
Paste the result into `payload.json`.
Reads the live form and rewrites `lib/form-schema.js` with the real questions,
entry ids, required flags and choices. The web page and all validation are
driven from that one file, so nothing else needs editing.

If the form is still restricted the script says so and prints a browser-console
snippet that copies the field list to your clipboard as a manual fallback.

### 2. Google Cloud OAuth client
1. **APIs & Services → Library →** enable **Gmail API**.
2. **OAuth consent screen → User type: Internal.**
   Leaving it on *Testing* makes Google expire the refresh token after **7 days** —
   this is what broke the e-gatepass mailer.
3. **Credentials → Create OAuth client ID → Web application.**
   Authorised redirect URI: `http://localhost:5555/oauth2callback`
4. Copy the Client ID **and** the Client secret from that *same* client.
   A mismatched pair is the `invalid_client` error.

### 3. Get a refresh token
```bash
npm run token
```
Opens a consent URL, catches the redirect, and prints the three environment
variables to paste into Vercel.

### 4. Prove the mail works before deploying
```bash
cp .env.example .env.local     # fill in the values
npm run test:smtp you@example.com
```
Verifies the SMTP connection, then sends a real test message.

### 5. Run locally
```bash
npm run dev                    # http://localhost:3000
```
`DEV_HOT=1 npm run dev` enables hot-reloading of `api/*.js` (off by default so
module state behaves like a warm Vercel instance).

### 6. Deploy
```bash
npx vercel            # preview
npx vercel --prod     # production
```
Then set the environment variables in **Vercel → Project → Settings →
Environment Variables**:

| Variable | Notes |
|---|---|
| `GMAIL_USER` | the sending mailbox |
| `GOOGLE_CLIENT_ID` | from the OAuth client |
| `GOOGLE_CLIENT_SECRET` | from the **same** OAuth client |
| `GOOGLE_REFRESH_TOKEN` | from `npm run token` |
| `MAIL_FROM_NAME` | optional display name |
| `ADMIN_COPY` | optional bcc of every confirmation |
| `APP_NAME` | optional, appears in the subject line |

`SMTP_PASSWORD` is an alternative to the three `GOOGLE_*` vars if you ever
switch to a Gmail App Password — the mailer takes that path automatically.

---

## Files

| Path | Purpose |
|---|---|
| `lib/form-schema.js` | the cloned form definition + validation — **the single source of truth** |
| `lib/google-form.js` | posts a registration into `/formResponse` |
| `lib/mailer.js` | Nodemailer over Gmail XOAUTH2, plus error explanations |
| `lib/template.js` | HTML + plain-text confirmation email |
| `api/register.js` | validate → record → *then* email |
| `api/schema.js` | serves the schema to the front-end |
| `public/index.html` `styles.css` `app.js` | the cloned form UI (light + dark) |
| `public/docs/` | Waiver of Liability + Health Declaration PDFs, linked from the intro |
| `public/payment/` | the bank-transfer image shown in the Payment section |
| `public/shirt/` | the shirt size chart shown inside the shirt-size question |
| `tools/fetch-form-schema.js` | regenerates `form-schema.js` from the live form |
| `tools/import-form-source.js` | same, from a saved page or pasted payload |
| `lib/parse-form.js` | shared Google Forms payload parser |
| `tools/get-refresh-token.js` | one-time OAuth consent → refresh token |
| `tools/test-smtp.js` | end-to-end mail check |
| `tools/dev-server.js` | local stand-in for Vercel routing |

---

## Payment methods

Two options, set in `lib/form-schema.js` under `payment_method`:

| Option | What happens |
|---|---|
| Bank transfer | PNB account details are shown at the top of the Payment section; a receipt must be uploaded |
| Employee | opens the **SISC Salary Deduction** pop-up — employee full name, employee number, department/office and a typed payroll authorisation — and the proof-of-payment question is not asked at all |

The four salary-deduction questions are ordinary schema fields carrying two
extra keys:

```js
panel: 'salary-deduction',                                // drawn in the pop-up
showIf: { field: 'payment_method', equals: 'Employee' },  // only asked of employees
```

The proof-of-payment question carries the mirror image of that rule, so a
payroll deduction never asks for a receipt that does not exist:

```js
showIf: { field: 'payment_method', notEquals: 'Employee' },
```

`isActive()` in `lib/form-schema.js` is the single rule for whether a
conditional question applies, and both the page and `validate()` use it — so
they cannot disagree about what is required. `api/register.js` blanks any
answer to a question that was not asked, so switching back to a bank
transfer never leaves payroll details in the Sheet or the confirmation email,
and an employee's registration never carries a receipt.

### Replacing the placeholder assets

`public/docs/` currently holds **placeholder** PDFs — replace them with the
signed documents, keeping the filenames, or the links on the front page will
serve the placeholders.

`public/payment/bank-transfer.<ext>` and `public/shirt/shirt-size.<ext>` are
reference pictures the organisers drop in later. Both go through the same
slot: `data-file` on the `<figure>` names the path without an extension, and
the page tries each sensible spelling in turn — hyphen or underscore, `.jpg`
`.png` `.jpeg` or `.webp` — so a file can go in as it came off the phone or
the scanner. Neither is cropped, both get a "Full size" link, and a slot with
no file shows an "Image coming soon" placeholder so the page works either way.
See each folder's `README.txt`.

To add another such picture, drop a `<figure class="shot" data-file="/dir/name">`
into a template and call `wireImageSlot()` on it.

### After changing the questions

`headerRow()` in `lib/sheets.js` derives the Sheet columns from the schema, so
adding or reordering a field changes the column layout. Run `npm run sheet:init`
against a fresh tab, or update the header row by hand — rows written before the
change keep the old column order.

---

## Staff dashboard

`/staff` splits registrations into **Employees** (paying by salary deduction)
and **Non-employees**, because the two are chased up differently — payroll on
one side, a receipt on the other. Tabs switch between them and carry live
counts, every row is labelled, and the split is also shown as two figures at
the top. `FORM.employeeField` / `FORM.employeeValue` in `lib/form-schema.js`
define what counts as an employee; `employeeQuestion()` is what the dashboard
and `api/staff-data.js` both read, so nothing hard-codes the answer text.

`GET /api/staff-data?type=employee` and `?type=public` apply the same filter
server-side; the counts are always taken over the whole table, so they stay
meaningful while a search narrows the rows.

### Export

**Export CSV** hands the finance office a spreadsheet instead of a screenshot.
It exports the tab you are on, paging past the 50 rows shown on screen, and
picks its columns to suit:

| Tab | Columns |
|---|---|
| Employees | employee number, department/office and the typed authorisation, plus the runner's own details for matching |
| Non-employees / Everyone | the runner's details and the proof-of-payment link |

The file is UTF-8 **with a BOM**, so Excel renders "Las Piñas" rather than
mojibake, and every cell is quoted. A value a spreadsheet would execute
(`=`, `@`, or a `+`/`-` that is not a plain number) is prefixed with an
apostrophe — registrations are user input and this file is opened by someone
in finance. A `+63` phone number is left alone.

The export always covers the whole group, never just the current search; when
a search is active the confirmation message says so.

**The export carries no amount.** Nothing in the form captures a registration
fee, so payroll has to apply the per-category fee themselves — the race
category is in the file for that. Add a fee field to `lib/form-schema.js` and
it will appear in the export automatically.

Registrations taken before employees were exempted still have a receipt on
file. The dashboard shows whatever is stored rather than what the rules say
today, so those rows keep their "Open receipt" link.

---

## Design notes

- **No registration, no email.** The mail call in `api/register.js` sits after
  the `if (!recorded.ok) return 502` guard, so a failed Google Forms post can
  never produce a confirmation.
- **A mail failure never loses the registration.** The row is already in the
  Sheet, so the response is `200 ok:true` with `mailSent:false` and the reason,
  rather than an error that would invite the user to submit twice.
- Honeypot field plus a per-IP rate limit (5/min) on warm instances.
- All user input is escaped in both the page and the email.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `HTTP 401` from Google Forms | the form still requires sign-in |
| `HTTP 400` from Google Forms | an entry id is wrong — re-run `npm run schema` |
| `invalid_client` | client id and secret are from different OAuth clients |
| `invalid_grant` | refresh token expired — consent screen is on *Testing*, set it to *Internal* and re-run `npm run token` |
| `535-5.7.8` | Workspace admin has SMTP/IMAP access disabled for that user |
| Page says "not connected yet" | `lib/form-schema.js` still has placeholder entry ids |
