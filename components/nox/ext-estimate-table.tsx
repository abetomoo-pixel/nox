"use client";

// ★便 B M-70（2026-11-04）: 延長シミュレーションの表＝延長回数／終了時刻／加算／合計（税サ込）（人数割りの店は 1 人あたり）。
//   会計タブ「時間料金」の枠と、操作バー「見積」のポップオーバー（注文・指名・席タブからも同じ表）で同じ部品。計算は lib/nox/register/ext-estimate.ts（表示だけ）。
import * as t from "@/lib/nox/ui/theme";
import { EXT_ESTIMATE_NOTE, extEstimateEndLabelOf, type ExtEstimatePattern, type ExtEstimateRow } from "@/lib/nox/register/ext-estimate";

const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;

/** ★Agoora 指摘（2026-11-04 20:59）: 延長パターンごと（平日通常／週末通常／VIP 延長…）に 1 表。今の既定パターンは「適用中」の印 */
export default function ExtEstimateTable({ patterns, startedAtMs, units, note = true }: {
  patterns: readonly ExtEstimatePattern[]; startedAtMs: number; units: number; note?: boolean;
}) {
  return (
    <div data-ext-estimate={patterns.length} style={{ display: "grid", gap: 10 }}>
      {patterns.map((p) => <PatternTable key={p.key} p={p} startedAtMs={startedAtMs} units={units} />)}
      {note && <p style={{ ...t.sub, margin: 0 }} data-ext-estimate-note="1">{EXT_ESTIMATE_NOTE}</p>}
    </div>
  );
}

function PatternTable({ p, startedAtMs, units }: { p: ExtEstimatePattern; startedAtMs: number; units: number }) {
  const rows: readonly ExtEstimateRow[] = p.rows;
  const perPerson = rows.some((r) => r.perPerson !== null);
  return (
    <div data-ext-estimate-pattern={p.key} data-ext-estimate-current={p.current ? "1" : "0"} style={{ display: "grid", gap: 4 }}>
      <p style={{ margin: 0, fontSize: 12.5, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <b>{p.label}</b>
        {p.current && <span className="nox-stpill ok" data-ext-estimate-pill="current">適用中</span>}{!p.current && p.isDefault && <span className="nox-stpill" data-ext-estimate-pill="default">既定</span>}
        <span style={t.sub}>延長 <span className="num">{yen(p.extAmount * Math.max(1, units))}</span> / {p.extMin}分{units > 1 ? `（${yen(p.extAmount)}×${units}名）` : ""}</span>
      </p>
      <table className="nox-table" style={{ width: "100%" }}>
        <thead><tr><th>延長回数</th><th>終了時刻</th><th className="num" style={{ textAlign: "right" }}>加算</th><th className="num" style={{ textAlign: "right" }}>合計（税サ込）</th>{perPerson && <th className="num" style={{ textAlign: "right" }}>1 人あたり</th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.n} data-ext-estimate-row={r.n} data-ext-estimate-total={r.total}>
              <td className="num">{r.n} 回目</td>
              <td className="num">{extEstimateEndLabelOf(r.endAtMs, startedAtMs)}</td>
              <td className="num">+{yen(r.add)}</td>
              <td className="num" style={{ fontWeight: 800 }}>{yen(r.total)}</td>
              {perPerson && <td className="num">{r.perPerson !== null ? yen(r.perPerson) : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
