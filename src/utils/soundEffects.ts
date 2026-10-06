/**
 * Podcast sound effects generator using Web Audio API
 * Generates sparkling bells, comedic rimshots, transition whooshes, boings, and record scratches.
 */

export type SoundEffectType =
  | 'lightbulb_ding'
  | 'comedic_rimshot'
  | 'transition_whoosh'
  | 'record_scratch'
  | 'puppet_boing'
  | 'mystery_stinger'
  | 'puppet_giggle';

export interface SoundEffectMeta {
  id: SoundEffectType;
  label: string;
  icon: string;
  description: string;
}

export const SOUND_EFFECTS_LIST: SoundEffectMeta[] = [
  {
    id: 'lightbulb_ding',
    label: 'נורה נדלקת (בינג!)',
    icon: '💡',
    description: 'צלצול פעמון בהיר ומנצנץ לרגע של רעיון או תובנה',
  },
  {
    id: 'comedic_rimshot',
    label: 'פאנץ׳ קומי (בא-דום-טסס)',
    icon: '🥁',
    description: 'מכת תוף ומצלתיים קלאסית לבדיחה של ג׳רי',
  },
  {
    id: 'transition_whoosh',
    label: 'מעבר פרק (וּוש)',
    icon: '✨',
    description: 'מעבר דינמי בין נושאים ופרקים בפודקאסט',
  },
  {
    id: 'puppet_boing',
    label: 'קפיץ בובה (בוינג!)',
    icon: '🤪',
    description: 'צליל קפיץ שובב לתנועות ראש וקפיצות של ג׳רי',
  },
  {
    id: 'record_scratch',
    label: 'עצירת תקליט (סקרץ׳)',
    icon: '🛑',
    description: 'עצירה פתאומית כשמישהו קוטע או זורק יציאה לא קשורה',
  },
  {
    id: 'mystery_stinger',
    label: 'מתח / ספקנות',
    icon: '🕵️‍♂️',
    description: 'צליל מותח לרגע שבו ג׳רי עולה על סתירה בשיחה',
  },
  {
    id: 'puppet_giggle',
    label: 'צחקוק בובה',
    icon: '😆',
    description: 'צחקוק פנימי של בובת גרב',
  },
];

class SoundEffectsEngine {
  private ctx: AudioContext | null = null;

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

  public play(type: SoundEffectType): void {
    try {
      const ctx = this.getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;

      switch (type) {
        case 'lightbulb_ding':
          this.playLightbulbDing(ctx, now);
          break;
        case 'comedic_rimshot':
          this.playComedicRimshot(ctx, now);
          break;
        case 'transition_whoosh':
          this.playTransitionWhoosh(ctx, now);
          break;
        case 'puppet_boing':
          this.playPuppetBoing(ctx, now);
          break;
        case 'record_scratch':
          this.playRecordScratch(ctx, now);
          break;
        case 'mystery_stinger':
          this.playMysteryStinger(ctx, now);
          break;
        case 'puppet_giggle':
          this.playPuppetGiggle(ctx, now);
          break;
      }
    } catch (e) {
      console.warn('Failed to play SFX:', e);
    }
  }

  // Sparkling Ding (Eureka moment)
  private playLightbulbDing(ctx: AudioContext, now: number): void {
    const freqs = [1760, 2637, 3520]; // A6, E7, A7
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);

      gain.gain.setValueAtTime(0, now + idx * 0.04);
      gain.gain.linearRampToValueAtTime(0.45 / (idx + 1), now + idx * 0.04 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.04);
      osc.stop(now + 1.5);
    });
  }

  // Classic Rimshot: Kick -> Snare -> Hi-hat / Cymbal
  private playComedicRimshot(ctx: AudioContext, now: number): void {
    // 1. Kick (Ba)
    const kickOsc = ctx.createOscillator();
    const kickGain = ctx.createGain();
    kickOsc.frequency.setValueAtTime(160, now);
    kickOsc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
    kickGain.gain.setValueAtTime(0.7, now);
    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    kickOsc.connect(kickGain);
    kickGain.connect(ctx.destination);
    kickOsc.start(now);
    kickOsc.stop(now + 0.14);

    // 2. Snare rim hit (Dum)
    const snareTime = now + 0.14;
    const snareOsc = ctx.createOscillator();
    const snareGain = ctx.createGain();
    snareOsc.type = 'triangle';
    snareOsc.frequency.setValueAtTime(320, snareTime);
    snareOsc.frequency.exponentialRampToValueAtTime(120, snareTime + 0.1);
    snareGain.gain.setValueAtTime(0.65, snareTime);
    snareGain.gain.exponentialRampToValueAtTime(0.001, snareTime + 0.12);
    snareOsc.connect(snareGain);
    snareGain.connect(ctx.destination);
    snareOsc.start(snareTime);
    snareOsc.stop(snareTime + 0.12);

    // 3. Cymbal crash (Tsssh)
    const cymbalTime = now + 0.28;
    const bufferSize = ctx.sampleRate * 0.55;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(4000, cymbalTime);

    const cymbalGain = ctx.createGain();
    cymbalGain.gain.setValueAtTime(0.6, cymbalTime);
    cymbalGain.gain.exponentialRampToValueAtTime(0.0001, cymbalTime + 0.55);

    noise.connect(filter);
    filter.connect(cymbalGain);
    cymbalGain.connect(ctx.destination);

    noise.start(cymbalTime);
    noise.stop(cymbalTime + 0.56);
  }

  // Smooth podcast whoosh transition
  private playTransitionWhoosh(ctx: AudioContext, now: number): void {
    const bufferSize = ctx.sampleRate * 0.45;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(250, now);
    filter.frequency.exponentialRampToValueAtTime(2800, now + 0.22);
    filter.frequency.exponentialRampToValueAtTime(350, now + 0.44);
    filter.Q.setValueAtTime(2.0, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.65, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.45);
  }

  // Puppet spring boing
  private playPuppetBoing(ctx: AudioContext, now: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(820, now + 0.18);
    osc.frequency.linearRampToValueAtTime(480, now + 0.35);

    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.39);
  }

  // Sudden vinyl scratch
  private playRecordScratch(ctx: AudioContext, now: number): void {
    const bufferSize = ctx.sampleRate * 0.28;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI * 22);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.linearRampToValueAtTime(280, now + 0.25);
    filter.Q.setValueAtTime(3.5, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.28);
  }

  // Mystery / skepticism chord
  private playMysteryStinger(ctx: AudioContext, now: number): void {
    const notes = [311.13, 370.0, 440.0, 523.25]; // Diminished chord
    notes.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.9);
    });
  }

  // Puppet giggle
  private playPuppetGiggle(ctx: AudioContext, now: number): void {
    const tones = [520, 680, 560, 720, 600];
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.06;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.06);
    });
  }
}

export const sfxEngine = new SoundEffectsEngine();
