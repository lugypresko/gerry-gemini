export type LatencySample = { id: number; path: string; requestStart: number; textReady?: number; audioReady?: number; firstAudiblePlayback?: number; playbackBasis?: string };
let samples: LatencySample[] = [];
let nextId = 0;
const audioSamples = new Map<string, number>();
const responseSamples = new WeakMap<Response,number>();
const listeners = new Set<() => void>();
const emit = () => { listeners.forEach(listener => listener()); };
export const latency = {
  snapshot: () => samples,
  forResponse: (response:Response) => responseSamples.get(response),
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  begin: (path: string) => { const sample = {id: ++nextId, path, requestStart: performance.now()}; samples = [...samples.slice(-19), sample]; emit(); return sample.id; },
  ready: (id: number, stage: 'textReady' | 'audioReady') => { const sample = samples.find(s => s.id === id); if (sample && sample[stage] === undefined) { sample[stage] = performance.now(); samples = [...samples]; emit(); } },
  playback: (basis: string, id?: number, delayMs = 0, encoded?: string) => {
    if (encoded) { id = audioSamples.get(encoded); if (!id) return; }
    const sample = id ? samples.find(s => s.id === id) : [...samples].reverse().find(s => s.audioReady !== undefined && s.firstAudiblePlayback === undefined);
    if (!sample || sample.firstAudiblePlayback !== undefined) return;
    sample.firstAudiblePlayback = performance.now() + delayMs;
    sample.playbackBasis = basis;
    samples = [...samples]; emit();
  },
};
export function installLatencyMeasurements() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
    if (!path.startsWith('/api/') || init?.method !== 'POST') return original(input, init);
    if (audioSamples.size > 40) audioSamples.clear();
    const sample: LatencySample = {id: ++nextId,path,requestStart: performance.now()};
    samples = [...samples.slice(-19), sample]; emit();
    const response = await original(input, init);
    responseSamples.set(response,sample.id);
    if(response.headers.get('content-type')?.includes('application/x-ndjson')) return response;
    const data = await response.clone().json().catch(() => null);
    const ready = performance.now();
    if (response.ok && data) {
      if (data.reply || data.transcript) sample.textReady = ready;
      if (typeof data.timing?.textReady === 'number' && typeof data.timing?.requestStart === 'number') {
        // Server durations are relative; do not compare server/client absolute clocks.
        sample.textReady = sample.requestStart + data.timing.textReady - data.timing.requestStart;
      }
      if (data.audioBase64 || data.gemini?.audioBase64 || data.flashLite?.audioBase64 || data.flashTts?.audioBase64) { sample.audioReady = ready; if(data.audioBase64) audioSamples.set(data.audioBase64,sample.id); if(data.gemini?.audioBase64) audioSamples.set(data.gemini.audioBase64,sample.id); if(data.flashLite?.audioBase64) audioSamples.set(data.flashLite.audioBase64,sample.id); if(data.flashTts?.audioBase64) audioSamples.set(data.flashTts.audioBase64,sample.id); }
    }
    samples = [...samples]; emit();
    return response;
  };
}
