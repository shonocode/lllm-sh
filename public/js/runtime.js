import { state, isIOS, chatInput, terminal, parseSizeMB, maxModelMBFor } from './state.js';
import { MODELS, loadCustomModels, saveCustomModels } from './models.js';
import { log, logAi, startAiLine, appendAiToken, finishAiLine, setStatus } from './terminal.js';
import { perf, perfLoadDone, perfGenStart, perfGenToken, perfGenDone } from './perf.js';
import { saveHistory, updateThreadTitle, trimHistory, getActiveThread, saveThreads } from './threads.js';
import { syncSystemPrompt } from './memory.js';
import { speak } from './voice.js';

/* ── Shared helpers ── */

function persistRuntimeSelection() {
  localStorage.setItem('lllm-sh-runtime', state.currentRuntime);
  localStorage.setItem('lllm-sh-model-index', String(state.currentModelIndex));
}

export async function unloadCurrentModel() {
  if (state.wllamaInstance) {
    try { await state.wllamaInstance.exit(); } catch (e) { console.warn('wllama exit:', e); }
    state.wllamaInstance = null;
  }
  if (state.webgpuPipe) {
    try { if (state.webgpuPipe.unload) await state.webgpuPipe.unload(); } catch (e) { console.warn('webgpu unload:', e); }
    state.webgpuPipe = null;
  }
  state.ready = false;
  chatInput.disabled = true;
  setStatus('loading', 'loading...');
}

export async function runWllamaCompletion(instance, messages, { maxTokens = 512, onToken, cancellable = true } = {}) {
  let prompt = '';
  for (const m of messages) {
    prompt += '<|im_start|>' + m.role + '\n' + m.content + '<|im_end|>\n';
  }
  prompt += '<|im_start|>assistant\n';

  const decoder = new TextDecoder('utf-8', { fatal: false });
  let fullText = '';
  let stopped = false;

  const controller = cancellable ? new AbortController() : null;
  if (cancellable) state.abortController = controller;

  const sampling = { temp: state.sampling.temp, top_p: state.sampling.top_p };
  if (state.sampling.seed != null) sampling.seed = state.sampling.seed;

  try {
    await instance.createCompletion(prompt, {
      nPredict: maxTokens,
      sampling,
      abortSignal: controller ? controller.signal : undefined,
      onNewToken: (token, piece, currentText) => {
        if (stopped) return;
        if (currentText.includes('<|im_end|>')) {
          stopped = true;
          if (controller) controller.abort();
          return;
        }
        const decoded = decoder.decode(piece, { stream: true });
        if (decoded) {
          fullText += decoded;
          if (onToken) onToken(decoded);
        }
      },
    });
  } catch (err) {
    if (err && err.name === 'WllamaAbortError') {
      // Expected on cancel / im_end stop — fall through with whatever we have
    } else {
      throw err;
    }
  } finally {
    if (cancellable) state.abortController = null;
  }

  const remaining = decoder.decode();
  if (remaining) {
    fullText += remaining;
    if (onToken) onToken(remaining);
  }

  return fullText.split('<|im_end|>')[0].trim();
}

/* ── Model loading ── */

function updateLineProgress(line, label) {
  if (!line) return;
  const content = line.querySelector('.content');
  if (content) content.textContent = ' ' + label;
}

function markModelReady() {
  setStatus('ready', 'ready');
  state.ready = true;
  chatInput.disabled = false;
  chatInput.focus();
}

async function loadWebGPUModel(modelUrl, modelName, modelSize) {
  log('system', 'loading web-llm...');
  const { CreateMLCEngine } = await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm');

  const progressLine = log('system', 'downloading ' + modelName + ' ' + modelSize + '...');

  state.webgpuPipe = await CreateMLCEngine(modelUrl, {
    initProgressCallback: (report) => {
      const pct = report.progress ? Math.round(report.progress * 100) : 0;
      updateLineProgress(progressLine, 'downloading ' + modelName + '... ' + pct + '%');
    },
  });

  perfLoadDone();
  log('system', 'model loaded: ' + modelName + ' via WebGPU');
  log('system', 'ready. type a message or /help for commands.');
  markModelReady();
}

async function loadWllamaModel() {
  log('system', 'loading wllama...');
  const { Wllama } = await import('https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/index.js');

  const CONFIG_PATHS = {
    'single-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/single-thread/wllama.wasm',
    'multi-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/multi-thread/wllama.wasm',
    'multi-thread/wllama.worker.mjs': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/multi-thread/wllama.worker.mjs',
  };

  state.wllamaInstance = new Wllama(CONFIG_PATHS, {
    useCache: true,
    allowOffline: true,
  });

  const wllamaModel = MODELS.wllama[state.currentModelIndex] || MODELS.wllama[1];
  const wllamaUrl = wllamaModel.value;
  const wllamaName = wllamaModel.name;
  const wllamaSize = wllamaModel.size;

  const cached = await state.wllamaInstance.cacheManager.getMetadata(wllamaUrl).catch((e) => { console.debug('cache check skipped:', e); return null; });
  const progressLine = cached
    ? log('system', 'loading ' + wllamaName + ' from cache...')
    : log('system', 'downloading ' + wllamaName + ' ' + wllamaSize + '...');

  await state.wllamaInstance.loadModelFromUrl(wllamaUrl, {
    n_threads: isIOS ? 1 : navigator.hardwareConcurrency || 4,
    n_ctx: isIOS ? 512 : 2048,
    n_batch: isIOS ? 64 : 128,
    progressCallback: ({ loaded, total }) => {
      if (total > 0) {
        const pct = Math.round((loaded / total) * 100);
        updateLineProgress(progressLine, (cached ? 'loading' : 'downloading') + ' ' + wllamaName + '... ' + pct + '%');
      }
    },
  });

  perfLoadDone();
  log('system', 'model loaded: ' + wllamaName);
  log('system', 'ready. type a message or /help for commands.');
  markModelReady();
}

export async function loadModel() {
  const catalog = MODELS[state.currentRuntime];
  const model = catalog[state.currentModelIndex];

  // Heuristic capability check
  const mb = parseSizeMB(model.size);
  const maxMB = maxModelMBFor(state.currentRuntime, state.hasWebGPU);
  if (mb && maxMB && mb > maxMB) {
    log('system', '⚠ ' + model.name + ' (' + model.size + ') exceeds the recommended ' + maxMB + 'MB limit for this device — load may fail or stall.');
  }

  perf.loadStart = performance.now();
  setStatus('loading', 'loading...');

  if (state.currentRuntime === 'webgpu') {
    try {
      await loadWebGPUModel(model.value, model.name, model.size);
      return;
    } catch (err) {
      console.warn('WebGPU load failed:', err);
      log('error', 'WebGPU failed: ' + err.message);
      log('system', 'falling back to wllama...');
      state.webgpuPipe = null;
      state.currentRuntime = 'wllama';
      state.currentModelIndex = 1;
    }
  }

  try {
    await loadWllamaModel();
  } catch (err) {
    log('error', err.message);
    log('system', 'load failed. try /model to pick another model.');
    setStatus('offline', 'error');
  }
}

export async function switchModel(index) {
  const catalog = MODELS[state.currentRuntime];
  if (index < 0 || index >= catalog.length) {
    log('error', 'invalid model number. type /model to see list.');
    return;
  }
  if (state.generating) {
    log('error', 'cannot switch model while generating.');
    return;
  }

  const wasLoaded = !!(state.wllamaInstance || state.webgpuPipe);
  if (wasLoaded) {
    log('system', 'unloading current model...');
    await unloadCurrentModel();
  }

  state.currentModelIndex = index;
  persistRuntimeSelection();

  if (wasLoaded) {
    await loadModel();
  } else {
    const m = MODELS[state.currentRuntime][index];
    if (m) log('system', 'selected: ' + m.name + ' (' + m.size + '). type /load to load.');
  }
}

export async function switchRuntime(rt) {
  if (rt !== 'wllama' && rt !== 'webgpu') {
    log('error', 'unknown runtime. use: wllama or webgpu');
    return;
  }
  if (rt === 'webgpu' && !state.hasWebGPU) {
    log('error', 'WebGPU not available on this device.');
    return;
  }
  if (state.generating) {
    log('error', 'cannot switch runtime while generating.');
    return;
  }

  const wasLoaded = !!(state.wllamaInstance || state.webgpuPipe);
  if (wasLoaded) await unloadCurrentModel();

  state.currentRuntime = rt;
  state.currentModelIndex = 1;
  persistRuntimeSelection();
  log('system', 'switched runtime to ' + rt);

  // Only auto-load if a model was loaded before; otherwise wait for /load
  if (wasLoaded) {
    await loadModel();
  } else {
    const m = MODELS[rt][state.currentModelIndex];
    if (m) log('system', 'selected: ' + m.name + ' (' + m.size + '). type /load to load.');
  }
}

export async function loadCustomGGUF(url) {
  if (!url.endsWith('.gguf')) {
    log('error', 'URL must point to a .gguf file.');
    return;
  }
  if (state.generating) {
    log('error', 'cannot switch model while generating.');
    return;
  }
  if (state.currentRuntime !== 'wllama') {
    log('system', 'custom GGUF requires wllama runtime. switching...');
    state.currentRuntime = 'wllama';
  }

  await unloadCurrentModel();

  const fileName = url.split('/').pop().split('?')[0];
  const existingIdx = MODELS.wllama.findIndex((m) => m.value === url);
  let idx;
  if (existingIdx >= 0) {
    idx = existingIdx;
  } else {
    const customModel = { value: url, name: fileName, size: '?', custom: true };
    idx = MODELS.wllama.length;
    MODELS.wllama.push(customModel);
    const customs = loadCustomModels();
    if (!customs.some((m) => m.value === url)) {
      customs.push({ value: url, name: fileName, size: '?' });
      saveCustomModels(customs);
    }
  }
  state.currentModelIndex = idx;
  persistRuntimeSelection();

  log('system', 'loading custom model: ' + fileName);
  await loadModel();
}

export async function generateWebGPU() {
  perfGenStart();
  try {
    const opts = {
      stream: true,
      messages: [...state.messages],
      max_tokens: isIOS ? 256 : 512,
      temperature: state.sampling.temp,
      top_p: state.sampling.top_p,
    };
    if (state.sampling.seed != null) opts.seed = state.sampling.seed;
    const completion = await state.webgpuPipe.chat.completions.create(opts);

    let fullText = '';
    for await (const chunk of completion) {
      if (state.cancelRequested) break;
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        perfGenToken();
        appendAiToken(delta);
        fullText += delta;
      }
    }

    perfGenDone();
    finishAiLine();
    if (fullText) { state.messages.push({ role: 'assistant', content: fullText }); saveHistory(); speak(fullText); }
  } catch (err) {
    finishAiLine();
    if (!state.cancelRequested) log('error', 'WebGPU error: ' + err.message);
  }
  state.generating = false;
  chatInput.disabled = false;
  chatInput.focus();
  maybeAutoTitle().catch((e) => console.warn('auto-title:', e));
}

export async function generateWllama() {
  perfGenStart();
  try {
    const fullText = await runWllamaCompletion(state.wllamaInstance, state.messages, {
      maxTokens: isIOS ? 256 : 512,
      onToken: (decoded) => { perfGenToken(); appendAiToken(decoded); },
    });

    perfGenDone();
    finishAiLine();
    if (fullText) { state.messages.push({ role: 'assistant', content: fullText }); saveHistory(); speak(fullText); }
  } catch (err) {
    finishAiLine();
    if (!state.cancelRequested) log('error', err.message);
  }
  state.generating = false;
  chatInput.disabled = false;
  chatInput.focus();
  maybeAutoTitle().catch((e) => console.warn('auto-title:', e));
}

export async function sendMessage(text) {
  state.generating = true;
  state.cancelRequested = false;
  chatInput.disabled = true;

  log('you', text);
  state.messages.push({ role: 'user', content: text });

  updateThreadTitle();
  saveHistory();
  trimHistory();
  syncSystemPrompt();

  const ctx = getContextUsage();
  if (ctx.used > ctx.limit * 0.85) {
    log('system', 'context ' + ctx.used + '/' + ctx.limit + ' tokens — consider /compact');
  }

  startAiLine();

  if (state.webgpuPipe) {
    await generateWebGPU();
  } else {
    await generateWllama();
  }
}

function estimateTokens() {
  let c = 0;
  for (const m of state.messages) c += (m.content || '').length;
  return Math.ceil(c / 4);
}

export function getContextLimit() {
  if (state.currentRuntime === 'wllama') return isIOS ? 512 : 2048;
  return 4000;
}

export function getContextUsage() {
  return { used: estimateTokens(), limit: getContextLimit() };
}

export async function compactConversation() {
  if (state.generating) { log('error', 'busy.'); return; }
  if (!state.ready) { log('error', 'model not loaded yet.'); return; }

  const nonSystem = state.messages.filter((m) => m.role !== 'system');
  if (nonSystem.length < 4) { log('system', 'not enough conversation to compact.'); return; }

  const keepLast = 4;
  const older = nonSystem.slice(0, -keepLast);
  const recent = nonSystem.slice(-keepLast);
  if (older.length === 0) { log('system', 'already compact.'); return; }

  const transcript = older.map((m) => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.content).join('\n\n');
  const summaryMessages = [
    { role: 'system', content: 'You are a precise summarizer. Output under 150 words capturing key facts, decisions, and unresolved questions. No commentary, no preamble.' },
    { role: 'user', content: 'Summarize this conversation:\n\n' + transcript },
  ];

  log('system', 'compacting ' + older.length + ' older messages...');
  state.generating = true;
  chatInput.disabled = true;

  let summary = '';
  try {
    if (state.webgpuPipe) {
      const completion = await state.webgpuPipe.chat.completions.create({
        stream: false, messages: summaryMessages, max_tokens: 256, temperature: 0.3,
      });
      summary = (completion.choices && completion.choices[0] && completion.choices[0].message && completion.choices[0].message.content) || '';
    } else if (state.wllamaInstance) {
      summary = await runWllamaCompletion(state.wllamaInstance, summaryMessages, {
        maxTokens: 256, cancellable: false,
      });
    }
  } catch (e) {
    log('error', 'compact failed: ' + e.message);
    state.generating = false; chatInput.disabled = false; chatInput.focus();
    return;
  }

  state.generating = false;
  chatInput.disabled = false;
  chatInput.focus();

  summary = summary.trim();
  if (!summary) { log('error', 'no summary produced.'); return; }

  const sysMsg = state.messages[0] || { role: 'system', content: '' };
  state.messages = [
    sysMsg,
    { role: 'system', content: '[Earlier conversation summary]\n' + summary },
    ...recent,
  ];
  saveHistory();

  terminal.innerHTML = '';
  log('system', 'conversation compacted (' + older.length + ' messages → 1 summary).');
  for (const m of recent) {
    if (m.role === 'user') log('you', m.content);
    else if (m.role === 'assistant') logAi(m.content);
  }
}

export async function generateThreadTitle() {
  if (!state.ready || state.generating) return;
  const thread = getActiveThread();
  if (!thread) return;
  const firstUser = state.messages.find((m) => m.role === 'user');
  const firstAssistant = state.messages.find((m) => m.role === 'assistant');
  if (!firstUser || !firstAssistant) return;

  const titleMessages = [
    { role: 'system', content: 'Output ONLY a 3-6 word title for the conversation. No quotes, no trailing punctuation, no preamble.' },
    { role: 'user', content: 'User: ' + firstUser.content.slice(0, 300) + '\nAssistant: ' + firstAssistant.content.slice(0, 400) + '\n\nTitle:' },
  ];

  state.generating = true;
  let title = '';
  try {
    if (state.webgpuPipe) {
      const c = await state.webgpuPipe.chat.completions.create({
        stream: false, messages: titleMessages, max_tokens: 24, temperature: 0.3,
      });
      title = (c.choices && c.choices[0] && c.choices[0].message && c.choices[0].message.content) || '';
    } else if (state.wllamaInstance) {
      title = await runWllamaCompletion(state.wllamaInstance, titleMessages, {
        maxTokens: 24, cancellable: false,
      });
    }
  } catch (e) {
    console.warn('title gen:', e);
  } finally {
    state.generating = false;
  }

  title = (title || '').trim().split('\n')[0].replace(/^["']|["']$/g, '').replace(/[.!?,;:]$/, '');
  if (title) {
    thread.title = title.slice(0, 60);
    thread.titleAuto = true;
    saveThreads();
  }
}

async function maybeAutoTitle() {
  const thread = getActiveThread();
  if (!thread || thread.titleAuto) return;
  const userTurns = state.messages.filter((m) => m.role === 'user').length;
  const assistantTurns = state.messages.filter((m) => m.role === 'assistant').length;
  if (userTurns !== 1 || assistantTurns !== 1) return;
  await generateThreadTitle();
}

export async function regenerateLast() {
  if (state.generating) { log('error', 'already generating.'); return; }
  if (!state.ready) { log('error', 'model not loaded yet.'); return; }

  let lastAssistantIdx = -1;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    if (state.messages[i].role === 'assistant') { lastAssistantIdx = i; break; }
  }
  if (lastAssistantIdx < 0) { log('error', 'no assistant message to regenerate.'); return; }

  state.messages.splice(lastAssistantIdx);
  saveHistory();
  syncSystemPrompt();

  // Re-render terminal to drop the previous AI line
  terminal.innerHTML = '';
  for (const m of state.messages) {
    if (m.role === 'user') log('you', m.content);
    else if (m.role === 'assistant') logAi(m.content);
  }

  state.generating = true;
  state.cancelRequested = false;
  chatInput.disabled = true;
  startAiLine();

  if (state.webgpuPipe) await generateWebGPU();
  else await generateWllama();
}
