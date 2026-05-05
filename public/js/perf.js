import { state, isIOS, isMobile } from './state.js';
import { log } from './terminal.js';

export const perf = { loadStart: 0, loadEnd: 0, genStart: 0, genTokens: 0 };

export function updatePerfMem() {
  let memStr = 'N/A';
  if (performance.memory) {
    const mb = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(0);
    const total = (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(0);
    memStr = mb + '/' + total + 'MB';
  }
  return memStr;
}

export function perfLoadDone() {
  perf.loadEnd = performance.now();
}

export function perfGenStart() {
  perf.genStart = performance.now();
  perf.genTokens = 0;
}

export function perfGenToken() {
  perf.genTokens++;
}

export function perfGenDone() {
  const elapsed = (performance.now() - perf.genStart) / 1000;
  const tps = perf.genTokens > 0 ? (perf.genTokens / elapsed).toFixed(1) : '?';
  if (state.perfVisible) {
    const loadSec = ((perf.loadEnd - perf.loadStart) / 1000).toFixed(1);
    log('system', 'perf: ' + perf.genTokens + ' tokens, ' + tps + ' tok/s, ' + elapsed.toFixed(1) + 's gen, ' + loadSec + 's load, mem=' + updatePerfMem() + ', ' + (isIOS ? 'iOS' : (isMobile ? 'Android' : 'Desktop')));
  }
}
