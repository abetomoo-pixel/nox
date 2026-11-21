"use client";
// ★運営コンソール 版 1（夜便 2026-11-20 N5）: テナント一覧（絞り：状態・経路・検索／1024 は表・375 はカード）。
import Link from "next/link";
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import { fmtJst, kindLabelOf, OPS_KIND_FILTERS, OPS_ROUTE_FILTERS, opsFilterOf, routeLabelOf, type OpsOrgRow } from "@/lib/nox/ops/labels";
import { OpsProgressPills } from "./ops-progress"; // ★2026-11-21 夜（2c）: 会社ごとの札（受諾・初期設定・LINE・キャスト・導入＝済／途中／未）

export default function OrgList({ rows }: { rows: OpsOrgRow[] }) {
  const [kind, setKind] = useState("all");
  const [route, setRoute] = useState("all");
  const [q, setQ] = useState("");
  const list = opsFilterOf(rows, { kind, route, q });
  const sel: React.CSSProperties = { ...t.input, width: "auto", minWidth: 120 };
  return (
    <section data-ops-list={String(list.length)}>
      <div className="nox-actions" style={{ marginBottom: 12 }}>
        <Link href="/ops/orgs/new" style={{ ...t.btnGold, textDecoration: "none" }} data-ops-add="1">＋ テナントを追加</Link>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <select aria-label="状態" value={kind} onChange={(e) => setKind(e.target.value)} style={sel}>{OPS_KIND_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="経路" value={route} onChange={(e) => setRoute(e.target.value)} style={sel}>{OPS_ROUTE_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input aria-label="検索（会社名・オーナーのメール）" placeholder="会社名・オーナーのメール" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...t.input, flex: "1 1 200px", minWidth: 0 }} />
      </div>
      {list.length === 0 ? <p style={{ textAlign: "center", color: "var(--sub)" }}>{rows.length === 0 ? "まだテナントがありません" : "合うテナントがありません"}</p> : (
        <>
          <div className="nox-ops-table" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--sub)" }}>
                {["会社名", "状態", "経路", "導入の状況", "最後に使われた時刻", "作った日"].map((h) => <th key={h} style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{h}</th>)}
              </tr></thead>
              <tbody>{list.map((r) => (
                <tr key={r.org_id} data-ops-row={r.org_id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "8px" }}><Link href={`/ops/orgs/${r.org_id}`} className="nox-link" style={{ fontWeight: 700 }}>{r.org_name}</Link>{r.onboarding_state === "onboarding" && <span className="nox-stpill" style={{ marginLeft: 6 }}>導入中</span>}</td>
                  <td style={{ padding: "8px", whiteSpace: "nowrap" }}><span className="nox-stpill">{kindLabelOf(r)}</span></td>
                  <td style={{ padding: "8px" }}>{routeLabelOf(r.agency_code)}</td>
                  <td style={{ padding: "8px", minWidth: 260 }}><OpsProgressPills row={r} /></td>
                  <td style={{ padding: "8px" }} className="num">{fmtJst(r.last_used_at)}</td>
                  <td style={{ padding: "8px" }} className="num">{fmtJst(r.created_at, false)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="nox-ops-cards" style={{ display: "none", gap: 8 }}>
            {list.map((r) => (
              <Link key={r.org_id} href={`/ops/orgs/${r.org_id}`} style={{ ...t.card, display: "block", textDecoration: "none", color: "inherit" }} data-ops-card={r.org_id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}><b>{r.org_name}</b><span className="nox-stpill">{kindLabelOf(r)}</span></div>
                <div style={{ ...t.sub, fontSize: 12, marginTop: 4, lineHeight: 1.7 }}>
                  {r.onboarding_state === "onboarding" ? "導入中・" : ""}{routeLabelOf(r.agency_code)}・最後 {fmtJst(r.last_used_at)}
                </div>
                <div style={{ marginTop: 6 }}><OpsProgressPills row={r} /></div>
              </Link>
            ))}
          </div>
          <style>{`@media (max-width: 760px) { .nox-ops-table { display: none; } .nox-ops-cards { display: grid !important; } }`}</style>
        </>
      )}
    </section>
  );
}
