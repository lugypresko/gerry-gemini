import React, { useEffect, useState } from 'react';
export function ConfigurationStatus() {
  const [status,setStatus]=useState<any>(null);
  const [error,setError]=useState('');
  useEffect(()=>{fetch('/api/voice-lab/providers').then(async r=>{if(!r.ok)throw new Error();setStatus(await r.json());}).catch(()=>setError('לא ניתן לבדוק את הגדרות הספקים.'));},[]);
  if(error)return <p role="alert" className="mx-4 mt-3 text-sm text-rose-300">{error}</p>;
  if(!status)return null;
  return <div role="status" className="mx-4 mt-3 flex flex-wrap gap-3 text-xs text-slate-400" dir="rtl"><span>Gemini Live וטקסט: {status.live?.configured ? 'מוגדר' : 'חסר GEMINI_API_KEY'}</span>{status.providers?.filter((p:any)=>!p.id.startsWith('gemini')).map((p:any)=><span key={p.id}>{p.label}: {p.configured?'מוגדר':p.id==='elevenlabs'?'חסר מפתח או Voice ID':'חסר מפתח'}</span>)}</div>;
}
