"use client";

// 予約タブ（F3a-3 §5・canonical の register 予約タブをデコード抽出した文言/構成に確定要件差分を反映）。
//   差分: (a) 客指定=既存客 select＋フリー入力トグル併存（customers 連動） (b) status 4値（no_show 追加）
//   (c) 卓は押さえない=卓希望は備考・卓は来店時に確定 (d)「来店済」= reservation_to_check（伝票を開く）。
// 一覧は RLS（owner=org 全店/manager=自店/staff=can_crm/cast=自分指名のみ）・書込は RPC が二重に守る。
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
};

const NOM_LABEL: Record<string, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", free: "フリー" };
const STATUS_LABEL: Record<string, string> = { booked: "予約", visited: "来店済", no_show: "不来店", cancelled: "取消" };
const STATUS_COLOR: Record<string, string> = { booked: "#C9A24A", visited: "#7FC79B", no_show: "#9A9AA8", cancelled: "#9A9AA8" };

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

  // 来店処理（行ごとの展開）
  const [visitId, setVisitId] = useState<string | null>(null);
  const [vSeat, setVSeat] = useState("");
  const [vNom, setVNom] = useState("");   // ''=予約の nom_type に従う（null 送信）

  const load = useCallback(async () => {
    const { data: rs } = await supabase
      .from("reservations")
      .select("id, store_id, customer_id, cast_id, guest_name, reserved_at, party_size, nom_type, status, memo, check_id")
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
  const overdue = (r: Reservation) => r.status === "booked" && new Date(r.reserved_at).getTime() < Date.now();
  const visible = rows.filter((r) => showClosed || r.status !== "cancelled");

  async function createReservation() {
    setMsg(null);
    const reservedAt = new Date(`${fDate}T${fTime || "20:00"}:00`);
    if (Number.isNaN(reservedAt.getTime())) { setMsg("日付/時刻が不正です"); return; }
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
    });
    setBusy(false);
    setMsg(error ? `予約の追加に失敗: ${error.message}` : "予約を追加しました");
    if (!error) { setFGuest(""); setFCustomer(""); setFMemo(""); }
    await load();
  }

  async function toCheck(r: Reservation) {
    if (!vSeat) { setMsg("卓を選択してください"); return; }
    setMsg(null); setBusy(true);
    const { error } = await supabase.rpc("reservation_to_check", {
      p_reservation_id: r.id, p_seat_id: vSeat, p_nom_type: vNom || null,
    });
    setBusy(false);
    if (error) { setMsg(`来店処理に失敗: ${error.message}`); return; }
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
                <span style={pill(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</span>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  {r.status === "booked" && (
                    <button style={btnDark} disabled={busy}
                      onClick={() => { setVisitId(visitId === r.id ? null : r.id); setVSeat(""); setVNom(""); }}>
                      来店済
                    </button>
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
              {/* 来店処理（卓選択 + nom_type 上書き → reservation_to_check） */}
              {visitId === r.id && r.status === "booked" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8,
                  background: "var(--bg2)", border: "1px solid var(--line2)", borderRadius: 11, padding: 10 }}>
                  <span style={t.fieldLabel}>卓</span>
                  <select value={vSeat} onChange={(e) => setVSeat(e.target.value)} style={input}>
                    <option value="">空き卓を選択</option>
                    {seatOptions(r).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{s.kind ? `（${s.kind}）` : ""}</option>
                    ))}
                  </select>
                  <span style={t.fieldLabel}>指名種別</span>
                  <select value={vNom} onChange={(e) => setVNom(e.target.value)} style={input}>
                    <option value="">{r.nom_type ? `予約どおり（${NOM_LABEL[r.nom_type]}）` : "指定なし（フリー）"}</option>
                    {Object.entries(NOM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <button style={btnDark} disabled={busy || !vSeat} onClick={() => void toCheck(r)}>伝票を開く</button>
                  <button style={btnLight} onClick={() => setVisitId(null)}>閉じる</button>
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
          当日の予約は出勤・卓の準備に活用。来店時は「来店済」から卓を選んで伝票を開きます。不可なら「取消」。担当は同伴予約にも使えます。
        </p>
      </section>
    </div>
  );
}
