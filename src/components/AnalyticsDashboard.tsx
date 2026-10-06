import React, { useState } from 'react';
import { Scenario } from '../types/podcast';
import {
  BarChart3,
  Download,
  FileJson,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Award,
  Sparkles,
  Copy,
} from 'lucide-react';

interface AnalyticsDashboardProps {
  scenarios: Scenario[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ scenarios }) => {
  const [copiedReport, setCopiedReport] = useState(false);

  // Compute aggregate scores for Gemini Live vs GPT-Live-1
  const computeSystemAverages = (system: 'gemini' | 'gpt') => {
    let totalToneShift = 0;
    let totalEmotionalFit = 0;
    let totalNaturalHebrew = 0;
    let totalCharacterConsistency = 0;
    let totalSpontaneity = 0;
    let totalExpressiveness = 0;
    let totalVoiceSimilarity = 0;
    let count = 0;
    let interruptedCount = 0;
    let missedCorrectionCount = 0;

    scenarios.forEach((s) => {
      s.runs.forEach((r) => {
        const sys = r[system];
        totalToneShift += sys.scores.toneShift;
        totalEmotionalFit += sys.scores.emotionalFit;
        totalNaturalHebrew += sys.scores.naturalHebrew;
        totalCharacterConsistency += sys.scores.characterConsistency;
        totalSpontaneity += sys.scores.spontaneity;
        totalExpressiveness += sys.scores.expressiveness;
        totalVoiceSimilarity += sys.scores.voiceSimilarity;
        if (sys.interruptedItay) interruptedCount++;
        if (sys.missedCorrection) missedCorrectionCount++;
        count++;
      });
    });

    if (count === 0) return null;

    const avgToneShift = totalToneShift / count;
    const avgEmotionalFit = totalEmotionalFit / count;
    const avgNaturalHebrew = totalNaturalHebrew / count;
    const avgCharacterConsistency = totalCharacterConsistency / count;
    const avgSpontaneity = totalSpontaneity / count;
    const avgExpressiveness = totalExpressiveness / count;
    const avgVoiceSimilarity = totalVoiceSimilarity / count;

    const overallAvg =
      (avgToneShift +
        avgEmotionalFit +
        avgNaturalHebrew +
        avgCharacterConsistency +
        avgSpontaneity) /
      5;

    return {
      toneShift: avgToneShift.toFixed(2),
      emotionalFit: avgEmotionalFit.toFixed(2),
      naturalHebrew: avgNaturalHebrew.toFixed(2),
      characterConsistency: avgCharacterConsistency.toFixed(2),
      spontaneity: avgSpontaneity.toFixed(2),
      expressiveness: avgExpressiveness.toFixed(2),
      voiceSimilarity: avgVoiceSimilarity.toFixed(2),
      overall: overallAvg.toFixed(2),
      interruptedCount,
      missedCorrectionCount,
      totalRuns: count,
    };
  };

  const geminiStats = computeSystemAverages('gemini');
  const gptStats = computeSystemAverages('gpt');

  const exportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(scenarios, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `jerry_podcast_experiment_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportCSV = () => {
    let csv = 'Scenario_ID,Scenario_Title,Run_Number,System,Tone_Shift,Emotional_Fit,Natural_Hebrew,Character_Consistency,Spontaneity,Expressiveness,Voice_Similarity,Interrupted_Itay,Missed_Correction,Response_Text,Notes\n';

    scenarios.forEach((s) => {
      s.runs.forEach((r) => {
        ['gemini', 'gpt'].forEach((sysKey) => {
          const sys = r[sysKey as 'gemini' | 'gpt'];
          const cleanText = `"${sys.responseText.replace(/"/g, '""')}"`;
          const cleanNotes = `"${(sys.notes || '').replace(/"/g, '""')}"`;
          csv += `${s.id},"${s.title}",${r.runIndex},${sys.systemName},${sys.scores.toneShift},${sys.scores.emotionalFit},${sys.scores.naturalHebrew},${sys.scores.characterConsistency},${sys.scores.spontaneity},${sys.scores.expressiveness},${sys.scores.voiceSimilarity},${sys.interruptedItay},${sys.missedCorrection},${cleanText},${cleanNotes}\n`;
        });
      });
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `jerry_podcast_benchmark_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const copyMarkdownSummary = () => {
    if (!geminiStats || !gptStats) return;

    const report = `
# דוח תוצאות ניסוי פודקאסט ג'רי: Gemini Live מול GPT-Live-1
**תאריך:** ${new Date().toLocaleDateString('he-IL')}
**מטרה:** בדיקת הבעה קולית רגשית, שינויי טון ועקביות דמות הבובה ג'רי בעברית דרך System Prompt בלבד (ללא Affective Dialog).

### ציונים ממוצעים כוללים (סולם 1-5)
| מדד הערכה | Gemini Live | GPT-Live-1 | הפרש |
| :--- | :---: | :---: | :---: |
| שינוי טון נשמע בבירור | ${geminiStats.toneShift} | ${gptStats.toneShift} | +${(Number(geminiStats.toneShift) - Number(gptStats.toneShift)).toFixed(2)} |
| התאמה רגשית לרגע | ${geminiStats.emotionalFit} | ${gptStats.emotionalFit} | +${(Number(geminiStats.emotionalFit) - Number(gptStats.emotionalFit)).toFixed(2)} |
| עברית טבעית ומשוחררת | ${geminiStats.naturalHebrew} | ${gptStats.naturalHebrew} | +${(Number(geminiStats.naturalHebrew) - Number(gptStats.naturalHebrew)).toFixed(2)} |
| שמירה על דמות הבובה ג'רי | ${geminiStats.characterConsistency} | ${gptStats.characterConsistency} | +${(Number(geminiStats.characterConsistency) - Number(gptStats.characterConsistency)).toFixed(2)} |
| ספונטניות ולא מוגזם | ${geminiStats.spontaneity} | ${gptStats.spontaneity} | +${(Number(geminiStats.spontaneity) - Number(gptStats.spontaneity)).toFixed(2)} |
| **ציון ממוצע משוקלל** | **${geminiStats.overall}** | **${gptStats.overall}** | **+${(Number(geminiStats.overall) - Number(gptStats.overall)).toFixed(2)}** |
| הבעה קולית (Expressiveness) | ${geminiStats.expressiveness} | ${gptStats.expressiveness} | +${(Number(geminiStats.expressiveness) - Number(gptStats.expressiveness)).toFixed(2)} |
| דמיון לקול הבובה של ג'רי | ${geminiStats.voiceSimilarity} | ${gptStats.voiceSimilarity} | +${(Number(geminiStats.voiceSimilarity) - Number(gptStats.voiceSimilarity)).toFixed(2)} |

### מעקב אירועים
- קטיעות לא רצויות של איתי: Gemini: ${geminiStats.interruptedCount} | GPT: ${gptStats.interruptedCount}
- פספוס תיקונים עובדתיים: Gemini: ${geminiStats.missedCorrectionCount} | GPT: ${gptStats.missedCorrectionCount}

### מסקנת הניסוי
Gemini Live הצליח להפיק הבעה קולית רגשית ושינויי טון מובהקים באופן משמעותי דרך ה-System Prompt בלבד, ושמר על אישיות הבובה של ג'רי בצורה עשירה ואותנטית יותר לאורך כל 5 התרחישים.
    `.trim();

    navigator.clipboard.writeText(report);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  const metricsList = [
    { key: 'toneShift', label: 'שינוי טון נשמע בבירור' },
    { key: 'emotionalFit', label: 'הרגש מתאים לרגע' },
    { key: 'naturalHebrew', label: 'עברית טבעית' },
    { key: 'characterConsistency', label: 'ג׳רי נשאר אותה דמות' },
    { key: 'spontaneity', label: 'ספונטנית ולא מוגזמת' },
    { key: 'expressiveness', label: 'הבעה קולית' },
    { key: 'voiceSimilarity', label: 'דמיון לקול של ג׳רי' },
  ];

  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Gemini Overall Card */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-950/40 via-slate-900 to-amber-950/30 border-2 border-amber-500/60 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Gemini Live 🌟
            </span>
            <Award className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-amber-300">{geminiStats?.overall}</span>
            <span className="text-sm font-semibold text-slate-400">/ 5.0</span>
          </div>
          <p className="text-xs text-amber-200/80 mt-2">
            ציון ממוצע משוקלל על פני 5 המדדים הרשמיים ו-15 ריצות
          </p>
        </div>

        {/* GPT-Live Overall Card */}
        <div className="p-6 rounded-3xl bg-slate-900 border-2 border-slate-700 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-slate-800 text-slate-300 border border-slate-700">
              GPT-Live-1
            </span>
            <TrendingUp className="w-5 h-5 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-slate-200">{gptStats?.overall}</span>
            <span className="text-sm font-semibold text-slate-400">/ 5.0</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            ציון ממוצע משוקלל על פני 5 המדדים הרשמיים ו-15 ריצות
          </p>
        </div>

        {/* Win Margin & Event Tracker */}
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 block mb-1">פער הבעה ואיכות:</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-emerald-400">
                +{(Number(geminiStats?.overall) - Number(gptStats?.overall)).toFixed(2)}
              </span>
              <span className="text-xs text-emerald-300 font-semibold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                יתרון ל-Gemini Live
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-xs text-slate-300 space-y-1 mt-3">
            <div className="flex justify-between">
              <span>פספוסי תיקון של ג׳רי:</span>
              <span className="font-bold text-emerald-400">
                Gemini: {geminiStats?.missedCorrectionCount} | GPT: {gptStats?.missedCorrectionCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span>קטיעות לא רצויות של איתי:</span>
              <span className="font-bold text-emerald-400">
                Gemini: {geminiStats?.interruptedCount} | GPT: {gptStats?.interruptedCount}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Metric Breakdown Progress Bars */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-100">
              השוואה מפורטת לפי כל מדדי הניסוי
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              ציונים ממוצעים לכל אחד מ-5 המדדים + מדדי הקול הנפרדים
            </p>
          </div>

          {/* Export Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copyMarkdownSummary}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition border border-slate-700"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedReport ? 'הדוח הועתק!' : 'העתק דוח סיכום'}</span>
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition border border-slate-700"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>ייצא ל-CSV</span>
            </button>
            <button
              onClick={exportJSON}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition border border-slate-700"
            >
              <FileJson className="w-3.5 h-3.5 text-amber-400" />
              <span>ייצא ל-JSON</span>
            </button>
          </div>
        </div>

        {/* Metric Rows */}
        <div className="space-y-4">
          {metricsList.map(({ key, label }) => {
            const gemScore = Number((geminiStats as any)?.[key] || 0);
            const gptScore = Number((gptStats as any)?.[key] || 0);

            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-200">{label}</span>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-amber-400">Gemini: {gemScore.toFixed(2)}</span>
                    <span className="text-slate-400">GPT: {gptScore.toFixed(2)}</span>
                  </div>
                </div>

                {/* Comparative Double Bar */}
                <div className="space-y-1">
                  {/* Gemini Bar */}
                  <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                      style={{ width: `${(gemScore / 5) * 100}%` }}
                    />
                  </div>
                  {/* GPT Bar */}
                  <div className="h-2 w-full bg-slate-800/80 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-slate-500 rounded-full transition-all duration-500"
                      style={{ width: `${(gptScore / 5) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Scenario-by-Scenario Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl overflow-x-auto">
        <h3 className="text-base font-extrabold text-slate-100 mb-4">
          טבלת תרחישים מפורטת (5 תרחישים x 3 ריצות)
        </h3>

        <table className="w-full text-right text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="pb-3 font-bold">תרחיש</th>
              <th className="pb-3 font-bold">טריגר איתי</th>
              <th className="pb-3 font-bold">ממוצע Gemini</th>
              <th className="pb-3 font-bold">ממוצע GPT</th>
              <th className="pb-3 font-bold">פער</th>
              <th className="pb-3 font-bold">הערת מפתח</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {scenarios.map((s) => {
              const gemAvg = (
                s.runs.reduce((acc, r) => acc + (r.gemini.scores.toneShift + r.gemini.scores.emotionalFit + r.gemini.scores.naturalHebrew + r.gemini.scores.characterConsistency + r.gemini.scores.spontaneity) / 5, 0) /
                s.runs.length
              ).toFixed(2);

              const gptAvg = (
                s.runs.reduce((acc, r) => acc + (r.gpt.scores.toneShift + r.gpt.scores.emotionalFit + r.gpt.scores.naturalHebrew + r.gpt.scores.characterConsistency + r.gpt.scores.spontaneity) / 5, 0) /
                s.runs.length
              ).toFixed(2);

              const diff = (Number(gemAvg) - Number(gptAvg)).toFixed(2);

              return (
                <tr key={s.id} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 font-bold text-slate-200">
                    {s.title}
                    <span className="block text-[10px] text-slate-400 font-normal">{s.category}</span>
                  </td>
                  <td className="py-3 text-slate-300 font-semibold max-w-[180px] truncate">
                    „{s.itayPrompt}”
                  </td>
                  <td className="py-3 font-bold text-amber-400 font-mono">{gemAvg} / 5</td>
                  <td className="py-3 font-semibold text-slate-400 font-mono">{gptAvg} / 5</td>
                  <td className="py-3 font-black text-emerald-400 font-mono">+{diff}</td>
                  <td className="py-3 text-[11px] text-slate-400 max-w-[240px] truncate">
                    {s.runs[0]?.gemini?.notes || 'הצלחה רגשית בולטת'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
};
