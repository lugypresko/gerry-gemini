# Gerry voice implementation and verification

## Implemented

- Microphone capture reports permission/recognition errors. Recorded audio falls back to the Gemini Interactions transcription endpoint, explicitly requesting Hebrew with `gemini-3.5-transcribe`. Empty output is an error, never fabricated text.
- Gemini Live remains browser-to-Gemini with a single-use, short-lived backend token and Gerry's persona. The interface exposes microphone level, transcript and interruption handling.
- Live engine selector adds OpenAI `gpt-live-1` via browser WebRTC. Only the SDP handshake passes through the Worker; the API key remains a Worker secret. The session uses the documented `gpt-5.6-terra` delegation model. An unavailable model returns an error without substitution.
- Gemini TTS uses `generateContentStream`, sending NDJSON PCM chunks to a scheduled Web Audio queue. This route does not split completed speech into sentences. OpenAI TTS remains the original complete-file path.
- Contextual interim response starts alongside full text generation. It still needs a TTS request and is not guaranteed immediate. Two-stage response generates continuation and continuation audio while the opening plays.
- Explicit local start/stop recording mixes microphone and Gerry output. Live and strategy tests share a recording graph. The existing studio also records provider audio. Downloads include audio and JSON transcript. Browser speech synthesis cannot be captured by Web Audio and is explicitly excluded. No cloud recording storage is introduced.
- Cancellation stops strategy output and aborts pending requests. Provider credentials remain independent. Measured timings are displayed; a scheduled playback timestamp is an estimate, not proof of physical speaker output.

## Verification gates

- Type checking, production build, Wrangler dry run, mocked API contracts, missing-key smoke tests and interface rendering.
- Deployed checks must cover Gemini streaming output and configuration status.
- Real microphone recognition, Live duplex audio, user interruption, and listening to downloaded recordings require a real microphone/speakers and human verification. Automated mocked contracts do not prove these work.
- Compare the four strategies with the same input and provider, using displayed timings. No performance improvement is claimed without comparable measurements.

## Workers Free

Static Assets and small stateless request handlers fit the intended setup; provider API billing is separate. Audio goes directly to providers for Live. Recordings remain in browser memory until downloaded and are lost on navigation. Long recordings consume browser memory. No R2, Durable Objects, background transcription jobs or paid Cloudflare plan is required by this implementation. Worker Free CPU/request limits still apply; sustained traffic or unusually large recordings need separate load validation.

## Manual acceptance

1. Allow microphone in HTTPS site settings and check the input meter.
2. Record one Hebrew sentence, stop, and verify its actual transcript.
3. Test each Live engine: speak, hear Gerry, interrupt, and verify the transcript/context.
4. Record a complete exchange, stop and download. Verify both speakers in the audio.
5. Run turn, streaming, interim and two-stage modes with the same typed sentence. Export latency results; check continuation does not repeat the opening.

## Deployed streaming observation, 2026-10-06

Gemini 3.8 Flash TTS, input `מה בעצם הביא אותך לעבוד פה?`: reply text ready 1810 ms (server duration), first PCM chunk 1190 ms after speech request, scheduled playback 1216 ms after speech request; strategy UI reported 3104 ms to first scheduled output and 19893 ms through playback completion. Provider output was real and the UI reported no error. These values are one observation; no matched-run performance comparison or physical speaker measurement was performed. An initial test exposed buffering by latency instrumentation; a regression test now verifies streaming headers return before the body completes.

## Transcription request correction, 2026-10-07

Recorded audio now follows the documented Files API resumable upload, then Interactions receives the file URI rather than inline bytes. The Worker attempts immediate deletion in a finally block, including rejected transcription calls; if deletion fails, provider retention rules apply. Model remains gemini-3.5-transcribe; there is no silent substitution. Typecheck, 18 API tests and Worker dry-run pass. Real microphone success after this request change is not yet verified.
