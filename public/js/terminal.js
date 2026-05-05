import { terminal, headerStatus } from './state.js';

let currentAiLine = null;
let currentAiContent = null;
let currentAiText = '';

/* Minimal markdown renderer: fenced code blocks, inline code, bold, <think>...</think>.
   Built with createElement (no innerHTML) for XSS safety. */
function renderInline(text) {
  const frag = document.createDocumentFragment();
  let i = 0;
  let buf = '';
  const flush = () => { if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ''; } };
  while (i < text.length) {
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        flush();
        const c = document.createElement('code');
        c.textContent = text.slice(i + 1, end);
        frag.appendChild(c);
        i = end + 1;
        continue;
      }
    }
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > i + 1) {
        flush();
        const b = document.createElement('strong');
        b.textContent = text.slice(i + 2, end);
        frag.appendChild(b);
        i = end + 2;
        continue;
      }
    }
    buf += text[i++];
  }
  flush();
  return frag;
}

const RUNNABLE_LANGS = new Set(['js', 'javascript', 'html', 'svg']);

function buildArtifactIframe(lang, code) {
  const iframe = document.createElement('iframe');
  iframe.className = 'artifact-frame';
  if (lang === 'svg') {
    iframe.sandbox = '';
    iframe.srcdoc = '<!doctype html><html><head><style>body{margin:0;background:#000;color:#32ff00;display:flex;align-items:center;justify-content:center;min-height:100vh}</style></head><body>' + code + '</body></html>';
  } else if (lang === 'html') {
    iframe.sandbox = 'allow-scripts';
    iframe.srcdoc = code;
  } else { // js / javascript
    iframe.sandbox = 'allow-scripts';
    // Escape sequences that would prematurely terminate the wrapping <script> tag.
    const safeCodeLiteral = JSON.stringify(code).replace(/<\/(script|!--)/gi, '<\\/$1');
    const closeScript = '<' + '/script>';
    const wrapped = `<!doctype html><html><head><style>body{margin:0;font-family:monospace;background:#000;color:#32ff00;padding:8px;font-size:12px;line-height:1.4}#o{margin:0;white-space:pre-wrap;word-break:break-word}</style></head><body><pre id="o"></pre><script>
(function(){
const out = document.getElementById('o');
function fmt(a){ try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); } catch(_){ return String(a); } }
function w(k, args){ out.textContent += '[' + k + '] ' + Array.from(args).map(fmt).join(' ') + '\\n'; }
const _console = { log: function(){ w('log', arguments); }, error: function(){ w('error', arguments); }, warn: function(){ w('warn', arguments); }, info: function(){ w('info', arguments); } };
window.addEventListener('error', function(e){ w('error', [e.message]); });
window.addEventListener('unhandledrejection', function(e){ w('error', [e.reason]); });
try {
  (new Function('console', ${safeCodeLiteral}))(_console);
} catch (e) { w('error', [e.message]); }
})();
` + closeScript + '</body></html>';
    iframe.srcdoc = wrapped;
  }
  return iframe;
}

function makeArtifact(lang, code) {
  const wrap = document.createElement('div');
  wrap.className = 'artifact';
  const pre = document.createElement('pre');
  pre.className = 'codeblock';
  pre.dataset.lang = lang;
  pre.textContent = code;
  wrap.appendChild(pre);

  const action = (lang === 'js' || lang === 'javascript') ? 'run' : 'preview';
  const btn = document.createElement('button');
  btn.className = 'artifact-action';
  btn.textContent = '▶ ' + action;
  btn.addEventListener('click', () => {
    const existing = wrap.querySelector('.artifact-output');
    if (existing) existing.remove();
    const out = document.createElement('div');
    out.className = 'artifact-output';
    out.appendChild(buildArtifactIframe(lang, code));
    wrap.appendChild(out);
    btn.textContent = '↻ rerun';
  });
  wrap.appendChild(btn);
  return wrap;
}

function renderBlocks(text) {
  const frag = document.createDocumentFragment();
  const fenced = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = fenced.exec(text)) !== null) {
    if (m.index > last) frag.appendChild(renderInline(text.slice(last, m.index)));
    const lang = (m[1] || '').toLowerCase();
    const code = m[2].replace(/\n$/, '');
    if (RUNNABLE_LANGS.has(lang)) {
      frag.appendChild(makeArtifact(lang, code));
    } else {
      const pre = document.createElement('pre');
      pre.className = 'codeblock';
      if (m[1]) pre.dataset.lang = m[1];
      pre.textContent = code;
      frag.appendChild(pre);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(renderInline(text.slice(last)));
  return frag;
}

function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  const think = /<think>([\s\S]*?)(?:<\/think>|$)/g;
  let last = 0;
  let m;
  while ((m = think.exec(text)) !== null) {
    if (m.index > last) frag.appendChild(renderBlocks(text.slice(last, m.index)));
    const t = document.createElement('span');
    t.className = 'think';
    t.appendChild(renderBlocks(m[1]));
    frag.appendChild(t);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(renderBlocks(text.slice(last)));
  return frag;
}

export function log(prefix, text) {
  const line = document.createElement('div');
  line.className = 'line';
  if (prefix) {
    const pfx = document.createElement('span');
    pfx.className = 'prefix ' + prefix;
    pfx.textContent = prefix + '>';
    line.appendChild(pfx);
    const content = document.createElement('span');
    content.className = 'content';
    content.textContent = ' ' + text;
    line.appendChild(content);
  } else {
    line.textContent = text;
  }
  terminal.appendChild(line);
  scrollToBottom();
  return line;
}

export function logAscii(text) {
  const line = document.createElement('div');
  line.className = 'line ascii';
  line.textContent = text;
  terminal.appendChild(line);
  scrollToBottom();
}

export function logRaw(text) {
  const line = document.createElement('div');
  line.className = 'line';
  line.textContent = text;
  terminal.appendChild(line);
  scrollToBottom();
}

export function startAiLine() {
  const line = document.createElement('div');
  line.className = 'line generating';
  const pfx = document.createElement('span');
  pfx.className = 'prefix ai';
  pfx.textContent = 'ai>';
  line.appendChild(pfx);
  const content = document.createElement('span');
  content.className = 'content';
  content.textContent = ' ';
  line.appendChild(content);
  terminal.appendChild(line);
  currentAiLine = line;
  currentAiContent = content;
  currentAiText = '';
  scrollToBottom();
  return line;
}

export function logAi(text) {
  startAiLine();
  appendAiToken(text);
  finishAiLine();
}

export function appendAiToken(text) {
  if (!currentAiContent) startAiLine();
  currentAiText += text;
  currentAiContent.textContent += text;
  scrollToBottom();
}

export function finishAiLine() {
  if (currentAiLine) {
    currentAiLine.classList.remove('generating');
    if (!currentAiText.trim()) {
      currentAiLine.remove();
    } else if (/```|`[^`]+`|\*\*[^*]+\*\*|<think>/.test(currentAiText)) {
      while (currentAiContent.firstChild) currentAiContent.removeChild(currentAiContent.firstChild);
      currentAiContent.appendChild(document.createTextNode(' '));
      currentAiContent.appendChild(renderMarkdown(currentAiText));
    }
  }
  currentAiLine = null;
  currentAiContent = null;
  currentAiText = '';
}

export function scrollToBottom() {
  requestAnimationFrame(() => {
    terminal.scrollTop = terminal.scrollHeight;
  });
}

export function setStatus(statusState, label) {
  const dot = headerStatus.querySelector('.dot');
  dot.className = 'dot ' + statusState;
  headerStatus.childNodes[1].textContent = label || statusState;
}
