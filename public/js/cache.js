/* Unified cache helpers for both runtimes.
   - wllama: OPFS via wllama.cacheManager (delete by URL)
   - web-llm: IndexedDB/Cache API via deleteModelAllInfoInCache (delete by modelId) */

const WLLAMA_CDN_BASE = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/';
const WLLAMA_CONFIG = {
  'single-thread/wllama.wasm': WLLAMA_CDN_BASE + 'single-thread/wllama.wasm',
  'multi-thread/wllama.wasm': WLLAMA_CDN_BASE + 'multi-thread/wllama.wasm',
  'multi-thread/wllama.worker.mjs': WLLAMA_CDN_BASE + 'multi-thread/wllama.worker.mjs',
};

let cacheWllamaInstance = null;

async function getWllamaCacheManager() {
  if (cacheWllamaInstance) return cacheWllamaInstance.cacheManager;
  const { Wllama } = await import('https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/index.js');
  cacheWllamaInstance = new Wllama(WLLAMA_CONFIG, { useCache: true, allowOffline: true });
  return cacheWllamaInstance.cacheManager;
}

async function getWebllmCacheUtil() {
  return await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm');
}

export async function isModelCached(runtime, modelValue) {
  try {
    if (runtime === 'wllama') {
      const cm = await getWllamaCacheManager();
      const meta = await cm.getMetadata(modelValue);
      return !!meta;
    }
    if (runtime === 'webgpu') {
      const webllm = await getWebllmCacheUtil();
      return await webllm.hasModelInCache(modelValue);
    }
  } catch (e) { console.warn('isModelCached:', e); }
  return false;
}

export async function getCachedSize(runtime, modelValue) {
  try {
    if (runtime === 'wllama') {
      const cm = await getWllamaCacheManager();
      const list = await cm.list();
      const entry = list.find((e) => e.metadata && e.metadata.originalURL === modelValue);
      return entry ? entry.size : 0;
    }
    // web-llm doesn't expose per-model cache size easily
  } catch (e) { console.warn('getCachedSize:', e); }
  return 0;
}

export async function listCachedModels(runtime, catalog) {
  const result = [];
  if (runtime === 'wllama') {
    const cm = await getWllamaCacheManager();
    const list = await cm.list();
    for (const entry of list) {
      const url = entry.metadata && entry.metadata.originalURL;
      if (!url) continue;
      const idx = catalog.findIndex((m) => m.value === url);
      result.push({
        index: idx,
        name: idx >= 0 ? catalog[idx].name : (entry.name || url.split('/').pop()),
        url,
        bytes: entry.size,
      });
    }
  } else if (runtime === 'webgpu') {
    const webllm = await getWebllmCacheUtil();
    for (let i = 0; i < catalog.length; i++) {
      const m = catalog[i];
      try {
        if (await webllm.hasModelInCache(m.value)) {
          result.push({ index: i, name: m.name, url: m.value, bytes: 0 });
        }
      } catch (e) { console.debug('hasModelInCache failed for', m.value, e); }
    }
  }
  return result;
}

export async function deleteCachedModel(runtime, modelValue) {
  if (runtime === 'wllama') {
    const cm = await getWllamaCacheManager();
    await cm.delete(modelValue);
    return;
  }
  if (runtime === 'webgpu') {
    const webllm = await getWebllmCacheUtil();
    await webllm.deleteModelAllInfoInCache(modelValue);
    return;
  }
}

export async function clearAllCache(runtime) {
  if (runtime === 'wllama') {
    const cm = await getWllamaCacheManager();
    await cm.clear();
    return;
  }
  if (runtime === 'webgpu') {
    const webllm = await getWebllmCacheUtil();
    // No bulk-clear API; iterate the prebuilt list
    const cfg = webllm.prebuiltAppConfig;
    const ids = (cfg && cfg.model_list) ? cfg.model_list.map((r) => r.model_id) : [];
    for (const id of ids) {
      try {
        if (await webllm.hasModelInCache(id)) await webllm.deleteModelAllInfoInCache(id);
      } catch (e) { console.debug('clear webllm cache:', id, e); }
    }
  }
}

export function formatBytes(n) {
  if (!n || n < 0) return '?';
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + 'KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(0) + 'MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + 'GB';
}
