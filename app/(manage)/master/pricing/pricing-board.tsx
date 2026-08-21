"use client";

// 料金設定ボード（料金UIレーン C1・モック nox-rate-settings-redesign.html 準拠＋修正4点）。
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
// ★モックから意図的に落としたもの: 帯の「表示名」（pricing_rules に列がない）・
//   「料金単位 卓/名」列（stores.time_per＝店単位の設定でルール軸ではない＝基本料金タブで設定）。
// ★書込は全て RPC 専任。エラーは fn_set_pricing_rule の bad 系トークン対応表で日本語化。
import { useCallback, useEffect, useState } from "react";
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
};
export type CastRank = { id: string; name: string; sort_order: number; is_active: boolean };
// ★DP-R: 端数処理方法の表示語（pricing-panel の option と同語彙）
const ROUND_MODE_LABEL: Record<string, string> = { down: "切り捨て", up: "切り上げ", round: "四捨五入" };

export type StoreFallback = {
  hon_fee: number; jonai_fee: number; dohan_fee: number;
  service_rate: number; card_tax_rate: number; round_unit: number; round_mode: string;
  set_min: number; set_fee: number; ext_min: number; ext_fee: number;
  time_mode: string; time_per: string;
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
};

function bandKeyOf(r: PricingRule): string {
  return `${r.seat_kind ?? "*"}|${r.dow_mask ?? "*"}|${r.time_from_min ?? "*"}|${r.time_to_min ?? "*"}`;
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
        cells: {}, all: [], extraCount: 0, priority: r.priority, allActive: true,
      };
      map.set(key, b);
    }
    b.all.push(r);
    const fk = r.fee_kind as TimedKind;
    if (!b.cells[fk]) b.cells[fk] = r; else b.extraCount++;
    b.priority = Math.min(b.priority, r.priority);
    b.allActive = b.allActive && r.is_active;
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
  const [tab, setTab] = useState<"timed" | "base" | "checkout">("timed");
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

  /** set_pricing_rule の12引数を組んで呼ぶ（原則7＝全値明示）。 */
  async function upsertRule(p: {
    id: string | null; fee_kind: string; seat_kind: string | null; dow_mask: number | null;
    from: number | null; to: number | null; rank_id: string | null;
    amount: number; duration_min: number | null; priority: number; is_active: boolean;
  }): Promise<string | null> {
    const { error } = await supabase.rpc("set_pricing_rule", {
      p_id: p.id, p_store_id: storeId, p_fee_kind: p.fee_kind, p_seat_kind: p.seat_kind,
      p_dow_mask: p.dow_mask, p_time_from_min: p.from, p_time_to_min: p.to,
      p_rank_id: p.rank_id, p_amount: p.amount, p_duration_min: p.duration_min,
      p_priority: p.priority, p_is_active: p.is_active,
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
  const [mErr, setMErr] = useState<string | null>(null);

  function openNewBand() {
    setEditKey(null); setMSeat(""); setMDays(Array(7).fill(true));
    setMFrom(""); setMTo(""); setMSetFee(""); setMSetMin(""); setMExtFee(""); setMExtMin("");
    setMDohan(""); setMActive(true); setMErr(null); setModalOpen(true);
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
        priority: existing?.priority ?? 100, is_active: true,
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
    set: { amount: number; min: number; src: "rule" | "base" };
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
      Array.isArray(r.data) && r.data.length ? r.data[0] as { amount: number; duration_min: number | null } : null;
    const s = row(rs), e = row(re), d = row(rd);
    setLiveNow({
      at: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      set: { amount: s?.amount ?? store.set_fee, min: s?.duration_min ?? store.set_min, src: s ? "rule" : "base" },
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
    <div>
      <Toast msg={msg} />

      <MasterPageHead
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

      {/* 3タブ（モックの tab-timed / tab-base / tab-checkout） */}
      <div className="nox-pillbar" style={{ marginBottom: 12 }}>
        {([["timed", "時間帯料金"], ["base", "基本料金"], ["checkout", "会計ルール"]] as const).map(([k, label]) => (
          <button key={k} type="button" className={`nox-pill${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ 時間帯料金 ═══ */}
      {tab === "timed" && (
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
          <section className="nox-cardtop" style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>通常営業の料金スケジュール</h3>
              <button type="button" style={{ ...btnDark, marginLeft: "auto" }} onClick={openNewBand}>＋ 時間帯を追加</button>
            </div>
            {bands.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>
                時間帯料金は未設定です。すべての伝票に「基本料金」（基本料金タブ）が適用されています。
              </p>
            ) : (
              <div className="nox-ptwrap">
                <table className="nox-ptable">
                  <thead>
                    <tr>
                      <th style={{ width: 86 }} title="重複時は優先順位の小さい行が適用されます">優先</th>
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
                        <td data-label="優先">
                          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                            <button type="button" className="nox-ordbtn" aria-label="上へ"
                              disabled={busy || i === 0} onClick={() => void moveBand(i, -1)}>∧</button>
                            <button type="button" className="nox-ordbtn" aria-label="下へ"
                              disabled={busy || i === bands.length - 1} onClick={() => void moveBand(i, 1)}>∨</button>
                            <span style={{ ...t.num, color: "var(--sub)", fontSize: 11 }}>{b.priority}</span>
                          </span>
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
                  条件が重複している時間帯があります（{bandOverlaps.length}組・優先順位の小さい行が適用されます）
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
              条件が重複するときは優先順位（数字の小さい行）が適用されます。未設定の時間帯・席種は「基本料金」が適用されます。<br />
              ★<strong style={{ color: "var(--v2-text)" }}>狭い条件ほど上に</strong>置いてください（例:
              「金土のVIP」は「毎日・全席種」より上）。広い条件が上にあると、下の狭い条件には永久に届きません。<br />
              {/* R2-a（mig0098）: 延長の複数メニュー運用の注記（指示文言） */}
              延長は<strong style={{ color: "var(--v2-text)" }}>上から最初の一致が既定</strong>。
              開卓時に有効な全行が伝票へ凍結され、レジで選択できます（開卓後のここの変更は既存伝票に影響しません）。
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
                <select value={pvSeat} onChange={(e) => setPvSeat(e.target.value)} style={input}>
                  <option value="">卓（既定）</option>
                  <option value="卓">卓</option>
                  <option value="カウンター">カウンター</option>
                  <option value="VIP">VIP</option>
                </select>
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
                <select value={pvPay} onChange={(e) => setPvPay(e.target.value as "cash" | "card")} style={input}>
                  <option value="cash">現金</option>
                  <option value="card">カード</option>
                </select>
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

      {/* ═══ 基本料金 ═══ */}
      {tab === "base" && (
        <>
          {/* 修正a: 指名料金＝ランク×hon/jonai テーブル（実体は pricing_rules の rank_id 行） */}
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

          {/* 既存2パネルの移設＝「基本料金（ルール0件時に適用）」の位置づけを見出しで明示 */}
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px", fontWeight: 700 }}>
            基本料金（時間帯ルールが1件も当たらないときに適用されるフォールバック値）
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <PricingPanel storeId={storeId} initial={{
              hon_fee: store.hon_fee, jonai_fee: store.jonai_fee, dohan_fee: store.dohan_fee,
              service_rate: store.service_rate, card_tax_rate: store.card_tax_rate,
              round_unit: store.round_unit, round_mode: store.round_mode,
            }} />
            <TimePricingPanel storeId={storeId} initial={{
              set_min: store.set_min, set_fee: store.set_fee, ext_min: store.ext_min, ext_fee: store.ext_fee,
              time_mode: store.time_mode, time_per: store.time_per,
            }} />
          </div>
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
            <button style={btnLight} onClick={() => setTab("base")}>基本料金タブで編集</button>
          </div>
        </section>

        {/* ② 税・サービス料（読み取り専用ミラー） */}
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14 }}>税・サービス料</h3>
              <p style={{ fontSize: 11, color: "var(--sub)", margin: "2px 0 0" }}>伝票に加算する料率と計算順</p>
            </div>
            <span className="nox-stpill" style={{ marginLeft: "auto" }}>TAX</span>
          </div>
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              サービス料
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>小計に対して加算される店舗サービス料です。</span>
            </span>
            <b className="num">{store.service_rate}%</b>
            <button style={btnLight} onClick={() => setTab("base")}>基本料金タブで編集</button>
          </div>
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              カード手数料
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>カード決済の場合のみ加算されます。</span>
            </span>
            <b className="num">{store.card_tax_rate}%</b>
            <button style={btnLight} onClick={() => setTab("base")}>基本料金タブで編集</button>
          </div>
          <div className="nox-listrow" style={{ opacity: 0.55 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              消費税（内税・外税）
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>内税・外税の切替は準備中です。</span>
            </span>
            <div className="nox-seg">
              <button disabled>内税</button>
              <button disabled>外税</button>
              <button disabled>適用しない</button>
            </div>
            <span className="nox-stpill">準備中</span>
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
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              端数処理
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>最終合計に対して端数を処理します。</span>
            </span>
            <b className="num">{store.round_unit}円単位</b>
            <button style={btnLight} onClick={() => setTab("base")}>基本料金タブで編集</button>
          </div>
          <div className="nox-listrow">
            <span style={{ flex: 1, minWidth: 0 }}>
              処理方法
              <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>指定単位未満の金額の扱いです。</span>
            </span>
            <b>{ROUND_MODE_LABEL[store.round_mode] ?? store.round_mode}</b>
            <button style={btnLight} onClick={() => setTab("base")}>基本料金タブで編集</button>
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
          このページの数値は<b>読み取り専用の表示</b>です（編集は「基本料金」タブ）。
          基本料金タブで保存した直後は、この画面を開き直すと新しい値が出ます。
          変更内容は<b>新しく開く伝票から</b>反映されます。
        </p>
        </>
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
            </span>
            {cutoffWholeDay && (
              <span className="hint" style={{ color: "var(--gold2)" }}>
                開始と終了が営業日区切り（{bizCutoffHm}）と同時刻のため「終日の帯」として保存されます。
              </span>
            )}
          </div>

          <div className="nox-field">
            <span className="lab">席種</span>
            <select value={mSeat} onChange={(e) => setMSeat(e.target.value)} style={inputLg}>
              <option value="">全席種</option>
              <option value="卓">卓</option>
              <option value="カウンター">カウンター</option>
              <option value="VIP">VIP</option>
            </select>
          </div>

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
