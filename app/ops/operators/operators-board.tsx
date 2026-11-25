"use client";
// ★【D8】起票155 の 2（2026-11-25・旗 MIG_0209_APPLIED の後ろ）: 運営者の管理の画面（管理者だけ）。
//   上＝運営者を足す（メール・名前・役〈管理者／担当・既定なし〉）・中＝一覧（名前・メール・役・状態・足した日・最後のログイン・行のボタン）・下＝運営者の記録。
//   行のボタンは operatorActionsOf（自分の行は 0 個・最後の管理者は止める／担当にするを出さない）。止める理由は任意・リセットの理由は必ず（行の下に欄を開く）。ボタンは中央（nox-actions）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { fmtJst } from "@/lib/nox/ops/labels";
import {
  activeAdminsOf, mfaResetConfirmOf, newOperatorConfirmOf, newOperatorFormErrOf, OPS_OPERATOR_ACTION_LABEL, OPS_OPERATOR_STATE_LABEL, OPS_REASON_MAX, OPS_ROLES,
  operatorActionsOf, operatorLogLineOf, operatorStateOf, opsOperatorErrJa, opsReasonErrOf, opsRoleLabelOf, stopConfirmOf,
  type NewOperatorForm, type OpsOperatorAction, type OpsOperatorLog, type OpsOperatorRow,
} from "@/lib/nox/ops/operators";

const BLANK: NewOperatorForm = { email: "", name: "", role: "" };
const stateTone = (s: string) => (s === "active" ? "nox-stpill ok" : s === "stopped" ? "nox-stpill bad" : "nox-stpill warn");

export default function OperatorsBoard({ rows, logs }: { rows: OpsOperatorRow[]; logs: OpsOperatorLog[] }) {
  const router = useRouter();
  const [f, setF] = useState<NewOperatorForm>(BLANK);
  const [openAdd, setOpenAdd] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<{ at: string; ok: boolean; text: string } | null>(null);
  const [pane, setPane] = useState<{ id: string; kind: "stop" | "mfa_reset" } | null>(null);
  const [reason, setReason] = useState("");
  const admins = activeAdminsOf(rows);
  const set = (p: Partial<NewOperatorForm>) => setF((x) => ({ ...x, ...p }));

  async function post(at: string, url: string, body: unknown, okText: string): Promise<boolean> {
    setBusy(at); setOut(null);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!r.ok) { setOut({ at, ok: false, text: j.error ? opsOperatorErrJa(j.error) : opsOperatorErrJa(null) }); return false; }
    setOut({ at, ok: true, text: okText });
    router.refresh();
    return true;
  }
  async function add() {
    const e = newOperatorFormErrOf(f);
    if (e) { setOut({ at: "add", ok: false, text: e }); return; }
    if (!window.confirm(newOperatorConfirmOf(f))) return;
    if (await post("add", "/api/ops/operators", f, `${f.email.trim()} に招待を送りました（本人がパスワードを決めて、認証アプリを登録します）`)) { setF(BLANK); setOpenAdd(false); }
  }
  async function act(r: OpsOperatorRow, a: OpsOperatorAction) {
    const base = `/api/ops/operators/${r.auth_user_id}`;
    if (a === "stop" || a === "mfa_reset") { setPane({ id: r.auth_user_id, kind: a }); setReason(""); setOut(null); return; }
    if (a === "reinvite") { if (window.confirm(`${r.name}（${r.email}）に招待をもう一度送ります。よろしいですか`)) await post(r.auth_user_id, `${base}/invite`, {}, "招待をもう一度送りました"); return; }
    if (a === "resume") { if (window.confirm(`${r.name} を戻します。よろしいですか`)) await post(r.auth_user_id, `${base}/active`, { active: true }, "戻しました"); return; }
    const role = a === "to_admin" ? "ops_admin" : "ops_support";
    if (window.confirm(`${r.name} を${opsRoleLabelOf(role)}にします。よろしいですか`)) await post(r.auth_user_id, `${base}/role`, { role }, `${opsRoleLabelOf(role)}にしました`);
  }
  async function confirmPane(r: OpsOperatorRow) {
    if (!pane) return;
    const need = pane.kind === "mfa_reset";
    const e = opsReasonErrOf(reason, need);
    if (e) { setOut({ at: r.auth_user_id, ok: false, text: e }); return; }
    if (!window.confirm(need ? mfaResetConfirmOf(r.name) : stopConfirmOf(r.name))) return;
    const ok = need
      ? await post(r.auth_user_id, `/api/ops/operators/${r.auth_user_id}/mfa-reset`, { reason }, "認証アプリの登録を消しました（次のログインで登録し直します）")
      : await post(r.auth_user_id, `/api/ops/operators/${r.auth_user_id}/active`, { active: false, reason }, "止めました");
    if (ok) setPane(null);
  }
  const msgAt = (at: string) => out && out.at === at && <div data-ops-operators-msg={at}><Message kind={out.ok ? "success" : "error"} style={{ margin: "8px 0 0" }}>{out.text}</Message></div>;
  const lbl = (s: string) => <span style={t.fieldLabel}>{s}<span style={{ color: "var(--bad)" }}>（必須）</span></span>;
  const sec: React.CSSProperties = { ...t.card, marginBottom: 12 };

  return (
    <div data-ops-operators={String(rows.length)} style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 18, margin: "0 0 12px" }}>運営者</h1>
      <section style={sec} aria-label="運営者を足す">
        {!openAdd ? (
          <div className="nox-actions"><button type="button" style={t.btnGold} onClick={() => setOpenAdd(true)} data-ops-operator-open-add="1">＋ 運営者を足す</button></div>
        ) : (
          <>
            <h2 style={{ ...t.cardTitle, margin: "0 0 10px" }}>運営者を足す</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 4 }}>{lbl("メール")}<input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} style={t.input} autoComplete="off" /></label>
              <label style={{ display: "grid", gap: 4 }}>{lbl("名前")}<input value={f.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} style={t.input} /></label>
              <div style={{ display: "grid", gap: 4 }}>{lbl("役")}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="radiogroup" aria-label="役">
                  {OPS_ROLES.map(([k, l]) => (
                    <button key={k} type="button" role="radio" aria-checked={f.role === k} data-ops-operator-role={k} onClick={() => set({ role: k })} style={{ ...(f.role === k ? t.btnGold : t.btnGhost), ...t.btnSm }}>{l}</button>
                  ))}
                </div>
                <span style={{ ...t.sub, fontSize: 11.5 }}>担当は、運営者の管理（この画面）だけ使えません。会社の追加・導入の代行・問い合わせの返事はできます</span>
              </div>
            </div>
            <div className="nox-actions" style={{ marginTop: 14 }}>
              <button type="button" style={t.btnGhost} onClick={() => { setOpenAdd(false); setF(BLANK); }}>やめる</button>
              <button type="button" style={t.btnGold} disabled={busy === "add"} onClick={() => void add()} data-ops-operator-add="1">{busy === "add" ? "送信中…" : "招待を送る"}</button>
            </div>
          </>
        )}
        {msgAt("add")}
      </section>

      <section style={sec} aria-label="運営者の一覧">
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((r) => {
            const st = operatorStateOf(r);
            const { actions, note } = operatorActionsOf(r, { activeAdmins: admins });
            return (
              <div key={r.auth_user_id} data-ops-operator-row={r.auth_user_id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 14 }}>{r.name}</strong>
                  {r.is_self && <span className="nox-stpill">あなた</span>}
                  <span className="nox-stpill" data-ops-operator-role-label={r.role}>{opsRoleLabelOf(r.role)}</span>
                  <span className={stateTone(st)} data-ops-operator-state={st}>{OPS_OPERATOR_STATE_LABEL[st]}</span>
                </div>
                <p style={{ ...t.sub, fontSize: 12, margin: "4px 0 0", wordBreak: "break-all" }}>{r.email}</p>
                <p style={{ ...t.sub, fontSize: 12, margin: "2px 0 0" }}>足した日 {fmtJst(r.created_at, false)}・最後のログイン {fmtJst(r.last_sign_in_at)}{r.stopped_at ? `・止めた日 ${fmtJst(r.stopped_at, false)}` : ""}{r.mfa_reset_at ? `・認証アプリのリセット ${fmtJst(r.mfa_reset_at)}` : ""}</p>
                {note && <p style={{ ...t.sub, fontSize: 12, margin: "6px 0 0" }} data-ops-operator-note="1">{note}</p>}
                {actions.length > 0 && (
                  <div className="nox-actions" style={{ marginTop: 8 }}>
                    {actions.map((a) => (
                      <button key={a} type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy === r.auth_user_id} onClick={() => void act(r, a)} data-ops-operator-action={a}>{OPS_OPERATOR_ACTION_LABEL[a]}</button>
                    ))}
                  </div>
                )}
                {pane && pane.id === r.auth_user_id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }} data-ops-operator-pane={pane.kind}>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={t.fieldLabel}>{pane.kind === "mfa_reset" ? "リセットの理由（必須・200 字まで）" : "止める理由（任意・200 字まで）"}</span>
                      <textarea value={reason} maxLength={OPS_REASON_MAX} rows={2} onChange={(e) => setReason(e.target.value)} style={{ ...t.input, resize: "vertical" }} />
                    </label>
                    {pane.kind === "mfa_reset" && <p style={{ ...t.sub, fontSize: 11.5, margin: "6px 0 0" }}>認証アプリの登録を消し、今ログインしている画面は使えなくなります。本人は次のログインで登録し直します</p>}
                    <div className="nox-actions" style={{ marginTop: 10 }}>
                      <button type="button" style={t.btnGhost} onClick={() => setPane(null)}>やめる</button>
                      <button type="button" style={t.btnGold} disabled={busy === r.auth_user_id} onClick={() => void confirmPane(r)} data-ops-operator-confirm={pane.kind}>{pane.kind === "mfa_reset" ? "リセットする" : "止める"}</button>
                    </div>
                  </div>
                )}
                {msgAt(r.auth_user_id)}
              </div>
            );
          })}
        </div>
      </section>

      <section style={sec} aria-label="運営者の記録">
        <h2 style={{ ...t.cardTitle, margin: "0 0 8px" }}>運営者の記録</h2>
        {logs.length === 0 ? <p style={{ ...t.sub, fontSize: 12.5, margin: 0 }}>まだありません</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {logs.map((l) => (
              <li key={l.id} style={{ fontSize: 12.5 }} data-ops-operator-log={l.action}>
                <span className="num" style={t.sub}>{fmtJst(l.at)}</span>　{l.who}：{operatorLogLineOf(l, l.target ?? "—")}{l.reason ? `（理由：${l.reason}）` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
