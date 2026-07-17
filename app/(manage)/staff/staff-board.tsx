"use client";

// スタッフ管理ボード（F3a 束3 UI）。一覧＝memberships＋users 直接 SELECT（RLS: owner=org 全店/manager=自店）。
// 操作は全て RPC 経由＝トグル set_staff_perms（束3-1）・編集 staff_update_profile/transfer_store/change_role・
// 在籍解除/再雇用 staff_deactivate/reactivate（Q-1）・追加 POST /api/staff/create（Q-2）。
// UI の出し分け（owner/manager・自店・自分の行）は利便のための表示制御＝真の防御は RPC ゲート（二重に守る）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";

type Mem = {
  id: string; user_id: string; store_id: string; role: string; is_active: boolean;
  can_register: boolean; can_crm: boolean; can_shift: boolean; can_view_backs: boolean;
};
type UserRow = { id: string; name: string | null; email: string; auth_user_id: string };
type Store = { id: string; name: string };

type CreateResult = { membership_id: string; login_email: string; initial_password: string | null };

const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnGold: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnGhost: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };
const rolePillMini = (role: string): React.CSSProperties => ({
  fontSize: 10, fontWeight: 800, letterSpacing: 0.5, borderRadius: 999, padding: "2px 8px",
  color: role === "manager" ? "#0B0B0F" : "var(--ink)",
  background: role === "manager" ? "linear-gradient(135deg,var(--gold2),#B8893A)" : "var(--card2)",
  border: role === "manager" ? "0" : "1px solid var(--line2)",
});

export default function StaffBoard({
  isOwner, stores, myStoreId, myAuthUserId,
}: {
  isOwner: boolean; stores: Store[]; myStoreId: string; myAuthUserId: string;
}) {
  const supabase = createClient();
  const [mems, setMems] = useState<Mem[]>([]);
  const [users, setUsers] = useState<Record<string, UserRow>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 編集対象（行クリックで選択）
  const [sel, setSel] = useState<Mem | null>(null);
  const [eName, setEName] = useState("");
  const [eStore, setEStore] = useState("");

  // 追加モーダル
  const [addOpen, setAddOpen] = useState(false);
  const [aName, setAName] = useState("");
  const [aEmail, setAEmail] = useState("");
  const [aStore, setAStore] = useState(myStoreId || stores[0]?.id || "");
  const [aRole, setARole] = useState<"staff" | "manager">("staff");
  const [aIdemKey, setAIdemKey] = useState("");
  const [aErr, setAErr] = useState<string | null>(null);
  const [aResult, setAResult] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "—";

  const load = useCallback(async () => {
    // 一覧＝staff/manager のみ（cast は女の子管理で別画面）。inactive（在籍解除済み）も表示＝再雇用の入口。
    const { data: mm } = await supabase
      .from("memberships")
      .select("id, user_id, store_id, role, is_active, can_register, can_crm, can_shift, can_view_backs")
      .in("role", ["staff", "manager"]);
    const rows = (mm ?? []) as Mem[];
    const userIds = [...new Set(rows.map((m) => m.user_id))];
    const map: Record<string, UserRow> = {};
    if (userIds.length) {
      const { data: us } = await supabase.from("users").select("id, name, email, auth_user_id").in("id", userIds);
      for (const u of (us ?? []) as UserRow[]) map[u.id] = u;
    }
    // 並び: 店 → manager 先頭 → 名前
    rows.sort((a, b) =>
      storeName(a.store_id).localeCompare(storeName(b.store_id))
      || (a.role === b.role ? 0 : a.role === "manager" ? -1 : 1)
      || (map[a.user_id]?.name ?? "").localeCompare(map[b.user_id]?.name ?? ""));
    setMems(rows);
    setUsers(map);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  const isSelf = (m: Mem) => users[m.user_id]?.auth_user_id === myAuthUserId;

  async function rpc(label: string, fn: string, args: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc(fn, args);
    setMsg(error ? `${label}に失敗: ${error.message}` : `${label}しました`);
    setBusy(false);
    await load();
    return !error;
  }

  // トグル＝規約7: 4フラグとも明示 boolean を常に全送信（部分更新しない）
  async function toggleFlag(m: Mem, key: "can_register" | "can_crm" | "can_shift" | "can_view_backs") {
    const next = {
      can_register: m.can_register, can_crm: m.can_crm, can_shift: m.can_shift, can_view_backs: m.can_view_backs,
      [key]: !m[key],
    };
    await rpc("権限を更新", "set_staff_perms", {
      p_membership_id: m.id,
      p_can_register: next.can_register, p_can_crm: next.can_crm, p_can_shift: next.can_shift,
      p_can_view_backs: next.can_view_backs,
    });
  }

  function openEdit(m: Mem) {
    setSel(m);
    setEName(users[m.user_id]?.name ?? "");
    setEStore(stores.find((s) => s.id !== m.store_id)?.id ?? "");
  }

  function openAdd() {
    setAName(""); setAEmail(""); setAStore(isOwner ? (stores[0]?.id ?? "") : myStoreId);
    setARole("staff"); setAErr(null); setAResult(null); setCopied(false);
    setAIdemKey(crypto.randomUUID()); // 送信意図ごとに1つ＝リトライは同キー（route が二重作成を止める）
    setAddOpen(true);
  }

  async function submitAdd() {
    if (!aName.trim()) { setAErr("名前を入力してください"); return; }
    setBusy(true); setAErr(null);
    try {
      const res = await fetch("/api/staff/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: aName.trim(),
          email: aEmail.trim() || undefined, // 空なら送らない＝合成 email を route が自動発行
          storeId: isOwner ? aStore : myStoreId, // manager は自店固定（RPC でも二重に守る）
          role: isOwner ? aRole : "staff",       // manager は staff 固定
          idemKey: aIdemKey,
        }),
      });
      const body = (await res.json()) as CreateResult & { error?: string };
      if (!res.ok) setAErr(body.error ?? `追加に失敗しました（${res.status}）`);
      else { setAResult(body); await load(); }
    } catch (e) {
      setAErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    if (!aResult?.initial_password) return;
    await navigator.clipboard.writeText(`${aResult.login_email}\n${aResult.initial_password}`);
    setCopied(true);
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h1 style={t.pheadH1}>スタッフ管理</h1>
        <button style={{ ...btnGold, marginLeft: "auto" }} onClick={openAdd} disabled={busy}>＋ スタッフを追加</button>
      </div>
      <p style={t.pheadP}>黒服・店長の権限と在籍を管理します（キャストはマスタ側で管理）。</p>
      {msg && <p style={{ fontSize: 13, color: "var(--sub)" }}>{msg}</p>}

      <section className="nox-cardtop" style={{ ...t.card, marginTop: 13 }}>
        <h2 style={secTitle}>スタッフ一覧（行クリックで編集）</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
                {["名前", "ログインID", ...(isOwner ? ["店"] : []), "役職", "会計", "顧客", "シフト*", "バック†", "状態"].map((h) => (
                  <th key={h} style={{ padding: 6, color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mems.map((m) => {
                const u = users[m.user_id];
                const dim = !m.is_active;
                return (
                  <tr key={m.id} onClick={() => openEdit(m)}
                    style={{ borderBottom: "1px solid var(--line)", cursor: "pointer", opacity: dim ? 0.55 : 1, background: sel?.id === m.id ? "var(--card2)" : "transparent" }}>
                    <td style={{ padding: 6, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {u?.name ?? "—"}{isSelf(m) && <span style={{ ...t.sub, marginLeft: 5 }}>(自分)</span>}
                    </td>
                    <td style={{ padding: 6, color: "var(--sub)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u?.email ?? "—"}</td>
                    {isOwner && <td style={{ padding: 6, whiteSpace: "nowrap" }}>{storeName(m.store_id)}</td>}
                    <td style={{ padding: 6 }}><span style={rolePillMini(m.role)}>{t.roleLabelJa(m.role)}</span></td>
                    {(["can_register", "can_crm", "can_shift", "can_view_backs"] as const).map((k) => (
                      <td key={k} style={{ padding: 6, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        {m.role === "staff" ? (
                          <input type="checkbox" checked={m[k]} disabled={busy || !m.is_active}
                            onChange={() => void toggleFlag(m, k)} style={{ accentColor: "#C9A24A", cursor: "pointer" }} />
                        ) : (
                          <span style={t.sub} title="オーナー/店長は役職で権限固定（フラグ対象外）">固定</span>
                        )}
                      </td>
                    ))}
                    <td style={{ padding: 6, color: m.is_active ? "var(--ok)" : "var(--bad)", whiteSpace: "nowrap" }}>
                      {m.is_active ? "在籍" : "解除"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ ...t.sub, margin: "8px 0 0" }}>* シフト権限のシフト管理画面への適用は将来リリース（トグルは保存されます）。</p>
        <p style={{ ...t.sub, margin: "3px 0 0" }}>† バック＝キャストのバック金額（報酬）の閲覧権限。会計権限とは独立です（既定オフ・必要な黒服のみ付与）。</p>
      </section>

      {/* 編集パネル（Q-1 編集5RPC） */}
      {sel && (
        <section className="nox-cardtop" style={t.card}>
          <h2 style={secTitle}>
            編集: {users[sel.user_id]?.name ?? "—"}
            <span style={{ ...t.sub, marginLeft: 8 }}>{storeName(sel.store_id)} / {t.roleLabelJa(sel.role)} / {sel.is_active ? "在籍" : "解除"}</span>
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input placeholder="名前" value={eName} onChange={(e) => setEName(e.target.value)} style={{ ...input, width: 170 }} />
            <button style={btnGold} disabled={busy} onClick={async () => {
              await rpc("名前を更新", "staff_update_profile", { p_membership_id: sel.id, p_name: eName.trim() });
              setSel(null);
            }}>名前を更新</button>
          </div>
          {isOwner && stores.length > 1 && sel.is_active && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
              <span style={t.fieldLabel}>異動先</span>
              <select value={eStore} onChange={(e) => setEStore(e.target.value)} style={input}>
                {stores.filter((s) => s.id !== sel.store_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button style={btnGhost} disabled={busy || !eStore} onClick={async () => {
                if (!confirm(`${users[sel.user_id]?.name ?? ""} を ${storeName(eStore)} へ異動しますか？（出戻りは元の権限設定で復帰します）`)) return;
                await rpc("異動", "staff_transfer_store", { p_membership_id: sel.id, p_new_store_id: eStore });
                setSel(null);
              }}>異動を実行</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
            {isOwner && sel.is_active && !isSelf(sel) && (
              <button style={btnGhost} disabled={busy} onClick={async () => {
                const to = sel.role === "staff" ? "manager" : "staff";
                if (!confirm(`${users[sel.user_id]?.name ?? ""} を ${t.roleLabelJa(to)} に${to === "manager" ? "昇格" : "降格"}しますか？`)) return;
                await rpc("役職を変更", "staff_change_role", { p_membership_id: sel.id, p_new_role: to });
                setSel(null);
              }}>{sel.role === "staff" ? "店長に昇格" : "黒服に降格"}</button>
            )}
            {sel.is_active && !isSelf(sel) && (
              <button style={{ ...btnGhost, color: "var(--bad)", borderColor: "#5A2E2E" }} disabled={busy} onClick={async () => {
                if (!confirm(`${users[sel.user_id]?.name ?? ""} の在籍を解除しますか？（ログイン権限が即時に失効します・削除はされません）`)) return;
                await rpc("在籍を解除", "staff_deactivate", { p_membership_id: sel.id });
                setSel(null);
              }}>在籍を解除</button>
            )}
            {!sel.is_active && (
              <button style={btnGold} disabled={busy} onClick={async () => {
                await rpc("再雇用", "staff_reactivate", { p_membership_id: sel.id });
                setSel(null);
              }}>再雇用（復帰）</button>
            )}
            <button style={{ ...btnGhost, marginLeft: "auto" }} onClick={() => setSel(null)}>閉じる</button>
          </div>
        </section>
      )}

      {/* 追加モーダル（Q-2・POST /api/staff/create） */}
      {addOpen && (
        <Modal onClose={() => !busy && !aResult && setAddOpen(false)}>
            {!aResult ? (
              <>
                <h2 style={secTitle}>スタッフを追加</h2>
                <div style={{ display: "grid", gap: 10 }}>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={t.fieldLabel}>名前（必須）</span>
                    <input value={aName} onChange={(e) => setAName(e.target.value)} style={t.input} placeholder="例: 山田 太郎" />
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={t.fieldLabel}>メールアドレス（任意）</span>
                    <input value={aEmail} onChange={(e) => setAEmail(e.target.value)} style={t.input}
                      placeholder="未入力なら自動でログインIDを発行" type="email" />
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={t.fieldLabel}>配属店</span>
                    {isOwner ? (
                      <select value={aStore} onChange={(e) => setAStore(e.target.value)} style={t.input}>
                        {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    ) : (
                      <span style={{ ...t.input, display: "block", color: "var(--sub)" }}>{storeName(myStoreId)}（自店）</span>
                    )}
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={t.fieldLabel}>役職</span>
                    {isOwner ? (
                      <select value={aRole} onChange={(e) => setARole(e.target.value as "staff" | "manager")} style={t.input}>
                        <option value="staff">黒服（staff）</option>
                        <option value="manager">店長（manager）</option>
                      </select>
                    ) : (
                      <span style={{ ...t.input, display: "block", color: "var(--sub)" }}>黒服（staff）</span>
                    )}
                  </label>
                  {aErr && <p style={{ ...t.bad, fontSize: 12.5, margin: 0 }}>{aErr}</p>}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button style={btnGhost} disabled={busy} onClick={() => setAddOpen(false)}>キャンセル</button>
                    <button style={btnGold} disabled={busy} onClick={() => void submitAdd()}>{busy ? "追加中…" : "追加する"}</button>
                  </div>
                </div>
              </>
            ) : aResult.initial_password ? (
              <>
                <h2 style={secTitle}>スタッフを追加しました</h2>
                <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                  <div style={t.bdRow}><span style={t.bdKey}>ログインID</span><span style={{ ...t.bdVal, wordBreak: "break-all" }}>{aResult.login_email}</span></div>
                  <div style={t.bdRow}><span style={t.bdKey}>初期パスワード</span><span style={{ ...t.bdVal, color: "var(--champ)", letterSpacing: 1 }}>{aResult.initial_password}</span></div>
                </div>
                <p style={{ ...t.alert, marginBottom: 10 }}>このパスワードは再表示できません。スタッフに安全に渡してください。</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button style={btnGhost} onClick={() => void copyPassword()}>{copied ? "コピーしました ✓" : "ID とパスワードをコピー"}</button>
                  <button style={btnGold} onClick={() => setAddOpen(false)}>閉じる</button>
                </div>
              </>
            ) : (
              <>
                <h2 style={secTitle}>既存スタッフを再配属しました</h2>
                <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>
                  {aResult.login_email} は登録済みのため、既存のログイン情報のまま配属を追加しました（パスワードの再発行はありません）。
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button style={btnGold} onClick={() => setAddOpen(false)}>閉じる</button>
                </div>
              </>
            )}
        </Modal>
      )}
    </div>
  );
}
