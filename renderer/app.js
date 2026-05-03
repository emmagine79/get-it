import { getState, setState, subscribe, resetState } from './state.js';
import {
  renderSchedule, renderList, renderBridge, renderAdd, renderReview,
  renderSettings, renderConnect, renderSidebarSummary, resetAddForm,
} from './screens.js';

const SCREENS = {
  schedule: { title: 'Today in schedule', render: renderSchedule },
  list:     { title: 'Today as a list',   render: renderList     },
  bridge:   { title: 'Both views, side by side', render: renderBridge },
  add:      { title: 'Quick add',         render: renderAdd      },
  review:   { title: 'End-of-day review', render: renderReview   },
  settings: { title: 'Calendar settings', render: renderSettings },
  connect:  { title: 'First-run connection', render: renderConnect },
};

const screenTitleNode = document.getElementById('screenTitle');
const dateLabelNode = document.getElementById('dateLabel');

function currentScreen() {
  const s = getState();
  // If first run hasn't been completed, force the connect screen.
  if (!s.hasCompletedFirstRun && s.currentScreen !== 'connect') return 'connect';
  return s.currentScreen || 'schedule';
}

function renderCurrentScreen() {
  const id = currentScreen();
  const def = SCREENS[id];
  if (!def) return;

  // Toggle visibility — only the active screen is shown.
  for (const key of Object.keys(SCREENS)) {
    const el = document.getElementById(key);
    if (!el) continue;
    el.classList.toggle('active', key === id);
  }
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.screen === id);
  });

  screenTitleNode.textContent = def.title;
  const target = document.getElementById(id);
  def.render(target, getState());

  renderSidebarSummary(getState());
}

function navigate(id) {
  if (!SCREENS[id]) return;
  if (id === 'add') resetAddForm();
  setState({ currentScreen: id });
}

// ------------------------------ Initial render & re-render on state change ------------------------------

function init() {
  // Header date label
  dateLabelNode.textContent = getState().date;

  // Sidebar nav clicks (and any [data-screen-target] anywhere).
  document.body.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-screen], [data-screen-target]');
    if (!trigger) return;
    const screen = trigger.dataset.screen || trigger.dataset.screenTarget;
    if (screen) navigate(screen);
  });

  // Window controls (minimize / maximize / close) via preload bridge.
  const winApi = window.windowAPI;
  document.getElementById('winMin').addEventListener('click', () => winApi?.minimize());
  document.getElementById('winMax').addEventListener('click', () => winApi?.toggleMaximize());
  document.getElementById('winClose').addEventListener('click', () => winApi?.close());

  // Cross-screen events from renderers.
  window.addEventListener('app:navigate', (e) => navigate(e.detail));
  window.addEventListener('app:toast', (e) => showToast(e.detail));

  // Keyboard: Cmd/Ctrl-N opens quick add, Esc returns to list.
  window.addEventListener('keydown', (e) => {
    const isAccel = (e.metaKey || e.ctrlKey);
    if (isAccel && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      navigate('add');
    } else if (e.key === 'Escape' && currentScreen() === 'add') {
      navigate('list');
    }
  });

  // Dev-only escape hatch: triple-click brand to reset to seed data.
  let brandClicks = 0;
  document.querySelector('.brand')?.addEventListener('click', () => {
    brandClicks++;
    setTimeout(() => { brandClicks = 0; }, 600);
    if (brandClicks >= 3) {
      resetState();
      showToast('Sample data restored.');
    }
  });

  subscribe(() => renderCurrentScreen());
  renderCurrentScreen();
}

// ------------------------------ Toast ------------------------------

let toastTimer = null;
function showToast(message) {
  const node = document.getElementById('toast');
  if (!node || !message) return;
  node.textContent = message;
  node.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2200);
}

// ------------------------------ Boot ------------------------------

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
