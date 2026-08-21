"use client";

// 操作担当 PIN（レジ端末・set_staff_pin＝mig0056・裁定11 確定③）。
//
// ★DP1 P1（2026-08-21・裁定 DP1-⑦）: 旧 kiosk-panel.tsx の「操作担当 PIN」節を独立部品へ分離した
//   （モック nox-staff-system-settings が別タブ「● 操作担当PIN」に置くため＝E8 staff#1 の履行）。
//   ★分割は**表示の再編のみ**＝クエリ・RPC・引数・エラー文言・対象条件は逐語で不変。
//
// staff_pin は deny-all＝設定状況は読めない・上書き設定のみ。
// 対象＝owner/manager/staff(can_register)＝RPC 側の bad target 条件と同一。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Store = { id: string; name: string };
type OpMember = { id: string; store_id: string; role: string; user_name: string };
const ROLE_LABEL: Record<string, string> = { owner: "オーナー", manager: "店長", staff: "黒服" };

const card: React.CSSProperties = t.card;
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
const btnOn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const inp: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };

export default function KioskPinPanel({ stores }: { stores: Store[] }) {
  const supabase = createClient();
  const [opMembers, setOpMembers] = useState<OpMember[]>([]);
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [pinMsg, setPinMsg] = useState("");
  const [busy, setBusy] = useState(false);

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

  // set_staff_pin（mig0056・owner/manager 自店＝RPC 側が強制。PIN は保存せず送信のみ・上書き設定）
  async function setStaffPin(membershipId: string) {
    const p = (pinInputs[membershipId] ?? "").trim();
    if (!/^[0-9]{4}$/.test(p)) { setPinMsg("PIN は数字4桁で入力してください"); return; }
    setBusy(true); setPinMsg("");
    const { error } = await supabase.rpc("set_staff_pin", { p_membership_id: membershipId, p_pin: p });
    setBusy(false);
    if (error) {
      const m = error.message;
      setPinMsg(m.includes("bad pin") ? "PIN は数字4桁で入力してください"
        : m.includes("bad target") ? "この担当は PIN 設定の対象外です"
        : m.includes("inactive membership") ? "無効な担当です"
        : m.includes("not found") ? "担当が見つかりません"
        : m.includes("forbidden") ? "権限がありません（自店の担当のみ設定できます）" : m);
      return;
    }
    setPinInputs((v) => ({ ...v, [membershipId]: "" }));
    setPinMsg("PIN を設定しました（失敗回数・ロックもリセット）");
  }

  return (
    <section className="nox-cardtop" style={card}>
      <h3 style={h3}>操作担当 PIN（レジ端末）</h3>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
        レジ端末で会計を操作する担当（オーナー・店長・会計権限のある黒服）の PIN（4桁）を設定します。
        設定は上書きで、PIN の失敗ロックも解除されます。設定済みかどうかはレジ端末のログイン画面で確認できます。
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
              {["店舗", "担当", "役割", "PIN（4桁）", "操作"].map((h) => (
                <th key={h} style={{ padding: 6, color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {opMembers.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 8, color: "var(--sub)" }}>（対象の担当がいません）</td></tr>
            )}
            {opMembers.map((m) => (
              <tr key={m.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: 6, whiteSpace: "nowrap" }}>{storeName(m.store_id)}</td>
                <td style={{ padding: 6, fontWeight: 700 }}>{m.user_name}</td>
                <td style={{ padding: 6, whiteSpace: "nowrap" }}>{ROLE_LABEL[m.role] ?? m.role}</td>
                <td style={{ padding: 6 }}>
                  <input
                    value={pinInputs[m.id] ?? ""} inputMode="numeric" maxLength={4} placeholder="0000"
                    onChange={(e) => setPinInputs((v) => ({ ...v, [m.id]: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) }))}
                    style={{ ...inp, width: 70, fontVariantNumeric: "tabular-nums" }}
                  />
                </td>
                <td style={{ padding: 6 }}>
                  <button style={btnOn} disabled={busy || (pinInputs[m.id] ?? "").length !== 4}
                    onClick={() => void setStaffPin(m.id)}>設定</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pinMsg && <p style={{ fontSize: 12, color: pinMsg.includes("しました") ? "var(--ok)" : "var(--bad)", margin: "8px 0 0" }}>{pinMsg}</p>}
    </section>
  );
}
