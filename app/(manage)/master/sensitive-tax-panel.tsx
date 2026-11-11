"use client";

// 機密（本名/生年月日/マイナンバー）＋税務（雇用区分/インボイス/登録番号）の登録。
//   ■ 機密は owner 限定: get_cast_sensitive は owner/cast本人のみ（manager は封印で読めない＝T6a）。
//     real_name/birthday は上書き更新（現値を読めない manager の blind write が既存を消す事故を避けるため
//     機密編集は owner に限定）。マイナンバーは平文入力 → set_cast_sensitive が DB 内で pgp_sym 暗号化（Vault 鍵）。
//     空欄のマイナンバーは「変更なし」（既存 enc 温存）。full 平文は owner の「表示」（service 経路・全件 audit）のみ。
//   ■ 税務は manager+: cast_tax_profiles はパターン2（manager+ 可視）。
//
// ★M-11a（2026-08-27）: モックの2カラム構成へ追随
//   （上=バナー／左=キャスト機密情報カード（本人情報＋税務設定）／右=アクセス権限＋最近の閲覧履歴）。
//   RPC・引数・検証・エラー文言は逐語で不変＝表示と配置のみ。
//   ★アクセス権限カードは A-5 の RLS/RPC 実測どおりの静的表:
//     機密（本名・生年月日・マイナンバー）= owner のみ閲覧（get_cast_sensitive）・全平文は支払調書経路のみ。
//     manager/staff は閲覧不可。税務（cast_tax_profiles）は manager+ が閲覧・編集可＝脚注で明示。
//     モックの「経理」ロールは NOX に無い＝出さない（M-10 C-3 でモック側を是正）。
import { useCallback, useEffect, useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import DatePicker from "@/components/ui/date-picker"; // ★便 A M-80 追記③: 生年月日は共通ピッカー
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
import Modal from "@/components/ui/modal"; // ★0155（裁定309-3・便 S-3）: 廃棄の確認ダイアログ
import { rpcErrJa } from "@/lib/nox/ui/rpc-err"; // ★0155: 'no mynumber'／'bad reason'／'forbidden' の日本語化
import { mig0183On, mig0188On, mig0193On } from "@/lib/nox/rules-0175/flag"; // ★裁定432 ★F193-4
import { WITHHOLDING_ADVICE_NOTE, WITHHOLDING_KIND_LABEL, WITHHOLDING_KIND_SELECT_NOTE, WITHHOLDING_KIND_SHORT, PAYMENT_REPORT_NOTE, withholdingKindChoices, withholdingKindOf, defaultWithholdingKindOf } from "@/lib/nox/payroll/withholding-kind"; // ★裁定432 ★0188（裁定434）: 4 区分＋注記
import { errJa } from "@/lib/nox/errors"; // ★裁定467（M-126）: 利用者向けの文言は辞書 1 本
type Cast = { id: string; name: string };
type Store = { id: string; name: string };

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const label: React.CSSProperties = { fontSize: 12, color: "var(--sub)", display: "block" };
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 2 };
const subP: React.CSSProperties = { fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px" };

/** 相対時刻（N分前／N時間前／N日前／それ以前は M/D） */
function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}日前`;
  const dt = new Date(iso);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

const ROLE_LABEL: Record<string, string> = { owner: "管理者", manager: "店長", staff: "スタッフ" };

// ★F193-4（0193・相談役 11/04 承認・2026-11-04 実装）: 店長にも機密の入力欄を開く。
//   店長（自店）＝本名・生年月日・住所・電話・振込先の入力と閲覧（get／set_cast_sensitive_ext・get／set_cast_sensitive は 0193 で店長 自店 可）・
//   マイナンバーは入力のみ（set_cast_sensitive）と末尾 4 桁の確認（get_cast_mynumber_masked）。全桁の表示（/api/cast/mynumber）・廃棄・支払調書は管理者のまま。
//   閲覧履歴の節は管理者のまま。フラグ false では従来どおり管理者だけ。
const EXT_KEYS = ["address", "phone", "bank_name", "bank_branch", "bank_account_type", "bank_account_no", "bank_account_holder_kana"] as const;
type ExtKey = typeof EXT_KEYS[number];
type Ext = Record<ExtKey, string>;
const EXT_EMPTY: Ext = { address: "", phone: "", bank_name: "", bank_branch: "", bank_account_type: "", bank_account_no: "", bank_account_holder_kana: "" };
const BANK_TYPE_LABEL: Record<string, string> = { ordinary: "普通", checking: "当座", savings: "貯蓄" };

export default function SensitiveTaxPanel({ casts, stores, isOwner, isManager = false }: { casts: Cast[]; stores: Store[]; isOwner: boolean; isManager?: boolean }) {
  const supabase = createClient();
  const [castId, setCastId] = useState(casts[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const canSensitive = isOwner || (mig0193On() && isManager); // ★F193-4: 店長（自店）も機密の入力欄を見る

  // 機密（owner のみ → ★F193-4: canSensitive）
  const [realName, setRealName] = useState("");
  // ★F193-4: 住所・電話・振込先（0193 の列・patch＝変わった項目だけ送る）と末尾 4 桁
  const [ext, setExt] = useState<Ext>(EXT_EMPTY);
  const [extCur, setExtCur] = useState<Ext>(EXT_EMPTY);
  const [masked, setMasked] = useState<string | null>(null);
  const [birthday, setBirthday] = useState("");
  const [mynumber, setMynumber] = useState(""); // 平文入力・空=変更なし（保存後は必ずクリア）
  const [mynumberSet, setMynumberSet] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null); // 支払調書・一時表示
  // ★0155（裁定309-3・便 S-3）: 廃棄（cast_mynumber_discard＝owner のみ・理由必須 ≤200）＋廃棄済み表示（audit_logs の 'cast_mynumber_discard'＝cast_sensitive は grant 0 ゆえ列を直読しない）
  const [discarded, setDiscarded] = useState<{ at: string; method: string } | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const [discardBusy, setDiscardBusy] = useState(false);
  // 読込成功フラグ。set_* は real_name/birthday/mode/invoice/reg_no を無条件上書きするため、
  // 「現在の cast の現値を確かに読めた」ときだけ保存を許可＝読込エラー時に別 cast の残値を blind write する事故を封じる。
  const [sensitiveReady, setSensitiveReady] = useState(false);
  const [taxReady, setTaxReady] = useState(false);

  // 税務（manager+）
  const [mode, setMode] = useState("委託");
  // ★裁定432（0183 ★4・フラグ配下）: 源泉区分（""＝既定＝委託 hostess／雇用 manual）
  const [whKind, setWhKind] = useState<string>("");
  const [whKindCur, setWhKindCur] = useState<string>("");
  const [invoice, setInvoice] = useState(""); // ''=未設定
  const [regNo, setRegNo] = useState("");
  // ★0172（裁定349・便 P172）: 扶養控除等申告書（雇用＝提出あり＝甲欄／なし＝乙欄）＝cast_tax_profiles.dependents_form／_on・保存は set_cast_dependents_form（税区分の保存の後）
  const [depForm, setDepForm] = useState(false);
  const [depOn, setDepOn] = useState("");
  const [depCur, setDepCur] = useState<{ form: boolean; on: string }>({ form: false, on: "" });
  // mig0073: 登録の効力期間・通知受領日。★本パネルに入力 UI は持たない（編集は payroll のインボイス欄）が、
  //   set_cast_tax_profile は upsert で excluded を無条件代入するため、読んだ現値をそのまま送り返さないと
  //   ここから保存した瞬間に3日付が null で消える（＝素通し必須）。
  const [regValidFrom, setRegValidFrom] = useState<string | null>(null);
  const [regValidTo, setRegValidTo] = useState<string | null>(null);
  const [regNotifiedOn, setRegNotifiedOn] = useState<string | null>(null);
  // E8-5 staff#8: 機微アクセスの閲覧履歴（audit_logs は記録済み＝読取追加のみ・owner 限定表示・直近10件）
  // ★M-11a: actor→ロール名・store_id→店舗名・target→キャスト名の写像を足す（読取のみ）。
  const [viewAudit, setViewAudit] = useState<{ id: string; action: string; target: string; at: string; actor_user_id: string | null; store_id: string | null }[]>([]);
  const [roleByUser, setRoleByUser] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isOwner) return;
    let alive = true;
    void supabase.from("audit_logs").select("id, action, target, at, actor_user_id, store_id")
      .in("action", ["read_cast_sensitive", "read_cast_mynumber_masked"])
      .order("at", { ascending: false }).limit(10)
      .then(({ data }) => { if (alive) setViewAudit((data ?? []) as typeof viewAudit); });
    void supabase.from("memberships").select("user_id, role, is_active")
      .then(({ data }) => {
        if (!alive) return;
        const m: Record<string, string> = {};
        for (const r of (data ?? []) as { user_id: string; role: string; is_active: boolean }[]) {
          if (r.is_active && !m[r.user_id]) m[r.user_id] = r.role;
        }
        setRoleByUser(m);
      });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const load = useCallback(async () => {
    setMsg(null);
    setRevealed(null);
    setMynumber("");
    // cast 切替時・読込前に必ず初期化＝直前 cast の値が残って別 cast に上書き保存される事故を防ぐ。
    setRealName(""); setBirthday(""); setMynumberSet(false); setDiscarded(null); setDiscardOpen(false); setDiscardReason("");
    setExt(EXT_EMPTY); setExtCur(EXT_EMPTY); setMasked(null); // ★F193-4
    setMode("委託"); setInvoice(""); setRegNo("");
    setSensitiveReady(false); setTaxReady(false);
    if (!castId) return;
    // 機密の読み戻しは owner のみ（manager は get_cast_sensitive で forbidden＝封印）→ ★F193-4: 0193 の後は店長（自店）も＝get_cast_sensitive_ext（1 つの jsonb・住所・電話・振込先も）。成功時のみ ready＝保存可。
    if (canSensitive) {
      const { data: s, error: eS } = mig0193On()
        ? await supabase.rpc("get_cast_sensitive_ext", { p_cast_id: castId })
        : await supabase.rpc("get_cast_sensitive", { p_cast_id: castId });
      if (eS) { setMsg(`機密読込エラー: ${eS.message}（もう一度キャストを選択してください）`); }
      else {
        const row = (mig0193On() ? (s ?? {}) : (s ?? [])[0]) as ({ real_name?: string | null; birthday?: string | null; mynumber_set?: boolean } & Partial<Record<ExtKey, string | null>>) | undefined;
        setRealName(row?.real_name ?? "");
        setBirthday(row?.birthday ?? "");
        setMynumberSet(row?.mynumber_set === true);
        if (mig0193On()) { const e = { ...EXT_EMPTY }; for (const k of EXT_KEYS) e[k] = row?.[k] ?? ""; setExt(e); setExtCur(e); }
        setSensitiveReady(true);
        // ★0156（起票85・便 V-7）: 廃棄記録は cast_mynumber_discard_status（owner／manager 自店／cast 本人・audit なし・値を返さない）から読む（0155 便 S の audit_logs 読取を置換・+1）
        const { data: ds } = await supabase.rpc("cast_mynumber_discard_status", { p_cast_id: castId });
        const d0 = ((ds ?? []) as { mynumber_deleted_at: string | null; mynumber_deletion_method: string | null; has_mynumber: boolean }[])[0];
        setDiscarded(d0?.mynumber_deleted_at ? { at: d0.mynumber_deleted_at, method: d0.mynumber_deletion_method ?? "overwrite_null" } : null);
      }
    }
    // 税務（cast_tax_profiles はパターン2＝manager+ 可視・直 SELECT で現状を読む）。成功時のみ ready。
    const { data: t, error: eT } = await supabase.from("cast_tax_profiles")
      .select("mode, invoice, reg_no, reg_valid_from, reg_valid_to, reg_notified_on, dependents_form, dependents_form_on").eq("cast_id", castId).maybeSingle(); // ★0172: +扶養申告書
    if (eT) { setMsg((prev) => prev ?? `税務読込エラー: ${errJa(eT.message)}（もう一度キャストを選択してください）`); }
    else {
      setMode((t?.mode as string) ?? "委託");
      setInvoice((t?.invoice as string) ?? "");
      setRegNo((t?.reg_no as string) ?? "");
      setRegValidFrom((t?.reg_valid_from as string | null) ?? null);
      setRegValidTo((t?.reg_valid_to as string | null) ?? null);
      setRegNotifiedOn((t?.reg_notified_on as string | null) ?? null);
      { const f = t?.dependents_form === true; const on = (t?.dependents_form_on as string | null) ?? ""; setDepForm(f); setDepOn(on); setDepCur({ form: f, on }); } // ★0172
      setTaxReady(true);
    }
    if (mig0183On()) { const { data: wk } = await supabase.from("cast_tax_profiles").select("withholding_kind").eq("cast_id", castId).maybeSingle(); const v = ((wk?.withholding_kind as string | null) ?? ""); setWhKind(v); setWhKindCur(v); } // ★裁定432
  }, [castId, canSensitive, supabase]); // ★F193-4: 読取の条件は canSensitive

  useEffect(() => { void load(); }, [load]);

  async function saveSensitive() {
    setMsg(null);
    const p_mynumber = mynumber.trim() === "" ? null : mynumber.trim();
    if (p_mynumber !== null && !/^\d{12}$/.test(p_mynumber)) { setMsg("マイナンバーは数字12桁で入力してください"); return; }
    const { error } = await supabase.rpc("set_cast_sensitive", {
      p_cast_id: castId,
      p_real_name: realName.trim() === "" ? null : realName.trim(),
      p_birthday: birthday === "" ? null : birthday,
      p_mynumber, // 空=変更なし（既存 enc 温存）
    });
    if (error) { setMsg(`機密保存エラー: ${errJa(error.message)}`); return; }
    // ★F193-4: 住所・電話・振込先＝変わった項目だけ patch（空＝null で消す・口座番号は数字 8 桁まで＝RPC の鏡）
    if (mig0193On()) {
      const patch: Partial<Record<ExtKey, string | null>> = {};
      for (const k of EXT_KEYS) if (ext[k].trim() !== extCur[k].trim()) patch[k] = ext[k].trim() === "" ? null : ext[k].trim();
      if (patch.bank_account_no && !/^\d{1,8}$/.test(patch.bank_account_no)) { setMsg("口座番号は数字 8 桁までで入力してください"); return; }
      if (Object.keys(patch).length > 0) {
        const { error: eX } = await supabase.rpc("set_cast_sensitive_ext", { p_cast_id: castId, p_patch: patch });
        if (eX) { setMsg(`住所・振込先の保存エラー: ${rpcErrJa(eX.message)}`); return; }
      }
    }
    setMynumber("");
    setMsg("機密情報を保存しました");
    void load();
  }

  // ★F193-4: 末尾 4 桁（get_cast_mynumber_masked＝本人・管理者・自店の店長・閲覧は記録）。全桁は管理者の「表示」（/api/cast/mynumber）のまま
  async function revealMasked() {
    setMsg(null); setMasked(null);
    const { data, error } = await supabase.rpc("get_cast_mynumber_masked", { p_cast_id: castId });
    if (error) { setMsg(`末尾 4 桁の表示エラー: ${rpcErrJa(error.message)}`); return; }
    setMasked((data as string | null) ?? "（未登録）");
  }

  async function saveTax() {
    setMsg(null);
    const p_reg_no = regNo.trim() === "" ? null : regNo.trim();
    if (p_reg_no !== null && !/^T\d{13}$/.test(p_reg_no)) { setMsg("登録番号は T＋数字13桁（例 T1234567890123）で入力してください"); return; }
    const { error } = await supabase.rpc("set_cast_tax_profile", {
      p_cast_id: castId,
      p_mode: mode,
      p_invoice: invoice === "" ? null : invoice,
      p_reg_no,
      // mig0073: 読んだ現値をそのまま返す（本パネルは3日付を編集しない＝素通しで消さない）
      p_reg_valid_from: regValidFrom,
      p_reg_valid_to: regValidTo,
      p_reg_notified_on: regNotifiedOn,
    });
    if (error) { setMsg(`税務保存エラー: ${errJa(error.message)}`); return; }
    // ★0172（裁定349）: 扶養控除等申告書＝雇用のときだけ・変わったときだけ（set_cast_dependents_form＝owner∨manager 自店・税区分の行が先）
    if (mode === "雇用" && (depForm !== depCur.form || (depForm && (depOn || "") !== depCur.on))) {
      const { error: eD } = await supabase.rpc("set_cast_dependents_form", { p_cast_id: castId, p_submitted: depForm, p_on: depForm && depOn ? depOn : null });
      if (eD) { setMsg(`扶養申告書の保存エラー: ${errJa(eD.message)}`); void load(); return; }
    }
    // ★裁定432 ①: 源泉区分＝変わったときだけ（set_withholding_kind＝店長以上・"" は既定に戻す）
    if (mig0183On() && whKind !== whKindCur) {
      const { error: eK } = await supabase.rpc("set_withholding_kind", { p_subject_kind: "cast", p_subject_id: castId, p_kind: whKind === "" ? null : whKind });
      if (eK) { setMsg(`源泉区分の保存エラー: ${eK.message}`); void load(); return; }
    }
    setMsg("税務情報を保存しました");
    void load();
  }

  async function reveal() {
    setMsg(null);
    setRevealed(null);
    const res = await fetch("/api/cast/mynumber", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ castId }),
    });
    const j = await res.json();
    if (!res.ok) { setMsg(`表示エラー(${res.status}): ${j.error ?? ""}`); return; }
    setRevealed(j.mynumber ?? "（未登録）");
  }

  // ★0155（裁定309-3・便 S-3）: 廃棄（owner のみ・理由必須・成功後は再読取＝mynumber_set false＋廃棄済み表示）
  async function discardMynumber() {
    if (!castId || discardReason.trim() === "") return;
    setDiscardBusy(true); setMsg(null);
    const { error } = await supabase.rpc("cast_mynumber_discard", { p_cast_id: castId, p_reason: discardReason.trim() });
    setDiscardBusy(false);
    if (error) { setMsg(`廃棄に失敗: ${rpcErrJa(error.message)}`); return; }
    setDiscardOpen(false); setDiscardReason("");
    setMsg("マイナンバーを廃棄しました（暗号文を消去し、廃棄の記録を残しました）");
    await load();
  }

  // 閲覧履歴の写像（target='cast_sensitive:<cast_id>'＝A-6 実測）。
  const castNameOf = (target: string): string => {
    const id = target.split(":")[1] ?? "";
    return casts.find((c) => c.id === id)?.name ?? "キャスト";
  };
  const storeNameOf = (id: string | null): string => (id && stores.find((s) => s.id === id)?.name) ?? "—";
  const actorLabel = (uid: string | null): string => {
    const role = uid ? roleByUser[uid] : undefined;
    return role ? (ROLE_LABEL[role] ?? role) : "—";
  };
  // 同一 actor×target が1分以内に連続する行は1行へ畳む（×N）。
  const folded: Array<{ row: (typeof viewAudit)[number]; n: number }> = [];
  for (const a of viewAudit) {
    const last = folded[folded.length - 1];
    if (last && last.row.actor_user_id === a.actor_user_id && last.row.target === a.target
      && Math.abs(new Date(last.row.at).getTime() - new Date(a.at).getTime()) <= 60_000) {
      last.n += 1;
    } else {
      folded.push({ row: a, n: 1 });
    }
  }

  if (casts.length === 0) return null;

  return (
    <div>
      {/* ── 上部バナー ── */}
      <div style={{ ...t.alert, display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ minWidth: 0 }}>
          <b>機密情報へのアクセスは監査ログに記録されます</b>
          <span style={{ display: "block", fontSize: 11, opacity: 0.85 }}>{mig0193On() ? "マイナンバーの全桁の表示・廃棄と支払調書は管理者のみ。店長は自店のキャストの本名・住所・電話・振込先を入力でき、マイナンバーは入力と末尾 4 桁の確認だけです。" : "マイナンバーの表示・変更は管理者権限のみ実行できます。"}</span>{/* ★F193-4 */}
        </span>
      </div>

      <div className="nox-2col nox-2col--32">
        {/* ── 左: キャスト機密情報（本人情報＋税務設定） ── */}
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>
              <h3 style={h3}>キャスト機密情報</h3>
              <p style={{ ...subP, margin: 0 }}>本人確認・支払調書作成に使用</p>
            </span>
            <select value={castId} onChange={(e) => setCastId(e.target.value)} style={{ ...input, minWidth: 160, marginLeft: "auto" }} aria-label="キャスト">
              {casts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {msg && <Toast msg={msg} style={{ marginTop: 8 }} />}

          {/* 本人情報（owner のみ・manager は封印で読めないため非表示）→ ★F193-4: 0193 の後は店長（自店）も */}
          {canSensitive && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)", margin: "0 0 8px" }}>本人情報</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={label}>本名<input value={realName} onChange={(e) => setRealName(e.target.value)} style={{ ...input, width: "100%" }} /></label>
                <label style={label}>生年月日<DatePicker value={birthday} onChange={setBirthday} ariaLabel="生年月日" width="100%" testId="cast-birthday" /></label>{/* ★便 A M-80 追記③ */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <span style={label}>マイナンバー</span>
                  {mynumberSet && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 6px", flexWrap: "wrap" }}>
                      {revealed || masked ? (
                        <span style={{ fontFamily: "monospace", fontSize: 14, background: "var(--bg2)", color: "var(--champ)", border: "1px solid var(--line2)", padding: "2px 8px", borderRadius: 4 }} data-mynumber-shown={revealed ? "full" : "masked"}>{revealed ?? masked}</span>
                      ) : (
                        <span className="num" style={{ letterSpacing: 2, color: "var(--sub)" }}>•••• •••• ••••</span>
                      )}
                      {isOwner && <button onClick={reveal} disabled={!castId} style={btnLight}>表示</button>}{/* 全桁＝管理者のみ */}
                      {mig0193On() && !isOwner && <button type="button" onClick={() => void revealMasked()} disabled={!castId} style={btnLight} data-mynumber-masked="1">末尾 4 桁</button>}{/* ★F193-4: 店長は末尾 4 桁だけ */}
                      {/* ★0155（裁定309-3・便 S-3）: 廃棄＝確認ダイアログ（理由必須 ≤200）→ cast_mynumber_discard（owner のみ・暗号文を消去し廃棄日時・実行者・方法を記録） */}
                      {isOwner && <button type="button" onClick={() => { setDiscardReason(""); setDiscardOpen(true); }} disabled={!castId || !sensitiveReady}
                        style={{ ...btnLight, color: "var(--bad)" }}>廃棄</button>}
                    </div>
                  )}
                  {!mynumberSet && discarded && (
                    <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 6px" }}>
                      廃棄済み {new Date(discarded.at).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })}（方法: {discarded.method}）
                    </p>
                  )}
                  <input value={mynumber} onChange={(e) => setMynumber(e.target.value)}
                    placeholder={mynumberSet ? "登録済み（変更する場合のみ入力）" : "未登録"} inputMode="numeric" style={{ ...input, width: "100%" }} />
                  <span style={{ fontSize: 10.5, color: "var(--sub)" }}>
                    数字12桁・入力すると暗号化保存／空欄は変更なし。表示は法定調書作成の用途に限定され、閲覧はすべて操作履歴に記録されます。
                  </span>
                </div>
              </div>
              {mig0193On() && (/* ★F193-4（0193）: 住所・電話・振込先＝管理者と自店の店長が入力・閲覧（閲覧と変更は監査に残る） */
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} data-cast-sensitive-ext="1">
                  <label style={{ ...label, gridColumn: "1 / -1" }}>住所<input value={ext.address} onChange={(e) => setExt({ ...ext, address: e.target.value })} maxLength={200} style={{ ...input, width: "100%" }} /></label>
                  <label style={label}>電話<input value={ext.phone} onChange={(e) => setExt({ ...ext, phone: e.target.value })} inputMode="tel" maxLength={200} style={{ ...input, width: "100%" }} /></label>
                  <label style={label}>銀行<input value={ext.bank_name} onChange={(e) => setExt({ ...ext, bank_name: e.target.value })} maxLength={200} style={{ ...input, width: "100%" }} /></label>
                  <label style={label}>支店<input value={ext.bank_branch} onChange={(e) => setExt({ ...ext, bank_branch: e.target.value })} maxLength={200} style={{ ...input, width: "100%" }} /></label>
                  <label style={label}>種別<SegSelect value={ext.bank_account_type} onChange={(v) => setExt({ ...ext, bank_account_type: v })} options={[["", "—"], ...Object.entries(BANK_TYPE_LABEL).map(([k, v]) => [k, v] as const)]} ariaLabel="口座の種別" /></label>{/* ★便 A M-80 追記③: 普通／当座／貯蓄 のボタン群 */}
                  <label style={label}>口座番号<input value={ext.bank_account_no} onChange={(e) => setExt({ ...ext, bank_account_no: e.target.value.replace(/[^\d]/g, "").slice(0, 8) })} inputMode="numeric" placeholder="数字 8 桁まで" style={{ ...input, width: "100%" }} /></label>
                  <label style={label}>名義（カナ）<input value={ext.bank_account_holder_kana} onChange={(e) => setExt({ ...ext, bank_account_holder_kana: e.target.value })} maxLength={200} style={{ ...input, width: "100%" }} /></label>
                </div>
              )}
              <div className="nox-actions" style={{ marginTop: 8 }}>
                <button onClick={saveSensitive} disabled={!castId || !sensitiveReady} style={btnDark}>機密情報を保存</button>
              </div>
              {discardOpen && (
                <Modal onClose={() => !discardBusy && setDiscardOpen(false)} maxWidth={460}>
                  <div className="nox-formmodal-head">
                    <strong>マイナンバーを廃棄</strong>
                    <button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={() => !discardBusy && setDiscardOpen(false)}>×</button>
                  </div>
                  <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "4px 0 10px", lineHeight: 1.7 }}>
                    暗号化されたマイナンバーを消去し、廃棄日時・実行者・方法を記録します。元に戻せません。理由は必須です（200 文字まで）。
                  </p>
                  <input value={discardReason} onChange={(e) => setDiscardReason(e.target.value)} maxLength={200} disabled={discardBusy}
                    placeholder="理由（例: 退店して番号を使う予定が無くなった）" style={{ ...input, width: "100%" }} aria-label="廃棄の理由" />
                  <div className="nox-formmodal-foot">
                    <button type="button" style={btnLight} disabled={discardBusy} onClick={() => setDiscardOpen(false)}>キャンセル</button>
                    <button type="button" style={{ ...btnDark, opacity: discardBusy || discardReason.trim() === "" ? 0.6 : 1 }} disabled={discardBusy || discardReason.trim() === ""}
                      onClick={() => void discardMynumber()}>{discardBusy ? "廃棄中…" : "廃棄する"}</button>
                  </div>
                </Modal>
              )}
            </div>
          )}

          {/* 税務設定（manager+） */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)", margin: "0 0 8px" }}>税務設定</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={label}>雇用区分<br />
                <SegSelect value={mode} onChange={(v) => setMode(v)}
                options={[["委託", "委託"], ["雇用", "雇用"]] as const} />
              </label>
              {mig0183On() && (/* ★裁定432 ①: 源泉区分（人ごと・店長以上が変更） */
                <label style={label} data-withholding-kind-select="1">源泉区分<br />
                  <select value={whKind} onChange={(e) => setWhKind(e.target.value)} style={{ ...input, width: "auto", minHeight: 40 }} aria-label="源泉区分">
                    <option value="">既定（{mode === "雇用" ? WITHHOLDING_KIND_SHORT.manual : WITHHOLDING_KIND_SHORT.hostess}）</option>
                    {withholdingKindChoices().map((k) => <option key={k} value={k}>{WITHHOLDING_KIND_LABEL[k]}</option>)}{/* ★0188（裁定434 ①）: none／hostess／other_204／manual */}
                  </select>
                  {mig0188On() && <span style={{ display: "block", fontSize: 11, color: "var(--sub)", marginTop: 2 }} data-withholding-kind-note="1">{WITHHOLDING_KIND_SELECT_NOTE}{PAYMENT_REPORT_NOTE[withholdingKindOf(whKind, defaultWithholdingKindOf({ subject: "cast", taxMode: mode }))] ? "・" + PAYMENT_REPORT_NOTE[withholdingKindOf(whKind, defaultWithholdingKindOf({ subject: "cast", taxMode: mode }))] : ""}</span>}{/* ★0188（裁定434 ②③） */}
                  <span style={{ display: "block", fontSize: 11, color: "var(--sub)", marginTop: 2 }}>{WITHHOLDING_ADVICE_NOTE}</span>
                </label>
              )}
              <label style={label}>インボイス<br />
                <SegSelect value={invoice} onChange={(v) => setInvoice(v)}
                options={[["", "未設定"], ["課税", "課税"], ["免税", "免税"]] as const} />
              </label>
              <label style={label}>登録番号（T＋13桁）<br />
                <input value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="T1234567890123" style={{ ...input, width: 160 }} />
              </label>
              {/* ★0172（裁定349・便 P172）: 雇用＝扶養控除等申告書の提出あり＝甲欄／なし＝乙欄（税額表は次のデータ更新＝源泉 0 のまま・区分だけ記録） */}
              {mode === "雇用" && (
                <label style={label} data-dependents-form="1">扶養控除等申告書<br />
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={depForm} onChange={(e) => setDepForm(e.target.checked)} aria-label="扶養控除等申告書の提出あり" />
                    <span style={{ fontSize: 12.5 }}>提出あり（{depForm ? "甲" : "乙"}欄）</span>
                    <input type="date" value={depOn} disabled={!depForm} onChange={(e) => setDepOn(e.target.value)} style={{ ...input, width: 150 }} aria-label="提出日" />
                  </span>
                </label>
              )}
            </div>
            <div className="nox-actions" style={{ marginTop: 8 }}>
              <button onClick={saveTax} disabled={!castId || !taxReady} style={btnDark}>税務情報を保存</button>
            </div>
            {!canSensitive && <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>※ 本名・マイナンバー等の機密情報の登録・閲覧は管理者のみ可能です。</p>}{/* ★F193-4: 0193 の後は店長にも入力欄が出る */}
          </div>
        </section>

        {/* ── 右: アクセス権限＋最近の閲覧履歴 ── */}
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <section className="nox-cardtop" style={card}>
            <h3 style={h3}>アクセス権限</h3>
            <p style={subP}>機密情報を閲覧できる役割（実際の権限設定に基づく表示）</p>
            <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
              <div style={t.bdRow}><span style={t.bdKey}>管理者</span>
                <span style={t.bdVal}>表示・編集・支払調書用の全表示 <b style={{ color: "var(--ok)" }}>●許可</b></span></div>
              <div style={t.bdRow}><span style={t.bdKey}>店長</span>
                {mig0193On()
                  ? <span style={t.bdVal}>自店の本名・住所・電話・振込先の表示・編集・マイナンバーは入力と末尾 4 桁 <b style={{ color: "var(--ok)" }}>●許可（自店）</b></span>
                  : <span style={t.bdVal}>閲覧不可（封印） <b style={{ color: "var(--sub)" }}>●制限</b></span>}</div>{/* ★F193-4 */}
              <div style={t.bdRow}><span style={t.bdKey}>スタッフ</span>
                <span style={t.bdVal}>閲覧不可 <b style={{ color: "var(--sub)" }}>●制限</b></span></div>
            </div>
            <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0" }}>
              {mig0193On() ? "※ マイナンバーの全桁の表示・廃棄と支払調書（全桁）は管理者だけ。店長の閲覧も操作履歴に残ります。" : "※ 税務設定（雇用区分・インボイス・登録番号）は店長も閲覧・編集できます（機密＝本名・生年月日・マイナンバーのみ封印）。"}
            </p>
          </section>

          {/* E8-5 staff#8: 閲覧履歴（記録は既存＝読取のみ・owner 限定・直近10件。全量は /audit 機微アクセスビューへ） */}
          {isOwner && folded.length > 0 && (
            <section className="nox-cardtop" style={card}>
              <h3 style={h3}>最近の閲覧履歴</h3>
              <p style={subP}>機密情報の監査ログ（直近10件）</p>
              {folded.map(({ row: a, n }) => (
                <div key={a.id} title={a.target}
                  style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11.5, padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ color: "var(--ink)" }}>
                      {castNameOf(a.target)} の機密情報を閲覧{n > 1 && <span style={{ color: "var(--v2-muted)" }}>（×{n}）</span>}
                    </b>
                    <small style={{ display: "block", color: "var(--sub)" }}>{actorLabel(a.actor_user_id)} / {storeNameOf(a.store_id)}</small>
                  </span>
                  <span className="num" style={{ marginLeft: "auto", color: "var(--v2-muted)", whiteSpace: "nowrap" }}>{relTime(a.at)}</span>
                </div>
              ))}
              <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "6px 0 0" }}>すべての履歴は「操作履歴」ページ（機微アクセスビュー）で確認できます。</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
