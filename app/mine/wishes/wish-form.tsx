"use client";

// B-5 スライスB（mig0033）: cast は store_business_hours 0行（RLS パターン2＝裁定3）のため
// 営業時間そのものは読めない＝時間外警告は cast には出せない（経営側 UI の責務）。
// 定休日のみ、grant authenticated の shift_is_closed_day（boolean のみ返る専用経路・段26-6 実測）で
// 事前チェックして提出をブロックする。二層目は RPC 'closed day'（段26-1 実測）＝日本語化して事後表示。
// 店 id は自分の casts 行（パターン1＝自分のみ可視）から解決。
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

export default function WishForm() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [start, setStart] = useState("20:00");
  const [end, setEnd] = useState("26:00");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [closedDay, setClosedDay] = useState(false);

  // 自分の cast 行から店を解決（cast はパターン1＝自分の行のみ返る）
  useEffect(() => {
    const supabase = createClient();
    void supabase.from("casts").select("store_id").limit(1)
      .then(({ data }) => setStoreId((data?.[0]?.store_id as string | undefined) ?? null));
  }, []);

  // 日付変更ごとに定休日を事前チェック（boolean のみ・失敗時は false=ブロックせず RPC 二層目に委譲）
  useEffect(() => {
    if (!storeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setClosedDay(false); return; }
    let cancelled = false;
    const supabase = createClient();
    void supabase.rpc("shift_is_closed_day", { p_store_id: storeId, p_date: date })
      .then(({ data }) => { if (!cancelled) setClosedDay(data === true); });
    return () => { cancelled = true; };
  }, [date, storeId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    // B-5②: 定休日は送信もしない（ボタン無効の保険・二層目は RPC 'closed day'）
    if (closedDay) { setMsg("選択された日は定休日です（希望を提出できません）"); return; }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("shift_wish_submit", {
      p_date: date,
      p_start_hm: start,
      p_end_hm: end,
    });
    setMsg(error
      ? (error.message.includes("closed day")
          ? "選択された日は定休日です（希望を提出できません）"
          : "提出に失敗しました（開始 00:00〜23:59・終了 00:00〜47:59）")
      : "希望を提出しました");
    setBusy(false);
    router.refresh();
  }

  const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", borderRadius: 9 };
  return (
    <form onSubmit={submit} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={input} />
      <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="開始 20:00" required style={{ ...input, width: 90 }} />
      <span style={{ fontSize: 13, color: "var(--sub)" }}>〜</span>
      <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="終了 26:00" required style={{ ...input, width: 90 }} />
      <button type="submit" disabled={busy || closedDay} style={{ ...t.btnGold, padding: "8px 16px", opacity: busy || closedDay ? 0.7 : 1 }}>
        提出
      </button>
      {closedDay && (
        <span style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700 }}>この日は定休日です（提出できません）</span>
      )}
      {msg && <span style={{ fontSize: 13, color: "var(--sub)" }}>{msg}</span>}
    </form>
  );
}
