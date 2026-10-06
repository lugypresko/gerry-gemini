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
