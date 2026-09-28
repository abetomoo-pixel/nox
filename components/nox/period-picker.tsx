"use client";

// ★便 X-5（2026-09-28）: 給与管理の期間入力。値・state・URL は "YYYY-MM" のまま、クリックで年・月をプルダウン／グリッドで選ぶ picker。
//   キーボード入力も残す（テキスト欄に YYYY-MM を打つと妥当な形になった時点で onChange）。裁定301 の折りたたみ型と同じ絶対配置＝親の行の高さに影響しない。
//   表示と選択の UI だけ＝RPC・意味づけは呼び出し側。新トークン 0（var() のみ）。
import { useEffect, useRef, useState } from "react";
import * as t from "@/lib/nox/ui/theme";

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export default function PeriodPicker({ value, onChange, disabled = false, yearsBack = 3, yearsAhead = 1, ariaLabel = "期間（YYYY-MM）" }: {
  value: string; onChange: (ym: string) => void; disabled?: boolean;
  /** 年の選択肢＝今年から過去 yearsBack 年・未来 yearsAhead 年（value の年も必ず含める） */
  yearsBack?: number; yearsAhead?: number; ariaLabel?: string;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number((YM.test(value) ? value : new Date().toISOString().slice(0, 7)).slice(0, 4)));
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { setText(value); if (YM.test(value)) setYear(Number(value.slice(0, 4))); }, [value]);
  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const thisYear = new Date().getFullYear();
  const years = new Set<number>();
  for (let y = thisYear - yearsBack; y <= thisYear + yearsAhead; y++) years.add(y);
  if (YM.test(value)) years.add(Number(value.slice(0, 4)));
  years.add(year);
  const yearList = [...years].sort((a, b) => a - b);
  const curM = YM.test(value) ? Number(value.slice(5, 7)) : 0;
  const curY = YM.test(value) ? Number(value.slice(0, 4)) : 0;

  function commitText(v: string) {
    setText(v);
    if (YM.test(v) && v !== value) onChange(v);
  }
  function pick(m: number) {
    const ym = `${year}-${String(m).padStart(2, "0")}`;
    setOpen(false);
    if (ym !== value) onChange(ym);
  }

  return (
    <div ref={wrap} style={{ position: "relative", display: "inline-block" }}>
      <div style={{ display: "inline-flex", alignItems: "stretch" }}>
        <input value={text} onChange={(e) => commitText(e.target.value)} onBlur={() => { if (!YM.test(text)) setText(value); }}
          onKeyDown={(e) => { if (e.key === "Enter" && YM.test(text)) { onChange(text); setOpen(false); } if (e.key === "Escape") setOpen(false); }}
          placeholder="YYYY-MM" inputMode="numeric" maxLength={7} disabled={disabled} aria-label={ariaLabel}
          style={{ ...t.input, width: 104, borderTopRightRadius: 0, borderBottomRightRadius: 0 }} />
        <button type="button" onClick={() => setOpen((v) => !v)} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-label="年と月を選ぶ"
          style={{ ...t.btnGhost, ...t.btnSm, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: "none", padding: "0 10px" }}>▾</button>
      </div>
      {open && (
        <div role="dialog" aria-label="年と月を選ぶ" style={{
          position: "absolute", left: 0, top: "100%", marginTop: 4, zIndex: 30, minWidth: 236,
          background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "var(--shadow)", padding: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="前の年" style={{ ...t.btnGhost, ...t.btnSm, padding: "2px 8px" }}>‹</button>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="年" style={{ ...t.input, flex: 1, padding: "4px 8px" }}>
              {yearList.map((y) => <option key={y} value={y}>{y} 年</option>)}
            </select>
            <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="次の年" style={{ ...t.btnGhost, ...t.btnSm, padding: "2px 8px" }}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {MONTHS.map((m, i) => {
              const on = year === curY && i + 1 === curM;
              return (
                <button key={m} type="button" onClick={() => pick(i + 1)} aria-pressed={on}
                  style={{ ...(on ? t.btnGold : t.btnGhost), ...t.btnSm, padding: "6px 0", width: "100%" }}>{m} 月</button>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" onClick={() => { const ym = new Date().toISOString().slice(0, 7); setYear(Number(ym.slice(0, 4))); setOpen(false); if (ym !== value) onChange(ym); }}
              style={{ ...t.btnGhost, ...t.btnSm }}>今月</button>
          </div>
        </div>
      )}
    </div>
  );
}
