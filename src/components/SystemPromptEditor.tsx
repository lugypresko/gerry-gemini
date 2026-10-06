import React, { useState } from 'react';
import { audioController } from '../utils/audio';
import { sfxEngine } from '../utils/soundEffects';
import {
  Code2,
  Sparkles,
  Play,
  RotateCcw,
  Check,
  Info,
  Sliders,
  Volume2,
} from 'lucide-react';

interface SystemPromptEditorProps {
  systemPrompt: string;
  onUpdateSystemPrompt: (prompt: string) => void;
  selectedVoice: string;
  onUpdateSelectedVoice: (voice: string) => void;
}

export const SystemPromptEditor: React.FC<SystemPromptEditorProps> = ({
  systemPrompt,
  onUpdateSystemPrompt,
  selectedVoice,
  onUpdateSelectedVoice,
}) => {
  const [promptText, setPromptText] = useState(systemPrompt);
  const [testLine, setTestLine] = useState('הכסף?! באמת?! וואו, לא ציפיתי לזה, לפחות אתה כנה איתי!');
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const availableVoices = [
    { id: 'Puck', label: 'Puck (המומלץ ביותר לבובת ג׳רי - קול תיאטרלי ושובב)' },
    { id: 'Fenrir', label: 'Fenrir (קול עמוק, סמכותי ומשעשע)' },
    { id: 'Zephyr', label: 'Zephyr (קול חם, מאוזן ופודקאסטי)' },
    { id: 'Charon', label: 'Charon (קול רגוע ונמוך)' },
    { id: 'Kore', label: 'Kore (קול בהיר ואנרגטי)' },
  ];

  const handleSave = () => {
    onUpdateSystemPrompt(promptText);
    setSavedSuccess(true);
    sfxEngine.play('lightbulb_ding');
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleTestSpeech = async () => {
    setIsTestingVoice(true);
    try {
      const res = await fetch('/api/gemini/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testLine,
          voiceName: selectedVoice,
          style: 'Hebrew puppet podcast host, expressive and lively',
        }),
      });

      const data = await res.json();
      if (data.audioBase64) {
        audioController.playBase64Wav(data.audioBase64, () => {
          setIsTestingVoice(false);
        });
      } else {
        audioController.speakTextHebrew(
          testLine,
          'jerry',
          undefined,
          () => setIsTestingVoice(false)
        );
      }
    } catch {
      audioController.speakTextHebrew(
        testLine,
        'jerry',
        undefined,
        () => setIsTestingVoice(false)
      );
    }
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {/* Background Explanation Box */}
      <div className="p-5 rounded-3xl bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs space-y-2">
        <div className="flex items-center gap-2 font-bold text-sm text-amber-300">
          <Info className="w-4 h-4" />
          <span>הנחיית הבעה ללא Affective Dialog (Gemini 3.8 Live)</span>
        </div>
        <p className="leading-relaxed">
          במודל Gemini 3.8 Live, המאפיין של Affective Dialog הוסר. לכן, כל המנעד הרגשי, שינויי הטון (טמפו, פיץ׳, ספקנות והפתעה) מונחים <strong>באופן בלעדי דרך ה-System Prompt</strong>, בחירת מילים בעברית, סימני פיסוק מדויקים, ואינטונציות קוליות.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        
        {/* Voice Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Volume2 className="w-4 h-4 text-amber-400" />
            <span>בחירת קול בסיס עבור ג׳רי (Gemini Speech Prebuilt Voice):</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {availableVoices.map((v) => (
              <button
                key={v.id}
                onClick={() => onUpdateSelectedVoice(v.id)}
                className={`p-3 rounded-xl border text-right transition-all text-xs font-semibold ${
                  selectedVoice === v.id
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                    : 'bg-slate-800/70 border-slate-700/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt Editor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-amber-400" />
              <span>הוראות הדמות וה-System Prompt של ג׳רי הבובה:</span>
            </label>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition shadow-md shadow-amber-500/20"
            >
              {savedSuccess ? <Check className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{savedSuccess ? 'נשמר בהצלחה!' : 'שמור שינויים'}</span>
            </button>
          </div>

          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={12}
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-slate-200 leading-relaxed focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Quick Voice & Audio Tester */}
        <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>בדיקת סאונד מיידית לקול של ג׳רי:</span>
          </h4>

          <div className="flex gap-2">
            <input
              type="text"
              value={testLine}
              onChange={(e) => setTestLine(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={handleTestSpeech}
              disabled={isTestingVoice}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isTestingVoice ? 'משמיע...' : 'בדוק קול'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
