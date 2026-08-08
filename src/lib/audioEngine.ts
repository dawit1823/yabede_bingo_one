/**
 * Web Audio API Sound Generator for Bingo Game Effects
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private cachedVoices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        this.loadVoices();
      };
    }
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
      this.ctx.resume();
    }
    return this.ctx;
  }

  public toggleSound(): boolean {
    this.soundEnabled = !this.soundEnabled;
    return this.soundEnabled;
  }

  public unlockAudio() {
    this.getContext();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices();
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

  public speakBallDraw(ball: number, lang: 'en' | 'am' = 'am') {
    if (!this.soundEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel(); // Clear pending speech

      const isAmharic = lang === 'am';
      const voices = this.cachedVoices.length > 0 ? this.cachedVoices : window.speechSynthesis.getVoices();

      // Check if browser has a native Amharic TTS voice installed
      const nativeAmVoice = voices.find(
        (v) =>
          (v.lang && v.lang.startsWith('am')) ||
          (v.lang && v.lang.includes('am-ET')) ||
          (v.name && v.name.toLowerCase().includes('amharic')) ||
          (v.name && v.name.toLowerCase().includes('ethiopia'))
      );

      let letter = 'B';
      let amLetterGeez = 'ቢ';
      let amLetterPhonetic = 'Bee';

      if (ball >= 16 && ball <= 30) {
        letter = 'I';
        amLetterGeez = 'አይ';
        amLetterPhonetic = 'Eye';
      } else if (ball >= 31 && ball <= 45) {
        letter = 'N';
        amLetterGeez = 'ኤን';
        amLetterPhonetic = 'En';
      } else if (ball >= 46 && ball <= 60) {
        letter = 'G';
        amLetterGeez = 'ጂ';
        amLetterPhonetic = 'Gee';
      } else if (ball >= 61 && ball <= 75) {
        letter = 'O';
        amLetterGeez = 'ኦ';
        amLetterPhonetic = 'Oh';
      }

      let textToSpeak = '';

      if (isAmharic) {
        if (nativeAmVoice) {
          // Device has native Amharic voice: use Ge'ez script text
          textToSpeak = `${amLetterGeez}, ${getAmharicNumberText(ball)}`;
        } else {
          // Device lacks native Amharic voice: use phonetic transliteration that standard TTS pronounces out loud in Amharic
          textToSpeak = `${amLetterPhonetic}, ${getAmharicPhoneticText(ball)}`;
        }
      } else {
        textToSpeak = `${letter}, ${ball}`;
      }

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 0.88; // Clear cadence for caller
      utterance.pitch = 1.0;

      if (isAmharic && nativeAmVoice) {
        utterance.voice = nativeAmVoice;
        utterance.lang = 'am-ET';
      } else {
        utterance.lang = 'en-US';
        const enVoice = voices.find((v) => v.lang && v.lang.startsWith('en'));
        if (enVoice) {
          utterance.voice = enVoice;
        }
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
