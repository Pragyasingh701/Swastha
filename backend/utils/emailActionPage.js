// Small HTML pages shown after someone follows a link in an email (accept /
// decline a doctor's request, authorize a family member).
//
// Following a link is a GET, and mail clients, link scanners and prefetchers
// open links on their own, so a GET must never carry out the action: the link
// shows a page with a button, and only the button's POST does the work.
// Everything interpolated into the page is escaped.

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page({ title, heading, bodyHtml, isError = false }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .card { background: white; border-radius: 16px; padding: 32px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); max-width: 560px; text-align: center; }
      h2 { margin-top: 0; color: ${isError ? '#dc2626' : '#2563eb'}; }
      p { line-height: 1.6; color: #475569; }
      button { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 12px 24px; font-size: 15px; font-weight: bold; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>${escapeHtml(heading)}</h2>
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

export function renderMessagePage(res, { title, heading, message, isError = false }) {
  res.set('Cache-Control', 'no-store');
  return res.send(page({ title, heading, isError, bodyHtml: `<p>${escapeHtml(message)}</p>` }));
}

// A page whose only action is a POST to `action` carrying the token.
export function renderConfirmPage(res, { title, heading, message, buttonLabel, action, token }) {
  res.set('Cache-Control', 'no-store');
  const bodyHtml = `<p>${escapeHtml(message)}</p>
      <form method="POST" action="${escapeHtml(action)}">
        <input type="hidden" name="token" value="${escapeHtml(token)}" />
        <button type="submit">${escapeHtml(buttonLabel)}</button>
      </form>`;
  return res.send(page({ title, heading, bodyHtml }));
}
