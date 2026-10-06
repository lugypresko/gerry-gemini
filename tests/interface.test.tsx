import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { TtsProviderComparisonLab } from '../src/components/TtsProviderComparisonLab';
import { LiveConversationLab } from '../src/components/LiveConversationLab';
import { ConfigurationStatus } from '../src/components/ConfigurationStatus';
import { DEFAULT_JERRY_SYSTEM_PROMPT } from '../src/constants/prompts';
import worker from '../worker/index';
import { installLatencyMeasurements, latency } from '../src/utils/latency';
test('latency instrumentation returns streaming headers without waiting for the body',async()=>{
 const originalWindow=(globalThis as any).window;
 let close!:()=>void;
 const stream=new ReadableStream({start(controller){close=()=>controller.close();}});
 (globalThis as any).window={fetch:async()=>new Response(stream,{headers:{'Content-Type':'application/x-ndjson'}})};
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{installLatencyMeasurements();const result=await Promise.race([window.fetch('/api/voice-lab/speak-stream',{method:'POST'}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('stream was buffered')),500);})]);assert(latency.forResponse(result));}finally{clearTimeout(timer);close();(globalThis as any).window=originalWindow;}
});
test('interface shows missing-key status; comparison and Live buttons disabled',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const original=globalThis.fetch;
 globalThis.fetch=async()=>worker.fetch(new Request('http://localhost/api/voice-lab/providers'),{ASSETS:{fetch:async()=>new Response('')}});
 const root=createRoot(document.getElementById('root')!);
 try {
 await act(async()=>{root.render(<><ConfigurationStatus/><TtsProviderComparisonLab/><LiveConversationLab systemPrompt={DEFAULT_JERRY_SYSTEM_PROMPT}/></>);});
 const text=document.body.textContent!;assert(text.includes('חסר GEMINI_API_KEY'));assert(text.includes('חסר מפתח או Voice ID'));assert.equal((text.match(/חסר מפתח/g)||[]).length>=4,true);
 const buttons=Array.from(document.querySelectorAll('button'));
 assert(buttons.find(b=>b.textContent?.includes('הפק והשווה'))?.disabled);
 assert(buttons.find(b=>b.textContent?.includes('התחל שיחת Live'))?.disabled);
 assert(text.includes('ארבעה מנועים'));assert(text.includes('ג׳רי מקשיב'));
 }finally{await act(async()=>root.unmount());globalThis.fetch=original;dom.window.close();}
});
