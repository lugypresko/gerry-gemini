import { ConversationAudio } from './conversationAudio';
import { latency } from './latency';
/**
 * Audio playback and speech helper for Jerry & Itay podcast.
 * Decodes WAV via AudioContext.decodeAudioData, with Blob audio fallback,
 * Web Audio acoustic vocal formants, and auto-unlocking.
 */

class AudioController {
  private currentAudio: HTMLAudioElement | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private audioCtx: AudioContext | null = null;
  public recordingGraph: ConversationAudio | null = null;
  private isUnlocked: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.unlockAudio();
      };
      window.addEventListener('click', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
  }

  public getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public async unlockAudio(): Promise<boolean> {
    try {
      const ctx = this.getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Play short silent tone to warm up audio pipeline
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(ctx.currentTime + 0.05);

      this.isUnlocked = true;
      return true;
    } catch {
      return false;
    }
  }

  // Play base64 WAV audio via AudioContext.decodeAudioData (Bypasses iframe & audio tag blocks!)
  public async playBase64Wav(base64Data: string, onEnded?: () => void): Promise<void> {
    this.stop();
    await this.unlockAudio();
    const ctx = this.getAudioContext();

    let hasEnded = false;
    const endWrapper = () => {
      if (!hasEnded) {
        hasEnded = true;
        if (onEnded) onEnded();
      }
    };

    try {
      // Decode base64 into binary array
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode PCM / WAV buffer directly in AudioContext
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(1.0, ctx.currentTime);

      source.connect(gain);
      gain.connect(ctx.destination);
      if(this.recordingGraph) gain.connect(this.recordingGraph.mix);

      source.onended = endWrapper;
      source.start(0);
      latency.playback('Web Audio scheduled start; hardware latency not measured', undefined, 0, base64Data);
      this.currentSource = source;
    } catch (err) {
      console.warn('decodeAudioData error, attempting Blob URL playback:', err);

      try {
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/wav' });
        const blobUrl = URL.createObjectURL(blob);

        const audio = new Audio(blobUrl);
        audio.volume = 1.0;
        if(this.recordingGraph){const source=ctx.createMediaElementSource(audio);source.connect(ctx.destination);source.connect(this.recordingGraph.mix);}
        this.currentAudio = audio;

        audio.onended = () => {
          URL.revokeObjectURL(blobUrl);
          endWrapper();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          endWrapper();
        };

        audio.onplaying = () => latency.playback('HTMLMediaElement playing event', undefined, 0, base64Data);
        await audio.play();
      } catch (audioErr) {
        console.warn('Blob audio play failed:', audioErr);
        endWrapper();
      }
    }
  }

  // Synthesize acoustic puppet voice (Formant/melodic speech generator)
  public playPuppetVoiceCadence(
    text: string,
    role: 'jerry' | 'itay' | 'gpt',
    onStart?: () => void,
    onEnd?: () => void
  ): void {
    try {
      this.unlockAudio();
      const ctx = this.getAudioContext();

      if (onStart) onStart();

      const now = ctx.currentTime;
      const words = text.split(/\s+/).filter(Boolean);
      const syllables = Math.min(Math.max(words.length * 1.8, 6), 26);
      const syllableDuration = role === 'jerry' ? 0.12 : role === 'gpt' ? 0.14 : 0.13;
      const basePitch = role === 'jerry' ? 310 : role === 'gpt' ? 180 : 210;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.55, now);
      masterGain.connect(ctx.destination);

      for (let i = 0; i < syllables; i++) {
        const syllableTime = now + i * syllableDuration;

        const f1 = ctx.createBiquadFilter();
        f1.type = 'bandpass';
        f1.frequency.setValueAtTime(role === 'jerry' ? 680 : 520, syllableTime);
        f1.Q.setValueAtTime(3.5, syllableTime);

        const f2 = ctx.createBiquadFilter();
        f2.type = 'bandpass';
        f2.frequency.setValueAtTime(role === 'jerry' ? 1950 : 1400, syllableTime);
        f2.Q.setValueAtTime(4.0, syllableTime);

        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();

        const isQuestion = text.includes('?') && i > syllables - 3;
        const isExclamation = text.includes('!') && i < 4;
        let pitch = basePitch + Math.sin(i * 0.9) * 32;
        if (isQuestion) pitch += (i - (syllables - 3)) * 50;
        if (isExclamation) pitch += 60;

        osc.type = role === 'jerry' ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(pitch, syllableTime);
        osc.frequency.linearRampToValueAtTime(
          pitch * (isQuestion ? 1.25 : 0.92),
          syllableTime + syllableDuration * 0.85
        );

        noteGain.gain.setValueAtTime(0, syllableTime);
        noteGain.gain.linearRampToValueAtTime(0.45, syllableTime + 0.02);
        noteGain.gain.exponentialRampToValueAtTime(0.001, syllableTime + syllableDuration * 0.95);

        osc.connect(f1);
        osc.connect(f2);
        f1.connect(noteGain);
        f2.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start(syllableTime);
        osc.stop(syllableTime + syllableDuration);
      }

      const totalDuration = syllables * syllableDuration + 0.1;
      setTimeout(() => {
        if (onEnd) onEnd();
      }, totalDuration * 1000);
    } catch {
      if (onEnd) onEnd();
    }
  }

  // Universal speak method
  public speakTextHebrew(
    text: string,
    role: 'jerry' | 'itay' | 'gpt',
    onStart?: () => void,
    onEnd?: () => void
  ): void {
    this.stop();
    this.unlockAudio();

    let hasFinished = false;
    const safeEnd = () => {
      if (!hasFinished) {
        hasFinished = true;
        if (onEnd) onEnd();
      }
    };

    if (onStart) onStart();

    let speechSucceeded = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'he-IL';
        utterance.volume = 1.0;

        if (role === 'jerry') {
          utterance.pitch = 1.35;
          utterance.rate = 1.08;
        } else if (role === 'gpt') {
          utterance.pitch = 0.95;
          utterance.rate = 0.98;
        } else {
          utterance.pitch = 1.0;
          utterance.rate = 1.0;
        }

        const voices = window.speechSynthesis.getVoices();
        const heVoice = voices.find(
          (v) => v.lang.startsWith('he') || v.lang.includes('IL')
        );
        if (heVoice) {
          utterance.voice = heVoice;
        }

        utterance.onend = safeEnd;
        utterance.onerror = () => {
          this.playPuppetVoiceCadence(text, role, undefined, safeEnd);
        };

        window.speechSynthesis.speak(utterance);
        speechSucceeded = true;

        const wordCount = text.split(/\s+/).length;
        const estSeconds = Math.max((wordCount / 2.5) + 1.2, 3);
        setTimeout(() => {
          if (!hasFinished) {
            safeEnd();
          }
        }, estSeconds * 1000);
      } catch {
        speechSucceeded = false;
      }
    }

    if (!speechSucceeded) {
      this.playPuppetVoiceCadence(text, role, undefined, safeEnd);
    }
  }

  // Quick sound test chime
  public testSpeakerSound(): void {
    this.unlockAudio();
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;

    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.12;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.6, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  public playChime(type: 'on_air' | 'puppet_giggle' | 'record_start' | 'record_stop'): void {
    try {
      this.unlockAudio();
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'on_air') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'puppet_giggle') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(660, now + 0.08);
        osc.frequency.linearRampToValueAtTime(440, now + 0.16);
        osc.frequency.linearRampToValueAtTime(700, now + 0.24);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'record_start') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.setValueAtTime(523.25, now + 0.08);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch {
      // Ignored
    }
  }

  public stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {}
      this.currentSource = null;
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}

export const audioController = new AudioController();
