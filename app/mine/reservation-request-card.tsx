"use client";

// ★裁定326-4／追補1-5／追補2-3（0160・便 M3-2・2026-10-01）: /mine の予約申請カード（店設定 reservation_request ON のときだけ page が描く）。
//   担当客（customers＝RLS で cast_id が自分の行だけ）から選ぶ → 日付・来店予定時刻・区分（本指名／同伴）→ reservation_request（4 引数）→ 'pending'。
//   送信後は自分の申請一覧（承認待ち／承認／却下＋理由）をカード内に出す。取消の RPC は無い＝注記（仮決め）。人数・備考は RPC に無い＝送らない（仮決め）。
//   和文は rpcErrJa（'bad customer'／'bad reserved_at'／'bad kind'／'closed day'／'billing locked'）。メッセージは Toast（裁定281）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import Picker from "@/components/nox/picker";
import SegSelect from "@/components/ui/seg-select";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { RSV_KIND_OPTIONS, RSV_REQ_CANCEL_NOTE, RSV_REQ_EMPTY, RSV_REQ_SENT, RSV_REQ_STATUS_COLOR, RSV_REQ_STATUS_LABEL, rsvCustomerNameOf, rsvRequestArgsOf, rsvRequestRowsOf, rsvWhenLabelOf, type RsvRequestRow } from "@/lib/nox/mine/reservation-request";

type Customer = { id: string; name: string; tel: string | null };
const NOM_LABEL: Record<string, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", free: "フリー" };

export default function ReservationRequestCard({ storeId, bizToday }: { storeId: string; bizToday: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rows, setRows] = useState<RsvRequestRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(bizToday);
  const [time, setTime] = useState("20:00");
  const [kind, setKind] = useState("hon");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    // 担当客＝customers の RLS（cast は cast_id＝自分の行だけ）。RPC 側も同じ条件で 'bad customer'（二重防御）
    const { data: cs } = await supabase.from("customers").select("id, name, tel").eq("is_active", true).order("name");
    setCustomers((cs ?? []) as Customer[]);
    // 自分の申請＝requested_by_cast が入っている行（RLS＝cast_id が自分の行）
    const { data: rs } = await supabase.from("reservations").select("id, reserved_at, nom_type, status, rejected_reason, customers(name)").not("requested_by_cast", "is", null).order("reserved_at", { ascending: false }).limit(40);
    setRows(rsvRequestRowsOf((rs ?? []) as unknown as RsvRequestRow[]));
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit() {
    const a = rsvRequestArgsOf({ storeId, customerId, date, time, kind });
    if (!a.ok) { setMsg(a.err); return; }
    setBusy(true); setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("reservation_request", a.args);
    setBusy(false);
    if (error) { setMsg(rpcErrJa(error.message)); return; }
    setMsg(RSV_REQ_SENT);
    setCustomerId("");
    await load();
  }

  const pill = (status: string): React.CSSProperties => ({
    fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap", marginLeft: "auto",
    color: RSV_REQ_STATUS_COLOR[status] ?? "var(--sub)", background: "var(--card2)", border: "1px solid var(--line2)",
  });
  const input: React.CSSProperties = { ...t.input, padding: "8px 10px", fontSize: 13 };

  return (
    <section className="nox-panel" aria-label="予約申請">
      <h3>指名・同伴の予約申請</h3>
      {loaded && customers.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "6px 0 0" }}>{RSV_REQ_EMPTY}</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <Picker dense items={customers.map((c) => ({ id: c.id, label: c.name, sublabel: c.tel ?? undefined }))} value={customerId || null}
            onPick={setCustomerId} onClear={() => setCustomerId("")} placeholder="担当客を検索" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input type="date" value={date} min={bizToday} disabled={busy} onChange={(e) => setDate(e.target.value)} style={{ ...input, maxWidth: 156 }} aria-label="来店日" />
            <input type="time" value={time} disabled={busy} onChange={(e) => setTime(e.target.value)} style={{ ...input, maxWidth: 110 }} aria-label="来店予定時刻" />
            <SegSelect value={kind} onChange={setKind} options={RSV_KIND_OPTIONS} disabled={busy} ariaLabel="区分" />
          </div>
          <div className="nox-actions">
            <button type="button" style={{ ...t.btnGold, ...t.btnSm, opacity: busy ? 0.6 : 1 }} disabled={busy || !loaded} onClick={() => void submit()}>申請する</button>
          </div>
        </div>
      )}
      {msg && <Toast msg={msg} style={{ margin: "8px 0 0" }} />}
      {rows.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "var(--sub)", fontWeight: 700 }}>自分の申請</div>
          {rows.map((r) => (
            <div key={r.id} style={{ padding: "7px 0", borderBottom: "1px solid var(--line2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span className="num" style={{ fontWeight: 700 }}>{rsvWhenLabelOf(r.reserved_at)}</span>
                <span style={{ fontWeight: 700 }}>{rsvCustomerNameOf(r.customers)}</span>
                <span style={{ color: "var(--sub)" }}>{NOM_LABEL[r.nom_type ?? ""] ?? ""}</span>
                <span style={pill(r.status)}>{RSV_REQ_STATUS_LABEL[r.status] ?? r.status}</span>
              </div>
              {r.status === "rejected" && r.rejected_reason && <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>理由: {r.rejected_reason}</div>}
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "6px 0 0" }}>{RSV_REQ_CANCEL_NOTE}</p>
    </section>
  );
}
