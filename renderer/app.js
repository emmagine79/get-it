import { getState, setState, subscribe, resetState, replaceCalendarsAndEvents } from './state.js';
import {
  renderSchedule, renderList, renderBridge, renderAdd, renderReview,
  renderSettings, renderConnect, renderSidebarSummary, resetAddForm,
} from './screens.js';
import { closeModal } from './modal.js';
import { fmtTodayLabel, nowMinutesClamped, html, setHTML } from './util.js';

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
const topbarActionsNode = document.getElementById('topbarActions');

function currentScreen() {
  const s = getState();
  if (!s.hasCompletedFirstRun && s.currentScreen !== 'connect') return 'connect';
  return s.currentScreen || 'list';
}

function renderCurrentScreen() {
  const id = currentScreen();
  const def = SCREENS[id];
  if (!def) return;
  const state = getState();

  for (const key of Object.keys(SCREENS)) {
    const el = document.getElementById(key);
    if (!el) continue;
    el.classList.toggle('active', key === id);
  }
  document.querySelectorAll('.tab').forEach((tab) => {
    if (tab.dataset.screen === 'connect') {
      const hideCompletedFirstRun = state.hasCompletedFirstRun && id !== 'connect';
      tab.hidden = hideCompletedFirstRun;
      tab.classList.toggle('is-hidden', hideCompletedFirstRun);
    }
    tab.classList.toggle('active', tab.dataset.screen === id);
  });

  screenTitleNode.textContent = def.title;
  dateLabelNode.textContent = state.date;
  renderTopbarActions(id);

  const target = document.getElementById(id);
  def.render(target, state);

  renderSidebarSummary(state);
}

function renderTopbarActions(id) {
  if (!topbarActionsNode) return;
  if (id === 'connect') {
    setHTML(topbarActionsNode, '');
    return;
  }
  const actions = [];
  if (id !== 'bridge') {
    actions.push(html`<button class="button" data-screen-target="bridge">Split view</button>`);
  }
  if (id !== 'add') {
    actions.push(html`<button class="button primary" data-screen-target="add">Quick add</button>`);
  }
  setHTML(topbarActionsNode, html`${actions}`);
}

function navigate(id) {
  if (!SCREENS[id]) return;
  if (id === 'add') resetAddForm();
  // Reset per-screen one-shot flags so scroll-to-now / etc. fire again
  // when the user re-enters the screen.
  for (const key of Object.keys(SCREENS)) {
    const el = document.getElementById(key);
    if (el) delete el.dataset.didScroll;
  }
  closeModal();
  setState({ currentScreen: id });
}

// ------------------------------ Toast ------------------------------

let toastTimer = null;
function showToast(message) {
  const node = document.getElementById('toast');
  if (!node || !message) return;
  node.textContent = message;
  node.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2400);
}

// ------------------------------ Google ------------------------------

async function googleConnect() {
  const api = window.googleAPI;
  if (!api) {
    setState({ googleError: 'Google bridge unavailable. Restart the app.' });
    return;
  }
  setState({ googleSyncing: true, googleError: null });
  const result = await api.connect();
  if (!result.ok) {
    setState({ googleSyncing: false, googleError: result.error });
    showToast('Could not connect.');
    return;
  }
  replaceCalendarsAndEvents(result.calendars || [], result.events || []);
  setState({
    googleConnected: true,
    googleAccount: result.account,
    googleSyncing: false,
    googleError: null,
    hasCompletedFirstRun: true,
    currentScreen: 'schedule',
  });
  showToast(result.account ? `Connected as ${result.account}.` : 'Connected.');
}

async function googleRefresh() {
  const api = window.googleAPI;
  if (!api) return;
  setState({ googleSyncing: true, googleError: null });
  const result = await api.sync();
  if (!result.ok) {
    setState({ googleSyncing: false, googleError: result.error });
    showToast('Sync failed.');
    return;
  }
  replaceCalendarsAndEvents(result.calendars || [], result.events || []);
  setState({ googleSyncing: false });
  showToast('Synced.');
}

async function bootGoogleStatus() {
  const api = window.googleAPI;
  if (!api) return;
  try {
    const status = await api.status();
    if (status.connected) {
      setState({ googleConnected: true, googleAccount: status.account });
      // Quietly refresh in the background so today's events match reality.
      const result = await api.sync();
      if (result.ok) {
        replaceCalendarsAndEvents(result.calendars || [], result.events || []);
        setState({ googleSyncing: false });
      } else {
        setState({ googleError: result.error });
      }
    }
  } catch {}
}

// ------------------------------ Boot ------------------------------

function init() {
  document.body.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-screen], [data-screen-target]');
    if (!trigger) return;
    const screen = trigger.dataset.screen || trigger.dataset.screenTarget;
    if (screen) navigate(screen);
  });

  const winApi = window.windowAPI;
  document.getElementById('winMin').addEventListener('click', () => winApi?.minimize());
  document.getElementById('winMax').addEventListener('click', () => winApi?.toggleMaximize());
  document.getElementById('winClose').addEventListener('click', () => winApi?.close());

  window.addEventListener('app:navigate', (e) => navigate(e.detail));
  window.addEventListener('app:toast', (e) => showToast(e.detail));
  window.addEventListener('app:google-connect', googleConnect);
  window.addEventListener('app:google-refresh', googleRefresh);

  window.addEventListener('keydown', (e) => {
    const isAccel = (e.metaKey || e.ctrlKey);
    if (isAccel && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      navigate('add');
    } else if (e.key === 'Escape' && currentScreen() === 'add') {
      navigate('list');
    }
  });

  // Triple-click brand to reset to a clean slate.
  let brandClicks = 0;
  document.querySelector('.brand')?.addEventListener('click', () => {
    brandClicks++;
    setTimeout(() => { brandClicks = 0; }, 600);
    if (brandClicks >= 3) {
      resetState();
      showToast('Cleared. Connect Google to bring events back.');
    }
  });

  // Refresh "now" line and date every minute.
  setInterval(() => {
    setState((s) => ({
      ...s,
      date: fmtTodayLabel(),
      nowMinutes: nowMinutesClamped(),
    }));
  }, 60_000);

  subscribe(() => renderCurrentScreen());
  renderCurrentScreen();

  bootGoogleStatus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
