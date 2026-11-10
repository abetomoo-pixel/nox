"use client";
// ★M-144（2026-11-10 Agoora 要望）: 曜日の選択の共通部品。
//   mode="holiday"＝定休日を選ぶ（選んだ曜日は赤＝危険色のトークン＋曜日の下に「定休」）
//   mode="pick"＝料金ルール・シフトなどの曜日（定休日は灰色＋「定休」・押しても反応しない・aria-disabled・選んだ曜日は今の青）
//   mode="single"＝1 つだけ選ぶ（必要人数の曜日など・定休日は pick と同じ扱い）
//   DowMark＝表の曜日の列（表示だけ・定休日は赤＋「定休」）
import type React from "react";

export const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

export type DowChipsProps = {
  selected: (dow: number) => boolean;
  onToggle?: (dow: number) => void;
  closed?: (dow: number) => boolean;
  mode?: "pick" | "holiday" | "single";
  labels?: readonly string[];
  ariaLabel: string;
  /** data 属性（verify と撮影の目印）＝data-dows="<name>" */
  name?: string;
  style?: React.CSSProperties;
};

/** 定休日の曜日を選ぶ／定休日を避けて曜日を選ぶ。 */
export default function DowChips({ selected, onToggle, closed, mode = "pick", labels = DOW_JA, ariaLabel, name, style }: DowChipsProps) {
  return (
    <div className="nox-dows" role="group" aria-label={ariaLabel} data-dows={name ?? "1"} style={style}>
      {labels.map((d, dow) => {
        const on = selected(dow);
        if (mode === "holiday") {
          return (
            <button key={dow} type="button" className={on ? "hol" : ""} aria-pressed={on} data-dow={dow} data-dow-hol={on ? "1" : "0"}
              onClick={() => onToggle?.(dow)}>
              <span className="d">{d}</span>{on && <span className="k">定休</span>}
            </button>
          );
        }
        const off = closed?.(dow) ?? false;
        return (
          <button key={dow} type="button" className={off ? "off" : on ? "on" : ""} aria-pressed={!off && on} aria-disabled={off || undefined}
            title={off ? "定休日の曜日は選べません（営業時間で定休日を外すと選べます）" : undefined}
            data-dow={dow} data-dow-closed={off ? "1" : "0"}
            onClick={() => { if (!off) onToggle?.(dow); }}>
            <span className="d">{d}</span>{off && <span className="k">定休</span>}
          </button>
        );
      })}
    </div>
  );
}

/** 表の曜日の列（表示だけ）。定休日は赤＋曜日の下に「定休」。 */
export function DowMark({ label, closed }: { label: string; closed: boolean }) {
  return (
    <span className={`nox-dowmark${closed ? " hol" : ""}`} data-dow-mark={closed ? "closed" : "open"}>
      <span className="d">{label}</span>{closed && <span className="k">定休</span>}
    </span>
  );
}
