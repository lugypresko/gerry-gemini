/**
 * Ambient chill / lo-fi podcast background music generator using Web Audio API.
 * Provides soothing, gentle background music with automatic audio ducking
 * when voices are active.
 */

class PodcastMusicEngine {
  private ctx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private masterGain: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private intervalId: any = null;
  private volume: number = 0.55; // Audible default
  private isMuted: boolean = false;

  private chordProgression = [
    // Fmaj9 - Em7 - Dm9 - Cmaj7 (Chill podcast chords)
    [349.23, 440.0, 523.25, 659.25], // F4, A4, C5, E5
    [329.63, 392.0, 493.88, 587.33], // E4, G4, B4, D5
    [293.66, 349.23, 440.0, 523.25], // D4, F4, A4, C5
    [261.63, 329.63, 392.0, 493.88], // C4, E4, G4, B4
  ];
  private chordIndex = 0;

  public getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public start(): void {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    if (this.isPlaying) return;
    this.isPlaying = true;

    try {
      // Master volume node
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, ctx.currentTime);

      // Ducking gain node (dips when someone is speaking)
      this.duckGain = ctx.createGain();
      this.duckGain.gain.setValueAtTime(1.0, ctx.currentTime);

      this.duckGain.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);

      // Play initial chord immediately
      this.playChord(ctx);

      // Loop chord progression every 3.8 seconds smoothly
      this.intervalId = setInterval(() => {
        if (!this.isPlaying) return;
        this.chordIndex = (this.chordIndex + 1) % this.chordProgression.length;
        const currentCtx = this.getAudioContext();
        if (currentCtx.state === 'suspended') currentCtx.resume();
        this.playChord(currentCtx);
      }, 3800);
    } catch (e) {
      console.warn('Failed to start podcast background music:', e);
    }
  }

  private playChord(ctx: AudioContext): void {
    if (!this.duckGain) return;

    const notes = this.chordProgression[this.chordIndex];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      // Warm Rhodes / soft electric piano tone
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      // Low pass filter for warm lo-fi ambience
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.Q.setValueAtTime(1.0, now);

      // Clear attack and smooth decay
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(0.18, now + 0.3);
      oscGain.gain.exponentialRampToValueAtTime(0.06, now + 2.5);
      oscGain.gain.linearRampToValueAtTime(0.0001, now + 3.8);

      osc.connect(filter);
      filter.connect(oscGain);
      oscGain.connect(this.duckGain!);

      osc.start(now);
      osc.stop(now + 3.9);
    });

    // Warm audible sub-bass
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    const rootFreq = notes[0] / 2; // one octave down
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(rootFreq, now);

    bassGain.gain.setValueAtTime(0, now);
    bassGain.gain.linearRampToValueAtTime(0.22, now + 0.2);
    bassGain.gain.exponentialRampToValueAtTime(0.04, now + 3.2);

    bassOsc.connect(bassGain);
    bassGain.connect(this.duckGain!);

    bassOsc.start(now);
    bassOsc.stop(now + 3.7);
  }

  // Voice activity ducking
  public duck(isSpeaking: boolean): void {
    if (!this.ctx || !this.duckGain) return;
    const now = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(now);
    if (isSpeaking) {
      this.duckGain.gain.linearRampToValueAtTime(0.25, now + 0.2);
    } else {
      this.duckGain.gain.linearRampToValueAtTime(1.0, now + 0.5);
    }
  }

  public setVolume(val: number): void {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getVolume(): number {
    return this.volume;
  }
}

export const musicEngine = new PodcastMusicEngine();
