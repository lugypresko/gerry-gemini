import React, { useState } from 'react';
import { Scenario, EvaluationScores } from '../types/podcast';
import { audioController } from '../utils/audio';
import { sfxEngine } from '../utils/soundEffects';
import confetti from 'canvas-confetti';
import {
  HelpCircle,
  Play,
  Eye,
  CheckCircle,
  Shuffle,
  Award,
  Sparkles,
} from 'lucide-react';

interface BlindTestLabProps {
  scenarios: Scenario[];
  onSaveBlindScores: (scenarioId: number, runIdx: number, geminiScores: EvaluationScores, gptScores: EvaluationScores) => void;
}

export const BlindTestLab: React.FC<BlindTestLabProps> = ({
  scenarios,
  onSaveBlindScores,
}) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<number>(1);
  const [selectedRunIdx, setSelectedRunIdx] = useState<number>(1);

  // Shuffle state: system A is either gemini or gpt
  const [isSystemAGemini, setIsSystemAGemini] = useState<boolean>(() => Math.random() > 0.5);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);

  // Blind scores
  const [scoresA, setScoresA] = useState<EvaluationScores>({
    toneShift: 4,
    emotionalFit: 4,
    naturalHebrew: 4,
    characterConsistency: 4,
    spontaneity: 4,
    expressiveness: 4,
    voiceSimilarity: 4,
  });

  const [scoresB, setScoresB] = useState<EvaluationScores>({
    toneShift: 2,
    emotionalFit: 3,
    naturalHebrew: 4,
    characterConsistency: 3,
    spontaneity: 3,
    expressiveness: 2,
    voiceSimilarity: 2,
  });

  const currentScenario = scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0];
  const currentRun = currentScenario.runs.find((r) => r.runIndex === selectedRunIdx) || currentScenario.runs[0];

  const systemAData = isSystemAGemini ? currentRun.gemini : currentRun.gpt;
  const systemBData = isSystemAGemini ? currentRun.gpt : currentRun.gemini;

  const handleShuffle = () => {
    setIsSystemAGemini(Math.random() > 0.5);
    setIsRevealed(false);
    sfxEngine.play('transition_whoosh');
  };

  const handlePlayBlind = async (which: 'A' | 'B') => {
    audioController.unlockAudio();
    const data = which === 'A' ? systemAData : systemBData;

    if (data.audioBase64) {
      audioController.playBase64Wav(data.audioBase64);
      return;
    }

    try {
      const res = await fetch('/api/gemini/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: data.responseText,
          voiceName: data.systemId === 'gemini' ? 'Puck' : 'Fenrir',
          style: data.systemId === 'gemini' ? 'Lively expressive Hebrew puppet host' : 'Calm, diplomatic Hebrew assistant',
        }),
      });
      const resData = await res.json();
      if (resData.audioBase64) {
        audioController.playBase64Wav(resData.audioBase64);
        return;
      }
    } catch {
      // Fallback below
    }

    audioController.speakTextHebrew(
      data.responseText,
      data.systemId === 'gemini' ? 'jerry' : 'gpt'
    );
  };

  const handleReveal = () => {
    setIsRevealed(true);
    sfxEngine.play('lightbulb_ding');
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });

    const geminiFinalScores = isSystemAGemini ? scoresA : scoresB;
    const gptFinalScores = isSystemAGemini ? scoresB : scoresA;

    onSaveBlindScores(selectedScenarioId, selectedRunIdx, geminiFinalScores, gptFinalScores);
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                מצב עיוור (Blind Evaluation Mode)
              </span>
              <h2 className="text-xl font-black text-slate-100">
                האזנה עיוורת ללא הטיה (מערכת א׳ מול מערכת ב׳)
              </h2>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              האזן להקלטות בלי לדעת איזה מודל הפיק כל אחת, דרג את המדדים, וגלה את התוצאות רק בסיום!
            </p>
          </div>

          <button
            onClick={handleShuffle}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>ערבב מערכות מחדש</span>
          </button>
        </div>

        {/* Scenario Selection */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs font-bold text-slate-300">בחר תרחיש להאזנה:</span>
          {scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelectedScenarioId(s.id);
                setIsRevealed(false);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                s.id === selectedScenarioId
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Current Target Scenario Context */}
        <div className="p-4 bg-slate-950/70 rounded-2xl border border-slate-800 mb-6 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-purple-300">
              תרחיש: {currentScenario.title} — {currentScenario.category}
            </span>
            <span className="text-slate-400">ריצה {selectedRunIdx} מתוך 3</span>
          </div>
          <p className="text-slate-300">
            <strong>איתי אומר:</strong> „{currentScenario.itayPrompt}”
          </p>
          <p className="text-slate-400">
            <strong>תגובת היעד:</strong> {currentScenario.targetResponse}
          </p>
        </div>

        {/* Blind Cards: System A vs System B */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          
          {/* System A */}
          <div className={`p-5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
            isRevealed && isSystemAGemini
              ? 'bg-amber-950/20 border-amber-500/70 shadow-lg shadow-amber-500/10'
              : isRevealed
              ? 'bg-slate-900 border-slate-700'
              : 'bg-slate-950 border-purple-500/40'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  מערכת א׳ {isRevealed && (isSystemAGemini ? '← Gemini Live 🌟' : '← GPT-Live-1')}
                </span>

                <button
                  onClick={() => handlePlayBlind('A')}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-md transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>האזן להקלטה א׳</span>
                </button>
              </div>

              {isRevealed && (
                <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs mb-4">
                  <span className="font-bold text-slate-300 block mb-1">תמליל שנאמר:</span>
                  <p className="text-slate-100">„{systemAData.responseText}”</p>
                </div>
              )}

              {/* Scoring Sliders */}
              <div className="space-y-2.5 text-xs">
                <h4 className="font-bold text-slate-300 border-b border-slate-800 pb-1">
                  דירוג עיוור למערכת א׳ (1-5):
                </h4>

                {[
                  { key: 'toneShift', label: 'שינוי טון ברור' },
                  { key: 'emotionalFit', label: 'התאמה רגשית' },
                  { key: 'naturalHebrew', label: 'עברית טבעית' },
                  { key: 'characterConsistency', label: 'דמות ג׳רי' },
                  { key: 'spontaneity', label: 'ספונטניות' },
                  { key: 'expressiveness', label: 'הבעה קולית' },
                  { key: 'voiceSimilarity', label: 'דמיון לקול ג׳רי' },
                ].map(({ key, label }) => {
                  const val = scoresA[key as keyof EvaluationScores];
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-slate-300">{label}:</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            onClick={() =>
                              setScoresA((prev) => ({ ...prev, [key]: s }))
                            }
                            className={`w-6 h-6 rounded-md font-bold text-xs ${
                              s <= val
                                ? 'bg-purple-500 text-white'
                                : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* System B */}
          <div className={`p-5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
            isRevealed && !isSystemAGemini
              ? 'bg-amber-950/20 border-amber-500/70 shadow-lg shadow-amber-500/10'
              : isRevealed
              ? 'bg-slate-900 border-slate-700'
              : 'bg-slate-950 border-purple-500/40'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  מערכת ב׳ {isRevealed && (!isSystemAGemini ? '← Gemini Live 🌟' : '← GPT-Live-1')}
                </span>

                <button
                  onClick={() => handlePlayBlind('B')}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-md transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>האזן להקלטה ב׳</span>
                </button>
              </div>

              {isRevealed && (
                <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs mb-4">
                  <span className="font-bold text-slate-300 block mb-1">תמליל שנאמר:</span>
                  <p className="text-slate-100">„{systemBData.responseText}”</p>
                </div>
              )}

              {/* Scoring Sliders */}
              <div className="space-y-2.5 text-xs">
                <h4 className="font-bold text-slate-300 border-b border-slate-800 pb-1">
                  דירוג עיוור למערכת ב׳ (1-5):
                </h4>

                {[
                  { key: 'toneShift', label: 'שינוי טון ברור' },
                  { key: 'emotionalFit', label: 'התאמה רגשית' },
                  { key: 'naturalHebrew', label: 'עברית טבעית' },
                  { key: 'characterConsistency', label: 'דמות ג׳רי' },
                  { key: 'spontaneity', label: 'ספונטניות' },
                  { key: 'expressiveness', label: 'הבעה קולית' },
                  { key: 'voiceSimilarity', label: 'דמיון לקול ג׳רי' },
                ].map(({ key, label }) => {
                  const val = scoresB[key as keyof EvaluationScores];
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-slate-300">{label}:</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            onClick={() =>
                              setScoresB((prev) => ({ ...prev, [key]: s }))
                            }
                            className={`w-6 h-6 rounded-md font-bold text-xs ${
                              s <= val
                                ? 'bg-purple-500 text-white'
                                : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>

        {/* Reveal Action Bar */}
        <div className="flex items-center justify-center pt-2">
          {!isRevealed ? (
            <button
              onClick={handleReveal}
              className="flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-purple-600 via-amber-500 to-amber-600 hover:from-purple-500 hover:to-amber-500 text-slate-950 font-black text-sm rounded-2xl shadow-xl transition hover:scale-105 active:scale-95"
            >
              <Eye className="w-5 h-5" />
              <span>גלה את זהות המערכות ושמור ציונים</span>
              <Sparkles className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-emerald-950/40 border border-emerald-500/50 rounded-2xl text-emerald-300 text-xs font-bold">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>
                המערכות נחשפו והציונים העיוורים עודכנו במאגר הניסוי בהצלחה!
              </span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
