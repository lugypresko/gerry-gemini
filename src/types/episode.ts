import { SoundEffectType } from '../utils/soundEffects';

export type ChapterType =
  | 'intro'
  | 'main_topic'
  | 'jerry_tangent'
  | 'bridge_back'
  | 'jerry_question'
  | 'outro';

export interface EpisodeChapter {
  id: string;
  number: number;
  title: string;
  description: string;
  type: ChapterType;
  durationEst: string;
  status: 'upcoming' | 'active' | 'completed';
  cueSound?: SoundEffectType;
}

export interface JerryActionPrompt {
  id: string;
  type: 'interrupt' | 'question' | 'tangent' | 'bridge_back';
  buttonLabel: string;
  icon: string;
  soundEffect: SoundEffectType;
  jerryScript: string;
  emotion: 'surprise' | 'skepticism' | 'calm_acknowledgement' | 'empathy' | 'stop_yield';
  contextDescription: string;
}
