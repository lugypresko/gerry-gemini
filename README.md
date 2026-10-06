# Gerry: Cloudflare Workers Free + Static Assets

React/Vite stays a client-side SPA. Wrangler uploads `dist/` as Static Assets; `/api/*` runs `worker/index.ts`. Unknown API paths return JSON 404 and never the SPA. All existing API paths and success response fields are retained. The Gerry prompt, scenario data, voices and four response strategies remain in place. Express is no longer used.

## Local development

Use Node 22.22.2+ (22.x), 24.15+ (24.x), or 26+, and npm (the npm lockfile is authoritative).

```bash
git checkout codex/cloudflare-deployment
npm ci
npm run dev:worker
```

Open http://localhost:8787. This builds and runs the entire app in local Workers emulation. With no credentials the UI shows missing configuration and disables provider comparison and Live.

For React HMR, leave that Worker running and in another terminal run:

```bash
npm run dev
```

Open the Vite URL; `/api` proxies to port 8787. Rebuild/restart the Worker when changing its code or testing a refreshed static build.

Optional local credentials: create a **gitignored** `.dev.vars` (do not use `.env` or `VITE_*` for provider secrets):

```dotenv
GEMINI_API_KEY=your-gemini-key
OPENAI_API_KEY=your-openai-key
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_VOICE_ID=your-voice-id
```

Configure any provider independently; omit providers you do not use. ElevenLabs needs both its key and voice ID. OpenAI-only speech comparison works without Gemini; response-strategy text generation and Live require Gemini.

## Secrets and deployment (run only after approval)

No deployment or secret mutation was performed in preparing this branch. Cloudflare's plugin was used read-only to verify the connected account and current documentation. Wrangler is used for local build, bundling and eventual deployment.

```bash
npm ci
npx wrangler login
npx wrangler whoami
```

Select/verify your intended Cloudflare account before continuing. The connected account inspected during preparation was `e5f73ddeab99e0414d3d52e9e7b3fc8b`. The config deliberately does not hard-code an account ID.

Enter each value interactively; omit unwanted providers. These commands mutate Cloudflare secrets and may create a Worker if it does not exist, so they belong to the approved deployment step:

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_VOICE_ID
npm run deploy
```

`npm run deploy` builds then runs `wrangler deploy`. Do not place credentials in `wrangler.jsonc`, Git, client code, or a `VITE_*` variable. Non-secret voice/model settings are in Wrangler `vars`: `OPENAI_TTS_VOICE=alloy`, `ELEVENLABS_MODEL_ID=eleven_multilingual_v2`.

## Verification commands

```bash
npm run typecheck
npm run test:api
npm run test:ui
npm run build
npm run worker:dry-run
# With npm run dev:worker running, and no local secrets:
npm run test:smoke
```

`test:api` invokes real Worker request handlers with missing secrets or mocked provider HTTP responses. `test:ui` mounts React in JSDOM and verifies configuration status and disabled controls. `test:smoke` checks the HTTP server, all API paths and SPA routes with no credentials; point `SMOKE_URL` at another test URL if needed. It expects all provider keys to be absent.

## Models and truthful failures

Identifiers verified against current official documentation on 2026-10-06:

| Purpose | Exact identifier |
| --- | --- |
| Reply/strategy text | `gemini-3.1-flash-lite` |
| Scenario text simulation | `gemini-3.8-flash` |
| File transcription | `gemini-3.5-transcribe` |
| TTS flagship | `gemini-3.8-flash-tts` |
| TTS lite | `gemini-3.8-flash-lite-tts` |
| Direct browser Live | `gemini-3.8-live` |
| OpenAI speech | `tts-1` |
| ElevenLabs default | `eleven_multilingual_v2` |

Documented existence is not proof of access for your particular account. Missing secrets return 503; unsupported selected TTS identifiers return 400; upstream model/auth/quota failures return 502, with no silent model substitution or generated-tone success. Gemini comparison reports per-model errors. Existing fabricated acoustic server fallbacks were removed so failed provider calls cannot masquerade as speech. Scenario experiments are explicitly labelled text + TTS simulation, not an actual Live session.

Gemini audio honours the response MIME type; WAV is returned directly, raw PCM/L16 is wrapped only when explicitly indicated. The full Gerry persona remains the default; custom Live prompts are capped at 16,000 characters. Browser Live receives a single-use token with a 60-second new-session window and 30-minute expiry, constrained to the model, prompt and transcription settings. It connects directly to Gemini using the documented `v1beta` API. The Worker never proxies live microphone/output audio.

## Latency

A collapsible measurement panel records browser-monotonic request start, text ready, audio ready, and first playback. APIs add server epoch timestamps and `Server-Timing`; server durations and browser clocks are never compared as absolute timestamps. For supplied TTS text, text is ready at request start. Generated text uses server elapsed time (network is not included); browser audio-ready is when response data has arrived. Provider cards additionally show their own request-to-audio and request-to-first-playback durations.

First playback comes from the media element `playing` event or Web Audio scheduled start. It is a **browser estimate**, not acoustic measurement at the speaker; device/output latency and leading silence remain unmeasured. Manually waiting to press Play counts toward request-to-playback. Strategy timing now records `playing`, not audio generation completion. Live's session-level entry measures session start to first output, not per-turn latency. No latency improvement is claimed. Failed playback leaves its measurement unset.

## Free plan and remaining limits

The setup uses only a Worker and Static Assets: no paid bindings, storage, browser rendering, origin server or Cloudflare AI. Static asset requests bypass the Worker except `/api/*`. The Free plan permits 100,000 Worker requests/day and 10 ms CPU/request; network waits do not count as CPU. Static assets permit 20,000 files and 25 MiB/file. Provider usage has its own pricing and quotas; free Cloudflare hosting does not make model calls free.

There is no known core feature that necessarily requires Workers Paid. However long unary audio or 10 MB transcription bodies require decoding, parsing and base64 serialization: **compliance with 10 ms CPU is not proven by a local dry-run**. Keep speech short (4,000-character API limit); measure CPU with real workloads on Cloudflare before promising long-form Free-plan support. No local model inference, server-side waveform synthesis or durable episode persistence is supplied. Episodes remain client/session data as before. Live sessions do not currently resume automatically across Gemini's connection-duration limits; restart a closed session.

The app remains a lab without user authentication, as on the source branch. Same-origin checks stop cross-origin browser mutations; they are not an authentication or usage-control boundary. Before exposing real provider keys to a public audience, configure access control for the lab; this branch does not create a paid identity service.

The currently installed SDK has a stale v1alpha-only warning for ephemeral tokens; this branch follows the official v1beta guide. A real-token connection test is still required.

## Current test report

- Typecheck: passed.
- React/Vite production build: passed; existing >500 kB client chunk warning remains.
- Wrangler deploy dry-run: passed; approximately 952 KiB Worker / 120 KiB gzip, 5 static files.
- API contract/smoke tests in-process: passed; see `tests/worker.test.ts`.
- React interface missing-key checks in JSDOM: passed.
- Local HTTP Worker and real browser verification: **blocked by this execution environment**, which denies socket/interface access (`uv_interface_addresses`, EPERM). `test:smoke` is provided for your normal development machine. SPA routing is configured per official docs; actual network-runtime behavior must be verified there.
- Real provider calls, Hebrew/emotion quality, microphone permissions, interruption handling, audio decoding/playback, account model access, and real latency/CPU: **not tested without credentials and a working browser/runtime**. Mocked calls verify contracts, not audio quality.
- No merge or deployment performed.

## Official sources

- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://ai.google.dev/gemini-api/docs/speech-generation
- https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
- https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite
- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe
- https://developers.openai.com/api/docs/guides/text-to-speech
- https://elevenlabs.io/docs/overview/models
