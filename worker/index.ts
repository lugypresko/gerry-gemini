import { Buffer } from 'node:buffer';
import { GoogleGenAI, Modality, ThinkingLevel } from '@google/genai';
import { DEFAULT_JERRY_SYSTEM_PROMPT } from '../src/constants/prompts';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  OPENAI_TTS_VOICE?: string;
  ELEVENLABS_MODEL_ID?: string;
}
const TEXT_MODEL = 'gemini-3.1-flash-lite';
const LIVE_MODEL = 'gemini-3.8-live';
const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];
const MAX_BODY = 10 * 1024 * 1024;
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function providerFailure(error: unknown): string {
  const e = error as { status?: number; message?: string };
  const status = Number(e?.status);
  const message = String(e?.message || '');
  const category = /SERVICE_DISABLED|has not been used|is disabled/i.test(message) ? 'Generative Language API is disabled in the key project' :
    /API_KEY_SERVICE_BLOCKED/i.test(message) ? 'key restrictions block Gemini API' :
    /API_KEY_HTTP_REFERRER_BLOCKED/i.test(message) ? 'browser-only key cannot be used by this Worker' :
    /API_KEY_IP_ADDRESS_BLOCKED/i.test(message) ? 'key IP restrictions block this Worker' :
    /leaked|reported as leaked/i.test(message) ? 'key blocked by Google as leaked; replace it' :
    /API_KEY_INVALID|API key not valid|invalid api key/i.test(message) ? 'invalid API key' :
    /RESOURCE_EXHAUSTED|quota|billing/i.test(message) ? 'quota or billing limit' :
    /PERMISSION_DENIED/i.test(message) ? 'permission denied' :
    /NOT_FOUND/i.test(message) ? 'model not available' :
    /INVALID_ARGUMENT/i.test(message) ? 'invalid request parameters' : 'provider request rejected';
  return `Gemini: ${category}${status >= 400 && status <= 599 ? ` (HTTP ${status})` : ''}. No fallback was used.`;
}
function requireKey(key: string | undefined, name: string): string {
  if (!key) throw new ApiError(503, `${name} is not configured`);
  return key;
}
function gemini(env: Env) {
  return new GoogleGenAI({ apiKey: requireKey(env.GEMINI_API_KEY, 'GEMINI_API_KEY'), httpOptions: { apiVersion: 'v1beta' } });
}
function requiredText(value: unknown, name = 'Text', max = 4000): string {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, `${name} is required`);
  if (value.length > max) throw new ApiError(400, `${name} exceeds ${max} characters`);
  return value.trim();
}
/** Gemini PCM is raw 16-bit mono, not WAV. Wrap without synthesizing or changing samples. */
export function pcmToWav(encoded: string, rate = 24000): string {
  const pcm = Buffer.from(encoded, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF'); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]).toString('base64');
}
async function speech(env: Env, body: any) {
  const started = Date.now();
  const text = requiredText(body.text);
  const provider = body.provider;
  const style = typeof body.style === 'string' ? body.style.slice(0, 2000) : 'Expressive Hebrew puppet host';
  const voiceName = body.voiceName || 'Puck';
  let audioBase64: string, modelUsed: string, mimeType = 'audio/mpeg';
  if (provider === 'gemini-flash' || provider === 'gemini-lite') {
    modelUsed = provider === 'gemini-flash' ? TTS_MODELS[0] : TTS_MODELS[1];
    const response = await gemini(env).models.generateContent({ model: modelUsed,
      contents: [{role: 'user', parts: [{text, speechMetadata: provider === 'gemini-flash' ? {speaker: 'Jerry', style} : {style}}]}],
      config: {responseModalities: [Modality.AUDIO], speechConfig: {voiceConfig: {prebuiltVoiceConfig: {voiceName}}}},
    });
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData;
    if (!part?.data) throw new ApiError(502, `${modelUsed} returned no audio`);
    const type = part.mimeType || 'audio/wav';
    audioBase64 = /pcm|L16/i.test(type) ? pcmToWav(part.data, Number(type.match(/rate=(\d+)/)?.[1]) || 24000) : part.data;
    mimeType = /pcm|L16/i.test(type) ? 'audio/wav' : type;
  } else if (provider === 'openai-tts-1' || provider === 'elevenlabs') {
    const openai = provider === 'openai-tts-1';
    const key = requireKey(openai ? env.OPENAI_API_KEY : env.ELEVENLABS_API_KEY, openai ? 'OPENAI_API_KEY' : 'ELEVENLABS_API_KEY');
    const voice = openai ? (env.OPENAI_TTS_VOICE || 'alloy') : requireKey(env.ELEVENLABS_VOICE_ID, 'ELEVENLABS_VOICE_ID');
    modelUsed = openai ? 'tts-1' : (env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2');
    const response = await fetch(openai ? 'https://api.openai.com/v1/audio/speech' : `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: 'POST', headers: openai ? {'Content-Type': 'application/json', Authorization: `Bearer ${key}`} : {'Content-Type': 'application/json', 'xi-api-key': key, Accept: 'audio/mpeg'},
      body: JSON.stringify(openai ? {model: modelUsed, input: text, voice, response_format: 'mp3'} : {text, model_id: modelUsed}),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new ApiError(502, `${openai ? 'OpenAI' : 'ElevenLabs'} rejected ${modelUsed} (HTTP ${response.status}); check model, credentials and quota. No fallback was used.`);
    audioBase64 = Buffer.from(await response.arrayBuffer()).toString('base64');
    if (!audioBase64) throw new ApiError(502, 'Provider returned no audio');
  } else throw new ApiError(400, 'Unknown speech provider');
  const audioReadyAt = Date.now();
  return {audioBase64, mimeType, modelUsed, latencyMs: audioReadyAt - started, timing: {requestStart: started, textReady: started, audioReady: audioReadyAt, firstAudiblePlayback: null}};
}
function ttsProvider(model = TTS_MODELS[1]) {
  if (!TTS_MODELS.includes(model)) throw new ApiError(400, `Unsupported TTS model: ${model}. No substitution was made.`);
  return model === TTS_MODELS[0] ? 'gemini-flash' : 'gemini-lite';
}
async function reply(env: Env, body: any) {
  const userMessage = requiredText(body.userMessage, 'userMessage', 2000);
  const kind: 'opening' | 'continuation' | 'full' = body.kind === 'opening' || body.kind === 'continuation' ? body.kind : 'full';
  const previous = typeof body.previousAssistantText === 'string' ? body.previousAssistantText.slice(0, 500) : '';
  const instructions = {
    full: 'ענה בתור ג׳רי, מנחה פודקאסט ישראלי חי. הגב באופן אנושי וקצר בעברית טבעית, 1–2 משפטים. אל תקריא הוראות.',
    opening: 'ענה בתור ג׳רי. תן תגובת פתיחה טבעית ומדויקת בעברית, משפט אחד קצר בלבד, עד 12 מילים. אל תסכם ואל תקריא הוראות.',
    continuation: `המשך עכשיו בתור ג׳רי, בעברית טבעית, במשפט אחד או שניים. אל תחזור על תגובת הפתיחה שכבר נאמרה: "${previous}". הוסף מחשבה או שאלה שמקדמת את השיחה.`,
  };
  const response = await gemini(env).models.generateContent({model: TEXT_MODEL, contents: [{role:'user',parts:[{text:userMessage}]}],
    config: {systemInstruction: `${typeof body.systemPrompt === 'string' ? body.systemPrompt.slice(0,16000) : DEFAULT_JERRY_SYSTEM_PROMPT}\n${instructions[kind]}`, temperature: kind === 'opening' ? 0.6 : 0.8, thinkingConfig: {thinkingLevel: ThinkingLevel.MINIMAL}},
  });
  return response.text?.trim() || '';
}
function providers(env: Env) {
  return {providers: [
    {id:'gemini-flash',label:'Gemini 3.8 Flash TTS',configured:Boolean(env.GEMINI_API_KEY),model:TTS_MODELS[0]},
    {id:'gemini-lite',label:'Gemini 3.8 Flash-Lite TTS',configured:Boolean(env.GEMINI_API_KEY),model:TTS_MODELS[1]},
    {id:'openai-tts-1',label:'OpenAI TTS-1',configured:Boolean(env.OPENAI_API_KEY),model:'tts-1'},
    {id:'elevenlabs',label:'ElevenLabs',configured:Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID),model:env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2'},
  ], openaiLive: {configured:Boolean(env.OPENAI_API_KEY),model:'gpt-live-1'}, live: {configured:Boolean(env.GEMINI_API_KEY),model:LIVE_MODEL}, text: {configured:Boolean(env.GEMINI_API_KEY),model:TEXT_MODEL}};
}
const postPaths = new Set(['/api/voice-lab/speak','/api/voice-lab/speak-stream','/api/voice-lab/openai-live','/api/voice-lab/reply','/api/voice-lab/live-token','/api/gemini/speak','/api/gemini/compare-tts','/api/gemini/chat','/api/gemini/transcribe','/api/gemini/run-scenario']);
async function uploadTranscriptionAudio(env:Env, data:string, mimeType:string) {
  const key=requireKey(env.GEMINI_API_KEY,'GEMINI_API_KEY');
  const bytes=Buffer.from(data,'base64');
  if(!bytes.length)throw new ApiError(400,'Recording is empty');
  const start=await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files',{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json','X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(bytes.length),'X-Goog-Upload-Header-Content-Type':mimeType},body:JSON.stringify({file:{display_name:'gerry-transcription'}})});
  if(!start.ok)throw new ApiError(502,`Gemini recording upload could not start (HTTP ${start.status})`);
  const uploadUrl=start.headers.get('x-goog-upload-url');
  if(!uploadUrl || new URL(uploadUrl).origin!=='https://generativelanguage.googleapis.com')throw new ApiError(502,'Gemini returned an invalid upload destination');
  const upload=await fetch(uploadUrl,{method:'POST',headers:{'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize','Content-Type':mimeType},body:bytes});
  if(!upload.ok)throw new ApiError(502,`Gemini recording upload failed (HTTP ${upload.status})`);
  const result=await upload.json() as any;
  const file=result.file;
  if(!file?.uri || !/^files\/[a-zA-Z0-9_-]+$/.test(file.name || ''))throw new ApiError(502,'Gemini returned no uploaded audio file');
  return file as {name:string;uri:string};
}
async function route(path: string, body: any, env: Env, start: number): Promise<any> {
  if (path === '/api/voice-lab/openai-live') {
    const sdp = requiredText(body.sdp,'SDP offer',65536);
    if (!sdp.startsWith('v=0')) throw new ApiError(400,'Invalid SDP offer');
    const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.slice(0,16000) : DEFAULT_JERRY_SYSTEM_PROMPT;
    const response = await fetch('https://api.openai.com/v1/live/sessions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${requireKey(env.OPENAI_API_KEY,'OPENAI_API_KEY')}`},body:JSON.stringify({session:{model:'gpt-live-1',instructions:systemPrompt,delegation:{type:'responses',responses:{model:'gpt-5.6-terra',instructions:systemPrompt}}},transport:{type:'webrtc',sdp}})});
    if (!response.ok) throw new ApiError(502,`OpenAI GPT-Live rejected session creation (HTTP ${response.status}). No fallback was used.`);
    const data = await response.json() as any;
    if (!data.transport?.sdp || !data.session?.id) throw new ApiError(502,'OpenAI returned no session/SDP answer');
    return {session:{id:data.session.id},transport:{type:'webrtc',sdp:data.transport.sdp}};
  }
  if (path === '/api/voice-lab/speak-stream') {
    const text = requiredText(body.text);
    if (!['gemini-flash','gemini-lite'].includes(body.provider)) throw new ApiError(400,'Streaming currently supports Gemini 3.8 TTS only; choose a Gemini provider.');
    const model = body.provider === 'gemini-flash' ? TTS_MODELS[0] : TTS_MODELS[1];
    const upstream = await gemini(env).models.generateContentStream({model,contents:[{role:'user',parts:[{text}]}],config:{responseModalities:[Modality.AUDIO],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:body.voiceName || 'Puck'}}}}});
    const iterator = upstream[Symbol.asyncIterator]();
    const encoder = new TextEncoder();
    let ended = false;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) {ended=true;controller.enqueue(encoder.encode(JSON.stringify({type:'done'})+'\n'));controller.close();return;}
          for (const part of next.value.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData?.data) controller.enqueue(encoder.encode(JSON.stringify({type:'audio',data:part.inlineData.data,mimeType:part.inlineData.mimeType || 'audio/L16;rate=24000',model})+'\n'));
          }
        } catch(error) {ended=true;controller.enqueue(encoder.encode(JSON.stringify({type:'error',error:providerFailure(error)})+'\n'));controller.close();}
      },
      async cancel() {if (!ended) await iterator.return?.(undefined);},
    });
    return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if (path === '/api/voice-lab/speak') return speech(env, body);
  if (path === '/api/voice-lab/reply') {
    const text = await reply(env, body); const ready = Date.now();
    return {reply:text,model:TEXT_MODEL,generationTimeMs:ready-start,timing:{requestStart:start,textReady:ready,audioReady:null,firstAudiblePlayback:null}};
  }
  if (path === '/api/voice-lab/live-token') {
    const systemPrompt = typeof body.systemPrompt === 'string' && body.systemPrompt ? body.systemPrompt.slice(0, 16000) : DEFAULT_JERRY_SYSTEM_PROMPT;
    const token = await gemini(env).authTokens.create({config:{uses:1,expireTime:new Date(start+30*60*1000).toISOString(),newSessionExpireTime:new Date(start+60000).toISOString(),liveConnectConstraints:{model:LIVE_MODEL,config:{responseModalities:[Modality.AUDIO],systemInstruction:systemPrompt,inputAudioTranscription:{},outputAudioTranscription:{}}}}});
    if (!token.name) throw new ApiError(502,'Gemini did not return an ephemeral token');
    return {token:token.name,model:LIVE_MODEL};
  }
  if (path === '/api/gemini/speak') {
    const result = await speech(env,{...body,provider:ttsProvider(body.ttsModel)});
    return {...result,generationTimeMs:Date.now()-start};
  }
  if (path === '/api/gemini/compare-tts') {
    requireKey(env.GEMINI_API_KEY,'GEMINI_API_KEY');
    const text = body.text || 'שלום חברים! כאן ג׳רי הבובה בפודקאסט חי. תראו איך אני נשמע!';
    const run = async (model: string, name: string, category: string) => {
      try {const audio = await speech(env,{...body,text,provider:ttsProvider(model)}); return {...audio,model,name,category,status:'success'};}
      catch (error) {return {model,name,category,status:'error',audioBase64:null,error:error instanceof ApiError ? error.message : providerFailure(error)};}
    };
    const [flashLite,flashTts] = await Promise.all([run(TTS_MODELS[1],'Gemini 3.8 Flash-Lite TTS','High-Efficiency / Low-Latency'),run(TTS_MODELS[0],'Gemini 3.8 Flash TTS','Flagship Voice Design / Emotional')]);
    return {text,voiceName:body.voiceName || 'Puck',totalRoundTripMs:Date.now()-start,flashLite,flashTts};
  }
  if (path === '/api/gemini/transcribe') {
    requiredText(body.audioBase64,'audioBase64',MAX_BODY);
    const recordedType = String(body.mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
    // MediaRecorder uses audio/mp4; Gemini's documented audio MIME is audio/m4a.
    const mimeType = recordedType === 'audio/mp4' ? 'audio/m4a' : recordedType;
    if (!['audio/webm','audio/ogg','audio/m4a','audio/wav','audio/mpeg','audio/mp3'].includes(mimeType)) throw new ApiError(400,'Unsupported recording format');
    const file=await uploadTranscriptionAudio(env,body.audioBase64,mimeType);
    let response:Response;
    try {response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':requireKey(env.GEMINI_API_KEY,'GEMINI_API_KEY')},
      body:JSON.stringify({model:'gemini-3.5-transcribe',input:[{type:'audio',uri:file.uri,mime_type:mimeType}],generation_config:{transcription_config:{language_codes:['he-IL']}}}),
    });
    } finally {
      // Temporary provider upload is removed on success, rejection and network failure.
      await fetch('https://generativelanguage.googleapis.com/v1beta/'+file.name,{method:'DELETE',headers:{'x-goog-api-key':requireKey(env.GEMINI_API_KEY,'GEMINI_API_KEY')}}).catch(()=>undefined);
    }
    if (!response.ok) {
      const failure = await response.json().catch(()=>null) as any;
      // Classify upstream messages, never echo request data, URLs or credentials.
      const detail = typeof failure?.error?.message === 'string' ? failure.error.message.toLowerCase() : '';
      const reason = response.status === 400
        ? /mime|format|codec|encoding/.test(detail) ? 'unsupported audio format or encoding'
        : /decode|audio|duration|empty|corrupt/.test(detail) ? 'audio could not be decoded or was empty/too short'
        : /language/.test(detail) ? 'invalid transcription language configuration'
        : /model.*(not found|not available|not supported|unsupported)|unknown model/.test(detail) ? 'requested transcription model is unavailable or unsupported for this API'
        : /inline|uri|file/.test(detail) ? 'provider rejected the audio file reference'
        : 'invalid transcription request'
        : response.status === 401 || response.status === 403 ? 'authentication or permission denied'
        : response.status === 429 ? 'quota or rate limit exceeded' : 'provider request failed';
      throw new ApiError(502,`Gemini transcription: ${reason} (HTTP ${response.status}, format ${mimeType}). No fallback was used.`);
    }
    const result = await response.json() as any;
    // output_text is an SDK convenience field, not guaranteed in REST responses.
    // Only take model output after the last user input; never echo input/thoughts.
    const steps = Array.isArray(result.steps) ? result.steps : [];
    const lastInput = steps.findLastIndex((step:any)=>step.type === 'user_input');
    const textParts = steps.slice(lastInput+1)
      .filter((step:any)=>step.type === 'model_output' && Array.isArray(step.content))
      .flatMap((step:any)=>step.content)
      .filter((part:any)=>part.type === 'text' && typeof part.text === 'string')
      .map((part:any)=>part.text);
    const legacyParts = Array.isArray(result.outputs) ? result.outputs.filter((part:any)=>part.type === 'text' && typeof part.text === 'string').map((part:any)=>part.text) : [];
    const transcript = (typeof result.output_text === 'string' && result.output_text.trim() ? result.output_text : textParts.join('') || legacyParts.join('')).trim();
    if (!transcript) throw new ApiError(502,'Gemini transcription returned no text. No substitute model was used.');
    return {transcript,engineUsed:'gemini-3.5-transcribe'};
  }
  if (path === '/api/gemini/chat' || path === '/api/gemini/run-scenario') {
    const scenario = path.endsWith('run-scenario');
    const text = scenario ? requiredText(body.userPrompt,'userPrompt') : body.userMessage;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!text && !messages.length) throw new ApiError(400,'Message is required');
    const contents = messages.map((m:any)=>({role:m.speaker==='Jerry'?'model':'user',parts:[{text:m.text}]}));
    if (text) contents.push({role:'user',parts:[{text:body.scenarioContext ? `[הקשר תרחיש: ${body.scenarioContext}]\nאיתי: "${text}"` : `איתי: "${text}"`}]});
    const model = scenario ? 'gemini-3.8-flash' : TEXT_MODEL;
    const response = await gemini(env).models.generateContent({model,contents,config:{systemInstruction:scenario ? (body.systemPrompt || DEFAULT_JERRY_SYSTEM_PROMPT) : `${body.systemPrompt || DEFAULT_JERRY_SYSTEM_PROMPT}\n[הוראת קצב וזרימה: ענה ב-1 עד 2 משפטים קצרים בלבד, בלי פילוסופיה מיותרת! דבר כמו בן אדם אמיתי!]`,temperature:0.8, ...(scenario ? {} : {thinkingConfig:{thinkingLevel:ThinkingLevel.MINIMAL}})}});
    const replyText = response.text || ''; const textReady = Date.now();
    const audio = await speech(env,{text:replyText,voiceName:body.voiceName,provider:ttsProvider(body.ttsModel)});
    if (scenario) return {scenarioId:body.scenarioId,runIndex:body.runIndex,gemini:{text:replyText,audioBase64:audio.audioBase64,model:`${model} + ${audio.modelUsed} (scenario simulation, not Live)`,voice:body.voiceName || 'Puck'}};
    return {reply:replyText,audioBase64:audio.audioBase64,model,ttsModel:audio.modelUsed,textTimeMs:textReady-start,audioTimeMs:Date.now()-textReady,totalTimeMs:Date.now()-start,timing:{requestStart:start,textReady,audioReady:Date.now(),firstAudiblePlayback:null}};
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    const start = Date.now();
    const json = (data: unknown, status = 200) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Server-Timing':`worker;dur=${Date.now()-start}`}});
    try {
      if (path === '/api/voice-lab/providers') {
        if (request.method !== 'GET') throw new ApiError(405,'Method not allowed');
        return json(providers(env));
      }
      if (!postPaths.has(path)) throw new ApiError(404,'Unknown API path');
      if (request.method !== 'POST') throw new ApiError(405,'Method not allowed');
      const origin = request.headers.get('Origin');
      if (origin && origin !== new URL(request.url).origin) throw new ApiError(403,'Cross-origin API requests are not allowed');
      if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new ApiError(413,'Request body exceeds 10 MB');
      const reader = request.body?.getReader();
      let size = 0; const chunks: Uint8Array[] = [];
      if (reader) { while (true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>MAX_BODY) {await reader.cancel();throw new ApiError(413,'Request body exceeds 10 MB');} chunks.push(value); } }
      let body: any;
      try {body=JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');} catch {throw new ApiError(400,'Invalid JSON body');}
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400,'JSON object is required');
      const result = await route(path,body,env,start);
      return result instanceof Response ? result : json(result);
    } catch (error) {
      // SDK errors can contain URLs or request headers: never echo them or log credentials.
      return json({error:error instanceof ApiError ? error.message : providerFailure(error),latencyMs:Date.now()-start},error instanceof ApiError ? error.status : 502);
    }
  },
};
