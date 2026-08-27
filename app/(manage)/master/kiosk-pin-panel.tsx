"use client";

// 操作担当 PIN（レジ端末・set_staff_pin＝mig0056・裁定11 確定③）。
//
// ★M-11a（2026-08-27）: モック nox-staff-system-settings の2カラム構成へ追随
//   （左=担当の表／右=PINポリシー。narrow は .nox-2col が1カラム）。
//   ★RPC・引数・エラー文言・対象条件は逐語で不変。インライン PIN 入力は撤去し
//     モックの「PINを設定」モーダルへ（送信値は同じ set_staff_pin 1本）。
//   ★出さないもの（A-2/A-3 実測・教訓25）:
//     - 「失敗回数」列: staff_pin.fail_count は列として在るが deny-all＝owner でも読めない
//     - 「設定済み」表示・PIN設定済み数: 同上（count RPC も無い）
//     - 「90日更新」「セキュリティ状態」: 器そのものが無い
//   ★モーダルの検証は 4桁・確認一致のみ。モックの「同じ数字の繰り返し不可」は
//     RPC（set_staff_pin）に規則が無い＝サーバが受ける PIN を UI が拒む逆転を作らないため入れない。
//
// staff_pin は deny-all＝設定状況は読めない・上書き設定のみ。
// 対象＝owner/manager/staff(can_register)＝RPC 側の bad target 条件と同一。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";

type Store = { id: string; name: string };
type OpMember = { id: string; store_id: string; role: string; user_name: string };
const ROLE_LABEL: Record<string, string> = { owner: "オーナー", manager: "店長", staff: "黒服" };

const card: React.CSSProperties = t.card;
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 2 };
const sub: React.CSSProperties = { fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px" };
const btn: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnOn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const inp: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };

export default function KioskPinPanel({ stores }: { stores: Store[] }) {
  const supabase = createClient();
  const [opMembers, setOpMembers] = useState<OpMember[]>([]);
  const [pinMsg, setPinMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // ★M-11a: 再設定モーダル（対象 membership・新PIN・確認）
  const [pinTarget, setPinTarget] = useState<OpMember | null>(null);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [modalErr, setModalErr] = useState<string | null>(null);

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? id;

  // 操作担当 PIN 対象＝owner/manager/staff(can_register)（set_staff_pin の bad target 条件と同一）。
  // memberships→users は2クエリでクライアント側結合（RLS: owner/manager の可視範囲で読める分だけ表示）。
  const loadOpMembers = useCallback(async () => {
    const { data: mems } = await supabase
      .from("memberships")
      .select("id, user_id, store_id, role, can_register, is_active");
    const eligible = (mems ?? []).filter(
      (m) => m.is_active && (m.role === "owner" || m.role === "manager" || (m.role === "staff" && m.can_register)),
    );
    const userIds = Array.from(new Set(eligible.map((m) => m.user_id as string)));
    const { data: us } = userIds.length
      ? await supabase.from("users").select("id, name").in("id", userIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const nameOf = (uid: string) => (us ?? []).find((u) => u.id === uid)?.name ?? "（不明）";
    setOpMembers(eligible.map((m) => ({
      id: m.id as string, store_id: m.store_id as string, role: m.role as string,
      user_name: nameOf(m.user_id as string),
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void loadOpMembers(); }, [loadOpMembers]);

  function openPinModal(m: OpMember) {
    setPinTarget(m); setNewPin(""); setConfirmPin(""); setModalErr(null);
  }

  // set_staff_pin（mig0056・owner/manager 自店＝RPC 側が強制。PIN は保存せず送信のみ・上書き設定）
  async function setStaffPin(membershipId: string, p: string) {
    if (!/^[0-9]{4}$/.test(p)) { setModalErr("PIN は数字4桁で入力してください"); return; }
    setBusy(true); setPinMsg(""); setModalErr(null);
    const { error } = await supabase.rpc("set_staff_pin", { p_membership_id: membershipId, p_pin: p });
    setBusy(false);
    if (error) {
      const m = error.message;
      setModalErr(m.includes("bad pin") ? "PIN は数字4桁で入力してください"
        : m.includes("bad target") ? "この担当は PIN 設定の対象外です"
        : m.includes("inactive membership") ? "無効な担当です"
        : m.includes("not found") ? "担当が見つかりません"
        : m.includes("forbidden") ? "権限がありません（自店の担当のみ設定できます）" : m);
      return;
    }
    setPinTarget(null);
    setPinMsg("PIN を設定しました（失敗回数・ロックもリセット）");
  }

  const canSubmit = /^[0-9]{4}$/.test(newPin) && newPin === confirmPin;

  return (
    <div className="nox-2col">
      {/* ── 左: 操作担当PIN（主カード） ── */}
      <section className="nox-cardtop" style={card}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h3 style={h3}>操作担当PIN</h3>
          <span className="nox-stpill" style={{ marginLeft: "auto" }}>4桁</span>
        </div>
        <p style={sub}>レジ操作を担当者と紐付けます</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
                {["担当者", "役割", "PIN", "操作"].map((h) => (
                  <th key={h} style={{ padding: 6, color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {opMembers.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 8, color: "var(--sub)" }}>（対象の担当がいません）</td></tr>
              )}
              {opMembers.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: 6 }}>
                    <b>{m.user_name}</b>
                    <small style={{ display: "block", color: "var(--sub)" }}>{storeName(m.store_id)}</small>
                  </td>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                    <span className="nox-stpill">{ROLE_LABEL[m.role] ?? m.role}</span>
                  </td>
                  <td style={{ padding: 6 }}>
                    <span className="num" title="設定済みかはレジ端末のログイン画面で確認" style={{ letterSpacing: 2, color: "var(--sub)" }}>••••</span>
                  </td>
                  <td style={{ padding: 6 }}>
                    <button style={btn} disabled={busy} onClick={() => openPinModal(m)}>再設定</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pinMsg && <p style={{ fontSize: 12, color: pinMsg.includes("しました") ? "var(--ok)" : "var(--bad)", margin: "8px 0 0" }}>{pinMsg}</p>}
      </section>

      {/* ── 右: PINポリシー（A-2 実測＝実在する仕様だけを静的表示） ── */}
      <section className="nox-cardtop" style={{ ...card, alignSelf: "start" }}>
        <h3 style={h3}>PINポリシー</h3>
        <p style={sub}>レジ端末ログインの現在の規則</p>
        <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
          <div style={t.bdRow}><span style={t.bdKey}>桁数</span><span style={t.bdVal}>数字4桁</span></div>
          <div style={t.bdRow}><span style={t.bdKey}>連続失敗ロック</span><span style={t.bdVal}>5回で15分ロック</span></div>
          <div style={t.bdRow}><span style={t.bdKey}>ロック解除</span><span style={t.bdVal}>正しい PIN の入力・または PIN の再設定で即時解除</span></div>
        </div>
        <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0" }}>
          設定は上書きです。設定済みかどうかはレジ端末のログイン画面で確認できます。
        </p>
      </section>

      {/* ── PINを設定モーダル（インライン入力の置き換え・送信は同じ set_staff_pin） ── */}
      {pinTarget && (
        <Modal onClose={() => setPinTarget(null)} maxWidth={420}>
          <h3 style={h3}>{pinTarget.user_name} のPINを設定</h3>
          <p style={sub}>{storeName(pinTarget.store_id)}・{ROLE_LABEL[pinTarget.role] ?? pinTarget.role}</p>
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>新しいPIN（数字4桁）</span>
              <input value={newPin} inputMode="numeric" maxLength={4} placeholder="0000" autoFocus
                onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                style={{ ...inp, width: 110, fontVariantNumeric: "tabular-nums", letterSpacing: 4 }} />
            </label>
            <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>確認のためもう一度</span>
              <input value={confirmPin} inputMode="numeric" maxLength={4} placeholder="0000"
                onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                style={{ ...inp, width: 110, fontVariantNumeric: "tabular-nums", letterSpacing: 4 }} />
            </label>
            {newPin.length === 4 && confirmPin.length === 4 && newPin !== confirmPin && (
              <p style={{ fontSize: 12, color: "var(--bad)", margin: 0 }}>確認用の PIN が一致しません</p>
            )}
            {modalErr && <p style={{ fontSize: 12, color: "var(--bad)", margin: 0 }}>{modalErr}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btn} onClick={() => setPinTarget(null)}>キャンセル</button>
              <button style={btnOn} disabled={busy || !canSubmit}
                onClick={() => void setStaffPin(pinTarget.id, newPin)}>PINを更新</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
