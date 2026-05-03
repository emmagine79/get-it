import {
  getState, setState, updateTask, removeTaskSchedule, scheduleTask,
  addTask, deleteTask, setReviewDecision, rolloverTask,
  setCalendarColor, setCalendarVisible, replaceCalendarsAndEvents,
} from './state.js';
import { PALETTE } from './data.js';
import {
  HOUR_HEIGHT, START_HOUR, END_HOUR, TIMELINE_HEIGHT,
  timeToMinutes, minutesToTop, durationHeight, pxToMinutes,
  fmtClock, fmtClockShort, fmtRange, minutesToTime,
  html, raw, esc, setHTML, tagColor, normalizeTags, randomColor,
} from './util.js';
import { wireDragSource, wireDropZone } from './dragdrop.js';
import { openModal, closeModal } from './modal.js';

// ============================================================
//   Shared helpers
// ============================================================

const calendarColor = (state, calendarId) =>
  state.calendars.find((c) => c.id === calendarId)?.color || 'sage';

const calendarName = (state, calendarId) =>
  state.calendars.find((c) => c.id === calendarId)?.name || 'Calendar';

const visibleEvents = (state) =>
  state.events.filter((e) => state.calendars.find((c) => c.id === e.calendarId)?.visible);

const timedEvents = (state) => visibleEvents(state).filter((e) => !e.allDay);
const allDayEvents = (state) => visibleEvents(state).filter((e) => e.allDay);
const scheduledTasks = (state) => state.tasks.filter((t) => t.start && t.end);
const untimedTasks = (state) => state.tasks.filter((t) => !t.start);

const MODE_BADGES = {
  block: 'time block',
  maybe: 'maybe',
  morning: 'morning',
  afternoon: 'afternoon',
};

function blockTaskHTML(task) {
  const top = minutesToTop(timeToMinutes(task.start));
  const h = durationHeight(task.start, task.end);
  return html`
    <article class="block planned" data-task-id="${task.id}" data-clickable="task" draggable="true"
             style="top:${raw(top + 'px')}; height:${raw(h + 'px')};">
      <h3>${task.title}</h3>
      ${task.note ? html`<p>${task.note}</p>` : ''}
      <span class="block-time">${fmtRange(task.start, task.end)}</span>
    </article>
  `;
}

function blockEventHTML(state, evt) {
  const color = calendarColor(state, evt.calendarId);
  const top = minutesToTop(timeToMinutes(evt.start));
  const h = durationHeight(evt.start, evt.end);
  const calShort = calendarName(state, evt.calendarId).split(' / ')[0];
  return html`
    <article class="block read-only cal-${color}" data-event-id="${evt.id}" data-clickable="event"
             style="top:${raw(top + 'px')}; height:${raw(h + 'px')};">
      <h3>${evt.title}</h3>
      <p>${calShort} · ${fmtRange(evt.start, evt.end)}</p>
    </article>
  `;
}

function smallEventHTML(state, evt) {
  const color = calendarColor(state, evt.calendarId);
  const label = evt.allDay ? 'All day' : fmtClockShort(timeToMinutes(evt.start));
  return html`
    <div class="small-event" data-event-id="${evt.id}" data-clickable="event">
      <span class="swatch" style="background: var(--${raw(esc(color))});"></span>
      <span>${label} ${evt.title}</span>
    </div>
  `;
}

function tagsForTask(task) {
  const list = Array.isArray(task.tags) && task.tags.length
    ? task.tags
    : task.tag ? [task.tag] : [];
  return list;
}

function tagsHTML(task) {
  const list = tagsForTask(task);
  if (list.length === 0) return html`<span class="tag">task</span>`;
  return html`
    <div class="tags">
      ${list.map((t) => {
        const c = tagColor(t);
        return html`<span class="tag" style="background:${raw(c.bg)};color:${raw(c.fg)};">${t}</span>`;
      })}
    </div>
  `;
}

function taskCardHTML(task, opts = {}) {
  const draggable = opts.draggable !== false && !task.done;
  const badge = task.mode && MODE_BADGES[task.mode] ? MODE_BADGES[task.mode] : null;
  return html`
    <article class="task ${task.done ? 'done' : ''} ${draggable ? 'draggable' : ''} ${task.start ? 'scheduled' : ''} ${task.mode === 'maybe' ? 'maybe' : ''}"
             data-task-id="${task.id}"
             data-clickable="task"
             ${raw(draggable ? 'draggable="true"' : '')}>
      <span class="check" data-action="toggle-done" data-task-id="${task.id}" role="checkbox" aria-checked="${task.done ? 'true' : 'false'}"></span>
      <div class="body">
        <h3>${task.title}</h3>
        ${task.note ? html`<p>${task.note}</p>` : ''}
        ${task.start ? html`<p class="task-time">${fmtRange(task.start, task.end)}</p>` : ''}
        ${badge ? html`<span class="task-badge">${badge}</span>` : ''}
      </div>
      ${tagsHTML(task)}
    </article>
  `;
}

const softNoteHTML = (title, body) =>
  html`<article class="soft-note"><h3>${title}</h3><p>${body}</p></article>`;

function timeRailHTML() {
  const rows = [];
  for (let h = START_HOUR; h < END_HOUR; h++) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = ((h + 11) % 12) + 1;
    rows.push(html`<span>${h12} ${ampm}</span>`);
  }
  return rows;
}

// Scroll the rail+timeline so the current time sits about a third
// from the top, leaving plenty of upcoming time visible below.
function scrollTimelineToNow(scrollEl, nowMinutes) {
  if (!scrollEl) return;
  const target = minutesToTop(nowMinutes) - scrollEl.clientHeight / 3;
  scrollEl.scrollTop = Math.max(0, target);
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

  // Click handlers for task cards and blocks → edit modal.
  root.querySelectorAll('[data-clickable="task"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="toggle-done"]')) return;
      // Don't trigger after a drag.
      if (el.classList.contains('dragging')) return;
      const id = el.dataset.taskId;
      const task = getState().tasks.find((t) => t.id === id);
      if (task) showTaskEditor(task);
    });
  });

  // Calendar event clicks → read-only modal.
  root.querySelectorAll('[data-clickable="event"]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.eventId;
      const evt = getState().events.find((e) => e.id === id);
      if (evt) showEventDetails(evt);
    });
  });
}

// ============================================================
//   Empty-state cards (shown when no Google Calendar is connected)
// ============================================================

function notConnectedCard() {
  return html`
    <article class="soft-note empty-cal-note">
      <h3>No calendar connected</h3>
      <p>Connect Google Calendar in <strong>Calendars</strong> to see meetings as read-only blocks here.</p>
    </article>
  `;
}

// ============================================================
//   Schedule view
// ============================================================

export function renderSchedule(root, state) {
  const events = timedEvents(state);
  const allDay = allDayEvents(state);
  const blocks = scheduledTasks(state);
  const untimed = untimedTasks(state).filter((t) => !t.done && t.mode !== 'maybe');
  const maybes = state.tasks.filter((t) => !t.done && t.mode === 'maybe');
  const dones = state.tasks.filter((t) => t.done && !t.start).slice(0, 3);
  const hasAnyConnected = state.calendars.length > 0;

  const markup = html`
    <div class="schedule-grid">
      <div class="panel timeline-pane">
        <div class="timeline-scroll">
          <div class="time-rail">${timeRailHTML()}</div>
          <div class="timeline" id="dropZone" aria-label="Schedule timeline">
            <div class="time-now" style="top:${raw(minutesToTop(state.nowMinutes) + 'px')};">${fmtClockShort(state.nowMinutes)}</div>
            ${events.map((e) => blockEventHTML(state, e))}
            ${blocks.map(blockTaskHTML)}
          </div>
        </div>
      </div>

      <aside class="panel task-panel" id="untimedDropZone">
        <div class="panel-title"><h3>Untimed</h3><span class="count">${untimed.length} task${untimed.length === 1 ? '' : 's'}</span></div>
        ${untimed.length === 0 && maybes.length === 0
          ? html`<div class="empty-state">Nothing untimed. Add a task or pull a block back here.</div>`
          : untimed.map((t) => taskCardHTML(t))}
        ${maybes.length > 0 ? html`
          <div class="panel-title" style="margin-top:8px;"><h3 style="font-size:16px;">Maybe</h3><span class="count">no pressure</span></div>
          ${maybes.map((t) => taskCardHTML(t))}
        ` : ''}
        ${dones.length > 0 ? dones.map((t) => taskCardHTML(t, { draggable: false })) : ''}
        ${allDay.length > 0 ? html`
          <div class="panel-title" style="margin-top:8px;"><h3 style="font-size:16px;">All day</h3><span class="count">calendar</span></div>
          ${allDay.map((e) => smallEventHTML(state, e))}
        ` : ''}
        ${!hasAnyConnected ? notConnectedCard() : softNoteHTML('Gentle rule', 'The schedule is a sketch, not a contract. Calendar blocks are anchors; planned blocks can move.')}
      </aside>
    </div>
  `;
  setHTML(root, markup);

  // Center the current time in the visible scroll window (only the first
  // render after a navigation — re-renders inside the same screen leave
  // the user's scroll position alone).
  const scroll = root.querySelector('.timeline-scroll');
  if (scroll && root.dataset.didScroll !== '1') {
    scrollTimelineToNow(scroll, state.nowMinutes);
    root.dataset.didScroll = '1';
  }

  root.querySelectorAll('.task.draggable').forEach((el) => wireDragSource(el));
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
            : open.map((t) => taskCardHTML(t, { draggable: false }))}
          ${done.length > 0 ? done.map((t) => taskCardHTML(t, { draggable: false })) : ''}
        </div>
      </div>

      <aside class="panel task-panel">
        <div class="panel-title"><h3>Calendar today</h3><span class="count">read-only</span></div>
        ${state.calendars.length === 0
          ? notConnectedCard()
          : visibleEvts.length === 0
            ? html`<div class="empty-state">No calendar events today.</div>`
            : visibleEvts.map((e) => smallEventHTML(state, e))}
        ${softNoteHTML('List mode stays loose', 'Meetings are visible for context, but tasks remain untimed until you drag them into schedule view.')}
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
  const events = timedEvents(state);
  const allDay = allDayEvents(state);
  const blocks = scheduledTasks(state);
  const open = state.tasks.filter((t) => !t.done && !t.start);

  const markup = html`
    <div class="split-preview">
      <div class="panel mini-schedule">
        <div class="mini-title"><h3>Schedule</h3><span class="tag">time-blocked</span></div>
        <div class="mini-scroll" data-role="bridge-scroll">
          <div class="mini-track" id="bridgeDropZone">
            ${events.map((e) => {
              const color = calendarColor(state, e.calendarId);
              const top = minutesToTop(timeToMinutes(e.start));
              return html`<div class="mini-block cal-${color}" data-event-id="${e.id}" data-clickable="event" style="top:${raw(top + 'px')};">${fmtClockShort(timeToMinutes(e.start))} ${e.title}</div>`;
            })}
            ${blocks.map((b) => {
              const top = minutesToTop(timeToMinutes(b.start));
              return html`<div class="mini-block planned" data-task-id="${b.id}" data-clickable="task" draggable="true" style="top:${raw(top + 'px')};">${fmtClockShort(timeToMinutes(b.start))} ${b.title}</div>`;
            })}
            ${events.length + blocks.length === 0
              ? html`<div class="empty-state" style="margin:16px;">Drop a list task here to time-block it.</div>`
              : ''}
          </div>
        </div>
      </div>

      <div class="panel mini-list" id="bridgeListZone">
        <div class="mini-title"><h3>List</h3><span class="tag">flexible</span></div>
        ${open.length === 0
          ? html`<div class="empty-state">Untimed list is clear.</div>`
          : open.map((t) => taskCardHTML(t))}
        ${allDay.length > 0 ? html`
          <div class="panel-title" style="margin-top:8px;"><h3 style="font-size:16px;">All day</h3><span class="count">calendar</span></div>
          ${allDay.map((e) => smallEventHTML(state, e))}
        ` : ''}
        ${softNoteHTML('Move both ways', 'Time-block a task by dragging onto the schedule; pull it back to the list when the day changes.')}
      </div>
    </div>
  `;
  setHTML(root, markup);

  const bridgeScroll = root.querySelector('[data-role="bridge-scroll"]');
  if (bridgeScroll && root.dataset.didScroll !== '1') {
    scrollTimelineToNow(bridgeScroll, state.nowMinutes);
    root.dataset.didScroll = '1';
  }

  root.querySelectorAll('.task.draggable, .mini-block.planned').forEach((el) => wireDragSource(el));

  const dropTime = root.querySelector('#bridgeDropZone');
  if (dropTime) {
    wireDropZone(dropTime, {
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
  const dropList = root.querySelector('#bridgeListZone');
  if (dropList) {
    wireDropZone(dropList, {
      onDrop: ({ taskId }) => removeTaskSchedule(taskId),
    });
  }

  attachTaskCommonHandlers(root);
}

// ============================================================
//   Quick add
// ============================================================

const ADD_FORM_DEFAULT = {
  title: '',
  note: '',
  tags: '',                      // raw comma-separated input
  mode: 'task',                  // 'task' | 'block' | 'maybe'
  bucket: 'list',                // 'list' | 'morning' | 'afternoon' | 'no-pressure'
  startHour: 9,
  startMinute: 0,
  durationMinutes: 30,
};

let addFormDraft = { ...ADD_FORM_DEFAULT };

export function resetAddForm() { addFormDraft = { ...ADD_FORM_DEFAULT }; }

function previewSubtitle(d) {
  if (d.mode === 'block') return `Preview: scheduled ${fmtClock(d.startHour * 60 + d.startMinute)} for ${d.durationMinutes} min`;
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
          ${d.mode === 'block' ? html`
            <div class="field">
              <label>Time</label>
              <div class="time-row">
                <input class="input small" type="number" min="${START_HOUR}" max="${END_HOUR-1}" step="1" id="startHour" value="${d.startHour}">
                <span>:</span>
                <input class="input small" type="number" min="0" max="59" step="15" id="startMinute" value="${d.startMinute}">
                <span class="muted">for</span>
                <input class="input small" type="number" min="15" max="240" step="15" id="durationMinutes" value="${d.durationMinutes}">
                <span class="muted">min</span>
              </div>
            </div>
          ` : ''}
          <div class="field">
            <label for="note">Tiny note</label>
            <textarea class="input" id="note" name="note" placeholder="Optional context...">${d.note}</textarea>
          </div>
          <div class="field">
            <label for="tagsInput">Tags <span class="muted" style="font-weight:400;">— comma-separated, each gets its own color</span></label>
            <input class="input" id="tagsInput" name="tags" value="${d.tags}" placeholder="errand, focus, home">
          </div>
          <div class="field">
            <label>Bucket</label>
            <div class="choice-row" data-group="bucket">
              <button type="button" data-value="list"        class="choice ${d.bucket==='list'?'selected':''}">Today's list</button>
              <button type="button" data-value="morning"     class="choice ${d.bucket==='morning'?'selected':''}">Morning</button>
              <button type="button" data-value="afternoon"   class="choice ${d.bucket==='afternoon'?'selected':''}">After meetings</button>
              <button type="button" data-value="no-pressure" class="choice ${d.bucket==='no-pressure'?'selected':''}">No pressure</button>
            </div>
          </div>
          <div class="choice-row" style="justify-content: flex-end; margin-top: 18px;">
            <button type="button" class="button" data-action="cancel-add">Cancel</button>
            <button type="submit" class="button primary">Add gently</button>
          </div>
        </form>
      </div>
      <aside class="panel task-panel">
        <div class="panel-title"><h3>Inline preview</h3><span class="count">live</span></div>
        ${softNoteHTML('What sticks', 'Mode and bucket persist on the task — Maybe lives in its own muted area, blocks land on the schedule, buckets show as pill labels.')}
        <article class="task">
          <span class="check"></span>
          <div class="body" data-role="preview-body">
            <h3 data-role="preview-title">${d.title || 'New task title'}</h3>
            <p data-role="preview-sub">${previewSubtitle(d)}</p>
            ${d.mode === 'maybe' ? html`<span class="task-badge">maybe</span>` : ''}
            ${d.mode === 'block' ? html`<span class="task-badge">time block</span>` : ''}
          </div>
          ${tagsHTML({
            tags: normalizeTags([
              ...normalizeTags(d.tags),
              ...(d.bucket && d.bucket !== 'list' ? [d.bucket] : []),
            ]),
          })}
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
  form.querySelector('#tagsInput').addEventListener('input', (e) => {
    addFormDraft.tags = e.target.value;
  });
  ['startHour','startMinute','durationMinutes'].forEach((id) => {
    const el = form.querySelector('#' + id);
    if (!el) return;
    el.addEventListener('input', (e) => {
      const v = Number(e.target.value) || 0;
      addFormDraft[id] = id === 'startHour'
        ? Math.max(START_HOUR, Math.min(END_HOUR - 1, v))
        : id === 'startMinute'
          ? Math.max(0, Math.min(59, v))
          : Math.max(15, Math.min(240, v));
      const sub = root.querySelector('[data-role="preview-sub"]');
      if (sub) sub.textContent = previewSubtitle(addFormDraft);
    });
  });
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
    // Tags from the free-form input, plus the bucket auto-tag if it's
    // not the default. Normalised + deduped (case-insensitive).
    const userTags = normalizeTags(addFormDraft.tags);
    const bucketTag = addFormDraft.bucket && addFormDraft.bucket !== 'list'
      ? [addFormDraft.bucket]
      : [];
    const tags = normalizeTags([...userTags, ...bucketTag]);

    const base = {
      title,
      note: addFormDraft.note || '',
      tags,
      mode: addFormDraft.mode,
      bucket: addFormDraft.bucket,
    };
    if (addFormDraft.mode === 'block') {
      const startMin = addFormDraft.startHour * 60 + addFormDraft.startMinute;
      const endMin = Math.min(startMin + addFormDraft.durationMinutes, END_HOUR * 60);
      base.start = minutesToTime(startMin);
      base.end   = minutesToTime(endMin);
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
          ? html`<p class="review-hint">${counts.open} still need a gentle decision.</p>`
          : html`<p class="review-hint review-done">Every task has a soft landing. Sleep well.</p>`}
      </aside>
      <div class="review-list">
        ${candidates.length === 0
          ? html`<div class="empty-state panel" style="padding:30px;">Nothing to review. Add a few tasks and come back.</div>`
          : candidates.map((t) => reviewCardHTML(t, state))}
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
      <p>${task.start ? `Time-blocked ${fmtRange(task.start, task.end)}` : 'Untimed task'}${task.done && !dec.decision ? ' · already checked off' : ''}</p>
      <div class="choice-row" data-group="decision">
        <button type="button" class="choice ${sel('done')}" data-value="done">Done enough</button>
        <button type="button" class="choice ${sel('roll')}" data-value="roll">Roll to tomorrow</button>
        <button type="button" class="choice ${sel('partial')}" data-value="partial">Partial</button>
      </div>
      ${dec.decision === 'partial' ? partialBoxHTML(task, dec) : ''}
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
  const fallbackId = state.calendars[0]?.id;
  const selectedId = root.dataset.selectedCalendar || fallbackId;
  const selected = state.calendars.find((c) => c.id === selectedId) || null;
  const shortName = selected ? selected.name.split(' / ')[0] : '';
  const isSyncing = !!state.googleSyncing;

  const markup = html`
    <div class="settings-grid">
      <div class="panel settings-main">
        <div class="list-header">
          <div>
            <h3>Calendar layers</h3>
            <p>Connected calendars are read-only in planning. Colors are chosen by you so layers feel predictable.</p>
          </div>
          <div class="actions" style="gap:8px;">
            ${state.googleConnected ? html`<button class="button" data-action="refresh-google" ${raw(isSyncing ? 'disabled' : '')}>${isSyncing ? 'Syncing…' : 'Refresh'}</button>` : ''}
            <button class="button primary" data-action="connect-google">${state.googleConnected ? 'Reconnect' : 'Connect Google'}</button>
          </div>
        </div>
        ${state.calendars.length === 0
          ? html`<div class="empty-state" style="margin-top:16px;">No calendars yet. Connect Google Calendar to bring your meetings in as read-only blocks.</div>`
          : state.calendars.map((c) => calendarRowHTML(c, c.id === selectedId))}
        ${state.googleError ? html`<div class="empty-state" style="margin-top:16px; color: var(--rose); border-color: var(--rose);">${state.googleError}</div>` : ''}
      </div>
      <aside class="panel task-panel">
        <div class="panel-title"><h3>Choose color</h3><span class="count">manual</span></div>
        ${selected ? html`
          <p style="margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45;">
            Editing <strong>${shortName}</strong>. Pick a color, or hit the rainbow swatch to roll one at random.
          </p>
          <div class="palette-row">
            ${PALETTE.map((p) => html`<span class="color-dot ${p === selected.color ? 'selected' : ''}" data-action="pick-color" data-color="${p}" style="background: var(--${raw(esc(p))});" title="${p}"></span>`)}
            <span class="color-dot random" data-action="pick-random" title="random"></span>
          </div>
          ${softNoteHTML('Layer preview', `Events from ${shortName} appear as soft ${selected.color} blocks with a "Calendar" label and no edit handles.`)}
        ` : html`
          <p style="margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45;">No calendar selected. Connect Google to begin.</p>
        `}
      </aside>
    </div>
  `;
  setHTML(root, markup);
  attachSettingsHandlers(root);
}

function calendarRowHTML(cal, isSelected) {
  return html`
    <div class="calendar-row ${isSelected ? 'selected' : ''}" data-cal-id="${cal.id}">
      <div data-action="select-calendar" style="cursor:pointer;">
        <h3>${cal.name}</h3>
        <p>${cal.subtitle || cal.id}</p>
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
      const id = root.dataset.selectedCalendar || getState().calendars[0]?.id;
      if (!id) return;
      setCalendarColor(id, swatch.dataset.color);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: 'Color updated.' }));
    });
  });

  root.querySelector('[data-action="pick-random"]')?.addEventListener('click', () => {
    const state = getState();
    const id = root.dataset.selectedCalendar || state.calendars[0]?.id;
    if (!id) return;
    const used = state.calendars.filter((c) => c.id !== id).map((c) => c.color);
    const next = randomColor(PALETTE, used);
    setCalendarColor(id, next);
    window.dispatchEvent(new CustomEvent('app:toast', { detail: `Rolled ${next}.` }));
  });

  root.querySelector('[data-action="connect-google"]')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('app:google-connect'));
  });
  root.querySelector('[data-action="refresh-google"]')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('app:google-refresh'));
  });
}

// ============================================================
//   First-run / Connect
// ============================================================

export function renderConnect(root, state) {
  const isSyncing = !!state.googleSyncing;
  const markup = html`
    <div class="connect-state">
      <section class="panel connect-hero">
        <div>
          <div class="today-kicker"><span class="pulse"></span><span>First run</span></div>
          <h3>Bring your real day in first.</h3>
          <p>Get It uses Google Calendar as a read-only layer, so meetings and appointments become gentle boundaries around the day you plan.</p>
        </div>
        <div class="choice-row">
          <button class="button primary" data-action="connect-google" ${raw(isSyncing ? 'disabled' : '')}>${isSyncing ? 'Connecting…' : 'Connect Google Calendar'}</button>
          <button class="button" data-action="skip-google">Set up without calendar</button>
        </div>
        ${state.googleError ? html`<div class="empty-state" style="margin-top:14px; color: var(--rose); border-color: var(--rose);">${state.googleError}</div>` : ''}
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
          <h4>One-time setup</h4>
          <p style="margin:0; color: var(--muted); font-size: 13px; line-height:1.45;">
            You'll need a Google Cloud OAuth client. The README walks through the four-minute setup; once <code>credentials.json</code> is in place, this button just works.
          </p>
        </div>
      </aside>
    </div>
  `;
  setHTML(root, markup);

  root.querySelector('[data-action="connect-google"]').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('app:google-connect'));
  });
  root.querySelector('[data-action="skip-google"]').addEventListener('click', () => {
    setState({ hasCompletedFirstRun: true });
    window.dispatchEvent(new CustomEvent('app:toast', { detail: 'Skipped. Connect anytime in Calendars.' }));
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'list' }));
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
    ${counts.length === 0
      ? html`<p style="margin:6px 0 0; color: var(--muted); font-size: 12px; line-height:1.45;">No calendars connected yet.</p>`
      : counts.map((c) => html`
        <div class="layer-row">
          <span><span class="swatch" style="background: var(--${raw(esc(c.color))});"></span> ${c.name.split(' / ')[0]}</span>
          <span>${c.count} event${c.count === 1 ? '' : 's'}</span>
        </div>
      `)}
  `;
  setHTML(node, markup);
}

// ============================================================
//   Modals — task editor + event details
// ============================================================

function showTaskEditor(task) {
  const draft = {
    title: task.title,
    note: task.note || '',
    tags: tagsForTask(task).join(', '),
    mode: task.mode || 'task',
    start: task.start || '',
    end: task.end || '',
  };

  const buildBody = () => html`
    <form class="modal-body" autocomplete="off">
      <div class="field">
        <label>Title</label>
        <input class="input" name="title" value="${draft.title}">
      </div>
      <div class="field">
        <label>Note</label>
        <textarea class="input" name="note">${draft.note}</textarea>
      </div>
      <div class="field">
        <label>Mode</label>
        <div class="segmented" data-group="mode">
          <button type="button" data-value="task"  class="${draft.mode==='task'?'active':''}">Task</button>
          <button type="button" data-value="block" class="${draft.mode==='block'?'active':''}">Time block</button>
          <button type="button" data-value="maybe" class="${draft.mode==='maybe'?'active':''}">Maybe</button>
        </div>
      </div>
      ${draft.mode === 'block' ? html`
        <div class="field">
          <label>Time</label>
          <div class="time-row">
            <input class="input small" type="time" name="start" value="${draft.start || '09:00'}">
            <span class="muted">to</span>
            <input class="input small" type="time" name="end" value="${draft.end || '09:30'}">
          </div>
        </div>
      ` : ''}
      <div class="field">
        <label>Tags <span class="muted" style="font-weight:400;">— comma-separated</span></label>
        <input class="input" name="tags" value="${draft.tags}" placeholder="errand, focus">
      </div>
      <div class="modal-footer">
        <button type="button" class="button danger" data-action="delete">Delete</button>
        <span style="flex:1;"></span>
        <button type="button" class="button" data-action="cancel">Cancel</button>
        <button type="submit" class="button primary">Save</button>
      </div>
    </form>
  `;

  openModal({
    title: 'Edit task',
    bodyHTML: buildBody(),
    onMount: (modalEl, { close, replace }) => {
      const form = modalEl.querySelector('form');

      form.querySelectorAll('[data-group="mode"] button').forEach((btn) => {
        btn.addEventListener('click', () => {
          // Capture other field edits before re-render.
          draft.title = form.querySelector('[name="title"]').value;
          draft.note  = form.querySelector('[name="note"]').value;
          draft.tags  = form.querySelector('[name="tags"]').value;
          draft.start = form.querySelector('[name="start"]')?.value || draft.start;
          draft.end   = form.querySelector('[name="end"]')?.value   || draft.end;
          draft.mode  = btn.dataset.value;
          if (draft.mode === 'block' && !draft.start) { draft.start = '09:00'; draft.end = '09:30'; }
          replace(buildBody());
        });
      });

      form.querySelector('[data-action="cancel"]').addEventListener('click', close);
      form.querySelector('[data-action="delete"]').addEventListener('click', () => {
        deleteTask(task.id);
        close();
        window.dispatchEvent(new CustomEvent('app:toast', { detail: 'Task removed.' }));
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = form.querySelector('[name="title"]').value.trim();
        if (!title) return;
        const patch = {
          title,
          note: form.querySelector('[name="note"]').value,
          tags: normalizeTags(form.querySelector('[name="tags"]').value),
          tag: undefined,
          mode: draft.mode,
        };
        if (draft.mode === 'block') {
          patch.start = form.querySelector('[name="start"]').value;
          patch.end   = form.querySelector('[name="end"]').value;
        } else {
          patch.start = undefined;
          patch.end   = undefined;
        }
        updateTask(task.id, patch);
        close();
      });
    },
  });
}

function showEventDetails(evt) {
  const state = getState();
  const cal = state.calendars.find((c) => c.id === evt.calendarId);
  const calName = cal ? cal.name : 'Calendar';

  const body = html`
    <div class="modal-body">
      <p class="modal-lead">From <strong>${calName.split(' / ')[0]}</strong></p>
      <div class="event-detail">
        <h2>${evt.title}</h2>
        <p class="muted">${evt.allDay ? 'All day' : fmtRange(evt.start, evt.end)}</p>
        ${evt.location ? html`<p>${evt.location}</p>` : ''}
        ${evt.description ? html`<p style="white-space:pre-line;">${evt.description}</p>` : ''}
        <p class="muted" style="margin-top:14px; font-size:12px;">Calendar events are read-only inside Get It. Edit them in Google Calendar.</p>
      </div>
      <div class="modal-footer">
        <span style="flex:1;"></span>
        <button type="button" class="button" data-action="close">Close</button>
      </div>
    </div>
  `;

  openModal({
    title: 'Calendar event',
    bodyHTML: body,
    onMount: (modalEl, { close }) => {
      modalEl.querySelector('[data-action="close"]').addEventListener('click', close);
    },
  });
}
