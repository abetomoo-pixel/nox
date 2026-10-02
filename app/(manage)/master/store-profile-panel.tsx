"use client";

// ★mig0144（店舗設定の統合 setter＝set_store_profile）: /master/business-hours の先頭に置く 2 節。
//   ① 店舗情報（owner のみ表示）: 店舗名（name・必須 1..50）／略称（short・0..20）／店舗コード（store_code・0..20）／
//      表示名（display_name・0..50）。保存は変更分だけを patch で渡す（触っていないキーは送らない）。
//   ② シフト運用: キャスト確認トグル（shift_cast_confirm・既定 OFF・裁定245-1）。owner は切替・manager は現在値のみ。
//   読みは stores の直読（RLS 越し・owner は org 全店／manager は自店 1 件）。キー無しは既定（''／false）に倒す。
//   保存後は同じ select で再取得して現値を表示。エラーは storeProfileErrJa で日本語へ。
//   配置＝保存ボタンは .nox-actions で中央（裁定244）・トグルは切替＝例外。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import StoreFlagToggle, { storeProfileErrJa } from "./store-flag-toggle";

import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
import MoneyInput from "@/components/ui/money-input";
import SegSelect from "@/components/ui/seg-select";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { PAY_TIME_BASIS_LABEL, payTimeBasisApplyNoteOf, payTimeBasisApplyOf, payTimeBasisViewOf, type PayTimeBasis, type PayTimeBasisView } from "@/lib/nox/payroll/time-basis"; // ★裁定324（0159・便 C-1）: 勤務時間の計算基準 // ★裁定317（0158・便 AB-6）: 送りの基本額（okuri_base_amount・0〜99,999 の整数・空欄＝未設定＝0 を送る）
type Store = { id: string; name: string };
type Profile = { name: string; short: string; store_code: string; display_name: string; shift_cast_confirm: boolean; customer_purpose: string; customer_retention_years: string; ar_enabled: boolean; okuri_base_amount: string; okuri_actual: boolean }; // ★0153（裁定305-11／293-4）: 利用目的・保持年数（1〜10・既定 5）
const EMPTY: Profile = { name: "", short: "", store_code: "", display_name: "", shift_cast_confirm: false, customer_purpose: "", customer_retention_years: "5", ar_enabled: false, okuri_base_amount: "", okuri_actual: false };

const secTitle: React.CSSProperties = t.cardTitle;
const input: React.CSSProperties = { ...t.input, width: "100%", padding: "8px 10px", fontSize: 13 };
const label: React.CSSProperties = { ...t.fieldLabel, display: "block", marginBottom: 4 };

export type StoreProfileSection = "profile" | "data" | "timeBasis" | "shift" | "ar";
const ALL_SECTIONS: StoreProfileSection[] = ["profile", "data", "timeBasis", "shift", "ar"];
// ★裁定330（便 MC2）: 店舗設定を 3 面（利用機能／店舗情報／データ管理）に分けるため、どの節を描くかを sections で受ける（既定＝全節＝従来どおり）。
//   profile＝店舗名・略称・店舗コード・表示名・送りの基本額／data＝顧客情報の利用目的・保持年数・操作ログの保持／timeBasis＝勤務時間の計算基準／shift＝キャスト確認／ar＝売掛を使う。
//   節を分けても patchOf・save・RPC は 1 文字も変えない（見えない欄は form と cur が同値＝差分に出ない）。
export default function StoreProfilePanel({ stores, isOwner, sections = ALL_SECTIONS }: { stores: Store[]; isOwner: boolean; sections?: StoreProfileSection[] }) {
  const on = (k: StoreProfileSection) => sections.includes(k);
  const [storeSel, setStoreSel] = useState(stores[0]?.id ?? "");
  const [cur, setCur] = useState<Profile>(EMPTY);   // サーバ現値
  const [form, setForm] = useState<Profile>(EMPTY); // 入力中
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // ★裁定324（0159・便 C-1）: 勤務時間の計算基準（owner／manager）＝現在値・予約値・適用日は settings_json・当店の payroll_runs の有無で 'now'／'next'
  const [tb, setTb] = useState<PayTimeBasisView>({ current: "punch", next: null, nextFrom: null });
  const [tbPick, setTbPick] = useState<PayTimeBasis>("punch");
  const [tbRuns, setTbRuns] = useState<number | null>(null);
  const [tbBusy, setTbBusy] = useState(false);
  const [tbMsg, setTbMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeSel) return;
    const supabase = createClient();
    const { data, error } = await supabase.from("stores").select("name, short, settings_json").eq("id", storeSel).single();
    if (error) { setMsg(`読み込みに失敗: ${error.message}`); return; }
    const sj = (data?.settings_json ?? {}) as Record<string, unknown>;
    const p: Profile = {
      name: typeof data?.name === "string" ? data.name : "",
      short: typeof data?.short === "string" ? data.short : "",
      store_code: typeof sj.store_code === "string" ? sj.store_code : "",
      display_name: typeof sj.display_name === "string" ? sj.display_name : "",
      shift_cast_confirm: sj.shift_cast_confirm === true,
      customer_purpose: typeof sj.customer_purpose === "string" ? sj.customer_purpose : "", // ★0153
      customer_retention_years: typeof sj.customer_retention_years === "number" ? String(sj.customer_retention_years) : "5", // ★0153: 既定 5
      okuri_base_amount: typeof sj.okuri_base_amount === "number" && sj.okuri_base_amount > 0 ? String(sj.okuri_base_amount) : "", // ★裁定317: 0／キー無し＝未設定
      okuri_actual: sj.okuri_mode === "actual",
      ar_enabled: sj.ar_enabled === true, // ★0155（裁定309-1）: 既存店は 0155 で true・新規店はキー無し＝false（サーバの ar_policy_ok と同じ既定）
    };
    setCur(p); setForm(p); setLoaded(true);
    const v = payTimeBasisViewOf(sj); setTb(v); setTbPick(v.next ?? v.current); setTbMsg(null); // ★324
    const { count } = await supabase.from("payroll_runs").select("id", { count: "exact", head: true }).eq("store_id", storeSel); // ★324: runs の有無（新規 fetch はこの 1 回）
    setTbRuns(count ?? 0);
  }, [storeSel]);
  useEffect(() => { void load(); }, [load]);

  // 変更分だけを patch に（trim 後の比較・空欄は '' のまま送る＝short は RPC 側で null 化）
  const patchOf = (): Record<string, string | number> => {
    const out: Record<string, string | number> = {};
    for (const k of ["name", "short", "store_code", "display_name", "customer_purpose"] as const) {
      const v = form[k].trim();
      if (v !== cur[k]) out[k] = v;
    }
    // ★0153（裁定305-11）: 保持年数は整数 1〜10（数値で送る＝RPC は 'bad type'／'bad customer_retention_years' で二段）
    if (form.customer_retention_years.trim() !== cur.customer_retention_years) out.customer_retention_years = Number(form.customer_retention_years);
    // ★裁定317（便 AB-6）: 送りの基本額は数値で送る（空欄＝0＝未設定）。送りの方式が一律の店は欄が非活性＝差分が出ない
    if (form.okuri_base_amount !== cur.okuri_base_amount) out.okuri_base_amount = form.okuri_base_amount === "" ? 0 : Number(form.okuri_base_amount);
    return out;
  };
  const dirty = Object.keys(patchOf()).length > 0;

  async function save() {
    const patch = patchOf();
    if (!Object.keys(patch).length) { setMsg("変更がありません"); return; }
    if ("name" in patch && (String(patch.name).length < 1 || String(patch.name).length > 50)) { setMsg("店舗名は 1〜50 文字で入力してください"); return; }
    if ("customer_retention_years" in patch && (!Number.isInteger(patch.customer_retention_years) || (patch.customer_retention_years as number) < 1 || (patch.customer_retention_years as number) > 10)) { setMsg("保持年数は 1〜10 の整数で入力してください"); return; }
    if ("customer_purpose" in patch && String(patch.customer_purpose).length > 200) { setMsg("利用目的は 200 文字までです"); return; }
    if ("okuri_base_amount" in patch && (!Number.isInteger(patch.okuri_base_amount) || (patch.okuri_base_amount as number) < 0 || (patch.okuri_base_amount as number) > 99999)) { setMsg("送りの基本額は 0〜99,999 の整数で入力してください"); return; }
    setBusy(true); setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeSel, p_patch: patch });
    setBusy(false);
    if (error) { setMsg(`保存に失敗: ${storeProfileErrJa(error.message)}`); return; }
    setMsg("店舗情報を保存しました");
    await load();
  }

  // ★裁定324（0159・便 C-1）: set_store_pay_time_basis(p_store_id, p_value, p_apply)＝runs 0 行は 'now'・1 行以上は 'next'（次の暦月の 1 日から）
  async function saveTimeBasis() {
    if (tbBusy || tbRuns === null) return;
    setTbBusy(true); setTbMsg(null);
    const supabase = createClient();
    const apply = payTimeBasisApplyOf(tbRuns);
    const { error } = await supabase.rpc("set_store_pay_time_basis", { p_store_id: storeSel, p_value: tbPick, p_apply: apply });
    setTbBusy(false);
    if (error) { setTbMsg(`保存に失敗: ${rpcErrJa(error.message)}`); return; }
    setTbMsg(apply === "now" ? `勤務時間の計算基準を「${PAY_TIME_BASIS_LABEL[tbPick]}」にしました` : `勤務時間の計算基準を次の期から「${PAY_TIME_BASIS_LABEL[tbPick]}」にしました`);
    await load();
  }

  const field = (k: "name" | "short" | "store_code" | "display_name" | "customer_purpose", lbl: string, max: number, hint: string) => (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={label}>{lbl}<span style={{ fontWeight: 400, marginLeft: 6 }}>{hint}</span></span>
      <input value={form[k]} maxLength={max} disabled={busy || !loaded}
        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} style={input} aria-label={lbl} />
    </label>
  );

  return (
    <>
      {isOwner && (on("profile") || on("data")) && (
        <section className="nox-cardtop" style={t.card}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <h2 style={{ ...secTitle, margin: 0 }}>{on("profile") ? "店舗情報" : "データ管理"}</h2>
              <p style={{ ...t.sub, fontSize: 12, margin: "4px 0 0" }}>店舗名・略称・店舗コード・表示名・顧客情報の利用目的と保持年数・送りの基本額。変更した項目だけを保存します（オーナーのみ）。</p>
            </div>
            {stores.length > 1 && (
              <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} style={{ ...input, width: "auto" }} aria-label="店舗">
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {on("profile") && field("name", "店舗名", 50, "必須・50 文字まで")}
            {on("profile") && field("short", "略称", 20, "20 文字まで")}
            {on("profile") && field("store_code", "店舗コード", 20, "20 文字まで")}
            {on("profile") && field("display_name", "表示名", 50, "50 文字まで")}
            {/* ★0153（裁定305-11／293-4）: 顧客情報の利用目的（200 文字）・保持年数（1〜10・既定 5＝最終来店日＋年数が retention_until）→ ★MC2: データ管理の面（sections に "data"） */}
            {on("data") && field("customer_purpose", "顧客情報の利用目的", 200, "200 文字まで・顧客への説明に使います")}
            {on("data") && <label style={{ display: "block", minWidth: 0 }}>
              <span style={label}>顧客情報の保持年数<span style={{ fontWeight: 400, marginLeft: 6 }}>1〜10 年・既定 5（最終来店日から）</span></span>
              <input type="number" min={1} max={10} step={1} inputMode="numeric" value={form.customer_retention_years} disabled={busy || !loaded}
                onChange={(e) => setForm((f) => ({ ...f, customer_retention_years: e.target.value }))} style={input} aria-label="顧客情報の保持年数" />
            </label>}
            {/* ★裁定317（0158・便 AB-6）: 送りの基本額＝退勤の「送り あり」で記録する 1 回分の金額。送りの方式が実費の店だけ入力できる */}
            {on("profile") && <label style={{ display: "block", minWidth: 0 }}>
              <span style={label}>送りの基本額<span style={{ fontWeight: 400, marginLeft: 6 }}>{form.okuri_actual ? "0〜99,999・空欄は未設定（店が締めで金額を決めます）" : "送りの方式が「一律」の店では使いません"}</span></span>
              <MoneyInput value={form.okuri_base_amount} disabled={busy || !loaded || !form.okuri_actual} width="100%" style={{ padding: "8px 10px", fontSize: 13 }} ariaLabel="送りの基本額"
                onChange={(v) => setForm((f) => ({ ...f, okuri_base_amount: v.slice(0, 5) }))} />
              {!form.okuri_actual && loaded && <span style={{ display: "block", fontSize: 11.5, color: "var(--sub)", marginTop: 4 }}>送りの方式は「マスタ › キャスト・報酬 › 控除・送り」で切り替えます</span>}
            </label>}
            {/* ★MC2: データ管理の面には操作ログの保持（7 年固定）の注記を同じカードに */}
            {on("data") && !on("ar") && (
              <p style={{ fontSize: 12, color: "var(--sub)", margin: 0, lineHeight: 1.7, gridColumn: "1 / -1" }}>
                操作ログの保持: <b style={{ color: "var(--v2-text)" }}>7 年（固定）</b>。7 年を過ぎた操作ログは運用者が定期的に削除し、削除した件数と期間だけが記録に残ります（裁定309-2）。
              </p>
            )}
          </div>
          {msg && (
            <Toast msg={msg} style={{ margin: "10px 0 0" }} />
          )}
          <div className="nox-actions" style={{ marginTop: 12 }}>
            <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || !dirty} onClick={() => { setForm(cur); setMsg(null); }}>元に戻す</button>
            <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || !dirty || !loaded} onClick={() => void save()}>{on("profile") ? "店舗情報を保存" : "データ管理を保存"}</button>
          </div>
        </section>
      )}

      {/* ★裁定324（0159・便 C-1）: 勤務時間の計算基準（owner／manager）＝店舗情報カードの隣。2 択＝実打刻（既定）／確定シフトどおり。
          当店に給与の計算期間（payroll_runs）が無ければ即時（'now'）・あれば次の暦月の 1 日から（'next'）＝「M/1 から適用（現在: 実打刻）」を表示 */}
      {on("timeBasis") && <section className="nox-cardtop" style={t.card}>
        <h2 style={{ ...secTitle, margin: "0 0 4px" }}>勤務時間の計算基準</h2>
        <p style={{ ...t.sub, fontSize: 12, margin: "0 0 10px" }}>時給部分の勤務時間を「実打刻」で計算するか「確定シフトどおり」で計算するかの店設定です。確定シフトどおりの店では、遅刻・早上がりの分が不就労控除（委託は報酬調整）として給与に載ります。切替は次の給与期の初日から（給与の計算期間がまだ無い店は即時）。</p>
        {loaded && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13 }}>現在: <b>{PAY_TIME_BASIS_LABEL[tb.current]}</b></span>
              {payTimeBasisApplyNoteOf(tb, new Date().toISOString().slice(0, 10)) && <span style={{ fontSize: 12, color: "var(--champ)", fontWeight: 700 }}>{payTimeBasisApplyNoteOf(tb, new Date().toISOString().slice(0, 10))}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              <SegSelect value={tbPick} onChange={(v) => setTbPick(v as PayTimeBasis)} options={[["punch", "実打刻"], ["shift", "確定シフトどおり"]]} />
              <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={tbBusy || tbRuns === null || tbPick === (tb.next ?? tb.current)} onClick={() => void saveTimeBasis()}>
                {tbRuns === null ? "読み込み中…" : tbRuns > 0 ? "次の期から切り替える" : "この基準にする"}
              </button>
            </div>
            {tbMsg && <Toast msg={tbMsg} style={{ margin: "10px 0 0" }} />}
          </>
        )}
      </section>}

      {/* ★裁定245-1: キャスト確認の任意化（settings_json.shift_cast_confirm・既定 OFF）。shift/page.tsx が読む */}
      {on("shift") && <section className="nox-cardtop" style={t.card}>
        <h2 style={{ ...secTitle, margin: "0 0 8px" }}>シフト運用</h2>
        {loaded && (
          <StoreFlagToggle key={`${storeSel}:${cur.shift_cast_confirm}`} storeId={storeSel} flagKey="shift_cast_confirm" isOwner={isOwner}
            label="キャスト確認"
            desc="ONにすると、承認後にキャストの確認を挟みます。OFF の店は承認した時点で確定できます"
            initial={cur.shift_cast_confirm} onSaved={() => load()} />
        )}
      </section>}

      {/* ★0155（裁定309-1／309-2・便 S-1）: 売掛の店設定（settings_json.ar_enabled＝check_pay の ar 分岐が ar_policy_ok で読む）＋操作ログ保持の注記（7 年固定＝店設定にしない）。
          owner 以外は節ごと未描画（S-6）＝RPC も auth_role()<>'owner' で forbidden（表示ゲートは二重防御の外側）。 */}
      {isOwner && on("ar") && (
        <section className="nox-cardtop" style={t.card}>
          <h2 style={{ ...secTitle, margin: "0 0 8px" }}>{on("data") ? "売掛・記録の保持" : "売掛"}</h2>
          {loaded && (
            <StoreFlagToggle key={`${storeSel}:ar:${cur.ar_enabled}`} storeId={storeSel} flagKey="ar_enabled" isOwner={isOwner}
              label="売掛を使う"
              desc="OFF の店ではレジの支払方法に「売掛」が出ず、サーバ側でも売掛の入金を拒否します（既存の売掛の回収はそのまま行えます）"
              initial={cur.ar_enabled} onSaved={() => load()} />
          )}
          {on("data") && <p style={{ fontSize: 12, color: "var(--sub)", margin: "10px 0 0", lineHeight: 1.7 }}>
            操作ログの保持: <b style={{ color: "var(--v2-text)" }}>7 年（固定）</b>。7 年を過ぎた操作ログは運用者が定期的に削除し、削除した件数と期間だけが記録に残ります（店ごとの変更はできません）。
          </p>}
        </section>
      )}
    </>
  );
}
