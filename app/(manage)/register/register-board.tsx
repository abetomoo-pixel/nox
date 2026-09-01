"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import { createClient } from "@/lib/supabase/client";
import { groupDueFull, timeStatusOf } from "@/lib/nox/check-calc";
import { renderSVG } from "uqr"; // R2-c: 領収書公開 URL の QR（依存ゼロの軽量ライブラリ・裁定 R2-13）
import { taxOf } from "@/lib/nox/receipt";
import Modal from "@/components/ui/modal";
import CastPicker from "@/components/ui/cast-picker";
import { useTapBatch } from "@/lib/nox/ui/use-tap-batch";
import { groupProducts } from "@/lib/nox/ui/product-groups";
import * as t from "@/lib/nox/ui/theme";
import CastAvatar from "@/components/ui/cast-avatar";
import { resolveOrgId, signCastPhotos } from "@/lib/nox/cast-photo";
import { fetchStockTotals } from "@/lib/nox/master/queries";
import ReservationPanel from "./reservation-panel";
import DrinkClaimQueue from "./drink-claim-queue";
import BottleKeepPanel from "./bottle-keep-panel";
import { BILLING_LOCKED_MSG, isBillingLocked } from "@/lib/billing/messages";

type Seat = { id: string; name: string; kind: string | null; store_id: string };
// 純増⑦（mig0063）: category_id でタイルをカテゴリ別に束ねる（未登録店は type 別へフォールバック）
// 段R2: reorder_point＝低在庫「残N」のしきい（null=しきい無し＝表示しない）
// mig0081: sort_order＝カテゴリ内の並び順（groupProducts が sort_order→name で並べる）。
type Product = { id: string; name: string; type: string; price: number; category_id: string | null; reorder_point: number | null; sort_order: number; back_exempt_from_split: boolean | null };
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
  // C4（mig0113）: 税設定の開栓時凍結3値（旧伝票キャッシュ対策で optional・欠落=既定と同値）
  business_tax_status?: string;
  price_display?: string;
  tax_rounding?: string;
  started_at: string;
  // B4（mig0052）: 時間料金の open 時スナップ5値（非遡及＝time_mode は非スナップ・stores live 判定）
  set_min: number;
  set_fee: number;
  ext_min: number;
  ext_fee: number;
  time_per: string;
  // R2-a（mig0098）: 開栓時凍結の延長メニュー（null=旧伝票＝既定のみ・2件以上でボタン群表示）
  ext_menu_snap: { rule_id: string; duration_min: number; amount: number; label: string }[] | null;
};
// check_time_charge_apply の返値 jsonb（サーバ再計算の内訳・表示専用）
// mig0089 行分離: 返り値は line_id → set_line_id/ext_line_id（額0/blocks0 の側は null）
type TimeCalc = { elapsed_min: number; units: number; blocks: number; set_c: number; ext_c: number; total: number; set_line_id: string | null; ext_line_id: string | null };
// R-1a（裁定61）: 完了メッセージは**宛先を構造で持つ**。
//   to＝描画点の識別子（描画点は to の一致だけで描画する）・kind＝色（ok/bad）。
//   ★文字列の内容（includes 等）で描画先を決める実装は作らない
//     ＝旧 `feeMsg.includes("同伴")` が指名カードと同伴料カードの二重表示を生んだ原因。
type Notice = { to: string; text: string; kind: "ok" | "bad" };
// msg の描画点（4つ）。floor＝フロア一覧・detail＝伝票詳細ビュー・pay＝入金モーダル・
//   time＝時間料金（手動）カード＝延長の完了文言（R-1a 段2。エラーは従来どおり timeMsg）。
const MSG_FLOOR = "floor";
const MSG_DETAIL = "detail";
const MSG_PAY = "pay";
const MSG_TIME = "time";
// feeMsg の描画点（2つ）＝指名カード・同伴料カード。
const FEE_SHIMEI = "shimei";
const FEE_DOHAN = "dohan";
// 領収書カードの成功文言（色分けの唯一の分岐点＝入金モーダル :msg と同じ既存の流儀）
const RCPT_COPIED = "確認用 URL をコピーしました";
type Line = {
  id: string;
  kind: string;
  pay_group: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  qty: number;
  line_total: number;
  // E8-1b F5（mig0091）: グループ付け替えの可否判定（time_auto 行は 'A' 固定＝RPC 'time line' 拒否）
  time_auto: boolean;
  // E8-1d: 指名種別バッジの判定材料（mig0084 の凍結列＝hon_shimei/jonai_shimei/dohan の課金行）
  fee_kind: string | null;
  cast_id: string | null;
  // C3（mig0111）: 税区分スナップ（外税店の due 鏡像＝groupDueFull が読む）
  tax_category?: string | null;
  // R-2a-2（mig0097）: auto 時間行の回次。set=0・extension=1..n・legacy 合算行と手動行は null。
  //   時間帯分解の表示にだけ使う（金額は line_total の凍結値＝再計算しない）。
  block_no: number | null;
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
// ★R-2b（裁定100・mig0118/0119）: 種別と同伴はキャスト別の行属性（checks.nom_type は派生サマリ）。
type Nom = { cast_id: string; ratio_weight: number; nom_kind: "hon" | "jonai" | "free"; is_dohan: boolean };
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
// R-2a: 指名料の課金行（mig0084・cast_id を持つ2種）。同伴料行（fee_kind='dohan'）は cast_id=null＝ここに含めない。
const SHIMEI_FEE_KINDS = new Set(["hon_shimei", "jonai_shimei"]);
const isShimeiLine = (l: { fee_kind: string | null }) => SHIMEI_FEE_KINDS.has(l.fee_kind ?? "");
// R-2a-3: 相対重みを Σ=100 の % へ正規化（表示用）。丸めは「均等に分配」と**同じ作法**＝
//   floor ＋ 端数を先頭（配列順＝DB position 順）から +1。新しい丸め規則を作らない。
//   Σ=100 恒等の根拠: rem = 100 − Σfloor(100wᵢ/W) は各項の小数部の和＝整数かつ 0 ≤ rem ≤ n−1
//   （各小数部 < 1）なので、先頭 rem 件に +1 すれば必ず Σ=100 になる。
//   例: 1,1,1,1→25,25,25,25 ／ 19,1→95,5 ／ 2,1,1→50,25,25 ／ 1,1,1→34,33,33。
function normalizeShares(entries: [string, number][]): Record<string, number> {
  const alive = entries.filter(([, w]) => w > 0);
  const sum = alive.reduce((a, [, w]) => a + w, 0);
  const out: Record<string, number> = {};
  if (sum <= 0) return out;
  let rem = 100;
  const floors = alive.map(([id, w]) => { const f = Math.floor((w * 100) / sum); rem -= f; return [id, f] as [string, number]; });
  for (const [id, f] of floors) { out[id] = f + (rem > 0 ? 1 : 0); if (rem > 0) rem--; }
  return out;
}
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
  if (msg.includes("auto mode")) return "自動計算の店です（時間料金は会計タブで自動反映されます）"; // R-A3: check_extension_add の manual 専用ガード
  if (isBillingLocked(msg)) return BILLING_LOCKED_MSG;
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
  // レジ時間UX R2: 主席 seat_id→時間スナップ（卓タイルの時間ステータス用）。checks 直 SELECT の列追加のみ
  //   （RLS は行スコープ＝列追加は素通り・段B started_at 追加と同じ presentation 扱い）。
  //   ★R-A4（0089）: 表示は両モード共通（スナップは manual 店も凍結済み）＝store の time_mode 取得は不要になった。
  const [openTime, setOpenTime] = useState<Record<string, { setMin: number; extMin: number; timePer: string; people: number | null }>>({});
  // レジ時間UX R1: 開卓モーダル（フリー卓タップ→即 open を廃止・人数は任意＝空欄なら null 送信）
  const [openSeatTarget, setOpenSeatTarget] = useState<Seat | null>(null);
  const [openPeople, setOpenPeople] = useState("");
  const [openBusy, setOpenBusy] = useState(false);
  // R2-a（mig0098 R2-5）: 開卓時ルール手動選択。""=自動（優先順位で決定）＝p_set_rule_id 省略。
  //   候補は当該店の有効 set ルール（pricing_rules 直読・owner/manager のみ取得＝staff/cast は既定固定）。
  //   0〜1件の店はセレクタ非表示（現行と同じ見た目）。
  const [setRules, setSetRules] = useState<{ id: string; amount: number; duration_min: number | null; seat_kind: string | null; time_from_min: number | null; time_to_min: number | null }[]>([]);
  const [openRuleSel, setOpenRuleSel] = useState("");
  useEffect(() => {
    if (!isManagerUp) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("pricing_rules")
        .select("id, amount, duration_min, seat_kind, time_from_min, time_to_min")
        .eq("store_id", storeId).eq("fee_kind", "set").eq("is_active", true)
        .order("priority").order("created_at");
      if (alive) setSetRules((data ?? []) as typeof setRules);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, isManagerUp]);
  // ルールの表示ラベル: 「¥額/分」＋条件の要約（席種・時間帯）。pricing_rules に名前列は無い。
  const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  const setRuleLabel = (r: (typeof setRules)[number]) =>
    `¥${r.amount.toLocaleString()}/${r.duration_min ?? "店既定"}分` +
    (r.seat_kind ? `・${r.seat_kind}` : "") +
    (r.time_from_min != null && r.time_to_min != null ? `・${hm(r.time_from_min)}-${hm(r.time_to_min)}` : "");
  // E8-1 ⑤: 「本日出勤」＝最終打刻が 'in' のキャスト（直近20h の punches・表示順とバッジのみの近似）。
  //   RLS は自店スコープ＝直 SELECT 可。金額・按分・RPC には一切関与しない。
  const [todayIds, setTodayIds] = useState<Set<string>>(new Set());
  // E8-1 #8/⑤: キャストドリンクの対象指定モーダル（product=タップ時・line=明細行の後付け）
  const [drinkPick, setDrinkPick] = useState<{ mode: "line"; lineId: string } | { mode: "product"; product: Product } | null>(null);
  // E8-1 ④: 入金モーダル（BANZEN register-table.tsx:360-483 写経・NOX 4値）
  const [payModal, setPayModal] = useState(false);
  // E8-1 #9: 人数±（check_set_people・mig0090）
  const [peopleBusy, setPeopleBusy] = useState(false);
  const [peopleMsg, setPeopleMsg] = useState<string | null>(null);
  // E8-1 ⑦: 「＋会計を分ける」で作った未使用グループ（明細に載れば knownGroups へ自然合流）
  const [extraGroups, setExtraGroups] = useState<string[]>([]);
  // E8-1 ⑥: 卓起点予約（開卓モーダル→「予約を入れる」→予約タブへ卓プリフィル）
  const [reservePrefillSeat, setReservePrefillSeat] = useState<string | null>(null);
  // E8-1b F2: 指名カード内のローカルメッセージ（旧 setMsg はフロアでしか描画されない＝エラー非表示バグの是正）
  const [feeMsg, setFeeMsg] = useState<Notice | null>(null);
  // E8-1b F3: 席操作の視覚選択モーダル（相席追加 / 席移動）
  const [seatPick, setSeatPick] = useState<"add" | "move" | null>(null);
  // E8-1b F5（mig0091）: 明細グループ付け替えモーダル（対象行 id）
  const [groupPick, setGroupPick] = useState<string | null>(null);
  // E8-1b F6: close 後モーダル（合計・お釣り・再印刷・簡易領収書）
  const [closeInfo, setCloseInfo] = useState<{ checkId: string; total: number; change: number | null; groups: string[] } | null>(null);
  // ★DP1 P2 b#16: 伝票取消をモーダル化（モック billhead の danger ボタン→確認ダイアログ）。
  //   旧実装は window.prompt で理由を取っていた＝ブラウザ既定 UI で、取消対象・金額を確認できなかった。
  // ★DP1 P2 b#22: 商品をクリア（モック cart の clearItems）。確認モーダルを挟む。
  const [clearModal, setClearModal] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [voidModal, setVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  // R2-c（mig0099）: 正式領収書の発行（E8-1c の揮発分割 UI を receipt_issue 結線へ置換）。
  //   複数枚は「複数回発行」で表現（1枚=台帳1行・Σamount ≤ 伝票総額はサーバがガード）。
  //   採番 R-連番・QR（公開 URL /r/{token}）・印刷は発行済み一覧から。
  type RcptIssued = { id: string; serial: number; token: string; amount: number;
    expires_on: string; biz_date: string; store_name: string; name: string; note: string };
  const [rcptForm, setRcptForm] = useState<{ amount: string; name: string; note: string }>({ amount: "", name: "", note: "" });
  const [rcptIssued, setRcptIssued] = useState<RcptIssued[]>([]);
  const [rcptBusy, setRcptBusy] = useState(false);
  const [rcptMsg, setRcptMsg] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [invoiceRegNo, setInvoiceRegNo] = useState(""); // 適格請求書の登録番号（settings_json.invoice_reg_no・空=行を出さない）
  const [checkSeats, setCheckSeats] = useState<CheckSeatRow[]>([]);
  const [seatMsg, setSeatMsg] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckRow | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  // キャストドリンク（mig0066/0067）: この伝票の確定済み claim（line_id → claim）と、
  //   キャスト選択を開いている行（null=閉）。どちらも表示状態のみ＝money 導線は RPC が権威。
  const [claims, setClaims] = useState<DrinkClaim[]>([]);
  // E8-1 ⑤: 行内 select（旧 claimPick）は CastPicker モーダル（drinkPick）へ置換＝state 撤去
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  // 料金UIレーン C4（mig0084）: 指名料・同伴料の課金行（check_shimei_add / check_dohan_add）。
  //   按分（check_set_nominations）とは別概念＝別カード・別 state。額のプレビューは出さない
  //   （解決はサーバ＝押下で RPC・pricing_resolve は owner/manager 限定でレジの staff からは呼べない）。
  const [feeCast, setFeeCast] = useState("");
  const [dohanN, setDohanN] = useState(1);
  const [feeBusy, setFeeBusy] = useState(false);
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
  const [msg, setMsg] = useState<Notice | null>(null);
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
  // ★R-2b（裁定100）: 卓1値の nomType を廃止＝キャスト別の 種別（本/場内/フリー）＋同伴（別軸）。
  const [nomKinds, setNomKinds] = useState<Record<string, "hon" | "jonai" | "free">>({});
  const [nomDohan, setNomDohan] = useState<Record<string, boolean>>({});
  const [nomWeights, setNomWeights] = useState<Record<string, number>>({});
  // ★裁定102: 課金ボタンの idem_key＝描画時に生成し成功後に再生成（連打/再送は同一行に吸収）。
  const [idemShimei, setIdemShimei] = useState<string>(() => crypto.randomUUID());
  const [idemDohan, setIdemDohan] = useState<string>(() => crypto.randomUUID());
  const [prodGroup, setProdGroup] = useState("A"); // 段B: タイル追加先の伝票グループ（既定 A）
  // 段0R 第1陣: カテゴリチップの絞り込み（""=すべて）。表示のみ・取得も RPC も不変。
  const [catFilter, setCatFilter] = useState("");
  const [cName, setCName] = useState("");
  const [cPrice, setCPrice] = useState(0);
  const [cKind, setCKind] = useState("charge"); // R-A2: 既定から set を外す（セットは 0089 で自動化＝手打ち封じ）
  const [cGroup, setCGroup] = useState("A");
  const [payGroup, setPayGroup] = useState("A");
  const [payMethod, setPayMethod] = useState("cash");
  // ── ★C3 §6-6（裁定90-⑤・v2.0 規則＝台帳収載）: card_surcharge＝通常の課税 charge 行 ──
  //   行の形: check_add_line カスタム経路 kind='charge'・fee_kind=null・name='カード手数料(N%)'
  //   tax_category は RPC 未指定＝列 default 'taxable_10' スナップ（T6）。専用 kind は作らない。
  //   基底=挿入時点の対象 group の due（サ料・税・店設定丸め適用後）× rate/100 を round 1回。
  //   挿入後は通常行として再計算に参加（外税店では手数料行にも税が乗る・サ料の母集合にも入る）。
  //   二重取り防止=1 pay_group 1行まで（UI ガード＝下の hasSurcharge）。支払方法との自動連動なし。
  const [surchargeRate, setSurchargeRate] = useState<number | null>(null);
  const SURCHARGE_PREFIX = "カード手数料(";
  const hasSurchargeIn = (g: string) =>
    lines.some((l) => l.pay_group === g && l.kind === "charge" && l.name_snapshot.startsWith(SURCHARGE_PREFIX));
  async function addCardSurcharge(g: string, baseDue: number) {
    if (!check || surchargeRate === null) return;
    if (hasSurchargeIn(g)) { setMsg({ to: MSG_PAY, kind: "bad", text: "この会計にはカード手数料が追加済みです" }); return; }
    const amount = Math.round((baseDue * surchargeRate) / 100);
    if (amount <= 0) { setMsg({ to: MSG_PAY, kind: "bad", text: "請求額が 0 のため手数料を追加できません" }); return; }
    if (!(await tb.flush())) return; // money 系: 保留タップを先に確定（基底 due が動くため）
    const { error } = await supabase.rpc("check_add_line", {
      p_check_id: check.id, p_product_id: null, p_qty: 1, p_kind: "charge",
      p_name: `${SURCHARGE_PREFIX}${surchargeRate}%)`, p_pay_group: g, p_unit_price: amount,
    });
    setMsg(error ? { to: MSG_PAY, kind: "bad", text: `カード手数料の追加に失敗: ${error.message}` }
      : { to: MSG_PAY, kind: "ok", text: `カード手数料 ${yen(amount)}（${surchargeRate}%）を追加しました` });
    await loadCheck(check.id);
  }
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
    // レジ時間UX R2: set_min/ext_min/time_per/people を列追加（卓タイルの超過バッジ用スナップ4値）
    const { data } = await supabase.from("checks").select("id, seat_id, started_at, total, set_min, ext_min, time_per, people").eq("status", "open");
    const m: Record<string, string> = {};      // 主席 seat_id → checkId
    const pm: Record<string, string> = {};      // checkId → 主席 seat_id（ホスト名解決）
    const st: Record<string, string> = {};      // 主席 seat_id → started_at（席タイルの経過表示）
    const tt: Record<string, number> = {};      // checkId → total（席タイルの会計金額）
    const ot: Record<string, { setMin: number; extMin: number; timePer: string; people: number | null }> = {};
    for (const r of data ?? []) {
      m[r.seat_id as string] = r.id as string; pm[r.id as string] = r.seat_id as string;
      st[r.seat_id as string] = r.started_at as string; tt[r.id as string] = (r.total as number) ?? 0;
      ot[r.seat_id as string] = { setMin: r.set_min as number, extMin: r.ext_min as number, timePer: r.time_per as string, people: (r.people as number | null) ?? null };
    }
    setOpenTime(ot);
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
      .from("check_lines").select("id, kind, pay_group, name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, time_auto, fee_kind, cast_id, block_no, tax_category")
      .eq("check_id", checkId).order("sort_order");
    // キャストドリンク: 確定済み（approved）の claim だけを引く。void/rejected は行に紐づけない。
    const { data: dcs } = await supabase
      .from("drink_claims").select("id, check_line_id, cast_id, back_amount")
      .eq("check_id", checkId).eq("status", "approved");
    const { data: ps } = await supabase
      .from("payments").select("id, pay_group, method, amount, tendered, method_detail").eq("check_id", checkId).order("paid_at");
    const { data: ns } = await supabase
      .from("check_nominations").select("cast_id, ratio_weight, nom_kind, is_dohan").eq("check_id", checkId).order("position");
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
    setDrinkPick(null); // E8-1 ⑤: 伝票再読込時はモーダルを閉じる（旧 claimPick と同じ生存期間）
    setPayments((ps ?? []) as Payment[]);
    setNoms((ns ?? []) as Nom[]);
    setApprovals((aps ?? []) as Approval[]);
    if (c) {
      // ★R-2b: キャスト別の種別・同伴を DB 行から積む（checks.nom_type は派生サマリ＝state に持たない）。
      {
        const kinds: Record<string, "hon" | "jonai" | "free"> = {};
        const dohans: Record<string, boolean> = {};
        for (const n of (ns ?? []) as Nom[]) { kinds[n.cast_id] = n.nom_kind; dohans[n.cast_id] = n.is_dohan; }
        setNomKinds(kinds); setNomDohan(dohans);
      }
      // ★裁定102: 伝票を読み直すたびに idem_key を新調（別操作は別行・同操作の再送だけ吸収）。
      setIdemShimei(crypto.randomUUID()); setIdemDohan(crypto.randomUUID());
      // R-2a-3: DB の相対重み（例 1,1,1,1）をそのまま % 欄に入れると合計4%で開幕から赤くなる＝
      //   Σ=100 へ正規化してから入れる（1,1,1,1→25×4・相対比は保存）。**表示のためだけ**の変換で、
      //   ユーザーが保存操作をするまで DB へは書き込まない（ns の順＝position 順＝端数の先頭優遇も決定的）。
      setNomWeights(normalizeShares(((ns ?? []) as Nom[]).map((n) => [n.cast_id, n.ratio_weight])));
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

  // E8-1b F4: サイドバー「レジ」再クリック＝フロアへ戻る（side-nav の nox:nav-reclick を受ける）
  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent).detail !== "/register") return;
      setTab("tables");
      void closeDetail();
    };
    window.addEventListener("nox:nav-reclick", h);
    return () => window.removeEventListener("nox:nav-reclick", h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // E8-1b F6→R2-c: 領収書の店名＋適格請求書 登録番号（settings_json.invoice_reg_no・表示専用・1回取得）
  useEffect(() => {
    if (!storeId) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("stores").select("name, settings_json, card_surcharge_rate").eq("id", storeId).single();
      if (alive) {
        setStoreName((data?.name as string | undefined) ?? "");
        setInvoiceRegNo(((data?.settings_json as Record<string, unknown> | null)?.invoice_reg_no as string | undefined) ?? "");
        // ★C3 §6-6（裁定90-⑤）: null=無効（既定）＝導線非表示
        setSurchargeRate((data?.card_surcharge_rate as number | null) ?? null);
      }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // E8-1 ⑤: 本日出勤の近似（最終打刻 'in'）。読取1本・表示専用。
  useEffect(() => {
    let alive = true;
    void (async () => {
      const since = new Date(Date.now() - 20 * 3600_000).toISOString();
      const { data } = await supabase.from("punches")
        .select("cast_id, type, punched_at").gte("punched_at", since).order("punched_at");
      const last = new Map<string, string>();
      for (const p of data ?? []) last.set(p.cast_id as string, p.type as string);
      if (alive) setTodayIds(new Set([...last].filter(([, ty]) => ty === "in").map(([id]) => id)));
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const tb = useTapBatch(commitLine, reloadCurrent, (m) => setMsg({ to: MSG_DETAIL, text: m, kind: "bad" }));

  async function openSeat(seat: Seat) {
    if (!(await tb.flush())) return; // 別 check へ切替前に保留を現 check へ確定（失敗＝中止）
    // R-1a 段2-2: 伝票詳細へ**入る時**のクリア（既存の setMsg(null) に feeMsg を寄せて1本にした）。
    //   ★描画されないまま state に残った文言が、次に伝票を開いた瞬間に再表示される事故を潰す。
    setMsg(null);
    setFeeMsg(null);
    setSeatMsg(null); // B1/B2: 席操作メッセージのクリアは席切替のここでのみ（loadCheck では消さない）
    // B1/B2: 主席 ∪ 追加席の占有ならその伝票を開く（追加席は union consult でホスト伝票＝addMap で直接解決）
    const existing = openMap[seat.id] ?? addMap[seat.id];
    if (existing) { await loadCheck(existing); return; }
    // レジ時間UX R1（裁定29）: フリー卓は即 open せず開卓モーダルへ（誤タップ開栓の防止・
    //   「何が始まるか」の明示）。nom_type は従来どおり 'free'＝指名は開栓後の指名タブで。
    setOpenPeople("");
    setOpenRuleSel(""); // R2-a: 卓を替えたら常に「自動」へ戻す（前回選択の持ち越し事故防止）
    setOpenSeatTarget(seat);
  }

  // レジ時間UX R1: 開卓の確定（check_open は既存 RPC・p_people は空欄なら null＝従来と同値）。
  //   R2-a（mig0098 R2-5）: ルール選択時のみ p_set_rule_id を送る（省略＝自動一致＝現行同値）。
  async function confirmOpenSeat() {
    const seat = openSeatTarget;
    if (!seat || openBusy) return;
    const raw = openPeople.trim();
    const n = raw === "" ? null : Number(raw);
    if (n !== null && (!Number.isInteger(n) || n <= 0)) { setMsg({ to: MSG_FLOOR, text: "人数は正の整数で入力してください（空欄可）", kind: "bad" }); return; }
    setOpenBusy(true);
    const { data, error } = await supabase.rpc("check_open", {
      p_seat_id: seat.id, p_people: n, p_nom_type: "free",
      ...(openRuleSel ? { p_set_rule_id: openRuleSel } : {}),
    });
    setOpenBusy(false);
    if (error) {
      setMsg({ to: MSG_FLOOR, kind: "bad", text: error.message.includes("bad rule")
        ? "選択した料金ルールが使えません（無効化された可能性があります・自動で開卓し直してください）"
        : error.message });
      return;
    }
    setOpenSeatTarget(null);
    // R-1a 段2-2: 開卓から詳細へ**入る時**のクリア（前の伝票の floor 文言・fee 文言を持ち越さない）
    setMsg(null);
    setFeeMsg(null);
    await loadOpenMap();
    await loadCheck(data as string);
  }

  // ★R-2b（裁定100）: 名簿1件＝{cast_id, weight, nom_kind, is_dohan}。free∧非同伴は RPC が weight=1 を
  //   強制（'bad weight'）＝ここで 1 に正規化して送る（他はそのまま＝新しい丸め規則は作らない）。
  function buildNomList(weights: Record<string, number>) {
    return Object.entries(weights)
      .filter(([, w]) => w > 0)
      .map(([cast_id, weight]) => {
        const kind = nomKinds[cast_id] ?? "free";
        const dohan = nomDohan[cast_id] ?? false;
        return { cast_id, weight: kind === "free" && !dohan ? 1 : weight, nom_kind: kind, is_dohan: dohan };
      });
  }
  async function saveNoms() {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setMsg(null);
    const { error } = await supabase.rpc("check_set_nominations", {
      p_check_id: check.id, p_nominations: buildNomList(nomWeights), // ★0119: 2引数（種別は行属性）
    });
    setMsg(error
      ? { to: MSG_DETAIL, text: error.message, kind: "bad" }
      : { to: MSG_DETAIL, text: "指名を保存しました", kind: "ok" });
    await loadCheck(check.id);
  }

  // R-1a 段2（裁定61-2）: 追加した行の**実額**を1回の select で読む共通経路。
  //   ★マスタ価格からのクライアント再計算は禁止＝伝票に実際に書かれた行（凍結値）だけを出す。
  //   ★select が落ちても RPC 自体は成功している＝**エラーにしない**。null を返して呼び出し側は
  //     「額を省いた文言」で続行する（握り潰さず console へ残す）。
  //   指名料・同伴料・延長の3経路すべてがこれを使う（同じクエリを別々に書かない）。
  async function lineAmountOf(lineId: unknown): Promise<{ unit: number | null; qty: number | null; total: number | null }> {
    if (typeof lineId !== "string") {
      console.warn("[R-1a] 行 id が取得できないため金額表示を省略します", lineId);
      return { unit: null, qty: null, total: null };
    }
    const { data, error } = await supabase.from("check_lines")
      .select("unit_price_snapshot, qty, line_total").eq("id", lineId).single();
    if (error || !data) {
      console.warn("[R-1a] 追加した行の金額を取得できませんでした（操作自体は成功）", lineId, error?.message);
      return { unit: null, qty: null, total: null };
    }
    return {
      unit: (data.unit_price_snapshot as number | undefined) ?? null,
      qty: (data.qty as number | undefined) ?? null,
      total: (data.line_total as number | undefined) ?? null,
    };
  }

  // ── 料金UIレーン C4: 指名料・同伴料の課金行（mig0084）──
  //   額はサーバが解決（開栓時凍結の checks.dohan_fee／指名は行追加時のランクで pricing_rules）。
  //   入金済み・close 後は RPC 側でも拒否されるが、ボタンも disabled にして意図を明示する。
  const chargeErrJa = (m: string | undefined): string => {
    if (!m) return "不明なエラー";
    if (m.includes("bad kind")) return "指名種別が不正です";
    if (m.includes("bad count")) return "同伴人数は1以上で入力してください";
    if (m.includes("inactive cast")) return "在籍していないキャストです";
    if (m.includes("bad cast")) return "このお店のキャストを選んでください";
    if (m.includes("not open")) return "この伝票は会計済みまたは取消済みです";
    if (m.includes("has payments")) return "入金後は追加できません（入金を取り消してから操作してください）";
    if (m.includes("forbidden")) return "権限がありません";
    return m;
  };
  // E8-1b F2: 指名フロー1本化＝CastPicker で選んだキャストへ「本指名｜場内」1押しで
  //   課金行（check_shimei_add）＋按分（check_set_nominations へ重み1で自動合流・種別も追随）。
  //   ★エラー/結果はカード内 feeMsg に表示（旧 setMsg はフロアでしか描画されない＝非表示バグの是正）。
  //   ★¥0 行は裁定①（行の存在が指名事実）のとおり立てたうえで、料金未設定を明示警告する。
  async function addShimeiUnified(kind: "hon" | "jonai") {
    if (!check || !feeCast || feeBusy) return;
    if (!(await tb.flush())) return; // money 系: 保留タップを先に確定（失敗＝中止）
    setFeeMsg(null);
    setFeeBusy(true);
    // ★裁定102: idem_key 付き（連打/再送は同一行）。成功後に次回用キーを再生成。
    const { data: lineId, error } = await supabase.rpc("check_shimei_add", {
      p_check_id: check.id, p_cast_id: feeCast, p_kind: kind, p_idem_key: idemShimei,
    });
    if (error) { setFeeMsg({ to: FEE_SHIMEI, text: chargeErrJa(error.message), kind: "bad" }); setFeeBusy(false); return; }
    setIdemShimei(crypto.randomUUID());
    // 按分へ自動反映（既に居れば重み据置・居なければ 1 で追加）＋**このキャストの**種別を課金種別へ（R-2b）
    const merged: Record<string, number> = { ...nomWeights };
    if (!((merged[feeCast] ?? 0) > 0)) merged[feeCast] = 1;
    const kinds = { ...nomKinds, [feeCast]: kind };
    setNomKinds(kinds);
    const list = Object.entries(merged).filter(([, w]) => w > 0).map(([cast_id, weight]) => {
      const k = kinds[cast_id] ?? "free";
      const d = nomDohan[cast_id] ?? false;
      return { cast_id, weight: k === "free" && !d ? 1 : weight, nom_kind: k, is_dohan: d };
    });
    const { error: e2 } = await supabase.rpc("check_set_nominations", {
      p_check_id: check.id, p_nominations: list, // ★0119: 2引数
    });
    // 追加行の額（¥0＝料金未設定の可視化。返値は行 id＝mig0084）
    //   R-1a 段2: 同伴料・延長と同一経路へ寄せた（クエリは従来と同値＝line_total を1回 select）。
    const amt = (await lineAmountOf(lineId)).total;
    setFeeBusy(false);
    setFeeMsg({
      to: FEE_SHIMEI,
      // 旧: 文字列に "失敗"/"¥0" が含まれるかで色を決めていた → kind へ移した（判定条件は同値）
      kind: e2 || amt === 0 ? "bad" : "ok",
      text: e2
        ? `指名料は追加しましたが按分の反映に失敗: ${e2.message}`
        : `${castName(feeCast)} に${kind === "hon" ? "本指名料" : "場内指名料"}${amt != null ? ` ${yen(amt)}` : ""}を追加し、按分にも反映しました${
            amt === 0 ? "。★¥0＝指名料が未設定です（マスタ→料金設定で単価を登録してください）" : ""}`,
    });
    await loadCheck(check.id);
  }
  async function addDohanFee() {
    if (!check || feeBusy) return;
    // ★R-2b（裁定100 A-5）: 同伴料は cast 必須＝対象キャスト（feeCast）を選んでから。
    if (!feeCast) { setFeeMsg({ to: FEE_DOHAN, text: "同伴するキャストをタップして選択してください（同伴料はキャスト必須になりました）", kind: "bad" }); return; }
    if (!(await tb.flush())) return;
    setFeeMsg(null);
    setFeeBusy(true);
    // R-1a 段2（裁定61-1）: 戻り uuid＝追加した行 id。★0119: cast 必須＋idem_key（裁定102）。
    const { data: lineId, error } = await supabase.rpc("check_dohan_add", {
      p_check_id: check.id, p_cast_id: feeCast, p_count: dohanN, p_idem_key: idemDohan,
    });
    if (error) {
      setFeeBusy(false);
      setFeeMsg({ to: FEE_DOHAN, text: chargeErrJa(error.message), kind: "bad" });
      await loadCheck(check.id);
      return;
    }
    setIdemDohan(crypto.randomUUID());
    // ★R-2b: 同伴料を付けたキャストは名簿の is_dohan を on にして保存（種別は据え置き＝別軸・裁定86-④）。
    {
      const merged: Record<string, number> = { ...nomWeights };
      if (!((merged[feeCast] ?? 0) > 0)) merged[feeCast] = 1;
      const dohans = { ...nomDohan, [feeCast]: true };
      setNomDohan(dohans);
      const list = Object.entries(merged).filter(([, w]) => w > 0).map(([cast_id, weight]) => {
        const k = nomKinds[cast_id] ?? "free";
        const d = dohans[cast_id] ?? false;
        return { cast_id, weight: k === "free" && !d ? 1 : weight, nom_kind: k, is_dohan: d };
      });
      const { error: e2 } = await supabase.rpc("check_set_nominations", { p_check_id: check.id, p_nominations: list });
      if (e2) console.warn("[R-2b] 同伴料は追加しましたが名簿の is_dohan 反映に失敗（行は明細に存在）", e2.message);
    }
    const { unit, total } = await lineAmountOf(lineId);
    setFeeBusy(false);
    setFeeMsg({ to: FEE_DOHAN, kind: "ok",
      // 額が取れなかったときは**額を省いた文言**で続行（操作自体は成功しているのでエラーにしない）
      text: total == null
        ? `${castName(feeCast)} に同伴料を追加しました（${dohanN}名分・金額は明細でご確認ください）`
        : unit != null
          ? `${castName(feeCast)} に同伴料 ${yen(unit)}×${dohanN}名 を追加しました（計 ${yen(total)}）`
          : `${castName(feeCast)} に同伴料 ${yen(total)} を追加しました（${dohanN}名分）` });
    await loadCheck(check.id);
  }

  // E8-1b F5（mig0091）: 明細行のグループ付け替え（time_auto 行は RPC が 'time line' で拒否＝UI も出さない）
  async function setLineGroup(lineId: string, g: string) {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setClaimMsg(null);
    const { error } = await supabase.rpc("check_line_set_group", { p_line_id: lineId, p_group: g });
    if (error) {
      const m = error.message ?? "";
      setClaimMsg(
        m.includes("bad group") ? "会計グループは A〜F です"
          : m.includes("time line") ? "時間料金の行は会計Aから動かせません"
          : m.includes("has payments") ? "入金後は付け替えできません（訂正は取消から）"
          : m.includes("not open") ? "この伝票は締められています"
          : isBillingLocked(m) ? BILLING_LOCKED_MSG
          : m.includes("forbidden") ? "権限がありません" : m);
      return;
    }
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
    setMsg(error ? { to: MSG_DETAIL, text: error.message, kind: "bad" } : null);
    setCName(""); setCPrice(0);
    await loadCheck(check.id);
  }

  // R-2a-2: check_set_nominations の**全置換1本道**（delete→insert）。名簿から外す2経路
  //   （指名料行の削除追随＝dropNomAfterShimeiRemoval／分配率カードの × ボタン）はどちらも
  //   必ずここを通る＝新しい経路を作らない。p_nom_type は **checks.nom_type（DB 値）** を
  //   そのまま渡し、ここで種別は変えない（タブ state の nomType は使わない）。
  //   渡す重みも **DB の ratio_weight**＝未保存のローカル編集を巻き込まない。
  async function replaceNomsFromDb(excludeCastId: string, chk: CheckRow): Promise<string | null> {
    // ★R-2b: 種別・同伴も **DB 行の値**をそのまま渡す（未保存のローカル編集を巻き込まない・従来の重み方針と同じ）。
    const next = noms.filter((n) => n.cast_id !== excludeCastId)
      .map((n) => ({ cast_id: n.cast_id, weight: n.ratio_weight, nom_kind: n.nom_kind, is_dohan: n.is_dohan }));
    const { error } = await supabase.rpc("check_set_nominations", {
      p_check_id: chk.id, p_nominations: next, // ★0119: 2引数（p_nom_type 撤去＝サマリは RPC が導出）
    });
    return error ? (error.message ?? "unknown") : null;
  }

  // R-2a-3（B の是正）: 指名料行を消したら、そのキャストを按分の名簿からも外す。
  //   ★check_remove_line（money RPC）は check_nominations に一切触れない＝行を消しても名簿に残る。
  //     RPC は変更禁止なので、削除の**成功後**に UI から check_set_nominations を呼び直して名簿を組み直す。
  //   ★同じキャストに指名料行がまだ残っているなら外さない（2本入っている状態の1本消しでは名簿を維持）。
  //   返り値 true = 名簿の更新に失敗（削除自体は成功している＝エラーにはしない）。
  async function dropNomAfterShimeiRemoval(removed: Line | undefined, chk: CheckRow): Promise<boolean> {
    // 指名料行でなければ名簿は触らない（同伴料・商品・時間料金・カスタムはすべてここで抜ける）
    if (!removed || !removed.cast_id || !isShimeiLine(removed)) return false;
    const castId = removed.cast_id;
    // 削除前の lines から「消した1本以外」に同じキャストの指名料行が残っているかを見る
    const stillHasFee = lines.some((l) => l.id !== removed.id && l.cast_id === castId && isShimeiLine(l));
    if (stillHasFee) return false;
    if (!noms.some((n) => n.cast_id === castId)) return false; // そもそも名簿に居ない
    const em = await replaceNomsFromDb(castId, chk);
    if (em) {
      console.warn("[R-2a] 指名料行の削除後に按分の名簿を更新できませんでした（削除自体は成功）", castId, em);
      return true;
    }
    return false;
  }

  // R-2a-2（分配率カードの × ボタン）: 名簿からキャストを1人外す＝上と同じ全置換経路。
  //   DB に居ない（＝選択しただけの未保存）キャストはローカル state を畳むだけで RPC は呼ばない。
  async function removeShareCast(castId: string) {
    if (!check) return;
    if (!(await tb.flush())) return; // saveNoms と同じ前置き（保留タップを先に確定）
    // R-2a-3: 除外後も残りを Σ=100 へ正規化（未保存の選択を外した場合 loadCheck が走らないため）
    setNomWeights((prev) => normalizeShares(Object.entries({ ...prev, [castId]: 0 })));
    if (feeCast === castId) setFeeCast("");
    if (feeMsg?.to === FEE_SHIMEI) setFeeMsg(null); // 対象名入りの文言は対象が消えたら捨てる（R-1a 追補と同じ理由）
    if (!noms.some((n) => n.cast_id === castId)) return;
    const em = await replaceNomsFromDb(castId, check);
    if (em) {
      console.warn("[R-2a-2] 按分の名簿からの除外に失敗", castId, em);
      setMsg({ to: MSG_DETAIL, kind: "bad", text: `按分から外せませんでした: ${em}` });
      return;
    }
    await loadCheck(check.id);
  }

  async function removeLine(lineId: string) {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setMsg(null);
    const target = lines.find((l) => l.id === lineId); // 削除後は lines から消えるので先に控える
    const { error } = await supabase.rpc("check_remove_line", { p_line_id: lineId });
    if (error) {
      setMsg({ to: MSG_DETAIL, text: error.message, kind: "bad" });
      await loadCheck(check.id);
      return;
    }
    const nomFailed = await dropNomAfterShimeiRemoval(target, check);
    setMsg(nomFailed
      ? { to: MSG_DETAIL, kind: "bad", text: "指名料の行は削除しました。按分は変更できませんでした（指名タブでご確認ください）" }
      : null);
    await loadCheck(check.id);
  }

  // ★DP1 P2 b#22: 商品をクリア（モック cart の `clearItems`）。
  //   ★対象は**商品行だけ**（kind ∈ drink/champ/bottle＝商品タップで入る行）。
  //     set / time / charge / custom / discount は**触らない**＝セット料金・延長・承認割引を
  //     「クリア」で消せてしまうと金額の意味が変わるため（モックの clearItems もカート＝商品の一括削除）。
  //   ★送る RPC は既存の check_remove_line のみ＝1行ずつ・引数も同一（新 RPC は作らない）。
  //   ★入金後は各行の削除ボタンと同じく不可（payments.length > 0 でボタンを出さない＝サーバ側も拒否）。
  //   ★原子性は無い（1行ずつ＝途中失敗なら部分削除で止まる）ので、失敗した時点で中断して
  //     残りを消さずに再読込する＝「どこまで消えたか」が画面と一致する。
  const CLEARABLE_KINDS = new Set(["drink", "champ", "bottle"]);
  async function clearItems() {
    if (!check || clearBusy) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    const targets = lines.filter((l) => CLEARABLE_KINDS.has(l.kind));
    if (targets.length === 0) { setClearModal(false); return; }
    setClearBusy(true);
    setMsg(null);
    for (const l of targets) {
      const { error } = await supabase.rpc("check_remove_line", { p_line_id: l.id });
      if (error) { setMsg({ to: MSG_DETAIL, text: error.message, kind: "bad" }); break; } // 途中失敗は中断（残りは消さない）
    }
    setClearBusy(false);
    setClearModal(false);
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
  //   ★レジ時間UX R3（裁定29）: 旧裁定(f)「ボタン起点のみ」を更新し、会計タブ遷移時の自動反映へ
  //     （手動ボタンは廃止。契機＝押し忘れたまま close できる構造の是正・UI 経路で塞ぐ）。
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

  // R-A3（0089）: manual 店の延長ボタン＝check_extension_add（1押し=1行・auto 店は RPC 側でも拒否）。
  //   取消は既存の行削除（remove_line）。エラーは時間カードの timeMsg へ（timeErrJa 共用）。
  //   R2-a（mig0098 R2-1）: ruleId 指定＝ext_menu_snap（開栓時凍結）から解決・省略＝既定スナップ。
  async function addExtension(ruleId?: string) {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setTimeMsg(null);
    setMsg(null); // 前回の延長の完了文言を消す（エラー文言と成功文言が並ばないように）
    // R-1a 段2: 戻り uuid＝追加した行 id（mig0098）。同伴料と同一経路で実額を読む。
    const { data: lineId, error } = await supabase.rpc("check_extension_add", {
      p_check_id: check.id, ...(ruleId ? { p_rule_id: ruleId } : {}),
    });
    if (error) {
      // ★エラー時の timeMsg の使い方は従来どおり（変えない）
      setTimeMsg(error.message.includes("bad rule")
        ? "この延長メニューはこの伝票では使えません（開卓時点のメニューのみ選べます）"
        : timeErrJa(error.message));
      return;
    }
    const { unit, qty, total } = await lineAmountOf(lineId);
    setMsg({ to: MSG_TIME, kind: "ok",
      // 額が取れなかったときは額を省いて続行（RPC は成功済み＝エラーにしない）
      text: total == null
        ? "延長を追加しました（金額は明細でご確認ください）"
        : unit != null && qty != null && qty > 1
          ? `延長 ${yen(unit)}×${qty}名 を追加しました（計 ${yen(total)}）`
          : `延長 ${yen(total)} を追加しました` });
    await loadCheck(check.id);
  }

  // レジ時間UX R3（裁定29）: 会計タブへの遷移時に1回だけ自動反映。
  //   前置き＝open ∧ 入金0 ∧ time_mode='auto'（RPC の has payments/not open ガードの前置き）。
  //   発火は「check.id × pay タブ入場」につき1回＝apply→loadCheck の state 更新（check の参照替え・
  //   payments 再セット）で再発火しないよう ref キーで抑止。タブを離れて戻る／伝票を替えると
  //   キーが変わり再反映（＝その時点の経過分へ更新）。タイマーからは呼ばない（操作起点のみ）。
  const autoTimeKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!check || dtab !== "pay") { autoTimeKeyRef.current = null; return; }
    if (autoTimeKeyRef.current === check.id) return;
    autoTimeKeyRef.current = check.id;
    if (check.status === "open" && timeMode === "auto" && payments.length === 0) void applyTimeCharge();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dtab, check, timeMode, payments]);

  // E8-1 #9（mig0090）: 開卓後の人数修正。person 制は set 行をサーバが即時追随・
  //   auto 店の延長側は次回 apply が再計算＝autoTimeKeyRef をリセットして会計タブ再入場で再反映させる。
  async function setPeopleN(next: number | null) {
    if (!check || peopleBusy) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setPeopleMsg(null);
    setPeopleBusy(true);
    const { error } = await supabase.rpc("check_set_people", { p_check_id: check.id, p_people: next });
    setPeopleBusy(false);
    if (error) {
      const m = error.message ?? "";
      setPeopleMsg(
        m.includes("bad people") ? "人数は1以上で指定してください"
          : m.includes("has payments") ? "入金後は人数を変更できません（訂正は取消から）"
          : m.includes("not open") ? "この伝票は締められています"
          : isBillingLocked(m) ? BILLING_LOCKED_MSG
          : m.includes("forbidden") ? "権限がありません" : m);
      return;
    }
    autoTimeKeyRef.current = null; // 会計タブ再入場で時間料金を現人数へ再反映（0090 設計の app 側前提）
    await loadCheck(check.id);
    await loadOpenMap();
  }

  // E8-1 #8: キャストドリンク対象商品のタップ時指定＝1杯1行で追加→直後に claim を紐付け。
  //   「指定しないで追加」は従来の連打束ね経路（tb.tap）＝未指定のまま会計も現行どおり可（ブロックしない）。
  async function addExemptWithCast(p: Product, castId: string) {
    if (!check || claimBusy) return;
    setClaimBusy(true);
    if (!(await tb.flush())) { setClaimBusy(false); return; }
    setClaimMsg(null);
    const { error } = await supabase.rpc("check_add_line", {
      p_check_id: check.id, p_product_id: p.id, p_qty: 1, p_kind: null,
      p_pay_group: prodGroup || "A", p_name: null, p_unit_price: null,
    });
    if (error) { setMsg({ to: MSG_DETAIL, text: error.message, kind: "bad" }); setClaimBusy(false); return; }
    // 直近に追加した当該商品の行へ紐付け（claims の無い最新行＝1杯1行なので一意に決まる）
    const { data: ls } = await supabase.from("check_lines").select("id")
      .eq("check_id", check.id).eq("product_id", p.id)
      .order("created_at", { ascending: false }).limit(3);
    const claimed = new Set(claims.map((c) => c.check_line_id));
    const lineId = (ls ?? []).map((l) => l.id as string).find((id) => !claimed.has(id));
    if (lineId) {
      const { error: e2 } = await supabase.rpc("drink_claim_submit_proxy", { p_line_id: lineId, p_cast_id: castId });
      if (e2) setClaimMsg(claimErrJa(e2.message));
    }
    setClaimBusy(false);
    await loadCheck(check.id);
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

  // E8-1 ④: モーダルから呼ぶため成功可否を返す（送る引数は不変・失敗時はモーダルを閉じない）
  async function pay(): Promise<boolean> {
    if (!check) return false;
    if (!(await tb.flush())) return false; // money 系: 保留を先に確定（失敗＝中止・入金前提）
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
    // R-1a 段2（裁定61）: 入力額をそのまま出す（サーバへ送った額そのもの＝再計算なし・select 不要）
    setMsg(error
      ? { to: MSG_PAY, text: error.message, kind: "bad" }
      : { to: MSG_PAY, text: `${yen(payAmount)} を入金しました`, kind: "ok" });
    if (!error) { setPayTendered(""); setPayDetail(""); }
    await loadCheck(check.id);
    return !error;
  }

  async function closeCheck() {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止・締め前提）
    setMsg(null);
    const { error } = await supabase.rpc("check_close", { p_check_id: check.id, p_idem_key: crypto.randomUUID() });
    // 失敗時は伝票が残る＝詳細ビューへ／成功時は setCheck(null) でフロアへ戻る＝フロアへ（現状の動きを変えない）
    if (error) { setMsg({ to: MSG_DETAIL, text: error.message, kind: "bad" }); return; }
    setMsg({ to: MSG_FLOOR, text: `会計完了 ${yen(check.total)}`, kind: "ok" });
    setFeeMsg(null); // R-1a 段2-2: 詳細から出る＝fee カードの文言は持ち越さない（msg は floor 宛で残す）
    const gs = Array.from(new Set(lines.map((l) => l.pay_group))).sort();
    // E8-1b F6: close 後モーダル（合計・お釣り＝最後の現金入金の預り−充当・再印刷・簡易領収書）
    const lastCash = [...payments].reverse().find((p) => p.method === "cash" && p.tendered != null);
    setCloseInfo({
      checkId: check.id, total: check.total,
      change: lastCash ? (lastCash.tendered as number) - lastCash.amount : null,
      groups: gs,
    });
    setRcptIssued([]);
    setRcptForm({ amount: "", name: "", note: "" });
    setRcptMsg(null);
    // F4b: クローズ後のレシート印刷カード（printer_enabled の店のみ・pay_group ごと・フロア残置用）
    if (printerEnabled) {
      setPrintCard({ checkId: check.id, groups: gs });
      setPrintMsg({});
    }
    setCheck(null);
    await loadOpenMap();
  }

  // ★DP1 P2 b#16: モーダルの「取消する」から呼ぶ。
  //   ★送る RPC と引数は不変＝check_void(p_check_id, p_reason)。理由の取得元が
  //     window.prompt からモーダルの input に変わっただけ（空なら押せない＝旧 `if (!reason) return` と同義）。
  //   ★flush → rpc の順序も不変（保留を先に確定してから取消＝失敗なら中止）。
  async function voidCheck() {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    const reason = voidReason.trim();
    if (!reason) return;
    const { error } = await supabase.rpc("check_void", { p_check_id: check.id, p_reason: reason });
    // close と同型＝失敗は伝票が残るので詳細ビュー・成功は setCheck(null) でフロアへ
    if (error) { setMsg({ to: MSG_DETAIL, text: error.message, kind: "bad" }); return; }
    setMsg({ to: MSG_FLOOR, text: "伝票を取消しました", kind: "ok" });
    setFeeMsg(null); // R-1a 段2-2: 同上（close と同型）
    setVoidModal(false); setVoidReason("");
    setCheck(null);
    await loadOpenMap();
  }

  // 段B: 伝票詳細シート（≤900）の背景タップで閉じる＝保留を確定してから閉じる（失敗＝中止・シート維持）
  async function closeDetail() {
    if (!(await tb.flush())) return;
    // R-1a 段2-2: 伝票詳細から**出る時**のクリア（detail 宛の文言はフロアでは描画されない＝
    //   残したままだと次に同じ伝票を開いたときに古い文言が出る）
    setMsg(null);
    setFeeMsg(null);
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
    if (error) { setMsg({ to: MSG_DETAIL, text: `${isManagerUp ? "適用" : "申請"}に失敗: ${apErrJa(error.message)}`, kind: "bad" }); return; }
    setMsg({ to: MSG_DETAIL, kind: "ok",
      text: isManagerUp ? "割引/無料を適用しました" : "割引/無料を申請しました（承認待ち）" });
    setApAmount(0); setApReason("");
    await loadCheck(check.id);
  }

  // F3c: 承認/却下（owner/manager のみ）
  async function decide(approvalId: string, approve: boolean) {
    if (!check) return;
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setMsg(null);
    const { error } = await supabase.rpc("approval_decide", { p_approval_id: approvalId, p_approve: approve });
    if (error) { setMsg({ to: MSG_DETAIL, text: `${approve ? "承認" : "却下"}に失敗: ${apErrJa(error.message)}`, kind: "bad" }); return; }
    setMsg({ to: MSG_DETAIL, kind: "ok", text: approve ? "承認しました（伝票に反映）" : "却下しました" });
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
    // ★C4 §6-6: 外税店でも表示 due が DB check_group_due と一致するよう完全鏡像へ
    //   （内税/exempt は groupDueFull 内で従来式 groupDue へ委譲＝1バイト同値・権威はサーバ）。
    const due = check ? groupDueFull(gl, check) : 0;
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

  // ── E8-1 ⑦「会計分け」: 3箇所に散っていた英字テキスト入力をセグメント統一 ──
  //   既知グループ＝明細の実在 group ∪ A ∪ 「＋会計を分ける」で作った未使用グループ。
  //   ★pay_group の意味・送る引数は不変＝入力 UI の置換のみ（分割会計の実体は従来どおり行単位）。
  const groupChoices = Array.from(new Set(["A", ...groups, ...extraGroups])).sort();
  const splitOn = groupChoices.length > 1;
  // E8-1b F5: 上限は A〜F（mig0091 check_line_set_group の '^[A-F]$' に整合＝6分割まで）
  function addSplitGroup(apply: (g: string) => void) {
    for (let i = 0; i < 6; i++) {
      const g = String.fromCharCode(65 + i);
      if (!groupChoices.includes(g)) { setExtraGroups((xs) => [...xs, g]); apply(g); return; }
    }
  }
  const groupSeg = (value: string, onChange: (g: string) => void) => (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {splitOn && (
        <span className="nox-seg" style={{ display: "inline-flex" }}>
          {groupChoices.map((g) => (
            <button key={g} type="button" className={value === g ? "on" : ""}
              style={{ fontWeight: 800, fontSize: 12, padding: "6px 12px" }}
              onClick={() => onChange(g)}>
              会計{g}
            </button>
          ))}
        </span>
      )}
      <button type="button" style={{ ...btnLight, fontSize: 11.5 }}
        disabled={groupChoices.length >= 6}
        title={groupChoices.length >= 6 ? "会計分けは最大6つ（A〜F）です" : ""}
        onClick={() => addSplitGroup(onChange)}>
        ＋会計を分ける
      </button>
    </span>
  );

  // E8-1 ⑤: 着卓中（この伝票の按分重み>0）＝CastPicker の先頭グループ＋バッジ
  const seatedIds = new Set(Object.entries(nomWeights).filter(([, w]) => w > 0).map(([id]) => id));
  // E8-1d: 指名種別の判定（表示専用・金額に一切関与しない）。
  //   課金行の凍結 fee_kind のみを見る（hon_shimei > jonai_shimei > dohan・mig0084 の cast_id 付き行）。
  //   ★R-2a-2: 旧「優先2＝伝票の nom_type へフォールバック」は廃止（下の nomKindOf を参照）。
  const castNomKind = (() => {
    const pri: Record<string, number> = { hon: 3, jonai: 2, dohan: 1 };
    const m = new Map<string, "hon" | "jonai" | "dohan">();
    for (const l of lines) {
      if (!l.cast_id) continue;
      const k = l.fee_kind === "hon_shimei" ? "hon" : l.fee_kind === "jonai_shimei" ? "jonai" : l.fee_kind === "dohan" ? "dohan" : null;
      if (!k) continue;
      const cur = m.get(l.cast_id);
      if (!cur || pri[k] > pri[cur]) m.set(l.cast_id, k);
    }
    return m;
  })();
  // ★R-2a-2（D の是正）: 旧実装は課金行の無いキャストへ **UI state の nomType をフォールバック**していた。
  //   その結果 setNomType（タブ切替）だけで、DB を1バイトも変えていないのに選択済みキャスト全員の
  //   バッジが一斉に別種別へ化けた。種別バッジの出所は **check_lines の凍結 fee_kind だけ** とする。
  //   ＝バッジ無し は「まだ何も付いていない」の正しい表示。選択されていること自体は
  //     CastPicker 既存の選択枠（--goldface2 地／--gold 枠／--champ 文字）と「着卓中」チップが表す。
  const nomKindOf = (id: string): "hon" | "jonai" | "dohan" | null => castNomKind.get(id) ?? null;
  // CastPicker へ渡す種別バッジ（本指名=gold／場内=gold2／同伴=muted）
  const nomBadges = (() => {
    const tone = (k: string) => (k === "hon" ? "gold" as const : k === "jonai" ? "gold2" as const : "muted" as const);
    const m = new Map<string, { label: string; tone: "gold" | "gold2" | "muted" }>();
    for (const ca of casts) {
      const k = nomKindOf(ca.id);
      if (k) m.set(ca.id, { label: NOM_LABEL[k], tone: tone(k) });
    }
    return m;
  })();
  // E8-1 #14: 分配プレビュー（表示計算のみ・按分の権威は check_set_nominations→payOf 側で不変）
  const nomSelected = casts.filter((ca) => (nomWeights[ca.id] ?? 0) > 0);
  const nomTotalW = nomSelected.reduce((a, ca) => a + (nomWeights[ca.id] ?? 0), 0);

  // タブセグメント（E5a: inline 再発明 segBtn を共通部品 .nox-seg へ。POS のタップ標的維持で
  // flex:1 / fontSize 13 / padding 9px 10px のみローカル上書き＝旧リテラル #1F1B12/#14120C を廃止）
  const segLocal: React.CSSProperties = { flex: 1, fontWeight: 800, fontSize: 13, padding: "9px 10px" };

  return (
    // E8-1b F6: nox-printpage＝簡易領収書の印刷隔離（.nox-print 以外は印刷時に落ちる・E5b 機構の流用）
    <div className="nox-printpage nox-mv1">
      {showReserve && (
        <div className="nox-cardtop" style={{ ...card, padding: 11 }}>
          <div className="nox-seg" style={{ width: "100%", maxWidth: 480 }}>
            {/* 会計タブへ戻るとき openMap を再読込（予約タブの to_check で開いた伝票を反映） */}
            <button className={tab === "tables" ? "on" : undefined} style={segLocal} onClick={() => { setTab("tables"); void loadOpenMap(); }}>卓席・会計</button>
            <button className={tab === "reserve" ? "on" : undefined} style={segLocal} onClick={() => setTab("reserve")}>予約</button>
          </div>
        </div>
      )}

      {tab === "reserve" && showReserve ? (
        <ReservationPanel
          storeId={storeId} seats={seats} casts={casts}
          photoUrls={photoUrls} todayIds={todayIds}
          prefillSeatId={reservePrefillSeat}
          onPrefillConsumed={() => setReservePrefillSeat(null)}
        />
      ) : (
    /* 動線改修v3（案B・選択駆動ビュー切替）: 正本 nox-register-mock-planB-viewswitch.html。
       ★state は既存の check 1本のみ＝URL 遷移なし・伝票 state も連打束ね 700ms も会計 RPC も不変。
       未選択＝フロア全幅／選択＝伝票全面（フロアは描画しない）＝2列を常時確保しない（v2R の grid 教訓）。 */
    <div className="nox-regmain">
      {/* レジ時間UX R1（裁定29）: 開卓モーダル。フリー卓タップ→即 open を廃し「開卓（セット開始）」を
          明示確定にする（誤タップ開栓の防止）。人数は任意＝空欄なら従来どおり null 送信
          （time_per='person' の店は人数倍に効くため入力を促す注記を出す）。 */}
      {openSeatTarget && (
        <Modal onClose={() => { if (!openBusy) setOpenSeatTarget(null); }}>
          <h3 style={{ ...t.cardTitle, margin: "0 0 6px" }}>{openSeatTarget.name} を開卓</h3>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 12px", lineHeight: 1.7 }}>
            開卓するとセット時間が始まり、伝票が作成されます（セット料金は明細に自動で入ります）。
          </p>
          <label style={{ ...t.fieldLabel, display: "block", marginBottom: 14 }}>
            人数（任意・空欄可）
            <input
              type="number" min={1} value={openPeople} placeholder="例: 2"
              onChange={(e) => setOpenPeople(e.target.value)}
              style={{ ...t.input, width: 110, display: "block", marginTop: 5 }}
            />
          </label>
          {/* R2-a（mig0098 R2-5）: 開卓時ルール選択（owner/manager・有効 set ルール2件以上の店のみ表示＝
              0〜1件は現行と同じ見た目）。選び直しは不可（void→再開卓）＝RPC 側の裁定どおり。 */}
          {isManagerUp && setRules.length >= 2 && (
            <label style={{ ...t.fieldLabel, display: "block", marginBottom: 14 }}>
              セット料金ルール
              <select
                value={openRuleSel} onChange={(e) => setOpenRuleSel(e.target.value)}
                style={{ ...t.input, width: "100%", maxWidth: 280, display: "block", marginTop: 5 }}
              >
                <option value="">自動（優先順位で決定）</option>
                {setRules.map((r) => <option key={r.id} value={r.id}>{setRuleLabel(r)}</option>)}
              </select>
              <span style={{ fontSize: 10.5, color: "var(--v2-muted)", display: "block", marginTop: 3 }}>
                開卓後の変更はできません（選び直しは会計取消→再開卓）。
              </span>
            </label>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button style={btnLight} disabled={openBusy} onClick={() => setOpenSeatTarget(null)}>やめる</button>
            {/* E8-1 ⑥: 卓起点予約＝この卓をプリフィルして予約タブへ（reserve タブが出せるロールのみ） */}
            {showReserve && (
              <button style={btnLight} disabled={openBusy}
                onClick={() => {
                  setReservePrefillSeat(openSeatTarget.id);
                  setOpenSeatTarget(null);
                  setTab("reserve");
                }}>
                予約を入れる
              </button>
            )}
            <button style={{ ...t.btnGold, fontWeight: 800 }} disabled={openBusy} onClick={() => void confirmOpenSeat()}>
              開卓（セット開始）
            </button>
          </div>
        </Modal>
      )}
      {/* ── E8-1 ⑤/#8: キャストドリンクの対象指定モーダル（タップ時＝product／行の後付け＝line）── */}
      {drinkPick && (
        <Modal onClose={() => { if (!claimBusy) setDrinkPick(null); }} scroll>
          <h3 style={{ ...t.cardTitle, margin: "0 0 6px" }}>
            {drinkPick.mode === "product" ? `${drinkPick.product.name} を付けるキャスト` : "この明細を付けるキャスト"}
          </h3>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px", lineHeight: 1.7 }}>
            キャストドリンクの帰属先を選びます（バック額は行の凍結値からサーバが計算）。
          </p>
          <CastPicker
            casts={casts} photoUrls={photoUrls} seatedIds={seatedIds} todayIds={todayIds}
            onPick={(id) => {
              const dp = drinkPick;
              setDrinkPick(null);
              if (dp.mode === "product") void addExemptWithCast(dp.product, id);
              else void claimAssign(dp.lineId, id);
            }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            {drinkPick.mode === "product" && (
              <button style={btnLight} disabled={claimBusy}
                onClick={() => { const p = drinkPick.product; setDrinkPick(null); tb.tap(p.id); }}>
                指定しないで追加
              </button>
            )}
            <button style={btnLight} disabled={claimBusy} onClick={() => setDrinkPick(null)}>閉じる</button>
          </div>
        </Modal>
      )}
      {/* ── ★DP1 P2 b#22: 商品クリアの確認モーダル（消える範囲を明示してから実行）── */}
      {clearModal && check && (() => {
        const targets = lines.filter((l) => CLEARABLE_KINDS.has(l.kind));
        const sum = targets.reduce((a2, l) => a2 + l.line_total, 0);
        return (
          <Modal onClose={() => { if (!clearBusy) setClearModal(false); }}>
            <h3 style={{ ...t.cardTitle, margin: "0 0 6px" }}>商品をクリアします</h3>
            <div className="nox-inset" style={{ padding: "10px 14px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)", marginBottom: 3 }}>
                <span>対象</span><span className="num">{targets.length}行</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 800 }}>減る金額</span>
                <span style={{ ...t.num, fontSize: 20, fontWeight: 900, color: "var(--bad)" }}>−{yen(sum)}</span>
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 12px", lineHeight: 1.7 }}>
              消えるのは<b style={{ color: "var(--v2-text)" }}>商品の行だけ</b>です。
              セット料金・延長・承認済みの割引は残ります。1行ずつ削除するため、途中で失敗した場合は
              そこで止まります（消えた分だけが反映されます）。
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btnLight} disabled={clearBusy} onClick={() => setClearModal(false)}>やめる</button>
              <button style={{ ...btnLight, color: "var(--bad)", borderColor: "var(--bad)" }}
                disabled={clearBusy} onClick={() => void clearItems()}>
                {clearBusy ? "削除中…" : `${targets.length}行を削除`}
              </button>
            </div>
          </Modal>
        );
      })()}
      {/* ── ★DP1 P2 b#16: 伝票取消モーダル（モック billhead の「伝票取消」danger→確認）── */}
      {voidModal && check && (
        <Modal onClose={() => setVoidModal(false)}>
          <h3 style={{ ...t.cardTitle, margin: "0 0 6px", color: "var(--bad)" }}>伝票を取消します</h3>
          <div className="nox-inset" style={{ padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)", marginBottom: 3 }}>
              <span>卓</span><span>{seats.find((x) => x.id === check.seat_id)?.name ?? "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 800 }}>合計</span>
              <span style={{ ...t.num, fontSize: 20, fontWeight: 900 }}>{yen(check.total)}</span>
            </div>
          </div>
          <p style={{ ...t.alert, marginBottom: 12 }}>
            取消は元に戻せません。入金済みの場合は端末側の返金も併せて行ってください
            （取消した伝票は日次集計から外れます）。
          </p>
          <label style={{ ...t.fieldLabel, display: "block", marginBottom: 12 }}>
            取消理由（必須）
            <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
              placeholder="例: 誤って開卓した" maxLength={200}
              style={{ ...t.input, display: "block", marginTop: 5 }} />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button style={btnLight} onClick={() => setVoidModal(false)}>やめる</button>
            <button
              style={{ ...btnLight, color: "var(--bad)", borderColor: "var(--bad)", opacity: voidReason.trim() ? 1 : 0.4 }}
              disabled={!voidReason.trim()}
              onClick={() => void voidCheck()}>
              取消する
            </button>
          </div>
        </Modal>
      )}
      {/* ── E8-1 ④: 入金モーダル（BANZEN register-table.tsx:360-483 写経・NOX 4値＋detail・
             均等割り2〜6＝ceil(残額÷N) をセットするだけ・お預かりプリセット・お釣り・不足ガード）── */}
      {payModal && check && (() => {
        const g = payGroup || "A";
        const gi = groupInfo.find((x) => x.g === g);
        const due = gi?.due ?? 0;
        const paid = gi?.paid ?? 0;
        const balance = gi?.remaining ?? 0;
        const amtValid = Number.isInteger(payAmount) && payAmount > 0;
        const tnum = payTendered.trim() === "" ? null : Number(payTendered);
        const change = payMethod === "cash" && tnum != null && Number.isFinite(tnum) && amtValid ? tnum - payAmount : null;
        const insufficient = payMethod === "cash" && tnum != null && Number.isFinite(tnum) && amtValid && tnum < payAmount;
        const presets = Array.from(new Set([
          amtValid ? payAmount : 0,
          Math.ceil((amtValid ? payAmount : 0) / 1000) * 1000,
          Math.ceil((amtValid ? payAmount : 0) / 5000) * 5000,
          10000,
        ])).filter((v) => amtValid && v >= payAmount).sort((a, b) => a - b).slice(0, 4);
        return (
          <Modal onClose={() => setPayModal(false)} scroll>
            <h3 style={{ ...t.cardTitle, margin: "0 0 10px" }}>入金{splitOn ? `（会計${g}）` : ""}</h3>
            {/* 合計／既入金／残額 */}
            <div className="nox-inset" style={{ padding: "10px 14px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)", marginBottom: 3 }}>
                <span>請求（サ料込）</span><span style={t.num}>{yen(due)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)", marginBottom: 3 }}>
                <span>既入金</span><span style={t.num}>{yen(paid)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 800 }}>残額</span>
                <span style={{ ...t.num, fontSize: 20, fontWeight: 900, color: balance > 0 ? "var(--bad)" : "var(--ok)" }}>{yen(balance)}</span>
              </div>
            </div>
            {/* 支払方法（NOX 4値・台帳#36）
                ★DP1 P2 b#39（裁定 DP1-⑧）: モックは「現金／カード／併用」の3択だが、
                  **NOX の 4値（cash/card/ar/other）は減らせない**＝`payments_method_check`（CHECK 値域）・
                  `check_pay` のハードコード検証・`daily_report_aggregate` の名指し集計の3経路に直結しており、
                  語彙を削ると日次サマリからサイレント欠落する（本ファイル冒頭 :91-97 の注記どおり）。
                ★モックの「併用」は**方法の3つ目ではなく「分けて払う」操作**＝NOX では
                  payments を複数行にすることで既に実現できている（機構は実装済み）。
                  そこで **4値は維持したまま、併用の導線を言葉で見えるようにする**（下の注記＋既存の均等割り）。 */}
            {/* ★C3 §6-6: カード手数料の導線（rate=null は非表示・1 group 1行・card 選択時は強調） */}
            {surchargeRate !== null && (
              <div style={{ marginBottom: 8 }}>
                <button type="button"
                  disabled={hasSurchargeIn(g) || due <= 0}
                  style={payMethod === "card" && !hasSurchargeIn(g)
                    ? { ...t.btnGold, ...t.btnSm }
                    : { ...t.btnGhost, ...t.btnSm }}
                  onClick={() => void addCardSurcharge(g, due)}>
                  カード手数料を追加（{surchargeRate}%・{yen(Math.round((due * surchargeRate) / 100))}）
                </button>
                {hasSurchargeIn(g) && (
                  <span style={{ fontSize: 10.5, color: "var(--sub)", marginLeft: 8 }}>追加済み（1会計1回まで・取消は明細から削除）</span>
                )}
              </div>
            )}
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", marginBottom: 6 }}>支払方法</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              {Object.entries(METHOD_LABEL).map(([v, l]) => (
                <button key={v} type="button"
                  style={payMethod === v ? { ...t.btnGold, justifyContent: "center", padding: "12px" } : { ...t.btnGhost, justifyContent: "center", padding: "12px" }}
                  onClick={() => { setPayMethod(v); if (!DETAIL_METHODS.has(v)) setPayDetail(""); }}>
                  {l}
                </button>
              ))}
            </div>
            {/* ★DP1 P2 b#39: 併用の導線（表示のみ・新しい state も RPC も無い）。 */}
            <p style={{ fontSize: 11, color: "var(--sub)", margin: "0 0 12px", lineHeight: 1.7 }}>
              <b style={{ color: "var(--v2-text)" }}>併用</b>（現金＋カードなど）は、方法を選んで
              <b style={{ color: "var(--v2-text)" }}>入金額を減らして入金</b>し、残額をもう一度別の方法で入金します。
              下の「均等割り」は 1人分＝残額÷人数 を入金額にセットする補助です。
            </p>
            {/* 均等割り（案イ）: 押すと入金額に ceil(残額÷N) をセットするだけ。先払いが ceil 額・
                最後の人は残額既定で少なく払う＝Σpayments ≥ due を必ず満たす（切り上げで不足しない） */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "var(--sub)", fontWeight: 700 }}>均等割り</span>
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" style={{ ...btnLight }} disabled={balance <= 0}
                  onClick={() => setPayAmount(Math.ceil(balance / n))}>
                  {n}分割
                </button>
              ))}
              <span style={{ fontSize: 10.5, color: "var(--sub)", width: "100%", lineHeight: 1.6 }}>
                1人分＝残額÷人数（切り上げ）をセット。最後の人は残額のまま（端数は最後が少なく）。
              </span>
            </div>
            {/* 入金額（既定＝残額・部分入金は減らす） */}
            <label style={{ ...t.fieldLabel, display: "block", marginBottom: 10 }}>
              入金額
              <input type="number" min={1} step={1} value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                style={{ ...t.input, display: "block", marginTop: 5 }} inputMode="numeric" />
              <span style={{ fontSize: 11, color: "var(--sub)", marginTop: 4, display: "block", lineHeight: 1.6 }}>
                既定は残額（{yen(balance)}）。一部だけ受け取るときは金額を減らしてください。
              </span>
            </label>
            {payMethod === "cash" && (
              <div className="nox-inset" style={{ padding: "12px 14px", marginBottom: 12 }}>
                <label style={{ ...t.fieldLabel, display: "block", marginBottom: 8 }}>
                  お預かり
                  <input type="number" min={0} step={1} value={payTendered}
                    onChange={(e) => setPayTendered(e.target.value)}
                    placeholder={amtValid ? String(payAmount) : ""}
                    style={{ ...t.input, display: "block", marginTop: 5 }} inputMode="numeric" />
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {presets.map((p) => (
                    <button key={p} type="button" style={btnLight} onClick={() => setPayTendered(String(p))}>
                      {amtValid && p === payAmount ? "ちょうど" : yen(p)}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 13, color: "var(--sub)" }}>お釣り</span>
                  <span style={{ ...t.num, fontSize: 20, fontWeight: 800, color: insufficient ? "var(--bad)" : "var(--ok)" }}>
                    {change == null ? "—" : insufficient ? "不足" : yen(change)}
                  </span>
                </div>
              </div>
            )}
            {/* F4c: 手段内訳（card/other のみ・突合用メモ＝金額・集計には一切影響しない） */}
            {DETAIL_METHODS.has(payMethod) && (
              <input placeholder="内訳（任意）例: stera端末 / PayPay" value={payDetail} maxLength={50}
                onChange={(e) => setPayDetail(e.target.value)}
                style={{ ...t.input, marginBottom: 12 }} />
            )}
            {/* R-1a: 描画点＝入金モーダル。to の一致だけで描画する（文言の内容は見ない） */}
            {msg?.to === MSG_PAY && (
              <p style={{ fontSize: 12, fontWeight: 700, color: msg.kind === "ok" ? "var(--ok)" : "var(--bad)", margin: "0 0 10px" }}>{msg.text}</p>
            )}
            <button
              style={{ ...t.btnGold, width: "100%", padding: "13px 0", fontSize: 15, fontWeight: 900, justifyContent: "center" }}
              disabled={!amtValid || insufficient}
              onClick={async () => { const ok = await pay(); if (ok) setPayModal(false); }}>
              入金する（{amtValid ? yen(payAmount) : "—"}）
            </button>
          </Modal>
        );
      })()}
      {/* ── E8-1b F3: 席の視覚選択モーダル（相席追加 / 席移動・空席タイルをタップ）── */}
      {seatPick && check && (() => {
        const emptySeats = seats.filter((s) => s.store_id === check.store_id && !openMap[s.id] && !addMap[s.id]);
        return (
          <Modal onClose={() => setSeatPick(null)} scroll>
            <h3 style={{ ...t.cardTitle, margin: "0 0 6px" }}>
              {seatPick === "add" ? "相席にする卓を選択（同一会計）" : "移動先の卓を選択"}
            </h3>
            <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>空いている卓だけ表示しています。</p>
            <div className="nox-seatgrid">
              {emptySeats.map((s) => (
                <button key={s.id} type="button" className="nox-seat"
                  onClick={() => {
                    setSeatPick(null);
                    if (seatPick === "add") void addSeat(s.id); else void moveSeat(s.id);
                  }}>
                  <div className="nm">{s.name}</div>
                  <div className="kind">{s.kind ?? " "}</div>
                  <div className="empty">空席</div>
                </button>
              ))}
              {emptySeats.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)" }}>空席がありません</p>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button style={btnLight} onClick={() => setSeatPick(null)}>閉じる</button>
            </div>
          </Modal>
        );
      })()}
      {/* ── E8-1b F5（mig0091）: 明細グループ付け替えモーダル ── */}
      {groupPick && check && (
        <Modal onClose={() => setGroupPick(null)}>
          <h3 style={{ ...t.cardTitle, margin: "0 0 6px" }}>この明細をどの会計へ？</h3>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>
            {lines.find((l) => l.id === groupPick)?.name_snapshot ?? ""}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {groupChoices.map((g) => (
              <button key={g} type="button"
                style={lines.find((l) => l.id === groupPick)?.pay_group === g
                  ? { ...t.btnGold, ...t.btnSm } : { ...t.btnGhost, ...t.btnSm }}
                onClick={() => { const id = groupPick; setGroupPick(null); void setLineGroup(id, g); }}>
                会計{g}
              </button>
            ))}
            <button type="button" style={{ ...btnLight, fontSize: 11.5 }}
              disabled={groupChoices.length >= 6}
              onClick={() => addSplitGroup((g) => { const id = groupPick; setGroupPick(null); void setLineGroup(id, g); })}>
              ＋会計を分けてそこへ
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button style={btnLight} onClick={() => setGroupPick(null)}>閉じる</button>
          </div>
        </Modal>
      )}
      {/* ── E8-1b F6: close 後モーダル（合計・お釣り・レシート再印刷・簡易領収書）── */}
      {closeInfo && (
        <Modal onClose={() => setCloseInfo(null)} scroll>
          <h3 style={{ ...t.cardTitle, margin: "0 0 10px" }}>会計完了</h3>
          <div className="nox-inset" style={{ padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 800 }}>合計</span>
              <span style={{ ...t.num, fontSize: 24, fontWeight: 900, color: "var(--champ)" }}>{yen(closeInfo.total)}</span>
            </div>
            {closeInfo.change != null && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
                <span style={{ fontSize: 13, color: "var(--sub)" }}>お釣り（最後の現金入金）</span>
                <span style={{ ...t.num, fontSize: 18, fontWeight: 800, color: "var(--ok)" }}>{yen(closeInfo.change)}</span>
              </div>
            )}
          </div>
          {printerEnabled && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              {closeInfo.groups.map((g) => (
                <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <button style={btnDark} onClick={() => void enqueuePrint(closeInfo.checkId, g)}>
                    {closeInfo.groups.length > 1 ? `会計${g} のレシート印刷` : "レシート印刷"}
                  </button>
                  {printMsg[g] && <span style={{ fontSize: 11, color: "var(--sub)" }}>{printMsg[g]}</span>}
                </span>
              ))}
            </div>
          )}
          {/* R2-c（mig0099）: 正式領収書の発行＝receipt_issue 結線（E8-1c の揮発分割 UI を置換）。
              1枚=台帳1行・複数枚は複数回発行・Σamount ≤ 伝票総額はサーバがガード（FOR UPDATE 直列化）。
              発行結果に R-連番＋公開 URL の QR。印刷は下の .nox-print-only（発行済み全枚・1枚=1ページ）。 */}
          {(() => {
            const issuedSum = rcptIssued.reduce((a, r) => a + r.amount, 0);
            const remain = closeInfo.total - issuedSum;
            const doIssue = async () => {
              if (rcptBusy) return;
              const raw = rcptForm.amount.trim();
              const amt = raw === "" ? null : Number(raw);
              if (amt !== null && (!Number.isInteger(amt) || amt <= 0)) { setRcptMsg("金額は正の整数で入力してください（空欄=残額）"); return; }
              setRcptBusy(true);
              setRcptMsg(null);
              const { data, error } = await supabase.rpc("receipt_issue", {
                p_check_id: closeInfo.checkId, p_amount: amt,
                p_recipient: rcptForm.name.trim() === "" ? null : rcptForm.name.trim(),
                p_proviso: rcptForm.note.trim() === "" ? null : rcptForm.note.trim(),
              });
              setRcptBusy(false);
              if (error) {
                const m = error.message;
                setRcptMsg(m.includes("bad amount") ? `発行できる残額を超えています（残額 ${yen(remain)}）`
                  : m.includes("not closed") ? "会計済みの伝票のみ発行できます"
                  : m.includes("bad recipient") ? "宛名は100文字以内で入力してください"
                  : m.includes("bad proviso") ? "但し書きは100文字以内で入力してください"
                  : isBillingLocked(m) ? BILLING_LOCKED_MSG
                  : m.includes("busy") ? "発行が混み合っています。もう一度お試しください"
                  : m.includes("forbidden") ? "権限がありません" : m);
                return;
              }
              const r = data as { id: string; serial: number; token: string; amount: number; expires_on: string; biz_date: string; store_name: string };
              setRcptIssued((xs) => [...xs, { ...r, name: rcptForm.name.trim(), note: rcptForm.note.trim() }]);
              setRcptForm({ amount: "", name: "", note: "" });
            };
            return (
              <div className="nox-inset" style={{ padding: "12px 14px", marginBottom: 12 }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, margin: "0 0 4px", color: "var(--champ)" }}>領収書発行（台帳記録・発行番号つき）</p>
                <p style={{ fontSize: 11, color: "var(--sub)", margin: "0 0 8px", lineHeight: 1.6 }}>
                  発行ごとに台帳へ記録され、発行番号と確認用 QR がつきます。分割するときは金額を入れて複数回発行してください
                  （残額 <span style={{ ...t.num, fontWeight: 700 }}>{yen(remain)}</span>）。
                </p>
                {remain > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                    <input type="number" min={1} value={rcptForm.amount} placeholder={`金額（空欄=残額 ${remain}）`}
                      onChange={(e) => setRcptForm((f) => ({ ...f, amount: e.target.value }))}
                      className="num" style={{ ...t.input, width: 150, textAlign: "right" }} />
                    <input placeholder="宛名（空欄は上様）" value={rcptForm.name} maxLength={100}
                      onChange={(e) => setRcptForm((f) => ({ ...f, name: e.target.value }))}
                      style={{ ...t.input, width: 150 }} />
                    <input placeholder="但し書き（空欄はご飲食代として）" value={rcptForm.note} maxLength={100}
                      onChange={(e) => setRcptForm((f) => ({ ...f, note: e.target.value }))}
                      style={{ ...t.input, width: 200 }} />
                    <button style={btnDark} disabled={rcptBusy} onClick={() => void doIssue()}>発行</button>
                  </div>
                )}
                {/* R-1a-4: 成功文言まで --bad（赤）で出ていたのを是正＝成功/失敗で色を分ける（state 構造は不変） */}
                {rcptMsg && <p style={{ fontSize: 12, fontWeight: 700, color: rcptMsg === RCPT_COPIED ? "var(--ok)" : "var(--bad)", margin: "0 0 8px" }}>{rcptMsg}</p>}
                {rcptIssued.map((r) => (
                  <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--line2)", padding: "8px 0" }}>
                    <span style={{ ...t.num, fontWeight: 800 }}>R-{String(r.serial).padStart(6, "0")}</span>
                    <span style={{ ...t.num }}>{yen(r.amount)}</span>
                    <span style={{ fontSize: 12 }}>{r.name || "上様"}</span>
                    {/* QR＝公開 URL（/r/{token}）。印刷面にも同じ QR が載る */}
                    <span style={{ width: 44, height: 44, background: "#fff", padding: 2, borderRadius: 4 }}
                      dangerouslySetInnerHTML={{ __html: renderSVG(`${window.location.origin}/r/${r.token}`, { border: 0 }) }} />
                    <button style={{ ...btnLight, marginLeft: "auto" }}
                      onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/r/${r.token}`); setRcptMsg(RCPT_COPIED); }}>
                      URL コピー
                    </button>
                  </div>
                ))}
                {rcptIssued.length > 0 && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                    <button style={btnLight} onClick={() => window.print()}>
                      領収書を印刷 / PDF{rcptIssued.length > 1 ? `（${rcptIssued.length}枚）` : ""}
                    </button>
                    <span style={{ fontSize: 11.5, color: "var(--sub)" }}>
                      発行済み {rcptIssued.length}枚・計 {yen(issuedSum)}（取消は「領収書」ページから）
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
          <button style={{ ...t.btnGold, width: "100%", padding: "12px 0", fontWeight: 800, justifyContent: "center" }}
            onClick={() => setCloseInfo(null)}>
            閉じる
          </button>
        </Modal>
      )}
      {/* R2-c: 正式領収書の印字実体（画面非表示・印刷時のみ＝.nox-print-only。白地黒字は帳票専用）。
          発行済み（rcptIssued）を1枚=1ページで印字。R-番号・発行日＋取引日併記（R2-12）・
          適格請求書事項（登録番号・内税10%＝ePOS 既在項目と同型）・公開 URL の QR。 */}
      {closeInfo && rcptIssued.length > 0 && (
        <div className="nox-print nox-print-only" style={{ background: "#fff", color: "#000" }}>
          {rcptIssued.map((r, i) => (
            <div key={r.id} style={{
              padding: "24mm 18mm", fontSize: 14, lineHeight: 1.9,
              pageBreakAfter: i < rcptIssued.length - 1 ? "always" : "auto",
            }}>
              <div style={{ textAlign: "center", fontSize: 22, fontWeight: 800, letterSpacing: 6, marginBottom: 6 }}>領　収　書</div>
              <div style={{ textAlign: "right", fontSize: 12 }}>No. R-{String(r.serial).padStart(6, "0")}</div>
              <div style={{ fontSize: 16, borderBottom: "1px solid #000", paddingBottom: 4, margin: "10px 0 14px" }}>
                {(r.name || "上") + " 様"}
              </div>
              <div style={{ textAlign: "center", fontSize: 26, fontWeight: 900, margin: "18px 0 6px" }}>
                ￥{r.amount.toLocaleString()}−
              </div>
              <div style={{ textAlign: "center", fontSize: 11 }}>
                （内消費税10% ￥{Math.floor((r.amount * 10) / 110).toLocaleString()}）
              </div>
              <div style={{ marginTop: 12 }}>但し {r.note || "ご飲食代として"}</div>
              <div>上記正に領収いたしました。</div>
              <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <div>発行日 {new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}</div>
                  <div style={{ fontSize: 12 }}>取引日 {r.biz_date}</div>
                </div>
                {/* 確認用 QR（公開 URL /r/{token}・掲載期限90日） */}
                <span style={{ width: "22mm", height: "22mm", display: "inline-block" }}
                  dangerouslySetInnerHTML={{ __html: renderSVG(`${typeof window !== "undefined" ? window.location.origin : ""}/r/${r.token}`, { border: 0 }) }} />
              </div>
              <div style={{ marginTop: 8, textAlign: "right", fontWeight: 700 }}>{r.store_name || storeName}</div>
              {invoiceRegNo && <div style={{ textAlign: "right", fontSize: 12 }}>登録番号 {invoiceRegNo}</div>}
              <div style={{ fontSize: 10, color: "#555", marginTop: 4, textAlign: "right" }}>
                QR から内容を確認できます（掲載期限: 発行から90日）
              </div>
            </div>
          ))}
        </div>
      )}
      {check ? (
      /* ── 伝票ビュー（全面）── */
      <div className="nox-checkview">
        {/* backbar（sticky）＝「← フロア」は既存 closeDetail の再利用（新規ロジックなし）＋卓名・滞在・合計 */}
        <div className="nox-backbar">
          <button type="button" className="nox-backbtn" onClick={() => void closeDetail()}>← フロア</button>
          <span className="t">{seats.find((s) => s.id === check.seat_id)?.name}</span>
          {/* E8-1 #11: 席種バッジ（モック seatbadge・seats.kind は取得済み） */}
          {(() => {
            const kind = seats.find((s) => s.id === check.seat_id)?.kind;
            return kind ? <span style={{ ...t.tag, color: "var(--sub)", borderColor: "var(--line2)" }}>{kind}</span> : null;
          })()}
          <span style={{ fontSize: 13, color: "var(--v2-muted)" }}>{NOM_LABEL[check.nom_type]}</span>
          {/* E8-1 #9（mig0090）: 人数±カウンタ。入金後はサーバ拒否＝ボタンも無効化して意図を明示 */}
          {check.status === "open" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <button type="button" style={{ ...btnLight, padding: "2px 9px", fontWeight: 800 }}
                disabled={peopleBusy || payments.length > 0 || (check.people ?? 0) <= 1}
                onClick={() => void setPeopleN(Math.max(1, (check.people ?? 1) - 1))}
                aria-label="人数を減らす">−</button>
              <span className="num" style={{ fontSize: 13, fontWeight: 700, minWidth: 34, textAlign: "center" }}>
                {check.people != null ? `${check.people}名` : "—名"}
              </span>
              <button type="button" style={{ ...btnLight, padding: "2px 9px", fontWeight: 800 }}
                disabled={peopleBusy || payments.length > 0}
                onClick={() => void setPeopleN((check.people ?? 0) + 1)}
                aria-label="人数を増やす">＋</button>
            </span>
          )}
          {check.status === "open" && (
            <span className="stay">滞在 <span className="num">{elapsedMin(check.started_at, nowMs)}</span> 分</span>
          )}
          {/* レジ時間UX R2→R-A4（0089）: 時間ステータス常時表示＝両モード共通（凍結スナップは manual 店も
              保持済み）。凍結スナップ＋nowMs tick のクライアント計算＝表示専用・権威はサーバ。超過は --bad。 */}
          {check.status === "open" && (() => {
            const ts = timeStatusOf(new Date(check.started_at).getTime(), nowMs, check.set_min, check.ext_min);
            const next = new Date(ts.nextAtMs).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
            return ts.inSet ? (
              <span className="stay">セット中 残り <span className="num">{ts.remainMin}</span> 分</span>
            ) : (
              <span className="stay" style={{ color: "var(--bad)", fontWeight: 700 }}>
                延長 <span className="num">{ts.blocks}</span> 回目（次 {next}）
              </span>
            );
          })()}
          <span className="total num"><small>合計</small>{yen(check.total)}</span>
          {/* void は manager 以上のみ表示（RPC 側でも owner/manager を強制＝二重） */}
          {isManagerUp && (
            <button onClick={() => { setVoidReason(""); setVoidModal(true); }}
              style={{ ...btnLight, color: "var(--bad)", borderColor: "var(--bad)" }}>
              伝票取消
            </button>
          )}
        </div>
        {peopleMsg && <p style={{ fontSize: 12, fontWeight: 700, color: "var(--bad)", margin: "6px 0 0" }}>{peopleMsg}</p>}
        {/* E8-1c: 人数±の注記（person 制のみ＝table 制は人数が料金に効かないため出さない・嘘をつかない）。
            ★R2-b（mig0097/0097b・裁定 R2-6/R2-7b）: auto 店も時点起算になった＝確定済み延長ブロックは
              変更時点の人数で凍結・進行中ブロックとセット料金のみ現人数で再計算＝文言を実装に追随。
            manual 店=set 行のみ即時追随・押下済み延長行は凍結（0089/0090 設計）＝従来文言のまま。 */}
        {check.status === "open" && check.time_per === "person" && (
          <p style={{ fontSize: 11, color: "var(--sub)", margin: "6px 0 0", lineHeight: 1.6 }}>
            {timeMode === "auto"
              ? "※セット中の人数変更はセット料金に反映されます。確定済みの延長には反映されません（延長は各回の確定時点の人数のまま・進行中の延長のみ新しい人数になります）"
              : "※セット中の人数変更はセット料金に反映されます。追加済みの延長行には反映されません（延長は追加時点の人数で確定します）"}
          </p>
        )}

        {/* R-1a（裁定61）: 描画点＝伝票詳細ビュー。旧実装は msg の描画点が入金モーダルとフロアにしか無く、
            指名の保存・割引/無料の適用と申請・承認/却下の文言が state に入るだけで**画面に出なかった**。
            3タブの外（backbar 直下）に置く＝どのタブから出た文言でも必ず見える。 */}
        {msg?.to === MSG_DETAIL && (
          <p style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.7, margin: "8px 0 0",
            color: msg.kind === "ok" ? "var(--ok)" : "var(--bad)" }}>{msg.text}</p>
        )}

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
          {/* E8-1b F2: 指名フロー1本化＝CastPicker→「本指名｜場内」で課金行＋按分へ自動反映。
              種別プルダウンは廃止しセグメントへ。重み微調整は折りたたみに格納。 */}
          <h3 style={t.cardTitle}>指名</h3>
          {/* ★R-2b（裁定100）: 卓で1種別のセグメントは廃止＝種別（本/場内/フリー）と同伴は
              下の「指名の分配率」でキャスト行ごとに設定（同一キャストに本指名∧同伴の同時成立可＝裁定86-④）。 */}
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px" }}>
            キャストをタップして名簿へ追加し、種別・同伴・分配率は下の「指名の分配率」で行ごとに設定します。
          </p>
          {/* ⑤: タップ＝按分トグル＋指名料の対象キャストとして記憶（feeCast） */}
          <CastPicker
            casts={casts} photoUrls={photoUrls} seatedIds={seatedIds} todayIds={todayIds}
            selectedIds={seatedIds} badges={nomBadges} dense
            onPick={(id) => {
              const on = (nomWeights[id] ?? 0) > 0;
              const nextFee = on ? (feeCast === id ? "" : feeCast) : id;
              // R-2a-3: 選択の増減後も **normalizeShares で Σ=100 へ戻す**（新しい丸め規則は作らない）。
              //   ★正規化の帰結の穴塞ぎ＝旧実装のまま「新規参加=weight 1」にすると、既存が % 値
              //     （例 100）のため 1% で参加してしまい、指名料ボタンの自動按分が 99/1 で保存される。
              //     参加時は現在の平均（Σ/n≒100/n＝等席）を仮置きして全体を正規化＝旧「1,1 は均等」と同じ意味。
              setNomWeights((prev) => {
                const n = Object.values(prev).filter((w) => w > 0).length;
                const joinW = on ? 0 : n > 0 ? Math.max(1, Math.round(100 / n)) : 100;
                return normalizeShares(Object.entries({ ...prev, [id]: joinW }));
              });
              // R-1a 追補: 指名料の文言は**対象キャスト名を含む**（「えま に本指名料 ¥3,000 を追加し…」）。
              //   対象が変われば文言は必ず不一致になるので、対象の変更点で捨てる。
              //   ★同伴料の文言（FEE_DOHAN）は対象に依存しないので残す＝to で見分ける。
              if (nextFee !== feeCast && feeMsg?.to === FEE_SHIMEI) setFeeMsg(null);
              setFeeCast(nextFee);
            }}
          />
          {/* F2: 1本化ボタン＝課金行＋按分を同時に（対象＝最後にタップしたキャスト） */}
          {(() => {
            const feeDisabled = feeBusy || check.status !== "open" || payments.length > 0;
            return (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
                <span style={{ fontSize: 12, color: feeCast ? "var(--champ)" : "var(--sub)", fontWeight: 700 }}>
                  {feeCast ? `対象: ${castName(feeCast)}` : "キャストをタップして選択"}
                </span>
                <button style={btnDark} disabled={feeDisabled || !feeCast} onClick={() => void addShimeiUnified("hon")}>
                  本指名料を付ける（＋按分）
                </button>
                <button style={btnLight} disabled={feeDisabled || !feeCast} onClick={() => void addShimeiUnified("jonai")}>
                  場内指名料を付ける（＋按分）
                </button>
                {payments.length > 0 && check.status === "open" && (
                  <span style={{ fontSize: 11.5, color: "var(--sub)" }}>入金後は追加できません</span>
                )}
              </div>
            );
          })()}
          {/* R-1a: 描画点＝指名カード。to の一致だけで描画（旧: feeMsg を無条件描画していたため
              同伴料の文言までここに出ていた＝二重表示の片側） */}
          {feeMsg?.to === FEE_SHIMEI && (
            <p style={{ fontSize: 12, fontWeight: 700, margin: "8px 0 0", lineHeight: 1.7,
              color: feeMsg.kind === "ok" ? "var(--ok)" : "var(--bad)" }}>
              {feeMsg.text}
            </p>
          )}
        </div>

        {/* R-2a-2（モック nox-register-pos `assignmentView` / renderShares）: 指名の分配率カード。
            旧 <details>「按分の重みを微調整」を独立カードへ。入力は **%**（1〜100 の整数）＝
            ratio_weight は integer の相対重みで分母は Σ なので、合計100 の % はそのまま重みとして
            check_set_nominations に渡せる（RPC・スキーマ非改変）。
            ★free は RPC が weight=1 を強制（'bad weight'）＝%入力と × を出さず均等表示のみ。 */}
        {nomSelected.length > 0 && (
          <div className="nox-cardtop" style={card}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <h3 style={{ ...t.cardTitle, marginBottom: 2 }}>指名の分配率</h3>
                {/* ★裁定105: %＝金額按分のみ（分母は伝票内全行・現行維持）。本数は種別ごと1人1件＝DB 既定。 */}
                <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 8px", lineHeight: 1.7 }}>
                  売上・バック金額の按分比率（指名本数には影響しません）。
                </p>
              </div>
              {/* モック seatbadge 相当＝合計バッジ（total===100 ? ok : bad） */}
              <span style={{ ...t.tag, whiteSpace: "nowrap",
                color: nomTotalW === 100 ? "var(--ok)" : "var(--bad)",
                borderColor: "var(--line2)" }}>
                合計{nomTotalW}%
              </span>
            </div>
            {/* ★R-2b: フリー（同伴なし）の行はサーバが重み1を固定（'bad weight'）＝%入力は無効・保存時 1 で送る。 */}
            {/* R-2a-3: 分配結果カードを統合＝1行に 名前／副文（{種別}の実績配分）／%入力／件数相当／×。
                同じ人名を2枚のカードで2度読ませない（モックは横並び2カラム・実装は縦積みのための統合判断）。 */}
            <div className="nox-inset" style={{ padding: "9px 12px", margin: "0 0 4px" }}>
              <b style={{ fontSize: 12 }}>料金と実績を分離</b>
              <p style={{ fontSize: 11, color: "var(--sub)", margin: "4px 0 0", lineHeight: 1.7 }}>
                指名本数は種別ごとに1人1件で計上します。％は売上とバック金額の取り分にのみ効きます。
              </p>
            </div>
            {nomSelected.map((ca) => {
              // ★R-2b: 種別・同伴はキャスト行の属性（裁定100・同時成立可＝裁定86-④）。
              const kind = nomKinds[ca.id] ?? "free";
              const dohan = nomDohan[ca.id] ?? false;
              const freeLocked = kind === "free" && !dohan; // RPC が weight=1 を固定
              return (
              <div key={ca.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 90 }}>
                  <b style={{ fontSize: 12.5 }}>{ca.name}</b>
                  {/* ★裁定105: 本数はキャスト行の種別で1人1件（％非依存）＝行に種別バッジ＋「1件」・同伴は別バッジ */}
                  <span style={{ display: "flex", gap: 4, marginTop: 2, flexWrap: "wrap" }}>
                    {kind !== "free" && (
                      <span style={{ ...t.tag, fontSize: 10, padding: "1px 6px", color: "var(--champ)" }}>
                        {NOM_LABEL[kind]} <span className="num">1件</span>
                      </span>
                    )}
                    {dohan && (
                      <span style={{ ...t.tag, fontSize: 10, padding: "1px 6px", color: "var(--champ)" }}>
                        同伴 <span className="num">1件</span>
                      </span>
                    )}
                    {kind === "free" && !dohan && (
                      <span style={{ fontSize: 10.5, color: "var(--sub)" }}>実績カウントなし</span>
                    )}
                  </span>
                </div>
                <span className="nox-seg" style={{ display: "inline-flex" }}>
                  {([["hon", "本"], ["jonai", "場内"], ["free", "フリー"]] as const).map(([v, l]) => (
                    <button key={v} type="button" className={kind === v ? "on" : ""}
                      style={{ fontWeight: 700, fontSize: 11, padding: "5px 9px" }}
                      onClick={() => setNomKinds((prev) => ({ ...prev, [ca.id]: v }))}>
                      {l}
                    </button>
                  ))}
                </span>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5 }}>
                  <input type="checkbox" checked={dohan}
                    onChange={(e) => setNomDohan((prev) => ({ ...prev, [ca.id]: e.target.checked }))} />
                  同伴
                </label>
                {!freeLocked ? (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <input
                      type="number" min={1} max={100} value={nomWeights[ca.id] ?? 1} aria-label={`${ca.name} の分配率`}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1)));
                        setNomWeights((prev) => ({ ...prev, [ca.id]: v }));
                      }}
                      className="num" style={{ ...input, width: 64, padding: "6px 6px", textAlign: "right" }}
                    />
                    <span style={{ fontSize: 12, color: "var(--sub)" }}>%</span>
                  </label>
                ) : (
                  <span className="num" style={{ fontSize: 12.5, color: "var(--champ)" }} title="フリー（同伴なし）は均等固定">均等</span>
                )}
                <button type="button" aria-label={`${ca.name}を分配から外す`}
                  onClick={() => void removeShareCast(ca.id)}
                  style={{ ...btnLight, padding: "2px 9px", fontWeight: 800,
                    color: "var(--bad)", borderColor: "var(--bad)" }}>
                  ×
                </button>
              </div>
              );
            })}
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 11.5 }}>
                <span style={{ color: "var(--sub)" }}>分配率の合計</span>
                <b className="num" style={{ color: nomTotalW === 100 ? "var(--ok)" : "var(--bad)" }}>{nomTotalW}%</b>
              </div>
              <div style={{ height: 6, background: "var(--line)", borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                <i style={{ display: "block", height: "100%", width: `${Math.min(100, nomTotalW)}%`,
                  background: nomTotalW === 100 ? "var(--ok)" : "var(--bad)" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
              <button type="button" style={btnLight}
                onClick={() => setNomWeights((prev) => {
                  // %版の均等＝100 を整数で山分け（端数は先頭から +1）。Σ=100 を常に満たす。
                  const next = { ...prev };
                  const n = nomSelected.length;
                  const base = Math.floor(100 / n), rem = 100 - base * n;
                  nomSelected.forEach((ca, i) => { next[ca.id] = base + (i < rem ? 1 : 0); });
                  return next;
                })}>
                均等に分配
              </button>
              <button onClick={saveNoms} style={btnDark}>分配を保存</button>
              <span style={{ fontSize: 11, color: "var(--sub)" }}>
                ※指名料ボタンを使った場合は自動保存済み（ここは手調整用）
              </span>
            </div>
            <p style={{ fontSize: 10.5, color: "var(--sub)", margin: "8px 0 0", lineHeight: 1.7 }}>
              ※件数換算は表示上の目安です（バック金額は比率で分配・指名本数の集計は在席キャストに計上）。
            </p>
          </div>
        )}

        {/* 料金UIレーン C4（mig0084）: 指名料・同伴料の課金行。★按分カードとは別カード＝
            上の「指名（重み比で分配）」はバック按分の重み・こちらは伝票への課金行の追加。 */}
        {(() => {
          const feeDisabled = feeBusy || check.status !== "open" || payments.length > 0;
          return (
            <div className="nox-cardtop" style={card}>
              {/* E8-1b F2: 指名料は上の「指名」カードへ1本化＝ここは同伴料の課金のみ残す */}
              <h3 style={t.cardTitle}>同伴料（課金）</h3>
              <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px", lineHeight: 1.7 }}>
                ※伝票へ同伴料の課金行を追加します。金額は料金設定（時間帯・席種）から自動で決まります。
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ fontSize: 12 }}>同伴人数{" "}
                  <input type="number" min={1} max={30} value={dohanN}
                    onChange={(e) => setDohanN(Math.max(1, Number(e.target.value)))}
                    style={{ ...input, width: 60 }} />
                </label>
                <button style={btnLight} disabled={feeDisabled} onClick={() => void addDohanFee()}>
                  同伴料を追加（単価×人数）
                </button>
              </div>
              {/* R-1a: 描画点＝同伴料カード。旧 `feeMsg.includes("同伴")` を撤去＝to の一致だけで描画する */}
              {feeMsg?.to === FEE_DOHAN && (
                <p style={{ fontSize: 12, fontWeight: 700, margin: "8px 0 0",
                  color: feeMsg.kind === "ok" ? "var(--ok)" : "var(--bad)" }}>{feeMsg.text}</p>
              )}
              {payments.length > 0 && check.status === "open" && (
                <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>
                  入金済みのため追加できません（入金を取り消すと追加できます）。
                </p>
              )}
            </div>
          );
        })()}

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
              {/* E8-1b F3: プルダウン2本 → ボタン2つ＋席タイルの視覚選択モーダル */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button style={btnDark} disabled={emptySeats.length === 0} onClick={() => setSeatPick("add")}>
                  相席を追加（同一会計）
                </button>
                <button style={btnLight} disabled={emptySeats.length === 0} onClick={() => setSeatPick("move")}>
                  席を移動
                </button>
                {emptySeats.length === 0 && <span style={{ fontSize: 11.5, color: "var(--sub)" }}>空席がありません</span>}
              </div>
              {seatMsg && <p style={{ fontSize: 12, fontWeight: 700, color: seatMsg.includes("できません") || seatMsg.includes("使用中") || seatMsg.includes("無効") || seatMsg.includes("同じ席") ? "var(--bad)" : "var(--sub)", margin: "8px 0 0" }}>{seatMsg}</p>}
            </div>
          );
        })()}
        </>)}

        {/* ── 会計タブ（段R2）＝時間料金・カスタム明細・割引/承認・会計を集約 ── */}
        {/* B4: 時間制（自動）カード＝stores.time_mode='auto' かつ open 伝票のときのみ。
            ★レジ時間UX R3（裁定29）: 旧裁定(f)ボタン起点を更新＝会計タブを開いた時点で自動反映
            （手動ボタン廃止）。内訳は checks スナップ5列＋返値 jsonb。 */}
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
              <span style={{ display: "block", marginTop: 2 }}>
                {payments.length > 0
                  ? "入金済みのため時間料金は凍結されています（訂正は取消から）。"
                  : "会計タブを開いた時点の経過分で自動反映されます。"}
              </span>
            </p>
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

        {/* R-A3（0089）: manual 店の時間料金カード＝延長を1押し=1行で追加（check_extension_add）。
            auto 店では非表示（RPC 側 'auto mode' 拒否と二重防御）。取消は注文タブの行削除。 */}
        {dtab === "pay" && timeMode === "manual" && check.status === "open" && (
          <div className="nox-cardtop" style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ ...t.cardTitle, margin: 0 }}>時間料金（手動）</h3>
              <span style={{ fontSize: 12, color: "var(--sub)" }}>
                経過 <span style={t.num}>{Math.max(0, Math.floor((nowMs - new Date(check.started_at).getTime()) / 60000))}</span> 分
                （着席 {new Date(check.started_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}）
              </span>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "8px 0", lineHeight: 1.7 }}>
              セット料金は開卓時に明細へ入っています。延長はお客さま確認のうえボタンで追加してください
              （1回押すごとに1行・取り消しは注文タブの行削除）。
            </p>
            {/* R2-a（mig0098 R2-1）: ext_menu_snap が2件以上ならメニューボタン群（開栓時凍結の label・
                p_rule_id 結線）・1件以下は現行の単一ボタン（p_rule_id なし＝既定スナップ）。
                units（person 制の人数倍）はサーバが掛ける＝表示も同倍で合わせる。 */}
            {(check.ext_menu_snap?.length ?? 0) >= 2 ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {check.ext_menu_snap!.map((m) => {
                  const units = check.time_per === "person" ? (check.people ?? 1) : 1;
                  return (
                    <button key={m.rule_id} onClick={() => void addExtension(m.rule_id)} style={btnDark}
                      disabled={payments.length > 0}
                      title={payments.length > 0 ? "入金後は追加できません" : ""}>
                      {m.label}{units > 1 ? `（×${units}名 ${yen(m.amount * units)}）` : ""}
                    </button>
                  );
                })}
              </div>
            ) : (
              <button onClick={() => void addExtension()} style={btnDark} disabled={payments.length > 0}
                title={payments.length > 0 ? "入金後は追加できません" : ""}>
                延長を追加（{yen(check.ext_fee * (check.time_per === "person" ? (check.people ?? 1) : 1))} / {check.ext_min}分）
              </button>
            )}
            {/* R-1a 段2: 描画点＝時間料金（手動）カード。延長の**完了文言**（金額つき）。
                エラーは従来どおり下の timeMsg＝役割を混ぜない。 */}
            {msg?.to === MSG_TIME && (
              <p style={{ fontSize: 12, fontWeight: 700, margin: "8px 0 0",
                color: msg.kind === "ok" ? "var(--ok)" : "var(--bad)" }}>{msg.text}</p>
            )}
            {timeMsg && <p style={{ fontSize: 12, fontWeight: 700, color: "var(--bad)", margin: "8px 0 0" }}>{timeMsg}</p>}
          </div>
        )}

        {/* 明細追加（段R2: 注文タブ。カスタム明細フォームだけは会計タブへ移設） */}
        {dtab === "order" && (
        <div className="nox-cardtop" style={card}>
          {/* ★DP1 P2 b#18: モック `.sectionhead`＝見出し＋説明文の2段組（左）＋操作（右）。
              旧は h3 単独で、何をする面なのかの説明が無かった。文言は実装の挙動どおり（発明しない）。 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ ...t.cardTitle, margin: 0 }}>注文・セット料金</h3>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--sub)", lineHeight: 1.6 }}>
                商品をタップすると明細に追加されます。セット料金は開卓時に自動で入ります。
              </p>
            </div>
            {/* E8-1 ⑦: 英字テキスト入力 → 会計分けセグメント（A のみ時は「＋会計を分ける」だけを出す） */}
            <span style={{ marginLeft: "auto" }}>{groupSeg(prodGroup || "A", setProdGroup)}</span>
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
                      <button key={p.id} type="button" className="nox-tile"
                        onClick={() => (p.back_exempt_from_split === true
                          // E8-1 #8: キャストドリンク対象＝タップ時にキャスト指定モーダル（指定しない追加も可）
                          ? setDrinkPick({ mode: "product", product: p })
                          : tb.tap(p.id))}>
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
            {/* R-A2（0089）: 種別から「セット」を除去＝開卓時の自動行と手打ちの二重計上を封じる */}
            <SegSelect value={cKind} onChange={(v) => setCKind(v)}
            options={[["charge", "料金"], ["time", "延長"], ["custom", "その他"]] as const} />
            <input placeholder="名称（例 貸切料金）" value={cName} onChange={(e) => setCName(e.target.value)} style={{ ...input, width: 170 }} />
            <input type="number" min={0} value={cPrice} onChange={(e) => setCPrice(Number(e.target.value))} style={{ ...input, width: 90 }} />
            {/* E8-1 ⑦: 英字テキスト入力 → 会計分けセグメント */}
            {groupSeg(cGroup || "A", setCGroup)}
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
            <SegSelect value={apType} onChange={(v) => setApType(v as "discount" | "free")}
            options={[["discount", "割引"], ["free", "無料"]] as const} />
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
          {/* ★DP1 P2 b#18/#22: 明細も sectionhead 2段組へ。右端に「商品をクリア」（モック cart の clearItems）。
              ★対象は商品行だけ＝セット料金・延長・承認割引は消えない（下の確認モーダルにも明記）。 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ ...t.cardTitle, margin: 0 }}>明細</h3>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--sub)", lineHeight: 1.6 }}>
                この伝票に入っている行。入金後は訂正できません（取消からやり直します）。
              </p>
            </div>
            {(() => {
              const n = lines.filter((l) => CLEARABLE_KINDS.has(l.kind)).length;
              return n > 0 && payments.length === 0 && check?.status === "open" ? (
                <button type="button" style={{ ...btnLight, marginLeft: "auto" }}
                  onClick={() => setClearModal(true)}>商品をクリア（{n}行）</button>
              ) : null;
            })()}
          </div>
          {/* R-2a-2（モック renderCharges＝`#autoCharges`）: セット料金（自動）の時間帯分解。
              ★auto 店のみ（timeMode='auto'）。manual 店は check_extension_add が block_no を書かず
                （time_auto=false）行から回次を復元できないため従来表示のまま据え置く。
              1ラウンド1行＝mig0097 の per-block 行（set=block 0・extension=block 1..n）をそのまま描く。
              金額・人数は行の凍結値（unit_price_snapshot / qty / line_total）＝クライアント再計算しない。
              時間帯だけが表示計算（started_at + set_min + (b-1)*ext_min）。legacy 合算行（block_no null）は
              時間帯を出さず金額のみ（嘘の帯を描かない）。 */}
          {timeMode === "auto" && check && (() => {
            const t0 = new Date(check.started_at).getTime();
            const fmtHM = (ms: number) => new Date(ms).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
            const setLines = lines.filter((l) => l.time_auto && l.fee_kind === "set");
            const extLines = lines.filter((l) => l.time_auto && l.fee_kind === "extension")
              .slice().sort((a, b) => (a.block_no ?? 1e9) - (b.block_no ?? 1e9));
            if (setLines.length === 0 && extLines.length === 0) return null;
            const rows: { key: string; label: string; band: string | null; unit: number; qty: number; total: number; dur: number }[] = [];
            for (const l of setLines) {
              rows.push({ key: l.id, label: "基本セット", band: `${fmtHM(t0)}〜${fmtHM(t0 + check.set_min * 60000)}`,
                unit: l.unit_price_snapshot, qty: l.qty, total: l.line_total, dur: check.set_min });
            }
            for (const l of extLines) {
              const band = l.block_no != null
                ? (() => { const from = t0 + (check.set_min + (l.block_no! - 1) * check.ext_min) * 60000; return `${fmtHM(from)}〜${fmtHM(from + check.ext_min * 60000)}`; })()
                : null;
              rows.push({ key: l.id, label: "延長セット", band, unit: l.unit_price_snapshot, qty: l.qty, total: l.line_total, dur: check.ext_min });
            }
            return (
              <div className="nox-inset" style={{ padding: 0, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
                  <b style={{ fontSize: 12 }}>セット料金（自動）</b>
                  <span style={{ ...t.tag, fontSize: 10, color: "var(--sub)", borderColor: "var(--line2)" }}>削除不可</span>
                </div>
                {rows.map((r) => (
                  <div key={r.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 9, padding: "7px 12px", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}>
                    <span style={{ minWidth: 0 }}>
                      <b>{r.label}{check.time_per === "person" ? ` × ${r.qty}名` : ""}</b>
                      <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>
                        {r.band ? `${r.band}・` : ""}{yen(r.unit)} / {r.dur}分
                      </span>
                    </span>
                    <strong className="num" style={{ whiteSpace: "nowrap" }}>{yen(r.total)}</strong>
                  </div>
                ))}
              </div>
            );
          })()}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {lines.map((l) => {
                const isDisc = l.kind === "discount"; // ★F3c: 承認割引（正の値・表示は −・削除不可＝承認経由のみ）
                // キャストドリンク（mig0070）: 凍結値で判定＝DB（check_close / proxy）と同じ真実を見る。
                const isExempt = l.back_snapshot?.back_exempt === true;
                const claim = claims.find((c) => c.check_line_id === l.id);
                return (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    {/* E8-1 ⑦ → E8-1b F5: バッジタップで付け替え（mig0091・time_auto/discount/入金後は非活性） */}
                    <td style={{ padding: 6 }}>
                      {splitOn && (
                        l.time_auto || isDisc || payments.length > 0 || check?.status !== "open" ? (
                          <span style={{ ...t.tag, fontSize: 10, color: "var(--sub)", borderColor: "var(--line2)" }}
                            title={l.time_auto ? "時間料金は会計Aから動かせません" : ""}>
                            会計{l.pay_group}
                          </span>
                        ) : (
                          <button type="button"
                            style={{ ...t.tag, fontSize: 10, color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)",
                              background: "transparent", cursor: "pointer", fontFamily: "inherit" }}
                            title="タップで会計を付け替え"
                            onClick={() => setGroupPick(l.id)}>
                            会計{l.pay_group} ▾
                          </button>
                        )
                      )}
                    </td>
                    <td style={{ padding: 6, color: isDisc ? "var(--bad)" : "var(--ink)" }}>
                      {l.name_snapshot}
                      {/* R-2a-1: 指名料行は**対象キャスト名を併記**＝同じキャストに2行あるのか、
                          別々のキャストに1行ずつなのかを明細だけで判別できるようにする（表示のみ）。
                          ★同伴料行（fee_kind='dohan'）は cast_id=null で名前を出せない＝R-2b で紐づける。 */}
                      {isShimeiLine(l) && l.cast_id && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--champ)", marginLeft: 6 }}>
                          {castName(l.cast_id)}
                        </span>
                      )}
                    </td>
                    {/* E8-1b F1: person 制の時間行は「×N名」（qty=units=人数の意味を明示） */}
                    <td style={{ ...t.num, padding: 6, textAlign: "right", color: "var(--sub)" }}>
                      {isDisc ? "" : `${yen(l.unit_price_snapshot)} × ${l.qty}${l.kind === "time" && check?.time_per === "person" ? "名" : ""}`}
                    </td>
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
                        /* E8-1 ⑤: 行内 select → CastPicker モーダル（#8 のタップ時モーダルと共用）。
                           選択自体は制限しない＝指名外のキャストが運んだケースも実務では起きるため。 */
                        <button onClick={() => { setClaimMsg(null); setDrinkPick({ mode: "line", lineId: l.id }); }}
                          disabled={claimBusy}
                          style={{ ...btnLight, padding: "2px 8px", fontSize: 11.5, whiteSpace: "nowrap" }}>
                          キャストに付ける
                        </button>
                      ) : null)}
                    </td>
                    <td style={{ padding: 6 }}>
                      {isDisc ? (
                        <span style={{ fontSize: 11, color: "var(--sub)" }}>承認割引</span>
                      ) : l.time_auto ? (
                        /* R-2a-2（モック autohead の locked）: 自動管理の時間行は削除ボタンを出さない。
                           判定は行の凍結 time_auto（auto 店の set/延長ブロック＋manual 店の開卓 set 行）。
                           他の行の削除条件は不変。 */
                        <span style={{ ...t.tag, fontSize: 10, color: "var(--sub)", borderColor: "var(--line2)" }}
                          title="自動計算の時間料金行です（時間の訂正は会計タブ・伝票の訂正は取消から）">
                          削除不可
                        </span>
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
          {/* E8-1 #7: モック totals の6行構成へ（セット・延長／商品・指名ほか／小計／割引／サ料・端数調整／
              合計＋内消費税）。サ料は due−net の逆算＝丸め・端数調整込みで会計タブの請求と必ず一致。
              内税は receipt.ts の taxOf（印刷レシートと同式）＝新しい計算は作らない。 */}
          {(() => {
            const timeSum = lines.filter((l) => l.kind === "time").reduce((a, l) => a + l.line_total, 0);
            const prodSum = sumBx - timeSum;
            const svcAndRound = sumDue - Math.max(0, sumBx - sumDisc);
            return (
              <>
                <div className="nox-sumrow"><span>セット・延長</span><span className="num">{yen(timeSum)}</span></div>
                <div className="nox-sumrow"><span>商品・指名ほか</span><span className="num">{yen(prodSum)}</span></div>
                <div className="nox-sumrow"><span>小計</span><span className="num">{yen(sumBx)}</span></div>
                <div className="nox-sumrow">
                  <span>割引</span>
                  <span className="num" style={sumDisc > 0 ? { color: "var(--bad)" } : undefined}>
                    {sumDisc > 0 ? `−${yen(sumDisc)}` : "—"}
                  </span>
                </div>
                <div className="nox-sumrow">
                  <span>サービス料（{check.service_rate}%・端数調整込み）</span>
                  <span className="num">{yen(svcAndRound)}</span>
                </div>
                <div className="nox-sumrow total"><span>合計（請求・サ料込）</span><span className="num">{yen(sumDue)}</span></div>
                <div className="nox-sumrow" style={{ borderTop: 0 }}>
                  <span style={{ color: "var(--sub)", fontSize: 11.5 }}>うち消費税（内税10%）</span>
                  <span className="num" style={{ color: "var(--sub)", fontSize: 11.5 }}>{yen(taxOf(sumDue))}</span>
                </div>
              </>
            );
          })()}
        </div>
        )}

        {/* 会計（段R2: 会計タブ） */}
        {dtab === "pay" && (
        <div className="nox-cardtop" style={card}>
          {/* ★DP1 P2 b#38（裁定 DP1-⑧）: モックの会計3段（会計へ進む → 支払方法 → 会計を完了）へ
              **表示だけ**を寄せる。★check_pay / check_close の呼び出し・引数・金額計算・呼び出し順序は
              1文字も変えていない＝下の段見出しは「今どの段か」を **既存 state から導出して描くだけ**
              （payments.length と allCovered のみを読む・新しい state も分岐も作らない）。 */}
          {(() => {
            const step = !allCovered && payments.length === 0 ? 1 : !allCovered ? 2 : 3;
            const STEPS = [[1, "請求を確認"], [2, "入金"], [3, "会計を完了"]] as const;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
                {STEPS.map(([n, label]) => (
                  <div key={n} style={{
                    display: "flex", alignItems: "center", gap: 7, padding: "7px 10px",
                    borderRadius: 7, fontSize: 12, fontWeight: 700,
                    border: `1px solid ${n === step ? "var(--gold)" : "var(--line)"}`,
                    background: n === step ? "var(--goldbg)" : "transparent",
                    color: n === step ? "var(--gold2)" : n < step ? "var(--v2-text)" : "var(--sub)",
                  }}>
                    <span className="num" style={{ fontWeight: 900 }}>{n < step ? "✓" : n}</span>{label}
                  </div>
                ))}
              </div>
            );
          })()}
          <h3 style={{ ...t.cardTitle, margin: "0 0 4px" }}>① 請求を確認（伝票グループ別）</h3>
          <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "var(--sub)", lineHeight: 1.6 }}>
            会計を分けている場合は、伝票ごとに残額を確認してから入金します。
          </p>
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
          {/* E8-1 ④/⑦: 1行フォーム → 会計分けセグメント（現行位置）＋入金モーダル（BANZEN 型）。
              送る引数（check_pay の7引数）は不変＝入力 UI の置換のみ。 */}
          <h3 style={{ ...t.cardTitle, margin: "14px 0 4px" }}>② 入金</h3>
          <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "var(--sub)", lineHeight: 1.6 }}>
            支払方法と金額を選んで入金します。現金・カードを組み合わせる（併用）ときは、金額を分けて複数回入金します。
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            {groupSeg(payGroup || "A", setPayGroup)}
            {(() => {
              const gi = groupInfo.find((x) => x.g === (payGroup || "A"));
              const remaining = gi?.remaining ?? 0;
              return (
                <button
                  style={btnDark}
                  disabled={check.status !== "open" || remaining <= 0}
                  title={remaining <= 0 ? "この会計の残額はありません" : ""}
                  onClick={() => {
                    setPayAmount(remaining);
                    setPayTendered("");
                    setPayDetail("");
                    setPayModal(true);
                  }}
                >
                  入金する{splitOn ? `（会計${payGroup || "A"}）` : ""}
                </button>
              );
            })()}
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
          <h3 style={{ ...t.cardTitle, margin: "14px 0 4px" }}>③ 会計を完了</h3>
          <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "var(--sub)", lineHeight: 1.6 }}>
            {allCovered
              ? "すべての伝票の残額が 0 になりました。完了すると伝票が締まります。"
              : "残額があるうちは完了できません（上の入金を済ませてください）。"}
          </p>
          <div className="nox-payrow">
          <button
            onClick={closeCheck}
            disabled={!allCovered}
            style={{ ...btnDark, padding: "13px 28px", opacity: allCovered ? 1 : 0.4 }}
          >
            会計を完了
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
                    color: printMsg[g].startsWith("失敗") || printMsg[g].includes("無効") ? "var(--bad)" : "var(--gold)",
                    background: "var(--card2)", border: "1px solid var(--line2)", whiteSpace: "nowrap",
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
        {/* ★DP1 P2 b#9: フロアの卓グリッドはモック `.tables` の列数規約（8/4/2）へ＝`.floor` 修飾子。
            席選択モーダル（:1259）は素の .nox-seatgrid のまま＝狭い器に 8列を出さない。 */}
        <div className="nox-seatgrid floor">
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
                    {/* E8-1 #10: 人数（モック occupants・people は loadOpenMap で取得済み） */}
                    <div className="stay num">
                      {openTime[s.id]?.people != null ? `${openTime[s.id].people}名 · ` : ""}
                      {openStarted[s.id] ? `滞在 ${elapsedMin(openStarted[s.id], nowMs)}分` : "使用中"}
                    </div>
                    {/* R-A4（0089）: 常時カウントダウン（両モード共通・凍結スナップのクライアント計算＝表示専用）。
                        セット内=「あとN分で延長」／超過=「延長N回目・次まであとN分」（--bad）。 */}
                    {openStarted[s.id] && openTime[s.id] && (() => {
                      const ts = timeStatusOf(new Date(openStarted[s.id]).getTime(), nowMs, openTime[s.id].setMin, openTime[s.id].extMin);
                      const toNext = Math.max(0, Math.ceil((ts.nextAtMs - nowMs) / 60_000));
                      return ts.inSet ? (
                        <div className="stay num">あと {ts.remainMin} 分で延長</div>
                      ) : (
                        <div className="stay num" style={{ color: "var(--bad)", fontWeight: 700 }}>延長 {ts.blocks} 回目・次まであと {toNext} 分</div>
                      );
                    })()}
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
        {/* R-1a: 描画点＝フロア。会計完了・伝票取消・開卓の失敗がここに出る。
            段2-1: 他4点と同じ基準へ＝色は kind から決める（muted 据置を解除）。 */}
        {msg?.to === MSG_FLOOR && (
          <p style={{ fontSize: 12, fontWeight: 700, margin: "10px 0 0",
            color: msg.kind === "ok" ? "var(--ok)" : "var(--bad)" }}>{msg.text}</p>
        )}
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
