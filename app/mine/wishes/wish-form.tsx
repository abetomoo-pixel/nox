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

import { Message, type MessageKind } from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
import { rpcErrJa, isRpcMissingError } from "@/lib/nox/ui/rpc-err";
// ★夜間便 N5（裁定287-2・0151 ★2 shift_open_periods_mine）: 募集中の期間の案内と日付の可否（純関数）
import { dateBoundsOf, isDateSelectable, periodNoticeOf, type OpenPeriod } from "@/lib/nox/shift/open-periods";
export default function WishForm() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [start, setStart] = useState("20:00");
  const [end, setEnd] = useState("26:00");
  const [msg, setMsg] = useState<{ kind: MessageKind; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [closedDay, setClosedDay] = useState(false);
  // ★N5: 募集中の期間（null＝RPC 未適用（0151 手貼り前）または未取得＝従来どおりの画面・案内も日付制限も出さない）
  const [periods, setPeriods] = useState<OpenPeriod[] | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  // ★N5-1: 自店の募集中（status='open'）の期間＝RPC shift_open_periods_mine（cast 本人・0 行＝募集なし）。関数が無ければ null に落とす
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase.rpc("shift_open_periods_mine").then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setPeriods(isRpcMissingError(error.message) ? null : []); return; }
      setPeriods(((data ?? []) as Record<string, unknown>[]).map((r) => ({
        start_date: String(r.start_date), end_date: String(r.end_date), wish_deadline: r.wish_deadline ? String(r.wish_deadline) : null,
      })));
    });
    return () => { cancelled = true; };
  }, []);
  const notice = periods ? periodNoticeOf(periods, today) : null;
  const bounds = periods ? dateBoundsOf(periods) : null;
  // ★N5-2: 期間外の日＝送信しない（DB の 'period_not_open' の先回り・期間が取れていないときは判定しない）
  const outside = !!periods && /^\d{4}-\d{2}-\d{2}$/.test(date) && !isDateSelectable(periods, date);

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
    if (closedDay) { setMsg({ kind: "error", text: "選択された日は定休日です（希望を提出できません）" }); return; }
    if (outside) { setMsg({ kind: "error", text: "この日は募集期間外です" }); return; } // ★N5-2
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("shift_wish_submit", {
      p_date: date,
      p_start_hm: start,
      p_end_hm: end,
    });
    // ★N5-3: 'period_not_open'→「この日は募集期間外です」ほかは共通写像（rpcErrJa）。'bad time' は従来の案内文を残す
    setMsg(error
      ? { kind: "error", text: error.message.includes("closed day")
          ? "選択された日は定休日です（希望を提出できません）"
          : error.message.includes("bad time")
            ? "提出に失敗しました（開始 00:00〜23:59・終了 00:00〜47:59）"
            : rpcErrJa(error.message) }
      : { kind: "success", text: "希望を提出しました" });
    setBusy(false);
    router.refresh();
  }

  const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", borderRadius: 9 };
  return (
    <>
      {/* ★夜間便 N5-1（裁定287-2）: 募集中の期間の案内（受付中＝info・締切超過＝warn・募集なし＝info）。RPC 未適用時は出さない（従来どおり） */}
      {notice && (
        <Message kind={notice.kind === "past_deadline" ? "warn" : "info"} style={{ margin: "0 0 10px" }}>{notice.text}</Message>
      )}
    <form onSubmit={submit} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {/* ★N5-2: 日付は募集中の期間の範囲に限定（min／max＝カレンダーで期間外を選べない見た目・期間の隙間は outside で止める） */}
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={input}
        min={bounds?.min} max={bounds?.max} aria-invalid={outside || undefined} />
      <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="開始 20:00" required style={{ ...input, width: 90 }} />
      <span style={{ fontSize: 13, color: "var(--sub)" }}>〜</span>
      <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="終了 26:00" required style={{ ...input, width: 90 }} />
      <button type="submit" disabled={busy || closedDay || outside} style={{ ...t.btnGold, padding: "8px 16px", opacity: busy || closedDay || outside ? 0.7 : 1 }}>
        提出
      </button>
      {closedDay && (
        <span style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700 }}>この日は定休日です（提出できません）</span>
      )}
      {outside && !closedDay && (
        <span style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700 }}>この日は募集期間外です</span>
      )}
      {msg && <Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message>}
    </form>
    </>
  );
}
