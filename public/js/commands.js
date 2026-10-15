import { state, isIOS, terminal, chatInput, parseSizeMB, maxModelMBFor } from './state.js';
import { MODELS } from './models.js';
import { log, logRaw } from './terminal.js';
import { loadModel, switchModel, switchRuntime, loadCustomGGUF, regenerateLast, compactConversation, getContextUsage, generateThreadTitle } from './runtime.js';
import { threads, activeThreadId, createNewThread, switchThread, displayThread, saveHistory, saveThreads, searchThreads, forkActiveThread } from './threads.js';
import { runBenchmark, runDiff } from './bench.js';
import { isModelCached, listCachedModels, deleteCachedModel, clearAllCache, formatBytes } from './cache.js';
import {
  loadMemory, addMemory, removeMemory, clearMemory,
  loadPersonas, saveUserPersonas, isBuiltinPersona,
  getActivePersonaName, setActivePersona,
} from './memory.js';
import { toggleVoice, isVoiceSupported, isTTSEnabled, setTTSEnabled, isTTSSupported, stopSpeaking } from './voice.js';

export const COMMANDS = [
  '/help', '/load', '/model', '/runtime', '/new', '/threads', '/thread', '/delete',
  '/reset', '/clear', '/export', '/system', '/perf', '/bench', '/diff',
  '/regen', '/retry', '/stop', '/temp', '/topp', '/seed', '/sampling',
  '/cache', '/uncache', '/memory', '/persona', '/voice', '/tts',
  '/compact', '/ctx', '/find', '/fork', '/title',
];

export function showHelp() {
  logRaw('');
  log('system', 'available commands:');
  logRaw('  /help            show this help');
  logRaw('  /load            load (download if needed) the selected model');
  logRaw('  /model           list available models');
  logRaw('  /model <n>       switch to model number n');
  logRaw('  /model <url>     load custom GGUF from URL');
  logRaw('  /runtime         show current runtime');
  logRaw('  /runtime wllama  switch to wllama (CPU/WASM)');
  logRaw('  /runtime webgpu  switch to web-llm (WebGPU)');
  logRaw('  /new             start a new conversation');
  logRaw('  /threads         list saved conversations');
  logRaw('  /thread <n>      switch to thread n');
  logRaw('  /delete <n>      delete thread n');
  logRaw('  /reset           clear current conversation');
  logRaw('  /clear           clear terminal output');
  logRaw('  /export          download conversation as markdown');
  logRaw('  /system          show current system prompt');
  logRaw('  /system <text>   set new system prompt');
  logRaw('  /perf            toggle performance stats');
  logRaw('  /bench           run model benchmark');
  logRaw('  /diff <a> <b>    compare two models');
  logRaw('  /regen           regenerate the last assistant reply');
  logRaw('  /stop            cancel current generation (also Esc)');
  logRaw('  /sampling        show current sampling settings');
  logRaw('  /temp <n>        set temperature (0.0-2.0)');
  logRaw('  /topp <n>        set top_p (0.0-1.0)');
  logRaw('  /seed <n>        set seed (or "random" to clear)');
  logRaw('  /cache           list downloaded (cached) models with sizes');
  logRaw('  /uncache <n>     delete cached model n (or "all" to clear all)');
  logRaw('  /memory          list long-term memory items');
  logRaw('  /memory add <t>  add a memory item');
  logRaw('  /memory rm <n>   remove memory n');
  logRaw('  /memory clear    clear all memory');
  logRaw('  /persona         list available personas');
  logRaw('  /persona use <n> activate persona n (or by name)');
  logRaw('  /persona save <name>  save current /system prompt as persona');
  logRaw('  /persona rm <name>    delete a saved persona');
  logRaw('  /voice           toggle speech-to-text input');
  logRaw('  /tts             toggle TTS read-aloud of AI replies');
  logRaw('  /ctx             show context usage');
  logRaw('  /ctx <n|auto>    set context window (tokens) for next load — smaller = less memory');
  logRaw('  /compact         summarize older turns to free up context');
  logRaw('  /find <text>     search across all threads');
  logRaw('  /fork [n]        fork current thread (optionally up to message n)');
  logRaw('  /title           generate a fresh title for this thread');
  logRaw('');
  logRaw('  ↑/↓              recall input history');
  logRaw('  Tab              complete slash command');
  logRaw('  anything else is sent as a chat message.');
  logRaw('');
}

export async function showModels() {
  logRaw('');
  const catalog = MODELS[state.currentRuntime];
  const maxMB = maxModelMBFor(state.currentRuntime, state.hasWebGPU);
  log('system', 'available models (' + state.currentRuntime + '):');
  // Pre-fetch cached set in parallel for each model
  const cachedFlags = await Promise.all(
    catalog.map((m) => isModelCached(state.currentRuntime, m.value).catch(() => false))
  );
  for (let i = 0; i < catalog.length; i++) {
    const m = catalog[i];
    const marker = (i === state.currentModelIndex) ? ' *' : '';
    const tags = m.tags ? ' [' + m.tags.join(',') + ']' : '';
    const custom = m.custom ? ' [custom]' : '';
    const cached = cachedFlags[i] ? ' [cached]' : '';
    const mb = parseSizeMB(m.size);
    const heavy = (mb && maxMB && mb > maxMB) ? ' [heavy]' : '';
    logRaw('  ' + (i + 1) + '. ' + m.name + ' (' + m.size + ')' + tags + custom + cached + heavy + marker);
  }
  logRaw('');
  log('system', 'type /model <number> to switch, /cache to manage cached');
  logRaw('');
}

function exportConversation() {
  let md = '# lllm.sh Chat Export\n\n';
  for (const m of state.messages) {
    if (m.role === 'system') continue;
    const label = m.role === 'user' ? 'User' : 'Assistant';
    md += '## ' + label + '\n' + m.content + '\n\n';
  }
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chat-' + new Date().toISOString().slice(0, 10) + '.md';
  a.click();
  URL.revokeObjectURL(url);
  log('system', 'conversation exported.');
}

export async function handleCommand(input) {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case '/help':
      showHelp();
      break;

    case '/load':
      if (state.ready) { log('system', 'model already loaded.'); break; }
      if (state.generating) { log('error', 'busy.'); break; }
      await loadModel();
      break;

    case '/model':
      if (arg) {
        if (arg.startsWith('http://') || arg.startsWith('https://')) {
          await loadCustomGGUF(arg);
        } else if (arg.startsWith('url ') || arg.startsWith('url\t')) {
          await loadCustomGGUF(arg.slice(4).trim());
        } else {
          const n = parseInt(arg, 10);
          if (isNaN(n) || n < 1) {
            log('error', 'usage: /model <number> or /model <url>');
          } else {
            await switchModel(n - 1);
          }
        }
      } else {
        await showModels();
      }
      break;

    case '/runtime':
      if (arg) {
        const rt = arg.toLowerCase() === 'webgpu' ? 'webgpu' : (arg.toLowerCase() === 'wllama' ? 'wllama' : arg.toLowerCase());
        await switchRuntime(rt);
      } else {
        log('system', 'current runtime: ' + state.currentRuntime + (state.hasWebGPU ? ' (WebGPU available)' : ' (WebGPU not available)'));
        log('system', 'use /runtime wllama or /runtime webgpu to switch');
      }
      break;

    case '/new': {
      createNewThread();
      terminal.innerHTML = '';
      log('system', 'new thread started. (#' + threads.length + ')');
      break;
    }

    case '/threads': {
      logRaw('');
      log('system', 'saved threads:');
      for (let i = 0; i < threads.length; i++) {
        const t = threads[i];
        const marker = (t.id === activeThreadId) ? ' *' : '';
        const turns = t.messages.filter(m => m.role !== 'system').length;
        logRaw('  ' + (i + 1) + '. ' + t.title + ' (' + turns + ' msgs)' + marker);
      }
      logRaw('');
      log('system', 'type /thread <number> to switch');
      logRaw('');
      break;
    }

    case '/thread': {
      if (!arg) {
        log('error', 'usage: /thread <number>');
        break;
      }
      const tn = parseInt(arg, 10);
      if (isNaN(tn) || tn < 1 || tn > threads.length) {
        log('error', 'invalid thread number. type /threads to see list.');
        break;
      }
      const target = threads[tn - 1];
      switchThread(target.id);
      terminal.innerHTML = '';
      log('system', 'switched to thread: ' + target.title);
      displayThread();
      break;
    }

    case '/delete': {
      if (!arg) {
        log('error', 'usage: /delete <number>');
        break;
      }
      const dn = parseInt(arg, 10);
      if (isNaN(dn) || dn < 1 || dn > threads.length) {
        log('error', 'invalid thread number.');
        break;
      }
      const deleted = threads.splice(dn - 1, 1)[0];
      if (deleted.id === activeThreadId) {
        if (threads.length === 0) createNewThread();
        else switchThread(threads[0].id);
        terminal.innerHTML = '';
        displayThread();
      }
      saveThreads();
      log('system', 'deleted: ' + deleted.title);
      break;
    }

    case '/reset':
      state.messages = [{ role: 'system', content: state.systemPrompt }];
      saveHistory();
      log('system', 'conversation cleared. model still loaded.');
      break;

    case '/clear':
      terminal.innerHTML = '';
      break;

    case '/export':
      exportConversation();
      break;

    case '/system': {
      if (arg) {
        state.systemPrompt = arg;
        localStorage.setItem('lllm-sh-system-prompt', state.systemPrompt);
        state.messages[0] = { role: 'system', content: state.systemPrompt };
        log('system', 'system prompt updated.');
        if (getActivePersonaName()) {
          log('system', 'note: persona "' + getActivePersonaName() + '" is active and overrides /system. type /persona off to use this prompt.');
        }
      } else {
        const active = getActivePersonaName();
        if (active) {
          log('system', 'persona "' + active + '" is active — its prompt is used instead of /system.');
          log('system', 'stored /system prompt (inactive):');
        } else {
          log('system', 'current system prompt:');
        }
        logRaw('  ' + state.systemPrompt);
        logRaw('');
        log('system', 'use /system <text> to change' + (active ? ', /persona off to deactivate persona' : ''));
      }
      break;
    }

    case '/perf':
      state.perfVisible = !state.perfVisible;
      log('system', 'performance stats ' + (state.perfVisible ? 'enabled' : 'disabled'));
      break;

    case '/bench':
      await runBenchmark();
      break;

    case '/diff':
      if (arg) {
        const nums = arg.split(/\s+/).map(s => parseInt(s, 10));
        if (nums.length === 2 && nums.every(n => !isNaN(n) && n >= 1)) {
          await runDiff(nums[0] - 1, nums[1] - 1);
        } else {
          log('error', 'usage: /diff <model1> <model2>');
        }
      } else {
        log('error', 'usage: /diff <model1> <model2> (use /model to see numbers)');
      }
      break;

    case '/regen':
    case '/retry':
      await regenerateLast();
      break;

    case '/stop':
      if (!state.generating) { log('system', 'not generating.'); break; }
      state.cancelRequested = true;
      if (state.abortController) state.abortController.abort();
      if (state.webgpuPipe && state.webgpuPipe.interruptGenerate) {
        try { state.webgpuPipe.interruptGenerate(); } catch (e) { console.warn('webgpu interrupt:', e); }
      }
      log('system', 'generation cancelled.');
      break;

    case '/sampling':
      log('system', 'sampling: temp=' + state.sampling.temp + ', top_p=' + state.sampling.top_p + ', seed=' + (state.sampling.seed ?? 'random'));
      break;

    case '/temp': {
      if (!arg) { log('system', 'temperature: ' + state.sampling.temp); break; }
      const v = parseFloat(arg);
      if (!Number.isFinite(v) || v < 0 || v > 2) { log('error', 'usage: /temp <0.0-2.0>'); break; }
      state.sampling.temp = v;
      localStorage.setItem('lllm-sh-temp', String(v));
      log('system', 'temperature set to ' + v);
      break;
    }

    case '/topp': {
      if (!arg) { log('system', 'top_p: ' + state.sampling.top_p); break; }
      const v = parseFloat(arg);
      if (!Number.isFinite(v) || v <= 0 || v > 1) { log('error', 'usage: /topp <0.0-1.0>'); break; }
      state.sampling.top_p = v;
      localStorage.setItem('lllm-sh-top-p', String(v));
      log('system', 'top_p set to ' + v);
      break;
    }

    case '/seed': {
      if (!arg) { log('system', 'seed: ' + (state.sampling.seed ?? 'random')); break; }
      if (arg === 'random' || arg === 'reset' || arg === 'clear') {
        state.sampling.seed = null;
        localStorage.removeItem('lllm-sh-seed');
        log('system', 'seed cleared (random)');
        break;
      }
      const n = parseInt(arg, 10);
      if (!Number.isFinite(n)) { log('error', 'usage: /seed <integer> | random'); break; }
      state.sampling.seed = n;
      localStorage.setItem('lllm-sh-seed', String(n));
      log('system', 'seed set to ' + n);
      break;
    }

    case '/memory': {
      const sub = parts[1];
      const rest = parts.slice(2).join(' ');
      if (!sub) {
        const items = loadMemory();
        logRaw('');
        log('system', 'memory items (' + items.length + '):');
        if (items.length === 0) logRaw('  (empty — type /memory add <text> to save a fact)');
        else items.forEach((m, i) => logRaw('  ' + (i + 1) + '. ' + m));
        logRaw('');
        break;
      }
      if (sub === 'add') {
        if (!rest) { log('error', 'usage: /memory add <text>'); break; }
        addMemory(rest);
        log('system', 'memory saved.');
        break;
      }
      if (sub === 'rm' || sub === 'remove' || sub === 'delete') {
        const n = parseInt(rest, 10);
        if (!Number.isFinite(n)) { log('error', 'usage: /memory rm <number>'); break; }
        const removed = removeMemory(n - 1);
        if (removed == null) log('error', 'invalid memory number.');
        else log('system', 'removed: ' + removed);
        break;
      }
      if (sub === 'clear') {
        clearMemory();
        log('system', 'all memory cleared.');
        break;
      }
      log('error', 'usage: /memory [add <t> | rm <n> | clear]');
      break;
    }

    case '/persona': {
      const sub = parts[1];
      const rest = parts.slice(2).join(' ');
      if (!sub) {
        const personas = loadPersonas();
        const active = getActivePersonaName();
        const names = Object.keys(personas);
        logRaw('');
        log('system', 'personas:');
        names.forEach((n, i) => {
          const marker = (n === active) ? ' *' : '';
          const builtin = isBuiltinPersona(n) ? ' [builtin]' : '';
          logRaw('  ' + (i + 1) + '. ' + n + builtin + marker);
        });
        logRaw('');
        if (active) {
          log('system', 'active: ' + active);
          logRaw('  ' + (personas[active] || '').slice(0, 200));
        } else {
          log('system', 'using /system prompt (no persona active)');
        }
        logRaw('');
        break;
      }
      if (sub === 'use') {
        if (!rest) { log('error', 'usage: /persona use <name | number>'); break; }
        const personas = loadPersonas();
        const names = Object.keys(personas);
        let target = rest;
        const asNum = parseInt(rest, 10);
        if (Number.isFinite(asNum) && asNum >= 1 && asNum <= names.length) target = names[asNum - 1];
        if (!(target in personas)) { log('error', 'unknown persona: ' + target); break; }
        setActivePersona(target);
        log('system', 'persona set to: ' + target);
        break;
      }
      if (sub === 'save') {
        if (!rest) { log('error', 'usage: /persona save <name>'); break; }
        if (!state.systemPrompt) { log('error', 'no /system prompt to save.'); break; }
        if (isBuiltinPersona(rest)) { log('error', 'cannot overwrite builtin: ' + rest); break; }
        const personas = loadPersonas();
        personas[rest] = state.systemPrompt;
        saveUserPersonas(personas);
        setActivePersona(rest);
        log('system', 'saved and activated persona: ' + rest);
        break;
      }
      if (sub === 'rm' || sub === 'remove' || sub === 'delete') {
        if (!rest) { log('error', 'usage: /persona rm <name>'); break; }
        if (isBuiltinPersona(rest)) { log('error', 'cannot delete builtin: ' + rest); break; }
        const personas = loadPersonas();
        if (!(rest in personas)) { log('error', 'unknown persona: ' + rest); break; }
        delete personas[rest];
        saveUserPersonas(personas);
        if (getActivePersonaName() === rest) setActivePersona(null);
        log('system', 'deleted persona: ' + rest);
        break;
      }
      if (sub === 'off' || sub === 'clear') {
        setActivePersona(null);
        log('system', 'persona deactivated.');
        break;
      }
      log('error', 'usage: /persona [use <name> | save <name> | rm <name> | off]');
      break;
    }

    case '/title': {
      if (!state.ready) { log('error', 'model not loaded yet.'); break; }
      log('system', 'generating title...');
      const before = (threads.find((t) => t.id === activeThreadId) || {}).title;
      await generateThreadTitle();
      const after = (threads.find((t) => t.id === activeThreadId) || {}).title;
      if (after && after !== before) log('system', 'title: ' + after);
      else log('system', 'no change.');
      break;
    }

    case '/find': {
      if (!arg) { log('error', 'usage: /find <text>'); break; }
      const results = searchThreads(arg);
      logRaw('');
      log('system', 'matches for "' + arg + '" (' + results.length + '):');
      if (results.length === 0) logRaw('  (no matches)');
      for (const r of results) {
        logRaw('  · [' + r.threadTitle + '] ' + r.role + ': …' + r.snippet.replace(/\n/g, ' ') + '…');
      }
      logRaw('');
      break;
    }

    case '/fork': {
      const keep = arg ? parseInt(arg, 10) : null;
      if (arg && (!Number.isFinite(keep) || keep < 0)) { log('error', 'usage: /fork [n]'); break; }
      const fork = forkActiveThread(keep);
      if (!fork) { log('error', 'no active thread to fork.'); break; }
      terminal.innerHTML = '';
      log('system', 'forked into new thread: ' + fork.title);
      displayThread();
      break;
    }

    case '/ctx': {
      if (arg) {
        if (arg.toLowerCase() === 'auto') {
          state.ctxSize = null;
          localStorage.removeItem('lllm-sh-ctx-size');
          log('system', 'context window: auto (per-device default). takes effect on next /load or /model.');
        } else {
          const n = parseInt(arg, 10);
          if (isNaN(n) || n < 256 || n > 32768) {
            log('error', 'usage: /ctx <256-32768> or /ctx auto');
            break;
          }
          state.ctxSize = n;
          localStorage.setItem('lllm-sh-ctx-size', String(n));
          log('system', 'context window: ' + n + ' tokens. takes effect on next /load or /model.');
          if (isIOS && n > 512) log('system', '⚠ iOS Safari may run out of memory above 512.');
        }
        break;
      }
      const c = getContextUsage();
      const pct = Math.round((c.used / c.limit) * 100);
      log('system', 'context: ' + c.used + '/' + c.limit + ' tokens (~' + pct + '%)');
      break;
    }

    case '/compact':
      await compactConversation();
      break;

    case '/voice':
      if (!isVoiceSupported()) { log('error', 'speech recognition not supported in this browser.'); break; }
      toggleVoice();
      break;

    case '/tts': {
      if (!isTTSSupported()) { log('error', 'TTS not supported in this browser.'); break; }
      const want = arg ? (arg === 'on' || arg === 'true' || arg === '1') : !isTTSEnabled();
      setTTSEnabled(want);
      if (!want) stopSpeaking();
      log('system', 'tts ' + (want ? 'enabled' : 'disabled'));
      break;
    }

    case '/cache': {
      const catalog = MODELS[state.currentRuntime];
      log('system', 'fetching cache info...');
      const cached = await listCachedModels(state.currentRuntime, catalog);
      logRaw('');
      log('system', 'cached models (' + state.currentRuntime + '):');
      if (cached.length === 0) {
        logRaw('  (none cached yet — type /load to download)');
      } else {
        let total = 0;
        for (const c of cached) {
          total += c.bytes;
          const num = c.index >= 0 ? (c.index + 1) + '. ' : '   ';
          const size = c.bytes ? ' (' + formatBytes(c.bytes) + ')' : '';
          logRaw('  ' + num + c.name + size);
        }
        if (total > 0) {
          logRaw('');
          log('system', 'total: ' + formatBytes(total));
        }
      }
      logRaw('');
      log('system', 'type /uncache <n> to delete, /uncache all to clear');
      logRaw('');
      break;
    }

    case '/uncache': {
      if (!arg) { log('error', 'usage: /uncache <number> | all'); break; }
      if (arg === 'all') {
        log('system', 'clearing all cached models for ' + state.currentRuntime + '...');
        try {
          await clearAllCache(state.currentRuntime);
          log('system', 'all caches cleared.');
        } catch (e) { log('error', 'clear failed: ' + e.message); }
        break;
      }
      const n = parseInt(arg, 10);
      const catalog = MODELS[state.currentRuntime];
      if (!Number.isFinite(n) || n < 1 || n > catalog.length) {
        log('error', 'invalid model number. type /model to see list.');
        break;
      }
      const m = catalog[n - 1];
      const wasActive = (n - 1) === state.currentModelIndex && state.ready;
      if (wasActive) {
        log('error', 'cannot delete the currently loaded model. switch first.');
        break;
      }
      try {
        const cached = await isModelCached(state.currentRuntime, m.value);
        if (!cached) { log('system', m.name + ' is not cached.'); break; }
        await deleteCachedModel(state.currentRuntime, m.value);
        log('system', 'deleted from cache: ' + m.name);
      } catch (e) { log('error', 'delete failed: ' + e.message); }
      break;
    }

    default:
      log('error', 'unknown command: ' + cmd + '. type /help for commands.');
      break;
  }
}
