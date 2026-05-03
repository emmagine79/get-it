// Tiny modal manager. One modal at a time.
// `bodyHTML` accepts the html`` tagged-template result (a __raw object)
// or a plain string. The body is materialised through setHTML, which is
// the project's single audit point for rendering markup.

import { setHTML } from './util.js';

let activeModal = null;
let activeKeyHandler = null;

function ensureContainer() {
  let host = document.getElementById('modalRoot');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'modalRoot';
  host.className = 'modal-root';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  return host;
}

export function openModal({ title, bodyHTML, onMount }) {
  if (activeModal) closeModal();

  const host = ensureContainer();
  host.classList.add('open');
  host.setAttribute('aria-hidden', 'false');

  // Build the chrome with DOM APIs — only the user body uses setHTML.
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const shell = document.createElement('div');
  shell.className = 'modal-shell';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-modal', 'true');
  shell.setAttribute('aria-label', String(title || 'Dialog'));

  const head = document.createElement('header');
  head.className = 'modal-head';

  const titleEl = document.createElement('h3');
  titleEl.className = 'modal-title';
  titleEl.textContent = String(title || '');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';

  head.append(titleEl, closeBtn);

  const content = document.createElement('div');
  content.className = 'modal-content';
  setHTML(content, bodyHTML);

  shell.append(head, content);
  overlay.append(shell);
  host.append(overlay);

  const close = () => closeModal();
  const replace = (newBody) => setHTML(content, newBody);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);

  activeKeyHandler = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', activeKeyHandler);

  activeModal = { host, overlay };

  if (typeof onMount === 'function') {
    onMount(shell, { close, replace });
  }

  const focusable = shell.querySelector('input, textarea, button, [tabindex]');
  if (focusable) requestAnimationFrame(() => focusable.focus());
}

export function closeModal() {
  if (!activeModal) return;
  activeModal.overlay.remove();
  activeModal.host.classList.remove('open');
  activeModal.host.setAttribute('aria-hidden', 'true');
  if (activeKeyHandler) {
    document.removeEventListener('keydown', activeKeyHandler);
    activeKeyHandler = null;
  }
  activeModal = null;
}
