"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { groupDue } from "@/lib/nox/check-calc";
import { useTapBatch } from "@/lib/nox/ui/use-tap-batch";
import { groupProducts } from "@/lib/nox/ui/product-groups";
import * as t from "@/lib/nox/ui/theme";
import CastAvatar from "@/components/ui/cast-avatar";
import { resolveOrgId, signCastPhotos } from "@/lib/nox/cast-photo";
import { fetchStockTotals } from "@/lib/nox/master/queries";
import ReservationPanel from "./reservation-panel";
import DrinkClaimQueue from "./drink-claim-queue";
import BottleKeepPanel from "./bottle-keep-panel";

type Seat = { id: string; name: string; kind: string | null; store_id: string };
// 純増⑦（mig0063）: category_id でタイルをカテゴリ別に束ねる（未登録店は type 別へフォールバック）
// 段R2: reorder_point＝低在庫「残N」のしきい（null=しきい無し＝表示しない）
// mig0081: sort_order＝カテゴリ内の並び順（groupProducts が sort_order→name で並べる）。
type Product = { id: string; name: string; type: string; price: number; category_id: string | null; reorder_point: number | null; sort_order: number };
type Category = { id: string; name: string; sort_order: number };
type Cast = { id: string; name: string; photo_updated_at: string | null };
// B1/B2（mig0053）: 追加席の占有行（伝票の追加席一覧・フロアの「同一会計」表示に使う）
type CheckSeatRow = { id: string; seat_id: string; check_id: string };

type CheckRow = {
  id: string;
  store_id: string;
  seat_id: string;
  status: string;
  people: number | null;
  nom_type: string;
  total: number;
  service_rate: number;
  round_unit: number;
  round_mode: string;
  started_at: string;
  // B4（mig0052）: 時間料金の open 時スナップ5値（非遡及＝time_mode は非スナップ・stores live 判定）
  set_min: number;
  set_fee: number;
  ext_min: number;
  ext_fee: number;
  time_per: string;
};
// check_time_charge_apply の返値 jsonb（サーバ再計算の内訳・表示専用）
type TimeCalc = { elapsed_min: number; units: number; blocks: number; set_c: number; ext_c: number; total: number; line_id: string };
type Line = {
  id: string;
  kind: string;
  pay_group: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  qty: number;
  line_total: number;
  // キャストドリンク（mig0070）: 按分除外の判定は back_snapshot の凍結値で行う。
  //   ★products.back_exempt_from_split（現価）では判定しない＝行を打った後にマスタのフラグを
  //     切り替えても伝票の帰属経路は変わらない、が 0070 の設計（check_close と
  //     drink_claim_submit_proxy が同一の凍結値を見る）。UI もその凍結値に従う＝
  //     「ボタンは出るのに RPC が not exempt product で弾く」ズレを構造的に作らない。
  //   ★キー無し（0070 以前に打たれた行）は false 相当＝按分経路（DB 側の coalesce と同じ）。
  back_snapshot: { back_exempt?: boolean } | null;
};
// キャストドリンク（mig0066/0067）: 明細行に紐づく確定済み claim（status='approved' のみ引く）
type DrinkClaim = { id: string; check_line_id: string | null; cast_id: string; back_amount: number };
type Payment = { id: string; pay_group: string; method: string; amount: number; tendered: number | null; method_detail: string | null };
type Nom = { cast_id: string; ratio_weight: number };
// F3c 二重承認（approvals・mig0035/0036）
type Approval = {
  id: string; pay_group: string; type: string; amount: number; status: string;
  reason: string | null; requested_by: string; created_at: string;
};

const yen = (n: number) => "¥" + n.toLocaleString();
// 段B: 商品タイルの type 別見出し（products.type＝drink/champ/bottle・既存カラム）。滞在経過は started_at から算出。
// 純増⑦: type 別の見出し/順序は lib/nox/ui/product-groups へ移設（カテゴリ未登録時のフォールバックとして同居）
const elapsedMin = (started: string, now: number) => Math.max(0, Math.floor((now - new Date(started).getTime()) / 60000));
// ★台帳 #36（F4c 裁定 2026-07-17）: 決済手段の語彙は4値で確定（端末カード=card・QR/電子マネー=other に収容し、
//   手段の内訳は payments.method_detail の自由記述で drill-down する＝mig0046）。
//   語彙を増やす場合は5点セットの同時改修が必須:
//     ① payments_method_check（CHECK 値域） ② check_pay のハードコード検証（not in (...)）
//     ③ daily_report_aggregate の名指し集計 ④ daily_reports の凍結列 ⑤ report-board.tsx の再集計
//   ★最大の罠＝③は cash/card/ar/other を名指しで集計しているため、新語彙は other にも落ちず
//     日次サマリからサイレント欠落する（一方 ⑤ は else other に落ちるため、プレビューと確定値がズレる）。
//   表示語彙は3箇所（本 METHOD_LABEL / receipt.ts の METHOD_JA / receipt.ts の型コメント）。
const METHOD_LABEL: Record<string, string> = { cash: "現金", card: "カード", ar: "売掛", other: "その他" };
// 内訳メモを出す手段（cash/ar は出さない＝現金は内訳不要・売掛は receivables が台帳）
const DETAIL_METHODS = new Set(["card", "other"]);
const NOM_LABEL: Record<string, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", free: "フリー" };
const AP_STATUS_LABEL: Record<string, string> = { pending: "承認待ち", approved: "承認済", rejected: "却下" };
const AP_STATUS_COLOR: Record<string, string> = { pending: "var(--gold2)", approved: "var(--ok)", rejected: "var(--sub)" };

// キャストドリンク（mig0067）代理起票・取消のエラー日本語化（握り潰さない＝seatErrJa と同流儀）
function claimErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("not exempt product")) return "この商品はキャストドリンク指定ではありません（マスタで指定してください）";
  if (msg.includes("already claimed")) return "この行にはすでにキャストが付いています";
  if (msg.includes("not approved")) return "この付与はすでに取り消されています";
  if (msg.includes("not open")) return "この伝票は締められています";
  if (msg.includes("bad cast")) return "そのキャストは選べません（在籍・自店を確認してください）";
  if (msg.includes("bad line")) return "この明細行にはキャストを付けられません";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

// approval RPC エラーの日本語化（F3c）
function apErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("amount exceeds group total")) return "割引額が対象伝票の小計を超えています";
  if (msg.includes("no group total")) return "対象伝票に割引できる金額がありません";
  if (msg.includes("no such group")) return "対象の伝票グループが存在しません";
  if (msg.includes("not applicable")) return "承認前に伝票が締められたため適用できません";
  if (msg.includes("not open")) return "この伝票は締められています（申請できません）";
  if (msg.includes("already decided")) return "この申請は処理済みです";
  if (msg.includes("bad type")) return "種別が不正です";
  if (msg.includes("bad amount")) return "割引額の指定が不正です";
  if (msg.includes("bad reason")) return "理由は200字以内で入力してください";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

// B4（mig0052）check_time_charge_apply エラーの日本語化（握り潰さない＝裁定準拠）
function timeErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("has payments")) return "入金後は時間料金を反映できません（訂正は取消から）";
  if (msg.includes("not open")) return "この伝票は締められています（反映できません）";
  if (msg.includes("bad time settings")) return "店の時間料金設定が不正です（マスタで確認してください）";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

// B1/B2（mig0053）席操作エラーの日本語化（握り潰さない）
function seatErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("seat occupied")) return "その席は使用中です";
  if (msg.includes("home seat")) return "主席は解除できません（席移動を使ってください）";
  if (msg.includes("not open")) return "締められています";
  if (msg.includes("same seat")) return "同じ席です";
  if (msg.includes("inactive seat")) return "無効な席です";
  if (msg.includes("bad seat")) return "席の指定が不正です";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto" };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

export default function RegisterBoard({
  seats, products, categories, casts, isManagerUp, showReserve, storeId,
}: {
  seats: Seat[]; products: Product[]; categories: Category[]; casts: Cast[]; isManagerUp: boolean;
  showReserve: boolean; storeId: string;
}) {
  const supabase = createClient();
  // タブ（canonical の register セグメント。顧客・ボトルタブは顧客 UI 実装時に追加）
  const [tab, setTab] = useState<"tables" | "reserve">("tables");
  const [openMap, setOpenMap] = useState<Record<string, string>>({});
  // 段R2: 伝票詳細の3タブ（注文／指名・席／会計）＝現行カード縦積みの収容先を切り替えるだけ。
  //   ★どのカードも中身・RPC・引数は1文字も変えていない（表示位置だけの再配置）。
  const [dtab, setDtab] = useState<"order" | "nom" | "pay">("order");
  // 段R2: 席タイルの会計金額・着卓キャスト・低在庫（いずれも既存テーブルの読取＝presentation）
  const [openTotal, setOpenTotal] = useState<Record<string, number>>({});
  const [openNoms, setOpenNoms] = useState<Record<string, string[]>>({});
  const [stockOf, setStockOf] = useState<Record<string, number>>({});
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
  // B1/B2: 追加席（相席）の占有マップ seat_id→ホスト伝票 id（フロアの「同一会計」表示・タップで
  //   union consult がホスト伝票を返す）。primaryOf は checkId→主席 seat_id（ホスト名の解決用）。
  const [addMap, setAddMap] = useState<Record<string, string>>({});
  const [primaryOf, setPrimaryOf] = useState<Record<string, string>>({});
  const [openStarted, setOpenStarted] = useState<Record<string, string>>({}); // 段B: 主席 seat_id→started_at（floor 滞在）
  const [checkSeats, setCheckSeats] = useState<CheckSeatRow[]>([]);
  const [seatMsg, setSeatMsg] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckRow | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  // キャストドリンク（mig0066/0067）: この伝票の確定済み claim（line_id → claim）と、
  //   キャスト選択を開いている行（null=閉）。どちらも表示状態のみ＝money 導線は RPC が権威。
  const [claims, setClaims] = useState<DrinkClaim[]>([]);
  const [claimPick, setClaimPick] = useState<string | null>(null);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);

  // F4b レシート印刷: printer_enabled は route 経由（printer_config は deny-all）＝false/取得失敗ならボタン非表示（fail-closed）
  const [printerEnabled, setPrinterEnabled] = useState(false);
  // クローズ成功時に立つ印刷カード（closeCheck は伝票画面を閉じるため、印刷はこのカードから）
  const [printCard, setPrintCard] = useState<{ checkId: string; groups: string[] } | null>(null);
  const [printMsg, setPrintMsg] = useState<Record<string, string>>({}); // pay_group → 状態表示
  useEffect(() => {
    let alive = true;
    fetch("/api/print/jobs")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setPrinterEnabled(j.printer_enabled === true); })
      .catch(() => undefined);
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enqueuePrint(checkId: string, g: string) {
    const { data, error } = await supabase.rpc("print_enqueue", { p_check_id: checkId, p_pay_group: g });
    if (error) {
      setPrintMsg((m) => ({ ...m, [g]: error.message.includes("printer disabled") ? "プリンタが無効です" : `失敗: ${error.message}` }));
      return;
    }
    const r = data as { is_reprint: boolean; already_queued: boolean };
    setPrintMsg((m) => ({
      ...m,
      [g]: r.already_queued ? "印刷待ちに追加済みです" : r.is_reprint ? "印刷します（再発行）" : "印刷します",
    }));
  }
  const [noms, setNoms] = useState<Nom[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  // B4（mig0052）時間料金: time_mode は非スナップ＝伝票の store の live 値で判定（裁定(g)）。
  //   timeCalc は check_time_charge_apply の返値内訳（表示専用）。timeMsg はカード内エラー。
  const [timeMode, setTimeMode] = useState("manual");
  const [timeCalc, setTimeCalc] = useState<TimeCalc | null>(null);
  const [timeMsg, setTimeMsg] = useState<string | null>(null);
  // 経過時間の分表示用の時刻 tick（open 伝票がある間だけ 30 秒ごと更新＝分単位で十分）
  // 経過時間の分表示用の時刻 tick（open 伝票 or 占有卓がある間だけ 30 秒ごと更新＝分単位で十分・段B floor 滞在にも使う）
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const hasLive = (check && check.status === "open") || Object.keys(openMap).length > 0;
    if (!hasLive) return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [check, openMap]);

  // フォーム状態
  const [nomType, setNomType] = useState("hon");
  const [nomWeights, setNomWeights] = useState<Record<string, number>>({});
  const [prodGroup, setProdGroup] = useState("A"); // 段B: タイル追加先の伝票グループ（既定 A）
  // 段0R 第1陣: カテゴリチップの絞り込み（""=すべて）。表示のみ・取得も RPC も不変。
  const [catFilter, setCatFilter] = useState("");
  const [cName, setCName] = useState("");
  const [cPrice, setCPrice] = useState(0);
  const [cKind, setCKind] = useState("set");
  const [cGroup, setCGroup] = useState("A");
  const [payGroup, setPayGroup] = useState("A");
  const [payMethod, setPayMethod] = useState("cash");
  const [payAmount, setPayAmount] = useState(0);
  const [payTendered, setPayTendered] = useState("");
  const [payDetail, setPayDetail] = useState(""); // F4c: 手段内訳メモ（card/other のみ・50字・空は null 送信）
  // F3c: 割引/無料 申請・適用フォーム
  const [apType, setApType] = useState<"discount" | "free">("discount");
  const [apGroup, setApGroup] = useState("A");
  const [apAmount, setApAmount] = useState(0);
  const [apReason, setApReason] = useState("");

  const loadOpenMap = useCallback(async () => {
    // 段B 滞在タイマー: started_at を追加取得（クライアント直 SELECT の列追加＝presentation 扱い・RPC 非改変）。
    // 段R2: total も追加（席タイルの会計金額）。★列を1つ増やしただけで RPC も RLS も触っていない。
    const { data } = await supabase.from("checks").select("id, seat_id, started_at, total").eq("status", "open");
    const m: Record<string, string> = {};      // 主席 seat_id → checkId
    const pm: Record<string, string> = {};      // checkId → 主席 seat_id（ホスト名解決）
    const st: Record<string, string> = {};      // 主席 seat_id → started_at（席タイルの経過表示）
    const tt: Record<string, number> = {};      // checkId → total（席タイルの会計金額）
    for (const r of data ?? []) { m[r.seat_id as string] = r.id as string; pm[r.id as string] = r.seat_id as string; st[r.seat_id as string] = r.started_at as string; tt[r.id as string] = (r.total as number) ?? 0; }
    // 段R2: 着卓キャスト（open 伝票の指名）＝席タイルの顔チップ。check_nominations の RLS は
    //   register を使えるロールと同じゲート＝ここでロール判定を書かない（真の防御は RLS）。
    const openIds = Object.values(m);
    const nm: Record<string, string[]> = {};    // checkId → cast_id[]（position 順）
    if (openIds.length > 0) {
      const { data: noms } = await supabase
        .from("check_nominations").select("check_id, cast_id").in("check_id", openIds).order("position");
      for (const r of noms ?? []) {
        const k = r.check_id as string;
        (nm[k] ??= []).push(r.cast_id as string);
      }
    }
    setOpenTotal(tt); setOpenNoms(nm);
    // B1/B2: 追加席の占有（check_seats は transient＝open 伝票分のみ・RLS で自店/自 org 可視＝G27 検証済み）
    const { data: cs } = await supabase.from("check_seats").select("seat_id, check_id");
    const am: Record<string, string> = {};
    for (const r of cs ?? []) am[r.seat_id as string] = r.check_id as string;
    setOpenMap(m); setPrimaryOf(pm); setAddMap(am); setOpenStarted(st);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCheck = useCallback(async (checkId: string) => {
    const { data: c } = await supabase.from("checks").select("*").eq("id", checkId).single();
    const { data: ls } = await supabase
      // back_snapshot＝キャストドリンク判定の凍結値（mig0070）。中身は back_exempt だけを見る。
      .from("check_lines").select("id, kind, pay_group, name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot")
      .eq("check_id", checkId).order("sort_order");
    // キャストドリンク: 確定済み（approved）の claim だけを引く。void/rejected は行に紐づけない。
    const { data: dcs } = await supabase
      .from("drink_claims").select("id, check_line_id, cast_id, back_amount")
      .eq("check_id", checkId).eq("status", "approved");
    const { data: ps } = await supabase
      .from("payments").select("id, pay_group, method, amount, tendered, method_detail").eq("check_id", checkId).order("paid_at");
    const { data: ns } = await supabase
      .from("check_nominations").select("cast_id, ratio_weight").eq("check_id", checkId).order("position");
    const { data: aps } = await supabase
      .from("approvals").select("id, pay_group, type, amount, status, reason, requested_by, created_at")
      .eq("check_id", checkId).order("created_at", { ascending: false });
    // B1/B2: この伝票の追加席一覧（席セクションの表示＋解除ボタン）
    const { data: cs } = await supabase.from("check_seats").select("id, seat_id, check_id").eq("check_id", checkId);
    // B4: 伝票の store の time_mode を live 取得（非スナップ＝裁定(g)。RLS で自店/自 org のみ可視）
    if (c) {
      const { data: st } = await supabase.from("stores").select("time_mode").eq("id", (c as CheckRow).store_id).single();
      setTimeMode((st?.time_mode as string | undefined) ?? "manual");
    }
    setTimeCalc(null);
    setTimeMsg(null);
    // B1/B2: seatMsg（席操作の成功/予約警告）は loadCheck ではクリアしない＝loadCheck は
    //   リロードユーティリティでメッセージ生存期間を持たない（順序入替案だと将来の loadCheck 呼び足しで
    //   再発する）。クリアは席切替（openSeat）でのみ行う。
    setCheckSeats((cs ?? []) as CheckSeatRow[]);
    setCheck(c as CheckRow);
    setLines((ls ?? []) as Line[]);
    setClaims((dcs ?? []) as DrinkClaim[]);
    setClaimPick(null);
    setPayments((ps ?? []) as Payment[]);
    setNoms((ns ?? []) as Nom[]);
    setApprovals((aps ?? []) as Approval[]);
    if (c) {
      setNomType((c as CheckRow).nom_type);
      const w: Record<string, number> = {};
      for (const n of (ns ?? []) as Nom[]) w[n.cast_id] = n.ratio_weight;
      setNomWeights(w);
      // 割引申請の既定 group＝この伝票に存在する最初の pay_group（分割会計対応）
      setApGroup(Array.from(new Set(((ls ?? []) as Line[]).map((l) => l.pay_group))).sort()[0] ?? "A");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void loadOpenMap(); }, [loadOpenMap]);

  // 段R2: 在庫（Σdelta）＝低在庫「残N」の材料。④d-1: 独自集計を撤去し fetchStockTotals
  //   （mig0078/0079 の product_stock_totals RPC・p_store_id=null）へ一本化。
  //   ★スコープは RLS（stock_logs_select）と完全一致＝owner=org全体／manager・staff=自店。
  //     cast は RPC が0行を返す（mig0079）＝「残N」は出ない（エラーではなく非表示＝fail-closed・従来同一）。
  //   ★キオスク（kiosk_register_state・0059）は在庫を返さないので低在庫は register 側だけ＝0059 非改変。
  const loadStock = useCallback(async () => {
    setStockOf(await fetchStockTotals(supabase));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void loadStock(); }, [loadStock]);

  // 段P: キャスト写真の署名 URL（写真ありの行だけ 1 リクエスト・失敗時は頭文字に落ちるだけ）
  useEffect(() => {
    let alive = true;
    void (async () => {
      const orgId = await resolveOrgId(supabase);
      if (!orgId) return;
      const m = await signCastPhotos(supabase, orgId, casts);
      if (alive) setPhotoUrls(m);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casts]);

  const castName = (id: string) => casts.find((c) => c.id === id)?.name ?? "?";

  /** 段R2: 低在庫の残数。reorder_point 未設定なら null（＝表示しない）。しきい以下のときだけ数を返す。 */
  const lowStockOf = (p: Product): number | null => {
    if (p.reorder_point == null) return null;
    const n = stockOf[p.id];
    if (n == null) return null;
    return n <= p.reorder_point ? n : null;
  };

  // 段B タップ注文: 商品タイル連打を束ねて check_add_line(p_qty=N) を1回（直列 flush・単一 pending・権威はサーバ）。
  const commitLine = useCallback(
    async (pid: string, qty: number): Promise<{ error: { message?: string } | null }> => {
      if (!check) return { error: { message: "伝票がありません" } };
      const { error } = await supabase.rpc("check_add_line", {
        p_check_id: check.id, p_product_id: pid, p_qty: qty, p_kind: null,
        p_pay_group: prodGroup || "A", p_name: null, p_unit_price: null,
      });
      return { error };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [check, prodGroup],
  );
  const reloadCurrent = useCallback(async () => { if (check) await loadCheck(check.id); }, [check, loadCheck]);
  const tb = useTapBatch(commitLine, reloadCurrent, (m) => setMsg(m));

  async function openSeat(seat: Seat) {
    if (!(await tb.flush())) return; // 別 check へ切替前に保留を現 check へ確定（失敗＝中止）
    setMsg(null);
    setSeatMsg(null); // B1/B2: 席操作メッセージのクリアは席切替のここでのみ（loadCheck では消さない）
    // B1/B2: 主席 ∪ 追加席の占有ならその伝票を開く（追加席は union consult でホスト伝票＝addMap で直接解決）
    const existing = openMap[seat.id] ?? addMap[seat.id];
    if (existing) { await loadCheck(existing); return; }
    const { data, error } = await supabase.rpc("check_open", { p_seat_id: seat.id, p_people: null, p_nom_type: "free" });
    if (error) { setMsg(error.message); return; }
    await loadOpenMap();
    await loadCheck(data as string);
  }

  async function saveNoms() {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setMsg(null);
    const list = Object.entries(nomWeights)
      .filter(([, w]) => w > 0)
      .map(([cast_id, weight]) => ({ cast_id, weight }));
    const { error } = await supabase.rpc("check_set_nominations", {
      p_check_id: check.id, p_nom_type: nomType, p_nominations: list,
    });
    setMsg(error ? error.message : "指名を保存しました");
    await loadCheck(check.id);
  }

  // （段B: 商品プルダウンの addProductLine は廃止＝タイル tap→tb.flush の check_add_line に置換）

  async function addCustomLine() {
    if (!check || !cName) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setMsg(null);
    const { error } = await supabase.rpc("check_add_line", {
      p_check_id: check.id, p_product_id: null, p_qty: 1, p_kind: cKind,
      p_pay_group: cGroup || "A", p_name: cName, p_unit_price: cPrice,
    });
    setMsg(error ? error.message : null);
    setCName(""); setCPrice(0);
    await loadCheck(check.id);
  }

  async function removeLine(lineId: string) {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setMsg(null);
    const { error } = await supabase.rpc("check_remove_line", { p_line_id: lineId });
    setMsg(error ? error.message : null);
    await loadCheck(check.id);
  }

  // キャストドリンク（mig0067）: 明細行にキャストを付ける／取り消す。
  //   ★バック額はサーバが行の凍結値（back_snapshot）から焼き付ける＝金額は一切送らない。
  //   ★連打束ねの保留を先に確定してから呼ぶ（起票対象の行が確定していないと紐付け先がぶれる）。
  async function claimAssign(lineId: string, castId: string) {
    if (!check || claimBusy) return;
    setClaimBusy(true);
    if (!(await tb.flush())) { setClaimBusy(false); return; }
    setClaimMsg(null);
    const { error } = await supabase.rpc("drink_claim_submit_proxy", { p_line_id: lineId, p_cast_id: castId });
    setClaimMsg(error ? claimErrJa(error.message) : null);
    setClaimBusy(false);
    await loadCheck(check.id);
  }
  async function claimVoid(claimId: string) {
    if (!check || claimBusy) return;
    setClaimBusy(true);
    if (!(await tb.flush())) { setClaimBusy(false); return; }
    setClaimMsg(null);
    const { error } = await supabase.rpc("drink_claim_void", { p_claim_id: claimId });
    setClaimMsg(error ? claimErrJa(error.message) : null);
    setClaimBusy(false);
    await loadCheck(check.id);
  }

  // B4（mig0052）: 時間料金を明細へ反映/更新（サーバ再計算・自然冪等 upsert＝1本を更新）。
  //   金額はクライアントから送らない（引数は check_id のみ）。返値 jsonb の内訳を表示。
  //   裁定(f): ボタン起点のみ（伝票表示時の自動 apply はしない）。
  async function applyTimeCharge() {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setTimeMsg(null);
    const { data, error } = await supabase.rpc("check_time_charge_apply", { p_check_id: check.id });
    if (error) { setTimeMsg(timeErrJa(error.message)); return; }
    setTimeCalc(data as TimeCalc);
    await loadCheck(check.id); // 明細・合計を再読込（timeCalc は loadCheck でクリアされるため下で再設定）
    setTimeCalc(data as TimeCalc);
  }

  // B1/B2（mig0053）: 予約 soft 警告（裁定 d・拒否しない）。当日・booked・seat 一致の最小クエリ。
  //   RLS で reservations が読めない role（staff/cast）は data=null→警告なしで続行（エラーにしない）。
  async function reservedNote(seatId: string): Promise<string> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const { data } = await supabase.from("reservations").select("id")
      .eq("seat_id", seatId).eq("status", "booked")
      .gte("reserved_at", start).lt("reserved_at", end);
    return (data ?? []).length > 0 ? "この席には本日の予約があります。" : "";
  }

  // B1 相席追加（check_add_seat）。予約 soft 警告を添えて続行。
  async function addSeat(seatId: string) {
    if (!check || !seatId) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setSeatMsg(null);
    const warn = await reservedNote(seatId);
    const { error } = await supabase.rpc("check_add_seat", { p_check_id: check.id, p_seat_id: seatId });
    if (error) { setSeatMsg(seatErrJa(error.message)); return; }
    setSeatMsg((warn ? warn + " " : "") + "相席（同一会計）に追加しました。");
    await loadOpenMap();
    await loadCheck(check.id);
  }

  // B1 相席解除（check_remove_seat・追加席のみ・主席は home seat 拒否）
  async function removeSeat(seatId: string) {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setSeatMsg(null);
    const { error } = await supabase.rpc("check_remove_seat", { p_check_id: check.id, p_seat_id: seatId });
    if (error) { setSeatMsg(seatErrJa(error.message)); return; }
    setSeatMsg("相席を解除しました。");
    await loadOpenMap();
    await loadCheck(check.id);
  }

  // B2 席移動（check_move_seat）。予約 soft 警告を添えて続行。成功文言はモック Ix 準拠。
  async function moveSeat(seatId: string) {
    if (!check || !seatId) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setSeatMsg(null);
    const warn = await reservedNote(seatId);
    const { error } = await supabase.rpc("check_move_seat", { p_check_id: check.id, p_to_seat_id: seatId });
    if (error) { setSeatMsg(seatErrJa(error.message)); return; }
    setSeatMsg((warn ? warn + " " : "") + "席を移動しました。");
    await loadOpenMap();
    await loadCheck(check.id);
  }

  async function pay() {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止・入金前提）
    setMsg(null);
    // F4c: detail は card/other のときだけ送る（空/空白のみは null＝RPC 側も nullif(trim()) で二重に守る）
    const detail = DETAIL_METHODS.has(payMethod) && payDetail.trim() ? payDetail.trim() : null;
    const { error } = await supabase.rpc("check_pay", {
      p_check_id: check.id, p_method: payMethod, p_amount: payAmount,
      p_pay_group: payGroup || "A",
      p_tendered: payMethod === "cash" && payTendered ? Number(payTendered) : null,
      p_idem_key: crypto.randomUUID(),
      p_method_detail: detail,
    });
    setMsg(error ? error.message : "入金しました");
    setPayTendered("");
    setPayDetail("");
    await loadCheck(check.id);
  }

  async function closeCheck() {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止・締め前提）
    setMsg(null);
    const { error } = await supabase.rpc("check_close", { p_check_id: check.id, p_idem_key: crypto.randomUUID() });
    if (error) { setMsg(error.message); return; }
    setMsg(`会計完了 ${yen(check.total)}`);
    // F4b: クローズ後のレシート印刷カード（printer_enabled の店のみ・pay_group ごと）
    if (printerEnabled) {
      const gs = Array.from(new Set(lines.map((l) => l.pay_group))).sort();
      setPrintCard({ checkId: check.id, groups: gs });
      setPrintMsg({});
    }
    setCheck(null);
    await loadOpenMap();
  }

  async function voidCheck() {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    const reason = window.prompt("取消理由を入力してください");
    if (!reason) return;
    const { error } = await supabase.rpc("check_void", { p_check_id: check.id, p_reason: reason });
    if (error) { setMsg(error.message); return; }
    setMsg("伝票を取消しました");
    setCheck(null);
    await loadOpenMap();
  }

  // 段B: 伝票詳細シート（≤900）の背景タップで閉じる＝保留を確定してから閉じる（失敗＝中止・シート維持）
  async function closeDetail() {
    if (!(await tb.flush())) return;
    setCheck(null);
  }

  // F3c: 割引/無料 申請（黒服 can_register）・適用（owner/manager 直接）
  async function requestOrApply() {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（割引は総額に依存・失敗＝中止）
    setMsg(null);
    const rpc = isManagerUp ? "approval_direct" : "approval_request";
    const { error } = await supabase.rpc(rpc, {
      p_check_id: check.id, p_pay_group: apGroup, p_type: apType,
      p_amount: apType === "discount" ? apAmount : null,
      p_reason: apReason.trim() || null,
    });
    if (error) { setMsg(`${isManagerUp ? "適用" : "申請"}に失敗: ${apErrJa(error.message)}`); return; }
    setMsg(isManagerUp ? "割引/無料を適用しました" : "割引/無料を申請しました（承認待ち）");
    setApAmount(0); setApReason("");
    await loadCheck(check.id);
  }

  // F3c: 承認/却下（owner/manager のみ）
  async function decide(approvalId: string, approve: boolean) {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setMsg(null);
    const { error } = await supabase.rpc("approval_decide", { p_approval_id: approvalId, p_approve: approve });
    if (error) { setMsg(`${approve ? "承認" : "却下"}に失敗: ${apErrJa(error.message)}`); return; }
    setMsg(approve ? "承認しました（伝票に反映）" : "却下しました");
    await loadCheck(check.id);
  }

  // group 集計（表示用・権威はサーバ＝check_pay/close が最終判定）
  // ★F3c: discount line（kind='discount'・正の値）を小計から減算＝改修 check_group_due と同一規則。
  const groups = Array.from(new Set(lines.map((l) => l.pay_group))).sort();
  const groupInfo = groups.map((g) => {
    const gl = lines.filter((l) => l.pay_group === g);
    const bx = gl.filter((l) => l.kind !== "discount").reduce((a, l) => a + l.line_total, 0);
    const disc = gl.filter((l) => l.kind === "discount").reduce((a, l) => a + l.line_total, 0);
    const net = Math.max(0, bx - disc);
    const due = check ? groupDue(net, check) : 0;
    const paid = payments.filter((p) => p.pay_group === g).reduce((a, p) => a + p.amount, 0);
    return { g, bx, disc, net, due, paid, remaining: Math.max(0, due - paid) };
  });
  const allCovered = groups.length > 0 && groupInfo.every((gi) => gi.paid >= gi.due);
  // 段0R 第1陣: planA .sumrow（注文タブの伝票サマリ）用の伝票全体合計。
  // ★会計タブ「会計（伝票グループ別）」が描いている groupInfo を group 横断で足すだけ＝
  //   小計 bx / 割引 disc / 請求（サ料込）due はテーブルの各列と同一値。新しい計算はしていない。
  const sumBx = groupInfo.reduce((a, gi) => a + gi.bx, 0);
  const sumDisc = groupInfo.reduce((a, gi) => a + gi.disc, 0);
  const sumDue = groupInfo.reduce((a, gi) => a + gi.due, 0);
  // 割引申請フォームの上限＝選択 group の割引前小計（既存 discount を除いた bx）
  const apGroupBx = groupInfo.find((gi) => gi.g === apGroup)?.bx ?? 0;

  // タブセグメント（canonical の .seg 相当を inline で）
  const segBtn = (on: boolean): React.CSSProperties => ({
    flex: 1, fontFamily: "inherit", fontWeight: 800, fontSize: 13, padding: "9px 10px",
    borderRadius: 9, cursor: "pointer",
    border: on ? "1px solid var(--gold)" : "1px solid var(--line2)",
    background: on ? "linear-gradient(135deg,#1F1B12,#14120C)" : "transparent",
    color: on ? "var(--champ)" : "var(--sub)",
  });

  return (
    <div>
      {showReserve && (
        <div className="nox-cardtop" style={{ ...card, padding: 11 }}>
          <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 480 }}>
            {/* 会計タブへ戻るとき openMap を再読込（予約タブの to_check で開いた伝票を反映） */}
            <button style={segBtn(tab === "tables")} onClick={() => { setTab("tables"); void loadOpenMap(); }}>卓席・会計</button>
            <button style={segBtn(tab === "reserve")} onClick={() => setTab("reserve")}>予約</button>
          </div>
        </div>
      )}

      {tab === "reserve" && showReserve ? (
        <ReservationPanel storeId={storeId} seats={seats} casts={casts} />
      ) : (
    /* 動線改修v3（案B・選択駆動ビュー切替）: 正本 nox-register-mock-planB-viewswitch.html。
       ★state は既存の check 1本のみ＝URL 遷移なし・伝票 state も連打束ね 700ms も会計 RPC も不変。
       未選択＝フロア全幅／選択＝伝票全面（フロアは描画しない）＝2列を常時確保しない（v2R の grid 教訓）。 */
    <div className="nox-regmain">
      {check ? (
      /* ── 伝票ビュー（全面）── */
      <div className="nox-checkview">
        {/* backbar（sticky）＝「← フロア」は既存 closeDetail の再利用（新規ロジックなし）＋卓名・滞在・合計 */}
        <div className="nox-backbar">
          <button type="button" className="nox-backbtn" onClick={() => void closeDetail()}>← フロア</button>
          <span className="t">{seats.find((s) => s.id === check.seat_id)?.name}</span>
          <span style={{ fontSize: 13, color: "var(--v2-muted)" }}>{NOM_LABEL[check.nom_type]}</span>
          {check.status === "open" && (
            <span className="stay">滞在 <span className="num">{elapsedMin(check.started_at, nowMs)}</span> 分</span>
          )}
          <span className="total num"><small>合計</small>{yen(check.total)}</span>
          {/* void は manager 以上のみ表示（RPC 側でも owner/manager を強制＝二重） */}
          {isManagerUp && (
            <button onClick={voidCheck} style={{ ...btnLight, color: "var(--bad)", borderColor: "var(--bad)" }}>
              取消
            </button>
          )}
        </div>

        {/* 段R2: 3タブ（planA .dtabs）。★キー・ラベル・切替ハンドラは不変＝収容先だけを変えた。 */}
        <div className="nox-dtabs">
          {([["order", "注文"], ["nom", "指名・席"], ["pay", "会計"]] as const).map(([k, label]) => (
            <button key={k} type="button" className={dtab === k ? "on" : ""} onClick={() => setDtab(k)}>{label}</button>
          ))}
        </div>

        {/* planB .checkcols＝左 1.4fr（操作）／右 1fr（明細・会計）。★各カードの dtab 条件は 1文字も変えていない。
            指名・席タブは右カラムに出るカードが無いため split を付けない＝空列を作らない（v2R の grid 教訓）。 */}
        <div className={dtab === "nom" ? "nox-checkcols" : "nox-checkcols split"}>
          <div>
        {dtab === "nom" && (<>
        <div className="nox-cardtop" style={card}>
          <h3 style={t.cardTitle}>指名（重み比で分配）</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={nomType} onChange={(e) => setNomType(e.target.value)} style={input}>
              <option value="hon">本指名</option>
              <option value="jonai">場内</option>
              <option value="dohan">同伴</option>
              <option value="free">フリー</option>
            </select>
            {/* 段B: cast チップ化（タップで選択トグル・重みは選択時のみ inline input＝データ形 nomWeights は不変） */}
            {casts.map((ca) => {
              const w = nomWeights[ca.id] ?? 0;
              const on = w > 0;
              return (
                <span key={ca.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <button
                    type="button"
                    className={on ? "nox-chip on" : "nox-chip"}
                    onClick={() => setNomWeights((prev) => ({ ...prev, [ca.id]: on ? 0 : 1 }))}
                  >
                    {/* 段P/R2: チップのアバターを写真に（写真なしは頭文字）。押下時の挙動は不変。 */}
                    <CastAvatar name={ca.name} url={photoUrls.get(ca.id)} variant="flat" size={22} />
                    {ca.name}
                  </button>
                  {on && nomType !== "free" && (
                    <input
                      type="number" min={1} value={w} aria-label={`${ca.name} 重み`}
                      onChange={(e) => setNomWeights((prev) => ({ ...prev, [ca.id]: Number(e.target.value) }))}
                      style={{ ...input, width: 46, padding: "6px 6px" }}
                    />
                  )}
                </span>
              );
            })}
            <button onClick={saveNoms} style={btnDark}>保存</button>
          </div>
        </div>

        {/* B1/B2: 席（相席・席移動）＝open 伝票のみ。候補は同店の空席（主open/追加占有を除外）。
            予約 soft 警告つき（裁定 d・拒否しない）。エラーは seatErrJa で日本語表示（握り潰さない）。 */}
        {check.status === "open" && (() => {
          const emptySeats = seats.filter((s) => s.store_id === check.store_id && !openMap[s.id] && !addMap[s.id]);
          return (
            <div className="nox-cardtop" style={card}>
              <h3 style={t.cardTitle}>席</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "var(--sub)" }}>現在</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--v2-text)" }}>
                  {seats.find((s) => s.id === check.seat_id)?.name ?? "—"}
                  <span style={{ fontSize: 11, color: "var(--sub)", fontWeight: 400 }}> （主席）</span>
                </span>
                {checkSeats.map((cs) => (
                  <span key={cs.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--ink)" }}>
                    ＋{seats.find((s) => s.id === cs.seat_id)?.name ?? "他卓"}（同一会計）
                    <button onClick={() => removeSeat(cs.seat_id)} title="相席を解除"
                      style={{ ...btnLight, padding: "1px 7px", fontSize: 12, color: "var(--bad)", borderColor: "var(--bad)" }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value="" onChange={(e) => { if (e.target.value) void addSeat(e.target.value); }} style={{ ...input, maxWidth: 200 }}>
                  <option value="">相席（同一会計）に席を追加</option>
                  {emptySeats.map((s) => <option key={s.id} value={s.id}>{s.name}{s.kind ? `（${s.kind}）` : ""}</option>)}
                </select>
                <select value="" onChange={(e) => { if (e.target.value) void moveSeat(e.target.value); }} style={{ ...input, maxWidth: 200 }}>
                  <option value="">席移動（移動先を選択）</option>
                  {emptySeats.map((s) => <option key={s.id} value={s.id}>{s.name}{s.kind ? `（${s.kind}）` : ""}</option>)}
                </select>
              </div>
              {seatMsg && <p style={{ fontSize: 12, fontWeight: 700, color: seatMsg.includes("できません") || seatMsg.includes("使用中") || seatMsg.includes("無効") || seatMsg.includes("同じ席") ? "var(--bad)" : "var(--sub)", margin: "8px 0 0" }}>{seatMsg}</p>}
            </div>
          );
        })()}
        </>)}

        {/* ── 会計タブ（段R2）＝時間料金・カスタム明細・割引/承認・会計を集約 ── */}
        {/* B4: 時間制（自動）カード＝stores.time_mode='auto' かつ open 伝票のときのみ。
            裁定(f): ボタン起点のみ（自動 apply しない）。内訳は checks スナップ5列＋返値 jsonb。 */}
        {dtab === "pay" && timeMode === "auto" && check.status === "open" && (
          <div className="nox-cardtop" style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ ...t.cardTitle, margin: 0 }}>時間料金（自動）</h3>
              <span style={{ fontSize: 12, color: "var(--sub)" }}>
                経過 <span style={t.num}>{Math.max(0, Math.floor((nowMs - new Date(check.started_at).getTime()) / 60000))}</span> 分
                （着席 {new Date(check.started_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}）
              </span>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "8px 0", lineHeight: 1.7 }}>
              セット <span style={t.num}>{yen(check.set_fee)}</span> / {check.set_min}分・
              延長 <span style={t.num}>{yen(check.ext_fee)}</span> / {check.ext_min}分・
              単位 {check.time_per === "person" ? "名（人数倍）" : "卓"}
              <span style={{ display: "block", marginTop: 2 }}>この伝票を開いた時点の料金表で計算します（設定変更は次に開く伝票から）。</span>
            </p>
            <button onClick={applyTimeCharge} style={btnDark} disabled={payments.length > 0}
              title={payments.length > 0 ? "入金後は反映できません（取消で訂正）" : ""}>
              時間料金を明細へ反映／更新
            </button>
            {timeCalc && (
              <p style={{ fontSize: 12, color: "var(--ink)", margin: "10px 0 0" }}>
                経過 <span style={t.num}>{timeCalc.elapsed_min}</span> 分・単位 <span style={t.num}>{timeCalc.units}</span>・
                延長 <span style={t.num}>{timeCalc.blocks}</span> 回 → セット <span style={t.num}>{yen(timeCalc.set_c)}</span>＋
                延長 <span style={t.num}>{yen(timeCalc.ext_c)}</span> ＝ 合計 <span style={{ ...t.num, fontWeight: 700, color: "var(--v2-text)" }}>{yen(timeCalc.total)}</span>
              </p>
            )}
            {timeMsg && <p style={{ fontSize: 12, fontWeight: 700, color: "var(--bad)", margin: "8px 0 0" }}>{timeMsg}</p>}
          </div>
        )}

        {/* 明細追加（段R2: 注文タブ。カスタム明細フォームだけは会計タブへ移設） */}
        {dtab === "order" && (
        <div className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <h3 style={{ ...t.cardTitle, margin: 0 }}>商品（タップで追加）</h3>
            <span style={{ fontSize: 12, color: "var(--sub)", marginLeft: "auto" }}>伝票グループ</span>
            <input value={prodGroup} onChange={(e) => setProdGroup(e.target.value)} aria-label="伝票グループ" style={{ ...input, width: 40 }} />
          </div>
          {/* 純増⑦: カテゴリ別タイル（sort_order 順＋末尾に未分類）。カテゴリ未登録なら type 別へフォールバック。
              タップ＝連打束ね（700ms・p_qty=N の1行）。バッジ=pre-commit。 */}
          {/* 段0R 第1陣: planA .cats＝カテゴリチップ。★表示の絞り込みだけで、
              タップ注文（連打束ね・check_add_line）の挙動と送る引数は1文字も変えていない。
              「すべて」で全群を出す＝従来の見え方（全カテゴリ縦並び）も残す。 */}
          {(() => {
            const gs = groupProducts(products, categories);
            return gs.length > 1 ? (
              <div className="nox-cats">
                <button type="button" className={`nox-cat${catFilter === "" ? " on" : ""}`}
                  onClick={() => setCatFilter("")}>すべて</button>
                {gs.map((g) => (
                  <button key={g.key} type="button" className={`nox-cat${catFilter === g.key ? " on" : ""}`}
                    onClick={() => setCatFilter(g.key)}>{g.label}</button>
                ))}
              </div>
            ) : null;
          })()}
          {groupProducts(products, categories).filter((g) => catFilter === "" || g.key === catFilter).map((g) => {
            const items = g.items;
            return (
              <div key={g.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--sub)", margin: "0 0 6px" }}>{g.label}</div>
                <div className="nox-tilegrid">
                  {items.map((p) => {
                    const n = tb.badgeOf(p.id);
                    const low = lowStockOf(p);
                    return (
                      <button key={p.id} type="button" className="nox-tile" onClick={() => tb.tap(p.id)}>
                        {n > 0 && <span className="nox-tile-badge">+{n}</span>}
                        <span className="nox-tile-name">{p.name}</span>
                        <span className="nox-tile-price">{yen(p.price)}</span>
                        {/* 段R2: 低在庫「残N」＝Σdelta が reorder_point 以下のときだけ（在庫 v1 の流用・表示のみ）。
                            ★タップの挙動には一切関与しない（在庫切れでも売れる＝現物の運用を変えない）。 */}
                        {low != null && <span className="nox-tile-low num">残{low}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {products.length === 0 && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>商品が未登録です（マスタで登録してください）。</p>}
        </div>
        )}

        {/* カスタム明細（kind/名称/価格）＝段R2 で会計タブへ移設（フォームの中身・送る引数は不変） */}
        {dtab === "pay" && (
        <div className="nox-cardtop" style={card}>
          <h3 style={t.cardTitle}>カスタム明細</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={cKind} onChange={(e) => setCKind(e.target.value)} style={input}>
              <option value="set">セット</option>
              <option value="time">延長</option>
              <option value="charge">料金</option>
              <option value="custom">その他</option>
            </select>
            <input placeholder="名称（例 セット60分）" value={cName} onChange={(e) => setCName(e.target.value)} style={{ ...input, width: 170 }} />
            <input type="number" min={0} value={cPrice} onChange={(e) => setCPrice(Number(e.target.value))} style={{ ...input, width: 90 }} />
            <span style={{ fontSize: 12, color: "var(--sub)" }}>伝票</span>
            <input value={cGroup} onChange={(e) => setCGroup(e.target.value)} style={{ ...input, width: 40 }} />
            <button onClick={addCustomLine} style={btnDark}>追加</button>
          </div>
        </div>
        )}

        {/* 割引・無料（承認ワークフロー・F3c）＝段R2 で会計タブへ */}
        {dtab === "pay" && (
        <div className="nox-cardtop" style={card}>
          <h3 style={t.cardTitle}>
            割引・無料（{isManagerUp ? "適用・承認" : "申請"}）
          </h3>
          {/* 申請（黒服 can_register）／適用（owner/manager 直接）フォーム */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <select value={apType} onChange={(e) => setApType(e.target.value as "discount" | "free")} style={input}>
              <option value="discount">割引</option>
              <option value="free">無料</option>
            </select>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>伝票</span>
            <select value={apGroup} onChange={(e) => setApGroup(e.target.value)} style={{ ...input, width: 60 }}>
              {(groups.length ? groups : ["A"]).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            {apType === "discount" && (
              <>
                <input
                  type="number" min={1} max={apGroupBx || undefined} value={apAmount}
                  onChange={(e) => setApAmount(Number(e.target.value))} placeholder="割引額"
                  style={{ ...input, width: 100 }}
                />
                <span style={{ fontSize: 11, color: "var(--sub)" }}>上限 {yen(apGroupBx)}</span>
              </>
            )}
            <input
              value={apReason} onChange={(e) => setApReason(e.target.value)}
              placeholder="理由（任意）" maxLength={200} style={{ ...input, width: 160 }}
            />
            <button
              onClick={requestOrApply}
              disabled={apType === "discount" && (apAmount <= 0 || apAmount > apGroupBx)}
              style={{ ...btnDark, opacity: apType === "discount" && (apAmount <= 0 || apAmount > apGroupBx) ? 0.4 : 1 }}
            >
              {isManagerUp ? "適用" : "申請"}
            </button>
          </div>
          {/* この伝票の申請一覧（pending は owner/manager が承認/却下・staff は閲覧のみ） */}
          {approvals.length === 0
            ? <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>申請はありません。</p>
            : approvals.map((a) => (
                <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--line)", fontSize: 12.5 }}>
                  <span style={{ color: "var(--sub)" }}>[{a.pay_group}]</span>
                  <span style={{ color: "var(--ink)" }}>{a.type === "free" ? "無料" : "割引"} <span style={t.num}>{yen(a.amount)}</span></span>
                  {a.reason && <span style={{ color: "var(--sub)" }}>（{a.reason}）</span>}
                  <span style={{ marginLeft: "auto", fontWeight: 700, color: AP_STATUS_COLOR[a.status] ?? "var(--sub)" }}>
                    {AP_STATUS_LABEL[a.status] ?? a.status}
                  </span>
                  {a.status === "pending" && isManagerUp && (
                    <span style={{ display: "flex", gap: 6 }}>
                      <button style={btnDark} onClick={() => decide(a.id, true)}>承認</button>
                      <button style={btnLight} onClick={() => decide(a.id, false)}>却下</button>
                    </span>
                  )}
                </div>
              ))}
        </div>
        )}

          </div>
          <div>
        {/* 明細（段R2: 注文タブ＝タップの結果をその場で確認する） */}
        {dtab === "order" && (
        <div className="nox-cardtop" style={card}>
          <h3 style={t.cardTitle}>明細</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {lines.map((l) => {
                const isDisc = l.kind === "discount"; // ★F3c: 承認割引（正の値・表示は −・削除不可＝承認経由のみ）
                // キャストドリンク（mig0070）: 凍結値で判定＝DB（check_close / proxy）と同じ真実を見る。
                const isExempt = l.back_snapshot?.back_exempt === true;
                const claim = claims.find((c) => c.check_line_id === l.id);
                return (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: 6, color: "var(--sub)" }}>[{l.pay_group}]</td>
                    <td style={{ padding: 6, color: isDisc ? "var(--bad)" : "var(--ink)" }}>{l.name_snapshot}</td>
                    <td style={{ ...t.num, padding: 6, textAlign: "right", color: "var(--sub)" }}>{isDisc ? "" : `${yen(l.unit_price_snapshot)} × ${l.qty}`}</td>
                    <td style={{ ...t.num, padding: 6, textAlign: "right", color: isDisc ? "var(--bad)" : "var(--ink)" }}>
                      {isDisc ? `−${yen(l.line_total)}` : yen(l.line_total)}
                    </td>
                    {/* キャストドリンク列＝除外指定の行だけに出す（非除外は空セル＝既存行の見え方は不変） */}
                    <td style={{ padding: 6 }}>
                      {isExempt && (claim ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--champ)" }}>
                            {castName(claim.cast_id)}
                          </span>
                          <span style={{ ...t.num, fontSize: 11, color: "var(--sub)" }}>{yen(claim.back_amount)}</span>
                          {/* 取消は open のときだけ描画＝close 後は導線ごと消す（押せるのに弾かれる形にしない） */}
                          {check?.status === "open" && (
                            <button onClick={() => void claimVoid(claim.id)} disabled={claimBusy}
                              style={{ ...btnLight, padding: "1px 7px", fontSize: 11 }}>取消</button>
                          )}
                        </span>
                      ) : check?.status === "open" ? (
                        claimPick === l.id ? (
                          <select autoFocus defaultValue=""
                            onChange={(e) => { if (e.target.value) void claimAssign(l.id, e.target.value); else setClaimPick(null); }}
                            style={{ ...input, fontSize: 11.5, padding: "2px 6px", maxWidth: 150 }}>
                            <option value="">キャストを選ぶ…</option>
                            {/* 着卓中（この伝票の指名）を先頭に寄せる。選択自体は制限しない＝
                                指名に入っていないキャストが運んだケースも実務では起きるため。 */}
                            {[...casts].sort((a, b) => {
                              const av = nomWeights[a.id] > 0 ? 0 : 1, bv = nomWeights[b.id] > 0 ? 0 : 1;
                              return av - bv || a.name.localeCompare(b.name, "ja");
                            }).map((ca) => (
                              <option key={ca.id} value={ca.id}>
                                {nomWeights[ca.id] > 0 ? `★着卓 ${ca.name}` : ca.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <button onClick={() => { setClaimMsg(null); setClaimPick(l.id); }} disabled={claimBusy}
                            style={{ ...btnLight, padding: "2px 8px", fontSize: 11.5, whiteSpace: "nowrap" }}>
                            キャストに付ける
                          </button>
                        )
                      ) : null)}
                    </td>
                    <td style={{ padding: 6 }}>
                      {isDisc ? (
                        <span style={{ fontSize: 11, color: "var(--sub)" }}>承認割引</span>
                      ) : (
                        <button
                          onClick={() => removeLine(l.id)}
                          disabled={payments.length > 0}
                          title={payments.length > 0 ? "入金後の訂正は取消（void）で" : ""}
                          style={{ ...btnLight, padding: "2px 8px", fontSize: 12 }}
                        >
                          削除
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* キャストドリンクの起票/取消エラー（握り潰さない＝seatMsg と同流儀で行の直下に出す） */}
          {claimMsg && <p style={{ fontSize: 12, fontWeight: 700, color: "var(--bad)", margin: "8px 0 0" }}>{claimMsg}</p>}
          {/* 段0R 第1陣: planA .sumrow＝明細の下に伝票サマリ。★表示のみ。
              値は会計タブの「会計（伝票グループ別）」と同一の groupInfo（小計 bx・割引 disc・
              請求 due＝groupDue）を group 横断で合計しただけで、新しい計算ロジックは作っていない。
              合計行（.total）は白太 22px＝planA の見出し扱い。会計タブのテーブルは従来どおり残置。 */}
          <div className="nox-sumrow"><span>小計</span><span className="num">{yen(sumBx)}</span></div>
          <div className="nox-sumrow">
            <span>割引</span>
            <span className="num" style={sumDisc > 0 ? { color: "var(--bad)" } : undefined}>
              {sumDisc > 0 ? `−${yen(sumDisc)}` : "—"}
            </span>
          </div>
          <div className="nox-sumrow total"><span>合計（請求・サ料込）</span><span className="num">{yen(sumDue)}</span></div>
        </div>
        )}

        {/* 会計（段R2: 会計タブ） */}
        {dtab === "pay" && (
        <div className="nox-cardtop" style={card}>
          <h3 style={t.cardTitle}>会計（伝票グループ別）</h3>
          <table style={{ borderCollapse: "collapse", fontSize: 13, marginBottom: 10 }}>
            <thead>
              <tr>
                <th style={t.th}>伝票</th>
                <th style={t.th}>小計</th>
                <th style={t.th}>割引</th>
                <th style={t.th}>請求（サ料込）</th>
                <th style={t.th}>入金済</th>
                <th style={t.th}>残額</th>
              </tr>
            </thead>
            <tbody>
              {groupInfo.map((gi) => (
                <tr key={gi.g}>
                  <td style={t.td}>{gi.g}</td>
                  <td style={{ ...t.td, ...t.num }}>{yen(gi.bx)}</td>
                  <td style={{ ...t.td, ...t.num, color: gi.disc > 0 ? "var(--bad)" : "var(--sub)" }}>{gi.disc > 0 ? `−${yen(gi.disc)}` : "—"}</td>
                  <td style={{ ...t.td, ...t.num, fontWeight: 700, color: "var(--v2-text)" }}>{yen(gi.due)}</td>
                  <td style={{ ...t.td, ...t.num }}>{yen(gi.paid)}</td>
                  <td style={{ ...t.td, ...t.num, color: gi.remaining > 0 ? "var(--bad)" : "var(--ok)" }}>{yen(gi.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>伝票</span>
            <input value={payGroup} onChange={(e) => setPayGroup(e.target.value)} style={{ ...input, width: 40 }} />
            <select
              value={payMethod}
              onChange={(e) => { setPayMethod(e.target.value); if (!DETAIL_METHODS.has(e.target.value)) setPayDetail(""); }}
              style={input}
            >
              {Object.entries(METHOD_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <input
              type="number" min={1} value={payAmount}
              onChange={(e) => setPayAmount(Number(e.target.value))}
              style={{ ...input, width: 110 }}
            />
            {payMethod === "cash" && (
              <input
                placeholder="お預かり" value={payTendered}
                onChange={(e) => setPayTendered(e.target.value)}
                style={{ ...input, width: 100 }}
              />
            )}
            {/* F4c: 手段内訳（任意・端末名やQR事業者名の控え＝突合用メモ。金額・集計には一切影響しない） */}
            {DETAIL_METHODS.has(payMethod) && (
              <input
                placeholder="内訳（任意）例: stera端末 / PayPay"
                value={payDetail} maxLength={50}
                onChange={(e) => setPayDetail(e.target.value)}
                style={{ ...input, width: 200 }}
              />
            )}
            <button onClick={pay} style={btnDark}>入金</button>
          </div>
          {/* ★台帳 #37（裁定 2026-07-17）: void 伝票の payments は無印（status 列を持たない）＝
              日次集計は checks.status='closed' の join で自動除外・端末側の返金で端末日計も減るため突合は成立する。 */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {payments.map((p) => (
              <span key={p.id} style={{ ...t.num, fontSize: 12, color: "var(--sub)" }}>
                [{p.pay_group}] {METHOD_LABEL[p.method]}{p.method_detail ? `（${p.method_detail}）` : ""} {yen(p.amount)}
                {p.tendered != null ? `（預 ${yen(p.tendered)}・釣 ${yen(p.tendered - p.amount)}）` : ""}
              </span>
            ))}
          </div>
          {/* B4 裁定(f): close フローの促し注記のみ（自動実行しない）。auto かつ open のときだけ表示。 */}
          {timeMode === "auto" && check.status === "open" && (
            <p style={{ fontSize: 11.5, color: "var(--gold2)", margin: "10px 0 0", lineHeight: 1.6 }}>
              時間制（自動）の店です。時間料金が未反映または古い可能性があります。
              必要なら上の「時間料金を明細へ反映／更新」を押してから会計してください。
            </p>
          )}
          {/* 動線改修v3: モック .payrow＝主ボタン＋戻るの2列（≤641 で下部 sticky・safe-area 対応）。
              ★会計完了はハンドラも充足判定による disabled も文言も1文字も変えていない。
                「← フロア」は backbar と同じ既存 closeDetail の再利用（新規ロジックなし）。 */}
          <div className="nox-payrow">
          <button
            onClick={closeCheck}
            disabled={!allCovered}
            style={{ ...btnDark, padding: "13px 28px", opacity: allCovered ? 1 : 0.4 }}
          >
            会計完了（close）
          </button>
          <button type="button" className="nox-backbtn" onClick={() => void closeDetail()}>← フロア</button>
          </div>
        </div>
        )}
          </div>
        </div>
      </div>
      ) : (
      /* ── フロアビュー（全幅）＝承認キュー・レシート印刷・卓・ボトルキープはこちらに残置 ── */
      <>
      {/* F3f: ドリンク申告の承認キュー（pending 0 件 or 権限なしなら自身で非表示＝RLS 任せ） */}
      <DrinkClaimQueue />
      {/* F4b: 会計クローズ後のレシート印刷カード（printer_enabled の店のみ表示＝fail-closed） */}
      {printCard && (
        <section className="nox-cardtop" style={{ ...card, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* 段R2 可読性: 見出しは白（金は選択・主ボタン・バッジの3役のみ） */}
            <h2 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--v2-text)", margin: 0 }}>
              レシート印刷（伝票 {printCard.checkId.replace(/-/g, "").slice(0, 8)}）
            </h2>
            {printCard.groups.map((g) => (
              <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <button style={btnDark} onClick={() => void enqueuePrint(printCard.checkId, g)}>
                  {printCard.groups.length > 1 ? `グループ${g} を印刷` : "レシート印刷"}
                </button>
                {printMsg[g] && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 9px",
                    color: printMsg[g].startsWith("失敗") || printMsg[g].includes("無効") ? "var(--bad)" : "#C9A24A",
                    background: "#23232B", border: "1px solid var(--line2)", whiteSpace: "nowrap",
                  }}>{printMsg[g]}</span>
                )}
              </span>
            ))}
            <button style={{ ...btnLight, marginLeft: "auto" }} onClick={() => setPrintCard(null)}>閉じる</button>
          </div>
        </section>
      )}
      {/* 卓一覧（段R2: 縦積みリスト → タイルグリッド。正本 planA の .seats/.seat）。
          ★onClick は openSeat のまま＝押したときの挙動は1文字も変えていない。
          追加表示は 会計金額（checks.total）と 着卓キャスト顔（check_nominations）＝どちらも既存可視面。 */}
      {/* nox-regfloor＝2カラム時に1列目を受け持つマーカー。旧 flex 時代の flex/minWidth 指定は
          grid では死んでいる（幅は列が決める）ので撤去＝段0R その5「幅は親が決める」と同型。 */}
      <section className="nox-cardtop nox-regfloor" style={card}>
        <h2 style={{ ...t.cardTitle, display: "flex", alignItems: "center", gap: 8 }}>
          卓
          <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--v2-muted)" }}>
            使用中 <span className="num" style={{ color: "var(--v2-text)" }}>{Object.keys(openMap).length}</span> / {seats.length}卓
          </span>
        </h2>
        <div className="nox-seatgrid">
          {seats.map((s) => {
            const cid = openMap[s.id];
            const busy = !!(cid || addMap[s.id]);
            const heads = cid ? (openNoms[cid] ?? []) : [];
            // 動線改修v3: 選択中ハイライト sel は撤去＝伝票を開くとフロア自体を描画しないため
            //   構造的に true になり得ない（TS も check を null に絞る）。モックも .seat:hover のみ。
            return (
              <button
                key={s.id}
                onClick={() => openSeat(s)}
                className={["nox-seat", busy ? "busy" : ""].filter(Boolean).join(" ")}
              >
                <div className="nm">{s.name}</div>
                <div className="kind">{s.kind ?? " "}</div>
                {cid ? (
                  <>
                    <div className="stay num">
                      {openStarted[s.id] ? `滞在 ${elapsedMin(openStarted[s.id], nowMs)}分` : "使用中"}
                    </div>
                    {heads.length > 0 && (
                      <div className="heads">
                        {heads.slice(0, 4).map((cid2) => (
                          <CastAvatar key={cid2} name={castName(cid2)} url={photoUrls.get(cid2)} variant="flat" size={22} />
                        ))}
                      </div>
                    )}
                    <div className="amt num">{yen(openTotal[cid] ?? 0)}</div>
                  </>
                ) : addMap[s.id] ? (
                  <div className="stay">
                    {seats.find((h) => h.id === primaryOf[addMap[s.id]])?.name ?? "他卓"} と同一会計
                  </div>
                ) : (
                  <div className="empty">空席</div>
                )}
              </button>
            );
          })}
        </div>
        {msg && <p style={{ fontSize: 12, color: "var(--v2-muted)", margin: "10px 0 0" }}>{msg}</p>}
      </section>
      <p style={{ fontSize: 13, color: "var(--sub)", padding: 16 }}>卓を選択してください。</p>
      {/* A2（裁定8）: ボトルキープ登録＝checkout フロー内（NOX8 裁定）。会計タブ末尾の全幅カード */}
      <BottleKeepPanel storeId={storeId} products={products} />
      </>
      )}
    </div>
      )}
    </div>
  );
}
