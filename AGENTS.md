# Agent guide for lllm.sh

A pure-browser LLM chat client. Read this before changing anything — these are
the constraints that aren't obvious from the code.

## Hard rules

- **No build step.** Everything is vanilla ES modules served straight from
  `public/`. Do not add Vite, webpack, TypeScript, or any compilation step.
  External libs (`@wllama/wllama`, `@mlc-ai/web-llm`) load via dynamic
  `import('https://cdn.jsdelivr.net/...')` at runtime.
- **No backend.** This is a serverless static site. Any feature that needs a
  server (web search, OAuth, sync) must be either skipped or BYOK-style with a
  user-provided endpoint URL — never silently introduce a proxy.
- **XSS safety.** AI output and any user-supplied text **must** go through
  `textContent` or `document.createElement` — never `innerHTML = <variable>`.
  `el.innerHTML = ''` (clear-only) is the one allowed form.
- **Two runtimes, one UI.** Every model-related feature must work on both
  `wllama` (CPU/WASM, model identified by GGUF URL) and `webgpu` (web-llm,
  model identified by MLC model_id). If a feature only works on one, gate it
  behind a runtime check and degrade gracefully.

## Project layout

```
public/
  index.html              # single page, minimal DOM scaffold
  style.css               # CRT terminal aesthetic, single file
  sw.js                   # service worker — see "precache rule" below
  manifest.json           # PWA manifest
  js/
    app.js                # bootstrap: input handler, init, PWA banner
    state.js              # shared state object + DOM refs + DEFAULT_SYSTEM_PROMPT
    models.js             # MODELS catalog (wllama / webgpu) + custom-model storage
    runtime.js            # load/unload, generate, regen, compact, title gen
    terminal.js           # log, logAi, markdown rendering, artifacts
    commands.js           # slash command dispatcher + COMMANDS list
    threads.js            # multi-thread state (localStorage), search, fork
    memory.js             # /memory and /persona — system-prompt composition
    voice.js              # SpeechRecognition + speechSynthesis
    attachments.js        # drag-drop + 📎 file picker
    cache.js              # unified OPFS / IndexedDB cache mgmt
    bench.js              # /bench and /diff
    perf.js               # tok/s + memory perf telemetry
```

## Conventions

- **localStorage keys** are namespaced `lllm-sh-*`. Don't use other prefixes.
- **System prompt composition.** `state.systemPrompt` is the *base*. Active
  persona overrides it. Memory items are appended. Always call
  `syncSystemPrompt()` (memory.js) right before generation — never mutate
  `state.messages[0]` directly from new code paths.
- **Threads own messages.** `state.messages` and `thread.messages` share the
  same array reference. After replacing `state.messages = [...]`, call
  `saveHistory()` so the active thread's `messages` ref points at the new
  array. Don't `splice` if a fresh array is what you want.
- **Cancellation.** Long ops use `state.abortController` (wllama) or
  `state.webgpuPipe.interruptGenerate()` (web-llm). Both Esc and the Enter key
  during generation trigger cancellation in `app.js`. Title gen and compact
  pass `cancellable: false` deliberately — short bounded calls.
- **Model selection persists.** `lllm-sh-runtime` and `lllm-sh-model-index` are
  written from `runtime.js` (`persistRuntimeSelection`). Custom GGUFs are
  rehydrated at module-load time in `models.js`.

## Things that bite

- **Service worker precache.** When you add a new JS module under `public/js/`,
  add it to `PRECACHE_URLS` in `public/sw.js`, *and* bump `CACHE_NAME`.
  Forgetting this breaks offline mode for returning users.
- **iOS Safari WASM.** Practical model-size limit is ~1.5GB. The
  `maxModelMBFor()` heuristic in `state.js` flags heavy models with `[heavy]`
  in `/model` listings. Don't lift the iOS-specific defaults
  (`n_ctx=512`, `n_batch=64`, `maxTokens=256`) without testing on a real
  iPhone.
- **Markdown post-render.** Tokens stream as plain text into `currentAiContent`.
  Markdown rendering only runs in `finishAiLine()` — and only if the regex
  detects fences/inline code/bold/`<think>`. Streaming + intermediate re-render
  would tank performance.
- **`</script>` in JS artifacts.** `terminal.js` builds an iframe `srcdoc`
  containing user code. Anything that produces a literal `</script>` (even
  inside a string) inside the wrapping `<script>` will terminate it early.
  Use the `safeCodeLiteral` pattern that escapes `</script>` and `</!--`.

## How to add things

- **A new slash command:** add the literal to `COMMANDS` array in
  `commands.js` (drives Tab completion), add the `case '/cmd':` branch, add a
  line to `showHelp()`, and update README's command list.
- **A new wllama model:** push to `MODELS.wllama` in `models.js` with
  `{ value: <gguf url>, name, size: '~XGB', tags?: ['reasoning', 'code'] }`.
  No code changes needed — `showModels()` will pick it up.
- **A new web-llm model:** push to `MODELS.webgpu` with `value` set to the
  exact MLC `model_id` from web-llm's `prebuiltAppConfig`.
- **A new module:** create the file, add it to `PRECACHE_URLS` in `sw.js`,
  bump `CACHE_NAME`. Cross-import only what you need to keep the dep graph
  shallow (state ↔ terminal ↔ runtime ↔ commands is the typical path).

## Out of scope (intentionally)

- Build tooling, TypeScript, JSX, bundlers
- Backend / server / proxy of any kind
- API keys for external services baked into the code
- Image/video generation models (too heavy for browser)
- Vision in wllama (upstream blocker — track ngxson/wllama for `mtmd` support)
