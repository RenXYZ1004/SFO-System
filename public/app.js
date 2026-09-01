const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let SCHEMA = null;

init();

async function init() {
  try {
    const res = await fetch('/api/schema');
    SCHEMA = await res.json();
  } catch {
    return banner('Could not load the form. Please refresh the page.');
  }

  $('title').textContent = SCHEMA.title;
  $('desc').textContent = SCHEMA.description || '';
  document.title = SCHEMA.title;

  if (!SCHEMA.configured) {
    banner(
      'This form is not connected yet — the Google Form field ids are still placeholders. ' +
      'Submissions will be rejected until <code>lib/form-schema.js</code> is filled in.',
      'warn'
    );
  }

  $('fields').innerHTML = SCHEMA.fields.map(renderField).join('');
  $('form').addEventListener('submit', onSubmit);
  $('again').addEventListener('click', (e) => {
    e.preventDefault();
    $('form').reset();
    $('done').hidden = true;
    $('form').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function renderField(f) {
  const star = f.required ? ' <span class="req">*</span>' : '';
  const help = f.help ? `<p class="help">${esc(f.help)}</p>` : '';
  let control;

  if (f.type === 'choice' && f.options?.length) {
    control = f.options.length > 5
      ? `<select name="${esc(f.name)}" id="f_${esc(f.name)}">
           <option value="">Choose</option>
           ${f.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
         </select>`
      : f.options.map((o, i) => `
          <div class="radio">
            <input type="radio" id="f_${esc(f.name)}_${i}" name="${esc(f.name)}" value="${esc(o)}">
            <label for="f_${esc(f.name)}_${i}">${esc(o)}</label>
          </div>`).join('');
  } else {
    const type = f.type === 'email' ? 'email' : 'text';
    const max = f.maxLength ? ` maxlength="${f.maxLength}"` : '';
    control = `<input type="${type}" name="${esc(f.name)}" id="f_${esc(f.name)}"${max}
                 placeholder="Your answer" autocomplete="${f.type === 'email' ? 'email' : 'on'}">`;
  }

  return `<div class="field" data-for="${esc(f.name)}">
    <label class="q" for="f_${esc(f.name)}">${esc(f.label)}${star}</label>
    ${help}
    ${control}
    <p class="err-msg"></p>
  </div>`;
}

function banner(html, kind = '') {
  const b = $('banner');
  b.className = 'banner' + (kind ? ' ' + kind : '');
  b.innerHTML = html;
  b.hidden = false;
}

function clearErrors() {
  $('banner').hidden = true;
  document.querySelectorAll('.field.invalid').forEach((el) => {
    el.classList.remove('invalid');
    el.querySelector('.err-msg').textContent = '';
  });
}

function markField(name, message) {
  const el = document.querySelector(`.field[data-for="${CSS.escape(name)}"]`);
  if (!el) return false;
  el.classList.add('invalid');
  el.querySelector('.err-msg').textContent = message;
  return true;
}

/** Mirrors the server rules so users get feedback before a round-trip. */
function validateClient(values) {
  const errors = [];
  for (const f of SCHEMA.fields) {
    const v = (values[f.name] || '').trim();
    if (f.required && !v) { errors.push([f.name, 'This is a required question']); continue; }
    if (!v) continue;
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      errors.push([f.name, 'Enter a valid email address']);
    }
    if (f.maxLength && v.length > f.maxLength) {
      errors.push([f.name, `Keep this under ${f.maxLength} characters`]);
    }
  }
  return errors;
}

async function onSubmit(e) {
  e.preventDefault();
  clearErrors();

  const values = Object.fromEntries(new FormData(e.target).entries());
  const local = validateClient(values);
  if (local.length) {
    local.forEach(([n, m]) => markField(n, m));
    document.querySelector('.field.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  $('submit').disabled = true;
  $('status').textContent = 'Submitting…';

  let data;
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, _hp: '' }),
    });
    data = await res.json();
  } catch {
    $('submit').disabled = false;
    $('status').textContent = '';
    return banner('Network error — your registration was not sent. Please try again.');
  }

  $('submit').disabled = false;
  $('status').textContent = '';

  if (!data.ok) {
    if (Array.isArray(data.errors)) {
      // Map server messages back onto their fields where possible.
      const unmapped = data.errors.filter((msg) => {
        const f = SCHEMA.fields.find((x) => msg.startsWith(x.label));
        return !(f && markField(f.name, msg.slice(f.label.length).trim().replace(/^is /, 'Is ')));
      });
      if (unmapped.length) {
        banner('<strong>Please fix the following:</strong><ul>' +
          unmapped.map((m) => `<li>${esc(m)}</li>`).join('') + '</ul>');
      }
      document.querySelector('.field.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      banner(esc(data.error || 'Something went wrong. Please try again.'));
    }
    return;
  }

  showDone(data);
}

function showDone(data) {
  $('form').hidden = true;
  $('done').hidden = false;
  $('ref').textContent = data.ref;
  const email = SCHEMA.fields.find((f) => f.type === 'email');
  $('done-msg').textContent = data.mailSent
    ? 'Your response has been saved. A confirmation email is on its way.'
    : 'Your response has been saved to the sheet.';

  if (!data.mailSent) {
    $('mail-warn').hidden = false;
    $('mail-warn').innerHTML =
      `<strong>Your registration was saved</strong>, but the confirmation email could not be sent. ` +
      `Please contact the administrator.` +
      (data.detail ? `<br><small>${esc(data.detail)}</small>` : '');
  } else {
    $('mail-warn').hidden = true;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
