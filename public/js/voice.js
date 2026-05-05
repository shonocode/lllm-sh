/* Voice input (Web Speech API) and TTS (speechSynthesis).
   Both are best-effort — APIs vary across browsers. */

import { chatInput } from './state.js';
import { log } from './terminal.js';

const TTS_KEY = 'lllm-sh-tts';

const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

export function isVoiceSupported() {
  return !!Recog;
}

export function isTTSSupported() {
  return 'speechSynthesis' in window;
}

function ensureRecognition() {
  if (recognition || !Recog) return recognition;
  recognition = new Recog();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';
  recognition.addEventListener('result', (e) => {
    let text = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
    }
    chatInput.value = text;
  });
  recognition.addEventListener('end', () => { listening = false; updateInputUi(); });
  recognition.addEventListener('error', (e) => {
    listening = false;
    updateInputUi();
    log('error', 'voice: ' + (e.error || 'unknown'));
  });
  return recognition;
}

function updateInputUi() {
  const prompt = document.getElementById('input-prompt');
  if (prompt) prompt.textContent = listening ? '🎙' : '>';
}

export function toggleVoice() {
  if (!Recog) { log('error', 'speech recognition not supported in this browser.'); return; }
  ensureRecognition();
  if (listening) {
    recognition.stop();
  } else {
    try {
      recognition.start();
      listening = true;
      updateInputUi();
      log('system', 'listening… (type /voice or click input to stop)');
    } catch (e) { log('error', 'voice start failed: ' + e.message); }
  }
}

/* TTS */
let ttsEnabled = localStorage.getItem(TTS_KEY) === '1';

export function isTTSEnabled() { return ttsEnabled; }

export function setTTSEnabled(on) {
  ttsEnabled = !!on;
  if (ttsEnabled) localStorage.setItem(TTS_KEY, '1');
  else localStorage.removeItem(TTS_KEY);
  if (!ttsEnabled && 'speechSynthesis' in window) speechSynthesis.cancel();
}

export function speak(text) {
  if (!ttsEnabled || !('speechSynthesis' in window) || !text) return;
  // Strip code blocks and markdown that don't speak well
  const clean = text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim();
  if (!clean) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = navigator.language || 'en-US';
  u.rate = 1.05;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
