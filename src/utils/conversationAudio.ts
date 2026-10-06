export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** One audio graph for speakers and the recording mix. Mic is never sent to speakers. */
export class ConversationAudio {
  readonly context: AudioContext;
  readonly mix: MediaStreamAudioDestinationNode;
  constructor(context?: AudioContext) { this.context=context || new AudioContext({sampleRate:24000}); this.mix=this.context.createMediaStreamDestination(); }
  private sources = new Set<AudioBufferSourceNode>();
  private attached = new Set<MediaStream>();
  private inputs: MediaStreamAudioSourceNode[] = [];
  private next = 0;
  private tail = Promise.resolve();
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private odd: number | null = null;
  onFirstAudio?: () => void;
  connectStream(stream: MediaStream, audible = false) {
    if (this.attached.has(stream)) return;
    this.attached.add(stream);
    const source = this.context.createMediaStreamSource(stream);
    source.connect(this.mix); if (audible) source.connect(this.context.destination);
    this.inputs.push(source);
  }
  async resume() { await this.context.resume(); }
  async playEncoded(data: string, mimeType: string) {
    const binary = atob(data); let bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    let buffer: AudioBuffer;
    if (/L16|pcm/i.test(mimeType)) {
      if (this.odd !== null) { const combined=new Uint8Array(bytes.length+1);combined[0]=this.odd;combined.set(bytes,1);bytes=combined;this.odd=null; }
      if(bytes.length%2) {this.odd=bytes[bytes.length-1];bytes=bytes.slice(0,-1);}
      if (!bytes.length) return;
      const rate=Number(mimeType.match(/rate=(\d+)/)?.[1]) || 24000;
      buffer=this.context.createBuffer(1,bytes.length/2,rate);
      const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      const samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++) samples[i]=view.getInt16(i*2,true)/32768;
    } else buffer=await this.context.decodeAudioData(bytes.buffer as ArrayBuffer);
    const source=this.context.createBufferSource();source.buffer=buffer;
    source.connect(this.context.destination);source.connect(this.mix);
    const at=Math.max(this.context.currentTime+0.025,this.next);this.next=at+buffer.duration;
    this.sources.add(source);
    this.tail=new Promise<void>(resolve=>{source.onended=()=>{this.sources.delete(source);resolve();};});
    source.start(at);this.onFirstAudio?.();
  }
  async drained() {await this.tail;}
  stopOutput() {for(const s of this.sources) {try{s.stop();}catch{}} this.sources.clear();this.next=this.context.currentTime;this.odd=null;}
  startRecording() {
    if(this.recorder?.state==='recording') return;
    const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
    this.chunks=[];const r=new MediaRecorder(this.mix.stream,mime?{mimeType:mime}:undefined);this.recorder=r;
    r.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};r.start(1000);
  }
  stopRecording(): Promise<Blob | null> {
    const r=this.recorder;if(!r || r.state==='inactive')return Promise.resolve(null);
    return new Promise((resolve,reject)=>{r.onerror=()=>reject(new Error('ההקלטה נכשלה'));r.onstop=()=>{resolve(new Blob(this.chunks,{type:r.mimeType}));this.recorder=null;};r.stop();});
  }
  disconnectInputs() {for(const source of this.inputs)source.disconnect();this.inputs=[];this.attached.clear();}
  async close() {this.stopOutput();await this.stopRecording();this.disconnectInputs();await this.context.close();}
}
export async function consumeSpeechStream(response: Response, audio: ConversationAudio, signal: AbortSignal, onChunk?:()=>void) {
  if(!response.ok) {const data=await response.json();throw new Error(data.error || `HTTP ${response.status}`);}
  if(!response.body)throw new Error('Audio stream missing');
  const reader=response.body.getReader();const decoder=new TextDecoder();let pending='';let doneEvent=false;let audioChunks=0;
  try {
    while(!signal.aborted) {
      const {value,done}=await reader.read();pending+=decoder.decode(value,{stream:!done});
      const lines=pending.split('\n');pending=lines.pop() || '';
      for(const line of lines) {if(!line.trim())continue;const event=JSON.parse(line);if(event.type==='error')throw new Error(event.error);if(event.type==='done')doneEvent=true;if(event.type==='audio'){audioChunks++;onChunk?.();await audio.playEncoded(event.data,event.mimeType);}}
      if(done)break;
    }
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    if(!doneEvent || !audioChunks)throw new Error('זרם האודיו הסתיים ללא תשובה מלאה');
    await audio.drained();
  } finally {await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
