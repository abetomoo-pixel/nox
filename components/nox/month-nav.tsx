"use client";

// ★裁定306-1／306-4／306-6（2026-09-25）: 年月見出し（「YYYY年M月」）＋前月／翌月／今月＝確定タブの部品を切り出して
//   「配置を組む」と /mine の希望カレンダーで共用（新規に作らない）。見出しは sticky（306-1）。注記（306-2 募集期間・306-4 期間外）は見出し下の薄字。
//   月 state は呼び出し側が持つ（URL クエリ ?ym との同期は useYmQuery）。RPC／fetch は無し（表示だけ）。
import { useEffect, useRef, type ReactNode } from "react";
import * as t from "@/lib/nox/ui/theme";
import { ymFromSearch, ymLabelOf, ymSearchOf, ymShift } from "@/lib/nox/ui/month-nav";

const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

export default function MonthNav({ ym, today, onChange, onToday, heading = "h3", sticky = false, note, right, disabled = false, suffix }: {
  /** 表示月 'YYYY-MM' */
  ym: string;
  /** 今日 'YYYY-MM-DD'（「今月」ボタンの行き先） */
  today: string;
  onChange: (ym: string) => void;
  /** 「今月」の挙動を差し替える（既定＝onChange(today の月)） */
  onToday?: () => void;
  heading?: "h2" | "h3" | "b";
  sticky?: boolean;
  /** 見出し下の薄字（募集期間・期間外など） */
  note?: string | null;
  /** 右端の要素（案内文など） */
  right?: ReactNode;
  disabled?: boolean;
  /** 見出しの後ろに続ける語（例: 「 キャストシフト計画」） */
  suffix?: string;
}) {
  const label = ymLabelOf(ym) + (suffix ?? "");
  const H = heading;
  const title = H === "b"
    ? <b className="num" style={{ fontSize: 14 }}>{label}</b>
    : H === "h2" ? <h2 className="nox-monthnav-h" style={{ margin: 0 }}>{label}</h2> : <h3 className="nox-monthnav-h" style={{ margin: 0, fontSize: 14 }}>{label}</h3>;
  return (
    <div className={sticky ? "nox-calhead nox-monthnav nox-monthnav--sticky" : "nox-calhead nox-monthnav"}>
      <button type="button" style={btnLight} disabled={disabled} onClick={() => onChange(ymShift(ym, -1))} aria-label="前の月">‹</button>
      {title}
      <button type="button" style={btnLight} disabled={disabled} onClick={() => onChange(ymShift(ym, 1))} aria-label="次の月">›</button>
      <button type="button" style={btnLight} disabled={disabled} onClick={() => (onToday ? onToday() : onChange(today.slice(0, 7)))}>今月</button>
      {right && <span className="nox-monthnav-r">{right}</span>}
      {note && <span className="nox-monthnav-note">{note}</span>}
    </div>
  );
}

/** 306-1／306-2: 月 state を URL クエリ ?ym=YYYY-MM と同期（初回は ?ym があれば採用・以後は replaceState で書く＝履歴を汚さない） */
export function useYmQuery(ym: string, setYm: (m: string) => void) {
  const ready = useRef(false);
  useEffect(() => {
    const q = ymFromSearch(window.location.search);
    if (q) setYm(q);
    ready.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    const next = ymSearchOf(window.location.search, ym);
    if (next === window.location.search) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}${window.location.hash}`);
  }, [ym]);
}
