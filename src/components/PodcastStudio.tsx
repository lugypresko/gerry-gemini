import { RecordingControls } from './RecordingControls';
import React, { useState, useRef, useEffect } from 'react';
import { PuppetAvatar } from './PuppetAvatar';
import { SoundBoardBar } from './SoundBoardBar';
import { EpisodeTimeline } from './EpisodeTimeline';
import { JerryDynamicActionsBar } from './JerryDynamicActionsBar';
import { DEFAULT_EPISODE_CHAPTERS } from '../data/episodeTopics';
import { EpisodeChapter, JerryActionPrompt } from '../types/episode';
import { PodcastMessage } from '../types/podcast';
import { audioController } from '../utils/audio';
import { sfxEngine } from '../utils/soundEffects';
import {
  Mic,
  MicOff,
  Send,
  Radio,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
  Volume2,
  User,
  Wand2,
  Clock,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';

interface PodcastStudioProps {
  activeTtsModel?: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts';
  setActiveTtsModel?: (model: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts') => void;
  selectedVoice?: string;
  systemPrompt?: string;
}

export const PodcastStudio: React.FC<PodcastStudioProps> = ({
  activeTtsModel: propActiveTtsModel,
  setActiveTtsModel: propSetActiveTtsModel,
  selectedVoice = 'Puck',
  systemPrompt,
}) => {
  const [internalTtsModel, setInternalTtsModel] = useState<'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts'>('gemini-3.8-flash-lite-tts');
  const ttsModel = propActiveTtsModel || internalTtsModel;
  const setTtsModel = propSetActiveTtsModel || setInternalTtsModel;

  const [messages, setMessages] = useState<PodcastMessage[]>([
    {
      id: 'msg-1',
      speaker: 'Jerry',
      text: 'שלום לכל המאזינים! כאן ג׳רי הבובה ואיתי, בפודקאסט שבו אנחנו מדברים על קוד, הייטק, ומה שביניהם. איתי, תגיד לי משהו... עם כל הניסיון שלך, מה באמת הביא אותך לעבוד פה?',
      timestamp: '00:12',
      emotion: 'neutral',
      ttsModel: 'gemini-3.8-flash-lite-tts',
      generationTimeMs: undefined,
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [isJerrySpeaking, setIsJerrySpeaking] = useState(false);
  const [isItaySpeaking, setIsItaySpeaking] = useState(false);
  const [jerryEmotion, setJerryEmotion] = useState<
    'surprise' | 'skepticism' | 'calm_acknowledgement' | 'empathy' | 'stop_yield' | 'neutral'
  >('neutral');
  const [chapters, setChapters] = useState<EpisodeChapter[]>(DEFAULT_EPISODE_CHAPTERS);
  const [currentChapterId, setCurrentChapterId] = useState<string>('ch-2');
  const [isLoadingJerry, setIsLoadingJerry] = useState(false);
  const [lastGenStats, setLastGenStats] = useState<{ timeMs: number; model: string } | null>(null);

  const [micAudioLevel, setMicAudioLevel] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [alternateAudioLoading, setAlternateAudioLoading] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const speechCapturedRef = useRef<string>('');

  // Auto scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isJerrySpeaking, isLoadingJerry]);

  // Setup Web Speech Recognition for instant zero-latency speech-to-text in Chrome/Edge
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.lang = 'he-IL';
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript + ' ';
          }
          currentTranscript = currentTranscript.trim();
          speechCapturedRef.current = currentTranscript;
          setInputText(currentTranscript);
        };

        recognition.onerror = (e: any) => {
          setMicError(`זיהוי הדיבור בדפדפן נכשל (${e?.error || 'unknown'}). ההקלטה תתומלל בשרת כשתלחץ לסיום.`);
        };

        recognitionRef.current = recognition;
      } catch (err) {
        console.warn('SpeechRecognition setup error:', err);
      }
    }
  }, []);

  // Start dual mic recording: MediaRecorder + WebSpeech
  const startRecording = async () => {
    setMicError(null);
    speechCapturedRef.current = '';
    audioChunksRef.current = [];
    await audioController.unlockAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Live Audio Meter
      const ctx = audioController.getAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        setMicAudioLevel(sum / dataArray.length);
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // MediaRecorder setup
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setMicAudioLevel(0);
        stream.getTracks().forEach((track) => track.stop());

        // Check if browser SpeechRecognition already gave us text
        const recognized = speechCapturedRef.current.trim();
        if (recognized.length > 0) {
          setInputText(recognized);
          // Send immediately for instant conversational feel
          await handleSendMessage(recognized);
          return;
        }

        // If WebSpeech gave no text (or wasn't supported), transcribe via Gemini
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size > 1000) {
          await transcribeAudioWithGemini(audioBlob, mimeType);
        } else {
          setMicError('לא זוהה קול ברור. נסה לדבר קרוב יותר למיקרופון או לבחור משפט מפתח.');
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.onerror = () => setMicError('הקלטת המיקרופון נכשלה. בדוק את התקן הקלט והרשאת הדפדפן.');
      recorder.start(200);
      setIsRecordingMic(true);
      audioController.playChime('record_start');

      // Start WebSpeech if available
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {}
      }
    } catch (err: any) {
      console.warn('Microphone access failed:', err);
      setIsRecordingMic(false);
      setMicError('גישת המיקרופון חסומה בדפדפן. ניתן להקליד את דברי איתי ישירות או להשתמש במשפטי המפתח למטה.');
      sfxEngine.play('record_scratch');
    }
  };

  const stopRecording = () => {
    setIsRecordingMic(false);
    audioController.playChime('record_stop');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleToggleMic = () => {
    if (isRecordingMic) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Transcribe recorded audio with server Gemini API
  const transcribeAudioWithGemini = async (blob: Blob, mimeType: string) => {
    setIsTranscribing(true);
    setMicError(null);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        try {
          const res = await fetch('/api/gemini/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64Audio, mimeType }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          const transcript = (data.transcript || '').trim();

          setIsTranscribing(false);
          if (transcript) {
            setInputText(transcript);
            await handleSendMessage(transcript);
          } else {
            setMicError('לא זוהה דיבור ברור בהקלטה. נסה לדבר שוב או להקליד.');
          }
        } catch (fetchErr: any) {
          console.error('Transcription fetch error:', fetchErr);
          setIsTranscribing(false);
          setMicError(fetchErr?.message || 'התמלול נכשל. נסה שוב או הקלד ידנית.');
        }
      };
    } catch (err) {
      console.error('File reading error:', err);
      setIsTranscribing(false);
    }
  };

  // Play audio for a message
  const playSpeakerAudio = async (msg: PodcastMessage) => {
    audioController.unlockAudio();
    if (msg.speaker === 'Jerry') {
      setIsJerrySpeaking(true);
      if (msg.emotion) {
        setJerryEmotion(msg.emotion as any);
      }

      if (msg.audioBase64) {
        audioController.playBase64Wav(msg.audioBase64, () => {
          setIsJerrySpeaking(false);
        });
        return;
      }

      // If audio is missing, fetch with current model
      try {
        const ttsRes = await fetch('/api/gemini/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: msg.text,
            voiceName: selectedVoice,
            style: `Expressive puppet host, emotion: ${msg.emotion || 'neutral'}`,
            ttsModel: ttsModel,
          }),
        });
        const ttsData = await ttsRes.json();
        if (!ttsRes.ok) throw new Error(ttsData.error || `HTTP ${ttsRes.status}`);
        if (ttsData.audioBase64) {
          msg.audioBase64 = ttsData.audioBase64;
          audioController.playBase64Wav(ttsData.audioBase64, () => {
            setIsJerrySpeaking(false);
          });
          return;
        }
      } catch (error: any) {
        setApiError(error.message || 'יצירת האודיו נכשלה');
        setIsJerrySpeaking(false);
        return;
      }
      setApiError('הספק לא החזיר אודיו');
      setIsJerrySpeaking(false);
    } else {
      setIsItaySpeaking(true);
      audioController.speakTextHebrew(
        msg.text,
        'itay',
        () => setIsItaySpeaking(true),
        () => setIsItaySpeaking(false)
      );
    }
  };

  // Compare on-the-fly: play the other TTS model for a message
  const handlePlayAlternateModel = async (msg: PodcastMessage) => {
    const currentModel = msg.ttsModel || ttsModel;
    const alternateModel = currentModel === 'gemini-3.8-flash-lite-tts'
      ? 'gemini-3.8-flash-tts'
      : 'gemini-3.8-flash-lite-tts';

    setAlternateAudioLoading(msg.id);
    audioController.unlockAudio();

    try {
      const res = await fetch('/api/gemini/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: msg.text,
          voiceName: selectedVoice,
          style: 'Hebrew puppet personality in podcast',
          ttsModel: alternateModel,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.audioBase64) {
        setIsJerrySpeaking(true);
        audioController.playBase64Wav(data.audioBase64, () => {
          setIsJerrySpeaking(false);
        });
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'יצירת האודיו נכשלה');
    } finally {
      setAlternateAudioLoading(null);
    }
  };

  // Send human message and generate Jerry's reply immediately without artificial delays
  const handleSendMessage = async (textToSend?: string) => {
    audioController.unlockAudio();
    const text = (textToSend || inputText).trim();
    if (!text || isLoadingJerry) return;

    // 1. Add Itay's message to transcript
    const itayMsg: PodcastMessage = {
      id: `itay-${Date.now()}`,
      speaker: 'Itay',
      text,
      timestamp: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
    };

    setMessages((prev) => [...prev, itayMsg]);
    setInputText('');
    speechCapturedRef.current = '';
    setIsLoadingJerry(true);

    // 2. Play Itay's speech briefly without blocking Jerry's API request!
    setIsItaySpeaking(true);
    audioController.speakTextHebrew(text, 'itay', undefined, () => setIsItaySpeaking(false));

    // 3. Immediately trigger Jerry's response in parallel
    await generateJerryReply(text);
  };

  const generateJerryReply = async (userPrompt: string) => {
    setApiError(null);
    try {
      const startTime = Date.now();
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: userPrompt,
          systemPrompt,
          messages: messages.slice(-4),
          ttsModel: ttsModel,
          voiceName: selectedVoice,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      const replyText = data.reply || '';
      if (!replyText) throw new Error('הספק לא החזיר תשובה');
      const audioBase64 = data.audioBase64 || '';
      const usedTtsModel = data.ttsModel || ttsModel;
      const totalTimeMs = data.totalTimeMs || (Date.now() - startTime);

      setLastGenStats({
        timeMs: totalTimeMs,
        model: usedTtsModel,
      });

      // Analyze emotion
      let detectedEmotion: any = 'neutral';
      if (replyText.includes('?!') || replyText.includes('באמת?!') || replyText.includes('מה?!')) {
        detectedEmotion = 'surprise';
        sfxEngine.play('lightbulb_ding');
      } else if (replyText.includes('רגע...') || replyText.includes('לא מסתדר') || replyText.includes('אוטונומי')) {
        detectedEmotion = 'skepticism';
        sfxEngine.play('mystery_stinger');
      } else if (replyText.includes('כבד') || replyText.includes('נשימה') || replyText.includes('שחיקה')) {
        detectedEmotion = 'empathy';
      } else if (replyText.includes('צודק') || replyText.includes('וואלה')) {
        detectedEmotion = 'calm_acknowledgement';
      }

      setJerryEmotion(detectedEmotion);

      const jerryMsg: PodcastMessage = {
        id: `jerry-${Date.now()}`,
        speaker: 'Jerry',
        text: replyText,
        audioBase64,
        timestamp: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
        emotion: detectedEmotion,
        ttsModel: usedTtsModel,
        generationTimeMs: totalTimeMs,
      };

      setMessages((prev) => [...prev, jerryMsg]);
      setIsItaySpeaking(false);
      playSpeakerAudio(jerryMsg);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'יצירת התשובה נכשלה');
    } finally {
      setIsLoadingJerry(false);
    }
  };

  // Dynamic Actions
  const handleTriggerJerryAction = (action: JerryActionPrompt) => {
    setJerryEmotion(action.emotion);

    const jerryActionMsg: PodcastMessage = {
      id: `jerry-action-${Date.now()}`,
      speaker: 'Jerry',
      text: action.jerryScript,
      timestamp: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
      emotion: action.emotion,
      ttsModel: ttsModel,
    };

    setMessages((prev) => [...prev, jerryActionMsg]);
    playSpeakerAudio(jerryActionMsg);
  };

  const handleSelectChapter = (ch: EpisodeChapter) => {
    setCurrentChapterId(ch.id);
    setChapters((prev) =>
      prev.map((c) => ({
        ...c,
        status: c.id === ch.id ? 'active' : c.status === 'active' ? 'completed' : c.status,
      }))
    );
  };

  const handleResetStudio = () => {
    audioController.stop();
    setIsJerrySpeaking(false);
    setIsItaySpeaking(false);
    setJerryEmotion('neutral');
    setMessages([
      {
        id: 'msg-start',
        speaker: 'Jerry',
        text: 'חזרנו לאולפן! מיקרופונים פתוחים, טייפ רץ. איתי, תן לנו את השאלה או הנושא הבא.',
        timestamp: '00:01',
        emotion: 'neutral',
        ttsModel: ttsModel,
        generationTimeMs: undefined,
      },
    ]);
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <RecordingControls transcript={messages} />
      {apiError && <p role="alert" className="rounded-xl border border-rose-700 bg-rose-950/40 p-3 text-sm text-rose-200">{apiError}</p>}
      
      {/* Sound Board & Ambient Music Bar */}
      <SoundBoardBar isSpeaking={isJerrySpeaking || isItaySpeaking} />

      {/* Episode Chapters Timeline */}
      <EpisodeTimeline
        chapters={chapters}
        currentChapterId={currentChapterId}
        onSelectChapter={handleSelectChapter}
      />

      {/* Main Podcast Stage (Studio Room) */}
      <div className="bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        
        {/* Top Studio Controls: ON AIR & TTS Model Selector */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800/80 pb-4 mb-6 gap-3">
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-red-500/15 border border-red-500/40 rounded-full">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
              <span className="text-xs font-black text-red-400 tracking-wider">ON AIR • שידור חי</span>
            </div>
            <span className="text-xs text-slate-400">אולפן דיאלוג: ג׳רי הבובה & איתי</span>
          </div>

          {/* TTS Model Quick Switcher */}
          <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 self-stretch sm:self-auto justify-between sm:justify-start">
            <span className="text-[11px] font-bold text-slate-400 px-2 hidden sm:inline">
              מודל קול (TTS):
            </span>

            <button
              onClick={() => {
                setTtsModel('gemini-3.8-flash-lite-tts');
                sfxEngine.play('lightbulb_ding');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                ttsModel === 'gemini-3.8-flash-lite-tts'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Gemini 3.8 Flash-Lite TTS (מהיר)</span>
            </button>

            <button
              onClick={() => {
                setTtsModel('gemini-3.8-flash-tts');
                sfxEngine.play('lightbulb_ding');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                ttsModel === 'gemini-3.8-flash-tts'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>Gemini 3.8 Flash TTS (דגל רגשי)</span>
            </button>

            <button
              onClick={handleResetStudio}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-300 transition mr-1"
              title="איפוס שיחה"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Stage Characters (Jerry Puppet & Itay Co-Host) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center p-4 bg-slate-950/60 rounded-2xl border border-slate-800/60 mb-6">
          
          {/* Jerry the Puppet Avatar */}
          <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-b from-amber-950/20 to-slate-900/40 rounded-2xl border border-amber-900/30 relative">
            <PuppetAvatar
              isSpeaking={isJerrySpeaking}
              isListening={isItaySpeaking}
              emotion={jerryEmotion}
              size="lg"
            />
            
            {/* Live Audio Meter for Jerry */}
            <div className="w-full mt-3 flex items-center justify-center gap-1 h-3">
              {[...Array(14)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-100 ${
                    isJerrySpeaking
                      ? 'bg-amber-400'
                      : isItaySpeaking
                      ? 'bg-blue-400/50'
                      : 'bg-slate-700'
                  }`}
                  style={{
                    height: isJerrySpeaking
                      ? `${Math.sin(i * 0.8 + Date.now() * 0.01) * 8 + 10}px`
                      : isItaySpeaking
                      ? `${Math.cos(i * 0.5 + Date.now() * 0.01) * 4 + 5}px`
                      : '4px',
                  }}
                />
              ))}
            </div>

            <span className="text-[11px] text-amber-300/80 mt-1 font-medium">
              {isJerrySpeaking ? 'ג׳רי מדבר במיקרופון 🎙️' : isLoadingJerry ? 'ג׳רי חושב ומפיק תגובה... ⚡' : 'ג׳רי מקשיב לך'}
            </span>
          </div>

          {/* Itay (Human Co-Host) */}
          <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-950/20 to-slate-900/40 rounded-2xl border border-blue-900/30 relative">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <div className={`w-28 h-28 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-xl border-4 ${isItaySpeaking ? 'border-blue-400 ring-4 ring-blue-500/30 scale-105 transition' : 'border-slate-700'}`}>
                <User className="w-14 h-14 text-white" />
              </div>

              {/* Host Vintage Mic */}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
                <div className="w-6 h-10 bg-gradient-to-b from-zinc-300 to-zinc-600 rounded-full border-2 border-zinc-700 shadow-md"></div>
                <div className="w-1.5 h-6 bg-zinc-700"></div>
                <div className="w-8 h-2 bg-zinc-800 rounded-full"></div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full">
              <span className={`w-2.5 h-2.5 rounded-full ${isItaySpeaking ? 'bg-blue-400 animate-ping' : 'bg-blue-400'}`}></span>
              <span className="text-xs font-bold text-blue-300 tracking-wide">איתי (בן אדם / מנחה)</span>
            </div>

            {/* Audio meter for Itay */}
            <div className="w-full mt-3 flex items-center justify-center gap-1 h-3">
              {[...Array(14)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-100 ${
                    isItaySpeaking
                      ? 'bg-blue-400'
                      : isRecordingMic
                      ? 'bg-red-400 animate-pulse'
                      : 'bg-slate-700'
                  }`}
                  style={{
                    height: isItaySpeaking
                      ? `${Math.cos(i * 0.8 + Date.now() * 0.01) * 8 + 10}px`
                      : isRecordingMic
                      ? `${Math.max(4, Math.min(18, (micAudioLevel / 10) * (i + 1)))}px`
                      : '4px',
                  }}
                />
              ))}
            </div>

            <span className="text-[11px] text-blue-300/70 mt-1">
              {isRecordingMic ? 'מקליט קול חי... דבר בעברית 🎙️' : isItaySpeaking ? 'מדבר כעת בפודקאסט...' : 'מוכן לדיבור'}
            </span>
          </div>

        </div>

        {/* Dynamic Jerry Interruptions and Actions */}
        <div className="mb-6">
          <JerryDynamicActionsBar
            onTriggerAction={handleTriggerJerryAction}
            disabled={isJerrySpeaking || isLoadingJerry}
          />
        </div>

        {/* Transcript Dialogue Feed */}
        <div className="bg-slate-950/70 rounded-2xl border border-slate-800 p-4 max-h-[340px] overflow-y-auto space-y-3 mb-4">
          <div className="text-[11px] font-semibold text-slate-400 border-b border-slate-800 pb-2 mb-2 flex items-center justify-between">
            <span>תמליל שיחה חי (פודקאסט)</span>
            <span className="text-amber-400 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" />
              לחץ על לחצן ההשמעה לצד כל הודעה להאזנה חוזרת
            </span>
          </div>

          {messages.map((msg) => {
            const isJerry = msg.speaker === 'Jerry';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 p-3.5 rounded-2xl border transition-all ${
                  isJerry
                    ? 'bg-amber-950/20 border-amber-900/40 text-slate-100'
                    : 'bg-blue-950/20 border-blue-900/40 text-slate-100'
                }`}
              >
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                      isJerry ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20' : 'bg-blue-600 text-white'
                    }`}
                  >
                    {isJerry ? 'ג׳' : 'א׳'}
                  </div>
                  <button
                    onClick={() => playSpeakerAudio(msg)}
                    className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-amber-400 transition"
                    title="השמע מחדש"
                  >
                    <Play className="w-3 h-3 fill-current" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${isJerry ? 'text-amber-400' : 'text-blue-400'}`}>
                        {isJerry ? "ג'רי הבובה" : 'איתי'}
                      </span>
                      {isJerry && msg.ttsModel && (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                          msg.ttsModel.includes('flash-lite')
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}>
                          {msg.ttsModel.includes('flash-lite') ? '⚡ Flash-Lite TTS' : '🎭 Flash TTS'}
                        </span>
                      )}
                      {isJerry && msg.generationTimeMs && (
                        <span className="text-[10px] text-slate-400 font-mono flex items-center gap-0.5">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {msg.generationTimeMs}ms
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {isJerry && (
                        <button
                          onClick={() => handlePlayAlternateModel(msg)}
                          disabled={alternateAudioLoading === msg.id}
                          className="text-[10px] text-indigo-300 hover:text-indigo-200 bg-indigo-950/50 hover:bg-indigo-900/60 border border-indigo-800/60 px-2 py-0.5 rounded-lg transition flex items-center gap-1"
                          title="השווה: שמע את אותו המשפט במודל ה-TTS השני"
                        >
                          <ArrowRightLeft className="w-2.5 h-2.5" />
                          {alternateAudioLoading === msg.id ? 'מייצר במודל השני...' : 'שמע במודל החלופי'}
                        </button>
                      )}
                      <span className="text-[10px] text-slate-500 font-mono">{msg.timestamp}</span>
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            );
          })}

          {isLoadingJerry && (
            <div className="flex items-center justify-between p-3.5 bg-amber-950/30 border border-amber-800/40 rounded-2xl text-amber-300 text-xs animate-pulse">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
                <span>ג׳רי מפיק תגובה קולית ב-<strong>{ttsModel === 'gemini-3.8-flash-lite-tts' ? 'Gemini 3.8 Flash-Lite TTS (מהירות שיא)' : 'Gemini 3.8 Flash TTS'}</strong>...</span>
              </div>
              <span className="text-[11px] text-amber-400/80 font-mono">מייצר בזמן אמת</span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Quick Scenario Preset Chips */}
        <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-medium whitespace-nowrap">משפטי מפתח לניסוי:</span>
          {[
            { label: '„הכסף”', text: 'הכסף.' },
            { label: '„אוטונומי לגמרי + מאשר הכל”', text: 'הצוות אוטונומי לגמרי, אבל אני מאשר כל שינוי בפרודקשן.' },
            { label: 'תיקון: „בחמישי בלילה”', text: 'לא ג׳רי, זה היה ביום חמישי בלילה, אחרי שהשרת קרס.' },
            { label: 'רגע רציני: „סיוט ועומס”', text: 'בכנות ג׳רי, השבועיים האחרונים היו סיוט. שעות מטורפות, הלחץ בשמיים ואני פשוט קורס מעומס.' },
            { label: 'קטיעה: „ג׳רי רגע!”', text: 'ג׳רי רגע! סליחה שאני קוטע, אבל בדיוק על זה רציתי להגיד משהו קריטי.' },
          ].map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(chip.text)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-900/40 border border-slate-700 hover:border-amber-500/50 text-slate-300 hover:text-amber-200 transition whitespace-nowrap text-xs"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Live Recording and Transcription Bar */}
        {(isRecordingMic || isTranscribing) && (
          <div className="mb-3 p-3.5 rounded-2xl bg-red-950/40 border border-red-500/40 flex items-center justify-between text-xs animate-pulse">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
              <span className="font-bold text-red-300">
                {isRecordingMic
                  ? 'מקליט את קולך חי... דבר בעברית ולחץ שוב על המיקרופון לסיום'
                  : 'מתמלל את הדיבור שלך ב-Gemini... ⏳'}
              </span>
            </div>

            {/* Live Volume Meter */}
            {isRecordingMic && (
              <div className="flex items-center gap-1">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-red-400 transition-all duration-75"
                    style={{
                      height: `${Math.max(4, Math.min(22, (micAudioLevel / 10) * (i + 1) * 2.5))}px`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mic Error Notification */}
        {micError && (
          <div className="mb-3 p-3 rounded-2xl bg-amber-950/40 border border-amber-600/40 text-amber-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{micError}</span>
            </div>
            <button
              onClick={() => setMicError(null)}
              className="text-amber-400 hover:text-white text-xs font-bold underline mr-2"
            >
              הבנתי
            </button>
          </div>
        )}

        {/* Host Input Bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleMic}
            className={`p-3.5 rounded-2xl border transition-all flex items-center gap-2 font-bold text-xs ${
              isRecordingMic
                ? 'bg-red-500 text-white border-red-400 animate-pulse shadow-lg shadow-red-500/30'
                : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white'
            }`}
            title={isRecordingMic ? 'עצור הקלטה' : 'דבר במיקרופון כמו איתי'}
          >
            {isRecordingMic ? (
              <>
                <MicOff className="w-5 h-5 text-white" />
                <span className="hidden sm:inline">עצור הקלטה</span>
              </>
            ) : (
              <>
                <Mic className="w-5 h-5 text-amber-400" />
                <span className="hidden sm:inline">דבר במיקרופון</span>
              </>
            )}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="הקלד את דברי איתי (או לחץ על המיקרופון כדי לדבר בעברית)..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition"
          />

          <button
            onClick={() => handleSendMessage()}
            disabled={!inputText.trim() || isLoadingJerry}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-amber-500/20 active:scale-95"
          >
            <span>דבר עם ג׳רי</span>
            <Send className="w-4 h-4" />
          </button>
        </div>

        {/* Generation Speed Tracker Footer */}
        {lastGenStats && (
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2 px-1">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              תגובה אחרונה הופקה ב-
              <strong className="text-white font-mono">{lastGenStats.timeMs}ms</strong>
              באמצעות
              <strong className="text-amber-300">
                {lastGenStats.model.includes('flash-lite') ? 'Gemini 3.8 Flash-Lite TTS' : 'Gemini 3.8 Flash TTS'}
              </strong>
            </span>
            <span className="text-slate-500">24kHz 16-bit Mono WAV</span>
          </div>
        )}

      </div>
    </div>
  );
};
