const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let FIELDS = [];
let ROWS = [];
// Which group the dashboard is showing: 'all', 'public' or 'employee'.
let TYPE = 'all';
// { label, value } — the answer that marks a registration as an employee's.
let EMPLOYEE = null;

start();

async function start() {
  try {
    const res = await fetch('/api/staff-login');
    const d = await res.json();
    if (!d.ok) return gateError(d.error || 'Staff dashboard unavailable.', true);
    if (d.signedIn) return openApp();
  } catch {
    return gateError('Could not reach the server.', true);
  }
  $('gate').hidden = false;
  $('pw').focus();
  wireGate();
}

/* ---------- sign in ---------- */

function gateError(msg, fatal = false) {
  $('gate').hidden = false;
  const e = $('gate-err');
  e.textContent = msg;
  e.hidden = false;
  if (fatal) $('gate-form').querySelectorAll('input,button').forEach((el) => (el.disabled = true));
}

function wireGate() {
  $('gate-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('gate-btn');
    btn.disabled = true;
    btn.classList.add('loading');
    $('gate-err').hidden = true;

    try {
      const res = await fetch('/api/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: $('pw').value }),
      });
      const d = await res.json();
      if (d.ok && d.signedIn) {
        $('pw').value = '';
        $('gate').hidden = true;
        return openApp();
      }
      gateError(d.error || 'That passcode is not correct.');
    } catch {
      gateError('Could not reach the server.');
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  });
}

/* ---------- dashboard ---------- */

function openApp() {
  $('gate').hidden = true;
  $('app').hidden = false;
  wireApp();
  load();
}

function wireApp() {
  let t;
  $('q').addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => load($('q').value.trim()), 220);
  });
  $('clear').addEventListener('click', () => { $('q').value = ''; load(); $('q').focus(); });
  $('refresh').addEventListener('click', () => load($('q').value.trim()));

  document.querySelectorAll('.seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.type === TYPE) return;
      TYPE = btn.dataset.type;
      document.querySelectorAll('.seg').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', String(on));
      });
      load($('q').value.trim());
    });
  });
  $('detail-close').addEventListener('click', () => $('detail').close());
  $('detail').addEventListener('click', (e) => {
    if (e.target !== $('detail')) return;
    const r = $('detail').getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) $('detail').close();
  });
  $('signout').addEventListener('click', async () => {
    await fetch('/api/staff-login', { method: 'DELETE' });
    location.reload();
  });
}

async function load(q = '') {
  notice();
  $('count').textContent = 'Loading…';
  let d;
  try {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (TYPE !== 'all') params.set('type', TYPE);
    const res = await fetch('/api/staff-data' + (params.size ? `?${params}` : ''));
    if (res.status === 401) return location.reload();   // session expired
    d = await res.json();
  } catch {
    return notice('Could not reach the server.');
  }
  if (!d.ok) return notice(d.error || 'Could not load registrations.');

  FIELDS = d.fields || [];
  ROWS = d.rows || [];
  EMPLOYEE = d.employee || null;
  renderSegments(d);
  renderStats(d);
  renderRows(d);
}

/** Keeps each tab's count in step, whichever group is being shown. */
function renderSegments(d) {
  const seg = d.segments;
  $('seg-all').textContent = d.total ?? '—';
  $('seg-public').textContent = seg ? seg.public : '—';
  $('seg-employee').textContent = seg ? seg.employee : '—';
}

function renderStats(d) {
  const cards = [
    ['Total registered', d.total],
  ];
  if (d.segments) {
    cards.push(['Non-employees', d.segments.public]);
    cards.push(['Employees · salary deduction', d.segments.employee]);
  }
  if (d.breakdown?.category?.counts?.length) {
    for (const c of d.breakdown.category.counts) cards.push([c.value || 'Unspecified', c.n]);
  }
  let html = cards.map(([k, v]) =>
    `<div class="stat"><span class="stat-n">${esc(v)}</span><span class="stat-k">${esc(k)}</span></div>`).join('');

  if (d.needsAttention > 0) {
    html += `<div class="stat warn"><span class="stat-n">${esc(d.needsAttention)}</span>
             <span class="stat-k">need attention</span></div>`;
  }
  $('stats').innerHTML = html;
}

/** True when this registration is an SISC employee paying by salary deduction. */
function isEmployee(r) {
  return Boolean(EMPLOYEE) && (r.answers || {})[EMPLOYEE.label] === EMPLOYEE.value;
}

const TYPE_NAMES = { all: 'registrations', public: 'non-employees', employee: 'employees' };

function renderRows(d) {
  const tbody = $('rows');
  const groupTotal = TYPE === 'all' ? d.total : d.segments?.[TYPE] ?? d.returned;
  $('count').textContent = d.matchedReference
    ? `Exact match for ${d.matchedReference}`
    : `${d.returned} of ${groupTotal} ${TYPE_NAMES[TYPE]} shown`;

  if (!ROWS.length) {
    tbody.innerHTML = '';
    $('empty').textContent = $('q').value.trim()
      ? `No ${TYPE_NAMES[TYPE]} match that search.`
      : `No ${TYPE_NAMES[TYPE]} yet.`;
    $('empty').hidden = false;
    return;
  }
  $('empty').hidden = true;

  const cat = d.breakdown?.category?.label;
  const shirt = d.breakdown?.shirt?.label;

  tbody.innerHTML = ROWS.map((r, i) => {
    const a = r.answers || {};
    const problem = !r.sheet_synced || !r.email_sent;
    const status = problem
      ? `<span class="pill bad">${!r.email_sent ? 'no email' : ''}${!r.email_sent && !r.sheet_synced ? ' · ' : ''}${!r.sheet_synced ? 'not in sheet' : ''}</span>`
      : '<span class="pill ok">complete</span>';
    const kind = isEmployee(r)
      ? '<span class="pill emp">employee</span>'
      : '<span class="pill pub">non-employee</span>';
    return `<tr data-i="${i}" tabindex="0">
      <td class="mono">${esc(r.reference)}</td>
      <td>${esc(r.full_name || '—')}</td>
      <td>${kind}</td>
      <td>${esc(cat ? a[cat] ?? '—' : '—')}</td>
      <td>${esc(shirt ? a[shirt] ?? '—' : '—')}</td>
      <td class="dim">${esc(when(r.created_at))}</td>
      <td>${status}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    const open = () => showDetail(ROWS[Number(tr.dataset.i)]);
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  // A single exact match is what staff want on race day — open it immediately.
  if (d.matchedReference && ROWS.length === 1) showDetail(ROWS[0]);
}

function when(iso) {
  try {
    return new Date(iso).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return String(iso); }
}

function showDetail(r) {
  if (!r) return;
  const a = r.answers || {};
  $('detail-ref').textContent = r.reference;

  const rows = FIELDS.map((f) => {
    const v = a[f.label];
    if (v === undefined || v === '') return '';
    const val = /^https:\/\/\S+$/.test(v)
      ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">Open receipt</a>`
      : esc(v);
    return `<tr><th>${esc(f.label)}</th><td>${val}</td></tr>`;
  }).join('');

  const flags = [];
  if (!r.email_sent) flags.push(`Confirmation email was not sent${r.email_error ? ` — ${esc(r.email_error)}` : ''}.`);
  if (!r.sheet_synced) flags.push(`Not written to the Google Sheet${r.sheet_error ? ` — ${esc(r.sheet_error)}` : ''}.`);

  const kind = isEmployee(r)
    ? '<p class="detail-kind emp">SISC employee · paying by salary deduction' +
      (r.proof_url ? '' : ' <span class="detail-kind-note">— no receipt collected</span>') +
      '</p>'
    : '<p class="detail-kind pub">Non-employee · paying by bank transfer</p>';

  $('detail-body').innerHTML = `
    ${kind}
    ${flags.length ? `<div class="notice warn">${flags.join('<br>')}</div>` : ''}
    <table class="detail-table"><tbody>
      ${rows}
      <tr><th>Registered</th><td>${esc(when(r.created_at))}</td></tr>
    </tbody></table>`;

  const d = $('detail');
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}

function notice(msg) {
  const n = $('notice');
  if (!msg) { n.hidden = true; return; }
  n.textContent = msg;
  n.hidden = false;
}
