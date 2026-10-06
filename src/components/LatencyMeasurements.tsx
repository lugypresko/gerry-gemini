import React, { useSyncExternalStore } from 'react';
import { latency } from '../utils/latency';
export function LatencyMeasurements() {
  const samples = useSyncExternalStore(latency.subscribe, latency.snapshot);
  if (!samples.length) return null;
  const ms = (value: number | undefined, start: number) => value === undefined ? '—' : `${Math.round(value - start)} ms`;
  return <details className="mx-4 mb-4 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs" dir="rtl">
    <summary>מדידות זמן · בקשה, טקסט, אודיו וניגון</summary>
    <p className="my-2 text-slate-400">זמנים מתחילת הבקשה. ניגון הוא אומדן מהדפדפן; אינו מדידה מהרמקול. השהיה לפני לחיצה על Play נכללת. טקסט לפי משך שרת אינו כולל רשת.</p>
    <div className="overflow-x-auto"><table className="w-full text-right"><thead><tr><th>בקשה / התחלה (ms)</th><th>טקסט מוכן</th><th>אודיו מוכן</th><th>ניגון ראשון</th></tr></thead><tbody>{samples.map(s=><tr key={s.id}><td dir="ltr">{s.path} / {Math.round(s.requestStart)}</td><td>{ms(s.textReady,s.requestStart)}</td><td>{ms(s.audioReady,s.requestStart)}</td><td title={s.playbackBasis}>{ms(s.firstAudiblePlayback,s.requestStart)}</td></tr>)}</tbody></table></div>
  </details>;
}
