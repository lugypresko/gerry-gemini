import { latency } from '../utils/latency';
import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, Clock3, Loader2, Play, RefreshCw, Volume2 } from 'lucide-react';

type Provider = { id: string; label: string; configured: boolean };
type Result = { provider: Provider; audioBase64?: string; mimeType?: string; modelUsed?: string; latencyMs?: number; requestStart?: number; audioReady?: number; firstPlayback?: number; error?: string };

const TEST_TEXT = 'הכסף?! בואנה, אתה רציני איתי עכשיו? לא, כי אני יושב פה ומצפה שתגיד לי שליחות ונשמה. וואו, הרגת אותי. דוגרי, מעריך את הכנות.';

export function TtsProviderComparisonLab() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [text, setText] = useState(TEST_TEXT);
  const [style, setStyle] = useState('Expressive Hebrew puppet host; surprised, playful, then warm and sincere');
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadProviders = async () => {
    try {
      const response = await fetch('/api/voice-lab/providers');
      const data = await response.json();
      setProviders(data.providers || []);
      setLoadError('');
    } catch {
      setLoadError('לא ניתן לטעון את מצב מנועי הדיבור מהשרת.');
    }
  };
  useEffect(() => { void loadProviders(); }, []);

  const compare = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setResults([]);
    const configured = providers.filter((p) => p.configured);
    const pending = configured.map(async (provider): Promise<Result> => {
      const start = performance.now();
      try {
        const response = await fetch('/api/voice-lab/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, provider: provider.id, style }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        return { provider, ...data, requestStart: start, audioReady: performance.now(), latencyMs: data.latencyMs ?? Math.round(performance.now() - start) };
      } catch (error: any) {
        return { provider, error: error.message || 'Generation failed', latencyMs: Math.round(performance.now() - start) };
      }
    });
    const completed = await Promise.all(pending);
    setResults(completed);
    setBusy(false);
  };

  return <section className="max-w-6xl mx-auto space-y-6" dir="rtl">
    <header className="rounded-3xl border border-indigo-500/30 bg-gradient-to-r from-slate-900 via-indigo-950/50 to-slate-900 p-6">
      <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold"><ArrowRightLeft className="w-4 h-4" /> מעבדת השוואת מנועי דיבור</div>
      <h2 className="mt-2 text-2xl font-black text-white">אותו טקסט. ארבעה מנועים. האזנה והשוואת זמן.</h2>
      <p className="mt-2 text-sm text-slate-300">כל המנועים מקבלים את אותו טקסט ואת אותו ניסוח סגנון. הבקשות נשלחות במקביל; משך יצירת הקול מוצג לכל מנוע.</p>
    </header>

    <div className="grid gap-4 md:grid-cols-2">
      <label className="block rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <span className="mb-2 block text-xs font-bold text-slate-300">טקסט לבדיקה</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm leading-7 text-white" />
      </label>
      <label className="block rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <span className="mb-2 block text-xs font-bold text-slate-300">הנחיית סגנון (נתמכת באופן שונה בכל ספק)</span>
        <textarea value={style} onChange={(e) => setStyle(e.target.value)} rows={5} className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm leading-7 text-white" />
        <span className="mt-2 block text-[11px] text-slate-400">Gemini מקבל את ההנחיה ישירות. OpenAI TTS-1 ו־ElevenLabs לא מקבלים אותה באותו אופן, ולכן זו השוואה של המנועים — לא של תמיכה זהה בבימוי רגשי.</span>
      </label>
    </div>

    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => <span key={p.id} className={`rounded-full border px-3 py-1 text-xs ${p.configured ? 'border-emerald-600/50 bg-emerald-950/40 text-emerald-300' : 'border-slate-700 bg-slate-950 text-slate-500'}`}>{p.label}: {p.configured ? 'מוגדר' : 'חסר מפתח'}</span>)}
        </div>
        <button onClick={() => void loadProviders()} className="rounded-xl border border-slate-700 p-2 text-slate-300" title="רענון מצב המפתחות"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {loadError && <p className="mt-3 text-sm text-rose-300">{loadError}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={() => void compare()} disabled={busy || !text.trim() || !providers.some((p) => p.configured)} className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> משווה במקביל...</> : <><Volume2 className="h-4 w-4" /> הפק והשווה את כל המנועים המוגדרים</>}
        </button>
        <span className="text-xs text-slate-400">העלות תחול על כל ספק שמוגדר ומופעל בניסוי.</span>
      </div>
    </div>

    {results.length > 0 && <div className="grid gap-4 md:grid-cols-2">
      {results.map((r) => <article key={r.provider.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-bold text-white">{r.provider.label}</h3>
          <div className="flex items-center gap-1 text-sm font-mono text-amber-300"><Clock3 className="h-4 w-4" />{r.latencyMs} ms</div>
        </div>
        {r.error ? <p className="mt-4 rounded-xl bg-rose-950/40 p-3 text-sm text-rose-200">{r.error}</p> : <>
          <p className="mt-2 text-xs text-slate-500">{r.modelUsed}</p>
          <p className="mt-2 text-xs text-slate-400">בקשה: {Math.round(r.requestStart || 0)}ms · אודיו: {Math.round((r.audioReady || 0) - (r.requestStart || 0))}ms · ניגון ראשון: {r.firstPlayback === undefined ? '—' : `${Math.round(r.firstPlayback - (r.requestStart || 0))}ms`} (אומדן דפדפן)</p>
          <audio onPlaying={() => { if (r.firstPlayback !== undefined) return; const at = performance.now(); latency.playback('HTMLMediaElement playing event', undefined, 0, r.audioBase64); setResults(current => current.map(item => item.provider.id === r.provider.id ? {...item, firstPlayback: at} : item)); }} className="mt-4 w-full" controls preload="none" src={`data:${r.mimeType};base64,${r.audioBase64}`} />
        </>}
      </article>)}
    </div>}
  </section>;
}
