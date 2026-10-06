import { useEffect, useRef, useState } from 'react';
import { audioController } from '../utils/audio';
import { ConversationAudio, downloadBlob } from '../utils/conversationAudio';

export function RecordingControls({ transcript }: { transcript: unknown }) {
  const [active,setActive]=useState(false);
  const [seconds,setSeconds]=useState(0);
  const [blob,setBlob]=useState<Blob|null>(null);
  const [error,setError]=useState('');
  const mic=useRef<MediaStream|null>(null);
  const graph=useRef<ConversationAudio|null>(null);
  const stop=async()=>{
    const result=await graph.current?.stopRecording(); if(result)setBlob(result);
    mic.current?.getTracks().forEach(t=>t.stop());mic.current=null;
    graph.current?.disconnectInputs();graph.current=null;audioController.recordingGraph=null;setActive(false);
  };
  const start=async()=>{
    setError('');try{
      mic.current=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      graph.current=new ConversationAudio(audioController.getAudioContext());
      await graph.current.resume();graph.current.connectStream(mic.current);
      audioController.recordingGraph=graph.current;graph.current.startRecording();
      setBlob(null);setSeconds(0);setActive(true);
    }catch(cause){mic.current?.getTracks().forEach(t=>t.stop());setError(cause instanceof Error?cause.message:'ההקלטה נכשלה');}
  };
  useEffect(()=>{if(!active)return;const timer=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(timer);},[active]);
  useEffect(()=>()=>{void stop();},[]);
  return <div className="rounded-xl border border-slate-700 p-3 text-sm">
    <button onClick={()=>void (active?stop():start())} className="rounded bg-rose-700 px-3 py-2">{active?'עצור הקלטה':'הקלט את השיחה'}</button>
    <span className="mx-3">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span>
    {blob && <button onClick={()=>downloadBlob(blob,`gerry-${Date.now()}.${blob.type.includes('mp4')?'mp4':blob.type.includes('ogg')?'ogg':'webm'}`)} className="mx-2 underline">הורד אודיו</button>}
    <button onClick={()=>downloadBlob(new Blob([JSON.stringify(transcript,null,2)],{type:'application/json'}),'gerry-transcript.json')} className="underline">הורד תמלול</button>
    <p className="mt-2 text-slate-400">הקלטה מקומית של המיקרופון וקול ג׳רי. מתחילה רק בלחיצה; הורד לפני עזיבת הדף. דיבור מערכת ההפעלה אינו נכלל.</p>
    {error && <p role="alert">{error}</p>}
  </div>;
}
