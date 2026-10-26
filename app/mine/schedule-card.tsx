"use client";

// ★便 X13-G W-22 ②⑤: /mine「出勤予定」＝今月／来月の 2 タブ・「確定」と「確認待ち」（薄い色と印）に分けて日付順・募集中は出さない。
//   先頭に出勤ノルマの不足の 1 行（出勤日数の軸を採用した店でノルマがあるときだけ）。「＋ 希望を提出」は右上。データはサーバ（page）で用意。
import { useState } from "react";
import Link from "next/link";
import ShiftConfirmButton from "./shift-confirm-button";
import ShiftDeclineButton from "./shift-decline-button"; // ★便 ON-3（0176 ★5 (c)・裁定406）: 辞退で店に戻る
import type { DaysNormLine, ScheduleItem } from "@/lib/nox/mine/schedule";

export type ScheduleTab = { month: string; label: string; fixed: ScheduleItem[]; pending: ScheduleItem[]; norm: DaysNormLine | null };

export function DaysNormNote({ norm }: { norm: DaysNormLine }) {
  return (
    <p className="nox-daysnorm" data-days-norm={norm.achieved ? "ok" : "short"}>
      <span className="num">{norm.label}</span>
      {norm.achieved && <span className="nox-stpill ok" style={{ marginLeft: 6 }}>達成見込み</span>}
      {norm.pendingLabel && <span className="num" style={{ display: "block", color: "var(--sub)", fontSize: 12.5 }} data-days-norm-pending="1">{norm.pendingLabel}</span>}
    </p>
  );
}

export default function ScheduleCard({ tabs }: { tabs: ScheduleTab[] }) {
  const [i, setI] = useState(0);
  const cur = tabs[i];
  const row = (x: ScheduleItem) => (
    <li key={`${x.source}-${x.id}`} className={`nox-schedrow${x.kind === "pending" ? " pending" : ""}`} data-sched={x.kind}>
      <span className="num d">{Number(x.date.slice(5, 7))}/{Number(x.date.slice(8, 10))}（{x.dow}）</span>
      <span className="num tm">{x.time}</span>
      {x.kind === "pending" && <span className="nox-stpill" style={{ fontSize: 10.5 }}>{x.source === "wish" ? "申請済み" : x.proposed ? "確認待ち（あなた）" : "確認待ち"}</span>}
      {x.proposed && <ShiftConfirmButton shiftId={x.id} />}
      {x.proposed && <ShiftDeclineButton shiftId={x.id} />}{/* ★便 ON-3: 確認待ち（あなた）＝確認する／辞退 */}
    </li>
  );
  return (
    <section className="nox-panel" data-mine-schedule="1">
      <h3>
        出勤予定
        <Link href="/mine/wishes" className="nox-link" style={{ marginLeft: "auto", fontSize: 12 }}>＋ 希望を提出</Link>
      </h3>
      <div className="nox-seg" style={{ display: "inline-flex", margin: "4px 0 10px" }} role="tablist" aria-label="出勤予定の月">
        {tabs.map((tb, k) => <button key={tb.month} type="button" role="tab" aria-selected={k === i} className={k === i ? "on" : ""} onClick={() => setI(k)}>{tb.label}</button>)}
      </div>
      {cur.norm && <DaysNormNote norm={cur.norm} />}
      {cur.fixed.length === 0 && cur.pending.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--sub)" }}>出勤予定はまだありません</p>
      ) : (
        <>
          <div className="nox-schedh">確定（{cur.fixed.length}）</div>
          {cur.fixed.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>なし</p> : <ul className="nox-schedlist">{cur.fixed.map(row)}</ul>}
          <div className="nox-schedh">確認待ち（{cur.pending.length}）</div>
          {cur.pending.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>なし</p> : <ul className="nox-schedlist">{cur.pending.map(row)}</ul>}
        </>
      )}
    </section>
  );
}
