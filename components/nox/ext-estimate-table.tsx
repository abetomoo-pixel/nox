"use client";

// ★便 B M-70（2026-11-04）: 延長シミュレーションの表＝延長回数／終了時刻／加算／合計（税サ込）（人数割りの店は 1 人あたり）。
//   会計タブ「時間料金」の枠と、操作バー「見積」のポップオーバー（注文・指名・席タブからも同じ表）で同じ部品。計算は lib/nox/register/ext-estimate.ts（表示だけ）。
import * as t from "@/lib/nox/ui/theme";
import { EXT_ESTIMATE_NOTE, extEstimateEndLabelOf, type ExtEstimateRow } from "@/lib/nox/register/ext-estimate";

const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;

export default function ExtEstimateTable({ rows, startedAtMs, extMin, extAmount, units, note = true }: {
  rows: readonly ExtEstimateRow[]; startedAtMs: number; extMin: number; extAmount: number; units: number; note?: boolean;
}) {
  const perPerson = rows.some((r) => r.perPerson !== null);
  return (
    <div data-ext-estimate={rows.length} style={{ display: "grid", gap: 6 }}>
      <p style={{ ...t.sub, margin: 0 }}>延長 <span className="num">{yen(extAmount * Math.max(1, units))}</span> / {extMin}分{units > 1 ? `（${yen(extAmount)}×${units}名）` : ""}</p>
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
      {note && <p style={{ ...t.sub, margin: 0 }} data-ext-estimate-note="1">{EXT_ESTIMATE_NOTE}</p>}
    </div>
  );
}
