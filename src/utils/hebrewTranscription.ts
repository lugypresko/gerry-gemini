export interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

export interface SpeechEventLike {
  results: ArrayLike<SpeechResultLike>;
}

/** Browser interim hypotheses are preview only; never submit them as guest speech. */
export function splitSpeechResults(event: SpeechEventLike) {
  const final: string[] = [];
  const interim: string[] = [];
  for (let i = 0; i < event.results.length; i += 1) {
    const text = String(event.results[i]?.[0]?.transcript ?? '').trim();
    if (!text) continue;
    (event.results[i].isFinal ? final : interim).push(text);
  }
  return { finalText: final.join(' ').trim(), previewText: [...final, ...interim].join(' ').trim() };
}

/** Conservative Hebrew-only heuristic, not a substitute for STT confidence or audio verification. */
export function hasPredominantlyHebrewText(value: string) {
  const hebrew = (value.match(/[\u05D0-\u05EA]/gu) ?? []).length;
  const latin = (value.match(/[A-Za-z]/g) ?? []).length;
  return hebrew >= 2 && hebrew >= latin * 2;
}
