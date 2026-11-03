const CUSTOM_KEY = 'lllm-sh-custom-wllama';

export function loadCustomModels() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch { return []; }
}

/** @param {import('./state.js').ModelEntry[]} customs */
export function saveCustomModels(customs) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(customs));
}

/** @type {{ wllama: import('./state.js').ModelEntry[], webgpu: import('./state.js').ModelEntry[] }} */
export const MODELS = {
  wllama: [
    // Tiny (≤500MB)
    { value: 'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_S.gguf', name: 'SmolLM2-360M', size: '~260MB' },
    { value: 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf', name: 'Qwen3-0.6B', size: '~400MB', tags: ['reasoning'] },
    { value: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf', name: 'Qwen2.5-0.5B', size: '~400MB' },
    // Small (≤1.5GB)
    { value: 'https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf', name: 'Gemma-3-1B', size: '~750MB' },
    { value: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf', name: 'DeepSeek-R1-Qwen-1.5B', size: '~1.1GB', tags: ['reasoning'] },
    { value: 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf', name: 'Qwen3-1.7B', size: '~1.1GB', tags: ['reasoning'] },
    { value: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf', name: 'Qwen2.5-1.5B', size: '~1GB' },
    { value: 'https://huggingface.co/bartowski/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf', name: 'Qwen2.5-Coder-1.5B', size: '~1GB', tags: ['code'] },
    // Medium (≤2GB — wllama caps a single GGUF file at 2GB; bigger models need
    // a split GGUF via /model <url-to-...-00001-of-0000N.gguf>, or WebGPU)
    { value: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf', name: 'Gemma-2-2B', size: '~1.7GB' },
    { value: 'https://huggingface.co/ggml-org/SmolLM3-3B-GGUF/resolve/main/SmolLM3-3B-Q4_K_M.gguf', name: 'SmolLM3-3B', size: '~1.9GB' },
    { value: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf', name: 'Llama-3.2-3B', size: '~1.9GB' },
    { value: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf', name: 'Qwen2.5-3B', size: '~1.9GB' },
    ...loadCustomModels().map((m) => ({ ...m, custom: true })),
  ],
  // `value` is the exact model_id from web-llm's prebuiltAppConfig (version
  // pinned in WEBLLM_CDN, runtime.js). `size` here is its vram_required_MB, not
  // download size — that's what decides whether it fits. q4f16 ids fall back
  // to q4f32 at load time on GPUs without shader-f16.
  webgpu: [
    // Tiny (<1.5GB VRAM)
    { value: 'SmolLM2-360M-Instruct-q4f16_1-MLC', name: 'SmolLM2-360M', size: '~380MB' },
    { value: 'gemma3-1b-it-q4f16_1-MLC', name: 'Gemma-3-1B', size: '~710MB' },
    { value: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama-3.2-1B', size: '~880MB' },
    { value: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5-0.5B', size: '~950MB' },
    { value: 'Qwen3-0.6B-q4f16_1-MLC', name: 'Qwen3-0.6B', size: '~1.4GB', tags: ['reasoning'] },
    // Small (<2.5GB VRAM)
    { value: 'Qwen3.5-0.8B-q4f16_1-MLC', name: 'Qwen3.5-0.8B', size: '~1.6GB' },
    { value: 'DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC', name: 'DeepSeek-R1-Qwen-1.5B', size: '~1.6GB', tags: ['reasoning'] },
    { value: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5-1.5B', size: '~1.6GB' },
    { value: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5-Coder-1.5B', size: '~1.6GB', tags: ['code'] },
    { value: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma-2-2B', size: '~1.9GB' },
    { value: 'gemma-2-2b-jpn-it-q4f16_1-MLC', name: 'Gemma-2-2B-JP', size: '~1.9GB' },
    { value: 'Qwen3-1.7B-q4f16_1-MLC', name: 'Qwen3-1.7B', size: '~2GB', tags: ['reasoning'] },
    { value: 'Qwen3.5-2B-q4f16_1-MLC', name: 'Qwen3.5-2B', size: '~2.2GB' },
    { value: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama-3.2-3B', size: '~2.3GB' },
    { value: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', name: 'Qwen2.5-3B', size: '~2.5GB' },
    // Medium (<4GB VRAM)
    { value: 'gemma-4-E2B-it-q4f16_1-MLC', name: 'Gemma-4-E2B', size: '~3.4GB' },
    { value: 'Qwen3-4B-q4f16_1-MLC', name: 'Qwen3-4B', size: '~3.4GB', tags: ['reasoning'] },
    { value: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi-3.5-mini', size: '~3.7GB' },
    { value: 'Qwen3.5-4B-q4f16_1-MLC', name: 'Qwen3.5-4B', size: '~3.9GB' },
    // Large (desktop GPU)
    { value: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC', name: 'Mistral-7B', size: '~4.6GB' },
    { value: 'Llama-3-8B-Instruct-q4f16_1-MLC-1k', name: 'Llama-3-8B', size: '~4.6GB' },
  ],
};
