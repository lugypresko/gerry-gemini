import React, { useState } from 'react';
import { audioController } from '../utils/audio';
import { sfxEngine } from '../utils/soundEffects';
import {
  Zap,
  Sparkles,
  Play,
  RotateCcw,
  Clock,
  Volume2,
  CheckCircle2,
  AlertCircle,
  Radio,
  Sliders,
  Flame,
  ArrowRightLeft,
  Check,
} from 'lucide-react';

interface ComparisonResult {
  text: string;
  voiceName: string;
  totalRoundTripMs: number;
  flashLite: {
    model: string;
    name: string;
    audioBase64: string | null;
    latencyMs: number;
    status: string;
    error?: string;
    category: string;
  };
  flashTts: {
    model: string;
    name: string;
    audioBase64: string | null;
    latencyMs: number;
    status: string;
    error?: string;
    category: string;
  };
}

interface TtsComparisonLabProps {
  activeTtsModel: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts';
  setActiveTtsModel: (model: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts') => void;
  selectedVoice: string;
  setSelectedVoice: (voice: string) => void;
}

const PRESET_PHRASES = [
  {
    label: 'תשובה מפתיעה וקצבית',
    text: 'הכסף?! בואנה, אתה רציני איתי עכשיו?! לא, כי אני יושב פה ומצפה שתגיד לי שליחות ונשמה... וואו, הרגת אותי!',
  },
  {
    label: 'ספקנות ועקיצה קומית',
    text: 'רגע... שמע שנייה איך זה נשמע מהצד, איתי. אמרת שהצוות עצמאי לגמרי, ואז בשקט הגנבת שאתה מאשר כל פסיק? חחח על מי אתה עובד?',
  },
  {
    label: 'אמפתיה ורגש עמוק',
    text: '...איתי, תעצור שנייה. קח נשימה. שומעים את זה בגרון שלך, אתה נשמע גמור. עזוב רגע פודקאסט וקוד... אתה ישן בכלל בלילות?',
  },
  {
    label: 'תיקון טעות ושינוי כיוון',
    text: 'אה! וואלה? חמישי בלילה?! אופס, פדיחה שלי לגמרי, הייתי סגור על שלישי. אז רגע, שרת קרס בחמישי? מה עשיתם?!',
  },
  {
    label: 'קטיעה ספונטנית בשיחה',
    text: 'רגע, סליחה שאני קוטע אותך! חייב להבין משהו - אתה באמת האמנת שזה יעבוד בפרודקשן בלי נפילות?!',
  },
];

const AVAILABLE_VOICES = [
  { id: 'Puck', name: 'Puck (מומלץ לג׳רי)', desc: 'שובב, אנרגטי, קולי ומלא חיים' },
  { id: 'Charon', name: 'Charon', desc: 'עמוק, שקול, רגוע וסמכותי' },
  { id: 'Kore', name: 'Kore', desc: 'חם, עדין, מלודי ומזמין' },
  { id: 'Fenrir', name: 'Fenrir', desc: 'מחוספס, ישיר, בעל נוכחות חזקה' },
  { id: 'Zephyr', name: 'Zephyr', desc: 'בהיר, צעיר ורענן' },
];

export const TtsComparisonLab: React.FC<TtsComparisonLabProps> = ({
  activeTtsModel,
  setActiveTtsModel,
  selectedVoice,
  setSelectedVoice,
}) => {
  const [testText, setTestText] = useState(PRESET_PHRASES[0].text);
  const [isComparing, setIsComparing] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<'lite' | 'flagship' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRunComparison = async () => {
    if (!testText.trim() || isComparing) return;
    setIsComparing(true);
    setErrorMsg(null);
    audioController.unlockAudio();
    sfxEngine.play('transition_whoosh');

    try {
      const res = await fetch('/api/gemini/compare-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testText.trim(),
          voiceName: selectedVoice,
          style: 'Hebrew podcast host and animated puppet personality',
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: ComparisonResult = await res.json();
      setResult(data);
      sfxEngine.play('lightbulb_ding');
    } catch (err: any) {
      console.error('Failed to run comparison:', err);
      setErrorMsg(err?.message || 'שגיאה ביצירת השמע');
      sfxEngine.play('record_scratch');
    } finally {
      setIsComparing(false);
    }
  };

  const handlePlayAudio = (type: 'lite' | 'flagship', base64: string | null) => {
    if (!base64) return;
    audioController.unlockAudio();
    setCurrentlyPlaying(type);

    audioController.playBase64Wav(base64, () => {
      setCurrentlyPlaying(null);
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              מעבדת השוואת מודלי דיבור (TTS Benchmark)
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Gemini 3.8 Flash-Lite TTS מול Gemini 3.8 Flash TTS
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              השוואת מהירות תגובה (Latency במילישניות), איכות דיבור בעברית, ואינטונציה רגשית עבור דמותו של ג׳רי הבובה.
            </p>
          </div>

          {/* Current Active Studio Model Badge & Selector */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col gap-2 min-w-[260px]">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              מודל פעיל כעת באולפן:
            </span>
            <div className="flex items-center gap-2">
              {activeTtsModel === 'gemini-3.8-flash-lite-tts' ? (
                <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-sm">
                  <Zap className="w-4 h-4 fill-emerald-400" />
                  Gemini 3.8 Flash-Lite TTS (סופר מהיר)
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm">
                  <Sparkles className="w-4 h-4 fill-amber-400" />
                  Gemini 3.8 Flash TTS (דגל / רגשי)
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                onClick={() => {
                  setActiveTtsModel('gemini-3.8-flash-lite-tts');
                  sfxEngine.play('lightbulb_ding');
                }}
                className={`px-2 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
                  activeTtsModel === 'gemini-3.8-flash-lite-tts'
                    ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Zap className="w-3 h-3" />
                Flash-Lite (מהיר)
              </button>
              <button
                onClick={() => {
                  setActiveTtsModel('gemini-3.8-flash-tts');
                  sfxEngine.play('lightbulb_ding');
                }}
                className={`px-2 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
                  activeTtsModel === 'gemini-3.8-flash-tts'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                Flash TTS (דגל)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Control & Input Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-6">
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-2">
            בחר משפט לבדיקה או הקלד טקסט בעברית:
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESET_PHRASES.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => setTestText(preset.text)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition border ${
                  testText === preset.text
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-800'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            rows={3}
            placeholder="הזן משפט בעברית לג׳רי..."
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/60 leading-relaxed resize-none"
          />
        </div>

        {/* Voice Selector & Action Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              קול (Voice):
            </span>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {AVAILABLE_VOICES.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVoice(v.id)}
                  title={v.desc}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    selectedVoice === v.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {v.id}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleRunComparison}
            disabled={isComparing || !testText.trim()}
            className={`px-6 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition shadow-xl ${
              isComparing
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 hover:brightness-110 shadow-amber-500/20 active:scale-95'
            }`}
          >
            {isComparing ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin text-amber-400" />
                מייצר ומודד מהירות בשני המודלים במקביל...
              </>
            ) : (
              <>
                <Flame className="w-4 h-4 fill-slate-950" />
                הפעל מבחן השוואה מקביל (Side-by-Side Benchmark)
              </>
            )}
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}
      </div>

      {/* Comparison Results Cards */}
      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          
          {/* Card 1: Gemini 3.8 Flash-Lite TTS */}
          <div className="bg-slate-900/90 border border-emerald-500/40 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between shadow-xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <Zap className="w-5 h-5 fill-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Gemini 3.8 Flash-Lite TTS</h3>
                    <p className="text-[11px] text-emerald-400 font-bold">מודל סופר-מהיר (High Efficiency / Low Latency)</p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xl font-black text-emerald-400 flex items-center gap-1 justify-end">
                    <Clock className="w-4 h-4" />
                    {result.flashLite.latencyMs}ms
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold">זמן תגובה מקצה לקצה</div>
                </div>
              </div>

              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl text-slate-200 text-sm leading-relaxed min-h-[72px]">
                "{result.text}"
              </div>

              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex items-center justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">מהירות הפקה:</span>
                  <span className="font-bold text-emerald-400">מהירות שיא (~0.5 - 0.9 שניות)</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">התאמה עיקרית:</span>
                  <span>שיחה חיה, צ'אט קולי רציף, שיהוי מינימלי</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">פורמט פלט:</span>
                  <span className="font-mono text-[11px] text-slate-400">WAV (24kHz, 16-bit Mono)</span>
                </div>
              </div>
            </div>

            <div className="pt-6 space-y-3">
              <button
                onClick={() => handlePlayAudio('lite', result.flashLite.audioBase64)}
                disabled={!result.flashLite.audioBase64}
                className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition ${
                  currentlyPlaying === 'lite'
                    ? 'bg-emerald-400 text-slate-950 animate-pulse'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 active:scale-95'
                }`}
              >
                <Play className={`w-4 h-4 ${currentlyPlaying === 'lite' ? 'animate-bounce' : 'fill-slate-950'}`} />
                {currentlyPlaying === 'lite' ? 'משמיע כעת (Flash-Lite)... 🔊' : 'השמע ביצוע Flash-Lite'}
              </button>

              <button
                onClick={() => {
                  setActiveTtsModel('gemini-3.8-flash-lite-tts');
                  sfxEngine.play('lightbulb_ding');
                }}
                className={`w-full py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  activeTtsModel === 'gemini-3.8-flash-lite-tts'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {activeTtsModel === 'gemini-3.8-flash-lite-tts' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    זהו המודל הנבחר כרגע באולפן
                  </>
                ) : (
                  'קבע כמודל הפעיל באולפן הפודקאסט'
                )}
              </button>
            </div>
          </div>

          {/* Card 2: Gemini 3.8 Flash TTS */}
          <div className="bg-slate-900/90 border border-amber-500/40 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between shadow-xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <Sparkles className="w-5 h-5 fill-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Gemini 3.8 Flash TTS</h3>
                    <p className="text-[11px] text-amber-400 font-bold">מודל הדגל (Flagship Voice & Emotion Design)</p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xl font-black text-amber-400 flex items-center gap-1 justify-end">
                    <Clock className="w-4 h-4" />
                    {result.flashTts.latencyMs}ms
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold">זמן תגובה מקצה לקצה</div>
                </div>
              </div>

              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl text-slate-200 text-sm leading-relaxed min-h-[72px]">
                "{result.text}"
              </div>

              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex items-center justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">עושר הבעה:</span>
                  <span className="font-bold text-amber-400">מקסימלי (צחוק, אנחות, אינטונציה עמוקה)</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">תכונות מתקדמות:</span>
                  <span>Voice Design, תמיכה ב-vocal bursts ו-backchanneling</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">פורמט פלט:</span>
                  <span className="font-mono text-[11px] text-slate-400">WAV (24kHz, 16-bit Mono)</span>
                </div>
              </div>
            </div>

            <div className="pt-6 space-y-3">
              <button
                onClick={() => handlePlayAudio('flagship', result.flashTts.audioBase64)}
                disabled={!result.flashTts.audioBase64}
                className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition ${
                  currentlyPlaying === 'flagship'
                    ? 'bg-amber-400 text-slate-950 animate-pulse'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 active:scale-95'
                }`}
              >
                <Play className={`w-4 h-4 ${currentlyPlaying === 'flagship' ? 'animate-bounce' : 'fill-slate-950'}`} />
                {currentlyPlaying === 'flagship' ? 'משמיע כעת (Flash TTS)... 🎭' : 'השמע ביצוע Flash TTS'}
              </button>

              <button
                onClick={() => {
                  setActiveTtsModel('gemini-3.8-flash-tts');
                  sfxEngine.play('lightbulb_ding');
                }}
                className={`w-full py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  activeTtsModel === 'gemini-3.8-flash-tts'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {activeTtsModel === 'gemini-3.8-flash-tts' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-amber-400" />
                    זהו המודל הנבחר כרגע באולפן
                  </>
                ) : (
                  'קבע כמודל הפעיל באולפן הפודקאסט'
                )}
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Comparison Summary / Recommendation Guide */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
        <h4 className="text-sm font-black text-white mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-amber-400" />
          סיכום והמלצות שימוש בניסוי של ג׳רי
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
            <span className="font-bold text-emerald-400 block mb-1">⚡ מתי להשתמש ב-Gemini 3.8 Flash-Lite TTS?</span>
            כאשר המטרה היא שיחה חיה, מהירה ודינמית ללא שיהוי, שבה רוצים שג׳רי יענה תוך פחות משנייה ברגע שסיימת לדבר. מתאים במיוחד לפודקאסט חי בזמן אמת.
          </div>
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
            <span className="font-bold text-amber-400 block mb-1">🎭 מתי להשתמש ב-Gemini 3.8 Flash TTS?</span>
            כאשר המטרה היא לבחון את שיא ההבעה הרגשית של גוגל, עומק המשחק של הבובה, צחוקים ספונטניים, שינויי אינטונציה מורכבים והפסקות דרמטיות.
          </div>
        </div>
      </div>
    </div>
  );
};
