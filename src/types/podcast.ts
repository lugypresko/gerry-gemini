export interface EvaluationScores {
  toneShift: number; // האם שינוי הטון נשמע בבירור? (1-5)
  emotionalFit: number; // האם הרגש מתאים לרגע? (1-5)
  naturalHebrew: number; // האם העברית טבעית? (1-5)
  characterConsistency: number; // האם ג׳רי נשאר אותה דמות? (1-5)
  spontaneity: number; // האם התגובה נשמעת ספונטנית ולא מוגזמת? (1-5)
  expressiveness: number; // ציון הבעה (1-5)
  voiceSimilarity: number; // דמיון לקול של ג'רי (1-5)
}

export interface SystemRunData {
  systemId: 'gemini' | 'gpt';
  systemName: string;
  voiceName: string;
  responseText: string;
  audioBase64?: string;
  audioUrl?: string;
  scores: EvaluationScores;
  interruptedItay: boolean; // האם ג'רי קטע את איתי
  missedCorrection: boolean; // האם ג'רי פספס תיקון
  notes: string;
}

export interface ScenarioRun {
  runIndex: number; // 1, 2, 3
  completed: boolean;
  gemini: SystemRunData;
  gpt: SystemRunData;
  blind?: {
    systemAId: 'gemini' | 'gpt';
    systemBId: 'gemini' | 'gpt';
    systemAScores: EvaluationScores;
    systemBScores: EvaluationScores;
    revealed: boolean;
  };
}

export interface Scenario {
  id: number;
  title: string;
  category: string;
  description: string;
  itayPrompt: string;
  jerrySetup?: string;
  targetResponse: string;
  targetEmotion: 'surprise' | 'skepticism' | 'calm_acknowledgement' | 'empathy' | 'stop_yield';
  runs: ScenarioRun[];
}

export interface PodcastMessage {
  id: string;
  speaker: 'Jerry' | 'Itay';
  text: string;
  audioBase64?: string;
  timestamp: string;
  emotion?: string;
  model?: string;
  ttsModel?: 'gemini-3.8-flash-tts' | 'gemini-3.8-flash-lite-tts' | string;
  generationTimeMs?: number;
}
