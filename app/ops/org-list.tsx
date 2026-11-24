"use client";
// ★運営コンソール 版 1（夜便 2026-11-20 N5）: テナント一覧（絞り：状態・経路・検索／1024 は表・375 はカード）。
// ★起票153・154（2026-11-24 夕・相談役の便【4】【5】）: 導入の状況は「次にすること」の 1 行と進み具合（n／5）・5 つの内訳は詳細で。
//   既定の絞り込みは「通常とテスター」（デモと検証用は「デモと検証用も出す」で）。行の高さと文字を一段大きく。契約の列（遅れと期限間近は目立たせる・デモ・検証用・テスターは対象外）。
import Link from "next/link";
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import { fmtJst, OPS_KIND_FILTERS, OPS_ROUTE_FILTERS, opsFilterOf, routeLabelOf, type OpsOrgRow } from "@/lib/nox/ops/labels";
import { opsContractOf, opsProgressSummaryOf, opsVisibleOf, OPS_HIDDEN_KINDS, type OpsBilling } from "@/lib/nox/ops/view";

const toneClass = (tone: string) => (tone === "ok" ? "nox-stpill ok" : tone === "warn" ? "nox-stpill warn" : tone === "bad" ? "nox-stpill bad" : "nox-stpill");

export default function OrgList({ rows, billing = {}, nowIso }: { rows: OpsOrgRow[]; /** ★起票154: 会社ごとの契約（org_billing・無い会社はキーなし） */ billing?: Record<string, Pick<OpsBilling, "cancel_at_period_end" | "current_period_end">>; nowIso?: string }) {
  const [kind, setKind] = useState("all");
  const [route, setRoute] = useState("all");
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const now = new Date(nowIso ?? 0);
  const list = opsFilterOf(opsVisibleOf(rows, showAll || OPS_HIDDEN_KINDS.includes(kind)), { kind, route, q });
  const hidden = rows.length - opsVisibleOf(rows, false).length;
  const sel: React.CSSProperties = { ...t.input, width: "auto", minWidth: 120 };
  const contractOf = (r: OpsOrgRow) => opsContractOf(r, billing[r.org_id] ?? null, now);
  return (
    <section data-ops-list={String(list.length)}>
      <div className="nox-actions" style={{ marginBottom: 12 }}>
        <Link href="/ops/orgs/new" style={{ ...t.btnGold, textDecoration: "none" }} data-ops-add="1">＋ テナントを追加</Link>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <select aria-label="状態" value={kind} onChange={(e) => setKind(e.target.value)} style={sel}>{OPS_KIND_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="経路" value={route} onChange={(e) => setRoute(e.target.value)} style={sel}>{OPS_ROUTE_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input aria-label="検索（会社名・オーナーのメール）" placeholder="会社名・オーナーのメール" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...t.input, flex: "1 1 200px", minWidth: 0 }} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap" }} data-ops-show-all="1">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} style={{ width: 16, height: 16 }} />デモと検証用も出す{!showAll && hidden > 0 ? `（${hidden}）` : ""}
        </label>
      </div>
      {list.length === 0 ? <p style={{ textAlign: "center", color: "var(--sub)" }}>{rows.length === 0 ? "まだテナントがありません" : "合うテナントがありません"}</p> : (
        <>
          <div className="nox-ops-table" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--sub)", fontSize: 12.5 }}>
                {["会社名", "契約", "導入の状況", "経路", "最後に使われた時刻"].map((h) => <th key={h} style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{h}</th>)}
              </tr></thead>
              <tbody>{list.map((r) => { const p = opsProgressSummaryOf(r); const c = contractOf(r); return (
                <tr key={r.org_id} data-ops-row={r.org_id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "12px 10px" }}><Link href={`/ops/orgs/${r.org_id}`} className="nox-link" style={{ fontWeight: 700, fontSize: 15 }}>{r.org_name}</Link>{r.onboarding_state === "onboarding" && <span className="nox-stpill" style={{ marginLeft: 6 }}>導入中</span>}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap" }} data-ops-contract={c.tone}><span className={toneClass(c.tone)}>{c.label}</span></td>
                  <td style={{ padding: "12px 10px", minWidth: 240 }} data-ops-progress-sum={`${p.done}/${p.total}`}>
                    <span className="num" style={{ fontWeight: 800, marginRight: 8 }}>{p.done}／{p.total}</span><span style={{ color: "var(--ink)" }}>{p.next}</span>
                  </td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap" }}>{routeLabelOf(r.agency_code)}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap" }} className="num">{fmtJst(r.last_used_at)}</td>
                </tr>); })}</tbody>
            </table>
          </div>
          <div className="nox-ops-cards" style={{ display: "none", gap: 10 }}>
            {list.map((r) => { const p = opsProgressSummaryOf(r); const c = contractOf(r); return (
              <Link key={r.org_id} href={`/ops/orgs/${r.org_id}`} style={{ ...t.card, display: "block", textDecoration: "none", color: "inherit", padding: 14 }} data-ops-card={r.org_id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}><b style={{ fontSize: 15 }}>{r.org_name}</b><span className={toneClass(c.tone)}>{c.label}</span></div>
                <div style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.6, color: "var(--ink)" }}><span className="num" style={{ fontWeight: 800, marginRight: 6 }}>{p.done}／{p.total}</span>{p.next}</div>
                <div style={{ ...t.sub, fontSize: 12.5, marginTop: 4 }}>{r.onboarding_state === "onboarding" ? "導入中・" : ""}{routeLabelOf(r.agency_code)}・最後 {fmtJst(r.last_used_at)}</div>
              </Link>); })}
          </div>
          <style>{`@media (max-width: 760px) { .nox-ops-table { display: none; } .nox-ops-cards { display: grid !important; } }`}</style>
        </>
      )}
    </section>
  );
}
