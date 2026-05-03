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

export function fmtClockShort(min) {
  // No AM/PM — used in narrow chips and the "now" line.
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')}`;
}

// Today, formatted like "Wednesday, May 6".
export function fmtTodayLabel(date = new Date()) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

// "now" line position in minutes from midnight, clamped to the visible rail.
export function nowMinutesClamped(date = new Date()) {
  const min = date.getHours() * 60 + date.getMinutes();
  return Math.max(START_HOUR * 60, Math.min(min, END_HOUR * 60 - 1));
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

// `raw(value)` marks a string as already-safe HTML so the `html` tagged
// template won't escape it on interpolation. Idempotent: passing an existing
// raw object returns it unchanged, which is what makes nested `html` work.
export function raw(value) {
  if (isRaw(value)) return value;
  return { __raw: true, value: String(value ?? '') };
}

function isRaw(v) {
  return v != null && typeof v === 'object' && v.__raw === true;
}

// Tagged template helper.
//
// Strings interpolated with `${...}` are HTML-escaped by default.
// Values produced by another `html\`\`` (or wrapped in `raw(...)`) are
// passed through as-is. Arrays are interpolated element-wise with the
// same rules — no `.join('')` needed.
//
// Returns a `{__raw, value}` marker so nested `html\`\`` calls compose
// cleanly. `setHTML` and consumers that need a string can call `.value`
// or pass the object straight through (setHTML unwraps).
export function html(strings, ...values) {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v == null || v === false) {
        // Allows `${cond && html\`...\`}` to drop cleanly.
      } else if (Array.isArray(v)) {
        for (const item of v) {
          if (item == null || item === false) continue;
          if (isRaw(item)) out += item.value;
          else out += esc(item);
        }
      } else if (isRaw(v)) {
        out += v.value;
      } else {
        out += esc(v);
      }
    }
  }
  return raw(out);
}

// Replace a node's children from an HTML value.
//
// Security model (single audit point):
//   1. Every interpolated value passes through the `html` tagged template,
//      which escapes by default. Things wrapped in `raw(...)` are author-
//      written markup, never user input.
//   2. The renderer runs under the CSP declared in index.html
//      (`script-src 'self'`), so an injected `<script>` would not execute
//      even if it slipped through.
//   3. There is no path from the network into a render call beyond the
//      Google Calendar sync layer, which itself goes through `html` /
//      `esc` for every user-controlled field.
//
// Range#createContextualFragment is used instead of a direct innerHTML
// assignment so this wrapper is the only spot HTML is materialised from
// a string. If sanitisation is ever needed, it goes here and nowhere else.
export function setHTML(node, value) {
  const str = isRaw(value) ? value.value : String(value ?? '');
  const range = document.createRange();
  range.selectNodeContents(node);
  range.deleteContents();
  const fragment = range.createContextualFragment(str);
  node.appendChild(fragment);
}
