// Time helpers and small DOM/text utilities shared across screens.

export const HOUR_HEIGHT = 44;
export const START_HOUR = 7;
export const END_HOUR = 19;          // 7 PM, exclusive
export const TOTAL_HOURS = END_HOUR - START_HOUR;
export const TIMELINE_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;

export function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function minutesToTop(min) {
  return ((min - START_HOUR * 60) / 60) * HOUR_HEIGHT;
}

export function durationHeight(start, end) {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  return Math.max(36, ((e - s) / 60) * HOUR_HEIGHT);
}

// Convert a Y pixel coordinate inside the timeline to an absolute clock time.
// Snaps to the nearest `snap` minutes (default 15).
export function pxToMinutes(y, snap = 15) {
  const minsFromTop = (y / HOUR_HEIGHT) * 60;
  const snapped = Math.round(minsFromTop / snap) * snap;
  const abs = START_HOUR * 60 + snapped;
  // Don't allow blocks to overflow past the rail.
  const max = END_HOUR * 60 - 30;
  return Math.max(START_HOUR * 60, Math.min(abs, max));
}

export function fmtClock(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function fmtRange(start, end) {
  return `${fmtClock(timeToMinutes(start))} – ${fmtClock(timeToMinutes(end))}`;
}

// Lightweight HTML escape for any user-provided text shipped via template strings.
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Tagged template helper that escapes interpolated values automatically.
// Use array spread (e.g. `${tasks.map(t => html`...`).join('')}`) when you need raw HTML.
export function html(strings, ...values) {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (Array.isArray(v)) out += v.join('');
      else if (v == null) out += '';
      else if (typeof v === 'object' && v.__raw) out += v.value;
      else out += esc(v);
    }
  }
  return out;
}

// Mark a string as raw HTML so `html` doesn't escape it.
export function raw(value) {
  return { __raw: true, value: String(value ?? '') };
}

// Replace a node's children from an HTML string.
//
// Security model (single audit point):
//   1. All interpolated values flow through the `html` tagged template,
//      which escapes by default. Anything wrapped in `raw(...)` is
//      developer-authored markup, never user input.
//   2. The renderer code lives entirely under the CSP declared in
//      index.html (`script-src 'self'`), so even if a malformed string
//      ever slipped through, an injected `<script>` would be blocked.
//   3. The seed data is local. There is no path from the network into
//      a render call.
//
// Range#createContextualFragment is used in place of direct innerHTML
// assignment so this wrapper is the only place HTML is materialised
// from a string. If sanitisation is ever needed (e.g. importing user
// content from elsewhere), it goes here and nowhere else.
export function setHTML(node, htmlString) {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.deleteContents();
  const fragment = range.createContextualFragment(String(htmlString ?? ''));
  node.appendChild(fragment);
}
