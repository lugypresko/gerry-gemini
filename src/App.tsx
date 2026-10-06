import React, { useState } from 'react';
import { PodcastStudio } from './components/PodcastStudio';
import { ExperimentLab } from './components/ExperimentLab';
import { BlindTestLab } from './components/BlindTestLab';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { SystemPromptEditor } from './components/SystemPromptEditor';
import { TtsComparisonLab } from './components/TtsComparisonLab';
import { TtsProviderComparisonLab } from './components/TtsProviderComparisonLab';
import { INITIAL_SCENARIOS } from './data/scenarios';
import { Scenario, EvaluationScores } from './types/podcast';
import { DEFAULT_JERRY_SYSTEM_PROMPT } from './constants/prompts';
import {
  Mic2,
  FlaskConical,
  EyeOff,
  BarChart2,
  Sliders,
  Sparkles,
  Radio,
  Zap,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'tts' | 'experiment' | 'blind' | 'analytics' | 'prompt' | 'tts-providers'>('studio');
  const [scenarios, setScenarios] = useState<Scenario[]>(INITIAL_SCENARIOS);
  const [systemPrompt, setSystemPrompt] = useState<string>(DEFAULT_JERRY_SYSTEM_PROMPT);
  const [selectedVoice, setSelectedVoice] = useState<string>('Puck');
  const [activeTtsModel, setActiveTtsModel] = useState<'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts'>('gemini-3.8-flash-lite-tts');

  const handleSaveBlindScores = (
    scenarioId: number,
    runIdx: number,
    geminiScores: EvaluationScores,
    gptScores: EvaluationScores
  ) => {
    setScenarios((prev) =>
      prev.map((s) => {
        if (s.id !== scenarioId) return s;
        return {
          ...s,
          runs: s.runs.map((r) => {
            if (r.runIndex !== runIdx) return r;
            return {
              ...r,
              gemini: {
                ...r.gemini,
                scores: geminiScores,
              },
              gpt: {
                ...r.gpt,
                scores: gptScores,
              },
            };
          }),
        };
      })
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Assistant',sans-serif] selection:bg-amber-500 selection:text-slate-950" dir="rtl">
      
      {/* Top Studio Navbar */}
      <header className="sticky top-0 z-50 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          
          {/* Logo & Podcast Identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
              <Mic2 className="w-5 h-5 font-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-white">
                  פודקאסט ג׳רי הבובה ואיתי
                </h1>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  מעבדת Gemini Live vs GPT-Live
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                השוואת הבעה רגשית וטון דיבור בעברית דרך System Prompt בלבד
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
          <nav className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800/80 overflow-x-auto max-w-full">
            {[
              { id: 'studio', label: 'אולפן חי', icon: Radio },
              { id: 'tts', label: 'השוואת Gemini TTS', icon: Zap },
              { id: 'tts-providers', label: 'השוואת מנועי דיבור', icon: Sparkles },
              { id: 'experiment', label: 'מעבדת הניסוי', icon: FlaskConical },
              { id: 'blind', label: 'מבחן עיוור', icon: EyeOff },
              { id: 'analytics', label: 'דשבורד וסטטיסטיקה', icon: BarChart2 },
              { id: 'prompt', label: 'פרומפט ג׳רי', icon: Sliders },
            ].map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'studio' && (
          <PodcastStudio
            activeTtsModel={activeTtsModel}
            setActiveTtsModel={setActiveTtsModel}
            selectedVoice={selectedVoice}
            systemPrompt={systemPrompt}
          />
        )}

        {activeTab === 'tts' && (
          <TtsComparisonLab
            activeTtsModel={activeTtsModel}
            setActiveTtsModel={setActiveTtsModel}
            selectedVoice={selectedVoice}
            setSelectedVoice={setSelectedVoice}
          />
        )}

        {activeTab === 'tts-providers' && <TtsProviderComparisonLab />}

        {activeTab === 'experiment' && (
          <ExperimentLab
            scenarios={scenarios}
            onUpdateScenarios={setScenarios}
          />
        )}

        {activeTab === 'blind' && (
          <BlindTestLab
            scenarios={scenarios}
            onSaveBlindScores={handleSaveBlindScores}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboard scenarios={scenarios} />
        )}

        {activeTab === 'prompt' && (
          <SystemPromptEditor
            systemPrompt={systemPrompt}
            onUpdateSystemPrompt={setSystemPrompt}
            selectedVoice={selectedVoice}
            onUpdateSelectedVoice={setSelectedVoice}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/50 py-4 px-6 text-center text-xs text-slate-500">
        פודקאסט ג׳רי הבובה & איתי • מעבדת מחקר לבחינת הבעה קולית וטונאלית ב-Gemini Live (ללא Affective Dialog)
      </footer>

    </div>
  );
}
