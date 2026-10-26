"use client";

// F3g キャスト会計（mig0039）UI。2段ゲート＝店フラグ（settings_json.cast_register_enabled・owner のみ）
// ∧ cast 別 can_register（membership・owner/manager）。両方 true のときだけ当該 cast がレジ会計を使える。
// 真の防御は会計 RLS/RPC の cast 2段ゲート（auth_cast_can_register）＝ここは操作 UI（RPC は二重に守る）。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
import { rules0175On } from "@/lib/nox/rules-0175/flag"; // ★追補 2
import { CAST_REGISTER_LEVEL_DESC, CAST_REGISTER_LEVEL_LABEL, castRegisterLevelOf, type CastRegisterLevel } from "@/lib/nox/rules-0175/cast-register"; // ★追補 2（裁定420）
import { STAFF_DISCOUNT_LABEL, staffDiscountCapOf, staffDiscountLevelOf, type StaffDiscountLevel } from "@/lib/nox/rules-0175/staff-discount"; // ★追補 2（裁定421 候補）
type CastRow = { id: string; name: string; membershipId: string | null; canRegister: boolean };

const card: React.CSSProperties = t.card;
const h2: React.CSSProperties = { ...t.pheadH1, fontSize: 16 };
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
const btn: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnOn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };

export default function CastRegisterPanel({
  storeId, isOwner, initialEnabled, casts, settings = null,
}: {
  storeId: string;
  isOwner: boolean;
  initialEnabled: boolean;
  casts: CastRow[];
  settings?: Record<string, unknown> | null; // ★追補 2（裁定420／421 候補）: 3 段階の現在値（フラグ true のときだけ使う）
}) {
  const supabase = createClient();
  const [enabled, setEnabled] = useState(initialEnabled);
  // ★追補 2（裁定420・裁定421 候補・0175 v2 ★24／★25）: 「キャストのレジ使用」0／1／2 と「スタッフの割引・手数料カット」0／1／2＋上限＝set_store_profile の patch（白名単は v2）。RULES_0175_APPLIED=false では出ない
  const [sj, setSj] = useState<Record<string, unknown>>(settings ?? {});
  const [lvBusy, setLvBusy] = useState(false);
  async function patchStore(patch: Record<string, unknown>, label: string) {
    if (lvBusy) return;
    setLvBusy(true); setMsg("");
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: patch });
    setLvBusy(false);
    if (error) { setMsg(`エラー: ${error.message}`); return; }
    setSj((s) => ({ ...s, ...patch })); setMsg(`${label}にしました`);
    if (typeof patch.sys_cast_register === "number") setEnabled((patch.sys_cast_register as number) > 0);
  }
  const [rows, setRows] = useState<CastRow[]>(casts);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function switchStore(next: boolean) {
    if (next === enabled || busy) return;
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("set_store_cast_register", { p_store_id: storeId, p_enabled: next });
    if (error) setMsg(`エラー: ${error.message}`);
    else { setEnabled(next); setMsg(`店のキャスト会計を「${next ? "有効" : "無効"}」にしました`); }
    setBusy(false);
  }

  async function toggleCast(row: CastRow) {
    if (busy || !row.membershipId) return;
    const next = !row.canRegister;
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("set_cast_register", { p_membership_id: row.membershipId, p_can_register: next });
    if (error) setMsg(`エラー: ${error.message}`);
    else {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, canRegister: next } : r)));
      setMsg(`${row.name} のレジ会計を「${next ? "許可" : "不許可"}」にしました`);
    }
    setBusy(false);
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={h2}>キャスト会計（レジ操作）</h2>

      {/* 店フラグ（owner のみ操作可・manager は現在値のみ） */}
      <section className="nox-cardtop" style={card}>
        <h3 style={h3}>店のキャスト会計</h3>
        <p style={{ fontSize: 13, margin: "4px 0" }}>
          現在: <strong style={{ color: enabled ? "var(--ok)" : "var(--sub)" }}>{enabled ? "有効（キャストにレジを開放）" : "無効（キャストはレジ操作不可）"}</strong>
        </p>
        {isOwner ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-actions-exempt="有効／無効の選択（選択中が青＝状態の表示）">
            <button onClick={() => void switchStore(false)} disabled={busy || !enabled} style={!enabled ? btnOn : btn}>無効</button>
            <button onClick={() => void switchStore(true)} disabled={busy || enabled} style={enabled ? btnOn : btn}>有効</button>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>※有効にしても、下の一覧で許可したキャストだけがレジを使えます（2段確認）。</span>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>※店のキャスト会計の切替は owner のみ可能です。</p>
        )}
      </section>

      {rules0175On() && (/* ★追補 2（裁定420）: 3 段階＝OFF／注文のみ／会計まで（owner のみ・フラグ true のときだけ） */
        <section className="nox-cardtop" style={card} data-cast-register-level={castRegisterLevelOf(sj)}>
          <h3 style={h3}>キャストのレジ使用（段階）</h3>
          <div role="radiogroup" aria-label="キャストのレジ使用" style={{ display: "grid", gap: 6 }}>
            {([0, 1, 2] as CastRegisterLevel[]).map((lv) => (
              <label key={lv} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5 }}>
                <input type="radio" name="cast-register-level" checked={castRegisterLevelOf(sj) === lv} disabled={!isOwner || lvBusy} onChange={() => void patchStore({ sys_cast_register: lv }, `キャストのレジ使用を「${CAST_REGISTER_LEVEL_LABEL[lv]}」`)} />
                <span><b>{CAST_REGISTER_LEVEL_LABEL[lv]}</b><span style={{ color: "var(--sub)", marginLeft: 8 }}>{CAST_REGISTER_LEVEL_DESC[lv]}</span></span>
              </label>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "6px 0 0" }}>どの段階でも、自分が着卓中／指名されている卓だけ・操作は記録にキャスト名・端末の縛りは「操作端末」の設定。</p>
        </section>
      )}
      {rules0175On() && (/* ★追補 2（裁定421 候補）: スタッフの割引・手数料カット＝承認制／上限内は即時／不可（owner のみ） */
        <section className="nox-cardtop" style={card} data-staff-discount-level={staffDiscountLevelOf(sj)}>
          <h3 style={h3}>スタッフの割引・手数料カット</h3>
          <div role="radiogroup" aria-label="スタッフの割引・手数料カット" style={{ display: "grid", gap: 6 }}>
            {([0, 1, 2] as StaffDiscountLevel[]).map((lv) => (
              <label key={lv} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                <input type="radio" name="staff-discount-level" checked={staffDiscountLevelOf(sj) === lv} disabled={!isOwner || lvBusy} onChange={() => void patchStore({ sys_staff_discount: lv }, `スタッフの割引・手数料カットを「${STAFF_DISCOUNT_LABEL[lv]}」`)} />
                <span>{STAFF_DISCOUNT_LABEL[lv]}</span>
              </label>
            ))}
          </div>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5, marginTop: 8 }}>上限（1 件あたり）
            <input type="number" min={0} defaultValue={staffDiscountCapOf(sj)} disabled={!isOwner || lvBusy || staffDiscountLevelOf(sj) !== 1} aria-label="スタッフの即時適用の上限" style={{ ...t.input, width: 110 }}
              onBlur={(e) => { const v = Math.max(0, Math.trunc(Number(e.target.value) || 0)); if (v !== staffDiscountCapOf(sj)) void patchStore({ staff_discount_cap: v }, `上限を ¥${v.toLocaleString()}`); }} /> 円
          </label>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "6px 0 0" }}>即時適用も記録にスタッフ名と理由（必須）。上限超えと確定後の伝票は承認に回ります。キャストは常に不可（裁定420）。</p>
        </section>
      )}
      {/* cast 別許可（owner/manager 操作可） */}
      <section className="nox-cardtop" style={card}>
        <h3 style={h3}>キャスト別のレジ会計許可</h3>
        {!enabled && (
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
            ※店のキャスト会計が「無効」のため、ここで許可しても実際には使えません（店を有効にすると効きます）。
          </p>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
                {["キャスト", "レジ会計"].map((h) => (
                  <th key={h} style={{ padding: 6, color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={2} style={{ padding: 8, color: "var(--sub)" }}>（在籍キャストがいません）</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: 6, fontWeight: 700, whiteSpace: "nowrap" }}>{r.name}</td>
                  <td style={{ padding: 6, textAlign: "center" }}>
                    {/* E8-1 M7 是正（E8 裁定 §4-1）: membership が無い＝can_register の書き先が無い（防御は正）。
                        従来は disabled のみで理由が出ず「押しても無反応」に見えた。黙って無反応は禁止＝
                        未招待バッジ＋招待導線（/casts）を明示する。 */}
                    {r.membershipId ? (
                      <input
                        type="checkbox"
                        checked={r.canRegister}
                        disabled={busy}
                        onChange={() => void toggleCast(r)}
                        style={{ accentColor: "var(--gold)", cursor: "pointer" }}
                      />
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                        <span style={{ ...t.tag, color: "var(--sub)", borderColor: "var(--line2)" }}>未招待</span>
                        <a href="/casts" className="nox-link" style={{ fontSize: 11.5 }}>
                          キャスト管理で招待すると設定できます →
                        </a>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {msg && <Toast msg={msg} style={{ margin: "6px 0 0" }} />}
    </div>
  );
}
