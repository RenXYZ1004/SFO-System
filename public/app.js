const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Field names are generated slugs ([a-z0-9_]), so escaping is normally a no-op.
// CSS.escape is not available everywhere, so fall back to escaping by hand.
const cssEsc = (s) =>
  (typeof CSS !== 'undefined' && CSS.escape)
    ? CSS.escape(s)
    : String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);

let SCHEMA = null;

init();

async function init() {
  try {
    const res = await fetch('/api/schema');
    if (!res.ok) throw new Error(String(res.status));
    SCHEMA = await res.json();
  } catch {
    return banner('Could not load the registration form. Please refresh the page.');
  }

  // The hero wordmark is styled markup; only replace it if it is not static.
  const titleEl = $('title');
  if (titleEl && !titleEl.hasAttribute('data-static')) titleEl.textContent = SCHEMA.title;
  $('desc').textContent = SCHEMA.description || '';
  document.title = SCHEMA.title;

  if (!SCHEMA.configured) {
    const msg =
      '<strong>Preview mode.</strong> This form is not connected to Google Forms yet — ' +
      'the field ids in <code>lib/form-schema.js</code> are placeholders, so submissions ' +
      'are rejected. Run <code>npm run schema</code> or <code>npm run import</code> to connect it.';
    banner(msg, 'warn');
    const n = $('intro-notice');
    if (n) { n.innerHTML = msg; n.hidden = false; }
  }

  renderSections();
  wireEvents();
  wireViews();
  wireCauses();
  wireSalaryDeduction();
  updateProgress();

  // Deep link straight to the form, and honour the back button.
  showView(location.hash === '#register' ? 'form' : 'intro', { silent: true });
}

/* ---------- views ---------- */

/**
 * The page is two screens: the event intro, and the registration itself.
 * Switching is client-side so there is only one deploy and one schema fetch.
 */
function showView(name, { silent = false } = {}) {
  const intro = $('view-intro');
  const form = $('view-form');
  if (!intro || !form) return;

  const toForm = name === 'form';
  intro.hidden = toForm;
  form.hidden = !toForm;

  if (!silent) {
    const hash = toForm ? '#register' : '#';
    if (location.hash !== hash) history.pushState({ view: name }, '', hash);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Move focus so keyboard and screen-reader users land in the new screen.
    (toForm ? $('form-h') : $('proceed'))?.focus({ preventScroll: true });
  } else {
    window.scrollTo({ top: 0 });
  }
}

/* ---------- "where does it go?" modal ---------- */

/**
 * A photo slot with no file behind it yet keeps its place in the grid and
 * says so, rather than rendering a broken-image icon. Used by both the
 * beneficiary photos and the payment-method images.
 */
function wireShots(root) {
  root.querySelectorAll('.shot img').forEach((img) => {
    const markMissing = () => img.closest('.shot')?.classList.add('missing');
    img.addEventListener('error', markMissing);
    // Cached failures can land before the listener is attached.
    if (img.complete && img.naturalWidth === 0) markMissing();
  });
}

/**
 * Native <dialog> gives us the focus trap, Escape handling and focus restore
 * for free, so this only has to cover opening and the backdrop click.
 */
function wireCauses() {
  const modal = $('causes-modal');
  const open = $('causes-open');
  if (!modal || !open) return;

  wireShots(modal);

  open.addEventListener('click', () => {
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');   // very old browsers: inline fallback
  });

  $('causes-close')?.addEventListener('click', () => modal.close());

  // Clicking the backdrop closes; clicking the panel must not.
  modal.addEventListener('click', (e) => {
    if (e.target !== modal) return;        // clicks inside bubble from children
    const r = modal.getBoundingClientRect();
    const inside =
      e.clientX >= r.left && e.clientX <= r.right &&
      e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) modal.close();
  });
}

/* ---------- SISC salary deduction panel ---------- */

/**
 * Paying by payroll deduction needs four extra answers that nobody else has
 * to see, so they live in a pop-up rather than the main flow. The dialog sits
 * inside <form>, which means its answers travel with the submission whether
 * it happens to be open or closed — no shadow state to keep in sync.
 */
function wireSalaryDeduction() {
  const modal = $('sd-modal');
  if (!modal) return;

  // Whichever control the schema produced for the method question.
  document.querySelectorAll('[name="payment_method"]').forEach((el) =>
    el.addEventListener('change', () => onMethodChange()));

  $('sd-edit')?.addEventListener('click', openSd);
  $('sd-close')?.addEventListener('click', () => closeSd());
  $('sd-cancel')?.addEventListener('click', () => closeSd());
  $('sd-save')?.addEventListener('click', saveSd);

  // Enter inside the panel means "save these details", not "submit the whole
  // registration" — the inputs belong to the outer form, so without this the
  // browser would send a half-filled form.
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      saveSd();
    }
  });

  // Escape and the backdrop both close the dialog; either way the card
  // underneath has to tell the truth about what is still missing.
  modal.addEventListener('close', () => { refreshSdSummary(); updateProgress(); });
  modal.addEventListener('click', (e) => {
    if (e.target !== modal) return;
    const r = modal.getBoundingClientRect();
    const inside =
      e.clientX >= r.left && e.clientX <= r.right &&
      e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) closeSd();
  });

  refreshSdSummary();
}

function openSd() {
  const modal = $('sd-modal');
  if (!modal) return;
  sdError('');
  if (typeof modal.showModal === 'function') {
    if (!modal.open) modal.showModal();
  } else {
    modal.setAttribute('open', '');
  }
  modal.querySelector('input')?.focus();
}

function closeSd() {
  const modal = $('sd-modal');
  if (!modal) return;
  if (typeof modal.close === 'function' && modal.open) modal.close();
  else modal.removeAttribute('open');
  refreshSdSummary();
  updateProgress();
}

/** Picked a method: open the panel for employees, clear it for everyone else. */
function onMethodChange() {
  refreshPaymentInfo();
  const employee = panelFields(SD_PANEL).some((f) => isActive(f));
  if (employee) {
    refreshSdSummary();
    openSd();
  } else {
    clearSd();
    closeSd();
  }
  updateProgress();
}

function clearSd() {
  for (const f of panelFields(SD_PANEL)) {
    const el = document.querySelector(`[name="${cssEsc(f.name)}"]`);
    if (el) el.value = '';
    setFieldState(f.name, '', '');
  }
  sdError('');
}

function saveSd() {
  const v = values();
  const fields = panelFields(SD_PANEL);
  let bad = 0;
  for (const f of fields) {
    const msg = checkField(f, v[f.name], v);
    if (msg) bad++;
    setFieldState(f.name, msg, v[f.name]);
  }
  if (bad) {
    sdError(`${bad} ${bad === 1 ? 'field needs' : 'fields need'} your attention before these details can be saved.`);
    $('sd-modal').querySelector('.field.invalid input')?.focus();
    return;
  }
  sdError('');
  closeSd();
}

function sdError(message) {
  const box = $('sd-error');
  if (!box) return;
  box.textContent = message;
  box.hidden = !message;
}

/** Keeps the card under the method chips in step with the panel's answers. */
function refreshSdSummary() {
  const box = $('sd-summary');
  if (!box) return;

  const v = values();
  const fields = panelFields(SD_PANEL);
  const employee = fields.some((f) => isActive(f, v));
  box.hidden = !employee;
  if (!employee) return;

  const complete = fields.every((f) => !checkField(f, v[f.name], v));
  box.classList.toggle('ready', complete);
  $('sd-badge').textContent = complete ? 'Details saved' : 'Needs details';
  $('sd-summary-text').textContent = complete
    ? fields.map((f) => v[f.name]).filter(Boolean).slice(0, 3).join(' · ')
    : 'Three equal salary deductions starting November 15, 2026. We need your employee details before you can submit.';
  $('sd-edit').textContent = complete ? 'Edit details' : 'Add details';
}

function wireViews() {
  $('proceed')?.addEventListener('click', () => showView('form'));
  $('back')?.addEventListener('click', () => showView('intro'));
  window.addEventListener('popstate', () => {
    showView(location.hash === '#register' ? 'form' : 'intro', { silent: true });
  });
}

/* ---------- rendering ---------- */

function groupBySection(fields) {
  const groups = [];
  const index = new Map();
  for (const f of fields) {
    const key = f.section || '';
    if (!index.has(key)) {
      index.set(key, { title: key, fields: [] });
      groups.push(index.get(key));
    }
    index.get(key).fields.push(f);
  }
  return groups;
}

const SD_PANEL = 'salary-deduction';
const panelFields = (panel) => SCHEMA.fields.filter((f) => f.panel === panel);

/**
 * Is this question actually being asked, given the answers so far?
 * Mirrors isActive() in lib/form-schema.js — the page and the server must
 * never disagree about which questions are required.
 */
function isActive(f, all) {
  const cond = f.showIf;
  if (!cond) return true;
  const current = ((all || values())[cond.field] || '').trim();
  if (cond.equals !== undefined) return current === cond.equals;
  if (cond.notEquals !== undefined) return current !== cond.notEquals;
  return current !== '';
}

function renderSections() {
  // Questions belonging to a pop-up panel are drawn there, not in the flow.
  const groups = groupBySection(SCHEMA.fields.filter((f) => !f.panel));
  const single = groups.length === 1 && !groups[0].title;

  $('sections').innerHTML = groups.map((g, i) => {
    const head = single ? '' : `
      <div class="section-head">
        <span class="step" aria-hidden="true">${i + 1}</span>
        <h2>${esc(g.title || 'Your details')}</h2>
      </div>`;
    return `<section class="section" data-section="${esc(g.title)}">
      ${head}
      <div class="section-body">${g.fields.map(renderField).join('')}</div>
    </section>`;
  }).join('');

  const sd = $('sd-fields');
  if (sd) sd.innerHTML = panelFields(SD_PANEL).map(renderField).join('');

  mountPaymentInfo();
  mountSdSummary();
}

/**
 * Drops the account details and the payment-method photos at the top of the
 * Payment section, so they are on screen while the fee is being settled
 * rather than buried on the intro page.
 */
/** Finds a rendered section by its schema title. */
function sectionEl(title) {
  // Matched on the dataset rather than an attribute selector: section titles
  // come from the schema and may contain quotes or an ampersand.
  return [...document.querySelectorAll('.section')]
    .find((el) => el.dataset.section === title) || null;
}

function mountPaymentInfo() {
  const tpl = $('tpl-payment-info');
  const body = sectionEl('Payment')?.querySelector('.section-body');
  if (!tpl || !body) return;

  body.prepend(tpl.content.cloneNode(true));
  body.querySelectorAll('.pay-shots .shot[data-file]').forEach(wirePayImage);

  refreshPaymentInfo();

  $('acct-copy')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText($('acct-no').textContent.trim());
      label(btn, 'Copied');
      btn.classList.add('copied');
      setTimeout(() => { label(btn, 'Copy'); btn.classList.remove('copied'); }, 1600);
    } catch {
      label(btn, 'Press Ctrl+C');
    }
  });
}

const label = (btn, text) => {
  const el = btn.querySelector('.acct-copy-label');
  if (el) el.textContent = text; else btn.textContent = text;
};

/**
 * What a runner has to do next depends entirely on how they are paying, so
 * the payment card says one thing at a time: the tile for the chosen method
 * comes forward, the other steps back, and the note underneath — plus the
 * hint on the upload question — describe that method and no other.
 */
const PAYMENT_GUIDE = {
  'Bank transfer': {
    note: 'Deposit or transfer the fee to the PNB account above, then upload the deposit slip or transfer receipt below.',
  },
  'Employee': {
    note: 'Nothing to send — the fee is taken from your payroll in three equal deductions, starting November 15, 2026. Your authorisation above is the record, so there is no receipt to upload.',
  },
};

function refreshPaymentInfo() {
  const chosen = (values().payment_method || '').trim();

  document.querySelectorAll('.pay-shots .shot').forEach((tile) => {
    const mine = tile.dataset.method === chosen;
    // Nothing is dimmed until a method is picked — both are still on offer.
    tile.classList.toggle('on', !!chosen && mine);
    tile.classList.toggle('off', !!chosen && !mine);
  });

  // The PNB details are only what a bank transfer needs. They stay on the
  // page for anyone still deciding, but step back once another method is
  // chosen rather than competing with the instruction that does apply.
  const bank = document.querySelector('.bank-card');
  if (bank) bank.classList.toggle('off', !!chosen && chosen !== 'Bank transfer');

  const guide = PAYMENT_GUIDE[chosen];
  const note = $('pay-note');
  if (note) {
    note.textContent = guide
      ? guide.note
      : 'Choose your payment method below, then upload the receipt as your proof of payment.';
  }

}

/**
 * Whoever drops the payment images in is working from a phone or a scanner,
 * not from the README, so the tile tries the sensible spellings of its
 * filename in turn — hyphen or underscore, jpg or png — and only gives up
 * (showing the "coming soon" placeholder) once none of them exists.
 */
const PAY_IMAGE_EXTENSIONS = ['jpg', 'png', 'jpeg', 'webp'];

function payImageCandidates(base) {
  const names = base.includes('-') ? [base, base.replace(/-/g, '_')] : [base];
  return names.flatMap((n) => PAY_IMAGE_EXTENSIONS.map((ext) => `/payment/${n}.${ext}`));
}

function wirePayImage(figure) {
  const img = figure.querySelector('img');
  if (!img) return;

  const queue = payImageCandidates(figure.dataset.file);
  let i = 0;

  const next = () => {
    if (i >= queue.length) { figure.classList.add('missing'); return; }
    img.src = queue[i++];
  };

  // Only the last failure is a real "no image": the others are just the next
  // spelling to try, so wireShots' own error handler must not fire first.
  img.addEventListener('error', next);

  // A QR code or an account card is read, not glanced at, so once one is
  // really there offer it at its own size.
  img.addEventListener('load', () => {
    const zoom = figure.querySelector('.shot-zoom');
    if (!zoom) return;
    zoom.href = img.src;
    zoom.hidden = false;
  });

  next();
}

/**
 * The card that sits under the payment-method chips once "Employee" is
 * chosen: it reports whether the salary-deduction panel has been filled in,
 * and is the way back into it.
 */
function mountSdSummary() {
  const anchor = document.querySelector('.field[data-for="payment_method"]');
  if (!anchor || !panelFields(SD_PANEL).length) return;

  const box = document.createElement('div');
  box.className = 'sd-summary';
  box.id = 'sd-summary';
  box.hidden = true;
  box.innerHTML = `
    <div class="sd-summary-main">
      <span class="sd-badge" id="sd-badge">Needs details</span>
      <p class="sd-summary-text" id="sd-summary-text"></p>
    </div>
    <button type="button" class="btn-ghost sd-edit" id="sd-edit">Add details</button>`;
  anchor.after(box);
}

function renderField(f) {
  const star = f.required
    ? '<span class="req" aria-hidden="true">*</span>'
    : '<span class="optional">optional</span>';
  const help = f.help ? `<p class="help" id="h_${esc(f.name)}">${esc(f.help)}</p>` : '';
  const describedBy = [f.help ? `h_${f.name}` : '', `e_${f.name}`].filter(Boolean).join(' ');
  const id = `f_${esc(f.name)}`;

  // Choice: chips when the options are few and short, a select when there are many.
  if (f.type === 'choice' && f.options?.length) {
    const compact = f.options.length <= 7 && f.options.every((o) => String(o).length <= 22);
    if (compact) {
      const chips = f.options.map((o, i) => `
        <label class="chip">
          <input type="radio" name="${esc(f.name)}" value="${esc(o)}" id="${id}_${i}"
                 ${f.required ? 'required' : ''}>
          <span>${esc(o)}</span>
        </label>`).join('');
      return `<div class="field" data-for="${esc(f.name)}">
        <fieldset aria-describedby="${esc(describedBy)}">
          <legend class="q">${esc(f.label)}${star}</legend>
          ${help}
          <div class="chips">${chips}</div>
          <p class="err-msg" id="e_${esc(f.name)}"></p>
        </fieldset>
      </div>`;
    }
    const opts = f.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    return field(f, id, star, help, describedBy,
      `<select name="${esc(f.name)}" id="${id}" aria-describedby="${esc(describedBy)}">
         <option value="">Choose an option</option>${opts}
       </select>`);
  }

  if (f.type === 'paragraph') {
    return field(f, id, star, help, describedBy,
      `<textarea name="${esc(f.name)}" id="${id}" rows="3" placeholder="Your answer"
                 aria-describedby="${esc(describedBy)}"></textarea>`);
  }

  // File upload: the picked file goes to Vercel Blob, and the resulting URL
  // is what actually travels to the Google Form in the hidden input.
  if (f.type === 'file') {
    return field(f, id, star, help, describedBy, `
      <input type="hidden" name="${esc(f.name)}" id="${id}" value="">
      <input type="file" id="${id}_picker" class="file-input"
             accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
             aria-describedby="${esc(describedBy)}">
      <label class="drop" for="${id}_picker" data-drop="${esc(f.name)}">
        <span class="drop-icon" aria-hidden="true">&#8679;</span>
        <span class="drop-main">Choose a file or drag it here</span>
        <span class="drop-sub">JPG, PNG, WEBP, HEIC or PDF · up to 4&nbsp;MB</span>
      </label>
      <div class="upload" id="${id}_state" hidden>
        <div class="upload-row">
          <span class="upload-thumb" id="${id}_thumb" aria-hidden="true"></span>
          <span class="upload-meta">
            <span class="upload-name" id="${id}_name"></span>
            <span class="upload-status" id="${id}_status"></span>
          </span>
          <button type="button" class="btn-ghost" id="${id}_remove">Remove</button>
        </div>
        <div class="upload-track"><div class="upload-fill" id="${id}_bar"></div></div>
      </div>`);
  }

  const type = f.type === 'email' ? 'email' : (isPhone(f) ? 'tel' : 'text');
  const max = f.maxLength ? ` maxlength="${f.maxLength}"` : '';
  const mode = f.type === 'email' ? 'email' : (isPhone(f) ? 'tel' : 'text');
  const auto = f.type === 'email' ? 'email' : (isPhone(f) ? 'tel' : 'on');
  // A schema placeholder is a worked example ("DELA CRUZ, JUAN"); without one
  // the generic prompt still tells the reader the box is theirs to fill.
  const hint = f.placeholder || 'Your answer';
  return field(f, id, star, help, describedBy,
    `<input type="${type}" name="${esc(f.name)}" id="${id}"${max}
            inputmode="${mode}" autocomplete="${auto}" placeholder="${esc(hint)}"
            aria-describedby="${esc(describedBy)}">`);
}

function field(f, id, star, help, describedBy, control) {
  return `<div class="field" data-for="${esc(f.name)}">
    <label class="q" for="${id}">${esc(f.label)}${star}</label>
    ${help}
    ${control}
    <p class="err-msg" id="e_${esc(f.name)}"></p>
  </div>`;
}

const isPhone = (f) => /number|phone|contact|mobile/i.test(f.label) && f.type !== 'email';

/* ---------- validation ---------- */

function values() {
  return Object.fromEntries(new FormData($('form')).entries());
}

/**
 * Mirrors the server rules so people get feedback before a round-trip.
 * `all` is the full answer map; pass it so a question that is not currently
 * being asked is never reported as missing.
 */
function checkField(f, v, all) {
  if (all && !isActive(f, all)) return '';
  const value = (v || '').trim();
  if (f.type === 'file') {
    if (!value) return f.required ? 'Please upload your proof of payment' : '';
    return /^https:\/\/\S+$/.test(value) ? '' : 'The upload did not complete — please try again';
  }
  if (f.required && !value) return 'This question is required';
  if (!value) return '';
  if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return 'Enter a valid email address';
  }
  if (f.pattern) {
    // Compiled once per field rather than on every keystroke.
    f._re ||= new RegExp(f.pattern);
    if (!f._re.test(value)) return f.patternMessage || 'That is not in the expected format';
  }
  if (f.maxLength && value.length > f.maxLength) {
    return `Keep this under ${f.maxLength} characters`;
  }
  if (f.type === 'choice' && f.options?.length && !f.options.includes(value)) {
    return `Choose one of: ${f.options.join(', ')}`;
  }
  return '';
}

function setFieldState(name, message, filled) {
  const el = document.querySelector(`.field[data-for="${cssEsc(name)}"]`);
  if (!el) return false;
  el.classList.toggle('invalid', !!message);
  el.classList.toggle('done', !message && !!filled);
  const p = el.querySelector('.err-msg');
  if (p) p.textContent = message || '';
  el.querySelectorAll('input,select,textarea').forEach((c) => {
    if (message) c.setAttribute('aria-invalid', 'true');
    else c.removeAttribute('aria-invalid');
  });
  return true;
}

function clearErrors() {
  $('banner').hidden = true;
  document.querySelectorAll('.field.invalid').forEach((el) => {
    el.classList.remove('invalid');
    const p = el.querySelector('.err-msg');
    if (p) p.textContent = '';
  });
}

/* ---------- progress ---------- */

function updateProgress() {
  const v = values();
  // Choosing "Employee" adds the salary-deduction questions to the count,
  // and switching away from it takes them back out.
  const req = SCHEMA.fields.filter((f) => f.required && isActive(f, v));
  if (!req.length) { $('progress-card').hidden = true; return; }

  const done = req.filter((f) => !checkField(f, v[f.name], v)).length;
  const pct = Math.round((done / req.length) * 100);

  $('progress-card').hidden = false;
  $('progress-label').textContent = `${done} of ${req.length} required answers`;
  $('progress-pct').textContent = `${pct}%`;
  $('fill').style.width = `${pct}%`;
  $('track').setAttribute('aria-valuenow', String(pct));

  showOnlyActiveFields(v);
  markCompleteSections(v);
}

/**
 * Takes a question off the page entirely while it does not apply — an
 * employee paying by payroll deduction has no receipt to show, so being
 * asked for one at all is the confusing part, not being asked to skip it.
 */
function showOnlyActiveFields(v) {
  for (const f of SCHEMA.fields) {
    if (!f.showIf || f.panel) continue;      // panel questions live in a dialog
    const el = document.querySelector(`.field[data-for="${cssEsc(f.name)}"]`);
    if (!el) continue;

    const active = isActive(f, v);
    if (el.hidden === !active) continue;      // already in the right state
    el.hidden = !active;

    // Don't leave a receipt attached to a registration that no longer wants
    // one: it would never be recorded, and seeing it again on switching back
    // implies it was kept.
    if (!active) uploadResetters.get(f.name)?.();
  }

  // The rule under the final question of a section is drawn by :last-child,
  // which does not know about hidden siblings.
  document.querySelectorAll('.section-body').forEach((body) => {
    const fields = [...body.querySelectorAll('.field')];
    fields.forEach((el) => el.classList.remove('last-shown'));
    fields.filter((el) => !el.hidden).at(-1)?.classList.add('last-shown');
  });
}

/**
 * A section head shows a tick once nothing in it is outstanding, so a long
 * form can be scanned for what is left rather than re-read. An unanswered
 * optional question does not hold a section back.
 */
function markCompleteSections(v) {
  const state = new Map();
  for (const f of SCHEMA.fields) {
    if (!isActive(f, v)) continue;
    const key = f.section || '';
    const s = state.get(key) || { total: 0, done: 0 };
    s.total++;
    if (!checkField(f, v[f.name], v)) s.done++;
    state.set(key, s);
  }
  document.querySelectorAll('.section[data-section]').forEach((el) => {
    const s = state.get(el.dataset.section);
    el.classList.toggle('complete', !!s && s.total > 0 && s.done === s.total);
  });
}

/* ---------- events ---------- */

function wireEvents() {
  const form = $('form');

  // Validate a field when the user leaves it, but never nag before then.
  form.addEventListener('blur', (e) => {
    const wrap = e.target.closest?.('.field');
    if (!wrap) return;
    const f = SCHEMA.fields.find((x) => x.name === wrap.dataset.for);
    if (!f) return;
    const all = values();
    const v = all[f.name];
    setFieldState(f.name, checkField(f, v, all), v);
  }, true);

  // Clear an error as soon as the answer becomes valid again.
  form.addEventListener('input', (e) => {
    const wrap = e.target.closest?.('.field');
    if (wrap?.classList.contains('invalid')) {
      const f = SCHEMA.fields.find((x) => x.name === wrap.dataset.for);
      if (f) {
        const all = values();
        const v = all[f.name];
        if (!checkField(f, v, all)) setFieldState(f.name, '', v);
      }
    }
    updateProgress();
  });
  form.addEventListener('change', updateProgress);

  SCHEMA.fields.filter((f) => f.type === 'file').forEach(wireUpload);

  form.addEventListener('submit', onSubmit);

  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('ref').textContent);
      $('copy').textContent = 'Copied';
      setTimeout(() => ($('copy').textContent = 'Copy'), 1600);
    } catch {
      $('copy').textContent = 'Press Ctrl+C';
    }
  });

  $('again').addEventListener('click', (e) => {
    e.preventDefault();
    form.reset();
    resetUploads();
    document.querySelectorAll('.field').forEach((el) => el.classList.remove('invalid', 'done'));
    document.querySelectorAll('.err-msg').forEach((p) => (p.textContent = ''));
    refreshSdSummary();
    $('done').hidden = true;
    form.hidden = false;
    $('progress-card').hidden = false;
    updateProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ---------- file upload ---------- */

const MAX_UPLOAD = 4 * 1024 * 1024;
const kb = (n) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

// Each file field registers a reset callback, so the form can clear all of
// them at once or drop just the one whose question stopped being asked.
const uploadResetters = new Map();
function resetUploads() {
  uploadResetters.forEach((fn) => fn());
}

/**
 * Shrinks a large photo in the browser so a phone camera shot does not blow
 * past the request limit. Returns the original if it is already small,
 * cannot be decoded, or is not an image.
 */
async function downscale(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/heic' || file.type === 'image/heif') {
    return file;
  }
  if (file.size < 900 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function wireUpload(f) {
  const id = `f_${f.name}`;
  const hidden = $(id);
  const picker = $(`${id}_picker`);
  const drop = document.querySelector(`[data-drop="${cssEsc(f.name)}"]`);
  const state = $(`${id}_state`);
  const bar = $(`${id}_bar`);
  const status = $(`${id}_status`);
  const nameEl = $(`${id}_name`);
  const thumb = $(`${id}_thumb`);
  if (!hidden || !picker) return;

  let objectUrl = null;

  const reset = () => {
    hidden.value = '';
    picker.value = '';
    state.hidden = true;
    drop.hidden = false;
    bar.style.width = '0%';
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    thumb.style.backgroundImage = '';
    thumb.textContent = '';
    updateProgress();
  };

  uploadResetters.set(f.name, reset);

  $(`${id}_remove`).addEventListener('click', () => {
    reset();
    setFieldState(f.name, '', '');
  });

  async function handle(file) {
    if (!file) return;

    if (file.size > MAX_UPLOAD * 3) {
      setFieldState(f.name, `That file is ${kb(file.size)} — too large to upload.`, '');
      return;
    }

    drop.hidden = true;
    state.hidden = false;
    nameEl.textContent = file.name;
    status.textContent = 'Preparing…';
    status.className = 'upload-status';
    bar.style.width = '8%';
    setFieldState(f.name, '', '');

    const sending = await downscale(file);

    if (sending.type.startsWith('image/')) {
      objectUrl = URL.createObjectURL(sending);
      thumb.style.backgroundImage = `url(${objectUrl})`;
    } else {
      thumb.textContent = 'PDF';
    }

    if (sending.size > MAX_UPLOAD) {
      status.textContent = `Too large (${kb(sending.size)}). Please use a smaller file.`;
      status.className = 'upload-status bad';
      bar.style.width = '0%';
      setFieldState(f.name, 'That file is too large. Please keep it under 4 MB.', '');
      return;
    }

    status.textContent = `Uploading… ${kb(sending.size)}`;
    bar.style.width = '35%';

    try {
      const res = await fetch('/api/blob-upload', {
        method: 'POST',
        headers: { 'Content-Type': sending.type, 'X-Filename': sending.name },
        body: sending,
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        status.textContent = data.error || 'Upload failed. Please try again.';
        status.className = 'upload-status bad';
        bar.style.width = '0%';
        setFieldState(f.name, data.error || 'Upload failed. Please try again.', '');
        return;
      }

      hidden.value = data.url;
      bar.style.width = '100%';
      status.textContent = `Uploaded · ${kb(data.size ?? sending.size)}`;
      status.className = 'upload-status good';
      setFieldState(f.name, '', data.url);
      updateProgress();
    } catch {
      status.textContent = 'Network error. Please try again.';
      status.className = 'upload-status bad';
      bar.style.width = '0%';
      setFieldState(f.name, 'Network error while uploading. Please try again.', '');
    }
  }

  picker.addEventListener('change', () => handle(picker.files?.[0]));

  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => handle(e.dataTransfer?.files?.[0]));
}

function banner(html, kind = '') {
  const b = $('banner');
  b.className = 'banner' + (kind ? ' ' + kind : '');
  b.innerHTML = html;
  b.hidden = false;
}

function focusFirstInvalid() {
  // Scoped to the visible flow: a panel field lives in a dialog that may be shut.
  const el = document.querySelector('#sections .field.invalid');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.querySelector('input,select,textarea')?.focus({ preventScroll: true });
}

async function onSubmit(e) {
  e.preventDefault();
  clearErrors();

  const v = values();
  let bad = 0;
  let badInPanel = 0;
  for (const f of SCHEMA.fields) {
    const msg = checkField(f, v[f.name], v);
    if (msg) { bad++; if (f.panel) badInPanel++; }
    setFieldState(f.name, msg, v[f.name]);
  }
  refreshSdSummary();
  if (bad) {
    banner(`<strong>${bad} ${bad === 1 ? 'answer needs' : 'answers need'} your attention.</strong>
            Please check the highlighted ${bad === 1 ? 'question' : 'questions'} below.`);
    // An unanswered panel question sits behind a closed dialog, so scrolling
    // to it would land on nothing. Reopen the panel instead.
    if (badInPanel && bad === badInPanel) openSd();
    else focusFirstInvalid();
    return;
  }

  const btn = $('submit');
  btn.disabled = true;
  btn.classList.add('loading');
  btn.querySelector('.btn-label').textContent = 'Submitting…';

  let data;
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...v, _hp: '' }),
    });
    data = await res.json();
  } catch {
    resetButton();
    banner('Network error — your registration was not sent. Please try again.');
    return;
  }
  resetButton();

  if (!data.ok) {
    if (Array.isArray(data.errors)) {
      const unmapped = data.errors.filter((msg) => {
        const f = SCHEMA.fields.find((x) => msg.startsWith(x.label));
        return !(f && setFieldState(f.name, msg.slice(f.label.length).trim() || msg, v[f.name]));
      });
      banner('<strong>Please fix the following:</strong><ul>' +
        (unmapped.length ? unmapped : ['Check the highlighted questions below.'])
          .map((m) => `<li>${esc(m)}</li>`).join('') + '</ul>');
      focusFirstInvalid();
    } else {
      banner(esc(data.error || 'Something went wrong. Please try again.') +
        (data.uploadCleared ? ' Your file was removed — please attach it again.' : ''));
      if (data.uploadCleared) resetUploads();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }

  showDone(data, v);
}

function resetButton() {
  const btn = $('submit');
  btn.disabled = false;
  btn.classList.remove('loading');
  btn.querySelector('.btn-label').textContent = 'Complete registration';
}

function showDone(data, v) {
  $('form').hidden = true;
  $('progress-card').hidden = true;
  $('banner').hidden = true;
  $('done').hidden = false;
  $('ref').textContent = data.ref;

  const to = v[SCHEMA.fields.find((f) => f.type === 'email')?.name] || 'your email address';
  $('done-msg').textContent = (data.mailSent || data.mailQueued)
    ? `Your spot is confirmed. A confirmation email is on its way to ${to}.`
    : 'Your registration has been recorded.';

  const warn = $('mail-warn');
  if (!data.mailSent && !data.mailQueued) {
    warn.hidden = false;
    warn.innerHTML = '<strong>Your registration was saved</strong>, but the confirmation ' +
      'email could not be sent. Please contact the organisers.' +
      (data.detail ? `<br><small>${esc(data.detail)}</small>` : '');
  } else {
    warn.hidden = true;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
