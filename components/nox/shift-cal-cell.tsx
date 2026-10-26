"use client";

// ★便 SH-UI-c2 C2-19（2026-10-23）: 月カレンダーの日セルと凡例（③④・確定シフトタブで共通）。文字は lib/nox/shift/cal-cell.ts・色は globals.css の --cal-*／--stg-*。
//   セルを押すと「その日の配置」ダイアログ（今の部品）＝onClick は呼び出し側。
import type { CSSProperties, ReactNode } from "react";
import type { PeriodCellStage } from "@/lib/nox/shift/period-cell";
import { cellTextOf, FILL_WORD, LEGEND_FILL, LEGEND_STAGE, STAGE_WORD, type CellStat } from "@/lib/nox/shift/cal-cell";

export function CalCell({ ymd, stat, stage, past, sel, today, onClick, title, extra, yen, closed }: {
  ymd: string; stat: CellStat; stage: PeriodCellStage; past?: boolean; sel?: boolean; today?: boolean; closed?: boolean; // ★便 NR-1 B①: 定休日
  onClick?: () => void; title?: string; extra?: ReactNode; yen?: string | null;
}) {
  const tx = cellTextOf(stat, closed === true);
  const cls = ["nox-cald", "nox-cald2", `fill-${tx.fill}`, past ? "past" : "", sel ? "sel" : "", today ? "today" : ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} data-cal-cell={ymd} data-cal-fill={tx.fill} data-cal-stage={stage} data-cal-closed={closed ? "1" : undefined} onClick={onClick} title={title ?? `${ymd}・${FILL_WORD[tx.fill]}・${STAGE_WORD[stage]}`}>
      <span className="nox-cald-n num">{Number(ymd.slice(8))}</span>
      <span className={`nox-cald-bd stg-${stage}`} data-cal-badge={stage}>{STAGE_WORD[stage]}</span>
      <span className="nox-cald-ctr num" data-cal-center="1">{tx.center}{tx.pending && <small className="nox-cald-pd">（{tx.pending}）</small>}</span>
      {tx.sub && <span className="nox-cald-sub" data-cal-sub="1">{tx.sub}</span>}
      {yen && <span className="nox-cald-y num">{yen}</span>}
      {extra}
    </button>
  );
}

/** 凡例＝進行状況 5 つ／充足状況 4 つの 2 列（390px は 2 段） */
export function CalLegend({ style }: { style?: CSSProperties }) {
  return (
    <div className="nox-callegend" data-cal-legend="1" style={style}>
      <div className="nox-callegend-col" data-cal-legend-col="stage"><span className="nox-callegend-h">進行状況（右上バッジ）</span>{LEGEND_STAGE.map(([k, l]) => <span key={k} className="nox-callegend-it"><i className={`nox-cald-bd stg-${k}`}>{l}</i></span>)}</div>
      <div className="nox-callegend-col" data-cal-legend-col="fill"><span className="nox-callegend-h">必要人数の充足（地色）</span>{[...LEGEND_FILL, ["closed", "定休日（対象外）"] as const].map(([k, l]) => <span key={k} className="nox-callegend-it"><i className={`nox-callegend-sw fill-${k}`} />{l}</span>)}</div>
    </div>
  );
}
