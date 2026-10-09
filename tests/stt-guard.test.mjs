import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { transformSync } from 'esbuild';
const source = readFileSync('src/components/PodcastStudio.tsx', 'utf8');
const start = source.indexOf('const transcribeAudioWithGemini = async');
const end = source.indexOf('// A fixed clarification', start);
const body = transformSync(source.slice(start, end), {loader:'ts', target:'es2022'}).code;
async function run(response) {
  const state = {error:null, recording:null, sent:[], busy:false};
  class Reader { readAsDataURL() {this.result='data:audio/webm;base64,AAAA';this.onload();} }
  const fn = new Function('fetch','FileReader','setIsTranscribing','setMicError','setRetryRecording','setInputText','handleSendMessage','sttDoneAtRef','setVoiceTiming',body+';return transcribeAudioWithGemini;');
  const transcribe = fn(async()=>response,Reader,x=>state.busy=x,x=>state.error=x,x=>state.recording=x,()=>{},async x=>state.sent.push(x),{current:null},()=>{});
  await transcribe(new Blob(['recorded-audio']), 'audio/webm');
  return state;
}
test('HTTP failure retains audio and does not enter conversation', async()=>{
  for(const status of [400,500,503]) {
    const s=await run(new Response(JSON.stringify({error:'upstream failed'}),{status}));
    assert.ok(s.error.includes(`HTTP ${status}: upstream failed`)); assert.ok(s.recording.blob);assert.deepEqual(s.sent,[]);assert.equal(s.busy,false);
  }
});
test('200 empty transcript remains distinct from HTTP failure',async()=>{
  const s=await run(new Response(JSON.stringify({transcript:''})));
  assert.ok(s.error.includes('תמלול ריק'));assert.ok(s.recording);assert.deepEqual(s.sent,[]);
});
test('200 accepted transcript uses server text and releases retained audio',async()=>{
  const s=await run(new Response(JSON.stringify({transcript:'שלום אני מדבר בעברית'})));
  assert.deepEqual(s.sent,['שלום אני מדבר בעברית']);assert.equal(s.recording,null);assert.equal(s.error,null);
});
