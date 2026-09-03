"use client";

// 料金設定ボード（料金UIレーン C1）。
// ★正本モック＝mock/pages-2026-08/nox-pricing-settings.html（裁定91・2026-08-28）。
//   旧記述の nox-rate-settings-redesign.html は**参照へ格下げ**（redesign 固有要素は
//   pages-2026-08 へ移植する方針＝裁定91。当初の底本だった経緯は残すが照合先にしない）。
//
// 3タブ＝時間帯料金（pricing_rules エディタ＋料金プレビュー）／基本料金（ランク別指名料金＋
// 既存2パネル移設）／会計ルール（凍結注記＝修正c・営業日区切り read-only）。
//
// ★モックとの写像（帯グルーピング）: モックの1行は「帯＋セット/延長/同伴の3料金」だが、
//   pricing_rules は 1行=1 fee_kind。UI は (席種, 曜日, 時間帯) でグルーピングした「帯」を
//   編集単位にし、保存時に fee_kind ごとの upsert/delete へ分解する（額が空欄＝その fee_kind の
//   ルールを作らない/削除する）。∧∨ は帯順を fee_kind ごとの pricing_rule_reorder（全件配列・
//   (store, fee_kind) スコープ）に分解して送る。
// ★修正4点: (a) 指名料金＝ランク×hon/jonai テーブル（実体は pricing_rules の rank_id 行・
//   軸なし）(b) スケジュール表に席種列 (c) 判定時刻設定 UI は作らない＝凍結注記
//   (d) モックの「重複禁止」注記→priority 表示＋「重複時は優先順位の小さい行が適用」。
// ★帯の「表示名」は mig0107（P-1）で実装済み＝pricing_rules.name（任意・1〜40文字・trim・空は null）。
//   1帯の最大3行（set/extension/dohan）へ同じ値を配る。bandKeyOf には含めない＝名前で帯を分裂させない。
//   ★解決には使わない（pricing_resolve_core は name を見ない）＝一覧での見分け専用。
// ★モックから意図的に落としたもの: 「料金単位 卓/名」列
//   （stores.time_per＝店単位の設定でルール軸ではない＝基本料金タブで設定）。
// ★書込は全て RPC 専任。エラーは fn_set_pricing_rule の bad 系トークン対応表で日本語化。
import { useCallback, useEffect, useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import Modal from "@/components/ui/modal";
import MasterPageHead from "../master-page-head";
import PricingPanel from "../pricing-panel";
import TimePricingPanel from "../time-pricing-panel";
import { swapAdjacent, reorderErrJa } from "@/lib/nox/ui/reorder";

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const { inputLg, btnPrimaryLg, btnGhostLg } = t;

export type PricingRule = {
  id: string; fee_kind: string; seat_kind: string | null; dow_mask: number | null;
  time_from_min: number | null; time_to_min: number | null; rank_id: string | null;
  amount: number; duration_min: number | null; priority: number; is_active: boolean; created_at: string;
  name: string | null;  // ★mig0107（P-1）: 表示名（任意・trim 済み 1〜40 文字・null=未設定）
  tax_category: string; // ★mig0112（C3）: 税区分（enum 4値・NOT NULL default 'taxable_10'）
  category_id: string | null; // ★mig0128（裁定116-2）: 料金区分（null=全区分）
};
export type CastRank = { id: string; name: string; sort_order: number; is_active: boolean };
// ★DP-R: 端数処理方法の表示語（pricing-panel の option と同語彙）
const ROUND_MODE_LABEL: Record<string, string> = { down: "切り捨て", up: "切り上げ", round: "四捨五入" };

export type StoreFallback = {
  hon_fee: number; jonai_fee: number; dohan_fee: number;
  service_rate: number; card_tax_rate: number; round_unit: number; round_mode: string;
  set_min: number; set_fee: number; ext_min: number; ext_fee: number;
  time_mode: string; time_per: string;
  // ★mig0111/0113（C4・裁定90）: 税設定6列
  business_tax_status: string; price_display: string; invoice_status: string;
  invoice_reg_no: string | null; tax_rounding: string; card_surcharge_rate: number | null;
};

const TIMED_KINDS = ["set", "extension", "dohan"] as const;
type TimedKind = (typeof TIMED_KINDS)[number];
const DOW_LABELS = ["月", "火", "水", "木", "金", "土", "日"];
const yen = (n: number) => "¥" + n.toLocaleString();

const hmToMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const minToHm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** fn_set_pricing_rule / delete_pricing_rule の bad 系トークン対応表（docs/tmp の供出物が典拠）。 */
function ruleErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("bad fee kind")) return "料金種別が不正です";
  if (msg.includes("bad seat kind")) return "席種が不正です";
  if (msg.includes("bad dow")) return "曜日の指定が不正です（1つ以上選択してください）";
  if (msg.includes("bad time")) return "時間帯が不正です（開始→終了の順・営業日区切りを跨ぐ帯は2行に分けてください）";
  if (msg.includes("bad rank")) return "ランクの指定が不正です";
  if (msg.includes("inactive rank")) return "停止中のランクは指定できません";
  if (msg.includes("bad name")) return "表示名は40文字までです";
  // ★mig0128（裁定116-2）: 区分系トークン
  if (msg.includes("bad category kind")) return "指名料には区分を設定できません";
  if (msg.includes("inactive category")) return "停止中の区分は新しく指定できません";
  if (msg.includes("bad category")) return "区分の指定が不正です（再読込してください）";
  if (msg.includes("bad amount")) return "金額は0以上で入力してください";
  if (msg.includes("bad duration")) return "分数の指定が不正です（1以上・セット/延長のみ）";
  if (msg.includes("bad priority")) return "優先順位が不正です";
  if (msg.includes("bad active")) return "状態の指定が不正です";
  if (msg.includes("not found")) return "対象のルールが見つかりません（再読込してください）";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

/** 帯（グループ）＝ (席種, 曜日, 時間帯) が同じルールの束。 */
type Band = {
  key: string; seat_kind: string | null; dow_mask: number | null;
  from: number | null; to: number | null;
  cells: Partial<Record<TimedKind, PricingRule>>;
  all: PricingRule[];           // 帯に属す全ルール（同 fee_kind 複数の2件目以降も含む）
  extraCount: number;           // UI 外で作られた同帯同種の2件目以降（プレビューで確認を促す）
  priority: number;             // 代表 priority＝min
  allActive: boolean;
  name: string | null;          // ★mig0107: 代表 name＝帯内で最初に見つかった非 null（ruleOrder 順）
  tax_category: string;         // ★mig0112: 代表税区分＝ruleOrder 順の最初の行（saveBand が3行へ同値を配る）
  category_id: string | null;   // ★mig0128（裁定R4）: 帯単位1値＝ruleOrder 順の最初の行（saveBand が3行へ同値を配る）
};

function bandKeyOf(r: PricingRule): string {
  // ★mig0128（裁定R4）: 区分は**解決条件＝帯の同一性の一部**（name/税区分は表示属性＝帯を分裂させないが、
  //   区分は「同じ窓・別区分の並置」が本体要件のため帯を分ける）。既存データは全 null＝キー不変＝挙動不変。
  return `${r.seat_kind ?? "*"}|${r.dow_mask ?? "*"}|${r.time_from_min ?? "*"}|${r.time_to_min ?? "*"}|${r.category_id ?? "*"}`;
}
const ruleOrder = (a: PricingRule, b: PricingRule) =>
  a.priority - b.priority || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

function bandsOf(rules: PricingRule[]): Band[] {
  const timed = rules.filter((r) => (TIMED_KINDS as readonly string[]).includes(r.fee_kind));
  const map = new Map<string, Band>();
  for (const r of [...timed].sort(ruleOrder)) {
    const key = bandKeyOf(r);
    let b = map.get(key);
    if (!b) {
      b = {
        key, seat_kind: r.seat_kind, dow_mask: r.dow_mask,
        from: r.time_from_min, to: r.time_to_min,
        cells: {}, all: [], extraCount: 0, priority: r.priority, allActive: true, name: null,
        tax_category: r.tax_category ?? "taxable_10", // ★mig0112: 代表＝最初の行（?? は旧キャッシュ行の保険）
        category_id: r.category_id ?? null, // ★mig0128: 代表＝最初の行（帯単位1値の前提・保存が3行へ同値を配る）
      };
      map.set(key, b);
    }
    b.all.push(r);
    const fk = r.fee_kind as TimedKind;
    if (!b.cells[fk]) b.cells[fk] = r; else b.extraCount++;
    b.priority = Math.min(b.priority, r.priority);
    b.allActive = b.allActive && r.is_active;
    // ★mig0107: 帯の代表 name＝ruleOrder 順で最初の非 null（saveBand が3行へ同じ名前を配るので通常は全行同値）
    if (b.name === null && r.name !== null) b.name = r.name;
  }
  return [...map.values()].sort((a, b) =>
    a.priority - b.priority || (a.from ?? -1) - (b.from ?? -1) || a.key.localeCompare(b.key));
}

export default function PricingBoard({ storeId, bizCutoffHm, initial }: {
  storeId: string; bizCutoffHm: string;
  initial: { store: StoreFallback; rules: PricingRule[]; ranks: CastRank[] };
}) {
  const supabase = createClient();
  const store = initial.store;
  const cutoffMin = hmToMin(bizCutoffHm);
  // ★116-UI 段②b（裁定117・対応表 T1〜T4）: 3責務分割＝料金マスタ／料金適用ルール／会計設定。
  //   「基本料金」タブは器ごと廃止（中身は master/checkout へ移設・UI は分ける DB は分けない）。
  const [tab, setTab] = useState<"master" | "rules" | "checkout">("master");
  const [rules, setRules] = useState<PricingRule[]>(initial.rules);
  const [ranks, setRanks] = useState<CastRank[]>(initial.ranks);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bands = bandsOf(rules);

  // 軸なし（席種/曜日/時間帯すべて null）の指名系ルール＝ランク別テーブルのセル実体
  const shimeiCell = (rankId: string | null, fk: "hon_shimei" | "jonai_shimei"): PricingRule | undefined =>
    rules.filter((r) => r.fee_kind === fk && r.rank_id === rankId
      && r.seat_kind === null && r.dow_mask === null && r.time_from_min === null)
      .sort(ruleOrder)[0];

  const buildRankVals = (rs: PricingRule[], rks: CastRank[]) => {
    const find = (rankId: string | null, fk: "hon_shimei" | "jonai_shimei") =>
      rs.filter((r) => r.fee_kind === fk && r.rank_id === rankId
        && r.seat_kind === null && r.dow_mask === null && r.time_from_min === null)
        .sort(ruleOrder)[0];
    const out: Record<string, { hon: string; jonai: string }> = {};
    for (const key of ["__default", ...rks.map((r) => r.id)]) {
      const rid = key === "__default" ? null : key;
      out[key] = {
        hon: find(rid, "hon_shimei")?.amount?.toString() ?? "",
        jonai: find(rid, "jonai_shimei")?.amount?.toString() ?? "",
      };
    }
    return out;
  };
  const [rankVals, setRankVals] = useState<Record<string, { hon: string; jonai: string }>>(
    () => buildRankVals(initial.rules, initial.ranks));
  const [newRankName, setNewRankName] = useState("");
  // D2-4（mig0085）: ランク削除の参照数（casts.rank_id）。pricing_rules 側は手元の rules から数える。
  const [rankCastRefs, setRankCastRefs] = useState<Record<string, number>>({});

  async function reload() {
    const [{ data: rs }, { data: rks }] = await Promise.all([
      supabase.from("pricing_rules").select("*").eq("store_id", storeId)
        .order("priority").order("created_at").order("id"),
      supabase.from("cast_ranks").select("id, name, sort_order, is_active").eq("store_id", storeId)
        .order("sort_order").order("name"),
    ]);
    const nr = (rs ?? []) as PricingRule[];
    const nk = (rks ?? []) as CastRank[];
    setRules(nr);
    setRanks(nk);
    setRankVals(buildRankVals(nr, nk));
    // D2-4: 割当キャスト数（RLS スコープ内・rank_id 非 null のみ）
    const { data: cr } = await supabase.from("casts").select("rank_id").not("rank_id", "is", null);
    const refs: Record<string, number> = {};
    for (const c of (cr ?? []) as { rank_id: string }[]) refs[c.rank_id] = (refs[c.rank_id] ?? 0) + 1;
    setRankCastRefs(refs);
  }

  const nextPriority = (fk: string) =>
    rules.filter((r) => r.fee_kind === fk).reduce((mx, r) => Math.max(mx, r.priority), 0) + 1 || 100;

  /** set_pricing_rule の引数を組んで呼ぶ（原則7＝全値明示）。 */
  async function upsertRule(p: {
    id: string | null; fee_kind: string; seat_kind: string | null; dow_mask: number | null;
    from: number | null; to: number | null; rank_id: string | null;
    amount: number; duration_min: number | null; priority: number; is_active: boolean;
    name?: string | null;  // ★mig0107: 省略＝送らない（DEFAULT NULL で解決）
    tax_category: string;  // ★mig0112（C3）: **必須＝常に明示送信**。省略すると update 経路で
                           //   DEFAULT 'taxable_10' が効き既存 exempt 行が黙って課税へ戻る（原則7 の型）。
    category_id: string | null; // ★mig0128: **必須＝常に明示送信**（update は category_id を常に書く＝
                                //   省略で null 上書きになる tax_category と同じ罠を構造的に排除。shimei は null 固定）。
  }): Promise<string | null> {
    const { error } = await supabase.rpc("set_pricing_rule", {
      p_id: p.id, p_store_id: storeId, p_fee_kind: p.fee_kind, p_seat_kind: p.seat_kind,
      p_dow_mask: p.dow_mask, p_time_from_min: p.from, p_time_to_min: p.to,
      p_rank_id: p.rank_id, p_amount: p.amount, p_duration_min: p.duration_min,
      p_priority: p.priority, p_is_active: p.is_active,
      p_tax_category: p.tax_category,
      p_category_id: p.category_id,
      // ★mig0107: name を持つ呼び出しだけ p_name を足す。指名料（saveRankRow）は渡さない＝null のまま。
      ...(p.name !== undefined ? { p_name: p.name } : {}),
    });
    return error ? ruleErrJa(error.message) : null;
  }

  // ── 帯編集モーダル ──────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null); // null=新規
  const [mSeat, setMSeat] = useState("");
  const [mDays, setMDays] = useState<boolean[]>(Array(7).fill(true));
  const [mFrom, setMFrom] = useState("");
  const [mTo, setMTo] = useState("");
  const [mSetFee, setMSetFee] = useState("");
  const [mSetMin, setMSetMin] = useState("");
  const [mExtFee, setMExtFee] = useState("");
  const [mExtMin, setMExtMin] = useState("");
  const [mDohan, setMDohan] = useState("");
  const [mActive, setMActive] = useState(true);
  const [mName, setMName] = useState("");   // ★mig0107（P-1）: 帯の表示名（任意・空＝null 送信）
  const [mTax, setMTax] = useState("taxable_10"); // ★mig0112（C3）: 帯の税区分（UI 露出3値・taxable_8 は準備中＝裁定90-②）
  const [mCat, setMCat] = useState("");     // ★mig0128（裁定R4）: 帯の料金区分（""=全区分・帯単位1値＝3行へ同値配布）

  // ── ★C4 §6-5（mig0113・裁定90/91）: 店舗税設定（会計ルールタブ・set_store_tax_config 結線）──
  //   原則7＋教訓43 型: 保存は**常に7引数全値明示**（省略で default に戻る事故を UI から構造的に排除）。
  const [tBts, setTBts] = useState(store.business_tax_status);
  const [tPd, setTPd] = useState(store.price_display);
  const [tInv, setTInv] = useState(store.invoice_status);
  const [tReg, setTReg] = useState(store.invoice_reg_no ?? "");
  const [tRnd, setTRnd] = useState(store.tax_rounding);
  const [tSurOn, setTSurOn] = useState(store.card_surcharge_rate !== null);
  const [tSurRate, setTSurRate] = useState(store.card_surcharge_rate === null ? "" : String(store.card_surcharge_rate));
  const [tSurAck, setTSurAck] = useState(false); // 裁定87 第2層＝有効化時の契約確認チェック
  const [taxSavedSur, setTaxSavedSur] = useState<number | null>(store.card_surcharge_rate); // 保存済み値（有効化の判定用）
  const [taxBusy, setTaxBusy] = useState(false);
  const [taxMsg, setTaxMsg] = useState<string | null>(null);

  function taxErrJa(msg: string): string {
    if (msg.includes("billing locked")) return "ご利用プランが停止中のため保存できません";
    if (msg.includes("invoice requires taxable")) return "インボイス登録は課税事業者のみ選択できます";
    if (msg.includes("registration number required")) return "インボイス登録済みの場合は登録番号が必要です";
    if (msg.includes("bad registration number")) return "登録番号は T＋数字13桁で入力してください";
    if (msg.includes("bad tax config")) return "税設定の値が不正です";
    if (msg.includes("forbidden")) return "権限がありません";
    return msg;
  }

  async function saveTaxConfig() {
    setTaxMsg(null);
    const reg = tReg.trim();
    if (tInv === "registered" && tBts !== "taxable") { setTaxMsg("インボイス登録は課税事業者のみ選択できます"); return; }
    if (tInv === "registered" && reg === "") { setTaxMsg("インボイス登録済みの場合は登録番号が必要です"); return; }
    if (reg !== "" && !/^T[0-9]{13}$/.test(reg)) { setTaxMsg("登録番号は T＋数字13桁で入力してください"); return; }
    const surRate = tSurOn ? Number(tSurRate) : null;
    if (tSurOn && (!Number.isInteger(surRate) || (surRate as number) < 1 || (surRate as number) > 100)) {
      setTaxMsg("カード手数料は 1〜100 の整数%で入力してください"); return;
    }
    // ★裁定87 第2層: 「無効 → 有効」への変更時のみ契約確認を必須にする（既に有効の店の率変更は再確認不要）
    if (tSurOn && taxSavedSur === null && !tSurAck) {
      setTaxMsg("カード手数料の有効化には契約上の可否の確認チェックが必要です"); return;
    }
    setTaxBusy(true);
    const { error } = await supabase.rpc("set_store_tax_config", {
      p_store_id: storeId,
      p_business_tax_status: tBts,
      p_price_display: tPd,
      p_invoice_status: tInv,
      p_invoice_reg_no: reg === "" ? null : reg,
      p_tax_rounding: tRnd,
      p_card_surcharge_rate: surRate,
    });
    setTaxBusy(false);
    if (error) { setTaxMsg(taxErrJa(error.message)); return; }
    setTaxSavedSur(surRate); setTSurAck(false);
    setTaxMsg("税設定を保存しました（開栓済みの伝票には影響しません）");
  }
  const [mErr, setMErr] = useState<string | null>(null);

  // ── ★裁定116（mig0127）: 料金区分マスタ（一覧＋追加/編集モーダル）──────────
  //   書込は set_pricing_category 専任（削除ボタンは置かない＝is_active false 運用・設計書 v2 §7）。
  //   ルール編集フォームへの区分セレクタは 116-UI レーン送り＝ここではマスタ管理のみ。
  type PricingCategory = { id: string; name: string; sort: number; is_active: boolean };
  const [cats, setCats] = useState<PricingCategory[]>([]);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catEditId, setCatEditId] = useState<string | null>(null); // null=新規
  const [cName, setCName] = useState("");
  const [cActive, setCActive] = useState(true);
  const [cErr, setCErr] = useState<string | null>(null);
  // ★裁定R2（116-UI×v3）: sort は内部表現＝UI 非露出。並びは ∧∨（priority 非露出と同思想）。

  function catErrJa(msg: string | undefined): string {
    if (!msg) return "不明なエラー";
    if (msg.includes("duplicate name")) return "同名の区分があります";
    if (msg.includes("bad name")) return "区分名は1〜40文字で入力してください";
    if (msg.includes("bad sort")) return "表示順は数値で入力してください";
    if (msg.includes("billing locked")) return "ご利用プランが停止中のため保存できません";
    if (msg.includes("not found")) return "対象の区分が見つかりません（再読込してください）";
    if (msg.includes("forbidden")) return "権限がありません";
    return msg;
  }
  const loadCats = useCallback(async () => {
    const { data } = await supabase.from("pricing_categories")
      .select("id, name, sort, is_active").eq("store_id", storeId)
      .order("sort").order("name");
    setCats((data ?? []) as PricingCategory[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  useEffect(() => { void loadCats(); }, [loadCats]);

  function openNewCat() {
    setCatEditId(null); setCName(""); setCActive(true); setCErr(null); setCatModalOpen(true);
  }
  function openEditCat(c: PricingCategory) {
    setCatEditId(c.id); setCName(c.name); setCActive(c.is_active); setCErr(null);
    setCatModalOpen(true);
  }
  async function saveCat() {
    setCErr(null);
    if (cName.trim() === "") { setCErr("区分名を入力してください"); return; }
    // ★裁定R2: sort は内部割当＝新規は末尾（max+10）・編集は現値保持（並び替えは ∧∨ が担う）
    const sortN = catEditId !== null
      ? (cats.find((c) => c.id === catEditId)?.sort ?? 100)
      : (cats.length ? Math.max(...cats.map((c) => c.sort)) + 10 : 100);
    setBusy(true);
    const { error } = await supabase.rpc("set_pricing_category", {
      p_id: catEditId, p_store_id: storeId, p_name: cName.trim(), p_sort: sortN, p_is_active: cActive,
    });
    setBusy(false);
    if (error) { setCErr(catErrJa(error.message)); return; }
    setCatModalOpen(false);
    setMsg(catEditId !== null ? "料金区分を更新しました" : "料金区分を追加しました");
    await loadCats();
  }
  /** ★裁定R2: 区分の ∧∨＝入替え後の全行へ sort を 10 刻みで再割当（name/active は現値明示＝原則7）。 */
  async function moveCat(index: number, dir: -1 | 1) {
    const ids = swapAdjacent(cats.map((c) => c.id), index, dir);
    if (!ids || busy) return;
    const byId = new Map(cats.map((c) => [c.id, c]));
    setBusy(true);
    for (let i = 0; i < ids.length; i++) {
      const c = byId.get(ids[i])!;
      const newSort = (i + 1) * 10;
      if (c.sort === newSort) continue;
      const { error } = await supabase.rpc("set_pricing_category", {
        p_id: c.id, p_store_id: storeId, p_name: c.name, p_sort: newSort, p_is_active: c.is_active,
      });
      if (error) { setMsg(catErrJa(error.message)); break; }
    }
    setBusy(false);
    await loadCats();
  }

  function openNewBand() {
    setEditKey(null); setMSeat(""); setMDays(Array(7).fill(true));
    setMFrom(""); setMTo(""); setMSetFee(""); setMSetMin(""); setMExtFee(""); setMExtMin("");
    setMDohan(""); setMActive(true); setMName(""); setMTax("taxable_10"); setMCat(""); setMErr(null); setModalOpen(true);
  }
  function openEditBand(b: Band) {
    setEditKey(b.key);
    setMSeat(b.seat_kind ?? "");
    setMDays(DOW_LABELS.map((_, i) => b.dow_mask === null ? true : ((b.dow_mask >> i) & 1) === 1));
    setMFrom(b.from === null ? "" : minToHm(b.from));
    setMTo(b.to === null ? "" : minToHm(b.to));
    setMSetFee(b.cells.set ? String(b.cells.set.amount) : "");
    setMSetMin(b.cells.set?.duration_min != null ? String(b.cells.set.duration_min) : "");
    setMExtFee(b.cells.extension ? String(b.cells.extension.amount) : "");
    setMExtMin(b.cells.extension?.duration_min != null ? String(b.cells.extension.duration_min) : "");
    setMDohan(b.cells.dohan ? String(b.cells.dohan.amount) : "");
    setMActive(b.allActive);
    setMName(b.name ?? "");
    setMTax(b.tax_category); // ★mig0112: taxable_8 の既存行も値は保持して見せる（保存も同値なら無害）
    setMCat(b.category_id ?? ""); // ★mig0128: 帯の現値（停止中区分でも現値として保持＝同値再送は据え置き）
    setMErr(null);
    setModalOpen(true);
  }

  // ★from=to=cutoff は「終日の帯」として合法（半開区間の帰結）＝保存可・警告のみ（設計書 §1-2）
  const cutoffWholeDay = mFrom !== "" && mTo !== "" && mFrom === mTo && hmToMin(mFrom) === cutoffMin;

  async function saveBand() {
    setMErr(null);
    if ((mFrom === "") !== (mTo === "")) { setMErr("開始と終了は両方入力してください（終日は両方空欄）"); return; }
    if (!mDays.some(Boolean)) { setMErr("曜日を1つ以上選択してください"); return; }
    if (mSetFee === "" && mExtFee === "" && mDohan === "") { setMErr("セット・延長・同伴のいずれかの料金を入力してください"); return; }
    const dow = mDays.every(Boolean) ? null : mDays.reduce((m, on, i) => (on ? m | (1 << i) : m), 0);
    const from = mFrom === "" ? null : hmToMin(mFrom);
    const to = mTo === "" ? null : hmToMin(mTo);
    const band = editKey !== null ? bands.find((b) => b.key === editKey) : undefined;

    // fee_kind ごとに upsert / delete へ分解（額 空欄＝その fee_kind のルールなし）
    const plan: Array<{ fk: TimedKind; fee: string; min: string }> = [
      { fk: "set", fee: mSetFee, min: mSetMin },
      { fk: "extension", fee: mExtFee, min: mExtMin },
      { fk: "dohan", fee: mDohan, min: "" },
    ];
    setBusy(true);
    for (const { fk, fee, min } of plan) {
      const existing = band?.cells[fk];
      if (fee === "") {
        if (existing) {
          const { error } = await supabase.rpc("delete_pricing_rule", { p_id: existing.id });
          if (error) { setMErr(`${fk}: ${ruleErrJa(error.message)}`); setBusy(false); await reload(); return; }
        }
        continue;
      }
      const err = await upsertRule({
        id: existing?.id ?? null, fee_kind: fk, seat_kind: mSeat === "" ? null : mSeat,
        dow_mask: dow, from, to, rank_id: null,
        amount: Number(fee),
        duration_min: fk === "dohan" ? null : (min === "" ? null : Number(min)),
        priority: existing?.priority ?? nextPriority(fk),
        is_active: mActive,
        // ★mig0107（P-1）: 1帯の最大3行（set/extension/dohan）へ同じ表示名を配る。
        //   bandKeyOf は不変＝名前で帯を分裂させない（帯の同一性は席種/曜日/時間帯のみで決まる）。
        name: mName.trim() === "" ? null : mName.trim(),
        tax_category: mTax, // ★mig0112: 表示名と同じく3行へ同値を配る（bandKeyOf 不変＝税区分で帯を分裂させない）
        category_id: mCat === "" ? null : mCat, // ★mig0128（裁定R4）: 帯単位1値＝3行へ同値を配る（""=全区分）
      });
      if (err) { setMErr(`${fk === "set" ? "セット" : fk === "extension" ? "延長" : "同伴"}: ${err}`); setBusy(false); await reload(); return; }
    }
    setBusy(false);
    setModalOpen(false);
    setMsg(editKey !== null ? "時間帯料金を更新しました" : "時間帯料金を追加しました");
    await reload();
  }

  async function deleteBand() {
    const band = editKey !== null ? bands.find((b) => b.key === editKey) : undefined;
    if (!band) { setModalOpen(false); return; }
    setBusy(true);
    for (const r of band.all) {
      const { error } = await supabase.rpc("delete_pricing_rule", { p_id: r.id });
      if (error) { setMErr(ruleErrJa(error.message)); setBusy(false); await reload(); return; }
    }
    setBusy(false);
    setModalOpen(false);
    setMsg("時間帯料金を削除しました");
    await reload();
  }

  /** 状態トグル＝帯内の全ルールを is_active 反転で再送（他フィールドは既存値のまま＝原則7）。 */
  async function toggleBand(b: Band) {
    setBusy(true);
    for (const r of b.all) {
      const err = await upsertRule({
        id: r.id, fee_kind: r.fee_kind, seat_kind: r.seat_kind, dow_mask: r.dow_mask,
        from: r.time_from_min, to: r.time_to_min, rank_id: r.rank_id,
        amount: r.amount, duration_min: r.duration_min, priority: r.priority, is_active: !b.allActive,
        tax_category: r.tax_category ?? "taxable_10", // ★mig0112: 既存値を明示再送（原則7）
        category_id: r.category_id ?? null, // ★mig0128: 既存値を明示再送（停止中区分でも同値再送は据え置き＝成功）
      });
      if (err) { setMsg(err); setBusy(false); await reload(); return; }
    }
    setBusy(false);
    await reload();
  }

  /** ∧∨＝帯順の入れ替えを fee_kind ごとの reorder（全件配列）へ分解。 */
  async function moveBand(index: number, dir: -1 | 1) {
    const order = swapAdjacent(bands.map((b) => b.key), index, dir);
    if (!order || busy) return;
    const byKey = new Map(bands.map((b) => [b.key, b]));
    setBusy(true);
    for (const fk of TIMED_KINDS) {
      const ids = order.flatMap((k) =>
        (byKey.get(k)?.all ?? []).filter((r) => r.fee_kind === fk).sort(ruleOrder).map((r) => r.id));
      if (ids.length === 0) continue;
      const { error } = await supabase.rpc("pricing_rule_reorder", {
        p_store_id: storeId, p_fee_kind: fk, p_ids: ids,
      });
      if (error) { setMsg(reorderErrJa(error.message)); break; }
    }
    setBusy(false);
    await reload();
  }

  // ── ランク別指名料金（tab-base・修正a）─────────────────────────
  async function saveRankRow(key: string) {
    const rankId = key === "__default" ? null : key;
    const vals = rankVals[key] ?? { hon: "", jonai: "" };
    setBusy(true);
    for (const [fk, v] of [["hon_shimei", vals.hon], ["jonai_shimei", vals.jonai]] as const) {
      const existing = shimeiCell(rankId, fk);
      if (v === "") {
        if (existing) {
          const { error } = await supabase.rpc("delete_pricing_rule", { p_id: existing.id });
          if (error) { setMsg(ruleErrJa(error.message)); setBusy(false); await reload(); return; }
        }
        continue;
      }
      const err = await upsertRule({
        id: existing?.id ?? null, fee_kind: fk, seat_kind: null, dow_mask: null,
        from: null, to: null, rank_id: rankId,
        amount: Number(v), duration_min: null,
        // ★裁定80: 既定（rank_id null）行は priority 200・ランク行は 100 固定＝ランク行が必ず先に当たる。
        //   既存値は引き継がない（旧行が 100 で作られていても保存で 200 へ揃う）。
        //   pricing_resolve_core は特異性加点を持たない（priority→created_at→id のみ）ため、
        //   優先はこの数値だけで決まる。★∧∨ の pricing_rule_reorder は TIMED_KINDS
        //   （set/extension/dohan）専用＝指名料の priority を 1..N へ振り直す経路は無い。
        priority: rankId === null ? 200 : 100, is_active: true,
        tax_category: existing?.tax_category ?? "taxable_10", // ★mig0112: 既存値保持・新規は既定（指名料に税区分 UI は置かない）
        category_id: null, // ★mig0128（D3）: shimei 系は区分非対応＝null 固定（セレクタも置かない・'bad category kind' の UI 前置）
      });
      if (err) { setMsg(err); setBusy(false); await reload(); return; }
    }
    setBusy(false);
    setMsg("指名料金を保存しました");
    await reload();
  }

  async function addRank() {
    const name = newRankName.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_cast_rank", {
      p_id: null, p_store_id: storeId, p_name: name, p_is_active: true,
    });
    setBusy(false);
    setMsg(error
      ? (error.message.includes("duplicate name") ? "同じ名前のランクが既にあります"
        : error.message.includes("bad name") ? "ランク名は40字以内で入力してください"
        : ruleErrJa(error.message))
      : "ランクを追加しました");
    if (!error) setNewRankName("");
    await reload();
  }

  async function toggleRank(r: CastRank) {
    setBusy(true);
    const { error } = await supabase.rpc("set_cast_rank", {
      p_id: r.id, p_store_id: storeId, p_name: r.name, p_is_active: !r.is_active,
    });
    setBusy(false);
    if (error) setMsg(ruleErrJa(error.message));
    await reload();
  }

  /** D2-4（mig0085）: ランク削除。RPC が参照ゼロを検証（'in use'）＝UI は件数を出して先回りする。
   *  削除成功後は残り全件で cast_rank_reorder を呼び直し sort_order を 1..N へ正規化
   *  （reorder の「全件配列」契約との整合＝欠番を残さない）。 */
  async function deleteRank(r: CastRank) {
    const castRefs = rankCastRefs[r.id] ?? 0;
    const ruleRefs = rules.filter((x) => x.rank_id === r.id).length;
    if (castRefs + ruleRefs > 0) {
      setMsg(`使用中のため削除できません（割当${castRefs}件・ルール${ruleRefs}件）`);
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("delete_cast_rank", { p_id: r.id });
    if (error) {
      setBusy(false);
      setMsg(error.message.includes("in use")
        ? `使用中のため削除できません（割当${castRefs}件・ルール${ruleRefs}件）`
        : error.message.includes("not found") ? "対象のランクが見つかりません（再読込してください）"
        : ruleErrJa(error.message));
      await reload();
      return;
    }
    const rest = ranks.filter((x) => x.id !== r.id).map((x) => x.id);
    if (rest.length > 0) {
      const { error: eRo } = await supabase.rpc("cast_rank_reorder", { p_store_id: storeId, p_ids: rest });
      if (eRo) setMsg(reorderErrJa(eRo.message));
      else setMsg("ランクを削除しました");
    } else {
      setMsg("ランクを削除しました");
    }
    setBusy(false);
    await reload();
  }

  async function moveRank(index: number, dir: -1 | 1) {
    const ids = swapAdjacent(ranks.map((r) => r.id), index, dir);
    if (!ids || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("cast_rank_reorder", { p_store_id: storeId, p_ids: ids });
    setBusy(false);
    if (error) setMsg(reorderErrJa(error.message));
    await reload();
  }

  // ── 料金プレビュー（pricing_resolve 直呼び・owner/manager ページなので可）──
  const nowLocal = () => {
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  };
  const [pvAt, setPvAt] = useState(nowLocal);
  const [pvSeat, setPvSeat] = useState("");
  const [pvGuests, setPvGuests] = useState(2);
  const [pvDohan, setPvDohan] = useState(false);
  const [pvPay, setPvPay] = useState<"cash" | "card">("cash");
  const [pvOut, setPvOut] = useState<{
    setAmount: number; setMin: number; setSrc: "rule" | "base";
    dohanUnit: number | null; dohanSrc: "rule" | "base";
    units: number; net: number; svc: number; total: number; cardTax: number;
  } | null>(null);
  const [pvErr, setPvErr] = useState<string | null>(null);
  // E8-5 pricing（当日追加分⑥）: 「今開卓したら適用されるルール」＝現在時刻の pricing_resolve 直呼び
  //   （owner/manager ページ・表示専用・権威は check_open 時のサーバ解決＝ここは同じ RPC の事前照会）。
  const [liveNow, setLiveNow] = useState<{
    at: string;
    set: { amount: number; min: number; src: "rule" | "base"; ruleId: string | null };
    ext: { amount: number; min: number; src: "rule" | "base" };
    dohan: { amount: number; src: "rule" | "base" };
  } | null>(null);
  const loadLiveNow = useCallback(async () => {
    const at = new Date().toISOString();
    const call = (fk: string) => supabase.rpc("pricing_resolve", {
      p_store_id: storeId, p_at: at, p_fee_kind: fk, p_seat_kind: null, p_rank_id: null,
    });
    const [rs, re, rd] = await Promise.all([call("set"), call("extension"), call("dohan")]);
    if (rs.error || re.error || rd.error) return; // 表示専用＝失敗時は区画ごと出さない
    const row = (r: { data: unknown }) =>
      Array.isArray(r.data) && r.data.length ? r.data[0] as { amount: number; duration_min: number | null; rule_id: string | null } : null;
    const s = row(rs), e = row(re), d = row(rd);
    setLiveNow({
      at: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      // ★R9: rule_id は保持だけして名前はレンダ時に手元 rules から解決（stale closure を作らない）
      set: { amount: s?.amount ?? store.set_fee, min: s?.duration_min ?? store.set_min, src: s ? "rule" : "base", ruleId: s?.rule_id ?? null },
      ext: { amount: e?.amount ?? store.ext_fee, min: e?.duration_min ?? store.ext_min, src: e ? "rule" : "base" },
      dohan: { amount: d?.amount ?? store.dohan_fee, src: d ? "rule" : "base" },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  useEffect(() => { void loadLiveNow(); }, [loadLiveNow]);

  // D2-4: 参照数の初期取得（initial props に含まれないため初回のみ reload と同じ読みを行う）
  useEffect(() => {
    void (async () => {
      const { data: cr } = await supabase.from("casts").select("rank_id").not("rank_id", "is", null);
      const refs: Record<string, number> = {};
      for (const c of (cr ?? []) as { rank_id: string }[]) refs[c.rank_id] = (refs[c.rank_id] ?? 0) + 1;
      setRankCastRefs(refs);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPreview() {
    setPvErr(null);
    setPvOut(null);
    const at = new Date(pvAt).toISOString();
    const call = (fk: string) => supabase.rpc("pricing_resolve", {
      p_store_id: storeId, p_at: at, p_fee_kind: fk,
      p_seat_kind: pvSeat === "" ? null : pvSeat, p_rank_id: null,
    });
    const [rs, rd] = await Promise.all([call("set"), pvDohan ? call("dohan") : Promise.resolve({ data: null, error: null })]);
    if (rs.error) { setPvErr(ruleErrJa(rs.error.message)); return; }
    if (pvDohan && rd.error) { setPvErr(ruleErrJa(rd.error.message)); return; }
    const setRow = Array.isArray(rs.data) && rs.data.length ? rs.data[0] as { amount: number; duration_min: number | null } : null;
    const dohanRow = pvDohan && Array.isArray(rd.data) && rd.data.length ? rd.data[0] as { amount: number } : null;
    const setUnit = setRow?.amount ?? store.set_fee;
    const setMin = setRow?.duration_min ?? store.set_min;
    const dohanUnit = pvDohan ? (dohanRow?.amount ?? store.dohan_fee) : null;
    const units = store.time_per === "person" ? pvGuests : 1;
    const setAmount = setUnit * units;
    const net = setAmount + (dohanUnit != null ? dohanUnit * pvGuests : 0);
    const svc = Math.round(net * store.service_rate / 100);
    const withSvc = net + svc;
    const u = store.round_unit;
    const total = store.round_mode === "up" ? Math.ceil(withSvc / u) * u
      : store.round_mode === "round" ? Math.round(withSvc / u) * u
      : Math.floor(withSvc / u) * u;
    const cardTax = pvPay === "card" ? Math.round(total * store.card_tax_rate / 100) : 0;
    setPvOut({
      setAmount, setMin, setSrc: setRow ? "rule" : "base",
      dohanUnit, dohanSrc: dohanRow ? "rule" : "base",
      units, net, svc, total, cardTax,
    });
  }

  // ── 表示ヘルパー ──────────────────────────────────────────────
  const bandTimeLabel = (b: Band) => {
    if (b.from === null) return "終日";
    const f = (m: number) => `${m < cutoffMin ? "翌" : ""}${minToHm(m)}`;
    const toLabel = b.to === 0 ? "24:00" : f(b.to as number);
    return `${f(b.from)}〜${toLabel}`;
  };
  const bandDowLabel = (b: Band) =>
    b.dow_mask === null ? "毎日" : DOW_LABELS.filter((_, i) => ((b.dow_mask as number) >> i) & 1).join("");

  // E8-5 pricing（当日追加分⑥）: 重複帯の検出＝表示専用の警告（挙動は現行どおり priority 解決のまま）。
  //   時間帯は 0083 の非対称営業日拡張（from < cutoff / to <= cutoff で +1440）と同じ式で比較する。
  const bandOverlaps = (() => {
    const adjRange = (b: Band): [number, number] => {
      if (b.from === null) return [cutoffMin, cutoffMin + 1440]; // 終日
      const f = (b.from as number) < cutoffMin ? (b.from as number) + 1440 : (b.from as number);
      const tRaw = b.to === 0 ? 1440 : (b.to as number);
      const tv = tRaw <= cutoffMin ? tRaw + 1440 : tRaw;
      return [f, tv];
    };
    const mask = (b: Band) => b.dow_mask ?? 127;
    const kinds = (b: Band) => Object.keys(b.cells);
    const out: string[] = [];
    for (let i = 0; i < bands.length; i++) {
      for (let j = i + 1; j < bands.length; j++) {
        const a = bands[i], b = bands[j];
        if (a.seat_kind !== null && b.seat_kind !== null && a.seat_kind !== b.seat_kind) continue;
        if ((mask(a) & mask(b)) === 0) continue;
        // ★mig0128（D4）: 区分軸＝区分一致 ∨ どちらかが null（null=全区分は解決上すべての区分と競合しうる）
        if (a.category_id !== null && b.category_id !== null && a.category_id !== b.category_id) continue;
        const [af, at2] = adjRange(a); const [bf, bt] = adjRange(b);
        if (!(af < bt && bf < at2)) continue;
        if (!kinds(a).some((k) => kinds(b).includes(k))) continue;
        out.push(`${bandTimeLabel(a)}（${a.seat_kind ?? "全席種"}・${bandDowLabel(a)}）と ${bandTimeLabel(b)}（${b.seat_kind ?? "全席種"}・${bandDowLabel(b)}）`);
      }
    }
    return out;
  })();
  const cellLabel = (r: PricingRule | undefined, withMin: boolean) => {
    if (!r) return <span style={{ color: "var(--v2-muted)" }}>—</span>;
    return (
      <span style={t.num}>
        {yen(r.amount)}
        {withMin && r.duration_min != null && <span style={{ color: "var(--sub)", fontSize: 10.5 }}> /{r.duration_min}分</span>}
      </span>
    );
  };

  const dayChip = (on: boolean): React.CSSProperties => ({
    fontFamily: "inherit", fontWeight: 700, fontSize: 12, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
    border: on ? "1px solid var(--gold)" : "1px solid var(--line2)",
    background: on ? "linear-gradient(135deg,var(--goldface),var(--goldface3))" : "transparent",
    color: on ? "var(--champ)" : "var(--sub)",
  });

  return (
    <div className="nox-mv1">
      <Toast msg={msg} />

      <MasterPageHead
        eyebrow="PRICING SETTINGS"
        title="料金設定"
        desc="時間帯・席種・曜日ごとの料金ルールと、基本料金・会計ルールを設定します。料率は伝票オープン時に確定します。"
      />
      {/* E8-5 pricing#4: 報酬設定への分離バナー（料金＝お客さまへの請求／報酬＝キャストへの支払いの混同防止） */}
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 14px", lineHeight: 1.7 }}>
        ここで設定するのは<strong style={{ color: "var(--v2-text)" }}>お客さまへの請求額</strong>です。
        キャストに支払う指名バック・時給は
        <Link href="/master/cast-comp/plan" style={{ color: "var(--gold2)" }}>待遇プラン・報酬シミュレーター</Link>
        で管理します（ランク別指名料の「請求額」はこのページ・「バック額」は待遇プラン側）。
      </p>

      {/* 3タブ（v3 の master / rules / accounting 写像＝裁定117） */}
      <div className="nox-pillbar" style={{ marginBottom: 12 }}>
        {([["master", "料金マスタ"], ["rules", "料金適用ルール"], ["checkout", "会計設定"]] as const).map(([k, label]) => (
          <button key={k} type="button" className={`nox-pill${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ 料金適用ルール（旧・時間帯料金＝T2 改称） ═══ */}
      {tab === "rules" && (
        <>
          {/* E8-5 pricing⑥: 今開卓したら適用されるルール（現在時刻・卓既定・pricing_resolve 直呼びの表示専用） */}
          {liveNow && (
            <div className="nox-inset" style={{ padding: "10px 14px", marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)" }}>
                いま開卓したら（{liveNow.at}・卓）
              </span>
              <span style={{ fontSize: 12.5 }}>
                セット <b className="num">{yen(liveNow.set.amount)}</b>
                <small style={{ color: "var(--sub)" }}> /{liveNow.set.min}分・{liveNow.set.src === "rule" ? "ルール適用" : "基本料金"}</small>
                {/* ★R9（裁定119 と同規則）: 適用ルール名＝name null は非表示 */}
                {(() => {
                  const nm = liveNow.set.ruleId ? rules.find((r) => r.id === liveNow.set.ruleId)?.name ?? null : null;
                  return nm ? (
                    <span className="nox-stpill" style={{ marginLeft: 6, color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)" }}>
                      適用: {nm}
                    </span>
                  ) : null;
                })()}
              </span>
              <span style={{ fontSize: 12.5 }}>
                延長 <b className="num">{yen(liveNow.ext.amount)}</b>
                <small style={{ color: "var(--sub)" }}> /{liveNow.ext.min}分・{liveNow.ext.src === "rule" ? "ルール適用" : "基本料金"}</small>
              </span>
              <span style={{ fontSize: 12.5 }}>
                同伴 <b className="num">{yen(liveNow.dohan.amount)}</b>
                <small style={{ color: "var(--sub)" }}> ・{liveNow.dohan.src === "rule" ? "ルール適用" : "基本料金"}</small>
              </span>
              <button type="button" style={{ ...btnLight, marginLeft: "auto" }} onClick={() => void loadLiveNow()}>更新</button>
            </div>
          )}
          {/* ★R10（§4-a 確定）: 時間だけのルール禁止の lead（v3 逐語） */}
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 12px", lineHeight: 1.7 }}>
            「いつ・誰に・何分・いくらの料金を当てるか」の正本です。
            <strong style={{ color: "var(--v2-text)" }}>時間だけのルールは作れません</strong>
            ——各行が時間帯・条件・金額・基準時間をひとまとめに持ちます。
          </p>

          {/* ★R1（対応表）: 料金区分カード＝タブ内先頭側（v3 はスケジュールの上）。実体は 115-UI/段②a のまま */}
          <section className="nox-cardtop" style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px" }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>料金区分</h3>
              <button type="button" style={{ ...btnDark, marginLeft: "auto" }} onClick={openNewCat}>＋ 区分を追加</button>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px", lineHeight: 1.7 }}>
              「通常」「初来店」など、開栓時に選ぶ料金の区分です。一番上が開栓時の既定になります（∧∨で並び替え）。
              区分を1つも作らない場合、開栓は現行どおり（区分なし）で動きます。
            </p>
            {cats.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>
                料金区分は未設定です（開栓時の区分セレクタは表示されません）。
              </p>
            ) : (
              <div className="nox-ptwrap">
                <table className="nox-ptable">
                  <thead>
                    <tr>
                      {/* ★裁定R2: sort 数値は非露出＝並びは ∧∨（先頭の有効な区分が開栓時の既定） */}
                      <th style={{ width: 70 }}>並び</th>
                      <th>区分名</th>
                      <th className="col-state">状態</th>
                      <th className="col-act">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cats.map((c, i) => (
                      <tr key={c.id} style={c.is_active ? undefined : { opacity: 0.55 }}>
                        <td data-label="並び">
                          <span style={{ display: "inline-flex", gap: 4 }}>
                            <button type="button" className="nox-ordbtn" aria-label="上へ"
                              disabled={busy || i === 0} onClick={() => void moveCat(i, -1)}>∧</button>
                            <button type="button" className="nox-ordbtn" aria-label="下へ"
                              disabled={busy || i === cats.length - 1} onClick={() => void moveCat(i, 1)}>∨</button>
                          </span>
                        </td>
                        <td data-label="区分名">
                          {c.name}
                          {c.id === cats.find((x) => x.is_active)?.id && (
                            <span className="nox-stpill" style={{ marginLeft: 8, color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)" }}>既定</span>
                          )}
                        </td>
                        <td className="col-state" data-label="状態">
                          <span className={`nox-statebadge${c.is_active ? " on" : ""}`}><i />{c.is_active ? "有効" : "停止中"}</span>
                        </td>
                        <td className="col-act" data-label="操作">
                          <button type="button" style={btnLight} onClick={() => openEditCat(c)}>編集</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ fontSize: 11, color: "var(--sub)", margin: "10px 0 0", lineHeight: 1.7 }}>
              区分は削除せず「停止」で運用します（過去の伝票が区分を参照しているため）。
            </p>
          </section>

          <section className="nox-cardtop" style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>通常営業の料金スケジュール</h3>
              <button type="button" style={{ ...btnDark, marginLeft: "auto" }} onClick={openNewBand}>＋ 時間帯を追加</button>
            </div>
            {bands.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>
                時間帯料金は未設定です。すべての伝票に「基本料金」（会計設定タブのフォールバック値）が適用されています。
              </p>
            ) : (
              <div className="nox-ptwrap">
                <table className="nox-ptable">
                  <thead>
                    <tr>
                      {/* ★裁定115-②/117: priority 数値は UI 非露出（順序=表示順・数値は内部表現） */}
                      <th style={{ width: 86 }} title="条件が重なったときは上のルールが優先されます">並び</th>
                      <th>表示名</th>
                      <th>区分</th>
                      <th>時間帯</th>
                      <th>席種</th>
                      <th>適用日</th>
                      <th style={{ textAlign: "right" }}>セット料金</th>
                      <th style={{ textAlign: "right" }}>延長料金</th>
                      <th style={{ textAlign: "right" }}>同伴料金</th>
                      <th className="col-state">状態</th>
                      <th className="col-act">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bands.map((b, i) => (
                      <tr key={b.key}>
                        <td data-label="並び">
                          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                            <button type="button" className="nox-ordbtn" aria-label="上へ"
                              disabled={busy || i === 0} onClick={() => void moveBand(i, -1)}>∧</button>
                            <button type="button" className="nox-ordbtn" aria-label="下へ"
                              disabled={busy || i === bands.length - 1} onClick={() => void moveBand(i, 1)}>∨</button>
                            {/* ★裁定115-②: 表示先頭の active 帯＝既定（priority 最小・数値は非露出） */}
                            {i === bands.findIndex((x) => x.allActive) && (
                              <span className="nox-stpill" style={{ color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)" }}>既定</span>
                            )}
                          </span>
                        </td>
                        <td data-label="表示名">{b.name ?? "—"}</td>
                        {/* ★mig0128（裁定R4）: 区分名バッジ（全区分は無バッジ・v3 の pill 写像） */}
                        <td data-label="区分">
                          {b.category_id ? (
                            <span className="nox-stpill" style={{ color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)" }}>
                              {cats.find((c) => c.id === b.category_id)?.name ?? "不明な区分"}
                            </span>
                          ) : (
                            <span style={{ color: "var(--v2-muted)", fontSize: 11 }}>—</span>
                          )}
                        </td>
                        <td data-label="時間帯"><span style={t.num}>{bandTimeLabel(b)}</span></td>
                        <td data-label="席種">{b.seat_kind ?? "全席種"}</td>
                        <td data-label="適用日">{bandDowLabel(b)}</td>
                        <td data-label="セット料金" style={{ textAlign: "right" }}>{cellLabel(b.cells.set, true)}</td>
                        <td data-label="延長料金" style={{ textAlign: "right" }}>{cellLabel(b.cells.extension, true)}</td>
                        <td data-label="同伴料金" style={{ textAlign: "right" }}>{cellLabel(b.cells.dohan, false)}</td>
                        <td className="col-state" data-label="状態">
                          <button type="button" disabled={busy}
                            className={`nox-statebadge is-btn${b.allActive ? " on" : ""}`}
                            title={b.allActive ? "クリックで無効にする" : "クリックで有効にする"}
                            onClick={() => void toggleBand(b)}><i />{b.allActive ? "有効" : "無効"}</button>
                        </td>
                        <td className="col-act" data-label="操作">
                          <button type="button" style={btnLight} onClick={() => openEditBand(b)}>編集</button>
                          {b.extraCount > 0 && (
                            <span style={{ fontSize: 10.5, color: "var(--gold2)", display: "block" }}>
                              +{b.extraCount}件の重複ルール
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* E8-5 pricing⑥: 重複帯の警告（表示のみ・解決は現行どおり priority）。 */}
            {bandOverlaps.length > 0 && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 9, border: "1px solid var(--bad-bd)", background: "var(--bad-bg)" }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: "var(--bad)", margin: 0 }}>
                  条件が重複している時間帯があります（{bandOverlaps.length}組・上の行が適用されます）
                </p>
                {bandOverlaps.slice(0, 3).map((s, i) => (
                  <p key={i} style={{ fontSize: 11, color: "var(--sub)", margin: "3px 0 0" }}>・{s}</p>
                ))}
                {bandOverlaps.length > 3 && <p style={{ fontSize: 11, color: "var(--sub)", margin: "3px 0 0" }}>…ほか {bandOverlaps.length - 3} 組</p>}
              </div>
            )}
            {/* 修正d: モックの「重複禁止」注記は撤回（裁定D）＝priority 表示＋この文言に置換。
                E8-5 pricing⑥: 「狭い条件を上に」のガイドを追記。 */}
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "10px 0 0", lineHeight: 1.7 }}>
              条件が重なったときは<strong style={{ color: "var(--v2-text)" }}>上のルールが優先されます</strong>（∧∨で並び替え・一番上の有効な行が既定）。未設定の時間帯・席種は「基本料金」が適用されます。<br />
              ★<strong style={{ color: "var(--v2-text)" }}>狭い条件ほど上に</strong>置いてください（例:
              「金土のVIP」は「毎日・全席種」より上）。広い条件が上にあると、下の狭い条件には永久に届きません。<br />
              {/* R2-a（mig0098）: 延長の複数メニュー運用の注記（指示文言） */}
              延長は<strong style={{ color: "var(--v2-text)" }}>上から最初の一致が既定</strong>。
              開卓時に有効な全行が伝票へ凍結され、レジで選択できます（開卓後のここの変更は既存伝票に影響しません）。<br />
              {/* ★R7（対応表・v3 逐語1文）: 入店時刻でセット時間も決まる */}
              入店時刻でセット時間も決まります（例: 20:30入店→60分の帯・22:00入店→50分の帯）。
            </p>
          </section>

          {/* 料金プレビュー（pricing_resolve 直呼び） */}
          <section className="nox-cardtop" style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>料金プレビュー</h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ fontSize: 12 }}>入店日時{" "}
                <input type="datetime-local" value={pvAt} onChange={(e) => setPvAt(e.target.value)} style={input} />
              </label>
              <label style={{ fontSize: 12 }}>席種{" "}
                <SegSelect value={pvSeat} onChange={(v) => setPvSeat(v)}
            options={[["", "卓（既定）"], ["卓", "卓"], ["カウンター", "カウンター"], ["VIP", "VIP"]] as const} />
              </label>
              <label style={{ fontSize: 12 }}>人数{" "}
                <input type="number" min={1} max={30} value={pvGuests}
                  onChange={(e) => setPvGuests(Math.max(1, Number(e.target.value)))} style={{ ...input, width: 64 }} />
              </label>
              <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <button type="button" role="switch" aria-checked={pvDohan}
                  className={pvDohan ? "nox-switch on" : "nox-switch"} onClick={() => setPvDohan((v) => !v)}><i /></button>
                同伴あり
              </label>
              <label style={{ fontSize: 12 }}>支払方法{" "}
                <SegSelect value={pvPay} onChange={(v) => setPvPay(v as "cash" | "card")}
            options={[["cash", "現金"], ["card", "カード"]] as const} />
              </label>
              <button type="button" style={btnDark} onClick={() => void runPreview()}>この条件で計算</button>
            </div>
            {pvErr && <p style={{ fontSize: 12.5, color: "var(--bad)", margin: "10px 0 0" }}>{pvErr}</p>}
            {pvOut && (
              <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 2 }}>
                <div>
                  セット料金 <span style={t.num}>{yen(pvOut.setAmount)}</span>
                  <span style={{ color: "var(--sub)" }}>
                    {"　"}({pvOut.setMin}分・{store.time_per === "person" ? `${pvOut.units}名分` : "卓単位"}・
                    {pvOut.setSrc === "rule" ? "時間帯ルール適用" : "基本料金"})
                  </span>
                </div>
                {pvOut.dohanUnit != null && (
                  <div>
                    同伴料金 <span style={t.num}>{yen(pvOut.dohanUnit * pvGuests)}</span>
                    <span style={{ color: "var(--sub)" }}>
                      {"　"}({yen(pvOut.dohanUnit)} × {pvGuests}名・{pvOut.dohanSrc === "rule" ? "時間帯ルール適用" : "基本料金"})
                    </span>
                  </div>
                )}
                <div>サービス料 <span style={t.num}>{yen(pvOut.svc)}</span><span style={{ color: "var(--sub)" }}>　({store.service_rate}%)</span></div>
                <div style={{ fontWeight: 700 }}>
                  初回セット概算 <span style={{ ...t.num, color: "var(--champ)", fontSize: 15 }}>{yen(pvOut.total)}</span>
                  <span style={{ color: "var(--sub)", fontWeight: 400 }}>　(丸め{store.round_unit}円・{store.round_mode === "up" ? "切上" : store.round_mode === "round" ? "四捨五入" : "切捨"})</span>
                </div>
                {pvPay === "card" && (
                  <div>
                    カードTAX概算 <span style={t.num}>{yen(pvOut.cardTax)}</span>
                    <span style={{ color: "var(--sub)" }}>　({store.card_tax_rate}%・日報集計用＝伝票請求額には含まれません)</span>
                  </div>
                )}
                <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "6px 0 0" }}>
                  商品・指名料・延長を含まない簡易プレビューです。同伴人数は入店人数と同じとみなしています。
                </p>
              </div>
            )}
          </section>

        </>
      )}

      {/* ═══ 料金マスタ（T1 新設＝v3 タブ1・M1/M2/M3） ═══ */}
      {tab === "master" && (
        <>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 12px", lineHeight: 1.7 }}>
            お客さまに「いくら請求するか」の正本です。どの時間帯・席種・区分に当たるかは「料金適用ルール」タブで決めます。
          </p>

          {/* ★M1（対応表・移設）: 指名・同伴料金＝PricingPanel の指名3値区画（stores 基本値・RPC 不変） */}
          <section className="nox-cardtop" style={{ ...card, marginBottom: 14 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>指名・同伴料金</h3>
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px", lineHeight: 1.7 }}>
              請求単価のみを管理します。次に開く伝票からスナップショットされます（開いている伝票には遡及しません）。
              ここで設定するのはお客さまへの請求額です。待遇プランの「指名実績バック」とは連動しません。
            </p>
            <PricingPanel storeId={storeId} fields="shimei" initial={{
              hon_fee: store.hon_fee, jonai_fee: store.jonai_fee, dohan_fee: store.dohan_fee,
              service_rate: store.service_rate, card_tax_rate: store.card_tax_rate,
              round_unit: store.round_unit, round_mode: store.round_mode,
            }} />
          </section>

          {/* ★M2（対応表・移設）: 指名料金（ランク別）＝実体不変・配置替えのみ */}
          <section className="nox-cardtop" style={{ ...card, marginBottom: 14 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>指名料金（ランク別）</h3>
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px", lineHeight: 1.7 }}>
              ランクごとの指名料です。空欄のランクは「既定」→「基本料金の指名料」の順で適用されます。
              キャストへのランク割当はキャスト管理側で行います（未割当キャストは既定が適用）。
            </p>
            <div className="nox-ptwrap">
              <table className="nox-ptable">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>並び</th>
                    <th>ランク</th>
                    <th style={{ textAlign: "right" }}>本指名料</th>
                    <th style={{ textAlign: "right" }}>場内指名料</th>
                    <th className="col-state">状態</th>
                    <th className="col-act">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {[{ key: "__default", label: "既定（ランクなし）" },
                    ...ranks.map((r, i) => ({ key: r.id, label: r.name, rank: r, idx: i }))].map((row) => {
                    const vals = rankVals[row.key] ?? { hon: "", jonai: "" };
                    const isDefault = row.key === "__default";
                    const rank = "rank" in row ? (row as { rank: CastRank }).rank : null;
                    const idx = "idx" in row ? (row as { idx: number }).idx : -1;
                    return (
                      <tr key={row.key}>
                        <td data-label="並び">
                          {!isDefault && (
                            <span style={{ display: "inline-flex", gap: 4 }}>
                              <button type="button" className="nox-ordbtn" aria-label="上へ"
                                disabled={busy || idx === 0} onClick={() => void moveRank(idx, -1)}>∧</button>
                              <button type="button" className="nox-ordbtn" aria-label="下へ"
                                disabled={busy || idx === ranks.length - 1} onClick={() => void moveRank(idx, 1)}>∨</button>
                            </span>
                          )}
                        </td>
                        <td data-label="ランク">
                          <span className="nox-pt-name">{row.label}</span>
                          {isDefault && (
                            <small style={{ display: "block", fontSize: 10.5, color: "var(--sub)", marginTop: 2 }}>
                              ランク行が優先されます
                            </small>
                          )}
                        </td>
                        <td data-label="本指名料" style={{ textAlign: "right" }}>
                          <input type="number" min={0} value={vals.hon}
                            placeholder={isDefault ? `基本 ${yen(store.hon_fee)}` : "既定を適用"}
                            onChange={(e) => setRankVals((p) => ({ ...p, [row.key]: { ...vals, hon: e.target.value } }))}
                            style={{ ...input, width: 110, textAlign: "right" }} />
                        </td>
                        <td data-label="場内指名料" style={{ textAlign: "right" }}>
                          <input type="number" min={0} value={vals.jonai}
                            placeholder={isDefault ? `基本 ${yen(store.jonai_fee)}` : "既定を適用"}
                            onChange={(e) => setRankVals((p) => ({ ...p, [row.key]: { ...vals, jonai: e.target.value } }))}
                            style={{ ...input, width: 110, textAlign: "right" }} />
                        </td>
                        <td className="col-state" data-label="状態">
                          {rank ? (
                            <button type="button" disabled={busy}
                              className={`nox-statebadge is-btn${rank.is_active ? " on" : ""}`}
                              title={rank.is_active ? "クリックで無効にする" : "クリックで有効にする"}
                              onClick={() => void toggleRank(rank)}><i />{rank.is_active ? "有効" : "無効"}</button>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--sub)" }}>常時</span>
                          )}
                        </td>
                        <td className="col-act" data-label="操作">
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <button type="button" style={btnLight} disabled={busy}
                              onClick={() => void saveRankRow(row.key)}>保存</button>
                            {rank && (() => {
                              const castRefs = rankCastRefs[rank.id] ?? 0;
                              const ruleRefs = rules.filter((x) => x.rank_id === rank.id).length;
                              const inUse = castRefs + ruleRefs > 0;
                              return (
                                <>
                                  <button type="button" disabled={busy || inUse}
                                    title={inUse ? `使用中（割当${castRefs}件・ルール${ruleRefs}件）` : "このランクを削除"}
                                    style={{ ...btnLight, color: inUse ? "var(--sub)" : "var(--bad)" }}
                                    onClick={() => void deleteRank(rank)}>削除</button>
                                  {inUse && (
                                    <span style={{ fontSize: 10.5, color: "var(--sub)", display: "block" }}>
                                      割当{castRefs}・ルール{ruleRefs}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
              <input value={newRankName} onChange={(e) => setNewRankName(e.target.value)}
                placeholder="新しいランク名（例: S）" style={{ ...input, width: 180 }} />
              <button type="button" style={btnLight} disabled={busy || !newRankName.trim()}
                onClick={() => void addRank()}>＋ ランクを追加</button>
            </div>
          </section>

          {/* ★M3（対応表・新設）: 名前付き料金（表示グループ）＝rules を name で束ねた読み取り専用ビュー */}
          <section className="nox-cardtop" style={card}>
            <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>名前付き料金（表示グループ）</h3>
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px", lineHeight: 1.7 }}>
              料金適用ルールの行を名前でまとめた一覧表示です。編集は「料金適用ルール」タブで行います。
            </p>
            {(() => {
              const named = new Map<string, PricingRule[]>();
              for (const r of [...rules].sort(ruleOrder)) {
                if (r.name === null || !(TIMED_KINDS as readonly string[]).includes(r.fee_kind)) continue;
                const arr = named.get(r.name) ?? [];
                arr.push(r);
                named.set(r.name, arr);
              }
              if (named.size === 0) {
                return (
                  <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>
                    名前付きの料金ルールはまだありません（帯の「表示名」を付けるとここに並びます）。
                  </p>
                );
              }
              return (
                <div className="nox-ptwrap">
                  <table className="nox-ptable">
                    <thead>
                      <tr>
                        <th>名前（表示用）</th>
                        <th style={{ textAlign: "right" }}>セット料金</th>
                        <th style={{ textAlign: "right" }}>延長料金</th>
                        <th className="col-state">状態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...named.entries()].map(([nm, rs]) => {
                        const rep = (fk: string) => rs.find((r) => r.fee_kind === fk);
                        const allOn = rs.every((r) => r.is_active);
                        return (
                          <tr key={nm}>
                            <td data-label="名前">
                              <span className="nox-pt-name">{nm}</span>
                              <small style={{ display: "block", fontSize: 10.5, color: "var(--sub)", marginTop: 2 }}>
                                ルール{rs.length}行がこの名前を使用
                              </small>
                            </td>
                            <td data-label="セット料金" style={{ textAlign: "right" }}>{cellLabel(rep("set"), true)}</td>
                            <td data-label="延長料金" style={{ textAlign: "right" }}>{cellLabel(rep("extension"), true)}</td>
                            <td className="col-state" data-label="状態">
                              <span className={`nox-statebadge${allOn ? " on" : ""}`}><i />{allOn ? "有効" : "一部無効"}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            <p style={{ fontSize: 11, color: "var(--sub)", margin: "10px 0 0", lineHeight: 1.7 }}>
              この表は別のマスタではありません。同じ名前を持つ料金ルールをまとめて見せているだけです。
              どの時間帯・席種・区分に当たるかは「料金適用ルール」タブが正本です。
            </p>
          </section>
        </>
      )}

      {/* ═══ 会計ルール ═══
          ★DP-R 第3弾残（教訓26＝構造照合・裁定「A 採用＝読み取り専用ミラー＋基本料金への導線」）:
            モック nox-pricing-settings の会計ルールは**4カード**（営業日・時間計算／税・サービス料／
            端数・精算／確認・権限）。従来の実装は**1カードの注記**だけだった。
          ★齟齬の扱い（申告→裁定 A）: サービス料・カード手数料・端数単位・端数処理方法は
            `set_store_pricing` の引数で、**指名料（本指名・場内・同伴）と同一の upsert**。
            自動延長（time_mode）も `set_store_time_pricing` の引数。どちらも UI は「基本料金」タブの
            パネル1枚で保存する。ここへ入力を移すと **1本の atomic な upsert が2タブに割れる**ため、
            **この面は読み取り専用のミラー**にとどめ、編集導線だけを出す。
            ★保存系 RPC・PricingPanel / TimePricingPanel の保存経路は1文字も触っていない。
          ★表示値は**ページ読込時のスナップショット**（initial.store）＝基本料金タブで保存した直後は
            再読込で反映される。そのことも画面に書く（古い値を新しい値のように見せない）。
          ★列が無い項目（内税・外税／税計算前の値引き／締め後の伝票修正権限／監査ログ保存期間）は
            器を置いて disabled＋「準備中」（教訓25＝押しても何も起きないものを作らない）。 */}
      {tab === "checkout" && (
        <>
        {/* ① 営業日・時間計算 */}
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14 }}>営業日・時間計算</h3>
              <p style={{ fontSize: 11, color: "var(--sub)", margin: "2px 0 0" }}>伝票の日付と時間料金の基準</p>
            </div>
            <span className="nox-stpill" style={{ marginLeft: "auto" }}>DATE &amp; TIME</span>
          </div>
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              営業日の切替時刻
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>この時刻までは前日の売上として集計します。</span>
            </span>
            <b className="num">{bizCutoffHm}</b>
            <a href="/master/business-hours" style={{ ...btnLight, textDecoration: "none" }}>営業時間で編集</a>
          </div>
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              時間課金の確定
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>
                料率は伝票を開いた時刻の時間帯ルールで確定し、以後の設定変更・席移動・日付跨ぎでは変わりません
                （延長も開栓時の料率で加算）。指名料のランクだけは、指名行を追加した時点のランクで決まります。
              </span>
            </span>
            <b>伝票オープン時</b>
            <span className="nox-stpill">固定</span>
          </div>
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              自動延長
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>
                セット時間を過ぎたぶんの延長料金を自動で足すかどうかです。
                （セット {store.set_min}分 {yen(store.set_fee)} ／ 延長 {store.ext_min}分 {yen(store.ext_fee)}・
                単位は{store.time_per === "person" ? "1名ごと" : "1卓ごと"}）
              </span>
            </span>
            <b>{store.time_mode === "auto" ? "自動で足す" : "手動で足す"}</b>
            <span style={{ fontSize: 11, color: "var(--sub)" }}>下の「基本料金」で編集</span>
          </div>
        </section>

        {/* ★M4（対応表・裁定確定＝D5）: 基本料金（フォールバック）＝TimePricingPanel を会計設定へ移設 */}
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14 }}>基本料金（フォールバック）</h3>
              <p style={{ fontSize: 11, color: "var(--sub)", margin: "2px 0 0" }}>
                ルールが1件も一致しないときに使われます（店単位の独立した値・席種別のフォールバックはありません）。
              </p>
            </div>
            <span className="nox-stpill" style={{ marginLeft: "auto" }}>FALLBACK</span>
          </div>
          <TimePricingPanel storeId={storeId} initial={{
            set_min: store.set_min, set_fee: store.set_fee, ext_min: store.ext_min, ext_fee: store.ext_fee,
            time_mode: store.time_mode, time_per: store.time_per,
          }} />
        </section>

        {/* ② 税・サービス料（★A2: サ料/カード手数料の編集をここへ集約＝M1 分割の受け側・税 form 不触） */}
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14 }}>税・サービス料</h3>
              <p style={{ fontSize: 11, color: "var(--sub)", margin: "2px 0 0" }}>伝票に加算する料率と計算順</p>
            </div>
            <span className="nox-stpill" style={{ marginLeft: "auto" }}>TAX</span>
          </div>
          {/* ★A2（対応表・移設）: read-only ミラー2行＋別タブ導線 → 編集区画へ置換（RPC set_store_pricing 不変・
              担当外フィールドは保存直前にサーバ現在値で埋める＝PricingPanel fields 分割の仕組み） */}
          <div style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <PricingPanel storeId={storeId} fields="service" initial={{
              hon_fee: store.hon_fee, jonai_fee: store.jonai_fee, dohan_fee: store.dohan_fee,
              service_rate: store.service_rate, card_tax_rate: store.card_tax_rate,
              round_unit: store.round_unit, round_mode: store.round_mode,
            }} />
          </div>
          {/* ★C4 §6-5（裁定90/91・T5）: 旧「内税/外税/適用しない」の同列3択を解体し2軸へ。
              価格表示（内税/外税）と事業者区分（課税/免税）は別概念＝免税は税計算方式ではなく店舗属性。
              保存は set_store_tax_config へ**7引数全値明示**（原則7）。開栓済み伝票へは非遡及（mig0113 凍結）。 */}
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              価格表示
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>料金を税込で持つか・税抜で持って会計時に消費税を加えるか。</span>
            </span>
            <SegSelect value={tPd} onChange={(v) => setTPd(v)}
              options={[["tax_included", "内税"], ["tax_excluded", "外税"]] as const} />
          </div>
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              事業者区分
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>免税事業者は消費税の区分記載を行いません（適格簡易請求書は発行不可）。</span>
            </span>
            <SegSelect value={tBts} onChange={(v) => { setTBts(v); if (v !== "taxable") setTInv("unregistered"); }}
              options={[["taxable", "課税事業者"], ["exempt", "免税事業者"]] as const} />
          </div>
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              インボイス
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>適格請求書発行事業者の登録（課税事業者のみ）。</span>
            </span>
            <SegSelect value={tInv} onChange={(v) => setTInv(v)}
              options={[["unregistered", "未登録"], ["registered", "登録済み"]] as const} />
          </div>
          {tInv === "registered" && (
            <div className="nox-listrow">
              <span style={{ flex: 1, minWidth: 0 }}>
                登録番号
                <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>T＋数字13桁（レシートの適格簡易請求書に印字されます）。</span>
              </span>
              <input type="text" value={tReg} maxLength={14} placeholder="T1234567890123"
                onChange={(e) => setTReg(e.target.value)} style={{ ...input, width: 180 }} />
            </div>
          )}
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              税額の端数
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>一伝票につき税率ごとに1回だけ処理します（金額側の丸めとは別）。</span>
            </span>
            <SegSelect value={tRnd} onChange={(v) => setTRnd(v)}
              options={[["floor", "切り捨て"], ["round", "四捨五入"], ["ceil", "切り上げ"]] as const} />
          </div>
        </section>

        {/* ★C4 §6-6 の器（裁定90-⑤・裁定87 第2層）: card_surcharge_rate。結線（伝票行化）は §6-6 で別途 */}
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14 }}>カード手数料の転嫁</h3>
              <p style={{ fontSize: 11, color: "var(--sub)", margin: "2px 0 0" }}>客への請求項目（課税10%）。日報集計用のカードTAXとは別です。</p>
            </div>
            <span className="nox-stpill" style={{ marginLeft: "auto" }}>SURCHARGE</span>
          </div>
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              カード手数料を客へ請求する
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>無効（既定）では請求項目になりません。</span>
            </span>
            <SegSelect value={tSurOn ? "on" : "off"} onChange={(v) => setTSurOn(v === "on")}
              options={[["off", "無効"], ["on", "有効"]] as const} />
            {tSurOn && (
              <input type="number" min={1} max={100} value={tSurRate} placeholder="%"
                onChange={(e) => setTSurRate(e.target.value)} style={{ ...input, width: 76 }} />
            )}
          </div>
          {tSurOn && (
            <div style={{ fontSize: 11.5, color: "var(--warn, #b45309)", margin: "6px 0 2px" }}>
              加盟店契約でカード手数料の転嫁が禁止・制限されている場合があります。契約上の可否を確認してください
              {taxSavedSur === null && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, color: "var(--fg)" }}>
                  <input type="checkbox" checked={tSurAck} onChange={(e) => setTSurAck(e.target.checked)} />
                  契約上の可否を確認しました（保存すると確認の記録が残ります）
                </label>
              )}
            </div>
          )}
        </section>

        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: "var(--sub)", flex: 1, minWidth: 0 }}>
              税設定の保存は開栓済みの伝票に影響しません（開栓時の設定で凍結・mig0113）。
            </span>
            {taxMsg && <span style={{ fontSize: 12 }}>{taxMsg}</span>}
            <button style={btnDark} disabled={taxBusy} onClick={() => void saveTaxConfig()}>税設定を保存</button>
          </div>
        </section>

        {/* ③ 端数・精算（読み取り専用ミラー） */}
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14 }}>端数・精算</h3>
              <p style={{ fontSize: 11, color: "var(--sub)", margin: "2px 0 0" }}>最終金額の丸めと割引処理</p>
            </div>
            <span className="nox-stpill" style={{ marginLeft: "auto" }}>ROUNDING</span>
          </div>
          {/* ★A4（対応表・移設）: 丸め2値の read-only ミラー → 編集区画へ置換（最終合計の丸め・税端数とは別） */}
          <div style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <PricingPanel storeId={storeId} fields="round" initial={{
              hon_fee: store.hon_fee, jonai_fee: store.jonai_fee, dohan_fee: store.dohan_fee,
              service_rate: store.service_rate, card_tax_rate: store.card_tax_rate,
              round_unit: store.round_unit, round_mode: store.round_mode,
            }} />
          </div>
          <div className="nox-listrow" style={{ opacity: 0.55 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              値引きを税計算前に適用
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>切替は準備中です。</span>
            </span>
            <button type="button" className="nox-switch" disabled aria-disabled><i /></button>
            <span className="nox-stpill">準備中</span>
          </div>
        </section>

        {/* ④ 確認・権限（列が無い＝器のみ） */}
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14 }}>確認・権限</h3>
              <p style={{ fontSize: 11, color: "var(--sub)", margin: "2px 0 0" }}>誤操作を防ぐ会計フロー</p>
            </div>
            <span className="nox-stpill" style={{ marginLeft: "auto" }}>CONTROL</span>
          </div>
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              会計確定前の確認
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>
                レジの会計は「請求を確認 → 入金 → 会計を完了」の3段で、確認画面は常に表示されます（切替はありません）。
              </span>
            </span>
            <b>常に表示</b>
            <span className="nox-stpill">固定</span>
          </div>
          <div className="nox-listrow" style={{ opacity: 0.55 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              締め後の伝票修正
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>権限の切替は準備中です。</span>
            </span>
            <div className="nox-seg">
              <button disabled>許可しない</button>
              <button disabled>管理者のみ</button>
              <button disabled>すべて許可</button>
            </div>
            <span className="nox-stpill">準備中</span>
          </div>
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              監査ログ
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>
                料金・伝票の変更履歴は全件記録されます（保存期間の設定は準備中）。履歴は「操作履歴」画面で確認できます。
              </span>
            </span>
            <a href="/audit" style={{ ...btnLight, textDecoration: "none" }}>操作履歴を見る</a>
          </div>
        </section>

        <p style={{ fontSize: 11, color: "var(--sub)", margin: "0 0 8px", lineHeight: 1.8 }}>
          {/* ★段②b: 「基本料金」タブは廃止＝編集はこのタブ内へ集約（D5）。読み取り専用の残りは営業日切替時刻のみ */}
          保存直後の値は、この画面を開き直すと反映されます。変更内容は<b>新しく開く伝票から</b>反映されます。
        </p>
        </>
      )}

      {/* ═══ 料金区分モーダル（裁定116・mig0127） ═══ */}
      {catModalOpen && (
        <Modal onClose={() => setCatModalOpen(false)} maxWidth={440}>
          <div className="nox-formmodal-head">
            <strong>{catEditId !== null ? "料金区分を編集" : "料金区分を追加"}</strong>
            <button type="button" className="nox-formmodal-x" onClick={() => setCatModalOpen(false)} aria-label="閉じる">×</button>
          </div>
          <div className="nox-field">
            <span className="lab">区分名（40文字まで）</span>
            <input type="text" value={cName} maxLength={40} placeholder="例 初来店"
              onChange={(e) => setCName(e.target.value)} style={inputLg} />
          </div>
          <div className="nox-field">
            <span className="lab">状態</span>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <button type="button" role="switch" aria-checked={cActive}
                className={cActive ? "nox-switch on" : "nox-switch"} onClick={() => setCActive((v) => !v)}><i /></button>
              この区分を有効にする
            </label>
            <span className="hint">停止中の区分は開栓時に選べません（削除はしない運用です）。</span>
          </div>
          {cErr && <p style={{ fontSize: 12.5, color: "var(--bad)", margin: "8px 0 0" }}>{cErr}</p>}
          <div className="nox-formmodal-foot">
            <button type="button" style={btnGhostLg} disabled={busy} onClick={() => setCatModalOpen(false)}>キャンセル</button>
            <button type="button" style={btnPrimaryLg} disabled={busy} onClick={() => void saveCat()}>この区分を保存</button>
          </div>
        </Modal>
      )}

      {/* ═══ 帯編集モーダル（モックの drawer 相当） ═══ */}
      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} maxWidth={560} scroll>
          <div className="nox-formmodal-head">
            <strong>{editKey !== null ? "時間帯料金を編集" : "時間帯料金を追加"}</strong>
            <button type="button" className="nox-formmodal-x" onClick={() => setModalOpen(false)} aria-label="閉じる">×</button>
          </div>

          <div className="nox-field">
            <span className="lab">時間帯（両方空欄＝終日）</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="time" value={mFrom} onChange={(e) => setMFrom(e.target.value)} style={inputLg} />
              <span style={{ color: "var(--sub)" }}>〜</span>
              <input type="time" value={mTo} onChange={(e) => setMTo(e.target.value)} style={inputLg} />
            </div>
            <span className="hint">
              {bizCutoffHm} より前は「翌日」の時刻として扱います。終了時刻の1分前までが適用範囲です。
              営業日区切りを跨ぐ帯は保存できません（2行に分けてください）。
              {/* ★R10（§4-a 確定）: 時間だけのルール禁止の hint */}
              時間帯だけを先に作ることはできません（料金とセットで保存します）。
            </span>
            {cutoffWholeDay && (
              <span className="hint" style={{ color: "var(--gold2)" }}>
                開始と終了が営業日区切り（{bizCutoffHm}）と同時刻のため「終日の帯」として保存されます。
              </span>
            )}
          </div>

          {/* ★mig0107（P-1）: 表示名（任意）。時間帯の直下＝帯を識別する情報のまとまりに置く。
              1帯の最大3行（set/extension/dohan）へ同じ値が配られる。空欄は null（未設定）。 */}
          <div className="nox-field">
            <span className="lab">表示名（任意・40文字まで）</span>
            <input
              type="text" value={mName} maxLength={40}
              placeholder="例 平日ナイト"
              onChange={(e) => setMName(e.target.value)}
              style={inputLg}
            />
            <span className="hint">一覧での見分け用です。料金の適用条件には影響しません（空欄可）。</span>
          </div>

          {/* ★mig0112（C3・裁定90-②）: 税区分。UI 露出は3値＝taxable_8 は enum に存在するが準備中
              （複数税率レシートの完全対応＝F5 と同時に開放・解錠に mig 不要）。帯の3行へ同値が配られる。 */}
          <div className="nox-field">
            <span className="lab">税区分</span>
            <SegSelect value={mTax} onChange={(v) => setMTax(v)}
              options={[["taxable_10", "課税10%"], ["exempt", "非課税"], ["out_of_scope", "不課税"]] as const} />
            <span className="hint">
              通常の料金は課税10%です。非課税・不課税は取引の性質で決まる場合のみ選択してください（軽減税率8%は準備中）。
            </span>
          </div>

          <div className="nox-field">
            <span className="lab">席種</span>
            <SegSelect value={mSeat} onChange={(v) => setMSeat(v)}
            options={[["", "全席種"], ["卓", "卓"], ["カウンター", "カウンター"], ["VIP", "VIP"]] as const} />
          </div>

          {/* ★mig0128（D3・裁定R4）: 料金区分（帯単位1値＝保存で3行へ同値配布）。選択肢=active 区分
              （sort 順）＋「全区分」（既定）。停止中区分は既存帯が参照中の場合のみ現値として表示。 */}
          {(cats.some((c) => c.is_active) || mCat !== "") && (
            <div className="nox-field">
              <span className="lab">料金区分</span>
              <select value={mCat} onChange={(e) => setMCat(e.target.value)} style={{ ...inputLg, width: "100%" }}>
                <option value="">全区分（区分を問わず適用）</option>
                {cats.filter((c) => c.is_active).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                {mCat !== "" && !cats.some((c) => c.is_active && c.id === mCat) && (
                  <option value={mCat}>
                    {cats.find((c) => c.id === mCat)?.name ?? "（不明な区分）"}（停止中）
                  </option>
                )}
              </select>
              <span className="hint">
                区分を指定すると、その区分で開栓した伝票にだけこの帯が適用されます（同じ並びでは区分付きが優先）。
              </span>
            </div>
          )}

          <div className="nox-field">
            <span className="lab">適用日</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DOW_LABELS.map((d, i) => (
                <button key={d} type="button" style={dayChip(mDays[i])}
                  onClick={() => setMDays((p) => p.map((v, j) => (j === i ? !v : v)))}>{d}</button>
              ))}
            </div>
          </div>

          <div className="nox-field">
            <span className="lab">料金（空欄＝その料金はこの帯では設定しない）</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ fontSize: 12, color: "var(--sub)" }}>セット料金（円）
                <input type="number" min={0} value={mSetFee} onChange={(e) => setMSetFee(e.target.value)}
                  style={{ ...inputLg, marginTop: 4 }} placeholder={`基本 ${yen(store.set_fee)}`} />
              </label>
              <label style={{ fontSize: 12, color: "var(--sub)" }}>セット時間（分・空欄＝基本 {store.set_min}分）
                <input type="number" min={1} value={mSetMin} onChange={(e) => setMSetMin(e.target.value)}
                  disabled={mSetFee === ""} style={{ ...inputLg, marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, color: "var(--sub)" }}>延長料金（円）
                <input type="number" min={0} value={mExtFee} onChange={(e) => setMExtFee(e.target.value)}
                  style={{ ...inputLg, marginTop: 4 }} placeholder={`基本 ${yen(store.ext_fee)}`} />
              </label>
              <label style={{ fontSize: 12, color: "var(--sub)" }}>延長単位（分・空欄＝基本 {store.ext_min}分）
                <input type="number" min={1} value={mExtMin} onChange={(e) => setMExtMin(e.target.value)}
                  disabled={mExtFee === ""} style={{ ...inputLg, marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, color: "var(--sub)" }}>同伴料金（円・人数分加算）
                <input type="number" min={0} value={mDohan} onChange={(e) => setMDohan(e.target.value)}
                  style={{ ...inputLg, marginTop: 4 }} placeholder={`基本 ${yen(store.dohan_fee)}`} />
              </label>
            </div>
          </div>

          <div className="nox-field">
            <span className="lab">状態</span>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <button type="button" role="switch" aria-checked={mActive}
                className={mActive ? "nox-switch on" : "nox-switch"} onClick={() => setMActive((v) => !v)}><i /></button>
              この時間帯を有効にする
            </label>
          </div>

          {mErr && <p style={{ fontSize: 12.5, color: "var(--bad)", margin: "8px 0 0" }}>{mErr}</p>}

          <div className="nox-formmodal-foot">
            {editKey !== null && (
              <button type="button" style={{ ...btnGhostLg, color: "var(--bad)" }} disabled={busy}
                onClick={() => void deleteBand()}>削除</button>
            )}
            <button type="button" style={btnGhostLg} disabled={busy} onClick={() => setModalOpen(false)}>キャンセル</button>
            <button type="button" style={btnPrimaryLg} disabled={busy} onClick={() => void saveBand()}>
              この時間帯を保存
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
