import {
  getState, setState, updateTask, removeTaskSchedule, scheduleTask,
  addTask, setReviewDecision, rolloverTask, setCalendarColor, setCalendarVisible,
} from './state.js';
import { PALETTE } from './data.js';
import {
  HOUR_HEIGHT, START_HOUR, END_HOUR, TIMELINE_HEIGHT,
  timeToMinutes, minutesToTop, durationHeight, pxToMinutes,
  fmtClock, fmtRange, minutesToTime, html, raw, esc, setHTML,
} from './util.js';
import { wireDragSource, wireDropZone } from './dragdrop.js';

// ============================================================
//   Shared helpers
// ============================================================

function calendarColor(state, calendarId) {
  const cal = state.calendars.find((c) => c.id === calendarId);
  return cal ? cal.color : 'sage';
}

function visibleEvents(state) {
  return state.events.filter((e) => {
    const cal = state.calendars.find((c) => c.id === e.calendarId);
    return cal?.visible;
  });
}

const scheduledTasks = (state) => state.tasks.filter((t) => t.start && t.end);
const untimedTasks  = (state) => state.tasks.filter((t) => !t.start);

function blockTaskHTML(task) {
  const top = minutesToTop(timeToMinutes(task.start));
  const h = durationHeight(task.start, task.end);
  return html`
    <article class="block planned" data-task-id="${task.id}" draggable="true"
             style="top:${raw(top + 'px')}; height:${raw(h + 'px')};">
      <h3>${task.title}</h3>
      <p>${task.note ?? ''}</p>
      <span class="block-time">${fmtRange(task.start, task.end)}</span>
    </article>
  `;
}

function blockEventHTML(state, evt) {
  const color = calendarColor(state, evt.calendarId);
  const cal = state.calendars.find((c) => c.id === evt.calendarId);
  const top = minutesToTop(timeToMinutes(evt.start));
  const h = durationHeight(evt.start, evt.end);
  const label = cal ? cal.name.split(' / ')[0] : '';
  return html`
    <article class="block read-only cal-${raw(esc(color))}"
             style="top:${raw(top + 'px')}; height:${raw(h + 'px')};">
      <h3>${evt.title}</h3>
      <p>${label} · ${fmtRange(evt.start, evt.end)}</p>
    </article>
  `;
}

function taskCardHTML(task, opts = {}) {
  const draggable = opts.draggable !== false && !task.done;
  return html`
    <article class="task ${task.done ? 'done' : ''} ${draggable ? 'draggable' : ''} ${task.start ? 'scheduled' : ''}"
             data-task-id="${task.id}"
             ${raw(draggable ? 'draggable="true"' : '')}>
      <span class="check" data-action="toggle-done" data-task-id="${task.id}" role="checkbox" aria-checked="${task.done ? 'true' : 'false'}"></span>
      <div class="body">
        <h3>${task.title}</h3>
        ${task.note ? html`<p>${task.note}</p>` : ''}
        ${task.start ? html`<p style="color: oklch(40% 0.06 35);"><strong>${fmtRange(task.start, task.end)}</strong></p>` : ''}
      </div>
      <span class="tag">${task.tag ?? 'task'}</span>
    </article>
  `;
}

function softNoteHTML(title, body) {
  return html`<article class="soft-note"><h3>${title}</h3><p>${body}</p></article>`;
}

function timeRailHTML() {
  let out = '';
  for (let h = START_HOUR; h < END_HOUR; h++) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = ((h + 11) % 12) + 1;
    out += `<span>${h12} ${ampm}</span>`;
  }
  return out;
}

function attachTaskCommonHandlers(root) {
  root.querySelectorAll('[data-action="toggle-done"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.taskId;
      const task = getState().tasks.find((t) => t.id === id);
      if (!task) return;
      updateTask(id, { done: !task.done });
    });
  });
}

// ============================================================
//   Schedule view
// ============================================================

export function renderSchedule(root, state) {
  const events = visibleEvents(state);
  const blocks = scheduledTasks(state);
  const untimed = untimedTasks(state).filter((t) => !t.done);
  const dones = state.tasks.filter((t) => t.done && !t.start).slice(0, 3);

  const markup = html`
    <div class="schedule-grid">
      <div class="panel day-panel" aria-hidden="true">
        <div class="time-rail">${raw(timeRailHTML())}</div>
      </div>

      <div class="panel day-panel">
        <div class="timeline" id="dropZone" style="min-height:${raw(TIMELINE_HEIGHT + 'px')};" aria-label="Schedule timeline">
          <div class="time-now" style="top:${raw(minutesToTop(state.nowMinutes) + 'px')};">${fmtClock(state.nowMinutes).replace(' AM', '').replace(' PM', '')}</div>
          ${raw(events.map((e) => blockEventHTML(state, e)).join(''))}
          ${raw(blocks.map(blockTaskHTML).join(''))}
          ${untimed.length > 0
            ? html`<div class="drag-hint"><b>Drop here to time-block</b>Drag a list task onto an open slot. Calendar events stay read-only.</div>`
            : ''}
        </div>
      </div>

      <aside class="panel task-panel" id="untimedDropZone">
        <div class="panel-title"><h3>Untimed</h3><span class="count">${untimed.length} task${untimed.length === 1 ? '' : 's'}</span></div>
        ${untimed.length === 0
          ? html`<div class="empty-state">Nothing untimed. Add a task or pull a block back here.</div>`
          : raw(untimed.map((t) => taskCardHTML(t)).join(''))}
        ${dones.length > 0 ? raw(dones.map((t) => taskCardHTML(t, { draggable: false })).join('')) : ''}
        ${raw(softNoteHTML('Gentle rule', 'The schedule is a sketch, not a contract. Calendar blocks are anchors; planned blocks can move.'))}
      </aside>
    </div>
  `;
  setHTML(root, markup);

  // Drag list tasks onto the timeline.
  root.querySelectorAll('.task.draggable').forEach((el) => wireDragSource(el));
  // Scheduled blocks are also drag sources (move on timeline / pull back to list).
  root.querySelectorAll('.block.planned').forEach((el) => wireDragSource(el));

  const timeline = root.querySelector('#dropZone');
  if (timeline) {
    wireDropZone(timeline, {
      onDrop: ({ taskId, y }) => {
        const minutes = pxToMinutes(y);
        const task = getState().tasks.find((t) => t.id === taskId);
        if (!task) return;
        const duration = task.start && task.end
          ? timeToMinutes(task.end) - timeToMinutes(task.start)
          : 30;
        const start = minutesToTime(minutes);
        const end = minutesToTime(Math.min(minutes + duration, END_HOUR * 60));
        scheduleTask(taskId, start, end);
      },
    });
  }

  const untimedZone = root.querySelector('#untimedDropZone');
  if (untimedZone) {
    wireDropZone(untimedZone, {
      onDrop: ({ taskId }) => removeTaskSchedule(taskId),
    });
  }

  attachTaskCommonHandlers(root);
}

// ============================================================
//   List view
// ============================================================

export function renderList(root, state) {
  const visibleEvts = visibleEvents(state);
  const open = state.tasks.filter((t) => !t.done);
  const done = state.tasks.filter((t) => t.done);

  const markup = html`
    <div class="list-shell">
      <div class="panel list-main">
        <div class="list-header">
          <div>
            <h3>Today's list</h3>
            <p>No times required. Use this mode when the day needs flexibility more than structure.</p>
          </div>
          <button class="button primary" data-screen-target="add">New task</button>
        </div>
        <div class="task-list">
          ${open.length === 0
            ? html`<div class="empty-state">All caught up. Want to add something gently?</div>`
            : raw(open.map((t) => taskCardHTML(t, { draggable: false })).join(''))}
          ${done.length > 0 ? raw(done.map((t) => taskCardHTML(t, { draggable: false })).join('')) : ''}
        </div>
      </div>

      <aside class="panel task-panel">
        <div class="panel-title"><h3>Calendar today</h3><span class="count">read-only</span></div>
        ${visibleEvts.length === 0
          ? html`<div class="empty-state">No calendar events visible.</div>`
          : raw(visibleEvts.map((e) => {
              const color = calendarColor(state, e.calendarId);
              return html`<div class="small-event"><span class="swatch" style="background: var(--${raw(esc(color))});"></span><span>${fmtClock(timeToMinutes(e.start)).replace(' AM','').replace(' PM','')} ${e.title}</span></div>`;
            }).join(''))}
        ${raw(softNoteHTML('List mode stays loose', 'Meetings are visible for context, but tasks remain untimed until you drag them into schedule view.'))}
      </aside>
    </div>
  `;
  setHTML(root, markup);
  attachTaskCommonHandlers(root);
}

// ============================================================
//   Bridge / split view
// ============================================================

export function renderBridge(root, state) {
  const events = visibleEvents(state);
  const blocks = scheduledTasks(state);
  const open = state.tasks.filter((t) => !t.done && !t.start).slice(0, 4);

  const markup = html`
    <div class="split-preview">
      <div class="panel mini-schedule">
        <div class="mini-title"><h3>Schedule</h3><span class="tag">time-blocked</span></div>
        <div class="mini-track" style="height:${raw(TIMELINE_HEIGHT + 'px')};">
          ${raw(events.map((e) => {
            const color = calendarColor(state, e.calendarId);
            const top = minutesToTop(timeToMinutes(e.start));
            return `<div class="mini-block cal-${esc(color)}" style="top:${top}px;">${esc(fmtClock(timeToMinutes(e.start)).replace(' AM','').replace(' PM',''))} ${esc(e.title)}</div>`;
          }).join(''))}
          ${raw(blocks.map((b) => {
            const top = minutesToTop(timeToMinutes(b.start));
            return `<div class="mini-block planned" style="top:${top}px;">${esc(fmtClock(timeToMinutes(b.start)).replace(' AM','').replace(' PM',''))} ${esc(b.title)}</div>`;
          }).join(''))}
        </div>
      </div>

      <div class="panel mini-list">
        <div class="mini-title"><h3>List</h3><span class="tag">flexible</span></div>
        ${open.length === 0
          ? html`<div class="empty-state">Untimed list is clear.</div>`
          : raw(open.map((t) => taskCardHTML(t, { draggable: false })).join(''))}
        ${raw(softNoteHTML('Move both ways', 'Time-block a task when it helps. Pull it back to the list when the day changes.'))}
      </div>
    </div>
  `;
  setHTML(root, markup);
  attachTaskCommonHandlers(root);
}

// ============================================================
//   Quick add
// ============================================================

const ADD_FORM_DEFAULT = {
  title: '',
  note: '',
  mode: 'task',          // 'task' | 'block' | 'maybe'
  bucket: 'list',        // 'list' | 'morning' | 'after-meetings' | 'no-pressure'
  startHour: 9,
};

let addFormDraft = { ...ADD_FORM_DEFAULT };

export function resetAddForm() { addFormDraft = { ...ADD_FORM_DEFAULT }; }

function previewSubtitle(d) {
  if (d.mode === 'block') return `Preview: scheduled ${fmtClock(d.startHour * 60)}`;
  if (d.mode === 'maybe') return 'Preview: marked maybe — no pressure';
  return 'Preview: today’s list';
}

export function renderAdd(root, state) {
  const d = addFormDraft;
  const markup = html`
    <div class="add-layout">
      <div class="panel add-stage">
        <form class="modal" id="addForm" autocomplete="off">
          <h3>Add to today</h3>
          <div class="field">
            <label for="taskName">What is it?</label>
            <input class="input" id="taskName" name="title" value="${d.title}" placeholder="e.g. Order replacement charger">
          </div>
          <div class="field">
            <label>Keep it loose or plan a time?</label>
            <div class="segmented" data-group="mode">
              <button type="button" data-value="task"  class="${d.mode==='task'?'active':''}">Task</button>
              <button type="button" data-value="block" class="${d.mode==='block'?'active':''}">Time block</button>
              <button type="button" data-value="maybe" class="${d.mode==='maybe'?'active':''}">Maybe</button>
            </div>
          </div>
          <div class="field" id="blockTimeField" style="${raw(d.mode === 'block' ? '' : 'display:none;')}">
            <label for="startHour">Start hour</label>
            <input class="input" type="number" min="${START_HOUR}" max="${END_HOUR-1}" step="1" id="startHour" name="startHour" value="${d.startHour}">
          </div>
          <div class="field">
            <label for="note">Tiny note</label>
            <textarea class="input" id="note" name="note" placeholder="Optional context...">${d.note}</textarea>
          </div>
          <div class="choice-row" data-group="bucket">
            <button type="button" data-value="list"            class="choice ${d.bucket==='list'?'selected':''}">Today's list</button>
            <button type="button" data-value="morning"         class="choice ${d.bucket==='morning'?'selected':''}">Morning</button>
            <button type="button" data-value="after-meetings"  class="choice ${d.bucket==='after-meetings'?'selected':''}">After meetings</button>
            <button type="button" data-value="no-pressure"     class="choice ${d.bucket==='no-pressure'?'selected':''}">No pressure</button>
          </div>
          <div class="choice-row" style="justify-content: flex-end; margin-top: 18px;">
            <button type="button" class="button" data-action="cancel-add">Cancel</button>
            <button type="submit" class="button primary">Add gently</button>
          </div>
        </form>
      </div>
      <aside class="panel task-panel">
        <div class="panel-title"><h3>Inline preview</h3><span class="count">live</span></div>
        ${raw(softNoteHTML('Natural language, optional', 'Pick "Time block" to land it on the schedule, "Maybe" to keep it weightless.'))}
        <article class="task">
          <span class="check"></span>
          <div class="body" data-role="preview-body"><h3 data-role="preview-title">${d.title || 'New task title'}</h3><p data-role="preview-sub">${previewSubtitle(d)}</p></div>
          <span class="tag">new</span>
        </article>
      </aside>
    </div>
  `;
  setHTML(root, markup);

  const form = root.querySelector('#addForm');
  form.querySelector('#taskName').addEventListener('input', (e) => {
    addFormDraft.title = e.target.value;
    const t = root.querySelector('[data-role="preview-title"]');
    if (t) t.textContent = addFormDraft.title || 'New task title';
  });
  form.querySelector('#note').addEventListener('input', (e) => {
    addFormDraft.note = e.target.value;
  });
  const startInput = form.querySelector('#startHour');
  if (startInput) {
    startInput.addEventListener('input', (e) => {
      const v = Math.max(START_HOUR, Math.min(END_HOUR - 1, Number(e.target.value) || START_HOUR));
      addFormDraft.startHour = v;
      const sub = root.querySelector('[data-role="preview-sub"]');
      if (sub) sub.textContent = previewSubtitle(addFormDraft);
    });
  }
  form.querySelectorAll('[data-group="mode"] button').forEach((btn) => {
    btn.addEventListener('click', () => {
      addFormDraft.mode = btn.dataset.value;
      renderAdd(root, getState());
    });
  });
  form.querySelectorAll('[data-group="bucket"] button').forEach((btn) => {
    btn.addEventListener('click', () => {
      addFormDraft.bucket = btn.dataset.value;
      btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('selected', b === btn));
    });
  });
  form.querySelector('[data-action="cancel-add"]').addEventListener('click', () => {
    resetAddForm();
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'list' }));
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = (addFormDraft.title || '').trim();
    if (!title) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: 'Give it a name first.' }));
      return;
    }
    const tag =
      addFormDraft.bucket === 'morning' ? 'morning' :
      addFormDraft.bucket === 'after-meetings' ? 'afternoon' :
      addFormDraft.bucket === 'no-pressure' ? 'maybe' : 'task';

    const base = { title, note: addFormDraft.note || '', tag };
    if (addFormDraft.mode === 'block') {
      const h = addFormDraft.startHour;
      base.start = `${String(h).padStart(2,'0')}:00`;
      base.end   = `${String(h).padStart(2,'0')}:30`;
    }
    const goingToSchedule = addFormDraft.mode === 'block';
    addTask(base);
    resetAddForm();
    window.dispatchEvent(new CustomEvent('app:toast', { detail: 'Added gently.' }));
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: goingToSchedule ? 'schedule' : 'list' }));
  });
}

// ============================================================
//   End-of-day review
// ============================================================

export function renderReview(root, state) {
  const candidates = state.tasks.filter((t) => !t.done || state.reviewDecisions[t.id]);

  const counts = candidates.reduce(
    (acc, t) => {
      const d = state.reviewDecisions[t.id]?.decision;
      if (d === 'done' || (t.done && !d)) acc.done++;
      else if (d === 'roll') acc.rolled++;
      else if (d === 'partial') acc.partial++;
      else acc.open++;
      return acc;
    },
    { done: 0, rolled: 0, partial: 0, open: 0 },
  );

  const markup = html`
    <div class="review-layout">
      <aside class="panel review-summary">
        <h3>Close the day softly</h3>
        <p>You planned a real day and lived a real day. Choose what should carry forward; everything else can rest.</p>
        <div class="soft-meter">
          <div class="meter-card"><b>${counts.done}</b><span>finished</span></div>
          <div class="meter-card"><b>${counts.rolled}</b><span>rolled</span></div>
          <div class="meter-card"><b>${counts.partial}</b><span>partial</span></div>
        </div>
        ${counts.open > 0
          ? html`<p style="margin-top:14px; font-size:12px;"><strong>${counts.open}</strong> still need a gentle decision.</p>`
          : html`<p style="margin-top:14px; font-size:12px; color: var(--sage); font-weight:700;">Every task has a soft landing. Sleep well.</p>`}
      </aside>
      <div class="review-list">
        ${candidates.length === 0
          ? html`<div class="empty-state panel" style="padding:30px;">Nothing to review. Add a few tasks and come back.</div>`
          : raw(candidates.map((t) => reviewCardHTML(t, state)).join(''))}
      </div>
    </div>
  `;
  setHTML(root, markup);
  attachReviewHandlers(root);
}

function reviewCardHTML(task, state) {
  const dec = state.reviewDecisions[task.id] || {};
  const sel = (k) => (dec.decision === k ? 'selected' : '');
  return html`
    <article class="review-card" data-task-id="${task.id}">
      <h3>${task.title}</h3>
      <p>${task.start ? raw(esc('Time-blocked ' + fmtRange(task.start, task.end))) : 'Untimed task'} ${task.done && !dec.decision ? html`<span class="tag" style="margin-left:8px;">checked off today</span>` : ''}</p>
      <div class="choice-row" data-group="decision">
        <button type="button" class="choice ${sel('done')}" data-value="done">Done enough</button>
        <button type="button" class="choice ${sel('roll')}" data-value="roll">Roll to tomorrow</button>
        <button type="button" class="choice ${sel('partial')}" data-value="partial">Partial</button>
      </div>
      ${dec.decision === 'partial' ? raw(partialBoxHTML(task, dec)) : ''}
    </article>
  `;
}

function partialBoxHTML(task, dec) {
  const pct = typeof dec.percent === 'number' ? dec.percent : 65;
  const mode = dec.partialMode || 'roll';
  return html`
    <div class="partial-box" data-task-id="${task.id}">
      <strong>About how far did it get?</strong>
      <div class="slider-row">
        <span>0%</span>
        <input type="range" min="0" max="100" value="${pct}" data-action="partial-percent" aria-label="Partial completion">
        <span data-role="percent-label">${pct}%</span>
      </div>
      <div class="choice-row" data-group="partial-mode">
        <button type="button" class="choice ${mode==='roll'?'selected':''}" data-value="roll">Roll the remainder</button>
        <button type="button" class="choice ${mode==='done'?'selected':''}" data-value="done">Call it done</button>
      </div>
    </div>
  `;
}

function attachReviewHandlers(root) {
  root.querySelectorAll('.review-card').forEach((card) => {
    const id = card.dataset.taskId;

    card.querySelectorAll('[data-group="decision"] button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.value;
        if (value === 'done') {
          setReviewDecision(id, { decision: 'done' });
          updateTask(id, { done: true });
        } else if (value === 'roll') {
          setReviewDecision(id, { decision: 'roll' });
          rolloverTask(id);
        } else {
          setReviewDecision(id, { decision: 'partial', percent: 65, partialMode: 'roll' });
        }
      });
    });

    card.querySelectorAll('[data-action="partial-percent"]').forEach((slider) => {
      slider.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        const label = card.querySelector('[data-role="percent-label"]');
        if (label) label.textContent = `${v}%`;
        const dec = getState().reviewDecisions[id] || { decision: 'partial' };
        setReviewDecision(id, { ...dec, decision: 'partial', percent: v });
      });
    });

    card.querySelectorAll('[data-group="partial-mode"] button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.value;
        const dec = getState().reviewDecisions[id] || { decision: 'partial', percent: 65 };
        setReviewDecision(id, { ...dec, decision: 'partial', partialMode: value });
        if (value === 'done') updateTask(id, { done: true });
        else updateTask(id, { done: false, start: undefined, end: undefined });
      });
    });
  });
}

// ============================================================
//   Settings
// ============================================================

export function renderSettings(root, state) {
  const selectedId = root.dataset.selectedCalendar || state.calendars[0].id;
  const selected = state.calendars.find((c) => c.id === selectedId) || state.calendars[0];
  const shortName = selected.name.split(' / ')[0];

  const markup = html`
    <div class="settings-grid">
      <div class="panel settings-main">
        <div class="list-header">
          <div>
            <h3>Calendar layers</h3>
            <p>Connected calendars are read-only in planning. Colors are chosen by you so layers feel predictable.</p>
          </div>
          <button class="button" data-action="connect-another">Connect another</button>
        </div>
        ${raw(state.calendars.map((c) => calendarRowHTML(c, c.id === selected.id)).join(''))}
      </div>
      <aside class="panel task-panel">
        <div class="panel-title"><h3>Choose color</h3><span class="count">manual</span></div>
        <p style="margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45;">
          Editing <strong>${shortName}</strong>. Colors are never auto-assigned. Pick once, change anytime.
        </p>
        <div class="palette-row">
          ${raw(PALETTE.map((p) => `<span class="color-dot ${p === selected.color ? 'selected' : ''}" data-action="pick-color" data-color="${esc(p)}" style="background: var(--${esc(p)});" title="${esc(p)}"></span>`).join(''))}
        </div>
        ${raw(softNoteHTML('Layer preview', `Events from ${shortName} appear as soft ${selected.color} blocks with a "Calendar" label and no edit handles.`))}
      </aside>
    </div>
  `;
  setHTML(root, markup);
  attachSettingsHandlers(root);
}

function calendarRowHTML(cal, isSelected) {
  return html`
    <div class="calendar-row" data-cal-id="${cal.id}" style="${raw(isSelected ? 'box-shadow: inset 4px 0 0 var(--sage);' : '')}">
      <div data-action="select-calendar" style="cursor:pointer;">
        <h3>${cal.name}</h3>
        <p>${cal.subtitle}</p>
      </div>
      <div class="color-picker">
        <span class="color-dot" style="background: var(--${raw(esc(cal.color))});"></span>
        <span class="tag">${cal.color}</span>
        <label class="toggle" title="Visible in schedule">
          <input type="checkbox" data-action="toggle-visible" ${raw(cal.visible ? 'checked' : '')}>
          <span>${cal.visible ? 'on' : 'hidden'}</span>
        </label>
      </div>
    </div>
  `;
}

function attachSettingsHandlers(root) {
  root.querySelectorAll('.calendar-row').forEach((row) => {
    const id = row.dataset.calId;
    row.querySelector('[data-action="select-calendar"]').addEventListener('click', () => {
      root.dataset.selectedCalendar = id;
      renderSettings(root, getState());
    });
    row.querySelector('[data-action="toggle-visible"]').addEventListener('change', (e) => {
      setCalendarVisible(id, e.target.checked);
    });
  });

  root.querySelectorAll('[data-action="pick-color"]').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      const id = root.dataset.selectedCalendar || getState().calendars[0].id;
      setCalendarColor(id, swatch.dataset.color);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: 'Color updated.' }));
    });
  });

  const connectBtn = root.querySelector('[data-action="connect-another"]');
  if (connectBtn) connectBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'connect' }));
  });
}

// ============================================================
//   First-run / Connect
// ============================================================

export function renderConnect(root, state) {
  const markup = html`
    <div class="connect-state">
      <section class="panel connect-hero">
        <div>
          <div class="today-kicker"><span class="pulse"></span><span>First run</span></div>
          <h3>Bring your real day in first.</h3>
          <p>Get It uses Google Calendar as a read-only layer, so meetings and appointments become gentle boundaries around the day you plan.</p>
        </div>
        <div class="choice-row">
          <button class="button primary" data-action="connect-google">Connect Google Calendar</button>
          <button class="button" data-action="skip-google">Set up without calendar</button>
        </div>
      </section>
      <aside class="panel preview-stack">
        <div class="permission-card">
          <h3 style="font-size: 26px;">What Get It can do</h3>
          <div class="permission-list">
            <div class="permission"><span class="check"></span><span>Show events as read-only blocks</span></div>
            <div class="permission"><span class="check"></span><span>Connect multiple calendars</span></div>
            <div class="permission"><span class="check"></span><span>Let you choose every calendar color</span></div>
          </div>
        </div>
        <div class="floating-day">
          <h4>Preview after connection</h4>
          ${raw(state.events.map((e) => {
            const c = calendarColor(state, e.calendarId);
            return `<div class="small-event"><span class="swatch" style="background: var(--${esc(c)});"></span><span>${esc(fmtClock(timeToMinutes(e.start)).replace(' AM','').replace(' PM',''))} ${esc(e.title)}</span></div>`;
          }).join(''))}
        </div>
      </aside>
    </div>
  `;
  setHTML(root, markup);

  root.querySelector('[data-action="connect-google"]').addEventListener('click', () => {
    setState({ hasCompletedFirstRun: true });
    window.dispatchEvent(new CustomEvent('app:toast', { detail: 'Calendar connected (mock). Welcome in.' }));
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'schedule' }));
  });
  root.querySelector('[data-action="skip-google"]').addEventListener('click', () => {
    setState({ hasCompletedFirstRun: true });
    window.dispatchEvent(new CustomEvent('app:toast', { detail: 'Skipped. You can connect later in Calendars.' }));
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'schedule' }));
  });
}

// ============================================================
//   Sidebar mini-summary
// ============================================================

export function renderSidebarSummary(state) {
  const node = document.getElementById('calMini');
  if (!node) return;
  const counts = state.calendars.map((c) => ({
    ...c,
    count: state.events.filter((e) => e.calendarId === c.id).length,
  }));
  const markup = html`
    <b>Calendar layers</b>
    ${raw(counts.map((c) => `
      <div class="layer-row">
        <span><span class="swatch" style="background: var(--${esc(c.color)});"></span> ${esc(c.name.split(' / ')[0])}</span>
        <span>${c.count} event${c.count === 1 ? '' : 's'}</span>
      </div>
    `).join(''))}
  `;
  setHTML(node, markup);
}
