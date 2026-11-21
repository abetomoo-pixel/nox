"use client";
// ★運営コンソール 版 1（夜便 2026-11-20 N5）: テナントの詳細の節（画面の案 §5）。ボタンは中央・結果の文は押したボタンの近く・保存の後は画面を読み直す（router.refresh）。
//   版 1 に入れないもの：「リンクを出す」（判断 8）・「導入中に戻す」（cannot reopen）・版 2 の代行（初期設定・LINE・サポート許可・店舗の停止）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { fmtJst, inviteLabelOf, kindLabelOf, lineLabelOf, onboardingLabelOf, opsErrJa, routeLabelOf, ROUTE_FIELD_NOTE, setupLabelOf, type OpsOrgRow } from "@/lib/nox/ops/labels";

export type OpsLogRow = { id: string; at: string; who: string; action: string; before: unknown; after: unknown; reason: string | null };
const ACTION_LABEL: Record<string, string> = { "ops.org.create": "作成", "ops.agency_code": "経路", "ops.onboarding": "導入", "ops.org.reinvite": "招待の出し直し" };
const brief = (v: unknown): string => (v == null ? "—" : typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${x ?? "—"}`).join("・") : String(v));

export default function OrgDetail({ row, logs }: { row: OpsOrgRow; logs: OpsLogRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<{ at: string; ok: boolean; text: string } | null>(null);
  const [code, setCode] = useState(row.agency_code ?? "");
  async function post(at: string, url: string, body: unknown, okText: string) {
    setBusy(at); setOut(null);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!r.ok) { setOut({ at, ok: false, text: j.error ?? opsErrJa(null) }); return; }
    setOut({ at, ok: true, text: okText });
    router.refresh();
  }
  const msgAt = (at: string) => out && out.at === at && <div data-ops-msg={at}><Message kind={out.ok ? "success" : "error"}>{out.text}</Message></div>;
  const sec: React.CSSProperties = { ...t.card, marginBottom: 12 };
  const h2: React.CSSProperties = { ...t.cardTitle, margin: "0 0 8px" };
  const agencyLogs = logs.filter((l) => l.action === "ops.agency_code").slice(0, 5);
  return (
    <div data-ops-detail={row.org_id} style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 18, margin: "0 0 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{row.org_name}<span className="nox-stpill">{kindLabelOf(row)}</span></h1>

      <section style={sec} aria-label="オーナー">
        <h2 style={h2}>オーナー</h2>
        <p style={{ margin: 0, fontSize: 13 }}>{row.owner_email ?? "—"}・{inviteLabelOf(row)}</p>
        {row.owner_email && !row.owner_accepted ? (
          <>
            <div className="nox-actions" style={{ marginTop: 10 }}>
              <button type="button" style={t.btnGold} disabled={!!busy} data-ops-reinvite="1"
                onClick={() => { if (window.confirm(`${row.owner_email} にもう一度招待を送ります。よろしいですか`)) void post("invite", `/api/ops/orgs/${row.org_id}/invite`, {}, `${row.owner_email} に招待を送りました`); }}>
                {busy === "invite" ? "送信中…" : "招待をもう一度送る"}
              </button>
            </div>
            {msgAt("invite")}
          </>
        ) : row.owner_accepted ? <p style={{ ...t.sub, fontSize: 12, margin: "6px 0 0" }}>パスワードを忘れたときは、本人がログインの画面の「パスワードを忘れた」から</p> : null}
      </section>

      <section style={sec} aria-label="経路">
        <h2 style={h2}>経路</h2>
        <p style={{ margin: "0 0 8px", fontSize: 13 }}>今：{routeLabelOf(row.agency_code)}</p>
        <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>紹介コード</span><input value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} style={t.input} aria-label="紹介コード" /></label>
        <p data-ops-route-note="1" style={{ ...t.sub, fontSize: 11.5, margin: "4px 0 0" }}>{ROUTE_FIELD_NOTE}</p>
        <div className="nox-actions" style={{ marginTop: 10 }}>
          <button type="button" style={t.btnGold} disabled={!!busy || code === (row.agency_code ?? "")} onClick={() => void post("agency", `/api/ops/orgs/${row.org_id}/agency`, { code }, "経路を保存しました")}>{busy === "agency" ? "保存中…" : "保存"}</button>
          <button type="button" style={t.btnGhost} disabled={!!busy || !row.agency_code}
            onClick={() => { if (window.confirm("経路を外して直販にします。よろしいですか")) void post("agency", `/api/ops/orgs/${row.org_id}/agency`, { code: null }, "経路を外しました（直販）"); }}>外す（直販にする）</button>
        </div>
        {msgAt("agency")}
        {agencyLogs.length > 0 && (
          <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", fontSize: 12 }}>
            {agencyLogs.map((l) => <li key={l.id} style={{ ...t.sub, fontSize: 12 }}>{fmtJst(l.at)}・{l.who}・{brief(l.before)} → {brief(l.after)}</li>)}
          </ul>
        )}
      </section>

      <section style={sec} aria-label="導入">
        <h2 style={h2}>導入</h2>
        <p style={{ margin: 0, fontSize: 13 }}>{onboardingLabelOf(row.onboarding_state)}{row.onboarding_done_at ? `（${fmtJst(row.onboarding_done_at)}）` : ""}</p>
        {row.onboarding_state === "onboarding" && (
          <>
            <div className="nox-actions" style={{ marginTop: 10 }}>
              <button type="button" style={t.btnGold} disabled={!!busy} data-ops-done="1"
                onClick={() => { if (window.confirm("導入完了にします。完了の後は導入中に戻せません。よろしいですか")) void post("onboarding", `/api/ops/orgs/${row.org_id}/onboarding`, {}, "導入完了にしました"); }}>
                {busy === "onboarding" ? "保存中…" : "導入完了にする"}
              </button>
            </div>
            {msgAt("onboarding")}
          </>
        )}
      </section>

      <section style={sec} aria-label="導入の状況">
        <h2 style={h2}>導入の状況</h2>
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 12px", margin: 0, fontSize: 13 }}>
          <dt style={t.sub}>店の数</dt><dd style={{ margin: 0 }}>{row.store_count}</dd>
          <dt style={t.sub}>初期設定</dt><dd style={{ margin: 0 }}>{setupLabelOf(row)}</dd>
          <dt style={t.sub}>LINE</dt><dd style={{ margin: 0 }}>{lineLabelOf(row)}</dd>
          <dt style={t.sub}>キャスト・スタッフ</dt><dd style={{ margin: 0 }}>{row.cast_count} 人・{row.staff_count} 人</dd>
          <dt style={t.sub}>最後に使われた時刻</dt><dd style={{ margin: 0 }}>{fmtJst(row.last_used_at)}</dd>
          <dt style={t.sub}>お試しの期限</dt><dd style={{ margin: 0 }}>{row.kind === "tester" ? "期限なし" : row.kind === "trial" ? fmtJst(row.trial_ends_at, false) : "—"}</dd>
        </dl>
      </section>

      <section style={sec} aria-label="運営の記録">
        <h2 style={h2}>運営の記録</h2>
        {logs.length === 0 ? <p style={{ ...t.sub, fontSize: 12, margin: 0 }}>まだありません</p> : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4, fontSize: 12 }}>
            {logs.map((l) => <li key={l.id}>{fmtJst(l.at)}・{l.who}・{ACTION_LABEL[l.action] ?? l.action}・{brief(l.before)} → {brief(l.after)}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
