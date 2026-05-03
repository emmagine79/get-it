// HTML5 drag-and-drop for tasks moving between the list and the schedule.
//
// Source: any element that has `data-task-id` and `draggable="true"`.
// Drop zone: any element wired with `wireDropZone(el, { onDrop })`.
//
// We use a custom MIME type so dropping random files into the timeline
// doesn't accidentally trigger an `onDrop`.

const MIME = 'application/x-get-it-task-id';

export function wireDragSource(el) {
  el.addEventListener('dragstart', (event) => {
    const id = el.dataset.taskId;
    if (!id) return;
    event.dataTransfer.setData(MIME, id);
    event.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
  });
}

export function wireDropZone(el, { onDrop, accept = () => true } = {}) {
  el.addEventListener('dragover', (event) => {
    if (!hasOurPayload(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    el.classList.add('drop-target');
  });
  el.addEventListener('dragleave', (event) => {
    // Only clear when leaving the element entirely.
    if (event.relatedTarget && el.contains(event.relatedTarget)) return;
    el.classList.remove('drop-target');
  });
  el.addEventListener('drop', (event) => {
    if (!hasOurPayload(event)) return;
    event.preventDefault();
    el.classList.remove('drop-target');
    const taskId = event.dataTransfer.getData(MIME);
    if (!taskId || !accept(taskId)) return;
    const rect = el.getBoundingClientRect();
    const y = event.clientY - rect.top + el.scrollTop;
    const x = event.clientX - rect.left + el.scrollLeft;
    onDrop?.({ taskId, x, y, event });
  });
}

function hasOurPayload(event) {
  return Array.from(event.dataTransfer?.types || []).includes(MIME);
}
