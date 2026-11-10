// ★M-149（2026-11-10）: シフトの手順図（1 枚）＝希望の受付 → 確認 → 確定 → 本人へ公開。段ごとに一覧で出る状態の名前を添える。
//   current＝今いる段（期間の状態から）を強調。店が決める店（希望を取らない店）は「希望の受付」を薄く出す。
import { FLOW_LABEL, FLOW_NOTE, FLOW_STAGES, FLOW_STATE_NAMES, type FlowStage } from "@/lib/nox/shift/flow";

export default function ShiftFlow({ current, storeDecides = false }: { current?: FlowStage | null; storeDecides?: boolean }) {
  return (
    <ol className="nox-shiftflow" aria-label="シフトの流れ" data-shift-flow={current ?? "none"}>
      {FLOW_STAGES.map((k, i) => (
        <li key={k} className={`${current === k ? "on" : ""}${storeDecides && k === "wish" ? " skip" : ""}`} data-flow-stage={k}>
          <span className="h"><span className="num">{i + 1}</span>{FLOW_LABEL[k]}</span>
          <span className="n">{storeDecides && k === "wish" ? "この店は希望を取らない（店が配置）" : FLOW_NOTE[k]}</span>
          <span className="st">{FLOW_STATE_NAMES[k].join("・")}</span>
        </li>
      ))}
    </ol>
  );
}
