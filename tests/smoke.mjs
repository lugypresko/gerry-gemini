import assert from 'node:assert/strict';
const base = process.env.SMOKE_URL || 'http://127.0.0.1:8787';
let checks = 0;
async function test(path, status, method='POST', body={}) {
 const r = await fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 assert.equal(r.status,status,path); const data=await r.json(); assert.equal(r.headers.get('cache-control'),'no-store'); checks++; return data;
}
const config=await test('/api/voice-lab/providers',200,'GET');
assert.equal(config.providers.length,4);assert(config.providers.every(p=>!p.configured));assert.equal(config.live.configured,false);
for(const provider of ['gemini-flash','gemini-lite','openai-tts-1','elevenlabs']) await test('/api/voice-lab/speak',503,'POST',{provider,text:'שלום'});
for(const path of ['live-token','reply']) await test('/api/voice-lab/'+path,503,'POST',{userMessage:'שלום'});
for(const path of ['speak','compare-tts','chat','transcribe','run-scenario']) await test('/api/gemini/'+path,503,'POST',{text:'שלום',userMessage:'שלום',audioBase64:'AAAA',userPrompt:'שלום'});
await test('/api/missing',404,'GET');await test('/api/voice-lab/speak',405,'GET');
await test('/api/voice-lab/speak',400,'POST',{provider:'unknown',text:'שלום'});
await test('/api/voice-lab/speak',400,'POST',{provider:'openai-tts-1',text:''});
await test('/api/gemini/speak',400,'POST',{text:'שלום',ttsModel:'not-a-model'});
const bad=await fetch(base+'/api/voice-lab/speak',{method:'POST',body:'{'});assert.equal(bad.status,400);checks++;
for(const path of ['/','/nested/spa/route']) {const r=await fetch(base+path,{headers:{Accept:'text/html'}});assert.equal(r.status,200);assert((await r.text()).includes('id="root"'));checks++;}
console.log(`${checks} local Worker smoke checks passed (no provider credentials)`);
