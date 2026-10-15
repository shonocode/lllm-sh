import { state, isIOS, chatInput, terminal, copyToast, deviceLabel, maxModelMBFor, parseSizeMB } from './state.js';
import { MODELS } from './models.js';
import { log, logAscii, logRaw } from './terminal.js';
import { handleCommand, COMMANDS } from './commands.js';
import { loadModel, sendMessage } from './runtime.js';
import { loadHistory } from './threads.js';
import { initAttachments, buildAttachmentPrefix, getPendingAttachments } from './attachments.js';

/* ── Input history ── */
const HISTORY_KEY = 'lllm-sh-input-history';
const MAX_HISTORY = 100;
let inputHistory = (() => {
  try { const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(h) ? h : []; }
  catch { return []; }
})();
let historyIndex = inputHistory.length;
let historyDraft = '';

function pushHistory(text) {
  if (inputHistory[inputHistory.length - 1] === text) return;
  inputHistory.push(text);
  if (inputHistory.length > MAX_HISTORY) inputHistory = inputHistory.slice(-MAX_HISTORY);
  historyIndex = inputHistory.length;
  historyDraft = '';
  localStorage.setItem(HISTORY_KEY, JSON.stringify(inputHistory));
}

function commonPrefix(strs) {
  if (!strs.length) return '';
  let p = strs[0];
  for (const s of strs) while (!s.startsWith(p)) p = p.slice(0, -1);
  return p;
}

function cancelGeneration() {
  state.cancelRequested = true;
  if (state.abortController) state.abortController.abort();
  if (state.webgpuPipe && state.webgpuPipe.interruptGenerate) {
    try { state.webgpuPipe.interruptGenerate(); } catch (err) { console.warn('webgpu interrupt:', err); }
  }
  log('system', 'generation cancelled.');
}

/* ── Input handler ── */
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.generating) {
    e.preventDefault();
    cancelGeneration();
    return;
  }

  if (e.key === 'ArrowUp') {
    if (inputHistory.length === 0) return;
    e.preventDefault();
    if (historyIndex === inputHistory.length) historyDraft = chatInput.value;
    if (historyIndex > 0) {
      historyIndex--;
      chatInput.value = inputHistory[historyIndex];
      chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
    }
    return;
  }
  if (e.key === 'ArrowDown') {
    if (historyIndex >= inputHistory.length) return;
    e.preventDefault();
    historyIndex++;
    chatInput.value = historyIndex === inputHistory.length ? historyDraft : inputHistory[historyIndex];
    chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    const v = chatInput.value;
    if (!v.startsWith('/') || v.includes(' ')) return;
    const matches = COMMANDS.filter((c) => c.startsWith(v));
    if (matches.length === 1) {
      chatInput.value = matches[0] + ' ';
    } else if (matches.length > 1) {
      const pref = commonPrefix(matches);
      if (pref.length > v.length) chatInput.value = pref;
      else log('system', matches.join('  '));
    }
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    const typed = chatInput.value.trim();
    const hasAttach = getPendingAttachments().length > 0;
    chatInput.value = '';
    historyIndex = inputHistory.length;
    historyDraft = '';
    if (!typed && !hasAttach) return;

    if (state.generating) {
      cancelGeneration();
      return;
    }

    if (typed) pushHistory(typed);

    if (typed.startsWith('/')) {
      handleCommand(typed);
    } else {
      if (!state.ready) {
        log('system', 'no model loaded. type /load to load, or /model to pick another.');
        return;
      }
      const prefix = buildAttachmentPrefix();
      sendMessage(prefix + (typed || '(see attached files)'));
    }
  }
});

/* ── Copy ai message on click ── */
terminal.addEventListener('click', (e) => {
  const line = e.target.closest('.line');
  if (!line || state.generating) return;
  const pfx = line.querySelector('.prefix.ai');
  if (!pfx) return;
  const content = line.querySelector('.content');
  if (!content) return;
  const text = content.textContent.trim();
  navigator.clipboard.writeText(text).then(() => {
    copyToast.classList.add('show');
    setTimeout(() => copyToast.classList.remove('show'), 1000);
  }).catch((e) => { console.warn('clipboard copy failed:', e); });
});

/* ── PWA install banner ── */
const pwaBanner = document.getElementById('pwa-banner');
const pwaDismiss = document.getElementById('pwa-dismiss');

if (isIOS && !window.navigator.standalone && !localStorage.getItem('lllm-sh-pwa-dismissed')) {
  pwaBanner.classList.add('visible');
}
pwaDismiss.addEventListener('click', (e) => {
  e.stopPropagation();
  pwaBanner.classList.remove('visible');
  localStorage.setItem('lllm-sh-pwa-dismissed', '1');
});

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!localStorage.getItem('lllm-sh-pwa-dismissed')) {
    pwaBanner.classList.add('visible');
    pwaBanner.querySelector('span').textContent = 'Install as app for offline use';
    pwaBanner.addEventListener('click', () => {
      deferredInstallPrompt.prompt();
      pwaBanner.classList.remove('visible');
    }, { once: true });
  }
});

/* ── WebGPU detection + init ── */
(async () => {
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) state.hasWebGPU = true;
    } catch (e) { console.warn('WebGPU detection failed:', e); }
  }

  // Determine default runtime — only auto-pick webgpu if user hasn't chosen one before
  const savedRuntime = localStorage.getItem('lllm-sh-runtime');
  if (!savedRuntime && state.hasWebGPU && !isIOS) {
    state.currentRuntime = 'webgpu';
  }
  // If user saved 'webgpu' but it's no longer available, fall back
  if (state.currentRuntime === 'webgpu' && !state.hasWebGPU) {
    state.currentRuntime = 'wllama';
  }
  // Clamp model index to current catalog
  const catalogLen = MODELS[state.currentRuntime].length;
  if (state.currentModelIndex >= catalogLen) state.currentModelIndex = Math.min(1, catalogLen - 1);

  // Restore previous threads (model not required)
  loadHistory();

  // Show welcome
  logAscii('  _ _ _ _ _         _     ');
  logAscii(' | | | | | |_ __ __| |__  ');
  logAscii(' | | | | | | \'  \\(_-< \'  \\ ');
  logAscii(' |_|_|_|_|_|_|_|_/__/_||_|');
  logRaw('');
  log('system', 'lllm.sh -- browser LLM terminal');
  const maxMB = maxModelMBFor(state.currentRuntime, state.hasWebGPU);
  log('system', 'device: ' + deviceLabel() + (state.hasWebGPU ? ' + WebGPU' : '') + ' — recommended max model ~' + (maxMB >= 1024 ? (maxMB / 1024).toFixed(1) + 'GB' : maxMB + 'MB'));
  const selected = MODELS[state.currentRuntime][state.currentModelIndex];
  if (selected) {
    const sel = parseSizeMB(selected.size);
    const heavy = (sel && sel > maxMB) ? ' [may not fit]' : '';
    log('system', 'selected: ' + selected.name + ' (' + selected.size + ', ' + state.currentRuntime + ')' + heavy);
  }
  log('system', 'type /load to download/load, /model to choose another, /help for commands');
  logRaw('');

  // Enable input — model is loaded on demand via /load
  chatInput.disabled = false;
  chatInput.focus();

  initAttachments();

  // Ask the browser not to evict multi-GB model caches under storage pressure.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch((e) => { console.debug('storage.persist skipped:', e); });
  }
})();

/* ── Service Worker ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((e) => { console.warn('SW registration failed:', e); });
}
