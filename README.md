# lllm.sh

```
  _ _ _ _ _         _
 | | | | | |_ __ __| |__
 | | | | | | '  \(_-< '  \
 |_|_|_|_|_|_|_|_/__/_||_|
   browser LLM terminal
```

A serverless, terminal-style LLM chat client that runs **entirely in the browser**. No backend, no API keys, no data leaving your device — the model weights are downloaded once and inference happens locally via WebAssembly or WebGPU.

## Features

- **CLI-style UI** — every action is a slash command (`/help`, `/model`, `/runtime`, `/threads`)
- **Real CLI ergonomics** — input history (↑/↓), tab completion for slash commands, Esc to cancel generation
- **Two runtimes** — pick the one that fits your device:
  - **wllama** (CPU/WASM via [@wllama/wllama](https://github.com/ngxson/wllama)) — works everywhere, including iOS Safari
  - **web-llm** (WebGPU via [@mlc-ai/web-llm](https://github.com/mlc-ai/web-llm)) — much faster on machines with WebGPU
- **Multiple models** — SmolLM2/3, Qwen2.5 (incl. Coder), Qwen3, Gemma 2/3, Llama 3.2, Phi-3.5/4, Mistral 7B, **DeepSeek-R1-Distill** (reasoning), and more
- **Custom GGUF** — load any GGUF from a URL with `/model <url>` (wllama runtime); persisted across sessions
- **Reasoning model support** — `<think>...</think>` blocks rendered as a dimmed thinking trace
- **Markdown rendering** — fenced code blocks, inline code, bold are styled in the terminal aesthetic
- **Sampling controls** — `/temp`, `/topp`, `/seed` for fine-tuning generation
- **Regenerate** — `/regen` to retry the last reply with a fresh sample
- **Threads** — multiple conversations stored in `localStorage`, with `/find`, `/fork`, and LLM-generated `/title`
- **Long-term memory** — `/memory add` saves facts that get auto-injected into the system prompt every turn
- **Personas** — preset system prompts (`coder` / `writer` / `tutor` / custom), swap with `/persona use`
- **Code artifacts** — JS / HTML / SVG fenced code blocks get a ▶ run/preview button into a sandboxed iframe
- **File attachments** — tap the 📎 button (or drag any text/code file onto the window on desktop) to quote it into your next message
- **Voice + TTS** — `/voice` for speech-to-text input, `/tts` to read replies aloud
- **Auto-compaction** — `/compact` summarizes older turns when context fills up
- **Cache management** — `/cache` shows what's downloaded, `/uncache <n>` deletes a specific model
- **Benchmark + diff** — `/bench` measures tok/s on your device; `/diff <a> <b>` compares two models on the same prompt
- **PWA** — installable, fully offline-capable after the model is cached
- **CRT terminal aesthetic** — green-on-black, scanlines, glitch text shadow, VT323 font

## Quickstart

```bash
git clone https://github.com/shonocode/lllm-sh.git
cd lllm-sh
npm install
npm run dev
```

Open `http://localhost:8788`. The default model (Qwen2.5-0.5B, ~400MB) is **not** loaded automatically — type `/load` to download it, or `/model` to pick a smaller one first. Subsequent loads are instant since the model is cached in IndexedDB.

## Commands

```
/help              show all commands
/load              load (download if needed) the selected model
/model             list available models
/model <n>         switch to model number n
/model <url>       load a custom GGUF from URL (wllama only)
/runtime           show current runtime
/runtime wllama    switch to wllama (CPU/WASM)
/runtime webgpu    switch to web-llm (WebGPU)
/new               start a new thread
/threads           list saved threads
/thread <n>        switch to thread n
/delete <n>        delete thread n
/reset             clear current conversation (model stays loaded)
/clear             clear terminal output
/export            download the conversation as Markdown
/system            show current system prompt
/system <text>     set a new system prompt
/perf              toggle performance stats after each generation
/bench             run a built-in benchmark
/diff <a> <b>      compare two models on the same prompt
/regen             regenerate the last assistant reply
/stop              cancel the current generation (also Esc)
/sampling          show current sampling settings
/temp <n>          set temperature (0.0-2.0)
/topp <n>          set top_p (0.0-1.0)
/seed <n>          set seed (or "random" to clear)
/cache             list cached models with sizes
/uncache <n>       delete cached model n (or "all")
/memory            list long-term memory items
/memory add <t>    add a memory item
/memory rm <n>     remove memory n
/memory clear      clear all memory
/persona           list available personas
/persona use <n>   activate persona n (or by name)
/persona save <n>  save current /system prompt as a persona
/persona off       deactivate persona
/voice             toggle speech-to-text input
/tts               toggle TTS read-aloud of AI replies
/ctx               show context-window usage
/ctx <n|auto>      set context window for next load (smaller = less memory)
/compact           summarize older turns to free up context
/find <text>       search across all threads
/fork [n]          fork the current thread (optionally up to message n)
/title             generate a fresh title for this thread
```

`↑`/`↓` to recall input history, `Tab` to complete a slash command. Tap the 📎 button (or drag a file onto the window on desktop) to attach text/code files. Anything not starting with `/` is sent as a chat message.

## Deploy

The project is a static site under `public/` and deploys cleanly to Cloudflare Pages:

```bash
npm run deploy
```

Or drop `public/` onto any static host (Netlify, Vercel, GitHub Pages, etc.) — there is no server-side component.

## Tech notes

- **Module layout** — pure ES modules under `public/js/` (`app`, `state`, `terminal`, `runtime`, `commands`, `threads`, `bench`, `perf`, `models`); no build step
- **Service worker** — network-first for app shell, cache-first for CDN assets, bypass for HuggingFace model downloads (wllama manages those in IndexedDB itself)
- **iOS quirks** — context window and batch sizes are reduced on iOS to avoid Safari memory limits; history is trimmed more aggressively
- **Multi-thread wllama** — `public/_headers` sets COOP/COEP (`credentialless`) so the page is cross-origin isolated and wllama can use `SharedArrayBuffer` threads. On other static hosts, set the same two headers or wllama runs single-threaded (the load log shows which)
- **Split GGUF** — wllama reads each file into one ArrayBuffer (~2GB cap). For bigger models, split with `llama-gguf-split --split-max-size 512M` and pass the first shard (`...-00001-of-0000N.gguf`) to `/model <url>`; wllama fetches the remaining shards automatically
- **Context window** — `/ctx <n>` sets `n_ctx` (wllama) / `context_window_size` (web-llm); the KV cache scales linearly with it. Mobile WebGPU defaults to 2048
- **KV cache quantization** — wllama loads with a `q8_0` KV cache + flash attention (~half the KV memory of f16), falling back to f16 if the model rejects it
- **WebGPU detection + fallback** — if WebGPU is requested but unavailable or fails, the runtime falls back to wllama automatically

## License

MIT — see [LICENSE](LICENSE).
