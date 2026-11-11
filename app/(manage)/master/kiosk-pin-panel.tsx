"use client";

// 操作担当 PIN（レジ端末・set_staff_pin＝mig0056・裁定11 確定③）。
//
// ★M-11a（2026-08-27）: モック nox-staff-system-settings の2カラム構成へ追随
//   （左=担当の表／右=PINポリシー。narrow は .nox-2col が1カラム）。
// ★M-11b（mig0108・起票#31）: staff_pin_status で設定状況・失敗回数・ロックを読めるようになった
//   （deny-all のまま読取専用 RPC を新設＝hash 非返却）。この画面は:
//   - PIN 列 = has_pin ? "••••（設定済）" : "未設定"／失敗列 = fail_count・ロック中は赤で「〜まで」
//   - 右カード = ロック閾値の実値（set_store_pin_policy・owner のみ保存・manager は表示のみ）
//   - 「最終アクセス」列は出さない（打刻端末側の記録は mig0109 後）
//   ★RPC・引数・エラー文言・対象条件は逐語で不変。set_staff_pin の送信は従来と同じ1本。
//   ★モーダルの検証は 4桁・確認一致のみ（サーバに繰り返し禁止規則は無い＝逆転を作らない）。
import { useCallback, useEffect, useState } from "react";
import { PIN_DIGITS_LABEL, PIN_SHAPE_RE } from "@/components/nox/pin-pad"; // ★M-179: 桁数は 1 か所の定数から
import SegSelect from "@/components/ui/seg-select"; // ★M-82（裁定452・教訓133）: 固定の選択肢はボタン群
import { createClient } from "@/lib/supabase/client";
import { mig0191On, mig0192On } from "@/lib/nox/rules-0175/flag"; // ★0191 ★3: PIN 4〜6 桁・★便 M5 M-45: 0192 cast_pin_status
import Link from "next/link"; // ★便 M5 M-45: キャストの行→キャスト詳細
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";

import Toast, { Message } from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
type Store = { id: string; name: string };
type OpMember = { id: string; store_id: string; role: string; user_name: string };
type PinStatus = { membership_id: string; has_pin: boolean; fail_count: number; locked_until: string | null; pin_updated_at: string | null };
type CastPinRow = { cast_id: string; store_id: string; cast_name: string; has_pin: boolean; fail_count: number; locked_until: string | null }; // ★便 M5 M-45: 0192 cast_pin_status（owner＝全店／manager＝自店）
const ROLE_LABEL: Record<string, string> = { owner: "管理者", manager: "店長", staff: "スタッフ", cast: "キャスト" }; // ★便 M5 M-45: キャストの行

const MAX_FAIL_OPTIONS = [3, 5, 10] as const;
const LOCK_MIN_OPTIONS = [5, 10, 15, 30, 60] as const;

const card: React.CSSProperties = t.card;
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 2 };
const sub: React.CSSProperties = { fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px" };
const btn: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnOn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const inp: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };

// set_store_pin_policy のエラー写像（mig0108）
function policyErrJa(m: string): string {
  return m.includes("bad max_fail") ? "回数は3〜10で指定してください"
    : m.includes("bad lock_minutes") ? "時間は5〜60分で指定してください"
    : m.includes("forbidden") ? "権限がありません（管理者のみ）"
    : m.includes("billing locked") ? "課金が停止中のため変更できません" : m;
}

export default function KioskPinPanel({ stores, isOwner }: { stores: Store[]; isOwner: boolean }) {
  const supabase = createClient();
  const [opMembers, setOpMembers] = useState<OpMember[]>([]);
  const [pinStatus, setPinStatus] = useState<Record<string, PinStatus>>({});
  const [pinMsg, setPinMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // ★M-11a: 再設定モーダル（対象 membership・新PIN・確認）
  const [pinTarget, setPinTarget] = useState<OpMember | null>(null);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [modalErr, setModalErr] = useState<string | null>(null);
  // ★M-11b: PIN ポリシー（店単位・settings_json の pin_lock_max_fail / pin_lock_minutes）
  const [polStoreId, setPolStoreId] = useState<string>(stores[0]?.id ?? "");
  const [maxFail, setMaxFail] = useState(5);
  const [lockMin, setLockMin] = useState(10); // ★便 M5 M-46（裁定437）: 既定 10 分（kiosk_login＝0190 は 10 分・staff_punch＝0191 は 15 分→0192 で 10 分に）
  const [castRows, setCastRows] = useState<CastPinRow[] | null>(null); // ★便 M5 M-45: null＝未読（0192 未適用は読まない）
  const [polMsg, setPolMsg] = useState("");
  const [polBusy, setPolBusy] = useState(false);

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? id;

  // 操作担当 PIN 対象＝owner/manager/staff＋can_register のキャスト（★M-125）（set_staff_pin の bad target 条件と同一・★0173 で staff の can_register 条件を外した＝打刻端末のスタッフ打刻）。
  // memberships→users は2クエリでクライアント側結合（RLS: owner/manager の可視範囲で読める分だけ表示）。
  const loadOpMembers = useCallback(async () => {
    const { data: mems } = await supabase
      .from("memberships")
      .select("id, user_id, store_id, role, can_register, is_active");
    const eligible = (mems ?? []).filter(
      (m) => m.is_active && (m.role === "owner" || m.role === "manager" || m.role === "staff" || (m.role === "cast" && m.can_register === true)), // ★便 P174 T-6（355・389 追補1 ⑤＝0173）: staff は can_register に関わらず PIN 可（打刻端末の staff_punch 用）★M-125（2026-11-10）: レジを許可したキャスト（can_register）も操作担当 PIN＝キオスクのレジのタイル → PIN で本人セッション（set_staff_pin の対象と同じ）
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

  // ★M-11b: staff_pin_status（mig0108・owner=全店／manager=自店。失敗した店は行なし＝「未設定」でなく「—」）
  const loadPinStatus = useCallback(async () => {
    const map: Record<string, PinStatus> = {};
    for (const s of stores) {
      const { data, error } = await supabase.rpc("staff_pin_status", { p_store_id: s.id });
      if (error) continue; // manager の他店など＝この店の状態は出さない
      for (const r of (data ?? []) as PinStatus[]) map[r.membership_id] = r;
    }
    setPinStatus(map);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);

  // ★便 M5 M-45: キャストのキオスク PIN の状態（設定はキャスト詳細のまま・ここは設定済み／未設定と失敗回数だけ）＝0192 cast_pin_status の配下
  const loadCastRows = useCallback(async () => {
    if (!mig0192On()) { setCastRows(null); return; }
    const rows: CastPinRow[] = [];
    for (const s of stores) {
      const { data, error } = await supabase.rpc("cast_pin_status", { p_store_id: s.id });
      if (error) continue;
      for (const r of (data ?? []) as Omit<CastPinRow, "store_id">[]) rows.push({ ...r, store_id: s.id });
    }
    setCastRows(rows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);

  // ポリシー実値の読取（stores.settings_json＝kiosk_login と同じキー・既定 5回/10分＝★便 M5 M-46）
  const loadPolicy = useCallback(async (storeId: string) => {
    if (!storeId) return;
    const { data } = await supabase.from("stores").select("settings_json").eq("id", storeId).single();
    const sj = (data?.settings_json ?? {}) as Record<string, unknown>;
    const asInt = (v: unknown, d: number) => {
      const n = parseInt(String(v ?? ""), 10);
      return Number.isFinite(n) ? n : d;
    };
    setMaxFail(asInt(sj.pin_lock_max_fail, 5));
    setLockMin(asInt(sj.pin_lock_minutes, 10)); // ★便 M5 M-46（裁定437）: 既定 10 分
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void loadOpMembers(); void loadPinStatus(); void loadCastRows(); }, [loadOpMembers, loadPinStatus, loadCastRows]);
  useEffect(() => { void loadPolicy(polStoreId); }, [loadPolicy, polStoreId]);

  function openPinModal(m: OpMember) {
    setPinTarget(m); setNewPin(""); setConfirmPin(""); setModalErr(null);
  }

  // set_staff_pin（mig0056・owner/manager 自店＝RPC 側が強制。PIN は保存せず送信のみ・上書き設定）
  async function setStaffPin(membershipId: string, p: string) {
    if (!PIN_SHAPE_RE.test(p)) { setModalErr(`PIN は数字 ${PIN_DIGITS_LABEL}で入力してください`); return; } /* ★M-179 */   // ★0191 ★3
    setBusy(true); setPinMsg(""); setModalErr(null);
    const { error } = await supabase.rpc("set_staff_pin", { p_membership_id: membershipId, p_pin: p });
    setBusy(false);
    if (error) {
      const m = error.message;
      setModalErr(m.includes("bad pin") ? `PIN は数字 ${PIN_DIGITS_LABEL}で入力してください`
        : m.includes("bad target") ? "この担当は PIN 設定の対象外です"
        : m.includes("inactive membership") ? "無効な担当です"
        : m.includes("not found") ? "担当が見つかりません"
        : m.includes("forbidden") ? "権限がありません（自店の担当のみ設定できます）" : m);
      return;
    }
    setPinTarget(null);
    setPinMsg("PIN を設定しました（失敗回数・ロックもリセット）");
    void loadPinStatus();
  }

  // set_store_pin_policy（mig0108・owner 限定＝RPC 側が強制。UI は表示制御のみ）
  async function savePolicy() {
    if (!polStoreId) return;
    setPolBusy(true); setPolMsg("");
    const { error } = await supabase.rpc("set_store_pin_policy", {
      p_store_id: polStoreId, p_max_fail: maxFail, p_lock_minutes: lockMin,
    });
    setPolBusy(false);
    if (error) { setPolMsg(policyErrJa(error.message)); return; }
    setPolMsg("ロックポリシーを保存しました");
    void loadPolicy(polStoreId);
  }

  // ★0192 M-39: ロックの解除（staff_pin_unlock／cast_pin_unlock＝owner 全店／manager 自店・fail_count 0・locked_until null・audit）。0192 未適用はボタンを出さない
  async function unlockPin(kind: "staff" | "cast", id: string) {
    setBusy(true); setPinMsg("");
    const { error } = kind === "staff"
      ? await supabase.rpc("staff_pin_unlock", { p_membership_id: id })
      : await supabase.rpc("cast_pin_unlock", { p_cast_id: id });
    setBusy(false);
    if (error) { const m = error.message; setPinMsg(m.includes("no pin") ? "PIN が未設定です" : m.includes("forbidden") ? "権限がありません（自店の担当のみ解除できます）" : m.includes("billing locked") ? "課金が停止中のため変更できません" : m); return; }
    setPinMsg("ロックを解除しました（失敗回数も 0 に）");
    if (kind === "staff") void loadPinStatus(); else void loadCastRows();
  }

  const canSubmit = (mig0191On() ? /^[0-9]{4,6}$/ : /^[0-9]{4}$/).test(newPin) && newPin === confirmPin;   // ★0191 ★3

  const hhmm = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="nox-2col nox-2col--32">
      {/* ── 左: 操作担当PIN（主カード） ── */}
      <section className="nox-cardtop" style={card}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h3 style={h3}>PIN</h3>{/* ★便 M5 M-45: 2 系統を 1 つの一覧に＝操作担当 PIN（スタッフ・ここで設定）／キオスク PIN（キャスト・設定はキャスト詳細） */}
          <span className="nox-stpill" style={{ marginLeft: "auto" }}>{PIN_DIGITS_LABEL}</span>
        </div>
        <p style={sub} data-pin-two-kinds="1">操作担当 PIN（管理者・店長・スタッフ＝レジ操作を担当者と紐付ける・ここで設定）と、キオスク PIN（キャスト＝打刻・レジの本人確認・設定はキャスト詳細 › アカウント）</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
                {["担当者", "役割", "PIN", "失敗", "操作"].map((h) => (
                  <th key={h} style={{ padding: 6, color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {opMembers.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 8, color: "var(--sub)" }}>（対象の担当がいません）</td></tr>
              )}
              {opMembers.map((m) => {
                const st = pinStatus[m.id];
                const locked = !!st?.locked_until && new Date(st.locked_until).getTime() > Date.now();
                return (
                  <tr key={m.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: 6 }}>
                      <b>{m.user_name}</b>
                      <small style={{ display: "block", color: "var(--sub)" }}>{storeName(m.store_id)}</small>
                    </td>
                    <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                      <span className="nox-stpill">{ROLE_LABEL[m.role] ?? m.role}</span>
                    </td>
                    <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                      {st === undefined ? <span style={{ color: "var(--sub)" }}>—</span>
                        : st.has_pin
                          ? <span className="num" style={{ letterSpacing: 2 }}>••••<small style={{ letterSpacing: 0, color: "var(--sub)" }}>（設定済）</small></span>
                          : <span style={{ color: "var(--sub)" }}>未設定</span>}
                    </td>
                    <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                      {st === undefined ? <span style={{ color: "var(--sub)" }}>—</span> : (
                        <>
                          <span className="num">{st.fail_count}</span>
                          <small style={{ color: "var(--sub)" }}>回</small>
                          {locked && st.locked_until && (
                            <small style={{ display: "block", color: "var(--bad)", fontWeight: 700 }}>
                              ロック中 {hhmm(st.locked_until)} まで
                            </small>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ padding: 6 }}>
                      <button style={btn} disabled={busy} onClick={() => openPinModal(m)}>再設定</button>
                      {mig0192On() && locked && <button style={{ ...btn, marginLeft: 6 }} data-pin-unlock={m.id} disabled={busy} onClick={() => void unlockPin("staff", m.id)}>解除</button>}{/* ★0192 M-39 */}
                    </td>
                  </tr>
                );
              })}
              {/* ★便 M5 M-45: キャストの行（キオスク PIN＝設定済み／未設定と失敗回数だけ・設定はキャスト詳細）。0192 未適用＝1 行の案内 */}
              {castRows === null ? (
                <tr data-cast-pin-rows="pending"><td colSpan={5} style={{ padding: 8, color: "var(--sub)", fontSize: 11.5 }}>キャストのキオスク PIN の状態（設定済み／失敗回数）は 0192（cast_pin_status）の適用後にここに並びます。設定はキャスト詳細 › アカウント。</td></tr>
              ) : castRows.map((c) => {
                const locked = !!c.locked_until && new Date(c.locked_until).getTime() > Date.now();
                return (
                  <tr key={c.cast_id} data-cast-pin-row={c.cast_id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: 6 }}>
                      <b>{c.cast_name}</b>
                      <small style={{ display: "block", color: "var(--sub)" }}>{storeName(c.store_id)}</small>
                    </td>
                    <td style={{ padding: 6, whiteSpace: "nowrap" }}><span className="nox-stpill">{ROLE_LABEL.cast}</span></td>
                    <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                      {c.has_pin ? <span className="num" style={{ letterSpacing: 2 }}>••••<small style={{ letterSpacing: 0, color: "var(--sub)" }}>（設定済）</small></span> : <span style={{ color: "var(--sub)" }}>未設定</span>}
                    </td>
                    <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                      <span className="num">{c.fail_count}</span><small style={{ color: "var(--sub)" }}>回</small>
                      {locked && c.locked_until && <small style={{ display: "block", color: "var(--bad)", fontWeight: 700 }}>ロック中 {hhmm(c.locked_until)} まで</small>}
                    </td>
                    <td style={{ padding: 6 }}>
                      <Link href="/casts" style={{ fontSize: 12, color: "var(--champ)" }}>キャスト詳細で設定</Link>
                      {locked && <button style={{ ...btn, marginLeft: 6 }} data-pin-unlock={c.cast_id} disabled={busy} onClick={() => void unlockPin("cast", c.cast_id)}>解除</button>}{/* ★0192 M-39（castRows は 0192 適用後だけ並ぶ） */}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pinMsg && <Toast msg={pinMsg} style={{ margin: "8px 0 0" }} />}
      </section>

      {/* ── 右: PINポリシー（mig0108＝実値の表示・owner のみ保存） ── */}
      <section className="nox-cardtop" style={{ ...card, alignSelf: "start" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h3 style={h3}>PINポリシー</h3>
        </div>
        <p style={sub}>レジ端末ログインのロック規則（店単位）</p>
        <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
          {stores.length > 1 && (
            <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>店舗</span>
              <select value={polStoreId} onChange={(e) => setPolStoreId(e.target.value)} style={inp}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          <div style={t.bdRow}><span style={t.bdKey}>桁数</span><span style={t.bdVal}><span className="nox-stpill">数字 {PIN_DIGITS_LABEL}</span></span></div>
          <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>連続失敗でロック</span>
            <SegSelect value={String(maxFail)} disabled={!isOwner || polBusy} onChange={(v) => setMaxFail(parseInt(v, 10))} options={MAX_FAIL_OPTIONS.map((n) => [String(n), `${n}回`] as const)} ariaLabel="失敗回数" />{/* ★M-82 */}
          </label>
          <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>ロック時間</span>
            <SegSelect value={String(lockMin)} disabled={!isOwner || polBusy} onChange={(v) => setLockMin(parseInt(v, 10))} options={LOCK_MIN_OPTIONS.map((n) => [String(n), `${n}分`] as const)} ariaLabel="ロック時間" />{/* ★M-82 */}
          </label>
          <div style={t.bdRow}><span style={t.bdKey}>ロック解除</span><span style={t.bdVal}>{mig0192On() ? "左の表の「解除」・PIN の再設定・または時間の経過で解除" : "正しい PIN の入力・または PIN の再設定で即時解除"}</span></div>
          {isOwner ? (
            <div className="nox-actions">
              <button style={btnOn} disabled={polBusy || !polStoreId} onClick={() => void savePolicy()}>ポリシーを保存</button>
            </div>
          ) : (
            <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: 0 }}>変更は管理者のみ行えます（表示のみ）。</p>
          )}
          {polMsg && <Toast msg={polMsg} style={{ margin: 0 }} />}
        </div>
        <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0" }}>
          PIN の設定は上書きです。設定済みかどうかと失敗回数は左の表で確認できます。
        </p>
      </section>

      {/* ── PINを設定モーダル（インライン入力の置き換え・送信は同じ set_staff_pin） ── */}
      {pinTarget && (
        <Modal onClose={() => setPinTarget(null)} maxWidth={420}>
          <h3 style={h3}>{pinTarget.user_name} のPINを設定</h3>
          <p style={sub}>{storeName(pinTarget.store_id)}・{ROLE_LABEL[pinTarget.role] ?? pinTarget.role}</p>
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>新しいPIN（数字 {PIN_DIGITS_LABEL}）</span>
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
            {modalErr && <Message kind="error" style={{ margin: 0 }}>{modalErr}</Message>}
            <div className="nox-actions" style={{ display: "flex", gap: 8 }}>
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
