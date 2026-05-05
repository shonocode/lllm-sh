import { state, isIOS, terminal } from './state.js';
import { log, logAi } from './terminal.js';

const THREADS_KEY = 'lllm-sh-threads';
const ACTIVE_THREAD_KEY = 'lllm-sh-active-thread';

export let threads = [];
export let activeThreadId = null;

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

export function loadThreads() {
  try { threads = JSON.parse(localStorage.getItem(THREADS_KEY)) || []; } catch { threads = []; }
  activeThreadId = localStorage.getItem(ACTIVE_THREAD_KEY);
}

export function saveThreads() {
  localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
  if (activeThreadId) localStorage.setItem(ACTIVE_THREAD_KEY, activeThreadId);
}

export function getActiveThread() {
  return threads.find(t => t.id === activeThreadId);
}

export function saveHistory() {
  const thread = getActiveThread();
  if (thread) {
    thread.messages = state.messages;
    saveThreads();
  }
}

export function createNewThread(switchTo) {
  const thread = {
    id: generateId(),
    title: 'new thread',
    messages: [{ role: 'system', content: state.systemPrompt }],
    createdAt: new Date().toISOString(),
  };
  threads.push(thread);
  if (switchTo !== false) {
    activeThreadId = thread.id;
    state.messages = thread.messages;
  }
  saveThreads();
  return thread;
}

export function switchThread(id) {
  const thread = threads.find(t => t.id === id);
  if (!thread) return false;
  activeThreadId = thread.id;
  state.messages = thread.messages;
  state.messages[0] = { role: 'system', content: state.systemPrompt };
  saveThreads();
  return true;
}

export function displayThread() {
  terminal.innerHTML = '';
  for (const m of state.messages) {
    if (m.role === 'user') log('you', m.content);
    else if (m.role === 'assistant') logAi(m.content);
  }
}

export function updateThreadTitle() {
  const thread = getActiveThread();
  if (thread && thread.title === 'new thread') {
    const firstUser = state.messages.find(m => m.role === 'user');
    if (firstUser) {
      thread.title = firstUser.content.slice(0, 24) + (firstUser.content.length > 24 ? '...' : '');
      saveThreads();
    }
  }
}

export function loadHistory() {
  loadThreads();
  if (activeThreadId) {
    const thread = getActiveThread();
    if (thread) {
      state.messages = thread.messages;
      state.messages[0] = { role: 'system', content: state.systemPrompt };
      displayThread();
      return;
    }
  }
  createNewThread();
}

export function searchThreads(query) {
  const q = query.toLowerCase();
  const results = [];
  for (const t of threads) {
    for (let i = 0; i < t.messages.length; i++) {
      const m = t.messages[i];
      if (m.role === 'system') continue;
      const content = m.content || '';
      const idx = content.toLowerCase().indexOf(q);
      if (idx < 0) continue;
      const snippet = content.slice(Math.max(0, idx - 20), idx + q.length + 20);
      results.push({
        threadId: t.id,
        threadTitle: t.title,
        messageIndex: i,
        role: m.role,
        snippet,
      });
      break; // one hit per thread is enough
    }
  }
  return results;
}

export function forkActiveThread(keepCount) {
  const active = getActiveThread();
  if (!active) return null;
  const nonSystem = active.messages.filter((m) => m.role !== 'system');
  const keep = (keepCount == null || keepCount > nonSystem.length) ? nonSystem.length : Math.max(0, keepCount);
  const sysMsg = active.messages.find((m) => m.role === 'system') || { role: 'system', content: state.systemPrompt };
  const fork = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: active.title + ' (fork)',
    messages: [sysMsg, ...nonSystem.slice(0, keep)],
    createdAt: new Date().toISOString(),
  };
  threads.push(fork);
  activeThreadId = fork.id;
  state.messages = fork.messages;
  saveThreads();
  return fork;
}

export function trimHistory() {
  const maxTurns = isIOS ? 4 : 10;
  const nonSystem = state.messages.filter(m => m.role !== 'system');
  if (nonSystem.length > maxTurns) {
    const keep = nonSystem.slice(-maxTurns);
    state.messages.length = 0;
    state.messages.push({ role: 'system', content: state.systemPrompt }, ...keep);
  }
}
