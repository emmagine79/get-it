// Google Calendar integration for Get It.
//
// Flow (Desktop OAuth, loopback redirect):
//   1. We expect the user to drop a Google OAuth client JSON at
//      `<userData>/credentials.json` (see README for the four-minute setup).
//   2. On `connect()`, we spin up a local HTTP server on a random port,
//      build the auth URL with `http://127.0.0.1:<port>/callback` as the
//      redirect, and open the user's default browser.
//   3. Google redirects back with the code; we exchange it for tokens
//      and persist them at `<userData>/google-tokens.json`.
//   4. `sync()` hits the Calendar API for the visible calendar list and
//      today's events, normalises them, and hands them back to the
//      renderer.
//
// All OAuth state lives in the main process. The renderer never sees
// tokens — only the connected/account status and synced data.

const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKENS_FILE = 'google-tokens.json';
const CREDS_FILE = 'credentials.json';

let userDataPath = null;
let oauthClient = null;
let tokens = null;
let account = null;

function credsPath()  { return path.join(userDataPath, CREDS_FILE); }
function tokensPath() { return path.join(userDataPath, TOKENS_FILE); }

exports.init = async ({ userDataPath: udp }) => {
  userDataPath = udp;
  // Best-effort token rehydration so an existing connection survives restart.
  try {
    const raw = await fs.readFile(tokensPath(), 'utf8');
    tokens = JSON.parse(raw);
    account = tokens.account || null;
  } catch {
    tokens = null;
    account = null;
  }
};

exports.getStatus = () => ({
  connected: !!tokens,
  account,
  hasCredentials: existsSync(credsPath()),
});

function existsSync(p) {
  try { require('node:fs').accessSync(p); return true; } catch { return false; }
}

async function loadCredentials() {
  let raw;
  try {
    raw = await fs.readFile(credsPath(), 'utf8');
  } catch (err) {
    const helpfulPath = credsPath();
    throw new Error(
      `Missing Google OAuth credentials at:\n  ${helpfulPath}\n\n` +
      `Create a Google Cloud project, enable the Calendar API, make a Desktop OAuth client, ` +
      `download the JSON, and save it as "credentials.json" at the path above. See the README for the four-minute walkthrough.`
    );
  }
  const parsed = JSON.parse(raw);
  const cfg = parsed.installed || parsed.web;
  if (!cfg) throw new Error('credentials.json must contain an "installed" or "web" client.');
  if (!cfg.client_id || !cfg.client_secret) {
    throw new Error('credentials.json is missing client_id / client_secret.');
  }
  return cfg;
}

function buildClient(cfg, redirectUri) {
  return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, redirectUri);
}

// Spin up a one-shot HTTP server on a random port, return the URL & a promise
// that resolves with the auth code when the user completes the redirect.
function startCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('error', reject);

    let codePromiseResolve;
    let codePromiseReject;
    const codePromise = new Promise((rs, rj) => { codePromiseResolve = rs; codePromiseReject = rj; });

    server.on('request', (req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
        if (url.pathname !== '/callback') {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (error) {
          res.statusCode = 400;
          res.end(htmlPage('Connection cancelled', `Google reported: <code>${escapeHtml(error)}</code>. You can close this tab and try again in Get It.`));
          codePromiseReject(new Error(`Google OAuth error: ${error}`));
        } else if (!code) {
          res.statusCode = 400;
          res.end(htmlPage('No authorization code', 'The redirect did not contain a code. Try Connect again.'));
          codePromiseReject(new Error('Google OAuth callback returned no code.'));
        } else {
          res.end(htmlPage('Connected. You can close this tab.', 'Get It is finishing up — return to the app.'));
          codePromiseResolve(code);
        }
      } catch (err) {
        codePromiseReject(err);
      } finally {
        // Allow the response to flush before we tear down.
        setTimeout(() => { try { server.close(); } catch {} }, 200);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        redirectUri: `http://127.0.0.1:${port}/callback`,
        codePromise,
        close: () => { try { server.close(); } catch {} },
      });
    });
  });
}

function htmlPage(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>body{font-family:-apple-system,Segoe UI,system-ui,sans-serif;background:#f8f3eb;color:#221;display:grid;place-items:center;min-height:100vh;margin:0}
  .card{max-width:420px;padding:28px 32px;background:white;border-radius:18px;box-shadow:0 16px 40px rgba(0,0,0,0.08);text-align:center}
  h1{font-family:Georgia,serif;font-size:22px;margin:0 0 10px} p{color:#555;line-height:1.5;margin:0}
  code{background:#f3ece1;padding:1px 6px;border-radius:6px}</style></head>
  <body><div class="card"><h1>${escapeHtml(title)}</h1><p>${body}</p></div></body></html>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

exports.connect = async ({ openExternal }) => {
  const cfg = await loadCredentials();
  const { redirectUri, codePromise, close } = await startCallbackServer();
  oauthClient = buildClient(cfg, redirectUri);

  const authUrl = oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  await openExternal(authUrl);

  let code;
  try {
    code = await codePromise;
  } finally {
    close();
  }

  const { tokens: gotTokens } = await oauthClient.getToken(code);
  oauthClient.setCredentials(gotTokens);

  // Pull a profile email so the UI can show "connected as ..."
  let email = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauthClient });
    const info = await oauth2.userinfo.get();
    email = info.data.email || null;
  } catch {
    // Userinfo may not be granted in all setups; that's OK.
  }

  tokens = { ...gotTokens, account: email };
  account = email;
  await fs.writeFile(tokensPath(), JSON.stringify(tokens, null, 2), 'utf8');

  // Immediately do a first sync so the UI lights up.
  const synced = await exports.sync();
  return { account, ...synced };
};

async function ensureClient() {
  if (oauthClient) return oauthClient;
  const cfg = await loadCredentials();
  oauthClient = buildClient(cfg, 'http://127.0.0.1/'); // Redirect not used for refresh.
  if (tokens) oauthClient.setCredentials(tokens);
  return oauthClient;
}

exports.sync = async () => {
  if (!tokens) throw new Error('Not connected. Click Connect Google first.');
  const auth = await ensureClient();
  const cal = google.calendar({ version: 'v3', auth });

  const listResp = await cal.calendarList.list({ minAccessRole: 'reader' });
  const calendars = (listResp.data.items || []).map((c) => ({
    id: c.id,
    name: c.summary || c.id,
    subtitle: c.description || (c.primary ? 'Primary calendar' : ''),
  }));

  // Today (local time): start of day → end of day.
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd   = new Date(); dayEnd.setHours(23, 59, 59, 999);

  const events = [];
  for (const c of calendars) {
    try {
      const r = await cal.events.list({
        calendarId: c.id,
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
      });
      for (const e of r.data.items || []) {
        if (!e.start || (!e.start.dateTime && !e.start.date)) continue;
        if (e.status === 'cancelled') continue;
        events.push({
          id: e.id,
          calendarId: c.id,
          title: e.summary || '(no title)',
          start: extractClock(e.start),
          end:   extractClock(e.end),
          location: e.location || '',
          description: e.description || '',
        });
      }
    } catch (err) {
      // Skip calendars we can't read — keep going.
    }
  }

  return { calendars, events, syncedAt: Date.now(), account };
};

function extractClock(point) {
  // Handles both timed events (dateTime) and all-day events (date).
  if (point.dateTime) {
    const d = new Date(point.dateTime);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  // All-day event — pin to the start of the visible rail.
  return point.date ? '07:00' : '09:00';
}

exports.disconnect = async () => {
  tokens = null;
  account = null;
  oauthClient = null;
  try { await fs.unlink(tokensPath()); } catch {}
};
