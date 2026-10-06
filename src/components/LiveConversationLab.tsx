import { ConversationAudio, consumeSpeechStream, downloadBlob } from '../utils/conversationAudio';
import { latency } from '../utils/latency';
import React, { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Mic, MicOff, Radio, Trash2 } from 'lucide-react';

type Line = { id: number; speaker: 'איתי' | 'ג׳רי' | 'מערכת'; text: string; at: number };
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
  const [liveProvider, setLiveProvider] = useState('gemini');
  const [openaiConfigured,setOpenaiConfigured] = useState(false);
  const [recording,setRecording] = useState(false);
  const [recordingSeconds,setRecordingSeconds] = useState(0);
  const [recordingBlob,setRecordingBlob] = useState<Blob | null>(null);
  const [micLevel,setMicLevel] = useState(0);
  const [captureBusy,setCaptureBusy] = useState(false);
  const graphRef=useRef<ConversationAudio | null>(null);
  const pcRef=useRef<RTCPeerConnection | null>(null);
  const dcRef=useRef<RTCDataChannel | null>(null);
  const abortRef=useRef<AbortController | null>(null);
  const captureRef=useRef<MediaRecorder | null>(null);
  const captureStreamRef=useRef<MediaStream | null>(null);
  const meterRef=useRef<number | null>(null);
  const [liveConfigured, setLiveConfigured] = useState<boolean | null>(null);
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
  const firstOutputRef = useRef<number | null>(null);
  const strategyStartRef = useRef(0);
  const liveTimingRef = useRef<number | null>(null);
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
      setLiveConfigured(Boolean(data.live?.configured));setOpenaiConfigured(Boolean(data.openaiLive?.configured));
      const first = available.find((provider) => provider.configured);
      if (first) setTtsProvider(first.id);
    }).catch(() => setStrategyError('לא ניתן לטעון את מצב ספקי הדיבור.'));
  }, []);

  const addLine = (speaker: Line['speaker'], text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    setLines((current) => [...current, { id: ++lineIdRef.current, speaker, text: normalized, at: Date.now() }]);
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
    if(graphRef.current) source.connect(graphRef.current.mix);
    const startAt = Math.max(context.currentTime + 0.025, nextPlaybackTimeRef.current);
    source.start(startAt);
    if (liveTimingRef.current !== null) { latency.ready(liveTimingRef.current, 'audioReady'); latency.playback('Web Audio scheduled start (session-level, not turn latency)', liveTimingRef.current, (startAt - context.currentTime) * 1000); }
    nextPlaybackTimeRef.current = startAt + buffer.duration;
    outputSourcesRef.current.push(source);
    source.onended = () => {
      outputSourcesRef.current = outputSourcesRef.current.filter((item) => item !== source);
    };
  };

  const stopSession = async () => {
    const saved=await graphRef.current?.stopRecording();if(saved)setRecordingBlob(saved);setRecording(false);
    dcRef.current?.close();pcRef.current?.close();dcRef.current=null;pcRef.current=null;
    if(meterRef.current!==null)cancelAnimationFrame(meterRef.current);setMicLevel(0);
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    const activeSession = sessionRef.current;
    sessionRef.current = null;
    try { activeSession?.close(); } catch { /* session already closed */ }
    stopOutput();
    await inputContextRef.current?.close().catch(() => undefined);
    if(graphRef.current)await graphRef.current.close();graphRef.current=null;
    inputContextRef.current = null;
    outputContextRef.current = null;
    setStatus('idle');
  };

  const startSession = async () => {
    if (status === 'connecting' || status === 'live') return;
    if(recording)await finishRecording();
    if(graphRef.current){await graphRef.current.close();graphRef.current=null;}
    if (liveProvider === 'gemini' && liveConfigured === false) { setError('חסר GEMINI_API_KEY בשרת'); return; }
    setError('');
    setStatus('connecting');
    liveTimingRef.current = latency.begin('Gemini Live: session start → first response');
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      micStreamRef.current = mic;
      const graph=new ConversationAudio();graphRef.current=graph;await graph.resume();graph.connectStream(mic);
      outputContextRef.current=graph.context;
      const analyser=graph.context.createAnalyser();analyser.fftSize=256;const meter=graph.context.createMediaStreamSource(mic);meter.connect(analyser);const values=new Float32Array(analyser.fftSize);
      const tick=()=>{analyser.getFloatTimeDomainData(values);setMicLevel(Math.min(1,Math.sqrt(values.reduce((sum,x)=>sum+x*x,0)/values.length)*6));meterRef.current=requestAnimationFrame(tick);};tick();
      if(liveProvider==='openai') {await startOpenai(mic,graph);return;}
      const tokenResponse = await fetch('/api/voice-lab/live-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt }),
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.token) throw new Error(tokenData.error || 'יצירת טוקן Live נכשלה');


      const inputContext = new AudioContext({ sampleRate: 16000 });
      await inputContext.resume();
      inputContextRef.current = inputContext;

      const { GoogleGenAI, Modality } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: tokenData.token, httpOptions: { apiVersion: 'v1beta' } });
      const session = await ai.live.connect({
        model: tokenData.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction:systemPrompt,
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
            if (said) { addLine('ג׳רי', said); if (liveTimingRef.current !== null) latency.ready(liveTimingRef.current, 'textReady'); }
            const parts = content?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) queuePcmAudio(part.inlineData.data);
            }
          },
          onerror: (event: any) => {
            setError(event?.message || 'שגיאת חיבור ל־Gemini Live');
            void stopSession().then(()=>setStatus('error'));
          },
          onclose: (event: any) => {
            if (sessionRef.current) {
              void stopSession();
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

  const finishRecording = async () => {
    const blob=await graphRef.current?.stopRecording();setRecording(false);if(blob)setRecordingBlob(blob);if(captureStreamRef.current && captureRef.current?.state!=='recording'){captureStreamRef.current.getTracks().forEach(t=>t.stop());captureStreamRef.current=null;}
  };
  const beginRecording = async () => {
    try {let graph=graphRef.current;if(!graph){graph=new ConversationAudio();graphRef.current=graph;await graph.resume();}
      if(!micStreamRef.current && !captureStreamRef.current){const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true}});captureStreamRef.current=mic;graph.connectStream(mic);}
      setRecordingBlob(null);graph.startRecording();setRecordingSeconds(0);setRecording(true);
    }catch(cause:any){setError(cause.message || 'לא ניתן להקליט');}
  };
  useEffect(()=>{if(!recording)return;const timer=setInterval(()=>setRecordingSeconds(v=>v+1),1000);return ()=>clearInterval(timer);},[recording]);
  const startOpenai = async (mic:MediaStream,graph:ConversationAudio) => {
    const pc=new RTCPeerConnection();pcRef.current=pc;const dc=pc.createDataChannel('oai-events');dcRef.current=dc;
    for(const track of mic.getTracks())pc.addTrack(track,mic);
    pc.ontrack=event=>graph.connectStream(event.streams[0] || new MediaStream([event.track]),true);
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'){setError('חיבור WebRTC נכשל');void stopSession().then(()=>setStatus('error'));}};
    dc.onmessage=event=>{try{const message=JSON.parse(event.data);
      if(message.type==='session.started'){setStatus('live');addLine('מערכת','מחובר ל־GPT-Live. אפשר לדבר.');}
      if(message.type==='session.input_transcript.delta')addLine('איתי',message.delta || '');
      if(message.type==='session.output_transcript.delta'){addLine('ג׳רי',message.delta || '');if(liveTimingRef.current!==null)latency.ready(liveTimingRef.current,'textReady');}
      if(message.type==='session.closed')void stopSession();
      if(message.type==='error'){setError('GPT-Live: '+(message.error?.code || 'session error'));void stopSession().then(()=>setStatus('error'));}
    }catch{setError('אירוע GPT-Live לא תקין');}};
    await pc.setLocalDescription(await pc.createOffer());
    if(pc.iceGatheringState!=='complete')await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',check);reject(new Error('ICE gathering timeout'));},10000);const check=()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();}};pc.addEventListener('icegatheringstatechange',check);check();});
    const response=await fetch('/api/voice-lab/openai-live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sdp:pc.localDescription?.sdp,systemPrompt})});
    const result=await response.json();if(!response.ok)throw new Error(result.error || 'GPT-Live session failed');
    await pc.setRemoteDescription({type:'answer',sdp:result.transport.sdp});
  };
  const endLive = () => {
    const closing=pcRef.current; if(dcRef.current?.readyState==='open'){dcRef.current.send(JSON.stringify({type:'session.close'}));setTimeout(()=>{if(pcRef.current===closing && closing) {addLine('מערכת','סגירת החיבור לא אושרה; שימוש סופי לא אומת.');void stopSession();}},15000);}else void stopSession();
  };
  const captureInput = async () => {
    if(captureRef.current?.state==='recording'){captureRef.current.stop();return;}
    try {const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});captureStreamRef.current=mic;
      const graph=graphRef.current || new ConversationAudio();graphRef.current=graph;await graph.resume();graph.connectStream(mic);
      const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(x=>MediaRecorder.isTypeSupported(x));const recorder=new MediaRecorder(mic,mime?{mimeType:mime}:undefined);captureRef.current=recorder;const chunks:Blob[]=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=async()=>{if(!recording){mic.getTracks().forEach(t=>t.stop());captureStreamRef.current=null;}setCaptureBusy(true);try{const blob=new Blob(chunks,{type:recorder.mimeType});const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('קריאת ההקלטה נכשלה'));reader.readAsDataURL(blob);});const response=await fetch('/api/gemini/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({audioBase64:data,mimeType:recorder.mimeType})});const result=await response.json();if(!response.ok)throw new Error(result.error);setTestInput(result.transcript);addLine('איתי',result.transcript);}catch(cause:any){setStrategyError(cause.message);}finally{captureRef.current=null;setCaptureBusy(false);}};recorder.start();setCaptureBusy(true);
    }catch(cause:any){setStrategyError(cause.message || 'המיקרופון חסום');}
  };
  const requestReply = async (userMessage: string, kind: 'full' | 'opening' | 'continuation' = 'full', previousAssistantText = '') => {
    const response = await fetch('/api/voice-lab/reply', {
      signal:abortRef.current?.signal,
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage, kind, previousAssistantText, systemPrompt }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'יצירת התשובה נכשלה');
    return String(data.reply || '').trim();
  };

  const requestSpeech = async (text: string): Promise<SpokenReply> => {
    const started = performance.now();
    const response = await fetch('/api/voice-lab/speak', {
      signal:abortRef.current?.signal,
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, provider: ttsProvider, style: 'Expressive Hebrew podcast host, natural emotional delivery' }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'יצירת האודיו נכשלה');
    return { text, audioBase64: data.audioBase64, mimeType: data.mimeType, ttsMs: data.latencyMs ?? Math.round(performance.now() - started) };
  };

  const getGraph = async () => {if(!graphRef.current)graphRef.current=new ConversationAudio();await graphRef.current.resume();return graphRef.current;};
  const markFirst = () => {if(firstOutputRef.current===null){firstOutputRef.current=performance.now();setFirstAudioMs(Math.round(firstOutputRef.current-strategyStartRef.current));}};
  const playSpeech = async (utterance:SpokenReply) => {const graph=await getGraph();await graph.playEncoded(utterance.audioBase64,utterance.mimeType);markFirst();latency.playback('Web Audio scheduled start',undefined,25,utterance.audioBase64);await graph.drained();};
  const streamSpeech = async (text:string) => {
    const graph=await getGraph();
    const abort=abortRef.current!;const response=await fetch('/api/voice-lab/speak-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,provider:ttsProvider}),signal:abort.signal});
    const sampleId=latency.forResponse(response);
    graph.onFirstAudio=()=>{markFirst();latency.playback('Web Audio scheduled start; speaker latency unmeasured',sampleId,25);};
    try{await consumeSpeechStream(response,graph,abort.signal,()=>{if(sampleId)latency.ready(sampleId,'audioReady');});addLine('ג׳רי',text);}finally{graph.onFirstAudio=undefined;}
  };

  const runStrategy = async () => {
    if (!testInput.trim() || strategyBusy) return;
    abortRef.current=new AbortController();
    setStrategyBusy(true);
    setStrategyError('');
    setStrategyLines([]);
    setFirstAudioMs(null);
    setTotalStrategyMs(null);
    const started = performance.now();
    strategyStartRef.current = started;
    firstOutputRef.current = null;
    const append = (line: SpokenReply) => {
      if(abortRef.current?.signal.aborted)throw new DOMException('Cancelled','AbortError');
      setStrategyLines((current) => [...current, line]);
      addLine('ג׳רי',line.text);return playSpeech(line);
    };
    try {
      if (strategy === 'turn') {
        const reply = await requestReply(testInput);
        await append(await requestSpeech(reply));
      } else if (strategy === 'chunks') {
        const reply = await requestReply(testInput);
        await streamSpeech(reply);
      } else if (strategy === 'backchannel') {
        const replyPromise = requestReply(testInput);
        void replyPromise.catch(()=>undefined);
        const cue = /סיוט|עומס|קשה|מפחד/.test(testInput) ? 'אני איתך.' : /כסף/.test(testInput) ? 'וואלה…' : /\?/.test(testInput) ? 'רגע, תן לי לחשוב.' : 'אני מקשיב.';
        const backchannelPromise = requestSpeech(cue);
        await append(await backchannelPromise);
        const reply = await replyPromise;
        await append(await requestSpeech(reply));
      } else {
        const opening = await requestReply(testInput, 'opening');
        const openingSpeechPromise = requestSpeech(opening);
        const continuationPromise = requestReply(testInput, 'continuation', opening).then(requestSpeech);
        void continuationPromise.catch(()=>undefined);
        await append(await openingSpeechPromise);
        const continuation = await continuationPromise;
        await append(continuation);
      }
    } catch (cause: any) {
      setStrategyError(cause?.name==='AbortError' ? 'התשובה נעצרה' : cause?.message || 'הניסוי נכשל');
    } finally {
      setTotalStrategyMs(Math.round(performance.now() - started));
      setStrategyBusy(false);
    }
  };

  useEffect(() => () => {abortRef.current?.abort();captureStreamRef.current?.getTracks().forEach(t=>t.stop());if(captureRef.current?.state==='recording')captureRef.current.stop();void stopSession();}, []);

  return <section className="max-w-5xl mx-auto space-y-5" dir="rtl">
    <header className="rounded-3xl border border-rose-500/30 bg-gradient-to-r from-slate-900 via-rose-950/40 to-slate-900 p-6">
      <div className="flex items-center gap-2 text-rose-300 text-xs font-bold"><Radio className="h-4 w-4" /> בדיקת שיחה חיה</div>
      <h2 className="mt-2 text-2xl font-black text-white">ג׳רי מקשיב ומגיב בזמן אמת</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">בחר Gemini Live או GPT-Live לשיחה קולית רציפה. המפתח נשאר בשרת. האודיו נכנס ברצף, התשובה חוזרת במנות, וג׳רי מפסיק לנגן כשהוא מזהה שאתה נכנס לדבר.</p>
    </header>

    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <label>מנוע שיחה חיה<select aria-label="מנוע שיחה חיה" disabled={status==='live' || status==='connecting'} value={liveProvider} onChange={e=>setLiveProvider(e.target.value)} className="m-2 rounded bg-slate-800 p-2"><option value="gemini">Gemini 3.8 Live</option><option value="openai">OpenAI GPT-Live-1</option></select></label>
      <div className="flex flex-wrap items-center gap-3">
        {status === 'live' ? <button onClick={endLive} className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-black text-white"><MicOff className="h-4 w-4" /> סיים שיחה</button> : <button onClick={() => void startSession()} disabled={status === 'connecting' || (liveProvider==='gemini' ? liveConfigured!==true : !openaiConfigured)} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-60">{status === 'connecting' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}{status === 'connecting' ? 'מתחבר ומבקש הרשאת מיקרופון…' : 'התחל שיחת Live'}</button>}
        <span className={`rounded-full border px-3 py-1.5 text-xs font-bold ${status === 'live' ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300' : status === 'error' ? 'border-rose-500/50 bg-rose-950/40 text-rose-300' : 'border-slate-700 bg-slate-950 text-slate-400'}`}>{status === 'live' ? `LIVE · ${liveProvider==='gemini'?'Gemini 3.8 Live':'GPT-Live-1'}` : status === 'connecting' ? 'מתחבר' : status === 'error' ? 'שגיאה' : 'לא מחובר'}</span>
        {lines.length > 0 && <button onClick={() => setLines([])} className="mr-auto flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400"><Trash2 className="h-3.5 w-3.5" /> נקה תמליל</button>}
      </div>
      <div className="my-3 flex flex-wrap gap-3"><button disabled={recording} onClick={()=>void beginRecording()} className="rounded bg-red-900 p-2">התחל הקלטת שיחה</button><button disabled={!recording} onClick={()=>void finishRecording()} className="rounded bg-slate-800 p-2">סיים הקלטה</button>{recording && <span role="status">● מקליט {recordingSeconds} שניות</span>}{recordingBlob && <button onClick={()=>downloadBlob(recordingBlob,`gerry-${Date.now()}.${recordingBlob.type.includes('mp4')?'m4a':recordingBlob.type.includes('ogg')?'ogg':'webm'}`)}>הורד הקלטה</button>}<button disabled={!lines.length} onClick={()=>downloadBlob(new Blob([JSON.stringify(lines,null,2)],{type:'application/json'}),'gerry-transcript.json')}>הורד תמלול עם זמנים</button></div>
      <label>עוצמת מיקרופון <meter min="0" max="1" value={micLevel}/></label>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-700/50 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
      <div className="mt-5 min-h-56 space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        {lines.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">התמליל יופיע כאן במהלך השיחה.</p> : lines.map((line) => <div key={line.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="mb-1 text-xs font-bold text-amber-300">{line.speaker}</div><p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{line.text}</p></div>)}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">נדרש GEMINI_API_KEY תקין בשרת והרשאת מיקרופון בדפדפן. הטוקן שנשלח לדפדפן חד־פעמי וקצר־חיים. הקלטה מתחילה רק בלחיצה מפורשת ונשמרת להורדה בדפדפן בלבד.</p>
    </div>

    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4">
        <h3 className="text-xl font-black text-white">השוואת דרכי תגובה</h3>
        <p className="mt-1 text-sm leading-6 text-slate-400">בדיקה מבוקרת של ארבע דרכי שיחה לאחר שאיתי סיים משפט. בחר ספק קול אחד כדי להשוות רק את חוויית התגובה.</p>
      </div>
      <button disabled={captureBusy && captureRef.current?.state!=='recording'} onClick={()=>void captureInput()} className="mb-3 rounded bg-slate-800 p-3">{captureRef.current?.state==='recording'?'סיים דיבור ותמלל':captureBusy?'מתמלל…':'הקלט משפט לבדיקה'}</button>
      <label className="mb-4 block text-xs font-bold text-slate-300">משפט הבדיקה<textarea value={testInput} onChange={(event) => setTestInput(event.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white" /></label>
      <div className="grid gap-2 sm:grid-cols-2">
        {([
          ['turn', 'תור רגיל', 'ממתינים לתשובה המלאה ואז מפיקים ומנגנים אודיו.'],
          ['chunks', 'הזרמת Gemini TTS', 'הטקסט נוצר מראש; האודיו מנוגן במנות בזמן שהמודל מפיק אותו. Gemini בלבד.'],
          ['backchannel', 'תגובת ביניים', 'משפט ביניים מותאם לכללי הקשר מופק במקביל לתשובה; זמן ההמתנה נמדד.'],
          ['two-stage', 'תגובה בשני שלבים', 'משפט פתיחה קצר נוצר ומתחיל לדבר בזמן שההמשך נוצר.'],
        ] as [Strategy, string, string][]).map(([id, label, description]) => <button key={id} onClick={() => setStrategy(id)} className={`rounded-xl border p-3 text-right ${strategy === id ? 'border-amber-500 bg-amber-950/30' : 'border-slate-800 bg-slate-950/50'}`}><span className="block text-sm font-bold text-white">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-400">{description}</span></button>)}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold text-slate-300">מנוע דיבור<select value={ttsProvider} onChange={(event) => setTtsProvider(event.target.value)} className="mt-1 block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{providers.map((provider) => <option key={provider.id} value={provider.id} disabled={!provider.configured}>{provider.label}{provider.configured ? '' : ' — לא הוגדר'}</option>)}</select></label>
        <button onClick={() => void runStrategy()} disabled={strategyBusy || !testInput.trim() || (strategy==='chunks' && !ttsProvider.startsWith('gemini')) || !providers.some((provider) => provider.id === ttsProvider && provider.configured)} className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50">{strategyBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}{strategyBusy ? 'מריץ ניסוי…' : 'הרץ את דרך התגובה'}</button>
        <button disabled={!strategyBusy} onClick={()=>{abortRef.current?.abort();graphRef.current?.stopOutput();}} className="rounded bg-slate-800 p-2">עצור תשובה</button>
        {firstAudioMs !== null && <span className="text-xs text-slate-300">ניגון ראשון (אירוע דפדפן): <b className="font-mono text-emerald-300">{firstAudioMs}ms</b></span>}
        {totalStrategyMs !== null && <span className="text-xs text-slate-300">זמן כולל: <b className="font-mono text-amber-300">{totalStrategyMs}ms</b></span>}
      </div>
      {strategyError && <p role="alert" className="mt-3 rounded-xl bg-rose-950/40 p-3 text-sm text-rose-200">{strategyError}</p>}
      {strategyLines.length > 0 && <div className="mt-4 space-y-3">{strategyLines.map((line, index) => <div key={`${index}-${line.text}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="mb-2 text-sm leading-6 text-white">{line.text}</p><audio controls preload="none" className="w-full" src={`data:${line.mimeType};base64,${line.audioBase64}`} /><p className="mt-1 text-[11px] text-slate-500">TTS: {line.ttsMs}ms</p></div>)}</div>}
      <p className="mt-4 text-[11px] leading-5 text-slate-500">הזרמת TTS מתחילה לאחר יצירת הטקסט. שיחת Live למעלה מקבלת אודיו ברצף. בחירת OpenAI TTS משנה את הקול בלבד; Gemini מייצר את הטקסט.</p>
    </div>
  </section>;
}
