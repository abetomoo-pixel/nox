"use client";

// 予約タブ（F3a-3 §5・canonical の register 予約タブをデコード抽出した文言/構成に確定要件差分を反映）。
//   差分: (a) 客指定=既存客 select＋フリー入力トグル併存（customers 連動） (b) status 4値（no_show 追加）
//   (c) 卓は押さえない=卓希望は備考・卓は来店時に確定 (d)「来店済」= reservation_to_check（伝票を開く）。
// 一覧は RLS（owner=org 全店/manager=自店/staff=can_crm/cast=自分指名のみ）・書込は RPC が二重に守る。
// F3b-B 席予約（mig0029）: (e) 登録=「席を確保する」トグル（ON=卓+滞在時間・OFF=従来の卓なし予約）
//   (f) 卓選択時は当日既存枠を表示（被り回避を促す・登録時は RPC 事前検証+EXCLUDE の二重防御）
//   (g) 一覧=席予約は卓名+時間枠を表示（卓なし予約と混在・reserved_at 昇順は不変）
//   (h) 来店=予約卓を既定選択（使用中卓は候補除外=予約卓が埋まっていれば自然に別卓選択・実来店が勝つ）
//   (i) 編集（新設・booked のみ）=卓/時間変更・トグル OFF=卓クリア（全フィールド明示送信=規約7）。
// B-5 スライスA（mig0032）: (j) 定休日=UI 一次ブロック（保存ボタン無効+明示・二層目は RPC 'closed day'）
//   (k) 営業時間外=黄色警告のみで送信可（RPC は通す=非対称・段25-9）・未設定の曜日は判定なし（後方互換）。
//   判定は lib/nox/business-hours.ts（DB helper と同じ cutoff 変換・深夜帯=前営業日）。
//   編集は予約の店が register の店と一致する場合のみ UI 判定（不一致=owner の他店予約は RPC 二層目が守る）。
import { useCallback, useEffect, useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import CastPicker from "@/components/nox/cast-picker";
import { businessHoursStatus, fmtHoursLabel, type BusinessHourRow } from "@/lib/nox/business-hours";

type Seat = { id: string; name: string; kind: string | null; store_id: string };
type Cast = { id: string; name: string };
// E8-1 ⑥: tel＝予約行の電話表示（customers.tel の select 追加のみ・フリー客は列なし＝非表示）
type Customer = { id: string; name: string; tel: string | null };
type Reservation = {
  id: string; store_id: string; customer_id: string | null; cast_id: string | null;
  guest_name: string | null; reserved_at: string; party_size: number | null;
  nom_type: string | null; status: string; memo: string | null; check_id: string | null;
  seat_id: string | null; stay: string | null;
};

const NOM_LABEL: Record<string, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", free: "フリー" };
const STATUS_LABEL: Record<string, string> = { booked: "予約", visited: "来店済", no_show: "不来店", cancelled: "取消" };
const STATUS_COLOR: Record<string, string> = { booked: "var(--gold)", visited: "var(--ok)", no_show: "var(--sub)", cancelled: "var(--sub)" };
const STAY_OPTIONS: Array<[number, string]> = [[60, "1時間"], [90, "1時間30分"], [120, "2時間"], [180, "3時間"]];

// tstzrange 文字列（PostgREST 返却・例 ["2026-07-14 09:00:00+00","2026-07-14 11:00:00+00")）のパース。
// ★オフセットが分なし（+00）だと V8 の Date が Invalid になるため +00:00 へ正規化（実機で発見）。
function parseStay(stay: string | null): { from: Date; to: Date } | null {
  if (!stay) return null;
  const m = stay.match(/^[\[(]"?([^",]+)"?\s*,\s*"?([^")\]]+)"?[)\]]$/);
  if (!m) return null;
  const norm = (s: string) => s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const from = new Date(norm(m[1]));
  const to = new Date(norm(m[2]));
  return Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) ? null : { from, to };
}
const fmtHm = (d: Date) =>
  d.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
const fmtStayRange = (stay: string | null): string => {
  const p = parseStay(stay);
  return p ? `${fmtHm(p.from)}-${fmtHm(p.to)}` : "";
};
const stayMinutesOf = (stay: string | null): number | null => {
  const p = parseStay(stay);
  return p ? Math.round((p.to.getTime() - p.from.getTime()) / 60_000) : null;
};
// RPC エラーの日本語化（席予約系）
function rpcErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("seat time conflict")) return "その卓・時間帯には既に予約があります（枠重複）";
  if (msg.includes("seat occupied")) return "その卓は使用中です（別の卓を選んでください）";
  if (msg.includes("bad stay")) return "滞在時間の指定が不正です";
  if (msg.includes("bad seat")) return "その卓は使用できません";
  if (msg.includes("invalid store")) return "卓の店舗が一致しません";
  if (msg.includes("not editable")) return "この予約は変更できません（確定済み）";
  if (msg.includes("closed day")) return "選択された日は定休日です";
  return msg;
}

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = t.cardTitle;
const pill = (status: string): React.CSSProperties => ({
  fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
  color: STATUS_COLOR[status] ?? "var(--sub)", background: "var(--card2)", border: "1px solid var(--line2)",
  whiteSpace: "nowrap",
});

// E8-1 ⑥: 指名種別＝4ボタンセグメント（select 置換・''=未指定は先頭ボタン）。値と送る引数は不変。
function NomSeg({ value, onChange, emptyLabel }: { value: string; onChange: (v: string) => void; emptyLabel: string }) {
  const opts: Array<[string, string]> = [["", emptyLabel], ["hon", "本指名"], ["jonai", "場内"], ["dohan", "同伴"], ["free", "フリー"]];
  return (
    <span className="nox-seg" style={{ display: "inline-flex", flexWrap: "wrap" }}>
      {opts.map(([v, l]) => (
        <button key={v || "none"} type="button" className={value === v ? "on" : ""}
          style={{ fontWeight: 700, fontSize: 12, padding: "6px 10px" }}
          onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </span>
  );
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ReservationPanel({
  storeId, seats, casts, photoUrls, todayIds, prefillSeatId, onPrefillConsumed,
}: {
  storeId: string; seats: Seat[]; casts: Cast[];
  /** E8-1 ⑥/⑤: CastPicker 用（register-board から受け渡し・無くても頭文字で動く） */
  photoUrls?: Map<string, string>;
  todayIds?: Set<string>;
  /** E8-1 ⑥: 卓起点予約（開卓モーダル→「予約を入れる」）のプリフィル */
  prefillSeatId?: string | null;
  onPrefillConsumed?: () => void;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Reservation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [openSeats, setOpenSeats] = useState<Record<string, string>>({}); // seat_id → open check_id
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // E8-1 ⑥: 日付スコープ（7日バー・null=全件）＋検索＋状態絞り込み（旧「取消も表示」チェックを置換）
  const [selDate, setSelDate] = useState<string | null>(todayLocal());
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // ''=取消以外すべて
  // B-5: 営業時間マスタ（register の店）＋cutoff（store settings・既定 06:00）
  const [bhRows, setBhRows] = useState<BusinessHourRow[]>([]);
  const [cutoffHm, setCutoffHm] = useState("06:00");

  // 新規予約フォーム
  const [fDate, setFDate] = useState(todayLocal());
  const [fTime, setFTime] = useState("20:00");
  const [useCustomer, setUseCustomer] = useState(false); // 既存客 select / フリー入力 のトグル
  const [fCustomer, setFCustomer] = useState("");
  const [fGuest, setFGuest] = useState("");
  const [fPeople, setFPeople] = useState(2);
  const [fCast, setFCast] = useState("");
  const [fNom, setFNom] = useState("");   // ''=未指定（null）
  const [fMemo, setFMemo] = useState("");
  // F3b-B 席予約（登録フォーム）: トグル OFF=従来の卓なし予約（seat/stay は null 送信）
  const [fSeatOn, setFSeatOn] = useState(false);
  const [fSeat, setFSeat] = useState("");
  const [fStay, setFStay] = useState(120); // 既定 2時間

  // 来店処理（行ごとの展開）
  const [visitId, setVisitId] = useState<string | null>(null);
  const [vSeat, setVSeat] = useState("");
  const [vNom, setVNom] = useState("");   // ''=予約の nom_type に従う（null 送信）

  // 予約編集（F3b-B 新設・booked のみ・行ごとの展開）
  const [editId, setEditId] = useState<string | null>(null);
  const [eDate, setEDate] = useState("");
  const [eTime, setETime] = useState("");
  const [eUseCustomer, setEUseCustomer] = useState(false);
  const [eCustomer, setECustomer] = useState("");
  const [eGuest, setEGuest] = useState("");
  const [ePeople, setEPeople] = useState(0);
  const [eCast, setECast] = useState("");
  const [eNom, setENom] = useState("");
  const [eMemo, setEMemo] = useState("");
  const [eSeatOn, setESeatOn] = useState(false);
  const [eSeat, setESeat] = useState("");
  const [eStay, setEStay] = useState(120);

  const load = useCallback(async () => {
    const { data: rs } = await supabase
      .from("reservations")
      .select("id, store_id, customer_id, cast_id, guest_name, reserved_at, party_size, nom_type, status, memo, check_id, seat_id, stay")
      .order("reserved_at", { ascending: true });
    setRows((rs ?? []) as Reservation[]);
    const { data: cs } = await supabase
      .from("customers").select("id, name, tel").eq("is_active", true).order("name");
    setCustomers((cs ?? []) as Customer[]);
    const { data: oc } = await supabase.from("checks").select("id, seat_id").eq("status", "open");
    const m: Record<string, string> = {};
    for (const r of oc ?? []) m[r.seat_id as string] = r.id as string;
    setOpenSeats(m);
    // B-5: 営業時間（行なし=未設定・判定なし）と cutoff（biz_cutoff_hm 既定 06:00）
    const { data: bh } = await supabase.from("store_business_hours")
      .select("dow, is_closed, open_hm, close_hm").eq("store_id", storeId);
    setBhRows((bh ?? []) as BusinessHourRow[]);
    const { data: st } = await supabase.from("stores").select("settings_json").eq("id", storeId).maybeSingle();
    const cut = ((st?.settings_json as Record<string, unknown> | null)?.biz_cutoff_hm as string | undefined) ?? "";
    setCutoffHm(/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(cut) ? cut : "06:00");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void load(); }, [load]);

  const castName = (id: string | null) => casts.find((c) => c.id === id)?.name ?? null;
  const custName = (id: string | null) => customers.find((c) => c.id === id)?.name ?? null;
  const custTel = (id: string | null) => customers.find((c) => c.id === id)?.tel ?? null;
  const dispName = (r: Reservation) => custName(r.customer_id) ?? r.guest_name ?? "（名前未設定）";
  const seatName = (id: string | null) => seats.find((s) => s.id === id)?.name ?? "卓";
  const overdue = (r: Reservation) => r.status === "booked" && new Date(r.reserved_at).getTime() < Date.now();
  const storeSeats = seats.filter((s) => s.store_id === storeId);

  // E8-1 ⑥: 卓起点予約のプリフィル（開卓モーダル→「予約を入れる」）
  useEffect(() => {
    if (!prefillSeatId) return;
    setFSeatOn(true);
    setFSeat(prefillSeatId);
    setMsg(`卓起点の予約: ${seatName(prefillSeatId)} をプリフィルしました（下の新規予約から登録）`);
    onPrefillConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSeatId]);

  // E8-1 ⑥: 日付バー（今日から7日）＋日付スコープ・検索・状態絞り込み
  const jstOf = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const dowJa = ["日", "月", "火", "水", "木", "金", "土"];
  const visible = rows.filter((r) => {
    if (selDate && jstOf(r.reserved_at) !== selDate) return false;
    if (statusFilter === "" ? r.status === "cancelled" : r.status !== statusFilter) return false;
    if (q.trim() !== "") {
      const needle = q.trim();
      const tel = custTel(r.customer_id) ?? "";
      if (!dispName(r).includes(needle) && !tel.includes(needle)) return false;
    }
    return true;
  });
  // KPI/当日状況のスコープ＝選択日（全件表示中は今日）
  const kpiDate = selDate ?? todayLocal();
  const kpiRows = rows.filter((r) => jstOf(r.reserved_at) === kpiDate);
  const kpiBooked = kpiRows.filter((r) => r.status === "booked");
  const kpiPeople = kpiBooked.reduce((a, r) => a + (r.party_size ?? 0), 0);
  const kpiVip = kpiBooked.filter((r) => seats.find((s) => s.id === r.seat_id)?.kind === "VIP").length;
  const kpiOverdue = kpiBooked.filter((r) => overdue(r)).length;
  const kpiVisited = kpiRows.filter((r) => r.status === "visited").length;
  // 当日状況: 卓稼働見込み＝現在使用中 ∪ 席予約（booked）の卓。人数キャパの分母は seats.length 代用（E8 裁定）。
  const expectSeats = new Set<string>([
    ...Object.keys(openSeats),
    ...kpiBooked.filter((r) => r.seat_id).map((r) => r.seat_id as string),
  ]);
  const upcoming = kpiBooked
    .filter((r) => new Date(r.reserved_at).getTime() >= Date.now())
    .sort((a, b) => a.reserved_at.localeCompare(b.reserved_at))
    .slice(0, 5);

  // 論点2(b): 選んだ卓の指定日の既存 booked 枠（被り回避を促す表示・自枠は excludeId で除外）。
  // 可視範囲は reservations RLS（owner=org 全店/manager・staff=自店）＝表示も可視分のみ。
  const jstDateOf = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const slotsFor = (seatId: string, date: string, excludeId?: string) =>
    rows.filter((r) =>
      r.seat_id === seatId && r.status === "booked" && r.id !== excludeId && jstDateOf(r.reserved_at) === date);

  async function createReservation() {
    setMsg(null);
    const reservedAt = new Date(`${fDate}T${fTime || "20:00"}:00`);
    if (Number.isNaN(reservedAt.getTime())) { setMsg("日付/時刻が不正です"); return; }
    // B-5: 定休日は送信もしない（ボタン無効の保険・二層目は RPC 'closed day'）
    if (businessHoursStatus(reservedAt, bhRows, cutoffHm).status === "closed") { setMsg("選択された日は定休日です"); return; }
    if (fSeatOn && !fSeat) { setMsg("確保する卓を選択してください"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("reservation_create", {
      p_store_id: storeId,
      p_reserved_at: reservedAt.toISOString(),
      p_customer_id: useCustomer && fCustomer ? fCustomer : null,
      p_cast_id: fCast || null,
      p_guest_name: !useCustomer && fGuest.trim() ? fGuest.trim() : null,
      p_party_size: fPeople > 0 ? fPeople : null,
      p_nom_type: fNom || null,
      p_memo: fMemo.trim() || null,
      p_seat_id: fSeatOn && fSeat ? fSeat : null,
      p_stay_minutes: fSeatOn && fSeat ? fStay : null,
    });
    setBusy(false);
    setMsg(error ? `予約の追加に失敗: ${rpcErrJa(error.message)}` : "予約を追加しました");
    if (!error) { setFGuest(""); setFCustomer(""); setFMemo(""); setFSeatOn(false); setFSeat(""); setFStay(120); }
    await load();
  }

  function openEdit(r: Reservation) {
    const d = new Date(r.reserved_at);
    setEDate(d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }));
    setETime(fmtHm(d));
    setEUseCustomer(!!r.customer_id);
    setECustomer(r.customer_id ?? "");
    setEGuest(r.guest_name ?? "");
    setEPeople(r.party_size ?? 0);
    setECast(r.cast_id ?? "");
    setENom(r.nom_type ?? "");
    setEMemo(r.memo ?? "");
    setESeatOn(!!r.seat_id);
    setESeat(r.seat_id ?? "");
    setEStay(stayMinutesOf(r.stay) ?? 120);
    setMsg(null);
    setVisitId(null);
    setEditId(r.id);
  }

  // 規約7: 全フィールド明示送信（seat/stay 含む・トグル OFF=null 明示＝卓なし予約化）
  async function updateReservation(r: Reservation) {
    const reservedAt = new Date(`${eDate}T${eTime || "20:00"}:00`);
    if (Number.isNaN(reservedAt.getTime())) { setMsg("日付/時刻が不正です"); return; }
    // B-5: 定休日は送信もしない（判定は register の店と同店の予約のみ・他店は RPC 二層目が守る）
    if (r.store_id === storeId
        && businessHoursStatus(reservedAt, bhRows, cutoffHm).status === "closed") {
      setMsg("選択された日は定休日です"); return;
    }
    if (eSeatOn && !eSeat) { setMsg("確保する卓を選択してください"); return; }
    setMsg(null); setBusy(true);
    const { error } = await supabase.rpc("reservation_update", {
      p_reservation_id: r.id,
      p_reserved_at: reservedAt.toISOString(),
      p_customer_id: eUseCustomer && eCustomer ? eCustomer : null,
      p_cast_id: eCast || null,
      p_guest_name: !eUseCustomer && eGuest.trim() ? eGuest.trim() : null,
      p_party_size: ePeople > 0 ? ePeople : null,
      p_nom_type: eNom || null,
      p_memo: eMemo.trim() || null,
      p_seat_id: eSeatOn && eSeat ? eSeat : null,
      p_stay_minutes: eSeatOn && eSeat ? eStay : null,
    });
    setBusy(false);
    if (error) { setMsg(`予約の変更に失敗: ${rpcErrJa(error.message)}`); return; }
    setMsg("予約を変更しました");
    setEditId(null);
    await load();
  }

  async function toCheck(r: Reservation) {
    if (!vSeat) { setMsg("卓を選択してください"); return; }
    setMsg(null); setBusy(true);
    const { error } = await supabase.rpc("reservation_to_check", {
      p_reservation_id: r.id, p_seat_id: vSeat, p_nom_type: vNom || null,
    });
    setBusy(false);
    if (error) { setMsg(`来店処理に失敗: ${rpcErrJa(error.message)}`); return; }
    // 指名 cast が退店済み（active casts に不在）なら指名スキップで開店した旨を表示（発見3）
    const skipped = r.cast_id != null && !casts.some((c) => c.id === r.cast_id);
    setMsg(skipped
      ? "伝票を開きました（指名キャストは退店済みのため指名なしで開店しています）"
      : "予約から伝票を開きました（卓席・会計タブで操作できます）");
    setVisitId(null); setVSeat(""); setVNom("");
    await load();
  }

  async function setStatus(r: Reservation, status: "cancelled" | "no_show") {
    const label = status === "cancelled" ? "取消" : "不来店（no-show）";
    if (!confirm(`${fmtWhen(r.reserved_at)} ${dispName(r)} の予約を${label}にしますか？`)) return;
    setMsg(null); setBusy(true);
    const { error } = await supabase.rpc("reservation_set_status", { p_reservation_id: r.id, p_status: status });
    setBusy(false);
    setMsg(error ? `更新に失敗: ${error.message}` : `${label}にしました`);
    await load();
  }

  // 来店処理の卓候補: 予約と同じ店・空き卓のみ（使用中は seat occupied で拒否される＝UI でも先に絞る）
  const seatOptions = (r: Reservation) => seats.filter((s) => s.store_id === r.store_id && !openSeats[s.id]);

  // B-5: フォーム日時の営業時間判定（date+time のローカル解釈は既存 createReservation と同一）
  const hoursStatusOf = (date: string, time: string) => {
    const d = new Date(`${date}T${time || "20:00"}:00`);
    return Number.isNaN(d.getTime()) ? null : businessHoursStatus(d, bhRows, cutoffHm);
  };
  const fHours = hoursStatusOf(fDate, fTime);
  const fClosedDay = fHours?.status === "closed";
  // 定休日=赤（一次ブロック）／時間外=黄（警告のみ・送信可）／営業時間内・未設定=表示なし
  const hoursNote = (st: ReturnType<typeof hoursStatusOf>) => {
    if (!st) return null;
    if (st.status === "closed") {
      return <span style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700 }}>この日は定休日です（予約できません）</span>;
    }
    if (st.status === "outside" && st.row) {
      return <span style={{ fontSize: 11.5, color: "var(--gold2)", fontWeight: 700 }}>営業時間外です（営業 {fmtHoursLabel(st.row)}）</span>;
    }
    return null;
  };

  return (
    <div style={{ maxWidth: 720 }}>
      {/* ── E8-1 ⑥: 日付バー（7日）＋KPI 4枚＋当日の状況 ── */}
      <section className="nox-cardtop" style={card}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <button type="button" className={`nox-cat${selDate === null ? " on" : ""}`} onClick={() => setSelDate(null)}>全件</button>
          {weekDates.map((d) => {
            const dt = new Date(`${d}T00:00:00`);
            return (
              <button key={d} type="button" className={`nox-cat${selDate === d ? " on" : ""}`} onClick={() => setSelDate(d)}>
                {dt.getMonth() + 1}/{dt.getDate()}（{dowJa[dt.getDay()]}）
              </button>
            );
          })}
        </div>
        <div className="nox-repsum">
          <div className="nox-rs"><div className="l">予約（{kpiDate === todayLocal() ? "本日" : kpiDate.slice(5)}）</div><div className="v num">{kpiBooked.length}件</div></div>
          <div className="nox-rs"><div className="l">予約人数</div><div className="v num">{kpiPeople}名</div></div>
          <div className="nox-rs"><div className="l">VIP希望</div><div className="v num">{kpiVip}件</div></div>
          <div className="nox-rs"><div className="l">未来店（時刻超過）</div><div className="v num" style={kpiOverdue > 0 ? { color: "var(--bad)" } : undefined}>{kpiOverdue}件</div></div>
        </div>
        {/* 当日の状況（キャパ分母＝seats.length 代用＝E8 裁定 gap#5 の注記どおり） */}
        <div className="nox-inset" style={{ marginTop: 10, padding: 10, fontSize: 12 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <span>来店見込み <span className="num" style={{ color: "var(--v2-text)", fontWeight: 700 }}>{kpiPeople}</span> 名（卓数 {storeSeats.length}）</span>
            <span>卓稼働見込み <span className="num" style={{ color: "var(--v2-text)", fontWeight: 700 }}>{expectSeats.size}</span> / {storeSeats.length} 卓</span>
            <span style={{ color: "var(--sub)" }}>来店済 {kpiVisited} 件</span>
          </div>
          {upcoming.length > 0 && (
            <p style={{ margin: "6px 0 0", color: "var(--sub)", lineHeight: 1.7 }}>
              次の来店予定: {upcoming.map((r) =>
                `${fmtHm(new Date(r.reserved_at))} ${dispName(r)}${r.party_size ? `（${r.party_size}名）` : ""}`).join("・")}
            </p>
          )}
        </div>
      </section>

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>予約一覧</h2>
        {/* E8-1 ⑥: 検索＋状態絞り込み（旧「取消も表示」チェックを置換・''=取消以外すべて） */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="顧客名・電話で検索"
            style={{ ...input, width: 190 }} />
          <SegSelect value={statusFilter} onChange={(v) => setStatusFilter(v)}
            options={[["", "すべて（取消を除く）"], ["booked", "予約済み"], ["visited", "来店済"], ["no_show", "不来店"], ["cancelled", "取消のみ"]] as const} />
        </div>
        {visible.length === 0 ? (
          <p style={{ ...t.sub, margin: 0 }}>予約はありません。</p>
        ) : (
          visible.map((r) => (
            <div key={r.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {/* E8-1 ⑥: 行粒度＝時刻＋来店/同伴ラベル＋顧客＋人数＋電話（既存客のみ）＋席＋状態 */}
                <span style={{ ...t.tag, color: r.nom_type === "dohan" ? "var(--gold2)" : "var(--sub)", borderColor: "var(--line2)" }}>
                  {r.nom_type === "dohan" ? "同伴" : "来店"}
                </span>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                  {fmtWhen(r.reserved_at)}・{dispName(r)}{r.party_size != null ? `（${r.party_size}名）` : ""}
                </span>
                {custTel(r.customer_id) && (
                  <span className="num" style={{ fontSize: 12, color: "var(--sub)" }}>{custTel(r.customer_id)}</span>
                )}
                {r.seat_id && (
                  <span style={{ ...pill("booked"), color: "var(--champ)" }}>
                    {seatName(r.seat_id)} {fmtStayRange(r.stay)}
                  </span>
                )}
                <span style={pill(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</span>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  {r.status === "booked" && (
                    <button style={btnDark} disabled={busy}
                      onClick={() => {
                        if (visitId === r.id) { setVisitId(null); setVSeat(""); setVNom(""); return; }
                        setVisitId(r.id); setEditId(null);
                        // 席予約は予約卓を既定選択（使用中なら空＝候補からも除外され自然に別卓選択）
                        setVSeat(r.seat_id && !openSeats[r.seat_id] ? r.seat_id : "");
                        setVNom("");
                      }}>
                      来店済
                    </button>
                  )}
                  {r.status === "booked" && (
                    <button style={btnLight} disabled={busy}
                      onClick={() => (editId === r.id ? setEditId(null) : openEdit(r))}>編集</button>
                  )}
                  {overdue(r) && (
                    <button style={btnLight} disabled={busy} onClick={() => void setStatus(r, "no_show")}>no_show</button>
                  )}
                  {r.status === "booked" && (
                    <button style={{ ...btnLight, color: "var(--bad)" }} disabled={busy}
                      onClick={() => void setStatus(r, "cancelled")}>取消</button>
                  )}
                </div>
              </div>
              <div style={{ ...t.sub, marginTop: 3 }}>
                担当 {castName(r.cast_id) ?? "未定"}
                {r.nom_type ? `・${NOM_LABEL[r.nom_type]}` : ""}
              </div>
              {/* E8-1 ⑥: 申し送り（memo）は独立行で目立たせる（モック resnote） */}
              {r.memo && (
                <div style={{ fontSize: 12, color: "var(--gold2)", marginTop: 3, lineHeight: 1.6 }}>
                  申し送り: {r.memo}
                </div>
              )}
              {/* 来店処理（卓選択 + nom_type 上書き → reservation_to_check・席予約は予約卓を既定選択） */}
              {visitId === r.id && r.status === "booked" && (
                <div className="nox-inset" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8, padding: 10 }}>
                  <span style={t.fieldLabel}>卓</span>
                  <select value={vSeat} onChange={(e) => setVSeat(e.target.value)} style={input}>
                    <option value="">空き卓を選択</option>
                    {seatOptions(r).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.kind ? `（${s.kind}）` : ""}{r.seat_id === s.id ? "（予約卓）" : ""}
                      </option>
                    ))}
                  </select>
                  {r.seat_id && openSeats[r.seat_id] && (
                    <span style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700 }}>
                      予約卓（{seatName(r.seat_id)}）は使用中のため別の卓を選択してください
                    </span>
                  )}
                  <span style={t.fieldLabel}>指名種別</span>
                  <NomSeg value={vNom} onChange={setVNom}
                    emptyLabel={r.nom_type ? `予約どおり（${NOM_LABEL[r.nom_type]}）` : "指定なし"} />
                  <button style={btnDark} disabled={busy || !vSeat} onClick={() => void toCheck(r)}>伝票を開く</button>
                  <button style={btnLight} onClick={() => setVisitId(null)}>閉じる</button>
                </div>
              )}
              {/* 予約編集（F3b-B 新設・booked のみ・全フィールド明示送信＝規約7） */}
              {editId === r.id && r.status === "booked" && (
                <div className="nox-inset" style={{ display: "grid", gap: 8, marginTop: 8, padding: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={t.fieldLabel}>日付</span>
                    <input type="date" value={eDate} onChange={(ev) => setEDate(ev.target.value)} style={{ ...input, maxWidth: 156 }} />
                    <span style={t.fieldLabel}>時刻</span>
                    <input type="time" value={eTime} onChange={(ev) => setETime(ev.target.value)} style={{ ...input, maxWidth: 110 }} />
                    <span style={t.fieldLabel}>人数</span>
                    <input type="number" min={0} value={ePeople} onChange={(ev) => setEPeople(Number(ev.target.value))} style={{ ...input, width: 60 }} />
                    {r.store_id === storeId && hoursNote(hoursStatusOf(eDate, eTime))}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={t.fieldLabel}>客</span>
                    <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center" }}>
                      <input type="radio" checked={!eUseCustomer} onChange={() => setEUseCustomer(false)} /> フリー入力
                    </label>
                    <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center" }}>
                      <input type="radio" checked={eUseCustomer} onChange={() => setEUseCustomer(true)} /> 既存客から
                    </label>
                    {eUseCustomer ? (
                      <select value={eCustomer} onChange={(ev) => setECustomer(ev.target.value)} style={{ ...input, maxWidth: 220 }}>
                        <option value="">顧客を選択</option>
                        {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (
                      <input placeholder="名前（空ならフリー）" value={eGuest} onChange={(ev) => setEGuest(ev.target.value)} style={{ ...input, width: 170 }} />
                    )}
                    <span style={t.fieldLabel}>指名種別</span>
                    <NomSeg value={eNom} onChange={setENom} emptyLabel="未指定" />
                    <input placeholder="備考" value={eMemo} onChange={(ev) => setEMemo(ev.target.value)} style={{ ...input, width: 220 }} />
                  </div>
                  {/* E8-1 ⑤/⑥: 担当＝CastPicker（未定＝選択なし・タップで選択/解除） */}
                  <div>
                    <span style={{ ...t.fieldLabel, display: "block", marginBottom: 5 }}>
                      担当（{eCast ? castName(eCast) ?? "" : "未定"}）
                    </span>
                    <CastPicker
                      casts={casts} photoUrls={photoUrls} todayIds={todayIds}
                      selectedIds={new Set(eCast ? [eCast] : [])} dense
                      onPick={(id) => setECast((cur) => (cur === id ? "" : id))}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <label style={{ fontSize: 12.5, display: "flex", gap: 5, alignItems: "center", fontWeight: 700 }}>
                      <input type="checkbox" checked={eSeatOn}
                        onChange={(ev) => { setESeatOn(ev.target.checked); if (!ev.target.checked) setESeat(""); }} />
                      席を確保する
                    </label>
                    {eSeatOn ? (
                      <>
                        <span style={t.fieldLabel}>卓</span>
                        <select value={eSeat} onChange={(ev) => setESeat(ev.target.value)} style={{ ...input, maxWidth: 180 }}>
                          <option value="">卓を選択</option>
                          {storeSeats.filter((s) => s.store_id === r.store_id).map((s) => (
                            <option key={s.id} value={s.id}>{s.name}{s.kind ? `（${s.kind}）` : ""}</option>
                          ))}
                        </select>
                        <span style={t.fieldLabel}>滞在</span>
                        <select value={eStay} onChange={(ev) => setEStay(Number(ev.target.value))} style={input}>
                          {STAY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </>
                    ) : (
                      r.seat_id && <span style={{ fontSize: 11.5, color: "var(--sub)" }}>OFF で保存すると卓の確保を解除します（卓なし予約になります）</span>
                    )}
                  </div>
                  {eSeatOn && eSeat && (
                    <div style={{ fontSize: 12, color: "var(--sub)" }}>
                      {seatName(eSeat)} {eDate} の予約枠:{" "}
                      {slotsFor(eSeat, eDate, r.id).length === 0
                        ? "なし（空き）"
                        : slotsFor(eSeat, eDate, r.id).map((s) => `${fmtStayRange(s.stay)}（${dispName(s)}）`).join("・")}
                      ・被る時間帯は保存時に弾かれます
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    {(() => {
                      const eClosed = r.store_id === storeId && hoursStatusOf(eDate, eTime)?.status === "closed";
                      return (
                        <button style={{ ...btnDark, opacity: busy || eClosed ? 0.6 : 1 }} disabled={busy || eClosed}
                          onClick={() => void updateReservation(r)}>保存</button>
                      );
                    })()}
                    <button style={btnLight} onClick={() => setEditId(null)}>閉じる</button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        {msg && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "8px 0 0" }}>{msg}</p>}
      </section>

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>新規予約</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <span style={t.fieldLabel}>日付</span>
          <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} style={{ ...input, maxWidth: 156 }} />
          <span style={t.fieldLabel}>時刻</span>
          <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} style={{ ...input, maxWidth: 110 }} />
          <span style={t.fieldLabel}>人数</span>
          <input type="number" min={1} value={fPeople} onChange={(e) => setFPeople(Number(e.target.value))} style={{ ...input, width: 60 }} />
          {hoursNote(fHours)}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <span style={t.fieldLabel}>客</span>
          <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center" }}>
            <input type="radio" checked={!useCustomer} onChange={() => setUseCustomer(false)} /> フリー入力
          </label>
          <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center" }}>
            <input type="radio" checked={useCustomer} onChange={() => setUseCustomer(true)} /> 既存客から
          </label>
          {useCustomer ? (
            <select value={fCustomer} onChange={(e) => setFCustomer(e.target.value)} style={{ ...input, maxWidth: 220 }}>
              <option value="">顧客を選択</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <input placeholder="名前（空ならフリー）" value={fGuest} onChange={(e) => setFGuest(e.target.value)} style={{ ...input, width: 170 }} />
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <label style={{ fontSize: 12.5, display: "flex", gap: 5, alignItems: "center", fontWeight: 700 }}>
            <input type="checkbox" checked={fSeatOn}
              onChange={(e) => { setFSeatOn(e.target.checked); if (!e.target.checked) setFSeat(""); }} />
            席を確保する
          </label>
          {fSeatOn && (
            <>
              <span style={t.fieldLabel}>卓</span>
              <select value={fSeat} onChange={(e) => setFSeat(e.target.value)} style={{ ...input, maxWidth: 180 }}>
                <option value="">卓を選択</option>
                {storeSeats.map((s) => <option key={s.id} value={s.id}>{s.name}{s.kind ? `（${s.kind}）` : ""}</option>)}
              </select>
              <span style={t.fieldLabel}>滞在</span>
              <select value={fStay} onChange={(e) => setFStay(Number(e.target.value))} style={input}>
                {STAY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </>
          )}
        </div>
        {fSeatOn && fSeat && (
          <div style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
            {seatName(fSeat)} {fDate} の予約枠:{" "}
            {slotsFor(fSeat, fDate).length === 0
              ? "なし（空き）"
              : slotsFor(fSeat, fDate).map((s) => `${fmtStayRange(s.stay)}（${dispName(s)}）`).join("・")}
            ・被る時間帯は登録時に弾かれます
          </div>
        )}
        {/* E8-1 ⑤/⑥: 担当＝CastPicker・指名種別＝4ボタンセグメント（送る引数は不変） */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ ...t.fieldLabel, display: "block", marginBottom: 5 }}>
            担当（{fCast ? castName(fCast) ?? "" : "未定"}）
          </span>
          <CastPicker
            casts={casts} photoUrls={photoUrls} todayIds={todayIds}
            selectedIds={new Set(fCast ? [fCast] : [])} dense
            onPick={(id) => setFCast((cur) => (cur === id ? "" : id))}
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <span style={t.fieldLabel}>指名種別</span>
          <NomSeg value={fNom} onChange={setFNom} emptyLabel="未指定" />
          <input placeholder="備考（卓希望・接待など）" value={fMemo} onChange={(e) => setFMemo(e.target.value)} style={{ ...input, width: 220 }} />
          <button style={{ ...btnDark, opacity: busy || fClosedDay ? 0.6 : 1 }} disabled={busy || fClosedDay}
            onClick={() => void createReservation()}>予約を追加</button>
        </div>
        <p style={{ ...t.sub, margin: 0 }}>
          当日の予約は出勤・卓の準備に活用。「席を確保する」で卓と時間枠を押さえられます（枠が被る予約は登録できません）。
          来店時は「来店済」から卓を選んで伝票を開きます。不可なら「取消」。担当は同伴予約にも使えます。
        </p>
      </section>
    </div>
  );
}
