"use client";

// ★X-13-28（便 P168・2026-10-09）: 月の選択＝select 1 本（当月＋過去 12 か月・新しい順・確定済みの月に「確定」の印・既定＝当月・末尾「もっと前…」で 12 か月延長）。
//   手入力と datalist・「テキスト＋▾」は使わない（旧 components/nox/period-picker.tsx は撤去＝教訓109 候補）。値・state・URL は "YYYY-MM" のまま。
//   候補の並びと印は lib/nox/payroll/list-periods（payroll-list の X-13-14 と同じ純関数）＝給与・分析・月報・ノルマで同じ見た目。
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import { periodCandidatesOf, periodOptionLabelOf } from "@/lib/nox/payroll/list-periods";
import { fmtPeriodYM } from "@/lib/nox/payroll/view";

export const PERIOD_MORE = "__more__";

export default function PeriodSelect({ value, onChange, finalized, runPeriods = [], disabled = false, ariaLabel = "期間（年月）", style }: {
  value: string; onChange: (ym: string) => void;
  /** 確定済みの月（給与だけ渡す・他画面は省略＝印なし） */
  finalized?: ReadonlySet<string>;
  /** 候補に必ず含める月（run のある古い月など） */
  runPeriods?: readonly string[];
  disabled?: boolean; ariaLabel?: string; style?: React.CSSProperties;
}) {
  const [back, setBack] = useState(12);
  const current = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7); // JST の当月
  const fin = finalized ?? new Set<string>();
  const cands = periodCandidatesOf(current, [...runPeriods, value].filter(Boolean), back);
  return (
    <select value={value} disabled={disabled} aria-label={ariaLabel}
      style={{ ...t.input, width: "auto", padding: "6px 9px", fontSize: 13, ...style }}
      onChange={(e) => { if (e.target.value === PERIOD_MORE) { setBack((b) => b + 12); return; } onChange(e.target.value); }}>
      {cands.map((ym) => <option key={ym} value={ym}>{periodOptionLabelOf(ym, fin, fmtPeriodYM)}</option>)}
      <option value={PERIOD_MORE}>もっと前…</option>
    </select>
  );
}
