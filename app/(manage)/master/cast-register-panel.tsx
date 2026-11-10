"use client";

// F3g キャスト会計（mig0039）UI → ★裁定473（M-131・2026-11-10）: キャストのレジ設定の正本＝この 1 画面（マスタ › 権限・情報管理 › キャスト会計の許可）。
//   並び＝段階（OFF／注文のみ／会計まで＝sys_cast_register）→ 操作端末（店端末のみ／自分のスマホからも＝cast_register_device）→ 会計できる卓（全卓＝既定／自分の卓だけ＝cast_register_scope＝0200 の白名単）→ キャスト別の許可（memberships.can_register）。
//   「店のキャスト会計 有効／無効」（set_store_cast_register・旧 cast_register_enabled）は廃止＝段階 ≠ OFF が有効。キャスト画面の設定からは「キャストのレジ使用」「操作端末」を外した（リンク 1 行）。
//   真の防御は会計 RLS/RPC の cast 2段ゲート（auth_cast_can_register＝0200 からは端末も見る）＝ここは操作 UI。店の設定（段階・端末・卓）は owner だけ（set_store_profile）・キャスト別は owner／manager。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
import { mig0200On, rules0175On } from "@/lib/nox/rules-0175/flag"; // ★追補 2 ★0200
import { CAST_REGISTER_LEVEL_DESC, CAST_REGISTER_LEVEL_LABEL, CAST_REGISTER_SCOPE_DESC, CAST_REGISTER_SCOPE_LABEL, castRegisterLevelOf, castRegisterScopeNoteOf, castRegisterScopeOf, type CastRegisterLevel, type CastRegisterScope } from "@/lib/nox/rules-0175/cast-register"; // ★追補 2（裁定420）★裁定473
import { CAST_REGISTER_DEVICE_LABEL, castRegisterDeviceOf, type CastRegisterDevice } from "@/lib/nox/register/p173"; // ★便 P173（裁定389）→ ★裁定473: ここが正本
import { STAFF_DISCOUNT_LABEL, staffDiscountCapOf, staffDiscountLevelOf, type StaffDiscountLevel } from "@/lib/nox/rules-0175/staff-discount"; // ★追補 2（裁定421 候補）
import { errJa } from "@/lib/nox/errors"; // ★裁定467（M-126）: 利用者向けの文言は辞書 1 本
type CastRow = { id: string; name: string; membershipId: string | null; canRegister: boolean };

const card: React.CSSProperties = t.card;
const h2: React.CSSProperties = { ...t.pheadH1, fontSize: 16 };
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
export const CAST_REGISTER_SCOPE_PENDING_NOTE = "会計できる卓の選択は DB 更新（0200）の後に使えます。それまでは全卓です。"; // ★0200 のフラグが false の間だけ

export default function CastRegisterPanel({
  storeId, isOwner, initialEnabled, casts, settings = null,
}: {
  storeId: string;
  isOwner: boolean;
  /** ★裁定473: 段階 ≠ OFF（互換のため受けるが正本は settings の sys_cast_register） */
  initialEnabled: boolean;
  casts: CastRow[];
  settings?: Record<string, unknown> | null; // 段階・端末・卓の現在値
}) {
  const supabase = createClient();
  const [sj, setSj] = useState<Record<string, unknown>>(settings ?? {});
  const [lvBusy, setLvBusy] = useState(false);
  const level = castRegisterLevelOf(sj);
  const enabled = level > 0 || (initialEnabled && !("sys_cast_register" in sj)); // ★裁定473: 有効＝段階 ≠ OFF
  const device: CastRegisterDevice = castRegisterDeviceOf(sj);
  const scope: CastRegisterScope = castRegisterScopeOf(sj);
  async function patchStore(patch: Record<string, unknown>, label: string) {
    if (lvBusy) return;
    setLvBusy(true); setMsg("");
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: patch });
    setLvBusy(false);
    if (error) { setMsg(`エラー: ${errJa(error.message)}`); return; }
    setSj((s) => ({ ...s, ...patch })); setMsg(`${label}にしました`);
  }
  const [rows, setRows] = useState<CastRow[]>(casts);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function toggleCast(row: CastRow) {
    if (busy || !row.membershipId) return;
    const next = !row.canRegister;
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("set_cast_register", { p_membership_id: row.membershipId, p_can_register: next });
    if (error) setMsg(`エラー: ${errJa(error.message)}`);
    else {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, canRegister: next } : r)));
      setMsg(`${row.name} のレジ会計を「${next ? "許可" : "不許可"}」にしました`);
    }
    setBusy(false);
  }
  const ownerNote = isOwner ? null : <p style={{ fontSize: 12, color: "var(--sub)", margin: "6px 0 0" }}>※店の設定（段階・操作端末・会計できる卓）の変更は管理者（オーナー）だけです。</p>;

  return (
    <div style={{ marginTop: 24 }} data-cast-register-panel="473">
      <h2 style={h2}>キャスト会計の許可</h2>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "-4px 0 10px" }}>キャストがレジを使う条件はここで決めます（段階 → 操作端末 → 会計できる卓 → キャスト別の許可）。段階が「OFF」以外で有効です。</p>

      {rules0175On() && (/* ★追補 2（裁定420）: 3 段階＝OFF／注文のみ／会計まで（owner のみ） */
        <section className="nox-cardtop" style={card} data-cast-register-level={level}>
          <h3 style={h3}>1. キャストのレジ使用（段階）</h3>
          <div role="radiogroup" aria-label="キャストのレジ使用" style={{ display: "grid", gap: 6 }}>
            {([0, 1, 2] as CastRegisterLevel[]).map((lv) => (
              <label key={lv} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, minHeight: 32 }}>
                <input type="radio" name="cast-register-level" checked={level === lv} disabled={!isOwner || lvBusy} onChange={() => void patchStore({ sys_cast_register: lv }, `キャストのレジ使用を「${CAST_REGISTER_LEVEL_LABEL[lv]}」`)} />
                <span><b>{CAST_REGISTER_LEVEL_LABEL[lv]}</b><span style={{ color: "var(--sub)", marginLeft: 8 }}>{CAST_REGISTER_LEVEL_DESC[lv]}</span></span>
              </label>
            ))}
          </div>
          {ownerNote}
        </section>
      )}

      {/* ★裁定473: 操作端末（キャスト画面の設定から移した＝set_store_profile の cast_register_device） */}
      <section className="nox-cardtop" style={card} data-cast-register-device={device}>
        <h3 style={h3}>2. 操作端末</h3>
        <div role="radiogroup" aria-label="操作端末" style={{ display: "grid", gap: 6 }}>
          {(["store_device", "own_phone"] as const).map((v) => (
            <label key={v} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, minHeight: 32 }}>
              <input type="radio" name="cast-register-device" checked={device === v} disabled={!isOwner || lvBusy || !enabled} onChange={() => void patchStore({ cast_register_device: v }, `操作端末を「${CAST_REGISTER_DEVICE_LABEL[v]}」`)} />
              <span><b>{CAST_REGISTER_DEVICE_LABEL[v]}</b><span style={{ color: "var(--sub)", marginLeft: 8 }}>{v === "store_device" ? "店の端末（キオスクの PIN）からだけ。キャスト本人のスマホからは開けません" : "キャスト本人のログイン（スマホ）からもレジを開けます（出勤中だけ）"}</span></span>
            </label>
          ))}
        </div>
        {ownerNote}
      </section>

      {/* ★裁定473: 会計できる卓＝0200 の白名単 cast_register_scope（フラグ false の間は注記だけ） */}
      <section className="nox-cardtop" style={card} data-cast-register-scope={scope}>
        <h3 style={h3}>3. 会計できる卓</h3>
        {mig0200On() ? (
          <div role="radiogroup" aria-label="会計できる卓" style={{ display: "grid", gap: 6 }}>
            {(["all", "own"] as const).map((v) => (
              <label key={v} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, minHeight: 32 }}>
                <input type="radio" name="cast-register-scope" checked={scope === v} disabled={!isOwner || lvBusy || !enabled} onChange={() => void patchStore({ cast_register_scope: v }, `会計できる卓を「${CAST_REGISTER_SCOPE_LABEL[v]}」`)} />
                <span><b>{CAST_REGISTER_SCOPE_LABEL[v]}</b><span style={{ color: "var(--sub)", marginLeft: 8 }}>{CAST_REGISTER_SCOPE_DESC[v]}</span></span>
              </label>
            ))}
          </div>
        ) : <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>{CAST_REGISTER_SCOPE_PENDING_NOTE}</p>}
        <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "6px 0 0" }}>{castRegisterScopeNoteOf(mig0200On() ? scope : "all")}</p>
        {ownerNote}
      </section>

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
        <h3 style={h3}>4. キャスト別の許可</h3>
        {!enabled && (
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
            ※段階が「OFF」のため、ここで許可しても実際には使えません（段階を「注文のみ」か「会計まで」にすると効きます）。
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
