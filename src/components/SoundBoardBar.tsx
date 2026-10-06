import React, { useState, useEffect } from 'react';
import { SOUND_EFFECTS_LIST, SoundEffectType, sfxEngine } from '../utils/soundEffects';
import { musicEngine } from '../utils/backgroundMusic';
import { audioController } from '../utils/audio';
import { Volume2, VolumeX, Music, Play, Pause, Sparkles, BellRing } from 'lucide-react';

interface SoundBoardBarProps {
  isSpeaking?: boolean;
}

export const SoundBoardBar: React.FC<SoundBoardBarProps> = ({ isSpeaking = false }) => {
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.55);
  const [lastPlayedSfx, setLastPlayedSfx] = useState<string | null>(null);
  const [testedSound, setTestedSound] = useState(false);

  // Sync speaking state with music ducking
  useEffect(() => {
    musicEngine.duck(isSpeaking);
  }, [isSpeaking]);

  const handleToggleMusic = () => {
    audioController.unlockAudio();
    if (isPlayingMusic) {
      musicEngine.stop();
      setIsPlayingMusic(false);
    } else {
      musicEngine.start();
      setIsPlayingMusic(true);
    }
  };

  const handleToggleMute = () => {
    audioController.unlockAudio();
    const muted = musicEngine.toggleMute();
    setIsMuted(muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    musicEngine.setVolume(val);
  };

  const handlePlaySfx = (id: SoundEffectType) => {
    audioController.unlockAudio();
    sfxEngine.play(id);
    setLastPlayedSfx(id);
    setTimeout(() => {
      setLastPlayedSfx((prev) => (prev === id ? null : prev));
    }, 1200);
  };

  const handleTestSpeaker = () => {
    audioController.testSpeakerSound();
    setTestedSound(true);
    setTimeout(() => setTestedSound(false), 1500);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md text-right" dir="rtl">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
        
        {/* Background Music Ambient Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
          <button
            onClick={handleToggleMusic}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium text-sm transition-all ${
              isPlayingMusic
                ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20'
                : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
            }`}
          >
            {isPlayingMusic ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isPlayingMusic ? 'מוזיקת רקע פעילה 🎶' : 'הפעל מוזיקת רקע'}</span>
            <Music className={`w-3.5 h-3.5 ${isPlayingMusic ? 'animate-bounce' : ''}`} />
          </button>

          {/* Volume and Mute */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleMute}
              className="p-1.5 text-slate-400 hover:text-white transition"
              title={isMuted ? 'בטל השתקה' : 'השתק'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1.0"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              disabled={!isPlayingMusic || isMuted}
              className="w-20 sm:w-24 accent-amber-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
            />
          </div>

          {/* Quick Sound Test Chime Button */}
          <button
            onClick={handleTestSpeaker}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition border ${
              testedSound
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 scale-105'
                : 'bg-slate-700/80 hover:bg-slate-700 text-amber-300 border-amber-500/40'
            }`}
            title="לחץ כדי לשמוע צליל בדיקה חזק וברור ולוודא שהרמקולים שלך עובדים"
          >
            <BellRing className="w-3.5 h-3.5 text-amber-400" />
            <span>{testedSound ? 'סאונד נבדק! 🔔' : 'בדיקת סאונד מיידית'}</span>
          </button>

          {/* Ducking Active Indicator */}
          {isPlayingMusic && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-slate-900/80 border border-slate-700">
              <span className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`}></span>
              <span className="text-slate-300">
                {isSpeaking ? 'הנמכת ווליום קולית (Ducking)' : 'ווליום מלא'}
              </span>
            </div>
          )}
        </div>

        {/* Sound Effects Trigger Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-start lg:justify-end">
          <div className="flex items-center gap-1 text-xs text-amber-400 font-semibold px-2 py-1 bg-amber-950/40 border border-amber-800/40 rounded-lg">
            <Sparkles className="w-3.5 h-3.5" />
            <span>סאונד-בורד חי:</span>
          </div>

          {SOUND_EFFECTS_LIST.map((sfx) => {
            const isJustPlayed = lastPlayedSfx === sfx.id;
            return (
              <button
                key={sfx.id}
                onClick={() => handlePlaySfx(sfx.id)}
                title={sfx.description}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  isJustPlayed
                    ? 'bg-amber-400 text-slate-950 border-amber-300 scale-105 shadow-md shadow-amber-400/30'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white hover:border-slate-600'
                }`}
              >
                <span>{sfx.icon}</span>
                <span>{sfx.label}</span>
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
};
