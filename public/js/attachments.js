/* File drag-and-drop attachments.
   Read text-ish files, store as pending attachments, prepend to next message. */

import { log } from './terminal.js';
import { chatInput } from './state.js';

const MAX_FILE_BYTES = 256 * 1024; // 256KB per file
const MAX_TOTAL = 8;
const TEXT_EXT = /\.(txt|md|markdown|json|jsonl|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|c|cc|cpp|h|hpp|cs|swift|kt|sh|bash|zsh|html|htm|xml|svg|css|scss|less|yaml|yml|toml|ini|cfg|conf|csv|tsv|sql|log|env|gitignore|dockerfile|gradle|properties)$/i;

const attachments = [];
let dropzoneEl = null;
let listEl = null;

function isLikelyText(file) {
  if (TEXT_EXT.test(file.name)) return true;
  if (file.type.startsWith('text/')) return true;
  if (file.type === 'application/json' || file.type === 'application/xml') return true;
  return false;
}

function renderList() {
  if (!listEl) return;
  if (attachments.length === 0) {
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }
  listEl.classList.remove('hidden');
  listEl.innerHTML = '';
  attachments.forEach((a, i) => {
    const chip = document.createElement('span');
    chip.className = 'attach-chip';
    chip.textContent = '📎 ' + a.name + ' (' + (a.content.length / 1024).toFixed(1) + 'KB)';
    const x = document.createElement('button');
    x.className = 'attach-remove';
    x.textContent = '×';
    x.setAttribute('aria-label', 'Remove ' + a.name);
    x.addEventListener('click', () => {
      attachments.splice(i, 1);
      renderList();
    });
    chip.appendChild(x);
    listEl.appendChild(chip);
  });
}

async function readFile(file) {
  if (!isLikelyText(file)) {
    log('error', 'skipping (not a text file): ' + file.name);
    return null;
  }
  if (file.size > MAX_FILE_BYTES) {
    log('error', 'skipping (>256KB): ' + file.name);
    return null;
  }
  try {
    const content = await file.text();
    return { name: file.name, content };
  } catch (e) {
    log('error', 'read failed: ' + file.name + ' (' + e.message + ')');
    return null;
  }
}

export async function addFiles(files) {
  for (const f of files) {
    if (attachments.length >= MAX_TOTAL) {
      log('error', 'max ' + MAX_TOTAL + ' attachments reached.');
      break;
    }
    const att = await readFile(f);
    if (att) attachments.push(att);
  }
  renderList();
}

export function getPendingAttachments() {
  return attachments.slice();
}

export function consumePendingAttachments() {
  if (attachments.length === 0) return [];
  const taken = attachments.slice();
  attachments.length = 0;
  renderList();
  return taken;
}

export function buildAttachmentPrefix() {
  const items = consumePendingAttachments();
  if (items.length === 0) return '';
  return items.map((a) => '[file: ' + a.name + ']\n```\n' + a.content + '\n```\n').join('\n') + '\n';
}

export function initAttachments() {
  listEl = document.getElementById('attachments');
  dropzoneEl = document.getElementById('dropzone');

  // File picker button (works on iOS where D&D doesn't)
  const filePicker = document.getElementById('file-picker');
  const attachBtn = document.getElementById('attach-button');
  if (attachBtn && filePicker) {
    attachBtn.addEventListener('click', () => filePicker.click());
    filePicker.addEventListener('change', async () => {
      if (filePicker.files && filePicker.files.length) {
        await addFiles(Array.from(filePicker.files));
      }
      filePicker.value = '';
      if (chatInput && !chatInput.disabled) chatInput.focus();
    });
  }

  // Drag-and-drop (desktop)
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    dragDepth++;
    dropzoneEl.classList.remove('hidden');
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropzoneEl.classList.add('hidden');
  });
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
      e.preventDefault();
    }
  });
  window.addEventListener('drop', async (e) => {
    dragDepth = 0;
    dropzoneEl.classList.add('hidden');
    if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    await addFiles(Array.from(e.dataTransfer.files));
  });
}
