// Ambient types for browser APIs TypeScript's DOM lib doesn't ship.
// Type-check only — never served.

interface GPUAdapter {
  readonly features: ReadonlySet<string>;
}
interface GPU {
  requestAdapter(options?: { powerPreference?: 'low-power' | 'high-performance' }): Promise<GPUAdapter | null>;
}

interface Navigator {
  /** WebGPU (not yet in lib.dom). */
  readonly gpu?: GPU;
  /** iOS Safari: true when launched from the home screen. */
  readonly standalone?: boolean;
}

interface Performance {
  /** Chromium-only, non-standard. */
  readonly memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
}

/** Web Speech API recognition (not in lib.dom; prefixed in Safari/Chrome). */
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
}
interface SpeechRecognitionResultEventLike extends Event {
  readonly resultIndex: number;
  readonly results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface SpeechRecognitionErrorEventLike extends Event {
  readonly error?: string;
}

interface Window {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

/** Chromium PWA install prompt. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
