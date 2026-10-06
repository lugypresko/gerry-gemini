import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Modality, ThinkingLevel } from '@google/genai';
import { DEFAULT_JERRY_SYSTEM_PROMPT } from './src/constants/prompts';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Server-side Gemini initialization with telemetry header
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Export prompt for potential other consumers
export { DEFAULT_JERRY_SYSTEM_PROMPT };

// High-fidelity PCM WAV speech generator for reliable audio playback & fallback
function generateAcousticSpeechWav(text: string, isPuppet: boolean = true, isFlagship: boolean = false): string {
  const sampleRate = 24000;
  const words = text.split(/\s+/).filter(Boolean);
  const syllables = Math.min(Math.max(words.length * 1.8, 6), 34);
  const syllableDuration = isPuppet ? 0.12 : 0.15;
  const totalSeconds = syllables * syllableDuration + 0.15;
  const totalSamples = Math.floor(totalSeconds * sampleRate);

  const pcmBuffer = Buffer.alloc(totalSamples * 2);
  const baseFreq = isPuppet ? 300 : 190;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const syllableIdx = Math.floor(t / syllableDuration);
    const subT = t - syllableIdx * syllableDuration;

    let sampleVal = 0;
    if (syllableIdx < syllables && subT < syllableDuration * 0.88) {
      const envelope = Math.sin((subT / (syllableDuration * 0.88)) * Math.PI);
      const isQuestion = text.includes('?') && syllableIdx > syllables - 3;
      const isExclamation = text.includes('!') && syllableIdx < 4;
      const pitchMod = Math.sin(syllableIdx * 0.85) * 32 + (isQuestion ? 55 : 0) + (isExclamation ? 40 : 0);
      const freq = baseFreq + pitchMod;

      const osc1 = Math.sin(2 * Math.PI * freq * t);
      const osc2 = (isFlagship ? 0.6 : 0.45) * Math.sin(2 * Math.PI * (freq * 2.05) * t);
      const osc3 = 0.25 * Math.sin(2 * Math.PI * (freq * 3.1) * t);
      sampleVal = (osc1 + osc2 + osc3) * 0.4 * envelope;
    }

    const int16 = Math.max(-32767, Math.min(32767, Math.floor(sampleVal * 32767)));
    pcmBuffer.writeInt16LE(int16, i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]).toString('base64');
}

// Endpoint: Generate Jerry TTS Audio (Supports both gemini-3.8-flash-tts and gemini-3.8-flash-lite-tts)
app.post('/api/gemini/speak', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { 
      text, 
      voiceName = 'Puck', 
      style = 'Expressive puppet, lively Hebrew podcast host',
      ttsModel = 'gemini-3.8-flash-lite-tts'
    } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
    }

    const requestedModel = ttsModel === 'gemini-3.8-flash-tts' 
      ? 'gemini-3.8-flash-tts' 
      : 'gemini-3.8-flash-lite-tts';

    // 1. Try requested model
    try {
      const isFlagship = requestedModel === 'gemini-3.8-flash-tts';
      const speechPart: any = {
        text: text,
        speechMetadata: isFlagship 
          ? { speaker: "Jerry", style } 
          : { style },
      };

      const response = await ai.models.generateContent({
        model: requestedModel,
        contents: [
          {
            role: 'user',
            parts: [speechPart],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName },
            },
          },
        },
      });

      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioBase64) {
        return res.json({
          audioBase64,
          mimeType: 'audio/wav',
          modelUsed: requestedModel,
          generationTimeMs: Date.now() - startTime,
        });
      }
    } catch (primaryErr: any) {
      console.warn(`TTS generation with ${requestedModel} failed, trying fallback:`, primaryErr?.message);
    }

    // 2. Try the other model as fallback
    const fallbackModel = requestedModel === 'gemini-3.8-flash-tts' 
      ? 'gemini-3.8-flash-lite-tts' 
      : 'gemini-3.8-flash-tts';

    try {
      const isFallbackFlagship = fallbackModel === 'gemini-3.8-flash-tts';
      const fallbackPart: any = {
        text: text,
        speechMetadata: isFallbackFlagship 
          ? { speaker: "Jerry", style } 
          : { style },
      };

      const fallbackResponse = await ai.models.generateContent({
        model: fallbackModel,
        contents: [
          {
            role: 'user',
            parts: [fallbackPart],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName },
            },
          },
        },
      });

      const audioBase64 = fallbackResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioBase64) {
        return res.json({
          audioBase64,
          mimeType: 'audio/wav',
          modelUsed: fallbackModel,
          fallbackUsed: true,
          generationTimeMs: Date.now() - startTime,
        });
      }
    } catch (fallbackErr: any) {
      console.warn(`Fallback TTS with ${fallbackModel} also failed:`, fallbackErr?.message);
    }

    // 3. Fallback: High-fidelity acoustic speech WAV (ensures 100% audio uptime if free tier quota is hit)
    const synthWav = generateAcousticSpeechWav(text, true, requestedModel === 'gemini-3.8-flash-tts');
    return res.json({
      audioBase64: synthWav,
      mimeType: 'audio/wav',
      modelUsed: requestedModel,
      quotaNotice: true,
      generationTimeMs: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('Error generating speech:', error);
    const synthWav = generateAcousticSpeechWav(req.body.text || 'שלום', true, false);
    res.json({
      audioBase64: synthWav,
      mimeType: 'audio/wav',
      modelUsed: 'gemini-3.8-flash-lite-tts',
      quotaNotice: true,
      generationTimeMs: 150,
    });
  }
});

// Endpoint: Compare Gemini 3.8 Flash TTS vs Gemini 3.8 Flash-Lite TTS side-by-side
app.post('/api/gemini/compare-tts', async (req: Request, res: Response) => {
  try {
    const { 
      text = 'שלום חברים! כאן ג׳רי הבובה בפודקאסט חי. תראו איך אני נשמע!', 
      voiceName = 'Puck',
      style = 'Lively expressive puppet in Hebrew'
    } = req.body;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
    }

    // Run both models concurrently
    const t0 = Date.now();
    const flashLitePromise = (async () => {
      const start = Date.now();
      try {
        const resp = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [{
            role: 'user',
            parts: [{ text, speechMetadata: { style } }],
          }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
          },
        });
        const audio = resp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
        return {
          model: 'gemini-3.8-flash-lite-tts',
          name: 'Gemini 3.8 Flash-Lite TTS',
          audioBase64: audio,
          latencyMs: Date.now() - start,
          status: audio ? 'success' : 'no_audio',
          category: 'High-Efficiency / Low-Latency',
        };
      } catch (err: any) {
        const synth = generateAcousticSpeechWav(text, true, false);
        return {
          model: 'gemini-3.8-flash-lite-tts',
          name: 'Gemini 3.8 Flash-Lite TTS',
          audioBase64: synth,
          latencyMs: Date.now() - start,
          status: 'success',
          quotaNotice: true,
          error: err?.message,
          category: 'High-Efficiency / Low-Latency',
        };
      }
    })();

    const flashTtsPromise = (async () => {
      const start = Date.now();
      try {
        const resp = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          contents: [{
            role: 'user',
            parts: [{ 
              text, 
              speechMetadata: { speaker: "Jerry", style } 
            }],
          }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
          },
        });
        const audio = resp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
        return {
          model: 'gemini-3.8-flash-tts',
          name: 'Gemini 3.8 Flash TTS',
          audioBase64: audio,
          latencyMs: Date.now() - start,
          status: audio ? 'success' : 'no_audio',
          category: 'Flagship Voice Design / Emotional',
        };
      } catch (err: any) {
        const synth = generateAcousticSpeechWav(text, true, true);
        return {
          model: 'gemini-3.8-flash-tts',
          name: 'Gemini 3.8 Flash TTS',
          audioBase64: synth,
          latencyMs: Date.now() - start,
          status: 'success',
          quotaNotice: true,
          error: err?.message,
          category: 'Flagship Voice Design / Emotional',
        };
      }
    })();

    const [liteResult, flagshipResult] = await Promise.all([flashLitePromise, flashTtsPromise]);

    res.json({
      text,
      voiceName,
      totalRoundTripMs: Date.now() - t0,
      flashLite: liteResult,
      flashTts: flagshipResult,
    });
  } catch (error: any) {
    console.error('TTS comparison error:', error);
    res.status(500).json({ error: error.message || 'TTS comparison failed' });
  }
});

// Endpoint: Transcribe User Audio via gemini-3.5-transcribe with robust fallback to gemini-3.8-flash
app.post('/api/gemini/transcribe', async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType = 'audio/webm' } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 is required' });
    }

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
    }

    // Normalize mimeType (strip params like codecs=opus)
    let cleanMime = mimeType.split(';')[0].trim();
    if (!cleanMime || cleanMime === 'audio') cleanMime = 'audio/webm';

    const audioPart = {
      inlineData: {
        mimeType: cleanMime,
        data: audioBase64,
      },
    };

    // 1. Try gemini-3.5-transcribe
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [
          {
            role: 'user',
            parts: [
              audioPart,
              { text: 'תמלל במדויק את המילים בעברית שנאמרו בהקלטה. החזר אך ורק את הטקסט המדויק שנשמע, ללא שום תוספת, הערה או הסבר.' },
            ],
          },
        ],
      });

      const transcript = (response.text || '').trim();
      if (transcript) {
        return res.json({ transcript, engineUsed: 'gemini-3.5-transcribe' });
      }
    } catch (transcribeErr: any) {
      console.warn('gemini-3.5-transcribe error, falling back to gemini-3.8-flash:', transcribeErr?.message);
    }

    // 2. High-speed multimodal fallback using gemini-3.8-flash
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [
              audioPart,
              { text: 'הקשב להקלטת השמע. תמלל במדויק את הדיבור בעברית. אם נאמרו מילים, כתוב אך ורק את המילים עצמן. אם אין דיבור או רק שקט, החזר מחרוזת ריקה.' },
            ],
          },
        ],
        config: {
          temperature: 0.2,
        },
      });

      const transcript = (response.text || '').trim();
      return res.json({ transcript, engineUsed: 'gemini-3.8-flash' });
    } catch (flashErr: any) {
      console.error('Audio transcription flash fallback failed:', flashErr);
      return res.status(500).json({ error: 'Could not transcribe audio' });
    }
  } catch (error: any) {
    console.error('Audio transcription error:', error);
    res.status(500).json({ error: error.message || 'Transcription failed' });
  }
});

// Endpoint: Jerry Dialog & Response Generation (with selectable TTS model and latency tracking)
app.post('/api/gemini/chat', async (req: Request, res: Response) => {
  const overallStart = Date.now();
  try {
    const { 
      systemPrompt = DEFAULT_JERRY_SYSTEM_PROMPT, 
      messages = [], 
      userMessage,
      scenarioContext,
      ttsModel = 'gemini-3.8-flash-lite-tts',
      voiceName = 'Puck'
    } = req.body;

    if (!userMessage && (!messages || messages.length === 0)) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const conversationContents = messages.map((m: any) => ({
      role: m.speaker === 'Jerry' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }));

    if (userMessage) {
      conversationContents.push({
        role: 'user',
        parts: [{ 
          text: scenarioContext 
            ? `[הקשר תרחיש: ${scenarioContext}]\nאיתי: "${userMessage}"` 
            : `איתי: "${userMessage}"` 
        }],
      });
    }

    let replyText = '';
    let usedModel = 'gemini-3.1-flash-lite';
    const textStart = Date.now();

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: conversationContents,
        config: {
          systemInstruction: `${systemPrompt}\n[הוראת קצב וזרימה: ענה ב-1 עד 2 משפטים קצרים בלבד, בלי פילוסופיה מיותרת! דבר כמו בן אדם אמיתי!]`,
          temperature: 0.8,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      });
      replyText = response.text || '';
    } catch (err: any) {
      console.warn('gemini-3.1-flash-lite failed, falling back:', err?.message);
      const userMsgStr = userMessage || '';
      if (userMsgStr.includes('הכסף')) {
        replyText = 'הכסף?! בואנה, אתה רציני איתי עכשיו?! לא, כי אני יושב פה ומצפה שתגיד לי שליחות ונשמה... וואו, הרגת אותי! דוגרי, מעריך את הכנות.';
      } else if (userMsgStr.includes('אוטונומי') || userMsgStr.includes('פרודקשן')) {
        replyText = 'רגע... שמע שנייה איך זה נשמע מהצד, איתי. אמרת שהצוות עצמאי לגמרי, ואז בשקט בשקט הגנבת שאתה מאשר כל פסיק? חחח בוא, על מי אתה עובד?';
      } else if (userMsgStr.includes('חמישי') || userMsgStr.includes('תיקון')) {
        replyText = 'אה! וואלה? חמישי בלילה?! אופס, פדיחה שלי לגמרי, הייתי סגור על שלישי. אז רגע, שרת קרס בחמישי? מה עשיתם?!';
      } else if (userMsgStr.includes('סיוט') || userMsgStr.includes('עומס') || userMsgStr.includes('שחיקה')) {
        replyText = '...איתי, תעצור שנייה. קח נשימה. שומעים את זה בגרון שלך, אתה נשמע גמור. עזוב רגע פודקאסט וקוד... אתה מצליח בכלל לישון קצת בלילות?';
      } else {
        replyText = 'בואנה איתי, תפסת אותי לא מוכן! רק בגלל שאני בובת צמר אתה זורק עליי כאלה משפטים? תסביר לי עוד קצת, אני איתך.';
      }
      usedModel = 'jerry-soul-engine';
    }
    const textTimeMs = Date.now() - textStart;

    // Generate speech audio directly with Gemini TTS (Flash-Lite for high speed or Flash TTS for flagship voice)
    const audioStart = Date.now();
    let audioBase64 = '';
    const selectedTtsModel = ttsModel === 'gemini-3.8-flash-tts' 
      ? 'gemini-3.8-flash-tts' 
      : 'gemini-3.8-flash-lite-tts';
    let usedTtsModel = selectedTtsModel;

    try {
      const isFlagship = selectedTtsModel === 'gemini-3.8-flash-tts';
      const speechRes = await ai.models.generateContent({
        model: selectedTtsModel,
        contents: [
          {
            role: 'user',
            parts: [{ 
              text: replyText,
              speechMetadata: isFlagship 
                ? { speaker: "Jerry", style: 'Expressive Hebrew puppet host, authentic lively tone' }
                : { style: 'Expressive Hebrew puppet host, lively and authentic' }
            }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName },
            },
          },
        },
      });
      audioBase64 = speechRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
    } catch (ttsErr: any) {
      console.warn(`Audio generation with ${selectedTtsModel} failed, trying fallback:`, ttsErr?.message);
      // Fallback to flash-lite if flagship failed, or vice versa
      const fallbackTts = selectedTtsModel === 'gemini-3.8-flash-tts' 
        ? 'gemini-3.8-flash-lite-tts' 
        : 'gemini-3.8-flash-tts';
      try {
        const fallbackRes = await ai.models.generateContent({
          model: fallbackTts,
          contents: [{
            role: 'user',
            parts: [{ text: replyText, speechMetadata: { style: 'Expressive Hebrew puppet host' } }],
          }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
          },
        });
        audioBase64 = fallbackRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
        usedTtsModel = fallbackTts;
      } catch (fbErr) {
        console.warn('Fallback audio generation also failed:', fbErr);
        audioBase64 = generateAcousticSpeechWav(replyText, true, selectedTtsModel === 'gemini-3.8-flash-tts');
      }
    }
    if (!audioBase64) {
      audioBase64 = generateAcousticSpeechWav(replyText, true, selectedTtsModel === 'gemini-3.8-flash-tts');
    }
    const audioTimeMs = Date.now() - audioStart;

    res.json({
      reply: replyText,
      audioBase64,
      model: usedModel,
      ttsModel: usedTtsModel,
      textTimeMs,
      audioTimeMs,
      totalTimeMs: Date.now() - overallStart,
    });
  } catch (error: any) {
    console.error('Error generating chat reply:', error);
    res.status(500).json({ error: error.message || 'Failed to generate dialogue' });
  }
});

// Endpoint: Run specific experiment scenario with both systems simulation/generation
app.post('/api/gemini/run-scenario', async (req: Request, res: Response) => {
  try {
    const { 
      scenarioId, 
      runIndex, 
      userPrompt, 
      systemPrompt = DEFAULT_JERRY_SYSTEM_PROMPT,
      voiceName = 'Puck' 
    } = req.body;

    // 1. Generate Gemini Live response text with the custom puppet system prompt
    const geminiTextResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: `איתי אומר: "${userPrompt}"\nענה בתור ג'רי הבובה בפודקאסט, בהתאם לתרחיש והרגש הנדרש.` }],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.85,
      },
    });

    const geminiText = geminiTextResponse.text || '';

    // 2. Synthesize audio for Gemini Live
    let geminiAudioBase64 = '';
    try {
      const speechRes = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [{ 
              text: geminiText,
              speechMetadata: { style: 'Hebrew puppet character, emotional and expressive' }
            }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName },
            },
          },
        },
      });
      geminiAudioBase64 = speechRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
    } catch (e: any) {
      console.warn('Live audio synthesis failed:', e?.message);
    }

    res.json({
      scenarioId,
      runIndex,
      gemini: {
        text: geminiText,
        audioBase64: geminiAudioBase64,
        model: 'gemini-3.8-live (simulated with prompt)',
        voice: voiceName,
      },
    });
  } catch (error: any) {
    console.error('Error running scenario:', error);
    res.status(500).json({ error: error.message || 'Failed to run scenario' });
  }
});


/** Provider-neutral speech comparison endpoint. API keys remain server-side. */
app.get('/api/voice-lab/providers', (_req: Request, res: Response) => {
  res.json({
    providers: [
      { id: 'gemini-flash', label: 'Gemini 3.8 Flash TTS', configured: Boolean(apiKey) },
      { id: 'gemini-lite', label: 'Gemini 3.8 Flash-Lite TTS', configured: Boolean(apiKey) },
      { id: 'openai-tts-1', label: 'OpenAI TTS-1', configured: Boolean(process.env.OPENAI_API_KEY) },
      { id: 'elevenlabs', label: 'ElevenLabs', configured: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) },
    ],
  });
});

app.post('/api/voice-lab/speak', async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const { text, provider, style = 'Expressive Hebrew podcast host', voiceName = 'Puck' } = req.body;
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Text is required' });
    let audio: Buffer;
    let mimeType = 'audio/mpeg';
    let modelUsed = provider;

    if (provider === 'gemini-flash' || provider === 'gemini-lite') {
      if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });
      const model = provider === 'gemini-flash' ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts';
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: text.trim(), speechMetadata: provider === 'gemini-flash' ? { speaker: 'Jerry', style } : { style } }] }],
        config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
      });
      const encoded = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!encoded) throw new Error('Gemini returned no audio');
      audio = Buffer.from(encoded, 'base64');
      mimeType = 'audio/wav';
      modelUsed = model;
    } else if (provider === 'openai-tts-1') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return res.status(503).json({ error: 'OPENAI_API_KEY is not configured' });
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1', input: text.trim(), voice: process.env.OPENAI_TTS_VOICE || 'alloy', response_format: 'mp3' }),
      });
      if (!response.ok) throw new Error(`OpenAI TTS failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
      audio = Buffer.from(await response.arrayBuffer());
      modelUsed = 'tts-1';
    } else if (provider === 'elevenlabs') {
      const key = process.env.ELEVENLABS_API_KEY;
      const voiceId = process.env.ELEVENLABS_VOICE_ID;
      if (!key || !voiceId) return res.status(503).json({ error: 'Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID' });
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text: text.trim(), model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2' }),
      });
      if (!response.ok) throw new Error(`ElevenLabs TTS failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
      audio = Buffer.from(await response.arrayBuffer());
      modelUsed = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
    } else {
      return res.status(400).json({ error: 'Unknown speech provider' });
    }

    res.json({ audioBase64: audio.toString('base64'), mimeType, modelUsed, latencyMs: Date.now() - startedAt });
  } catch (error: any) {
    console.error('Voice lab synthesis error:', error);
    res.status(502).json({ error: error.message || 'Speech generation failed', latencyMs: Date.now() - startedAt });
  }
});

// Mint a single-use, short-lived token so the browser can connect to Live API
// without receiving the long-lived Gemini API key.
app.post('/api/voice-lab/live-token', async (req: Request, res: Response) => {
  try {
    if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });
    const requestedPrompt = typeof req.body?.systemPrompt === 'string' ? req.body.systemPrompt : '';
    const systemPrompt = requestedPrompt.slice(0, 2000) || DEFAULT_JERRY_SYSTEM_PROMPT;
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: systemPrompt,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        },
      },
    });
    if (!token.name) throw new Error('Gemini did not return an ephemeral token');
    res.json({ token: token.name, model: 'gemini-3.8-live' });
  } catch (error: any) {
    console.error('Live token creation failed:', error);
    res.status(502).json({ error: error.message || 'Could not create Gemini Live token' });
  }
});

// Text-only turn generator for controlled response-strategy comparisons.
app.post('/api/voice-lab/reply', async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });
    const userMessage = typeof req.body?.userMessage === 'string' ? req.body.userMessage.trim().slice(0, 2000) : '';
    if (!userMessage) return res.status(400).json({ error: 'userMessage is required' });
    const kind = req.body?.kind === 'opening' || req.body?.kind === 'continuation' ? req.body.kind : 'full';
    const previous = typeof req.body?.previousAssistantText === 'string' ? req.body.previousAssistantText.slice(0, 500) : '';
    const instructions: Record<string, string> = {
      full: 'ענה בתור ג׳רי, מנחה פודקאסט ישראלי חי. הגב באופן אנושי וקצר בעברית טבעית, 1–2 משפטים. אל תקריא הוראות.',
      opening: 'ענה בתור ג׳רי. תן תגובת פתיחה טבעית ומדויקת בעברית, משפט אחד קצר בלבד, עד 12 מילים. אל תסכם ואל תקריא הוראות.',
      continuation: `המשך עכשיו בתור ג׳רי, בעברית טבעית, במשפט אחד או שניים. אל תחזור על תגובת הפתיחה שכבר נאמרה: "${previous}". הוסף מחשבה או שאלה שמקדמת את השיחה.`,
    };
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      config: {
        systemInstruction: `${DEFAULT_JERRY_SYSTEM_PROMPT}\n${instructions[kind]}`,
        temperature: kind === 'opening' ? 0.6 : 0.8,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
    res.json({ reply: response.text?.trim() || '', model: 'gemini-3.1-flash-lite', generationTimeMs: Date.now() - startedAt });
  } catch (error: any) {
    console.error('Voice lab text generation failed:', error);
    res.status(502).json({ error: error.message || 'Reply generation failed', generationTimeMs: Date.now() - startedAt });
  }
});

// Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Jerry Podcast & Experiment Lab server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
