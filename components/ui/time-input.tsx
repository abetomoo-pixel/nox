"use client";

// ★便 M5b M-51（2026-11-02）: 時刻入力の共通部品＝正本 docs/handoff/mock/setup_v5.html の time 欄（時計アイコン付き・ダーク配色・48px）。
//   押すと時と分を選ぶ小窓が開く（分は step 刻み・既定 15）。小窓の欄に 26:00／2600 と打っても受け付ける（0〜47 時）。
//   表示は「翌02:00」（24 時以上）。after（開始の時刻）を渡すと、選んだ時刻が開始より前なら翌日として +24 時で返す＝保存する値の形（26:00）は変えない（変換は部品の中）。
//   値と表示の純関数は lib/nox/time/hhmm.ts（hmLabelOf／hmPickOf）。RPC・意味づけは呼び出し側。新トークン 0（.nox-time は globals.css）。
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { hmLabelOf, hmPickOf, normalizeHHMM } from "@/lib/nox/time/hhmm";

export default function TimeInput({ value, onChange, step = 15, after, maxHour = 47, disabled, ariaLabel, placeholder = "--:--", width, nextDayMark = true, style, startAt }: {
  /** "HH:MM"（0〜47 時）・空＝未入力 */
  value: string; onChange: (v: string) => void;
  /** 分の刻み（既定 15） */
  step?: number;
  /** 開始の時刻。渡すと「開始より前に選んだ時刻」は翌日（+24 時）として返す */
  after?: string | null;
  /** 時の上限（当日だけの欄は 23） */
  maxHour?: number;
  disabled?: boolean; ariaLabel?: string; placeholder?: string; width?: number | string;
  /** 翌日の時刻に「翌」を付ける（既定 true） */
  nextDayMark?: boolean;
  /** 旧 HmInput／type=time からの置き換え用＝幅（width）と flex だけ使う */
  style?: CSSProperties; required?: boolean; autoFocus?: boolean; className?: string;
  /** 空のとき小窓で最初に選んでおく時（例: 店の営業開始）＝表示の placeholder にもなる */
  startAt?: string | null;
}) {
  const w = width ?? style?.width ?? style?.maxWidth;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [hour, setHour] = useState<number | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const cur = /^(\d{2}):(\d{2})$/.exec(value);
  const curH = cur ? Number(cur[1]) % 24 : null, curM = cur ? Number(cur[2]) : null;
  const pick = (h: number, m: number) => { onChange(hmPickOf(h, m, after ?? null, maxHour)); setOpen(false); setHour(null); };
  // 打った値: 24 時以上（26:00）はそのまま・24 時未満は選んだときと同じ規則（開始より前なら翌日）
  const commitTyped = () => { const n = normalizeHHMM(typed, maxHour); if (!n) return; const [h, m] = n.split(":").map(Number); if (h >= 24) { onChange(n); setOpen(false); } else pick(h, m); };
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step).filter((m) => m < 60);
  const hours = Array.from({ length: Math.min(24, maxHour + 1) }, (_, i) => i);
  // 表示: 24 時以上は「翌」（hmLabelOf）。値が 0〜23 のままの欄（maxHour 23）でも after より前なら「翌」を付ける＝表示だけ（保存する値は変えない）
  const am = after ? /^(d{1,2}):(d{2})/.exec(after) : null;
  const beforeAfter = !!cur && !!am && Number(cur[1]) < 24 && Number(cur[1]) * 60 + Number(cur[2]) < (Number(am[1]) % 24) * 60 + Number(am[2]);
  const label = value ? (nextDayMark ? (beforeAfter ? `翌${value}` : hmLabelOf(value)) : value) : (startAt ? hmLabelOf(startAt) : placeholder);
  return (
    <span ref={box} className="nox-time" style={{ width: w, flex: style?.flex }} data-time-input="1">
      <button type="button" className="nox-time-btn num" disabled={disabled} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} data-empty={value ? undefined : "1"}
        onClick={() => { setOpen((o) => !o); setTyped(""); setHour(curH ?? (startAt && /^d{1,2}:/.test(startAt) ? Number(startAt.split(":")[0]) % 24 : null)); }}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <span>{label}</span>
      </button>
      {open && (
        <span className="nox-time-pop" role="dialog" aria-label={`${ariaLabel ?? "時刻"}を選ぶ`} data-time-pop="1">
          <span className="nox-time-cols">
            <span className="nox-time-col" aria-label="時">{hours.map((h) => (
              <button key={h} type="button" className={`num${(hour ?? curH) === h ? " on" : ""}`} onClick={() => setHour(h)}>{String(h).padStart(2, "0")}</button>
            ))}</span>
            <span className="nox-time-col" aria-label="分">{minutes.map((m) => (
              <button key={m} type="button" className={`num${curM === m && (hour ?? curH) === curH ? " on" : ""}`} disabled={(hour ?? curH) === null} onClick={() => { const h = hour ?? curH; if (h !== null) pick(h, m); }}>{String(m).padStart(2, "0")}</button>
            ))}</span>
          </span>
          <span className="nox-time-type">
            <input value={typed} inputMode="numeric" placeholder="26:00 と打っても可" aria-label="時刻を入力" className="num"
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitTyped(); }} />
            <button type="button" onClick={commitTyped}>決定</button>
          </span>
        </span>
      )}
    </span>
  );
}
