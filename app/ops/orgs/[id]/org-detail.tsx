"use client";
import AddStorePanel from "./add-store-panel"; // ★0203（■2-a）
// ★運営コンソール 版 1（夜便 2026-11-20 N5）: テナントの詳細の節（画面の案 §5）。ボタンは中央・結果の文は押したボタンの近く・保存の後は画面を読み直す（router.refresh）。
//   版 1 に入れないもの：「リンクを出す」（判断 8）・「導入中に戻す」（cannot reopen）・版 2 の代行（初期設定・LINE・サポート許可・店舗の停止）。
import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { OpsProgressCard } from "../../ops-progress";
import { supportUrlShownOf } from "@/lib/nox/ops/assist"; // ★起票152
import { opsContractOf, opsContractRowsOf, opsLogLineOf, opsStoreSetupLineOf, OPS_CONTRACT_NOT_SHOWN, type OpsBilling, type OpsStoreSetup } from "@/lib/nox/ops/view"; // ★起票153・154
import { SUPPORT_GRANT_URL } from "@/lib/nox/support/grant-entry"; // ★起票152
import { SUPPORT_ASK_MESSAGE_MAX, supportAskMessageErrOf, supportAskSentLineOf, type SupportAskRow } from "@/lib/nox/support/support-ask"; // ★0207
import { mig0207On } from "@/lib/nox/rules-0175/flag"; // ★0207
import { fmtJst, inviteLabelOf, kindLabelOf, lineLabelOf, onboardingLabelOf, opsErrJa, routeLabelOf, ROUTE_FIELD_NOTE, setupLabelOf, type OpsOrgRow } from "@/lib/nox/ops/labels";

/** ★起票152（2026-11-24）: サポート許可が無いときに、オーナーへ送る URL（場所を指すだけ＝トークンや鍵は入れない）とコピーのボタン。コピーは端末の中だけ（通信なし） */
function SupportUrlBox() {
  const [copied, setCopied] = useState<"ok" | "ng" | null>(null);
  async function copy() {
    try { await navigator.clipboard.writeText(SUPPORT_GRANT_URL); setCopied("ok"); } catch { setCopied("ng"); }
  }
  return (
    <div data-ops-support-url="1" style={{ marginTop: 10 }}>
      <p style={{ ...t.sub, fontSize: 12.5, margin: "0 0 6px", lineHeight: 1.7 }}>この URL をオーナーへ送ってください。ログインの後に、サポート許可の画面がそのまま開きます。</p>
      <input readOnly value={SUPPORT_GRANT_URL} aria-label="オーナーへ送る URL" onFocus={(e) => e.currentTarget.select()}
        style={{ ...t.input, width: "100%", maxWidth: "100%", boxSizing: "border-box", fontSize: 12.5 }} />
      <div className="nox-actions" style={{ marginTop: 8 }}>
        <button type="button" style={t.btnGhost} onClick={() => void copy()} data-ops-support-copy="1">URL をコピー</button>
      </div>
      {copied && <div style={{ marginTop: 6 }}><Message kind={copied === "ok" ? "success" : "error"}>{copied === "ok" ? "コピーしました" : "コピーできませんでした（上の欄から選んでコピーしてください）"}</Message></div>}
    </div>
  );
}

/** ★0207（相談役 11/25 朝の便 M3）: オーナーにサポート許可を頼む（ひとこと 200 字まで）・頼み済みなら取り下げ。押しただけで許可にはしない（オーナーが日数を選んで出す） */
function SupportAskBox({ orgId, ask }: { orgId: string; ask: SupportAskRow | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null);
  async function send(action: "ask" | "withdraw") {
    if (action === "ask") { const v = supportAskMessageErrOf(msg); if (v) { setOut({ ok: false, text: v }); return; } }
    if (action === "withdraw" && !window.confirm("頼みを取り下げます。オーナーの要承認から消えます。よろしいですか")) return;
    setBusy(true); setOut(null);
    const r = await fetch(`/api/ops/orgs/${orgId}/support-ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action === "ask" ? { action, message: msg } : { action }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r.ok) { setOut({ ok: false, text: j.error ?? "うまくいきませんでした" }); return; }
    setOut({ ok: true, text: action === "ask" ? "オーナーの要承認に届けました（許可はオーナーが日数を選んで出します）" : "頼みを取り下げました" });
    if (action === "ask") setMsg("");
    router.refresh();
  }
  return (
    <div data-ops-support-ask={ask ? "sent" : "none"} style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
      {ask ? (
        <>
          <p style={{ margin: 0, fontSize: 13 }} data-ops-support-ask-sent="1">{supportAskSentLineOf(ask)}</p>
          <p style={{ ...t.sub, fontSize: 12, margin: "4px 0 0" }}>オーナーが許可を出すか「今は出さない」を押すと消えます。</p>
          <div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={t.btnGhost} disabled={busy} onClick={() => void send("withdraw")} data-ops-support-withdraw="1">{busy ? "送信中…" : "頼みを取り下げる"}</button></div>
        </>
      ) : (
        <>
          <p style={{ ...t.sub, fontSize: 12.5, margin: "0 0 6px", lineHeight: 1.7 }}>オーナーの要承認（🔔）に「サポート許可を頼む」を 1 行届けます。押しただけでは許可になりません。</p>
          <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>ひとこと（任意・{SUPPORT_ASK_MESSAGE_MAX} 字まで）</span>
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} maxLength={SUPPORT_ASK_MESSAGE_MAX} style={{ ...t.input, width: "100%", boxSizing: "border-box", resize: "vertical" }} aria-label="ひとこと" data-ops-support-ask-msg="1" placeholder="例：LINE 連携の設定を代わりに入れます" />
          </label>
          <div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={t.btnGold} disabled={busy} onClick={() => void send("ask")} data-ops-support-ask-send="1">{busy ? "送信中…" : "サポート許可を頼む"}</button></div>
        </>
      )}
      {out && <div style={{ marginTop: 6 }}><Message kind={out.ok ? "success" : "error"}>{out.text}</Message></div>}
    </div>
  );
}

export type OpsLogRow ={ id: string; at: string; who: string; action: string; before: unknown; after: unknown; reason: string | null };
const ACTION_LABEL: Record<string, string> = { "ops.org.create": "作成", "ops.agency_code": "経路", "ops.onboarding": "導入", "ops.org.reinvite": "招待の出し直し" };
const brief = (v: unknown): string => (v == null ? "—" : typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${x ?? "—"}`).join("・") : String(v));

export default function OrgDetail({ row, logs, nowIso, assist, stores, storeSetups, billing, supportAsk }: { /** ★0207 */ supportAsk?: SupportAskRow | null; /** ★起票153 */ storeSetups?: OpsStoreSetup[] | null; /** ★起票154 */ billing?: OpsBilling | null; row: OpsOrgRow; logs: OpsLogRow[]; nowIso: string; /** ★0203（■2-a）: 店を追加（旗の後ろ・null＝出さない） */ stores?: { id: string; name: string; setupDone: boolean; /** ★M2-3: 店の業態 */ biz?: string | null }[] | null; /** ★枝 night1121-ops-v2（0202b 版 4・旗の後ろ）: 導入を代行する（書けるかと理由） */ assist?: { ok: boolean; reason: string | null } | null }) {
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
  const [openAdd, setOpenAdd] = useState(false); // ★起票153: 「店を追加」と「経路」はボタンで開く
  const [openRoute, setOpenRoute] = useState(false);
  const contract = opsContractOf(row, billing ?? null, new Date(nowIso));
  return (
    <div data-ops-detail={row.org_id} style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 18, margin: "0 0 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{row.org_name}<span className="nox-stpill">{kindLabelOf(row)}</span></h1>
      {/* ★起票153（2026-11-24）: 順番＝導入の状況 → 契約 → オーナー → 代行 → 記録。導入の状況には店名（どの店の話か）と「導入完了にする」 */}
      <OpsProgressCard row={row} now={new Date(nowIso)} storeLines={(storeSetups ?? []).map(opsStoreSetupLineOf)}>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)" }} aria-label="導入" data-ops-onboarding="1">
          <p style={{ margin: 0, fontSize: 13 }}>導入：{onboardingLabelOf(row.onboarding_state)}{row.onboarding_done_at ? `（${fmtJst(row.onboarding_done_at)}）` : ""}</p>
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
        </div>
      </OpsProgressCard>

      {/* ★起票154（2026-11-24）: 契約＝DB にある値だけ（デモ・検証用・テスターは対象外） */}
      <section style={sec} aria-label="契約" data-ops-contract-card={contract.tone}>
        <h2 style={h2}>契約</h2>
        <p style={{ margin: "0 0 8px" }}><span className={contract.tone === "ok" ? "nox-stpill ok" : contract.tone === "warn" ? "nox-stpill warn" : contract.tone === "bad" ? "nox-stpill bad" : "nox-stpill"} style={{ fontSize: 13 }}>{contract.label}</span></p>
        {!contract.outOfScope && (
          <>
            <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 12px", margin: 0, fontSize: 13 }}>
              {opsContractRowsOf(row, billing ?? null).map(([k, v]) => <Fragment key={k}><dt style={t.sub}>{k}</dt><dd style={{ margin: 0 }}>{v}</dd></Fragment>)}
            </dl>
            <p style={{ ...t.sub, fontSize: 11.5, margin: "8px 0 0" }}>{OPS_CONTRACT_NOT_SHOWN}</p>
          </>
        )}
      </section>

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

      {assist && (/* ★枝 night1121-ops-v2: 導入を代行する（書けないときは理由を 1 行） */
        <section style={sec} aria-label="導入を代行する" data-ops-assist-entry={assist.ok ? "1" : "0"}>
          <h2 style={h2}>導入を代行する</h2>
          <p style={{ ...t.sub, fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.7 }}>初期設定の下書き・LINE 連携・キャストの仮の登録を、1 歩ずつ代わりに入れます（確定はオーナー）。</p>
          {assist.ok ? <div className="nox-actions"><Link href={`/ops/orgs/${row.org_id}/assist`} style={{ ...t.btnGold, textDecoration: "none" }}>導入を代行する</Link></div> : <Message kind="error">{assist.reason}</Message>}{/* ★相談役 11/26 の便 M2-2: 先へ進めない理由は赤 */}
          {supportUrlShownOf(assist) && <SupportUrlBox />}
          {supportUrlShownOf(assist) && mig0207On() && <SupportAskBox orgId={row.org_id} ask={supportAsk ?? null} />}{/* ★0207: サポート許可を頼む・取り下げ */}
        </section>)}

      {/* ★起票153: 店を追加・経路＝ボタンで開く（畳む） */}
      <div className="nox-actions" style={{ margin: "0 0 12px" }} data-ops-more="1">
        {stores && <button type="button" style={openAdd ? t.btnGold : t.btnGhost} aria-expanded={openAdd} onClick={() => setOpenAdd((v) => !v)} data-ops-open-add="1">店を追加</button>}
        <button type="button" style={openRoute ? t.btnGold : t.btnGhost} aria-expanded={openRoute} onClick={() => setOpenRoute((v) => !v)} data-ops-open-route="1">経路（{routeLabelOf(row.agency_code)}）</button>
      </div>
      {stores && openAdd && <div style={{ marginBottom: 12 }}><AddStorePanel orgId={row.org_id} stores={stores} /></div>}{/* ★0203（■2-a）: 店を追加 */}
      {openRoute && (
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
              {agencyLogs.map((l) => <li key={l.id} style={{ ...t.sub, fontSize: 12 }}>{opsLogLineOf(l)}</li>)}
            </ul>
          )}
        </section>
      )}

      {/* ★起票153: 運営の記録＝日本語の 1 行（内部の名前と値は押すと開く） */}
      <section style={sec} aria-label="運営の記録">
        <h2 style={h2}>運営の記録</h2>
        {logs.length === 0 ? <p style={{ ...t.sub, fontSize: 12, margin: 0 }}>まだありません</p> : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6, fontSize: 13 }}>
            {logs.map((l) => (
              <li key={l.id} data-ops-log={l.action}>
                <details>
                  <summary style={{ cursor: "pointer", lineHeight: 1.6 }}>{opsLogLineOf(l)}</summary>
                  <p style={{ ...t.sub, fontSize: 11.5, margin: "4px 0 0 14px", overflowWrap: "anywhere" }}>{l.action}・{brief(l.before)} → {brief(l.after)}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
