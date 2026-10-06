import React, { useState } from 'react';
import { Scenario, ScenarioRun, EvaluationScores } from '../types/podcast';
import { INITIAL_SCENARIOS } from '../data/scenarios';
import { audioController } from '../utils/audio';
import { sfxEngine } from '../utils/soundEffects';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Award,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Flame,
  Volume2,
} from 'lucide-react';

interface ExperimentLabProps {
  scenarios: Scenario[];
  onUpdateScenarios: (updated: Scenario[]) => void;
}

export const ExperimentLab: React.FC<ExperimentLabProps> = ({
  scenarios,
  onUpdateScenarios,
}) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<number>(1);
  const [selectedRunIndex, setSelectedRunIndex] = useState<number>(1);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isRunningLive, setIsRunningLive] = useState(false);
  const [expandedSystem, setExpandedSystem] = useState<'both' | 'gemini' | 'gpt'>('both');

  const currentScenario = scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0];
  const currentRun =
    currentScenario.runs.find((r) => r.runIndex === selectedRunIndex) || currentScenario.runs[0];

  const handleScoreChange = (
    system: 'gemini' | 'gpt',
    metric: keyof EvaluationScores,
    value: number
  ) => {
    const updatedScenarios = scenarios.map((s) => {
      if (s.id !== selectedScenarioId) return s;
      const updatedRuns = s.runs.map((r) => {
        if (r.runIndex !== selectedRunIndex) return r;
        return {
          ...r,
          [system]: {
            ...r[system],
            scores: {
              ...r[system].scores,
              [metric]: value,
            },
          },
        };
      });
      return { ...s, runs: updatedRuns };
    });
    onUpdateScenarios(updatedScenarios);
  };

  const handleEventToggle = (
    system: 'gemini' | 'gpt',
    event: 'interruptedItay' | 'missedCorrection'
  ) => {
    const updatedScenarios = scenarios.map((s) => {
      if (s.id !== selectedScenarioId) return s;
      const updatedRuns = s.runs.map((r) => {
        if (r.runIndex !== selectedRunIndex) return r;
        return {
          ...r,
          [system]: {
            ...r[system],
            [event]: !r[system][event],
          },
        };
      });
      return { ...s, runs: updatedRuns };
    });
    onUpdateScenarios(updatedScenarios);
  };

  const handleNotesChange = (system: 'gemini' | 'gpt', notes: string) => {
    const updatedScenarios = scenarios.map((s) => {
      if (s.id !== selectedScenarioId) return s;
      const updatedRuns = s.runs.map((r) => {
        if (r.runIndex !== selectedRunIndex) return r;
        return {
          ...r,
          [system]: {
            ...r[system],
            notes,
          },
        };
      });
      return { ...s, runs: updatedRuns };
    });
    onUpdateScenarios(updatedScenarios);
  };

  const handlePlayAudio = async (system: 'gemini' | 'gpt') => {
    audioController.unlockAudio();
    const runData = currentRun[system];

    if (runData.audioBase64) {
      audioController.playBase64Wav(runData.audioBase64);
      return;
    }

    try {
      const res = await fetch('/api/gemini/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: runData.responseText,
          voiceName: system === 'gemini' ? 'Puck' : 'Fenrir',
          style: system === 'gemini' ? 'Lively expressive Hebrew puppet host' : 'Calm, diplomatic Hebrew assistant',
        }),
      });
      const data = await res.json();
      if (data.audioBase64) {
        // Cache audio base64 in scenario
        const updatedScenarios = scenarios.map((s) => {
          if (s.id !== selectedScenarioId) return s;
          const updatedRuns = s.runs.map((r) => {
            if (r.runIndex !== selectedRunIndex) return r;
            return {
              ...r,
              [system]: {
                ...r[system],
                audioBase64: data.audioBase64,
              },
            };
          });
          return { ...s, runs: updatedRuns };
        });
        onUpdateScenarios(updatedScenarios);

        audioController.playBase64Wav(data.audioBase64);
        return;
      }
    } catch {
      // Fallback
    }

    audioController.speakTextHebrew(runData.responseText, system === 'gemini' ? 'jerry' : 'gpt');
  };

  const handleRunLiveScenario = async () => {
    setIsRunningLive(true);
    setApiError(null);
    try {
      sfxEngine.play('transition_whoosh');
      const response = await fetch('/api/gemini/run-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId: selectedScenarioId,
          runIndex: selectedRunIndex,
          userPrompt: currentScenario.itayPrompt,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (data.gemini?.text) {
        const updatedScenarios = scenarios.map((s) => {
          if (s.id !== selectedScenarioId) return s;
          const updatedRuns = s.runs.map((r) => {
            if (r.runIndex !== selectedRunIndex) return r;
            return {
              ...r,
              gemini: {
                ...r.gemini,
                responseText: data.gemini.text,
                audioBase64: data.gemini.audioBase64 || r.gemini.audioBase64,
              },
            };
          });
          return { ...s, runs: updatedRuns };
        });
        onUpdateScenarios(updatedScenarios);

        // Auto play generated audio
        if (data.gemini.audioBase64) {
          audioController.playBase64Wav(data.gemini.audioBase64);
        } else {
          audioController.speakTextHebrew(data.gemini.text, 'jerry');
        }
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'הרצת התרחיש נכשלה');
    } finally {
      setIsRunningLive(false);
    }
  };

  const calculateRunAverage = (scores: EvaluationScores) => {
    const values = [
      scores.toneShift,
      scores.emotionalFit,
      scores.naturalHebrew,
      scores.characterConsistency,
      scores.spontaneity,
    ];
    const sum = values.reduce((a, b) => a + b, 0);
    return (sum / values.length).toFixed(1);
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {apiError && <p role="alert" className="rounded-xl border border-rose-700 bg-rose-950/40 p-3 text-sm text-rose-200">{apiError}</p>}
      
      {/* Scenario Selector & Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                מעבדת השוואת ביצועים
              </span>
              <h2 className="text-xl font-black text-slate-100">
                Gemini Live מול GPT-Live-1 (פודקאסט ג׳רי הבובה)
              </h2>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              בחינת שינויי טון, עברית טבעית, התאמה רגשית ושמירה על דמות הבובה ללא affective dialog flags
            </p>
          </div>

          {/* Live Scenario Generator Action */}
          <button
            onClick={handleRunLiveScenario}
            disabled={isRunningLive}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm rounded-xl transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${isRunningLive ? 'animate-spin' : ''}`} />
            <span>{isRunningLive ? 'מייצר תגובה חיה מ-Gemini...' : 'הרץ מחדש עם Gemini API'}</span>
          </button>
        </div>

        {/* 5 Scenarios Tab Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-6">
          {scenarios.map((s) => {
            const isSelected = s.id === selectedScenarioId;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedScenarioId(s.id);
                  setSelectedRunIndex(1);
                }}
                className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-bold shadow-md shadow-amber-500/10 scale-[1.02]'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span className="text-xs font-extrabold">{s.title}</span>
                <span className="text-[11px] opacity-80 mt-1 line-clamp-1">{s.category}</span>
              </button>
            );
          })}
        </div>

        {/* Current Scenario Script Card */}
        <div className="bg-slate-950/80 rounded-2xl border border-slate-800 p-5 mb-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-base font-extrabold text-amber-300">
              {currentScenario.title} — {currentScenario.category}
            </h3>
            <span className="text-xs text-slate-400">
              הוראה: להריץ 3 פעמים בדיוק באותו הסדר ובאותן המילים
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {currentScenario.description}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80 text-xs">
            <div className="p-3 bg-blue-950/30 border border-blue-800/40 rounded-xl">
              <span className="font-bold text-blue-400 block mb-1">תסריט איתי (טריגר):</span>
              <p className="text-slate-200 font-semibold">{currentScenario.itayPrompt}</p>
            </div>
            <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl">
              <span className="font-bold text-emerald-400 block mb-1">תגובת היעד הנדרשת:</span>
              <p className="text-slate-200">{currentScenario.targetResponse}</p>
            </div>
          </div>
        </div>

        {/* 3 Runs Selector (ריצה 1, ריצה 2, ריצה 3) */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs font-bold text-slate-300">בחר ריצה:</span>
          {[1, 2, 3].map((runIdx) => {
            const isRunSelected = runIdx === selectedRunIndex;
            return (
              <button
                key={runIdx}
                onClick={() => setSelectedRunIndex(runIdx)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  isRunSelected
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span>ריצה {runIdx}</span>
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>

        {/* Side-by-Side Model Comparison Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Gemini Live System Card */}
          <div className="bg-slate-950/90 rounded-2xl border-2 border-amber-500/50 p-5 flex flex-col justify-between shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-amber-400 to-amber-600"></div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    מערכת A
                  </span>
                  <h4 className="text-base font-black text-slate-100">Gemini Live</h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({currentRun.gemini.voiceName})
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 text-amber-300 font-bold text-xs">
                  <Award className="w-3.5 h-3.5" />
                  <span>ציון ממוצע: {calculateRunAverage(currentRun.gemini.scores)} / 5</span>
                </div>
              </div>

              {/* Response Quote Box */}
              <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 mb-4">
                <span className="text-[10px] font-bold text-amber-400 block mb-1">
                  תגובת ג׳רי שהופקה:
                </span>
                <p className="text-sm text-slate-100 leading-relaxed font-medium">
                  „{currentRun.gemini.responseText}”
                </p>
                
                <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800">
                  <button
                    onClick={() => handlePlayAudio('gemini')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shadow-sm"
                  >
                    <Play className="w-3 h-3" />
                    <span>האזן להקלטה של ג׳רי</span>
                  </button>

                  <span className="text-[11px] text-slate-400">
                    אינטונציה רגשית דרך System Prompt
                  </span>
                </div>
              </div>

              {/* Scoring Form (1-5 Ratings) */}
              <div className="space-y-3 mb-4">
                <h5 className="text-xs font-bold text-slate-300 border-b border-slate-800 pb-1">
                  דירוג 5 המדדים הרשמיים (ציון 1-5):
                </h5>

                {[
                  { key: 'toneShift', label: 'שינוי טון נשמע בבירור' },
                  { key: 'emotionalFit', label: 'הרגש מתאים לרגע' },
                  { key: 'naturalHebrew', label: 'עברית טבעית' },
                  { key: 'characterConsistency', label: 'ג׳רי נשאר אותה דמות' },
                  { key: 'spontaneity', label: 'ספונטנית ולא מוגזמת' },
                ].map(({ key, label }) => {
                  const currentVal = currentRun.gemini.scores[key as keyof EvaluationScores];
                  return (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{label}:</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((val) => (
                          <button
                            key={val}
                            onClick={() => handleScoreChange('gemini', key as keyof EvaluationScores, val)}
                            className={`w-6 h-6 rounded-md font-bold text-xs transition ${
                              val <= currentVal
                                ? 'bg-amber-500 text-slate-950 font-black'
                                : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Separate Voice Evaluation Criteria */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <h6 className="text-[11px] font-bold text-amber-400">
                    מדדי קול נפרדים:
                  </h6>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">ציון הבעה (Expressiveness):</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((val) => (
                        <button
                          key={val}
                          onClick={() => handleScoreChange('gemini', 'expressiveness', val)}
                          className={`w-6 h-6 rounded-md font-bold text-xs transition ${
                            val <= currentRun.gemini.scores.expressiveness
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">דמיון לקול של ג׳רי:</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((val) => (
                        <button
                          key={val}
                          onClick={() => handleScoreChange('gemini', 'voiceSimilarity', val)}
                          className={`w-6 h-6 rounded-md font-bold text-xs transition ${
                            val <= currentRun.gemini.scores.voiceSimilarity
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Specific Event Checkboxes */}
                <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={currentRun.gemini.interruptedItay}
                      onChange={() => handleEventToggle('gemini', 'interruptedItay')}
                      className="accent-amber-500 rounded"
                    />
                    <span>ג׳רי קטע את איתי</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={currentRun.gemini.missedCorrection}
                      onChange={() => handleEventToggle('gemini', 'missedCorrection')}
                      className="accent-red-500 rounded"
                    />
                    <span>ג׳רי פספס תיקון</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Qualitative Notes */}
            <div className="mt-3">
              <label className="text-[11px] font-bold text-slate-400 block mb-1">
                הערות איכותיות על הביצוע:
              </label>
              <textarea
                value={currentRun.gemini.notes}
                onChange={(e) => handleNotesChange('gemini', e.target.value)}
                rows={2}
                placeholder="הוסף הערות על הניואנס הקולי, הנשימות, ההשהיות..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* GPT-Live-1 System Card */}
          <div className="bg-slate-950/90 rounded-2xl border-2 border-slate-700 p-5 flex flex-col justify-between shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-slate-500 to-slate-400"></div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-700 text-slate-200 border border-slate-600">
                    מערכת B
                  </span>
                  <h4 className="text-base font-black text-slate-100">GPT-Live-1</h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({currentRun.gpt.voiceName})
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 text-slate-300 font-bold text-xs">
                  <Award className="w-3.5 h-3.5" />
                  <span>ציון ממוצע: {calculateRunAverage(currentRun.gpt.scores)} / 5</span>
                </div>
              </div>

              {/* Response Quote Box */}
              <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 mb-4">
                <span className="text-[10px] font-bold text-slate-400 block mb-1">
                  תגובת ג׳רי שהופקה:
                </span>
                <p className="text-sm text-slate-100 leading-relaxed font-medium">
                  „{currentRun.gpt.responseText}”
                </p>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800">
                  <button
                    onClick={() => handlePlayAudio('gpt')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs rounded-lg transition shadow-sm"
                  >
                    <Play className="w-3 h-3" />
                    <span>האזן להקלטה של GPT</span>
                  </button>

                  <span className="text-[11px] text-slate-400">
                    תגובה קולית סטנדרטית
                  </span>
                </div>
              </div>

              {/* Scoring Form (1-5 Ratings) */}
              <div className="space-y-3 mb-4">
                <h5 className="text-xs font-bold text-slate-300 border-b border-slate-800 pb-1">
                  דירוג 5 המדדים הרשמיים (ציון 1-5):
                </h5>

                {[
                  { key: 'toneShift', label: 'שינוי טון נשמע בבירור' },
                  { key: 'emotionalFit', label: 'הרגש מתאים לרגע' },
                  { key: 'naturalHebrew', label: 'עברית טבעית' },
                  { key: 'characterConsistency', label: 'ג׳רי נשאר אותה דמות' },
                  { key: 'spontaneity', label: 'ספונטנית ולא מוגזמת' },
                ].map(({ key, label }) => {
                  const currentVal = currentRun.gpt.scores[key as keyof EvaluationScores];
                  return (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{label}:</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((val) => (
                          <button
                            key={val}
                            onClick={() => handleScoreChange('gpt', key as keyof EvaluationScores, val)}
                            className={`w-6 h-6 rounded-md font-bold text-xs transition ${
                              val <= currentVal
                                ? 'bg-slate-300 text-slate-950 font-black'
                                : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Separate Voice Evaluation Criteria */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <h6 className="text-[11px] font-bold text-slate-300">
                    מדדי קול נפרדים:
                  </h6>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">ציון הבעה (Expressiveness):</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((val) => (
                        <button
                          key={val}
                          onClick={() => handleScoreChange('gpt', 'expressiveness', val)}
                          className={`w-6 h-6 rounded-md font-bold text-xs transition ${
                            val <= currentRun.gpt.scores.expressiveness
                              ? 'bg-slate-300 text-slate-950'
                              : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">דמיון לקול של ג׳רי:</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((val) => (
                        <button
                          key={val}
                          onClick={() => handleScoreChange('gpt', 'voiceSimilarity', val)}
                          className={`w-6 h-6 rounded-md font-bold text-xs transition ${
                            val <= currentRun.gpt.scores.voiceSimilarity
                              ? 'bg-slate-300 text-slate-950'
                              : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Specific Event Checkboxes */}
                <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={currentRun.gpt.interruptedItay}
                      onChange={() => handleEventToggle('gpt', 'interruptedItay')}
                      className="accent-slate-400 rounded"
                    />
                    <span>ג׳רי קטע את איתי</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={currentRun.gpt.missedCorrection}
                      onChange={() => handleEventToggle('gpt', 'missedCorrection')}
                      className="accent-red-500 rounded"
                    />
                    <span>ג׳רי פספס תיקון</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Qualitative Notes */}
            <div className="mt-3">
              <label className="text-[11px] font-bold text-slate-400 block mb-1">
                הערות איכותיות על הביצוע:
              </label>
              <textarea
                value={currentRun.gpt.notes}
                onChange={(e) => handleNotesChange('gpt', e.target.value)}
                rows={2}
                placeholder="הוסף הערות על מונוטוניות, פאוסות או דיקציה..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-slate-500"
              />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
