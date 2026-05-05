// Google Calendar integration for Gentle Day.
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
const crypto = require('node:crypto');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKENS_FILE = 'google-tokens.json';
const CREDS_FILE = 'credentials.json';
const TOKEN_FILE_MODE = 0o600;
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

let userDataPath = null;
let appPath = null;
let oauthClient = null;
let tokens = null;
let account = null;

function userCredsPath()   { return path.join(userDataPath, CREDS_FILE); }
function bundledCredsPath(){ return path.join(appPath, CREDS_FILE); }
function tokensPath()      { return path.join(userDataPath, TOKENS_FILE); }

exports.init = async ({ userDataPath: udp, appPath: ap }) => {
  userDataPath = udp;
  appPath = ap;
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
  hasCredentials: existsSync(userCredsPath()) || existsSync(bundledCredsPath()),
});

function existsSync(p) {
  try { require('node:fs').accessSync(p); return true; } catch { return false; }
}

// Look for credentials in two places, in priority order:
//   1. <userData>/credentials.json — per-user override.
//   2. <appPath>/credentials.json  — bundled with the app distribution.
//
// Bundled creds make the friend experience zero-config: download the
// app folder (which already contains credentials.json), `npm install`,
// click Connect. The bundled file is gitignored so it never lands in
// version control.
async function loadCredentials() {
  const candidates = [userCredsPath(), bundledCredsPath()];
  let raw = null;
  let found = null;
  for (const p of candidates) {
    try {
      raw = await fs.readFile(p, 'utf8');
      found = p;
      break;
    } catch {}
  }
  if (!raw) {
    throw new Error(
      `Missing Google OAuth credentials. Gentle Day looked in:\n` +
      `  ${candidates.join('\n  ')}\n\n` +
      `If you're setting this up for someone else, drop a credentials.json next to main.js before sharing the app folder. ` +
      `Otherwise, see the README for the one-time Google Cloud setup.`
    );
  }
  const parsed = JSON.parse(raw);
  const cfg = parsed.installed || parsed.web;
  if (!cfg) throw new Error(`credentials.json at ${found} must contain an "installed" or "web" client.`);
  if (!cfg.client_id || !cfg.client_secret) {
    throw new Error(`credentials.json at ${found} is missing client_id / client_secret.`);
  }
  return cfg;
}

function buildClient(cfg, redirectUri) {
  return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, redirectUri);
}

// Spin up a one-shot HTTP server on a random port, return the URL & a promise
// that resolves with the auth code when the user completes the redirect.
function startCallbackServer(expectedState, timeoutMs = OAUTH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('error', reject);

    let codePromiseResolve;
    let codePromiseReject;
    const codePromise = new Promise((rs, rj) => { codePromiseResolve = rs; codePromiseReject = rj; });
    const timeout = setTimeout(() => {
      codePromiseReject(new Error('Google OAuth timed out. Try Connect again.'));
      try { server.close(); } catch {}
    }, timeoutMs);

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
        const state = url.searchParams.get('state');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (error) {
          res.statusCode = 400;
          res.end(htmlPage('Connection cancelled', `Google reported: <code>${escapeHtml(error)}</code>. You can close this tab and try again in Gentle Day.`));
          codePromiseReject(new Error(`Google OAuth error: ${error}`));
        } else if (state !== expectedState) {
          res.statusCode = 400;
          res.end(htmlPage('Connection rejected', 'The sign-in response did not match this connection attempt. Return to Gentle Day and try again.'));
          codePromiseReject(new Error('Google OAuth state mismatch. Try Connect again.'));
        } else if (!code) {
          res.statusCode = 400;
          res.end(htmlPage('No authorization code', 'The redirect did not contain a code. Try Connect again.'));
          codePromiseReject(new Error('Google OAuth callback returned no code.'));
        } else {
          res.end(htmlPage('Connected. You can close this tab.', 'Gentle Day is finishing up — return to the app.'));
          codePromiseResolve(code);
        }
      } catch (err) {
        codePromiseReject(err);
      } finally {
        // Allow the response to flush before we tear down.
        clearTimeout(timeout);
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

function buildAuthUrlOptions(state) {
  return {
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  };
}

exports.connect = async ({ openExternal }) => {
  const cfg = await loadCredentials();
  const state = crypto.randomBytes(24).toString('base64url');
  const { redirectUri, codePromise, close } = await startCallbackServer(state);
  oauthClient = buildClient(cfg, redirectUri);

  const authUrl = oauthClient.generateAuthUrl(buildAuthUrlOptions(state));

  let code;
  try {
    await openExternal(authUrl);
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
  await fs.writeFile(tokensPath(), JSON.stringify(tokens, null, 2), { encoding: 'utf8', mode: TOKEN_FILE_MODE });
  try { await fs.chmod(tokensPath(), TOKEN_FILE_MODE); } catch {}

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
        events.push(normalizeGoogleEvent(c.id, e));
      }
    } catch (err) {
      // Skip calendars we can't read — keep going.
    }
  }

  return { calendars, events, syncedAt: Date.now(), account };
};

function normalizeGoogleEvent(calendarId, e) {
  const allDay = !!(e.start?.date && !e.start?.dateTime);
  return {
    id: `${calendarId}:${e.id}`,
    googleEventId: e.id,
    calendarId,
    title: e.summary || '(no title)',
    allDay,
    start: allDay ? null : extractClock(e.start),
    end: allDay ? null : extractClock(e.end),
    location: e.location || '',
    description: e.description || '',
  };
}

function extractClock(point) {
  // Timed event clock extraction. All-day events are rendered separately.
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

exports._private = {
  buildAuthUrlOptions,
  normalizeGoogleEvent,
  tokenFileMode: TOKEN_FILE_MODE,
};
