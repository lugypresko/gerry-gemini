import React from 'react';
import { JERRY_DYNAMIC_ACTIONS } from '../data/episodeTopics';
import { JerryActionPrompt } from '../types/episode';
import { sfxEngine } from '../utils/soundEffects';
import { Sparkles, Bot } from 'lucide-react';

interface JerryDynamicActionsBarProps {
  onTriggerAction: (action: JerryActionPrompt) => void;
  disabled?: boolean;
}

export const JerryDynamicActionsBar: React.FC<JerryDynamicActionsBarProps> = ({
  onTriggerAction,
  disabled = false,
}) => {
  const handleAction = (action: JerryActionPrompt) => {
    sfxEngine.play(action.soundEffect);
    onTriggerAction(action);
  };

  return (
    <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/40 border border-amber-800/40 rounded-2xl p-4 shadow-lg text-right" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 border-b border-amber-900/30 pb-2.5">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-amber-300">
            פעולות דינמיות של ג׳רי (קטיעה, שאלות וסטיות מהנושא)
          </h3>
        </div>
        <p className="text-xs text-amber-200/70">
          לחץ כדי לגרום לג׳רי ליזום מהלך ספונטני, לקטוע או להציע טאנג׳נט קומי
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {JERRY_DYNAMIC_ACTIONS.map((action) => (
          <button
            key={action.id}
            disabled={disabled}
            onClick={() => handleAction(action)}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800/90 border border-amber-500/30 hover:border-amber-400 hover:bg-slate-800 text-center transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none group shadow-sm"
          >
            <span className="text-2xl mb-1 group-hover:animate-bounce">{action.icon}</span>
            <span className="text-xs font-bold text-slate-100 group-hover:text-amber-300">
              {action.buttonLabel}
            </span>
            <span className="text-[10px] text-slate-400 mt-1 line-clamp-1">
              {action.contextDescription}
            </span>
            <div className="mt-1.5 flex items-center gap-1 text-[9px] text-amber-400 font-mono">
              <Sparkles className="w-2.5 h-2.5" />
              <span>צליל מסונכרן</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
