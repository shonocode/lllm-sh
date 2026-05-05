/* Memory and Persona system.
   - Memory: long-term facts saved to localStorage, injected into system prompt on every gen
   - Persona: named system-prompt presets, stored alongside the active selection */

import { state, DEFAULT_SYSTEM_PROMPT } from './state.js';

const MEMORY_KEY = 'lllm-sh-memory';
const PERSONAS_KEY = 'lllm-sh-personas';
const ACTIVE_PERSONA_KEY = 'lllm-sh-active-persona';

const BUILTIN_PERSONAS = {
  default: DEFAULT_SYSTEM_PROMPT,
  coder: 'You are a senior software engineer. Reply with terse, correct code. Explain only when asked. Prefer modern idioms.',
  writer: 'You are a sharp editor. Help draft and refine prose. Be concise. Suggest concrete rewrites rather than vague advice.',
  tutor: 'You are a patient tutor. Explain concepts step-by-step using simple analogies, then check understanding with a small example.',
};

export function loadMemory() {
  try {
    const v = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function saveMemory(items) {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(items));
}

export function addMemory(text) {
  const items = loadMemory();
  items.push(text);
  saveMemory(items);
  return items;
}

export function removeMemory(index) {
  const items = loadMemory();
  if (index < 0 || index >= items.length) return null;
  const removed = items.splice(index, 1)[0];
  saveMemory(items);
  return removed;
}

export function clearMemory() {
  saveMemory([]);
}

export function loadPersonas() {
  try {
    const v = JSON.parse(localStorage.getItem(PERSONAS_KEY) || '{}');
    return { ...BUILTIN_PERSONAS, ...(v && typeof v === 'object' ? v : {}) };
  } catch { return { ...BUILTIN_PERSONAS }; }
}

export function saveUserPersonas(map) {
  // Strip out builtins so we don't double-store
  const userOnly = {};
  for (const [k, v] of Object.entries(map)) {
    if (!(k in BUILTIN_PERSONAS) || BUILTIN_PERSONAS[k] !== v) userOnly[k] = v;
  }
  localStorage.setItem(PERSONAS_KEY, JSON.stringify(userOnly));
}

export function isBuiltinPersona(name) {
  return name in BUILTIN_PERSONAS;
}

export function getActivePersonaName() {
  return localStorage.getItem(ACTIVE_PERSONA_KEY) || null;
}

export function setActivePersona(name) {
  if (name) localStorage.setItem(ACTIVE_PERSONA_KEY, name);
  else localStorage.removeItem(ACTIVE_PERSONA_KEY);
}

/* Compose final system prompt = (persona base or state.systemPrompt) + memory injection. */
export function composedSystemPrompt() {
  const personaName = getActivePersonaName();
  const personas = loadPersonas();
  const base = (personaName && personas[personaName]) || state.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  const mem = loadMemory();
  if (mem.length === 0) return base;

  const memBlock = '\n\nLong-term memory about the user / context (use when relevant, do not repeat verbatim):\n' +
    mem.map((m) => '- ' + m).join('\n');
  return base + memBlock;
}

/* Mutate state.messages[0] in place. Call before every generation. */
export function syncSystemPrompt() {
  if (state.messages.length === 0) {
    state.messages.push({ role: 'system', content: composedSystemPrompt() });
  } else {
    state.messages[0] = { role: 'system', content: composedSystemPrompt() };
  }
}
