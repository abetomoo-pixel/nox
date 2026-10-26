"use client";

// ★mig0144（店舗設定の統合 setter＝set_store_profile）: /master/business-hours の先頭に置く 2 節。
//   ① 店舗情報（owner のみ表示）: 店舗名（name・必須 1..50）／略称（short・0..20）／店舗コード（store_code・0..20）／
//      表示名（display_name・0..50）。保存は変更分だけを patch で渡す（触っていないキーは送らない）。
//   ② シフト運用: キャスト確認トグル（shift_cast_confirm・既定 OFF・裁定245-1）。owner は切替・manager は現在値のみ。
//   読みは stores の直読（RLS 越し・owner は org 全店／manager は自店 1 件）。キー無しは既定（''／false）に倒す。
//   保存後は同じ select で再取得して現値を表示。エラーは storeProfileErrJa で日本語へ。
//   配置＝保存ボタンは .nox-actions で中央（裁定244）・トグルは切替＝例外。
import { useCallback, useEffect, useState } from "react";
import { okuriAsks, okuriModeOf } from "@/lib/nox/shift/okuri-mode"; // ★裁定414（S-4）
import OnOffSeg from "@/components/ui/on-off"; // ★便 GV-C C-9（GV-52）
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import StoreFlagToggle, { storeProfileErrJa } from "./store-flag-toggle";

import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
import MoneyInput from "@/components/ui/money-input";
import SegSelect from "@/components/ui/seg-select";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { JOIN_MODE_LABEL, PAY_FEE_KEYS, PAY_FEE_KEY_LABEL, joinModeOf, payFeeRatesOf, type JoinMode, type PayFeeKey } from "@/lib/nox/register/p173"; // ★便 P173（裁定386／393・0173）
import { PAY_TIME_BASIS_LABEL, payTimeBasisApplyNoteOf, payTimeBasisApplyOf, payTimeBasisViewOf, type PayTimeBasis, type PayTimeBasisView } from "@/lib/nox/payroll/time-basis"; // ★裁定324（0159・便 C-1）: 勤務時間の計算基準 // ★裁定317（0158・便 AB-6）: 送りの基本額（okuri_base_amount・0〜99,999 の整数・空欄＝未設定＝0 を送る）
type Store = { id: string; name: string };
// ★0164（裁定331 C 5 項目＋裁定334・便 W5-2a・2026-10-13）: 「会計と運用」節＝stores の列 7 つ（settings_json ではない）を同じ set_store_profile の patch で保存。
//   invoice_registered_on（'YYYY-MM-DD'／null）・pay_day（1〜31・表示と案内用）・tax_inclusive_display（表示だけ）・use_vip／use_counter（フロアの種別表示）・
//   payment_methods {cash,card,emoney,qr}（cash は常に true）・punch_methods {self,proxy,kiosk}（1 つ以上 true）。RPC の型検査（'bad pay_day'／'bad payment_methods'／'bad punch_methods'）が本体。
import { OPS_DEFAULT, PAYMENT_METHOD_LABEL, PUNCH_METHOD_LABEL, opsPatchErrorOf, opsPatchOf, opsProfileOf, type OpsProfile, castPunchOffOf, castPunchMethodsOf, CAST_PUNCH_OFF_NOTE } from "@/lib/nox/store/ops-profile"; // 純関数＝lib（setup page（server）と共用）
import { MID_PAY_OPTIONS, SETTLEMENT_CYCLE_OPTIONS, midPayOf, settlementCycleOf } from "@/lib/nox/payroll/settlement-cycle"; // ★0172（裁定349・便 P172）: 店設定 2 キー
import { SHIFT_AUTO_CONFIRM_OPTIONS, autoConfirmHoursOf } from "@/lib/nox/shift/auto-confirm"; // ★0172（裁定380・便 P172）: 自動確定時間
type Profile = { name: string; short: string; store_code: string; display_name: string; shift_cast_confirm: boolean; customer_purpose: string; customer_retention_years: string; ar_enabled: boolean; okuri_base_amount: string; okuri_actual: boolean; ops: OpsProfile; settlement_cycle: string; mid_pay: string; shift_auto_confirm_hours: string; join_mode: JoinMode; pay_fee: Record<PayFeeKey, string> }; // ★便 P173: join_mode（386）・pay_fee（393・％の文字列・空＝0） // ★0153（裁定305-11／293-4）: 利用目的・保持年数（1〜10・既定 5）・★0172（裁定349／380）: 精算方式・途中払い・自動確定時間
const EMPTY: Profile = { name: "", short: "", store_code: "", display_name: "", shift_cast_confirm: false, customer_purpose: "", customer_retention_years: "5", ar_enabled: false, okuri_base_amount: "", okuri_actual: false, settlement_cycle: "monthly", mid_pay: "none", shift_auto_confirm_hours: "0", ops: OPS_DEFAULT, join_mode: "join_set", pay_fee: { card: "", emoney: "", other: "" } };

const secTitle: React.CSSProperties = t.cardTitle;
const input: React.CSSProperties = { ...t.input, width: "100%", padding: "8px 10px", fontSize: 13 };
const label: React.CSSProperties = { ...t.fieldLabel, display: "block", marginBottom: 4 };

export type StoreProfileSection = "profile" | "data" | "timeBasis" | "shift" | "ar" | "ops";
const ALL_SECTIONS: StoreProfileSection[] = ["profile", "data", "timeBasis", "shift", "ar", "ops"];
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
    const { data, error } = await supabase.from("stores").select("name, short, settings_json, invoice_registered_on, pay_day, tax_inclusive_display, use_vip, use_counter, payment_methods, punch_methods").eq("id", storeSel).single(); // ★0164（便 W5-2a）: 列 7 つ
    if (error) { setMsg(`読み込みに失敗: ${error.message}`); return; }
    const sj = (data?.settings_json ?? {}) as Record<string, unknown>;
    const p: Profile = {
      ops: opsProfileOf(data as Record<string, unknown> | null), // ★0164（便 W5-2a）
      name: typeof data?.name === "string" ? data.name : "",
      short: typeof data?.short === "string" ? data.short : "",
      store_code: typeof sj.store_code === "string" ? sj.store_code : "",
      display_name: typeof sj.display_name === "string" ? sj.display_name : "",
      shift_cast_confirm: sj.shift_cast_confirm === true,
      customer_purpose: typeof sj.customer_purpose === "string" ? sj.customer_purpose : "", // ★0153
      customer_retention_years: typeof sj.customer_retention_years === "number" ? String(sj.customer_retention_years) : "5", // ★0153: 既定 5
      okuri_base_amount: typeof sj.okuri_base_amount === "number" && sj.okuri_base_amount > 0 ? String(sj.okuri_base_amount) : "", // ★裁定317: 0／キー無し＝未設定
      okuri_actual: okuriAsks(okuriModeOf(sj)), // ★裁定414: 基本額は 'none' 以外の 3 方式で使う（名前は従来のまま）
      ar_enabled: sj.ar_enabled === true, // ★0155（裁定309-1）: 既存店は 0155 で true・新規店はキー無し＝false（サーバの ar_policy_ok と同じ既定）
      settlement_cycle: settlementCycleOf(sj), mid_pay: midPayOf(sj), shift_auto_confirm_hours: String(autoConfirmHoursOf(sj)), // ★0172（裁定349／380）: 欠損＝既定（monthly／none／0）
      join_mode: joinModeOf(sj), // ★便 P173（裁定386）: 欠損＝join_set
      pay_fee: (() => { const r = payFeeRatesOf(sj); return { card: r.card ? String(r.card) : "", emoney: r.emoney ? String(r.emoney) : "", other: r.other ? String(r.other) : "" }; })(), // ★便 P173（裁定393）: 欠損＝0（空欄）
    };
    setCur(p); setForm(p); setLoaded(true);
    const v = payTimeBasisViewOf(sj); setTb(v); setTbPick(v.next ?? v.current); setTbMsg(null); // ★324
    const { count } = await supabase.from("payroll_runs").select("id", { count: "exact", head: true }).eq("store_id", storeSel); // ★324: runs の有無（新規 fetch はこの 1 回）
    setTbRuns(count ?? 0);
  }, [storeSel]);
  useEffect(() => { void load(); }, [load]);

  // 変更分だけを patch に（trim 後の比較・空欄は '' のまま送る＝short は RPC 側で null 化）
  const patchOf = (): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...opsPatchOf(form.ops, cur.ops) }; // ★0164（便 W5-2a）: 会計と運用の 7 列（変更分だけ）
    for (const k of ["name", "short", "store_code", "display_name", "customer_purpose"] as const) {
      const v = form[k].trim();
      if (v !== cur[k]) out[k] = v;
    }
    // ★0153（裁定305-11）: 保持年数は整数 1〜10（数値で送る＝RPC は 'bad type'／'bad customer_retention_years' で二段）
    if (form.customer_retention_years.trim() !== cur.customer_retention_years) out.customer_retention_years = Number(form.customer_retention_years);
    // ★裁定317（便 AB-6）: 送りの基本額は数値で送る（空欄＝0＝未設定）。送りの方式が一律の店は欄が非活性＝差分が出ない
    if (form.okuri_base_amount !== cur.okuri_base_amount) out.okuri_base_amount = form.okuri_base_amount === "" ? 0 : Number(form.okuri_base_amount);
    // ★0172（裁定349／380・便 P172）: 店設定 3 キー（文字列 2・整数 1＝set_store_profile の白名単と検証 'bad settlement_cycle'／'bad mid_pay'／'bad shift_auto_confirm_hours'）
    if (form.settlement_cycle !== cur.settlement_cycle) out.settlement_cycle = form.settlement_cycle;
    if (form.mid_pay !== cur.mid_pay) out.mid_pay = form.mid_pay;
    if (form.shift_auto_confirm_hours !== cur.shift_auto_confirm_hours) out.shift_auto_confirm_hours = Number(form.shift_auto_confirm_hours);
    // ★便 P173（裁定386／393・0173 set_store_profile 白名単）: join_mode（文字列 2 値）・pay_fee_rates（object・整数 0〜100・空欄＝0）
    if (form.join_mode !== cur.join_mode) out.join_mode = form.join_mode;
    if (PAY_FEE_KEYS.some((k) => form.pay_fee[k] !== cur.pay_fee[k])) out.pay_fee_rates = Object.fromEntries(PAY_FEE_KEYS.map((k) => [k, form.pay_fee[k].trim() === "" ? 0 : Number(form.pay_fee[k])]));
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
    // ★0164（便 W5-2a）: 会計と運用＝RPC の 'bad pay_day'／'bad payment_methods'／'bad punch_methods' と同じ条件を先回り（二重防御の外側）
    { const e = opsPatchErrorOf(patch); if (e) { setMsg(e); return; } }
    setBusy(true); setMsg(null);
    const { error } = await setStoreProfile(patch);
    setBusy(false);
    if (error) { setMsg(`保存に失敗: ${storeProfileErrJa(error.message)}`); return; }
    setMsg(on("ops") && !on("profile") && !on("data") ? "会計と運用を保存しました" : "店舗情報を保存しました");
    await load();
  }
  const setOps = (patch: Partial<OpsProfile>) => setForm((f) => ({ ...f, ops: { ...f.ops, ...patch } }));
  // ★0172（便 P172）: set_store_profile の呼び口は 1 箇所（店舗情報の保存と自動確定時間の保存が共用）
  const setStoreProfile = (patch: Record<string, unknown>) => createClient().rpc("set_store_profile", { p_store_id: storeSel, p_patch: patch });
  // ★0172（裁定380・便 P172）: 自動確定時間だけを保存（シフト運用の節は店舗情報の保存ボタンと別のタブに出る）
  async function saveShiftAuto() {
    const v = Number(form.shift_auto_confirm_hours);
    if (!Number.isInteger(v) || v < 0 || v > 168) { setMsg("自動確定時間は 0〜168 の整数で指定してください"); return; }
    setBusy(true); setMsg(null);
    const { error } = await setStoreProfile({ shift_auto_confirm_hours: v }); // ★0172: RPC の呼び口は 1 箇所（setStoreProfile＝mt(7-3) の pin）
    setBusy(false);
    if (error) { setMsg(`保存に失敗: ${storeProfileErrJa(error.message)}`); return; }
    setMsg(v > 0 ? `自動確定時間を ${v} 時間後に設定しました` : "自動確定しない設定にしました");
    await load();
  }
  const onOff = (v: boolean, lbl: string, onChange: (b: boolean) => void) => (
    <OnOffSeg value={v} onChange={(x) => onChange(x === true)} ariaLabel={lbl} />/* ★便 GV-C C-9（GV-52） */
  );

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
              <span style={label}>送りの基本額<span style={{ fontWeight: 400, marginLeft: 6 }}>{form.okuri_actual ? "0〜99,999・空欄は未設定（店が締めで金額を決めます）" : "送りの方式が「なし」の店では使いません"}</span></span>
              <MoneyInput value={form.okuri_base_amount} disabled={busy || !loaded || !form.okuri_actual} width="100%" style={{ padding: "8px 10px", fontSize: 13 }} ariaLabel="送りの基本額"
                onChange={(v) => setForm((f) => ({ ...f, okuri_base_amount: v.slice(0, 5) }))} />
              {!form.okuri_actual && loaded && <span style={{ display: "block", fontSize: 11.5, color: "var(--sub)", marginTop: 4 }}>送りの方式は「マスタ › キャスト・報酬 › 控除・送り」で切り替えます</span>}
            </label>}
            {/* ★0172（裁定349・便 P172）: 精算方式（源泉の暦日数の単位＝月次／半月／週次／日次）と途中払い（なし／前払）＝settings_json の 2 キー（set_store_profile の白名単） */}
            {on("profile") && <label style={{ display: "block", minWidth: 0 }}>
              <span style={label}>精算方式<span style={{ fontWeight: 400, marginLeft: 6 }}>源泉の計算期間（暦日数）の単位</span></span>
              <select value={form.settlement_cycle} disabled={busy || !loaded} onChange={(e) => setForm((f) => ({ ...f, settlement_cycle: e.target.value }))} style={input} aria-label="精算方式" data-settlement-cycle="1">
                {SETTLEMENT_CYCLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>}
            {/* ★便 P173（裁定386・0173）: 途中合流＝セット終了後の＋は合流セット行（既定）／延長のみ。−は引き直さない */}
            {on("profile") && <label style={{ display: "block", minWidth: 0 }}>
              <span style={label}>途中合流<span style={{ fontWeight: 400, marginLeft: 6 }}>セット終了後に人数が増えたとき</span></span>
              <select value={form.join_mode} disabled={busy || !loaded} onChange={(e) => setForm((f) => ({ ...f, join_mode: e.target.value as JoinMode }))} style={input} aria-label="途中合流" data-join-mode="1">
                {(Object.keys(JOIN_MODE_LABEL) as JoinMode[]).map((v) => <option key={v} value={v}>{JOIN_MODE_LABEL[v]}</option>)}
              </select>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--sub)", marginTop: 4 }}>セット料金は引き直しません（減った場合も同じ）。合流セット＝増えた人数分のセット料金を 1 行追加。</span>
            </label>}
            {/* ★便 P173（裁定393・0173）: 支払方法別の手数料（お客様負担）＝入金額×率・伝票に行・日報に合計 1 行・キャスト売上には含めない。既存店は欠損＝0（新規店の初期値はカード 10%） */}
            {on("profile") && <div style={{ minWidth: 0 }} data-pay-fee-rates="1">
              <span style={label}>支払方法別の手数料（お客様負担）<span style={{ fontWeight: 400, marginLeft: 6 }}>％・0 は手数料なし（モーダルに出ません）</span></span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 4 }}>
                {PAY_FEE_KEYS.map((k) => (
                  <label key={k} style={{ display: "block", minWidth: 0, fontSize: 12 }}>{PAY_FEE_KEY_LABEL[k]}
                    <input type="number" min={0} max={100} step={1} inputMode="numeric" value={form.pay_fee[k]} disabled={busy || !loaded} aria-label={`${PAY_FEE_KEY_LABEL[k]}の手数料率`}
                      onChange={(e) => setForm((f) => ({ ...f, pay_fee: { ...f.pay_fee, [k]: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) } }))} style={{ ...input, marginTop: 2 }} placeholder="0" />
                  </label>
                ))}
              </div>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--sub)", marginTop: 4 }}>店負担のカード決済手数料（経費の見込み）は「会計ルール」の率で別に集計します。</span>
            </div>}
            {on("profile") && <label style={{ display: "block", minWidth: 0 }}>
              <span style={label}>途中払い<span style={{ fontWeight: 400, marginLeft: 6 }}>前払（仮払）は控除なし＝期の精算で控除</span></span>
              <select value={form.mid_pay} disabled={busy || !loaded} onChange={(e) => setForm((f) => ({ ...f, mid_pay: e.target.value }))} style={input} aria-label="途中払い" data-mid-pay="1">
                {MID_PAY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>}
            {/* ★MC2: データ管理の面には操作ログの保持（7 年固定）の注記を同じカードに */}
            {on("data") && !on("ar") && (
              <p style={{ fontSize: 12, color: "var(--sub)", margin: 0, lineHeight: 1.7, gridColumn: "1 / -1" }}>
                操作ログの保持: <b style={{ color: "var(--v2-text)" }}>7 年（固定）</b>。7 年を過ぎた操作ログは運用者が定期的に削除し、削除した件数と期間だけが記録に残ります。
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

      {/* ★0164（裁定331 C 5 項目＋裁定334・便 W5-2a）: 会計と運用＝stores の列 7 つを set_store_profile の patch で保存（owner のみ＝RPC と同じ）。
          インボイス登録日（印字判定は receipt 側＝W5-3）／支払日（締め日は月末固定＝334・表示と案内用）／内税表示（表示だけ・計算不変）／
          フロア（VIP・カウンターの種別表示＝register／seats が読む・既存の席は残る）／支払い方法（レジのボタン出し分け・現金は常に ON）／打刻方法（1 つ以上・RPC は拒否しない） */}
      {isOwner && on("ops") && (
        <section className="nox-cardtop" style={t.card} aria-label="会計と運用">
          <h2 style={{ ...secTitle, margin: "0 0 4px" }}>会計と運用</h2>
          <p style={{ ...t.sub, fontSize: 12, margin: "0 0 10px" }}>インボイス登録日・給与の支払日・消費税の表示・フロアの席種・レジの支払い方法・打刻方法。計算は変わらず、表示と出し分けだけが変わります。</p>
          {loaded && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={label}>インボイス登録日<span style={{ fontWeight: 400, marginLeft: 6 }}>登録日より前の会計には登録番号を印字しません・空欄＝未登録</span></span>
                <input type="date" value={form.ops.invoice_registered_on} disabled={busy} onChange={(e) => setOps({ invoice_registered_on: e.target.value })} style={input} aria-label="インボイス登録日" />
              </label>
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={label}>給与の支払日<span style={{ fontWeight: 400, marginLeft: 6 }}>翌月 1〜31 日・締め日は月末固定・表示と案内に使います</span></span>
                <input type="number" min={1} max={31} step={1} inputMode="numeric" value={form.ops.pay_day} disabled={busy} onChange={(e) => setOps({ pay_day: e.target.value })} style={input} aria-label="給与の支払日" />
              </label>
              <div style={{ minWidth: 0 }}>
                <span style={label}>消費税の表示<span style={{ fontWeight: 400, marginLeft: 6 }}>ON＝内税で表示（計算は変わりません）</span></span>
                {onOff(form.ops.tax_inclusive_display, "消費税の表示（内税）", (b) => setOps({ tax_inclusive_display: b }))}
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={label}>フロア<span style={{ fontWeight: 400, marginLeft: 6 }}>OFF の席種はレジの卓席と席マスタの選択肢に出しません（登録済みの席は残ります）</span></span>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>VIP {onOff(form.ops.use_vip, "VIP 席を使う", (b) => setOps({ use_vip: b }))}</span>
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>カウンター {onOff(form.ops.use_counter, "カウンターを使う", (b) => setOps({ use_counter: b }))}</span>
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={label}>お客様の支払い方法<span style={{ fontWeight: 400, marginLeft: 6 }}>レジの入金ボタンに出すもの・現金は常に ON</span></span>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12.5 }}>
                  {PAYMENT_METHOD_LABEL.map(([k, l]) => (
                    <label key={k} style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                      <input type="checkbox" checked={form.ops.payment_methods[k]} disabled={busy || k === "cash"} aria-label={`支払い方法 ${l}`}
                        onChange={(e) => setOps({ payment_methods: { ...form.ops.payment_methods, [k]: e.target.checked, cash: true } })} />{l}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={label}>キャストの打刻</span>{/* ★便 X13-G W-23: 使う／使わない（店が勤怠を記録）＝下の打刻方法（punch_methods）の組合せ */}
                <div style={{ margin: "0 0 8px" }} data-cast-punch="1">
                  <SegSelect value={castPunchOffOf(form.ops.punch_methods) ? "off" : "on"} onChange={(v) => setOps({ punch_methods: castPunchMethodsOf(v === "on", form.ops.punch_methods) })}
                    options={[["on", "使う"], ["off", "使わない（店が勤怠を記録）"]] as const} disabled={busy} ariaLabel="キャストの打刻" />
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--sub)", marginTop: 4, lineHeight: 1.7 }}>{CAST_PUNCH_OFF_NOTE}</span>
                </div>
                <span style={label}>出退勤の打刻<span style={{ fontWeight: 400, marginLeft: 6 }}>使う方法を 1 つ以上・OFF は導線を出しません</span></span>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12.5 }}>
                  {PUNCH_METHOD_LABEL.map(([k, l]) => (
                    <label key={k} style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                      <input type="checkbox" checked={form.ops.punch_methods[k]} disabled={busy} aria-label={`打刻方法 ${l}`}
                        onChange={(e) => setOps({ punch_methods: { ...form.ops.punch_methods, [k]: e.target.checked } })} />{l}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          {msg && !on("profile") && !on("data") && <Toast msg={msg} style={{ margin: "10px 0 0" }} />}
          <div className="nox-actions" style={{ marginTop: 12 }}>
            <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || !dirty} onClick={() => { setForm(cur); setMsg(null); }}>元に戻す</button>
            <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || !dirty || !loaded} onClick={() => void save()}>会計と運用を保存</button>
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
            </div>
            <div className="nox-actions" style={{ marginTop: 8 }}>{/* ★便 BTN（裁定242）: 主ボタンは行の中央 */}
              <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={tbBusy || tbRuns === null || tbPick === (tb.next ?? tb.current)} onClick={() => void saveTimeBasis()}>
                {tbRuns === null ? "読み込み中…" : tbRuns > 0 ? "次の期から切り替える" : "この基準にする"}
              </button>
            </div>
            {tbMsg && <Toast msg={tbMsg} style={{ margin: "10px 0 0" }} />}
          </>
        )}
      </section>}

      {/* ★裁定380（GV-B W-9）: キャスト確認トグル（shift_cast_confirm）は UI から廃止＝希望は 3 本道（希望どおり採用＝即確定／調整して確定／調整して送り返す）。
          自動確定時間（送り返したまま放置された分を自動で確定する時間）は 0172 の店設定キー＝表示先行（非活性） */}
      {on("shift") && <section className="nox-cardtop" style={t.card} data-shift-ops="1">
        <h2 style={{ ...secTitle, margin: "0 0 8px" }}>シフト運用</h2>
        <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px", lineHeight: 1.7 }}>
          キャストの希望は「希望どおり採用（即確定）」「調整して確定」「調整して送り返す（キャスト確認待ち）」の 3 つで処理します。店ごとの切替はありません。
        </p>
        {/* ★0172（裁定380・便 P172）: 自動確定時間＝店設定 shift_auto_confirm_hours（0＝しない・1〜168 時間）。実行器＝/api/cron/shift-auto-confirm（15 分間隔・cron_setup.md §6）。owner は切替・manager は現在値のみ */}
        <label style={{ display: "grid", gap: 4, maxWidth: 320 }}>
          <span style={t.fieldLabel}>送り返しの自動確定時間</span>
          <select value={form.shift_auto_confirm_hours} disabled={busy || !loaded || !isOwner} style={t.input} onChange={(e) => setForm((f) => ({ ...f, shift_auto_confirm_hours: e.target.value }))} aria-label="送り返しの自動確定時間" data-shift-auto-confirm="1">
            {SHIFT_AUTO_CONFIRM_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "var(--sub)" }}>送り返したまま確認されない希望を、設定した時間後に自動で確定します（15 分ごとに確認）。</span>
        </label>
        {isOwner && <div className="nox-actions" style={{ marginTop: 10 }}>
          <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || !loaded || form.shift_auto_confirm_hours === cur.shift_auto_confirm_hours} onClick={() => void saveShiftAuto()}>自動確定時間を保存</button>
        </div>}
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
