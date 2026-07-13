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
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Seat = { id: string; name: string; kind: string | null; store_id: string };
type Cast = { id: string; name: string };
type Customer = { id: string; name: string };
type Reservation = {
  id: string; store_id: string; customer_id: string | null; cast_id: string | null;
  guest_name: string | null; reserved_at: string; party_size: number | null;
  nom_type: string | null; status: string; memo: string | null; check_id: string | null;
  seat_id: string | null; stay: string | null;
};

const NOM_LABEL: Record<string, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", free: "フリー" };
const STATUS_LABEL: Record<string, string> = { booked: "予約", visited: "来店済", no_show: "不来店", cancelled: "取消" };
const STATUS_COLOR: Record<string, string> = { booked: "#C9A24A", visited: "#7FC79B", no_show: "#9A9AA8", cancelled: "#9A9AA8" };
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
  return msg;
}

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };
const pill = (status: string): React.CSSProperties => ({
  fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
  color: STATUS_COLOR[status] ?? "var(--sub)", background: "#23232B", border: "1px solid var(--line2)",
  whiteSpace: "nowrap",
});

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ReservationPanel({
  storeId, seats, casts,
}: {
  storeId: string; seats: Seat[]; casts: Cast[];
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Reservation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [openSeats, setOpenSeats] = useState<Record<string, string>>({}); // seat_id → open check_id
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showClosed, setShowClosed] = useState(false); // cancelled はデフォルトで畳む（§3-E）

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
      .from("customers").select("id, name").eq("is_active", true).order("name");
    setCustomers((cs ?? []) as Customer[]);
    const { data: oc } = await supabase.from("checks").select("id, seat_id").eq("status", "open");
    const m: Record<string, string> = {};
    for (const r of oc ?? []) m[r.seat_id as string] = r.id as string;
    setOpenSeats(m);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void load(); }, [load]);

  const castName = (id: string | null) => casts.find((c) => c.id === id)?.name ?? null;
  const custName = (id: string | null) => customers.find((c) => c.id === id)?.name ?? null;
  const dispName = (r: Reservation) => custName(r.customer_id) ?? r.guest_name ?? "（名前未設定）";
  const seatName = (id: string | null) => seats.find((s) => s.id === id)?.name ?? "卓";
  const overdue = (r: Reservation) => r.status === "booked" && new Date(r.reserved_at).getTime() < Date.now();
  const visible = rows.filter((r) => showClosed || r.status !== "cancelled");
  const storeSeats = seats.filter((s) => s.store_id === storeId);

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

  return (
    <div style={{ maxWidth: 720 }}>
      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>予約一覧</h2>
        <label style={{ ...t.sub, display: "flex", gap: 5, alignItems: "center", marginBottom: 8 }}>
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          取消も表示
        </label>
        {visible.length === 0 ? (
          <p style={{ ...t.sub, margin: 0 }}>予約はありません。</p>
        ) : (
          visible.map((r) => (
            <div key={r.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                  {fmtWhen(r.reserved_at)}・{dispName(r)}{r.party_size != null ? `（${r.party_size}名）` : ""}
                </span>
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
                {r.memo ? `・${r.memo}` : ""}
              </div>
              {/* 来店処理（卓選択 + nom_type 上書き → reservation_to_check・席予約は予約卓を既定選択） */}
              {visitId === r.id && r.status === "booked" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8,
                  background: "var(--bg2)", border: "1px solid var(--line2)", borderRadius: 11, padding: 10 }}>
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
                  <select value={vNom} onChange={(e) => setVNom(e.target.value)} style={input}>
                    <option value="">{r.nom_type ? `予約どおり（${NOM_LABEL[r.nom_type]}）` : "指定なし（フリー）"}</option>
                    {Object.entries(NOM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <button style={btnDark} disabled={busy || !vSeat} onClick={() => void toCheck(r)}>伝票を開く</button>
                  <button style={btnLight} onClick={() => setVisitId(null)}>閉じる</button>
                </div>
              )}
              {/* 予約編集（F3b-B 新設・booked のみ・全フィールド明示送信＝規約7） */}
              {editId === r.id && r.status === "booked" && (
                <div style={{ display: "grid", gap: 8, marginTop: 8,
                  background: "var(--bg2)", border: "1px solid var(--line2)", borderRadius: 11, padding: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={t.fieldLabel}>日付</span>
                    <input type="date" value={eDate} onChange={(ev) => setEDate(ev.target.value)} style={{ ...input, maxWidth: 156 }} />
                    <span style={t.fieldLabel}>時刻</span>
                    <input type="time" value={eTime} onChange={(ev) => setETime(ev.target.value)} style={{ ...input, maxWidth: 110 }} />
                    <span style={t.fieldLabel}>人数</span>
                    <input type="number" min={0} value={ePeople} onChange={(ev) => setEPeople(Number(ev.target.value))} style={{ ...input, width: 60 }} />
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
                    <span style={t.fieldLabel}>担当</span>
                    <select value={eCast} onChange={(ev) => setECast(ev.target.value)} style={{ ...input, maxWidth: 180 }}>
                      <option value="">未定</option>
                      {casts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <span style={t.fieldLabel}>指名種別</span>
                    <select value={eNom} onChange={(ev) => setENom(ev.target.value)} style={input}>
                      <option value="">未指定（来店時に決める）</option>
                      {Object.entries(NOM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input placeholder="備考" value={eMemo} onChange={(ev) => setEMemo(ev.target.value)} style={{ ...input, width: 220 }} />
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
                    <button style={btnDark} disabled={busy} onClick={() => void updateReservation(r)}>保存</button>
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <span style={t.fieldLabel}>担当</span>
          <select value={fCast} onChange={(e) => setFCast(e.target.value)} style={{ ...input, maxWidth: 180 }}>
            <option value="">未定</option>
            {casts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span style={t.fieldLabel}>指名種別</span>
          <select value={fNom} onChange={(e) => setFNom(e.target.value)} style={input}>
            <option value="">未指定（来店時に決める）</option>
            {Object.entries(NOM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input placeholder="備考（卓希望・接待など）" value={fMemo} onChange={(e) => setFMemo(e.target.value)} style={{ ...input, width: 220 }} />
          <button style={btnDark} disabled={busy} onClick={() => void createReservation()}>予約を追加</button>
        </div>
        <p style={{ ...t.sub, margin: 0 }}>
          当日の予約は出勤・卓の準備に活用。「席を確保する」で卓と時間枠を押さえられます（枠が被る予約は登録できません）。
          来店時は「来店済」から卓を選んで伝票を開きます。不可なら「取消」。担当は同伴予約にも使えます。
        </p>
      </section>
    </div>
  );
}
