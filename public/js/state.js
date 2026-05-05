// Platform detection
export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isMobile = isIOS || /Android/i.test(navigator.userAgent) ||
  (window.innerWidth < 640 && 'ontouchstart' in window);

// DOM refs
export const terminal = document.getElementById('terminal');
export const chatInput = document.getElementById('chat-input');
export const headerStatus = document.getElementById('header-status');
export const copyToast = document.getElementById('copy-toast');

// Constants
export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant. Reply concisely and clearly. You can respond in Japanese if the user writes in Japanese.';

// Parse model size string ("~400MB", "~1.7GB") → MB number
export function parseSizeMB(s) {
  const m = String(s || '').match(/([\d.]+)\s*(GB|MB|KB)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const u = (m[2] || 'MB').toUpperCase();
  if (u === 'GB') return n * 1024;
  if (u === 'KB') return n / 1024;
  return n;
}

// Heuristic device capability — used to flag models that likely won't run.
// Numbers are quantized model file size in MB; actual RAM use is ~1.2-1.5x.
export function maxModelMBFor(runtime, hasWebGPU) {
  if (runtime === 'webgpu') return hasWebGPU ? 4096 : 0;
  // wllama / WASM
  if (isIOS) return 1500;        // Safari WASM heap ~2GB hard limit
  if (isMobile) return 2500;     // Android Chrome more generous
  return 6144;                   // Desktop WASM has larger headroom
}

export function deviceLabel() {
  if (isIOS) return 'iOS';
  if (isMobile) return 'mobile';
  return 'desktop';
}

// Mutable state - use an object so mutations are visible across modules
export const state = {
  systemPrompt: localStorage.getItem('lllm-sh-system-prompt') || DEFAULT_SYSTEM_PROMPT,
  messages: [{ role: 'system', content: localStorage.getItem('lllm-sh-system-prompt') || DEFAULT_SYSTEM_PROMPT }],
  ready: false,
  generating: false,
  cancelRequested: false,
  abortController: null,
  wllamaInstance: null,
  webgpuPipe: null,
  currentRuntime: localStorage.getItem('lllm-sh-runtime') || 'wllama',
  currentModelIndex: (() => {
    const n = parseInt(localStorage.getItem('lllm-sh-model-index'), 10);
    return Number.isFinite(n) && n >= 0 ? n : 1;
  })(),
  perfVisible: false,
  hasWebGPU: false,
  sampling: (() => {
    const t = parseFloat(localStorage.getItem('lllm-sh-temp'));
    const p = parseFloat(localStorage.getItem('lllm-sh-top-p'));
    const sRaw = localStorage.getItem('lllm-sh-seed');
    return {
      temp: Number.isFinite(t) ? t : 0.7,
      top_p: Number.isFinite(p) ? p : 0.9,
      seed: sRaw != null ? parseInt(sRaw, 10) : null,
    };
  })(),
};
