import React from 'react';
import { EpisodeChapter } from '../types/episode';
import { sfxEngine } from '../utils/soundEffects';
import { CheckCircle2, Clock, Sparkles } from 'lucide-react';

interface EpisodeTimelineProps {
  chapters: EpisodeChapter[];
  currentChapterId: string;
  onSelectChapter: (chapter: EpisodeChapter) => void;
}

export const EpisodeTimeline: React.FC<EpisodeTimelineProps> = ({
  chapters,
  currentChapterId,
  onSelectChapter,
}) => {
  const getBadgeStyle = (type: EpisodeChapter['type']) => {
    switch (type) {
      case 'intro':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'main_topic':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'jerry_tangent':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'bridge_back':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'jerry_question':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'outro':
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  const getTypeLabel = (type: EpisodeChapter['type']) => {
    switch (type) {
      case 'intro':
        return 'פתיח';
      case 'main_topic':
        return 'נושא מרכזי';
      case 'jerry_tangent':
        return 'טאנג׳נט של ג׳רי';
      case 'bridge_back':
        return 'חזרה למסלול';
      case 'jerry_question':
        return 'שאלת המחץ';
      case 'outro':
        return 'סגיר';
    }
  };

  const handleChapterClick = (chapter: EpisodeChapter) => {
    sfxEngine.play(chapter.cueSound || 'transition_whoosh');
    onSelectChapter(chapter);
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg text-right" dir="rtl">
      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-slate-100">מבנה פרק דינמי (פרקים ושלבי שיחה)</h3>
        </div>
        <span className="text-xs text-slate-400">
          לחץ על פרק לשינוי שלב השידור ומעבר קולי
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {chapters.map((ch) => {
          const isActive = ch.id === currentChapterId;
          return (
            <button
              key={ch.id}
              onClick={() => handleChapterClick(ch)}
              className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between ${
                isActive
                  ? 'bg-amber-950/40 border-amber-500/70 shadow-lg shadow-amber-500/10 scale-[1.01]'
                  : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getBadgeStyle(ch.type)}`}>
                    {getTypeLabel(ch.type)}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{ch.durationEst}</span>
                  </div>
                </div>

                <h4 className={`text-xs font-bold leading-snug line-clamp-1 ${isActive ? 'text-amber-300' : 'text-slate-200'}`}>
                  {ch.title}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                  {ch.description}
                </p>
              </div>

              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-700/40 text-[11px]">
                {isActive ? (
                  <span className="flex items-center gap-1 font-bold text-amber-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                    משודר כעת
                  </span>
                ) : ch.status === 'completed' ? (
                  <span className="flex items-center gap-1 text-slate-400">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    הושלם
                  </span>
                ) : (
                  <span className="text-slate-400">בהמשך</span>
                )}
                {ch.cueSound && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                    אפקט קולי
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
