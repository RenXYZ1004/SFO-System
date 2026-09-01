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

  $('title').textContent = SCHEMA.title;
  $('desc').textContent = SCHEMA.description || '';
  document.title = SCHEMA.title;

  if (!SCHEMA.configured) {
    banner(
      '<strong>Preview mode.</strong> This form is not connected to Google Forms yet — ' +
      'the field ids in <code>lib/form-schema.js</code> are placeholders, so submissions ' +
      'are rejected. Run <code>npm run schema</code> or <code>npm run import</code> to connect it.',
      'warn'
    );
  }

  renderSections();
  wireEvents();
  updateProgress();
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

function renderSections() {
  const groups = groupBySection(SCHEMA.fields);
  const single = groups.length === 1 && !groups[0].title;

  $('sections').innerHTML = groups.map((g, i) => {
    const head = single ? '' : `
      <div class="section-head">
        <span class="step" aria-hidden="true">${i + 1}</span>
        <h2>${esc(g.title || 'Your details')}</h2>
      </div>`;
    return `<section class="section">
      ${head}
      <div class="section-body">${g.fields.map(renderField).join('')}</div>
    </section>`;
  }).join('');
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

  const type = f.type === 'email' ? 'email' : (isPhone(f) ? 'tel' : 'text');
  const max = f.maxLength ? ` maxlength="${f.maxLength}"` : '';
  const mode = f.type === 'email' ? 'email' : (isPhone(f) ? 'tel' : 'text');
  const auto = f.type === 'email' ? 'email' : (isPhone(f) ? 'tel' : 'on');
  return field(f, id, star, help, describedBy,
    `<input type="${type}" name="${esc(f.name)}" id="${id}"${max}
            inputmode="${mode}" autocomplete="${auto}" placeholder="Your answer"
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

/** Mirrors the server rules so people get feedback before a round-trip. */
function checkField(f, v) {
  const value = (v || '').trim();
  if (f.required && !value) return 'This question is required';
  if (!value) return '';
  if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return 'Enter a valid email address';
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
  const req = SCHEMA.fields.filter((f) => f.required);
  if (!req.length) { $('progress-card').hidden = true; return; }

  const v = values();
  const done = req.filter((f) => !checkField(f, v[f.name])).length;
  const pct = Math.round((done / req.length) * 100);

  $('progress-card').hidden = false;
  $('progress-label').textContent = `${done} of ${req.length} required answers`;
  $('progress-pct').textContent = `${pct}%`;
  $('fill').style.width = `${pct}%`;
  $('track').setAttribute('aria-valuenow', String(pct));
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
    const v = values()[f.name];
    setFieldState(f.name, checkField(f, v), v);
  }, true);

  // Clear an error as soon as the answer becomes valid again.
  form.addEventListener('input', (e) => {
    const wrap = e.target.closest?.('.field');
    if (wrap?.classList.contains('invalid')) {
      const f = SCHEMA.fields.find((x) => x.name === wrap.dataset.for);
      if (f) {
        const v = values()[f.name];
        if (!checkField(f, v)) setFieldState(f.name, '', v);
      }
    }
    updateProgress();
  });
  form.addEventListener('change', updateProgress);

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
    document.querySelectorAll('.field').forEach((el) => el.classList.remove('invalid', 'done'));
    document.querySelectorAll('.err-msg').forEach((p) => (p.textContent = ''));
    $('done').hidden = true;
    form.hidden = false;
    $('progress-card').hidden = false;
    updateProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function banner(html, kind = '') {
  const b = $('banner');
  b.className = 'banner' + (kind ? ' ' + kind : '');
  b.innerHTML = html;
  b.hidden = false;
}

function focusFirstInvalid() {
  const el = document.querySelector('.field.invalid');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.querySelector('input,select,textarea')?.focus({ preventScroll: true });
}

async function onSubmit(e) {
  e.preventDefault();
  clearErrors();

  const v = values();
  let bad = 0;
  for (const f of SCHEMA.fields) {
    const msg = checkField(f, v[f.name]);
    if (msg) bad++;
    setFieldState(f.name, msg, v[f.name]);
  }
  if (bad) {
    banner(`<strong>${bad} ${bad === 1 ? 'answer needs' : 'answers need'} your attention.</strong>
            Please check the highlighted ${bad === 1 ? 'question' : 'questions'} below.`);
    focusFirstInvalid();
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
      banner(esc(data.error || 'Something went wrong. Please try again.'));
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
  $('done-msg').textContent = data.mailSent
    ? `Your spot is confirmed. A confirmation email is on its way to ${to}.`
    : 'Your registration has been recorded.';

  const warn = $('mail-warn');
  if (!data.mailSent) {
    warn.hidden = false;
    warn.innerHTML = '<strong>Your registration was saved</strong>, but the confirmation ' +
      'email could not be sent. Please contact the organisers.' +
      (data.detail ? `<br><small>${esc(data.detail)}</small>` : '');
  } else {
    warn.hidden = true;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
