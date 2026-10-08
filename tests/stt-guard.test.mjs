import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/components/PodcastStudio.tsx', 'utf8');

test('Browser SpeechRecognition is preview only', () => {
  assert.match(source, /if \(browserPreviewActiveRef\.current\) setInputText\(currentTranscript\)/);
  assert.doesNotMatch(source, /speechCapturedRef/);
  assert.doesNotMatch(source, /handleSendMessage\(recognized\)/);
});

test('onstop always transcribes recorded audio with Gemini', () => {
  const onstop = source.split('recorder.onstop = async () => {')[1]?.split('mediaRecorderRef.current = recorder;')[0] ?? '';
  assert.match(onstop, /await transcribeAudioWithGemini\(audioBlob, mimeType\)/);
  assert.doesNotMatch(onstop, /handleSendMessage\(/);
});

test('Transcription guards against predominantly non-Hebrew output', () => {
  assert.match(source, /hebrewLetters >= 2 && hebrewLetters >= latinLetters \* 2/);
  assert.match(source, /await handleSendMessage\(transcript\)/);
  assert.match(source, /askGuestToRepeat\(\)/);
});

test('Late Web Speech results are not displayed after stop', () => {
  assert.match(source, /browserPreviewActiveRef\.current = false;/);
});

test('No recording chimes', () => {
  assert.doesNotMatch(source, /playChime\('record_start'\)/);
  assert.doesNotMatch(source, /playChime\('record_stop'\)/);
});

test('Bad STT does not call Gemini chat and speaks a fixed clarification', () => {
  const transcribe = source.split('const transcribeAudioWithGemini = async')[1]?.split('// A fixed clarification')[0] ?? '';
  assert.match(transcribe, /if \(hebrewLetters >= 2 && hebrewLetters >= latinLetters \* 2\)/);
  assert.match(transcribe, /await handleSendMessage\(transcript\)/);
  assert.match(transcribe, /setInputText\(''\);\s*askGuestToRepeat\(\)/);
  const clarification = source.split('const askGuestToRepeat = () => {')[1]?.split('// Play audio for a message')[0] ?? '';
  assert.match(clarification, /לא הבנתי, תוכל לחזור על זה\?/);
  assert.match(clarification, /void playSpeakerAudio\(clarification\)/);
  assert.doesNotMatch(clarification, /generateJerryReply|handleSendMessage|\/api\/gemini\/chat/);
});
