import React, { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Mic, MicOff, Radio, Trash2 } from 'lucide-react';

type Line = { id: number; speaker: 'איתי' | 'ג׳רי' | 'מערכת'; text: string };
type TtsProvider = { id: string; label: string; configured: boolean };
type SpokenReply = { text: string; audioBase64: string; mimeType: string; ttsMs: number };
type Strategy = 'turn' | 'chunks' | 'backchannel' | 'two-stage';

function floatToBase64Pcm(input: Float32Array): string {
  const pcm = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length)));
  }
  return btoa(binary);
}

export function LiveConversationLab({ systemPrompt }: { systemPrompt: string }) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState('');
  const [providers, setProviders] = useState<TtsProvider[]>([]);
  const [strategy, setStrategy] = useState<Strategy>('turn');
  const [ttsProvider, setTtsProvider] = useState('gemini-lite');
  const [testInput, setTestInput] = useState('מה בעצם הביא אותך לעבוד פה?');
  const [strategyBusy, setStrategyBusy] = useState(false);
  const [strategyError, setStrategyError] = useState('');
  const [strategyLines, setStrategyLines] = useState<SpokenReply[]>([]);
  const [firstAudioMs, setFirstAudioMs] = useState<number | null>(null);
  const [totalStrategyMs, setTotalStrategyMs] = useState<number | null>(null);
  const sessionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlaybackTimeRef = useRef(0);
  const lineIdRef = useRef(0);

  useEffect(() => {
    fetch('/api/voice-lab/providers').then((response) => response.json()).then((data) => {
      const available = (data.providers || []) as TtsProvider[];
      setProviders(available);
      const first = available.find((provider) => provider.configured);
      if (first) setTtsProvider(first.id);
    }).catch(() => setStrategyError('לא ניתן לטעון את מצב ספקי הדיבור.'));
  }, []);

  const addLine = (speaker: Line['speaker'], text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    setLines((current) => [...current, { id: ++lineIdRef.current, speaker, text: normalized }]);
  };

  const stopOutput = () => {
    for (const source of outputSourcesRef.current) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    outputSourcesRef.current = [];
    const context = outputContextRef.current;
    nextPlaybackTimeRef.current = context?.currentTime ?? 0;
  };

  const queuePcmAudio = (encoded: string) => {
    const context = outputContextRef.current;
    if (!context || !encoded) return;
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const usableBytes = bytes.length - (bytes.length % 2);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, usableBytes / 2);
    if (!samples.length) return;
    const buffer = context.createBuffer(1, samples.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.025, nextPlaybackTimeRef.current);
    source.start(startAt);
    nextPlaybackTimeRef.current = startAt + buffer.duration;
    outputSourcesRef.current.push(source);
    source.onended = () => {
      outputSourcesRef.current = outputSourcesRef.current.filter((item) => item !== source);
    };
  };

  const stopSession = async () => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    try { sessionRef.current?.close(); } catch { /* session already closed */ }
    sessionRef.current = null;
    stopOutput();
    await inputContextRef.current?.close().catch(() => undefined);
    await outputContextRef.current?.close().catch(() => undefined);
    inputContextRef.current = null;
    outputContextRef.current = null;
    setStatus('idle');
  };

  const startSession = async () => {
    if (status === 'connecting' || status === 'live') return;
    setError('');
    setStatus('connecting');
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      micStreamRef.current = mic;
      const tokenResponse = await fetch('/api/voice-lab/live-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt }),
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.token) throw new Error(tokenData.error || 'יצירת טוקן Live נכשלה');

      const outputContext = new AudioContext({ sampleRate: 24000 });
      await outputContext.resume();
      outputContextRef.current = outputContext;
      const inputContext = new AudioContext({ sampleRate: 16000 });
      await inputContext.resume();
      inputContextRef.current = inputContext;

      const { GoogleGenAI, Modality } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: tokenData.token, httpOptions: { apiVersion: 'v1beta' } });
      const session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => addLine('מערכת', 'מחובר ל־Gemini Live. אפשר להתחיל לדבר.'),
          onmessage: (message: any) => {
            const content = message.serverContent;
            if (content?.interrupted) stopOutput();
            const heard = content?.inputTranscription?.text;
            if (heard) addLine('איתי', heard);
            const said = content?.outputTranscription?.text;
            if (said) addLine('ג׳רי', said);
            const parts = content?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) queuePcmAudio(part.inlineData.data);
            }
          },
          onerror: (event: any) => {
            setError(event?.message || 'שגיאת חיבור ל־Gemini Live');
            setStatus('error');
          },
          onclose: (event: any) => {
            if (sessionRef.current) {
              setStatus('idle');
              if (event?.reason) addLine('מערכת', `החיבור נסגר: ${event.reason}`);
            }
          },
        },
      });
      sessionRef.current = session;

      const source = inputContext.createMediaStreamSource(mic);
      const processor = inputContext.createScriptProcessor(1024, 1, 1);
      const muted = inputContext.createGain();
      muted.gain.value = 0;
      processor.onaudioprocess = (event) => {
        if (sessionRef.current !== session) return;
        const data = floatToBase64Pcm(event.inputBuffer.getChannelData(0));
        session.sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } });
      };
      source.connect(processor);
      processor.connect(muted);
      muted.connect(inputContext.destination);
      sourceRef.current = source;
      processorRef.current = processor;
      setStatus('live');
    } catch (cause: any) {
      await stopSession();
      const message = cause?.message || 'לא ניתן להתחבר ל־Gemini Live';
      setError(message);
      setStatus('error');
      addLine('מערכת', message);
    }
  };

  const requestReply = async (userMessage: string, kind: 'full' | 'opening' | 'continuation' = 'full', previousAssistantText = '') => {
    const response = await fetch('/api/voice-lab/reply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage, kind, previousAssistantText }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'יצירת התשובה נכשלה');
    return String(data.reply || '').trim();
  };

  const requestSpeech = async (text: string): Promise<SpokenReply> => {
    const started = performance.now();
    const response = await fetch('/api/voice-lab/speak', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, provider: ttsProvider, style: 'Expressive Hebrew podcast host, natural emotional delivery' }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'יצירת האודיו נכשלה');
    return { text, audioBase64: data.audioBase64, mimeType: data.mimeType, ttsMs: data.latencyMs ?? Math.round(performance.now() - started) };
  };

  const playSpeech = (utterance: SpokenReply) => new Promise<void>((resolve, reject) => {
    const audio = new Audio(`data:${utterance.mimeType};base64,${utterance.audioBase64}`);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error('הדפדפן לא הצליח לנגן את האודיו'));
    audio.play().catch(reject);
  });

  const runStrategy = async () => {
    if (!testInput.trim() || strategyBusy) return;
    setStrategyBusy(true);
    setStrategyError('');
    setStrategyLines([]);
    setFirstAudioMs(null);
    setTotalStrategyMs(null);
    const started = performance.now();
    let firstOutputAt: number | null = null;
    const append = (line: SpokenReply) => {
      if (firstOutputAt === null) {
        firstOutputAt = performance.now();
        setFirstAudioMs(Math.round(firstOutputAt - started));
      }
      setStrategyLines((current) => [...current, line]);
      return playSpeech(line);
    };
    try {
      if (strategy === 'turn') {
        const reply = await requestReply(testInput);
        await append(await requestSpeech(reply));
      } else if (strategy === 'chunks') {
        const reply = await requestReply(testInput);
        const chunks = reply.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [reply];
        for (const chunk of chunks) await append(await requestSpeech(chunk));
      } else if (strategy === 'backchannel') {
        const replyPromise = requestReply(testInput);
        const backchannelPromise = requestSpeech('אה... רגע, תן לי שנייה לחשוב על זה.');
        await append(await backchannelPromise);
        const reply = await replyPromise;
        await append(await requestSpeech(reply));
      } else {
        const opening = await requestReply(testInput, 'opening');
        const openingSpeechPromise = requestSpeech(opening);
        const continuationPromise = requestReply(testInput, 'continuation', opening);
        await append(await openingSpeechPromise);
        const continuation = await continuationPromise;
        await append(await requestSpeech(continuation));
      }
    } catch (cause: any) {
      setStrategyError(cause?.message || 'הניסוי נכשל');
    } finally {
      setTotalStrategyMs(Math.round(performance.now() - started));
      setStrategyBusy(false);
    }
  };

  useEffect(() => () => { void stopSession(); }, []);

  return <section className="max-w-5xl mx-auto space-y-5" dir="rtl">
    <header className="rounded-3xl border border-rose-500/30 bg-gradient-to-r from-slate-900 via-rose-950/40 to-slate-900 p-6">
      <div className="flex items-center gap-2 text-rose-300 text-xs font-bold"><Radio className="h-4 w-4" /> בדיקת שיחה חיה</div>
      <h2 className="mt-2 text-2xl font-black text-white">ג׳רי מקשיב ומגיב בזמן אמת</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">המסך הזה מחבר את המיקרופון ישירות ל־Gemini Live. האודיו נכנס ברצף, התשובה חוזרת במנות, וג׳רי מפסיק לנגן כשהוא מזהה שאתה נכנס לדבר.</p>
    </header>

    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center gap-3">
        {status === 'live' ? <button onClick={() => void stopSession()} className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-black text-white"><MicOff className="h-4 w-4" /> סיים שיחה</button> : <button onClick={() => void startSession()} disabled={status === 'connecting'} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-60">{status === 'connecting' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}{status === 'connecting' ? 'מתחבר ומבקש הרשאת מיקרופון…' : 'התחל שיחת Live'}</button>}
        <span className={`rounded-full border px-3 py-1.5 text-xs font-bold ${status === 'live' ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300' : status === 'error' ? 'border-rose-500/50 bg-rose-950/40 text-rose-300' : 'border-slate-700 bg-slate-950 text-slate-400'}`}>{status === 'live' ? 'LIVE · Gemini 3.8 Live' : status === 'connecting' ? 'מתחבר' : status === 'error' ? 'שגיאה' : 'לא מחובר'}</span>
        {lines.length > 0 && <button onClick={() => setLines([])} className="mr-auto flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400"><Trash2 className="h-3.5 w-3.5" /> נקה תמליל</button>}
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-700/50 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
      <div className="mt-5 min-h-56 space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        {lines.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">התמליל יופיע כאן במהלך השיחה.</p> : lines.map((line) => <div key={line.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="mb-1 text-xs font-bold text-amber-300">{line.speaker}</div><p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{line.text}</p></div>)}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">נדרש GEMINI_API_KEY תקין בשרת והרשאת מיקרופון בדפדפן. הטוקן שנשלח לדפדפן חד־פעמי וקצר־חיים. הקלטת השיחה אינה נשמרת.</p>
    </div>

    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4">
        <h3 className="text-xl font-black text-white">השוואת דרכי תגובה</h3>
        <p className="mt-1 text-sm leading-6 text-slate-400">בדיקה מבוקרת של ארבע דרכי שיחה לאחר שאיתי סיים משפט. בחר ספק קול אחד כדי להשוות רק את חוויית התגובה.</p>
      </div>
      <label className="mb-4 block text-xs font-bold text-slate-300">משפט הבדיקה<textarea value={testInput} onChange={(event) => setTestInput(event.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white" /></label>
      <div className="grid gap-2 sm:grid-cols-2">
        {([
          ['turn', 'תור רגיל', 'ממתינים לתשובה המלאה ואז מפיקים ומנגנים אודיו.'],
          ['chunks', 'אודיו במקטעי משפטים', 'מייצרים טקסט מלא מראש, ואז מפיקים ומנגנים כל משפט בנפרד.'],
          ['backchannel', 'תגובת ביניים', 'ג׳רי אומר מיד משפט ביניים בזמן שתשובתו המלאה נוצרת.'],
          ['two-stage', 'תגובה בשני שלבים', 'משפט פתיחה קצר נוצר ומתחיל לדבר בזמן שההמשך נוצר.'],
        ] as [Strategy, string, string][]).map(([id, label, description]) => <button key={id} onClick={() => setStrategy(id)} className={`rounded-xl border p-3 text-right ${strategy === id ? 'border-amber-500 bg-amber-950/30' : 'border-slate-800 bg-slate-950/50'}`}><span className="block text-sm font-bold text-white">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-400">{description}</span></button>)}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold text-slate-300">מנוע דיבור<select value={ttsProvider} onChange={(event) => setTtsProvider(event.target.value)} className="mt-1 block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{providers.map((provider) => <option key={provider.id} value={provider.id} disabled={!provider.configured}>{provider.label}{provider.configured ? '' : ' — לא הוגדר'}</option>)}</select></label>
        <button onClick={() => void runStrategy()} disabled={strategyBusy || !testInput.trim() || !providers.some((provider) => provider.id === ttsProvider && provider.configured)} className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50">{strategyBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}{strategyBusy ? 'מריץ ניסוי…' : 'הרץ את דרך התגובה'}</button>
        {firstAudioMs !== null && <span className="text-xs text-slate-300">זמן עד תחילת תגובה: <b className="font-mono text-emerald-300">{firstAudioMs}ms</b></span>}
        {totalStrategyMs !== null && <span className="text-xs text-slate-300">זמן כולל: <b className="font-mono text-amber-300">{totalStrategyMs}ms</b></span>}
      </div>
      {strategyError && <p role="alert" className="mt-3 rounded-xl bg-rose-950/40 p-3 text-sm text-rose-200">{strategyError}</p>}
      {strategyLines.length > 0 && <div className="mt-4 space-y-3">{strategyLines.map((line, index) => <div key={`${index}-${line.text}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="mb-2 text-sm leading-6 text-white">{line.text}</p><audio controls preload="none" className="w-full" src={`data:${line.mimeType};base64,${line.audioBase64}`} /><p className="mt-1 text-[11px] text-slate-500">TTS: {line.ttsMs}ms</p></div>)}</div>}
      <p className="mt-4 text-[11px] leading-5 text-slate-500">״אודיו במקטעי משפטים״ מפצל אחרי יצירת הטקסט המלא — הוא בוחן נגינה הדרגתית, לא streaming של יצירת הטקסט. Gemini Live למעלה הוא מסלול השיחה הקולי הרציף.</p>
    </div>
  </section>;
}
