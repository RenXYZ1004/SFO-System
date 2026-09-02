// An uploaded proof of payment arrives as a URL — show it as a link.
const cell = (v) => {
  const s = String(v ?? '');
  return /^https:\/\/\S+$/.test(s)
    ? `<a href="${esc(s)}" style="color:#ef4a2b">View uploaded file</a>`
    : esc(s);
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function confirmationHtml({ answers, appName, ref, when }) {
  const rows = answers
    .filter(([, v]) => v !== '' && v != null)
    .map(
      ([label, value]) => `<tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e8eaed;color:#5f6368;font-size:13px;white-space:nowrap">${esc(label)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e8eaed;color:#202124;font-size:14px;font-weight:500">${cell(value)}</td>
      </tr>`)
    .join('');

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f3f4;font-family:Arial,Helvetica,sans-serif">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0"
         style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(60,64,67,.2)">
   <tr><td style="background:#673ab7;padding:26px 28px;color:#fff">
     <div style="font-size:20px;font-weight:600">Registration confirmed</div>
     <div style="font-size:13px;opacity:.85;margin-top:4px">${esc(appName)}</div>
   </td></tr>
   <tr><td style="padding:26px 28px 8px;color:#202124;font-size:15px;line-height:1.6">
     Thank you for registering. We have received your details and recorded them.
     Here is a copy for your records:
   </td></tr>
   <tr><td style="padding:8px 28px 4px">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
            style="border:1px solid #e8eaed;border-radius:8px;border-collapse:separate">
       ${rows}
       <tr>
         <td style="padding:10px 14px;color:#5f6368;font-size:13px">Reference</td>
         <td style="padding:10px 14px;color:#202124;font-size:14px;font-weight:600">${esc(ref)}</td>
       </tr>
     </table>
   </td></tr>
   <tr><td style="padding:18px 28px 28px;color:#5f6368;font-size:12px;line-height:1.6">
     Submitted ${esc(when)}. If you did not make this registration you can ignore this email.
     <br>This is an automated message — please do not reply.
   </td></tr>
  </table>
 </td></tr></table>
</body></html>`;
}

export function confirmationText({ answers, appName, ref, when }) {
  const lines = answers
    .filter(([, v]) => v !== '' && v != null)
    .map(([l, v]) => `  ${l}: ${v}`)
    .join('\n');
  return `REGISTRATION CONFIRMED — ${appName}

Thank you for registering. Your details:

${lines}
  Reference: ${ref}

Submitted ${when}
This is an automated message.
`;
}
