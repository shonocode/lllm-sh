import { state, isIOS, isMobile, chatInput } from './state.js';
import { MODELS } from './models.js';
import { log, logRaw, startAiLine, appendAiToken, finishAiLine } from './terminal.js';
import { updatePerfMem } from './perf.js';
import { loadModel, runWllamaCompletion, unloadCurrentModel } from './runtime.js';

export async function runBenchmark() {
  if (!state.ready) { log('error', 'model not loaded.'); return; }
  if (state.generating) { log('error', 'already generating.'); return; }

  const benchPrompt = 'Explain what a CPU is in exactly 3 sentences.';
  log('system', 'running benchmark...');
  log('system', 'prompt: "' + benchPrompt + '"');

  state.generating = true;
  chatInput.disabled = true;
  startAiLine();

  const benchMessages = [
    { role: 'system', content: 'You are a helpful assistant. Be concise.' },
    { role: 'user', content: benchPrompt },
  ];

  const t0 = performance.now();
  let firstTokenTime = 0;
  let tokenCount = 0;
  let fullText = '';

  try {
    if (state.webgpuPipe) {
      const completion = await state.webgpuPipe.chat.completions.create({
        stream: true, messages: benchMessages, max_tokens: 128, temperature: 0.7,
      });
      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          if (tokenCount === 0) firstTokenTime = performance.now() - t0;
          tokenCount++;
          appendAiToken(delta);
          fullText += delta;
        }
      }
    } else if (state.wllamaInstance) {
      fullText = await runWllamaCompletion(state.wllamaInstance, benchMessages, {
        maxTokens: 128,
        cancellable: false,
        onToken: (decoded) => {
          if (tokenCount === 0) firstTokenTime = performance.now() - t0;
          tokenCount++;
          appendAiToken(decoded);
        },
      });
    }
  } catch (err) {
    log('error', 'bench error: ' + err.message);
  }

  const totalTime = (performance.now() - t0) / 1000;
  const tps = tokenCount > 0 ? (tokenCount / totalTime).toFixed(1) : '?';
  const ttft = (firstTokenTime / 1000).toFixed(2);

  finishAiLine();
  logRaw('');
  log('system', '── benchmark results ──');
  log('system', '  model:    ' + (MODELS[state.currentRuntime][state.currentModelIndex]?.name || 'custom'));
  log('system', '  runtime:  ' + state.currentRuntime);
  log('system', '  tokens:   ' + tokenCount);
  log('system', '  speed:    ' + tps + ' tok/s');
  log('system', '  TTFT:     ' + ttft + 's');
  log('system', '  total:    ' + totalTime.toFixed(1) + 's');
  log('system', '  memory:   ' + updatePerfMem());
  log('system', '  platform: ' + (isIOS ? 'iOS' : (isMobile ? 'Android' : 'Desktop')));
  logRaw('');

  state.generating = false;
  chatInput.disabled = false;
  chatInput.focus();
}

export async function runDiff(idxA, idxB) {
  if (state.generating) { log('error', 'already generating.'); return; }
  if (state.currentRuntime !== 'wllama') {
    log('error', '/diff only works with wllama runtime (model swapping needed).');
    return;
  }
  const catalog = MODELS.wllama;
  if (idxA >= catalog.length || idxB >= catalog.length || idxA < 0 || idxB < 0) {
    log('error', 'invalid model number. type /model to see list.');
    return;
  }

  const modelA = catalog[idxA];
  const modelB = catalog[idxB];
  const diffPrompt = 'What is the meaning of life? Answer in 2-3 sentences.';

  log('system', 'comparing ' + modelA.name + ' vs ' + modelB.name + '...');
  log('system', 'prompt: "' + diffPrompt + '"');
  logRaw('');

  state.generating = true;
  chatInput.disabled = true;

  const results = [];

  for (const [label, idx, model] of [['A', idxA, modelA], ['B', idxB, modelB]]) {
    log('system', 'loading ' + model.name + '...');
    await unloadCurrentModel();
    state.currentModelIndex = idx;
    await loadModel();

    if (!state.wllamaInstance) {
      log('error', 'failed to load ' + model.name);
      results.push({ name: model.name, text: '(failed)', tokens: 0, tps: 0, time: 0 });
      continue;
    }

    const diffMessages = [
      { role: 'system', content: 'You are a helpful assistant. Be concise.' },
      { role: 'user', content: diffPrompt },
    ];
    let tokenCount = 0;
    const t0 = performance.now();

    const line = startAiLine();
    const pfx = line.querySelector('.prefix');
    if (pfx) pfx.textContent = 'ai[' + label + ']>';

    const fullText = await runWllamaCompletion(state.wllamaInstance, diffMessages, {
      maxTokens: 128,
      cancellable: false,
      onToken: (decoded) => { tokenCount++; appendAiToken(decoded); },
    });
    finishAiLine();

    const elapsed = (performance.now() - t0) / 1000;
    const tps = tokenCount > 0 ? (tokenCount / elapsed).toFixed(1) : '?';
    results.push({ name: model.name, text: fullText, tokens: tokenCount, tps, time: elapsed.toFixed(1) });
  }

  logRaw('');
  log('system', '── comparison results ──');
  for (const r of results) {
    log('system', '  ' + r.name + ': ' + r.tokens + ' tokens, ' + r.tps + ' tok/s, ' + r.time + 's');
  }
  logRaw('');

  state.generating = false;
  chatInput.disabled = false;
  chatInput.focus();
}
