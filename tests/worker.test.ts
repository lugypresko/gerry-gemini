import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { pcmToWav, providerFailure, type Env } from '../worker/index';
const env:Env={ASSETS:{fetch:async()=>new Response('assets')}};
const call=(path:string, body:any={}, bindings:Partial<Env>={})=>worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{...env,...bindings});
test('recording transcription uses Interactions and returns Hebrew text',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{assert.equal(input,'https://generativelanguage.googleapis.com/v1beta/interactions');const body=JSON.parse(init!.body as string);assert.equal(body.model,'gemini-3.5-transcribe');assert.equal(body.input[0].mime_type,'audio/webm');assert.deepEqual(body.generation_config.transcription_config.language_codes,['he-IL']);return Response.json({output_text:'שלום ג׳רי'});};
 try{const r=await call('/api/gemini/transcribe',{audioBase64:'AAAA',mimeType:'audio/webm;codecs=opus'},{GEMINI_API_KEY:'fixture'});assert.equal(r.status,200);assert.equal((await r.json() as any).transcript,'שלום ג׳רי');}finally{globalThis.fetch=original;}
});
test('Gemini streaming forwards separate PCM chunks and completion',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{const request=input instanceof Request?input:new Request(input,init);assert(request.url.includes('streamGenerateContent'));const event=(data:string)=>`data: ${JSON.stringify({candidates:[{content:{parts:[{inlineData:{data,mimeType:'audio/L16;rate=24000'}}]}}]})}\n\n`;return new Response(event('AQI=')+event('AwQ='),{headers:{'Content-Type':'text/event-stream'}});};
 try{const r=await call('/api/voice-lab/speak-stream',{text:'שלום',provider:'gemini-flash'},{GEMINI_API_KEY:'fixture'});assert.equal(r.status,200);assert.match(r.headers.get('content-type')!,/ndjson/);const lines=(await r.text()).trim().split('\n').map(x=>JSON.parse(x));assert.deepEqual(lines.map(x=>x.type),['audio','audio','done']);assert.equal(lines[0].data,'AQI=');assert.equal(lines[1].data,'AwQ=');}finally{globalThis.fetch=original;}
});
test('empty transcription is an explicit failure, no invented transcript',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({outputs:[]});
 try{const r=await call('/api/gemini/transcribe',{audioBase64:'AAAA'},{GEMINI_API_KEY:'fixture'});assert.equal(r.status,502);assert.match((await r.json() as any).error,/no text/);}finally{globalThis.fetch=original;}
});
test('GPT-Live SDP handshake keeps provider credentials on the server',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async(input,init)=>{assert.equal(input,'https://api.openai.com/v1/live/sessions');const body=JSON.parse(init!.body as string);assert.equal(body.session.model,'gpt-live-1');assert.equal(body.session.instructions,'Gerry persona');assert.equal(body.transport.type,'webrtc');return Response.json({session:{id:'live-fixture',secret:'never-return'},transport:{sdp:'v=0 answer'}});};
 try{const r=await call('/api/voice-lab/openai-live',{sdp:'v=0 offer',systemPrompt:'Gerry persona'},{OPENAI_API_KEY:'fixture-key'});assert.equal(r.status,200);const data=await r.json();assert.equal((data as any).transport.sdp,'v=0 answer');assert(!JSON.stringify(data).includes('never-return'));assert(!JSON.stringify(data).includes('fixture-key'));}finally{globalThis.fetch=original;}
});
test('new voice endpoints report missing secrets and invalid streaming providers',async()=>{
 assert.equal((await call('/api/voice-lab/openai-live',{sdp:'v=0 offer'})).status,503);
 assert.equal((await call('/api/voice-lab/speak-stream',{text:'שלום',provider:'gemini-flash'})).status,503);
 assert.equal((await call('/api/voice-lab/speak-stream',{text:'שלום',provider:'openai-tts-1'})).status,400);
});
test('provider keys independently configure the corresponding provider',async()=>{
 for(const [key,id] of [['OPENAI_API_KEY','openai-tts-1'],['GEMINI_API_KEY','gemini-lite'],['ELEVENLABS_API_KEY','elevenlabs']]){
 const r=await worker.fetch(new Request('http://localhost/api/voice-lab/providers'),{...env,[key]:'fixture',ELEVENLABS_VOICE_ID:'fixture-voice'});
 const data=await r.json() as any;assert(data.providers.find((p:any)=>p.id===id).configured);
 assert(!data.providers.find((p:any)=>p.id===(id==='openai-tts-1'?'gemini-lite':'openai-tts-1')).configured);
 assert(!JSON.stringify(data).includes('fixture'));
 }
});
test('PCM wrapping preserves samples and header lengths',()=>{const pcm=Buffer.from([1,0,255,127]);const wav=Buffer.from(pcmToWav(pcm.toString('base64')),'base64');assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(40),4);assert.deepEqual(wav.subarray(44),pcm);});
test('OpenAI request and response contract, no Gemini dependency',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,init)=>{calls++;assert.equal(input,'https://api.openai.com/v1/audio/speech');assert.equal(JSON.parse(init!.body as string).model,'tts-1');return new Response(new Uint8Array([1,2,3]));};
 try{const r=await call('/api/voice-lab/speak',{provider:'openai-tts-1',text:'שלום'},{OPENAI_API_KEY:'fixture'});const data=await r.json() as any;assert.equal(r.status,200);assert.equal(data.audioBase64,'AQID');assert.equal(data.mimeType,'audio/mpeg');assert.equal(data.modelUsed,'tts-1');assert(data.timing.audioReady>=data.timing.requestStart);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('provider rejects a model: return error without fallback or exposing credentials',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('fixture-secret',{status:404});};
 try{const r=await call('/api/voice-lab/speak',{provider:'elevenlabs',text:'שלום'},{ELEVENLABS_API_KEY:'fixture-secret',ELEVENLABS_VOICE_ID:'voice'});assert.equal(r.status,502);assert(!(await r.text()).includes('fixture-secret'));assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('cross-origin mutations and malformed payloads fail',async()=>{
 const r=await worker.fetch(new Request('http://localhost/api/voice-lab/live-token',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}),env);assert.equal(r.status,403);
 assert.equal((await call('/api/voice-lab/reply',null)).status,400);
 assert.equal((await call('/api/voice-lab/speak',{text:'x'.repeat(4001)})).status,400);
});
test('API cannot fall through to SPA; static requests use ASSETS',async()=>{assert.equal((await worker.fetch(new Request('http://localhost/api/nope'),env)).status,404);assert.equal(await (await worker.fetch(new Request('http://localhost/nested'),env)).text(),'assets');});
test('all API endpoints fail clearly without keys',async()=>{
 for(const provider of ['gemini-flash','gemini-lite','openai-tts-1','elevenlabs']) {const r=await call('/api/voice-lab/speak',{provider,text:'שלום'});assert.equal(r.status,503,provider);assert((await r.json() as any).error.includes('not configured'));}
 for(const path of ['voice-lab/live-token','voice-lab/reply','gemini/speak','gemini/compare-tts','gemini/chat','gemini/transcribe','gemini/run-scenario']) {const r=await call('/api/'+path,{text:'שלום',userMessage:'שלום',userPrompt:'שלום',audioBase64:'AAAA'});assert.equal(r.status,503,path);}
 assert.equal((await call('/api/gemini/speak',{text:'שלום',ttsModel:'unavailable-model'})).status,400);
});
test('Gemini API body/model and audio contract (mocked upstream)',async()=>{
 const original=globalThis.fetch;const calls:any[]=[];
 globalThis.fetch=async(input,init)=>{const req=input instanceof Request?input:new Request(input,init);const body=await req.json() as any;calls.push({url:req.url,body});return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/wav',data:'UklGRg=='}}]}}]});};
 try {const r=await call('/api/voice-lab/speak',{provider:'gemini-lite',text:'שלום'},{GEMINI_API_KEY:'fixture'});assert.equal(r.status,200);const data=await r.json() as any;assert.equal(data.audioBase64,'UklGRg==');assert.equal(data.mimeType,'audio/wav');assert(calls[0].url.includes('gemini-3.8-flash-lite-tts'));assert.equal(calls[0].body.contents[0].parts[0].text,'שלום');assert.equal(calls.length,1);}finally{globalThis.fetch=original;}
});
test('Live token is single-use, short-lived, bound to persona and beta API (mock)',async()=>{
 const original=globalThis.fetch;let captured:any;
 globalThis.fetch=async(input,init)=>{const req=input instanceof Request?input:new Request(input,init);captured={url:req.url,body:await req.json()};return Response.json({name:'auth_tokens/fixture-token'});};
 try {const r=await call('/api/voice-lab/live-token',{systemPrompt:'Gerry fixture persona'},{GEMINI_API_KEY:'fixture-secret'});assert.equal(r.status,200);const data=await r.json() as any;assert.equal(data.token,'auth_tokens/fixture-token');assert.equal(data.model,'gemini-3.8-live');assert(captured.url.includes('/v1beta/'));assert.equal(captured.body.uses,1);assert.equal(captured.body.bidiGenerateContentSetup.model,'models/gemini-3.8-live');assert.equal(captured.body.bidiGenerateContentSetup.systemInstruction.parts[0].text,'Gerry fixture persona');assert(Date.parse(captured.body.newSessionExpireTime)-Date.now()<61000);assert(!JSON.stringify(data).includes('fixture-secret'));}finally{globalThis.fetch=original;}
});

test('Gemini failures report actionable status without echoing credentials or URLs',()=>{
 for(const [message,expected] of [['PERMISSION_DENIED fixture-secret https://private','permission denied'],['API_KEY_INVALID fixture-secret','invalid API key'],['SERVICE_DISABLED fixture-secret','API is disabled'],['RESOURCE_EXHAUSTED fixture-secret','quota or billing']]) {
 const result=providerFailure({status:403,message});assert(result.includes(expected));assert(result.includes('HTTP 403'));assert(!result.includes('fixture-secret'));assert(!result.includes('https://'));
 }
});

test('REST transcription reads model_output steps and never echoes user/thought text',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>Response.json({status:'completed',steps:[{type:'user_input',content:[{type:'text',text:'do not echo'}]},{type:'model_output',content:[{type:'thought',text:'do not expose'},{type:'text',text:'שלום '},{type:'text',text:'ג׳רי'}]}]});
  const r=await call('/api/gemini/transcribe',{audioBase64:'AAAA'},{GEMINI_API_KEY:'fixture'});assert.equal(r.status,200);assert.equal((await r.json() as any).transcript,'שלום ג׳רי');
  globalThis.fetch=async()=>Response.json({steps:[{type:'user_input',content:[{type:'text',text:'do not echo'}]}]});
  assert.equal((await call('/api/gemini/transcribe',{audioBase64:'AAAA'},{GEMINI_API_KEY:'fixture'})).status,502);
 }finally{globalThis.fetch=original;}
});

test('MP4 microphone recordings use Gemini M4A MIME and safe 400 diagnostics',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(_input,init)=>{assert.equal(JSON.parse(init!.body as string).input[0].mime_type,'audio/m4a');return Response.json({error:{message:'Unsupported audio format secret-key https://private'}},{status:400});};
 try{const r=await call('/api/gemini/transcribe',{audioBase64:'AAAA',mimeType:'audio/mp4;codecs=mp4a.40.2'},{GEMINI_API_KEY:'fixture'});const data=await r.json() as any;assert.equal(r.status,502);assert.match(data.error,/unsupported audio format/);assert(!data.error.includes('secret-key'));assert(!data.error.includes('https://'));assert(!data.error.includes('billing'));}finally{globalThis.fetch=original;}
});
