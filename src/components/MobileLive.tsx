import React, {useEffect, useRef, useState} from 'react';
import {GoogleGenAI, Modality} from '@google/genai';
import {DEFAULT_JERRY_SYSTEM_PROMPT} from '../constants/prompts';
export function MobileLive() {
 const [status,setStatus]=useState('לא מחובר'),[error,setError]=useState(''),[lines,setLines]=useState<string[]>([]),[metrics,setMetrics]=useState<Record<string,number>>({});
 const session=useRef<any>(null),stream=useRef<MediaStream|null>(null),input=useRef<AudioContext|null>(null),output=useRef<AudioContext|null>(null),nodes=useRef<AudioBufferSourceNode[]>([]),next=useRef(0),generation=useRef(0);
 const timing=useRef({lastVoice:0,firstTranscript:0,firstAudio:0,speaking:false,awaiting:false});
 const stopAudio=()=>{nodes.current.forEach(n=>{try{n.stop();}catch{}});nodes.current=[];next.current=output.current?.currentTime||0;};
 const cleanup=()=>{generation.current++;const s=session.current;session.current=null;try{s?.close();}catch{}stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;stopAudio();void input.current?.close().catch(()=>{});void output.current?.close().catch(()=>{});input.current=null;output.current=null;};
 useEffect(()=>()=>cleanup(),[]);
 const start=async()=>{
 cleanup();const run=generation.current;setError('');setStatus('מתחבר');setMetrics({});timing.current={lastVoice:0,firstTranscript:0,firstAudio:0,speaking:false,awaiting:false};const begin=performance.now();
 try {
  // Resume both contexts in the user gesture before network or microphone awaits.
  const out=new AudioContext({sampleRate:24000}),inc=new AudioContext({sampleRate:16000});output.current=out;input.current=inc;await Promise.all([out.resume(),inc.resume()]);
  const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});if(run!==generation.current){mic.getTracks().forEach(t=>t.stop());return;}stream.current=mic;
  const response=await fetch('/api/voice-lab/live-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemPrompt:DEFAULT_JERRY_SYSTEM_PROMPT})});const token=await response.json();if(!response.ok||!token.token)throw Error(`HTTP ${response.status}: ${token.error||'לא התקבל טוקן'}`);if(run!==generation.current)return;
  const ai=new GoogleGenAI({apiKey:token.token,httpOptions:{apiVersion:'v1beta'}});
  const live=await ai.live.connect({model:token.model,config:{responseModalities:[Modality.AUDIO],systemInstruction:DEFAULT_JERRY_SYSTEM_PROMPT,inputAudioTranscription:{},outputAudioTranscription:{}},callbacks:{
   onmessage:(m:any)=>{if(run!==generation.current)return;const c=m.serverContent;if(!c)return;const t=timing.current;
    if(c.interrupted){stopAudio();t.firstAudio=0;setLines(x=>[...x,'מערכת: התשובה נקטעה']);}
    if(c.inputTranscription?.text){if(!t.firstTranscript)t.firstTranscript=performance.now();setLines(x=>[...x,'איתי: '+c.inputTranscription.text]);}
    if(c.outputTranscription?.text)setLines(x=>[...x,'ג׳רי: '+c.outputTranscription.text]);
    for(const p of c.modelTurn?.parts||[]) {if(!p.inlineData?.data)continue;const now=performance.now();const binary=atob(p.inlineData.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const view=new DataView(bytes.buffer);const buffer=out.createBuffer(1,Math.floor(bytes.length/2),24000);const samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
     const source=out.createBufferSource();source.buffer=buffer;source.connect(out.destination);const at=Math.max(out.currentTime+.025,next.current);source.start(at);next.current=at+buffer.duration;nodes.current.push(source);source.onended=()=>{nodes.current=nodes.current.filter(x=>x!==source);};
     if(!t.firstAudio){t.firstAudio=now;const observed:Record<string,number>={};if(t.lastVoice){observed.speechEndEstimateToChunk=Math.round(now-t.lastVoice);observed.speechEndEstimateToScheduled=Math.round(now-t.lastVoice+(at-out.currentTime)*1000);}if(t.firstTranscript)observed.firstTranscriptToChunk=Math.round(now-t.firstTranscript);setMetrics(x=>({...x,...observed}));}
    }
   },onerror:(e:any)=>{if(run!==generation.current)return;setError(e.message||'שגיאת Live');cleanup();setStatus('שגיאה');},onclose:(e:any)=>{if(run!==generation.current)return;cleanup();setStatus('מנותק');if(e.reason)setError(e.reason);}
  }});if(run!==generation.current){live.close();return;}session.current=live;setMetrics(x=>({...x,connect:Math.round(performance.now()-begin)}));
  const source=inc.createMediaStreamSource(mic),processor=inc.createScriptProcessor(1024,1,1),mute=inc.createGain();mute.gain.value=0;source.connect(processor);processor.connect(mute);mute.connect(inc.destination);
  processor.onaudioprocess=e=>{if(run!==generation.current||session.current!==live)return;const values=e.inputBuffer.getChannelData(0),now=performance.now();const rms=Math.sqrt(values.reduce((s,v)=>s+v*v,0)/values.length),t=timing.current;
   // Local RMS VAD: 0.02 threshold, 300ms silence. Timestamp is the last voiced frame, not transcription.
   if(rms>.02){if(!t.speaking){t.firstTranscript=0;t.firstAudio=0;t.awaiting=false;stopAudio();}t.speaking=true;t.lastVoice=now;}else if(t.speaking&&now-t.lastVoice>=300){t.speaking=false;t.awaiting=true;}
   // Explicit resampling also handles devices ignoring the requested context sample rate.
   const ratio=inc.sampleRate/16000,n=Math.floor(values.length/ratio),pcm=new Int16Array(n);for(let i=0;i<n;i++){const pos=i*ratio,j=Math.floor(pos),v=values[j]+((values[j+1]??values[j])-values[j])*(pos-j);pcm[i]=Math.max(-1,Math.min(1,v))*32767;}const bytes=new Uint8Array(pcm.buffer);let b='';for(const v of bytes)b+=String.fromCharCode(v);live.sendRealtimeInput({audio:{data:btoa(b),mimeType:'audio/pcm;rate=16000'}});
  };setStatus('מחובר');
 }catch(e){if(run!==generation.current)return;setError(e instanceof Error?e.message:'החיבור נכשל');cleanup();setStatus('שגיאה');}
 };
 const labels:Record<string,string>={connect:'התחברות כולל הרשאת מיקרופון',speechEndEstimateToChunk:'סוף דיבור משוער עד מנת אודיו',speechEndEstimateToScheduled:'סוף דיבור משוער עד ניגון מתוזמן',firstTranscriptToChunk:'תמלול ראשון עד מנת אודיו'};
 return <section dir="rtl" className="space-y-4 p-4 rounded-2xl bg-slate-900"><h2 className="text-xl font-bold">ג׳רי · Mobile Live Experiment v0.1</h2><p>דיבור רציף עם Gemini Live. אפשר להיכנס לדברי ג׳רי.</p><button disabled={status==='מתחבר'||status==='מחובר'} onClick={()=>void start()} className="p-3 bg-emerald-600 rounded">התחל שיחה</button><button onClick={()=>{cleanup();setStatus('לא מחובר');}} className="p-3 bg-rose-700 rounded mr-3">סיים שיחה</button><p>{status}</p>{error&&<p role="alert">{error}</p>}<div>{Object.entries(metrics).map(([key,value])=><p key={key}>{labels[key]}: {value}ms</p>)}</div><p className="text-xs">סוף הדיבור הוא אומדן VAD מקומי (RMS 0.02, שקט 300ms). ניגון מתוזמן אינו מדידה אקוסטית. אין כאן הקלטה או העלאת קובץ תמלול.</p><div>{lines.slice(-40).map((line,i)=><p key={i} className="p-2 border-b border-slate-700">{line}</p>)}</div></section>;
}
