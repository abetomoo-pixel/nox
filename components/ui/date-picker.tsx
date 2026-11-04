"use client";

// ★便 A M-67（2026-11-04・教訓133 追記）: 日付入力の共通部品＝押して選ぶカレンダー（月送り・営業日基準＝定休日は薄く・今日に印）。ネイティブの date は使わない。
//   見た目は時刻の部品（TimeInput＝.nox-time／.nox-time-btn／.nox-time-pop）と同じ殻＝新トークン 0。値は "YYYY-MM-DD"（空＝未入力）・min／max の外は押せない。
//   closedDows（0=日..6=土）を渡すと定休日を薄く「休」（押せるかは isDisabled で決める＝既定は押せる）。
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { daysInMonthOf } from "@/lib/nox/month"; // ★x13h(1-2): 末日は lib/nox/month

const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymdOf = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
/** 表示用 "11/8（土）" */
export function dateLabelOf(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? "");
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return `${y}/${mo}/${d}（${DOW_JA[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]}）`;
}

export default function DatePicker({ value, onChange, min, max, disabled, ariaLabel, placeholder = "日付を選ぶ", width, closedDows, isDisabled, todayYmd, testId }: {
  /** "YYYY-MM-DD"・空＝未入力 */
  value: string; onChange: (v: string) => void;
  min?: string | null; max?: string | null;
  disabled?: boolean; ariaLabel?: string; placeholder?: string; width?: number | string;
  /** 定休日の曜日（薄く「休」） */
  closedDows?: ReadonlySet<number> | readonly number[];
  /** 押せない日（min／max に加えて） */
  isDisabled?: (ymd: string) => boolean;
  /** 「今日」の印（営業日の今日を渡す） */
  todayYmd?: string | null;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const base = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : (todayYmd ?? new Date().toISOString().slice(0, 10));
  const [ym, setYm] = useState<[number, number]>([Number(base.slice(0, 4)), Number(base.slice(5, 7))]);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const closed = new Set(closedDows ?? []);
  const [y, m] = ym;
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const dim = daysInMonthOf(`${y}-${String(m).padStart(2, "0")}`); // ★x13h(1-2): 末日は lib/nox/month に寄せる
  const move = (d: number) => { const n = new Date(Date.UTC(y, m - 1 + d, 1)); setYm([n.getUTCFullYear(), n.getUTCMonth() + 1]); };
  const can = (ymd: string) => !(min && ymd < min) && !(max && ymd > max) && !(isDisabled?.(ymd));
  const pick = (ymd: string) => { if (!can(ymd)) return; onChange(ymd); setOpen(false); };
  const cell: CSSProperties = { minHeight: 32, border: 0, borderRadius: 6, background: "transparent", color: "var(--ink)", font: "inherit", fontSize: 13, cursor: "pointer" };
  return (
    <span ref={box} className="nox-time" style={{ width }} data-date-picker={testId ?? "1"}>
      <button type="button" className="nox-time-btn num" disabled={disabled} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} data-empty={value ? undefined : "1"}
        onClick={() => { setOpen((o) => !o); if (/^\d{4}-\d{2}-\d{2}$/.test(value)) setYm([Number(value.slice(0, 4)), Number(value.slice(5, 7))]); }}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <span>{value ? dateLabelOf(value) : placeholder}</span>
      </button>
      {open && (
        <span className="nox-time-pop" role="dialog" aria-label={`${ariaLabel ?? "日付"}を選ぶ`} data-date-pop="1" style={{ width: 252 }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
            <button type="button" style={{ ...cell, padding: "0 8px" }} aria-label="前の月" onClick={() => move(-1)}>‹</button>
            <b className="num" style={{ fontSize: 13 }}>{y}年{m}月</b>
            <button type="button" style={{ ...cell, padding: "0 8px" }} aria-label="次の月" onClick={() => move(1)}>›</button>
          </span>
          <span style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {DOW_JA.map((d, i) => <span key={d} style={{ textAlign: "center", fontSize: 10.5, color: i === 0 ? "var(--bad)" : i === 6 ? "var(--champ)" : "var(--sub)" }}>{d}</span>)}
            {Array.from({ length: first }, (_, i) => <span key={`p${i}`} />)}
            {Array.from({ length: dim }, (_, i) => {
              const ymd = ymdOf(y, m, i + 1); const dow = (first + i) % 7; const ok = can(ymd); const isCur = ymd === value; const isToday = ymd === todayYmd; const hol = closed.has(dow);
              return (
                <button key={ymd} type="button" className="num" disabled={!ok} data-date-cell={ymd} onClick={() => pick(ymd)}
                  style={{ ...cell, opacity: ok ? (hol ? 0.55 : 1) : 0.3, cursor: ok ? "pointer" : "default", background: isCur ? "var(--champ)" : "transparent", color: isCur ? "#111" : undefined, fontWeight: isCur || isToday ? 800 : undefined, outline: isToday && !isCur ? "1px solid var(--champ)" : undefined }}
                  title={hol ? "定休日" : undefined}>{i + 1}{hol && <span style={{ display: "block", fontSize: 8, lineHeight: 1 }}>休</span>}</button>
              );
            })}
          </span>
        </span>
      )}
    </span>
  );
}
