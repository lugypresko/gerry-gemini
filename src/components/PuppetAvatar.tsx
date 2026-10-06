import React from 'react';
import { motion } from 'motion/react';
import { Heart, Sparkles } from 'lucide-react';

interface PuppetAvatarProps {
  isSpeaking: boolean;
  isListening?: boolean;
  emotion?: 'surprise' | 'skepticism' | 'calm_acknowledgement' | 'empathy' | 'stop_yield' | 'neutral';
  size?: 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
}

export const PuppetAvatar: React.FC<PuppetAvatarProps> = ({
  isSpeaking,
  isListening = false,
  emotion = 'neutral',
  size = 'md',
  className = '',
}) => {
  const sizeMap = {
    sm: 'w-24 h-24',
    md: 'w-44 h-44',
    lg: 'w-60 h-60',
    hero: 'w-72 h-72 md:w-88 md:h-88',
  };

  // Eyebrow and eye rotations based on emotion
  const getBrowOffset = () => {
    switch (emotion) {
      case 'surprise':
        return { leftY: -15, rightY: -15, leftRotate: -10, rightRotate: 10 };
      case 'skepticism':
        return { leftY: -18, rightY: 3, leftRotate: -18, rightRotate: 15 };
      case 'empathy':
        return { leftY: 5, rightY: 5, leftRotate: 20, rightRotate: -20 };
      case 'calm_acknowledgement':
        return { leftY: -2, rightY: -2, leftRotate: 2, rightRotate: -2 };
      case 'stop_yield':
        return { leftY: -6, rightY: -6, leftRotate: -4, rightRotate: 4 };
      default:
        return { leftY: 0, rightY: 0, leftRotate: 0, rightRotate: 0 };
    }
  };

  const brow = getBrowOffset();

  const getSoulDescription = () => {
    if (isSpeaking) {
      if (emotion === 'surprise') return 'בשוק אמיתי מהבטן! 😲';
      if (emotion === 'skepticism') return 'צוחק קלות ומזהה חירטוט 🤨';
      if (emotion === 'empathy') return 'כואב יחד עם איתי ומקשיב מכל הלב 🥺';
      if (emotion === 'calm_acknowledgement') return 'מכיר בטעות בחום ובלי אגו 🤝';
      if (emotion === 'stop_yield') return 'עוצר מיד ומפנה מקום לחבר 🛑';
      return 'מדבר בחום ובספונטניות 🎙️';
    }
    if (isListening) {
      if (emotion === 'empathy') return 'מקשיב בדאגה ורוך לחבר שלו 🫂';
      return 'מקשיב בריכוז מלא לאיתי 👀';
    }
    return 'נוכח באולפן, נושם ונינוח ☕';
  };

  return (
    <div className={`relative flex flex-col items-center justify-center select-none ${className}`}>
      
      {/* Puppet Head & Body Frame with organic breathing and head tilt */}
      <motion.div
        animate={{
          y: isSpeaking
            ? [0, -5, 0, -3, 0]
            : isListening
            ? [0, 2, 0, 1, 0] // attentive listening nods
            : [0, -2, 0], // gentle organic breathing
          rotate: isSpeaking
            ? [-1.5, 1.5, -1, 0]
            : isListening
            ? [2, 3, 2] // tilted towards Itay
            : [0, 0.5, 0],
          scale: emotion === 'surprise' ? 1.04 : emotion === 'empathy' ? 0.98 : 1,
        }}
        transition={{
          repeat: Infinity,
          duration: isSpeaking ? 0.42 : isListening ? 2.4 : 3.6,
          ease: 'easeInOut',
        }}
        className={`relative ${sizeMap[size]}`}
      >
        <svg
          viewBox="0 0 260 260"
          className="w-full h-full drop-shadow-2xl"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Rich felt gradients */}
            <linearGradient id="feltGrad" x1="15%" y1="10%" x2="85%" y2="90%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="45%" stopColor="#d97706" />
              <stop offset="85%" stopColor="#b45309" />
              <stop offset="100%" stopColor="#92400e" />
            </linearGradient>

            <linearGradient id="clothShirt" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="70%" stopColor="#0369a1" />
              <stop offset="100%" stopColor="#075985" />
            </linearGradient>

            <radialGradient id="noseGrad" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#f87171" />
              <stop offset="70%" stopColor="#dc2626" />
              <stop offset="100%" stopColor="#991b1b" />
            </radialGradient>

            <radialGradient id="cheekGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fca5a5" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#fca5a5" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Puppet Shoulders / Corduroy Vest & Shirt */}
          <path
            d="M 50 240 C 50 190, 210 190, 210 240 Z"
            fill="url(#clothShirt)"
            stroke="#0369a1"
            strokeWidth="3.5"
          />

          {/* Wooden / Felt Puppet Arms on Studio Table */}
          {/* Left Arm & Hand */}
          <g>
            <path
              d="M 55 210 C 35 220, 45 250, 75 245"
              fill="none"
              stroke="#b45309"
              strokeWidth="9"
              strokeLinecap="round"
            />
            {/* Left Felt Hand */}
            <circle cx="75" cy="245" r="9" fill="#d97706" stroke="#92400e" strokeWidth="2.5" />
          </g>

          {/* Right Arm & Hand - Gesture varies with emotion */}
          <g>
            {emotion === 'skepticism' ? (
              // Hand scratching chin
              <path
                d="M 205 210 Q 185 190 148 180"
                fill="none"
                stroke="#b45309"
                strokeWidth="8"
                strokeLinecap="round"
              />
            ) : emotion === 'empathy' ? (
              // Hand over chest / heart
              <path
                d="M 205 210 Q 170 215 130 220"
                fill="none"
                stroke="#b45309"
                strokeWidth="8"
                strokeLinecap="round"
              />
            ) : emotion === 'surprise' ? (
              // Hand raised in shock
              <path
                d="M 205 210 Q 230 170 220 150"
                fill="none"
                stroke="#b45309"
                strokeWidth="8"
                strokeLinecap="round"
              />
            ) : (
              // Resting on table
              <path
                d="M 205 210 C 225 220, 215 250, 185 245"
                fill="none"
                stroke="#b45309"
                strokeWidth="9"
                strokeLinecap="round"
              />
            )}
            <circle
              cx={emotion === 'skepticism' ? 148 : emotion === 'empathy' ? 130 : emotion === 'surprise' ? 220 : 185}
              cy={emotion === 'skepticism' ? 180 : emotion === 'empathy' ? 220 : emotion === 'surprise' ? 150 : 245}
              r="9"
              fill="#d97706"
              stroke="#92400e"
              strokeWidth="2.5"
            />
          </g>

          {/* Puppet Shirt Collar & Quirky Red Bow Tie */}
          <polygon points="130,205 116,228 144,228" fill="#ef4444" stroke="#b91c1c" strokeWidth="1.5" />
          <circle cx="130" cy="205" r="5.5" fill="#991b1b" />

          {/* Puppet Head (Textured Felt) */}
          <path
            d="M 45 125 C 45 45, 215 45, 215 125 C 215 190, 45 190, 45 125 Z"
            fill="url(#feltGrad)"
            stroke="#92400e"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />

          {/* Felt Ears */}
          <ellipse cx="42" cy="130" rx="14" ry="19" fill="#d97706" stroke="#92400e" strokeWidth="2.5" />
          <ellipse cx="42" cy="130" rx="8" ry="11" fill="#f59e0b" />
          <ellipse cx="218" cy="130" rx="14" ry="19" fill="#d97706" stroke="#92400e" strokeWidth="2.5" />
          <ellipse cx="218" cy="130" rx="8" ry="11" fill="#f59e0b" />

          {/* Messy Yarn Hair Tufts (Authentic handmade puppet look) */}
          <path
            d="M 85 64 Q 78 25 98 42 Q 115 18 128 38 Q 148 20 158 44 Q 172 30 162 66"
            fill="none"
            stroke="#78350f"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M 102 52 Q 108 28 122 36 Q 138 24 144 48"
            fill="none"
            stroke="#b45309"
            strokeWidth="4.5"
            strokeLinecap="round"
          />

          {/* Natural Rosy Cheeks */}
          <circle cx="75" cy="148" r="16" fill="url(#cheekGrad)" />
          <circle cx="185" cy="148" r="16" fill="url(#cheekGrad)" />

          {/* Expressive Movable Eyebrows */}
          <g
            style={{
              transform: `translate(0px, ${brow.leftY}px) rotate(${brow.leftRotate}deg)`,
              transformOrigin: '98px 88px',
              transition: 'transform 0.22s ease-out',
            }}
          >
            <rect x="76" y="82" width="44" height="8" rx="4" fill="#451a03" />
          </g>
          <g
            style={{
              transform: `translate(0px, ${brow.rightY}px) rotate(${brow.rightRotate}deg)`,
              transformOrigin: '162px 88px',
              transition: 'transform 0.22s ease-out',
            }}
          >
            <rect x="140" y="82" width="44" height="8" rx="4" fill="#451a03" />
          </g>

          {/* Googly Puppet Eyes with Natural Blinking Micro-Animations */}
          {/* Left Eye */}
          <circle cx="102" cy="110" r="21" fill="#ffffff" stroke="#78350f" strokeWidth="3" />
          {/* Right Eye */}
          <circle cx="158" cy="110" r="21" fill="#ffffff" stroke="#78350f" strokeWidth="3" />

          {/* Living Pupils - shift toward Itay when listening */}
          <motion.circle
            animate={{
              cx: isListening
                ? 107 // glancing towards co-host
                : emotion === 'skepticism'
                ? 106
                : emotion === 'surprise'
                ? 102
                : 102,
              cy: emotion === 'surprise' ? 106 : emotion === 'empathy' ? 114 : 111,
              r: emotion === 'surprise' ? 10 : 8,
            }}
            transition={{ duration: 0.2 }}
            fill="#0f172a"
          />
          <circle cx="98" cy="107" r="3" fill="#ffffff" />

          <motion.circle
            animate={{
              cx: isListening
                ? 163
                : emotion === 'skepticism'
                ? 162
                : emotion === 'surprise'
                ? 158
                : 158,
              cy: emotion === 'surprise' ? 106 : emotion === 'empathy' ? 114 : 111,
              r: emotion === 'surprise' ? 10 : 8,
            }}
            transition={{ duration: 0.2 }}
            fill="#0f172a"
          />
          <circle cx="154" cy="107" r="3" fill="#ffffff" />

          {/* Round Red Felt Nose */}
          <ellipse
            cx="130"
            cy="132"
            rx="16"
            ry="13.5"
            fill="url(#noseGrad)"
            stroke="#991b1b"
            strokeWidth="1.8"
          />

          {/* Soulful Mouth: flapping dynamically when speaking, gentle smile when listening */}
          {isSpeaking ? (
            <g>
              {/* Dynamic open mouth */}
              <motion.path
                animate={{
                  d: [
                    'M 90 154 Q 130 158 170 154 Q 162 192 130 195 Q 98 192 90 154 Z',
                    'M 90 154 Q 130 162 170 154 Q 165 178 130 180 Q 95 178 90 154 Z',
                    'M 90 154 Q 130 156 170 154 Q 168 202 130 205 Q 92 202 90 154 Z',
                  ],
                }}
                transition={{ repeat: Infinity, duration: 0.26, ease: 'easeInOut' }}
                fill="#450a0a"
                stroke="#78350f"
                strokeWidth="2.5"
              />
              {/* Soft pink tongue */}
              <ellipse cx="130" cy="184" rx="16" ry="10" fill="#f43f5e" />
              {/* Upper felt lip */}
              <path d="M 86 154 Q 130 148 174 154" fill="none" stroke="#78350f" strokeWidth="4.5" strokeLinecap="round" />
            </g>
          ) : emotion === 'surprise' ? (
            /* Wide round surprise mouth */
            <g>
              <ellipse cx="130" cy="172" rx="16" ry="20" fill="#450a0a" stroke="#78350f" strokeWidth="3" />
              <ellipse cx="130" cy="179" rx="10" ry="8" fill="#f43f5e" />
            </g>
          ) : emotion === 'skepticism' ? (
            /* Skeptical wincing smirk */
            <path
              d="M 94 164 Q 120 162 142 168 Q 166 158 172 154"
              fill="none"
              stroke="#451a03"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
          ) : emotion === 'empathy' ? (
            /* Soft, compassionate listening smile */
            <path
              d="M 102 166 Q 130 173 158 166"
              fill="none"
              stroke="#451a03"
              strokeWidth="4"
              strokeLinecap="round"
            />
          ) : emotion === 'stop_yield' ? (
            /* Attentive straight line */
            <path
              d="M 100 162 L 160 162"
              fill="none"
              stroke="#451a03"
              strokeWidth="4"
              strokeLinecap="round"
            />
          ) : (
            /* Warm, friendly conversational smile */
            <path
              d="M 94 158 Q 130 179 166 158"
              fill="none"
              stroke="#451a03"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
          )}

          {/* Hand-stitched seam details (warm craft texture) */}
          <path d="M 64 125 Q 60 135 62 145" stroke="#78350f" strokeWidth="2.5" strokeDasharray="3,3" fill="none" />
          <path d="M 196 125 Q 200 135 198 145" stroke="#78350f" strokeWidth="2.5" strokeDasharray="3,3" fill="none" />
        </svg>

        {/* Vintage Podcast Mic in front of Jerry */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
          <div className="w-7 h-11 bg-gradient-to-b from-zinc-200 via-zinc-400 to-zinc-600 rounded-full border-2 border-zinc-700 shadow-xl flex items-center justify-center">
            <div className="w-3.5 h-6 border border-zinc-500 rounded-sm opacity-60"></div>
          </div>
          <div className="w-2 h-7 bg-zinc-700"></div>
          <div className="w-9 h-2.5 bg-zinc-800 rounded-full shadow-lg"></div>
        </div>
      </motion.div>

      {/* Soul & Living Status Badge */}
      <div className="mt-3 flex flex-col items-center gap-1">
        <div className="flex items-center gap-2 px-3.5 py-1 bg-gradient-to-r from-amber-500/20 via-amber-400/20 to-amber-500/20 border border-amber-500/40 rounded-full shadow-sm">
          <Heart className="w-3 h-3 text-red-500 fill-red-500 animate-pulse" />
          <span className="text-xs font-black text-amber-200 tracking-wide">ג'רי (חי ונושם)</span>
          {isSpeaking ? (
            <span className="text-[10px] font-bold text-amber-950 px-1.5 py-0.2 bg-amber-400 rounded-full">
              מדבר עכשיו
            </span>
          ) : isListening ? (
            <span className="text-[10px] font-semibold text-blue-300 px-1.5 py-0.2 bg-blue-900/60 rounded-full">
              מקשיב לאיתי
            </span>
          ) : null}
        </div>

        <span className="text-[11px] text-amber-300/80 font-medium">
          {getSoulDescription()}
        </span>
      </div>

    </div>
  );
};
