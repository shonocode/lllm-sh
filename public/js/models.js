const CUSTOM_KEY = 'lllm-sh-custom-wllama';

export function loadCustomModels() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch { return []; }
}

export function saveCustomModels(customs) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(customs));
}

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
    // Medium (≤2.5GB)
    { value: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf', name: 'Gemma-2-2B', size: '~1.7GB' },
    { value: 'https://huggingface.co/ggml-org/SmolLM3-3B-GGUF/resolve/main/SmolLM3-3B-Q4_K_M.gguf', name: 'SmolLM3-3B', size: '~2GB' },
    { value: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf', name: 'Llama-3.2-3B', size: '~2GB' },
    { value: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf', name: 'Qwen2.5-3B', size: '~2GB' },
    { value: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf', name: 'Qwen3-4B', size: '~2.5GB', tags: ['reasoning'] },
    { value: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf', name: 'Phi-3.5-mini', size: '~2.4GB' },
    { value: 'https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf', name: 'Phi-4-mini', size: '~2.5GB' },
    // Large (≥3GB)
    { value: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-IQ4_XS.gguf', name: 'Mistral-7B', size: '~3.9GB' },
    ...loadCustomModels().map((m) => ({ ...m, custom: true })),
  ],
  webgpu: [
    // Tiny
    { value: 'SmolLM2-360M-Instruct-q4f16_1-MLC', name: 'SmolLM2-360M', size: '~250MB' },
    { value: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5-0.5B', size: '~300MB' },
    { value: 'Qwen3-0.6B-q4f16_1-MLC', name: 'Qwen3-0.6B', size: '~350MB', tags: ['reasoning'] },
    // Small
    { value: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC', name: 'TinyLlama-1.1B', size: '~700MB' },
    { value: 'DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC', name: 'DeepSeek-R1-Qwen-1.5B', size: '~900MB', tags: ['reasoning'] },
    { value: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5-1.5B', size: '~900MB' },
    { value: 'Qwen3-1.7B-q4f16_1-MLC', name: 'Qwen3-1.7B', size: '~1GB', tags: ['reasoning'] },
    { value: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma-2-2B', size: '~1.3GB' },
    { value: 'gemma-2-2b-jpn-it-q4f16_1-MLC', name: 'Gemma-2-2B-JP', size: '~1.3GB' },
    // Medium
    { value: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama-3.2-3B', size: '~1.8GB' },
    { value: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', name: 'Qwen2.5-3B', size: '~1.8GB' },
    { value: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi-3.5-mini', size: '~1.9GB' },
    { value: 'Qwen3-4B-q4f16_1-MLC', name: 'Qwen3-4B', size: '~2.4GB', tags: ['reasoning'] },
    // Large
    { value: 'Llama-3-8B-Instruct-q4f16_1-MLC-1k', name: 'Llama-3-8B', size: '~3.2GB' },
    { value: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC', name: 'Mistral-7B', size: '~3.3GB' },
  ],
};
