/**
 * Web Audio API Sound Generator & Audio Caller for Bingo Game Effects
 */

// Vite glob import of all 75 pre-recorded Amharic MP3 caller audio files
const amharicAudioModules = import.meta.glob<{ default: string }>(
  './Amharic caller/F*.mp3',
  { eager: true }
);

/**
 * Resolves the URL for a specific ball's pre-recorded Amharic caller MP3 (F1.mp3 - F75.mp3)
 */
function getAmharicAudioUrl(ball: number): string | null {
  if (ball < 1 || ball > 75) return null;
  const standardKey = `./Amharic caller/F${ball}.mp3`;
  const mod: any = amharicAudioModules[standardKey];
  if (mod) {
    return typeof mod === 'string' ? mod : mod.default || null;
  }

  // Fallback search in case of different path normalization
  for (const [key, value] of Object.entries(amharicAudioModules)) {
    if (key.endsWith(`/F${ball}.mp3`) || key.endsWith(`F${ball}.mp3`)) {
      const entry: any = value;
      return typeof entry === 'string' ? entry : entry?.default || null;
    }
  }
  return null;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private isUnlocked: boolean = false;

  // In-memory cache for all 75 Amharic MP3 Audio elements
  private amharicAudioCache: Map<number, HTMLAudioElement> = new Map();
  private isPreloaded: boolean = false;
  private isPreloading: boolean = false;
  private currentCallerAudio: HTMLAudioElement | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      if ('speechSynthesis' in window) {
        this.loadVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          this.loadVoices();
        };
      }
      this.attachGestureListeners();
    }
  }

  private attachGestureListeners() {
    if (typeof window === 'undefined') return;
    const unlockHandler = () => {
      this.unlockAudio();
      if (this.isUnlocked) {
        ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'].forEach((evt) => {
          window.removeEventListener(evt, unlockHandler);
        });
      }
    };

    ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'].forEach((evt) => {
      window.addEventListener(evt, unlockHandler, { passive: true, once: false });
    });
  }

  private loadVoices() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.cachedVoices = window.speechSynthesis.getVoices();
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public toggleSound(): boolean {
    this.soundEnabled = !this.soundEnabled;
    if (!this.soundEnabled) {
      this.stopCallerAudio();
    }
    return this.soundEnabled;
  }

  /**
   * Preload all 75 Amharic MP3 caller audio files into memory once.
   * Avoids repeated network requests and eliminates latency when balls are drawn.
   */
  public preloadAmharicCaller(): void {
    if (typeof window === 'undefined' || this.isPreloaded || this.isPreloading) return;
    this.isPreloading = true;

    try {
      for (let ball = 1; ball <= 75; ball++) {
        if (this.amharicAudioCache.has(ball)) continue;

        const url = getAmharicAudioUrl(ball);
        if (url) {
          const audio = new Audio();
          audio.preload = 'auto';
          audio.src = url;
          // Load audio buffer into browser memory
          audio.load();
          this.amharicAudioCache.set(ball, audio);
        } else {
          console.warn(`Missing caller audio for ball ${ball}`);
        }
      }
      this.isPreloaded = true;
    } catch (err) {
      console.warn('[SoundEngine] Error preloading Amharic caller audio files:', err);
    } finally {
      this.isPreloading = false;
    }
  }

  /**
   * Stop any active caller audio announcement (both MP3 and TTS)
   * Prevents overlapping audio when new balls are drawn
   */
  public stopCallerAudio(): void {
    if (this.currentCallerAudio) {
      try {
        this.currentCallerAudio.pause();
        this.currentCallerAudio.currentTime = 0;
      } catch {}
      this.currentCallerAudio = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  public unlockAudio() {
    const ctx = this.getContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        this.isUnlocked = true;
      }).catch(() => {});
    } else if (ctx && ctx.state === 'running') {
      this.isUnlocked = true;
    }

    // Start preloading Amharic MP3s immediately upon user gesture
    this.preloadAmharicCaller();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices();
      // Prime TTS on mobile
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {}
    }
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public playPop() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // Audio fallback
    }
  }

  public playDaub() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // Audio fallback
    }
  }

  public playWin() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);

        gain.gain.setValueAtTime(0.3, ctx.currentTime + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.12);
        osc.stop(ctx.currentTime + idx * 0.12 + 0.4);
      });
    } catch {
      // Audio fallback
    }
  }

  public playSpinTick() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(900, ctx.currentTime);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.03);
    } catch {
      // Audio fallback
    }
  }

  /**
   * Announces the drawn Bingo ball.
   * - When language is 'am': Plays the pre-recorded MP3 file (F<ball>.mp3) with zero latency.
   * - When language is 'en': Uses SpeechSynthesis with standard Bingo letter and number.
   * - Stops any overlapping audio before announcing the new ball.
   */
  public speakBallDraw(ball: number, lang: 'en' | 'am' = 'am') {
    if (!this.soundEnabled || typeof window === 'undefined') return;
    if (ball < 1 || ball > 75) return;

    // 1. Stop any currently playing caller voice to prevent overlapping audio
    this.stopCallerAudio();

    // 2. Amharic: Play matching pre-recorded MP3 caller file (F1.mp3 - F75.mp3)
    if (lang === 'am') {
      let audio = this.amharicAudioCache.get(ball);

      // If not yet preloaded or missing from cache, retrieve and cache
      if (!audio) {
        const url = getAmharicAudioUrl(ball);
        if (url) {
          audio = new Audio();
          audio.preload = 'auto';
          audio.src = url;
          this.amharicAudioCache.set(ball, audio);
        }
      }

      if (audio) {
        this.currentCallerAudio = audio;
        try {
          audio.currentTime = 0;
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              // Log warning gracefully without crashing
              console.warn(`[SoundEngine] Playback notice for ball ${ball}:`, err?.message || err);
            });
          }
        } catch (err: any) {
          console.warn(`[SoundEngine] Error playing caller audio for ball ${ball}:`, err?.message || err);
        }
      } else {
        console.warn(`Missing caller audio for ball ${ball}`);
      }
      return;
    }

    // 3. English: Keep existing SpeechSynthesis voice caller behavior unchanged
    if (!('speechSynthesis' in window)) return;

    try {
      const voices = this.cachedVoices.length > 0 ? this.cachedVoices : window.speechSynthesis.getVoices();

      let letter = 'B';
      if (ball >= 16 && ball <= 30) {
        letter = 'I';
      } else if (ball >= 31 && ball <= 45) {
        letter = 'N';
      } else if (ball >= 46 && ball <= 60) {
        letter = 'G';
      } else if (ball >= 61 && ball <= 75) {
        letter = 'O';
      }

      const textToSpeak = `${letter}, ${ball}`;
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 0.88; // Clear cadence for caller
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      const enVoice = voices.find((v) => v.lang && v.lang.startsWith('en'));
      if (enVoice) {
        utterance.voice = enVoice;
      }

      // 20ms timeout prevents Chrome speech cancellation bug
      setTimeout(() => {
        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          // Fallback
        }
      }, 20);
    } catch {
      // Speech synthesis fallback
    }
  }
}

const AMHARIC_ONES: Record<number, string> = {
  1: 'አንድ',
  2: 'ሁለት',
  3: 'ሦስት',
  4: 'አራት',
  5: 'አምስት',
  6: 'ስድስት',
  7: 'ሰባት',
  8: 'ስምንት',
  9: 'ዘጠኝ',
};

const AMHARIC_TENS: Record<number, string> = {
  10: 'አስር',
  20: 'ሃያ',
  30: 'ሠላሳ',
  40: 'አርባ',
  50: 'ሐምሳ',
  60: 'ሥልሳ',
  70: 'ሰባ',
};

const AMHARIC_ONES_PHONETIC: Record<number, string> = {
  1: 'And',
  2: 'Hu-let',
  3: 'Sost',
  4: 'Arat',
  5: 'Amist',
  6: 'Sidist',
  7: 'Sebat',
  8: 'Simint',
  9: 'Zeteyn',
};

const AMHARIC_TENS_PHONETIC: Record<number, string> = {
  10: 'Asir',
  20: 'Haya',
  30: 'Slasa',
  40: 'Arba',
  50: 'Hamsa',
  60: 'Silsa',
  70: 'Seba',
};

export function getAmharicNumberText(num: number): string {
  if (num <= 0 || num > 75) return num.toString();
  if (num >= 1 && num <= 9) return AMHARIC_ONES[num];
  if (num % 10 === 0 && AMHARIC_TENS[num]) return AMHARIC_TENS[num];

  const tens = Math.floor(num / 10) * 10;
  const ones = num % 10;

  if (tens === 10) {
    return `አስራ ${AMHARIC_ONES[ones]}`;
  }
  return `${AMHARIC_TENS[tens]} ${AMHARIC_ONES[ones]}`;
}

export function getAmharicPhoneticText(num: number): string {
  if (num <= 0 || num > 75) return num.toString();
  if (num >= 1 && num <= 9) return AMHARIC_ONES_PHONETIC[num];
  if (num % 10 === 0 && AMHARIC_TENS_PHONETIC[num]) return AMHARIC_TENS_PHONETIC[num];

  const tens = Math.floor(num / 10) * 10;
  const ones = num % 10;

  if (tens === 10) {
    return `Asra ${AMHARIC_ONES_PHONETIC[ones]}`;
  }
  return `${AMHARIC_TENS_PHONETIC[tens]} ${AMHARIC_ONES_PHONETIC[ones]}`;
}

export const audioEngine = new SoundEngine();
