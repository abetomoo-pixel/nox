"use client";
// ★裁定514-2（#63／#39・2026-11-27 03:25 確定＝取消の関数 check_void は今のまま・0240 は当てない・レジに入口だけ足す）: 今日の営業日の「会計済みの伝票」の一覧＝レジのフロアの下。
//   ・領収書：会計完了の窓を閉じた後でも、同じ窓をその伝票で開き直して出す（onReceipt＝register-board の reopenReceipt・発行は receipt_issue）。
//   ・取消：店長以上だけ（isManagerUp）。理由は必須（check_void の 'bad reason'）。関数（check_void／receipt_issue_void）は今のまま。
//     ★裁定526（決め 1・相談役 2026-11-28 11:50）: 締めた日でも画面では止めない＝その営業日の日報の行があれば文で知らせるだけ。
//       関数が 'day closed' を返したとき（締め解除の流れを使う店・解除していない）は「日報の締めを解除してから取り消してください。」。
//     ★裁定527（決め 2・同・形 2）: その伝票の発行済みの領収書を先に 1 枚ずつ取り消し（receipt_issue_void・理由＝「伝票の取消のため」）、全部済んでから伝票を取り消す。
//       押すたびに領収書の今の状態を読み直す＝取消済みの行は飛ばして続きから。1 枚でも失敗したら伝票は取り消さず、どこまで済んだかを文で出す。
//       順番と文は lib/nox/register/closed-void.ts（DB を知らない）。役は 2 つの関数で同じ（オーナー・自店の店長＝0190:3267-3270／0099:191-194）。
//   読むのは checks（RLS＝店のスコープ）と receipt_issues（RLS＝オーナー・自店の店長）と daily_reports の有無だけ。書込は RPC だけ。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";
import Loading from "@/components/ui/loading";
import { Message } from "@/components/ui/toast";
import { bizDateOf, bizDateRange } from "@/lib/nox/biz-date";
import { RECEIPT_VOID_NOTE, closedDayNoticeOf, closedVoidPreflightOf, closedVoidTextOf, receiptVoidNoticeOf, runClosedVoid, type ReceiptState } from "@/lib/nox/register/closed-void";

type Seat = { id: string; name: string };
type Row = { id: string; seat_id: string | null; started_at: string; closed_at: string | null; total: number };
const yen = (n: number) => "¥" + n.toLocaleString();
const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }) : "—");

export default function ClosedChecksPanel({ storeId, seats, isManagerUp, onReceipt, onVoided }: {
  storeId: string; seats: Seat[]; isManagerUp: boolean;
  onReceipt: (checkId: string, total: number) => void;
  onVoided: (text: string) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [issued, setIssued] = useState<Record<string, number>>({});
  const [issuedCount, setIssuedCount] = useState<Record<string, number>>({}); // ★裁定527: 発行済み（取消していない）の領収書の枚数＝窓の「領収書 n 枚も取消になります」
  const [dayClosed, setDayClosed] = useState(false);
  const [bizDate, setBizDate] = useState<string>("");
  const [target, setTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const seatName = (id: string | null) => seats.find((s) => s.id === id)?.name ?? "—";

  const load = useCallback(async () => {
    const { data: st } = await supabase.from("stores").select("settings_json").eq("id", storeId).maybeSingle();
    const sj = ((st as { settings_json?: Record<string, unknown> } | null)?.settings_json ?? {}) as Record<string, unknown>;
    const cut = typeof sj.biz_cutoff_hm === "string" && sj.biz_cutoff_hm ? sj.biz_cutoff_hm : "06:00";
    const d = bizDateOf(new Date().toISOString(), cut); const r = bizDateRange(d, cut);
    const [{ data: cs }, { data: dr }] = await Promise.all([
      supabase.from("checks").select("id, seat_id, started_at, closed_at, total").eq("store_id", storeId).eq("status", "closed")
        .gte("started_at", r.startIso).lt("started_at", r.endIso).order("closed_at", { ascending: false }).limit(100),
      supabase.from("daily_reports").select("id").eq("store_id", storeId).eq("biz_date", d).maybeSingle(),
    ]);
    const list = (cs ?? []) as Row[];
    const ids = list.map((x) => x.id);
    const { data: ri } = ids.length ? await supabase.from("receipt_issues").select("check_id, amount").in("check_id", ids).eq("voided", false) : { data: [] };
    const sum: Record<string, number> = {}; const cnt: Record<string, number> = {};
    for (const x of (ri ?? []) as { check_id: string; amount: number }[]) { sum[x.check_id] = (sum[x.check_id] ?? 0) + x.amount; cnt[x.check_id] = (cnt[x.check_id] ?? 0) + 1; }
    setBizDate(d); setRows(list); setIssued(sum); setIssuedCount(cnt); setDayClosed(!!dr);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  async function doVoid() {
    if (!target || busy || !reason.trim()) return;
    setBusy(true); setMsg(null);
    const checkId = target.id, why = reason.trim();
    // ★裁定527（形 2）: 領収書が先・伝票が後。押すたびに領収書の今の状態を読み直す（取消済みは飛ばす）＝順番は runClosedVoid。
    const outcome = await runClosedVoid({
      readReceipts: async () => {
        const { data, error } = await supabase.from("receipt_issues").select("id, serial, voided").eq("check_id", checkId).order("serial");
        return error ? { error: error.message } : { rows: (data ?? []) as ReceiptState[] };
      },
      voidReceipt: async (id) => (await supabase.rpc("receipt_issue_void", { p_issue_id: id, p_note: RECEIPT_VOID_NOTE })).error?.message ?? null,
      voidCheck: async () => (await supabase.rpc("check_void", { p_check_id: checkId, p_reason: why })).error?.message ?? null,
      // ★選べる形（先読み）: 取り消す領収書があるときだけ。伝票の取消が必ず断られる（締め済みで解除していない・売掛を回収済み）と読めたら、領収書に手を付けずに同じ文を出す。
      //   読めなかったとき（エラー）は何も止めない＝関数に任せる。読むのは flag_enabled・daily_reports・receivables（どれも今ある読み・店長以上は読める）。
      preflight: async () => {
        const [fl, dr, rc] = await Promise.all([
          supabase.rpc("flag_enabled", { p_key: "reopen_flow", p_store_id: storeId }),
          supabase.from("daily_reports").select("reopened_at, reclosed_at").eq("store_id", storeId).eq("biz_date", bizDate).maybeSingle(),
          supabase.from("receivables").select("status, deducted_amount, collected_amount").eq("check_id", checkId),
        ]);
        return closedVoidPreflightOf({
          flowOn: fl.data === true,
          report: (dr.data as { reopened_at: string | null; reclosed_at: string | null } | null) ?? null,
          receivables: (rc.data ?? []) as { status: string; deducted_amount: number; collected_amount: number }[],
        });
      },
    });
    const res = closedVoidTextOf(outcome);
    setBusy(false);
    if (!res.ok) { setMsg(res.text); await load(); return; } // 途中で止まった＝窓に残す（一覧の領収書の額と枚数は読み直す）
    setTarget(null); setReason("");
    onVoided(res.text);
    await load();
  }

  return (
    <section className="nox-cardtop" style={{ ...t.card, width: "100%" }} data-closed-checks="1">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ ...t.cardTitle, margin: 0 }}>会計済みの伝票（今日の営業日）</h3>
        <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "閉じる" : "開く"}</button>
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 6px", lineHeight: 1.6 }}>
            領収書はここからあとで出せます。{isManagerUp ? "取消は店長以上だけです（発行した領収書も一緒に取消になります）。" : "伝票の取消は店長以上に頼んでください。"}
          </p>
          {dayClosed && <Message kind="warn" style={{ margin: "0 0 6px" }}>{closedDayNoticeOf(bizDate, isManagerUp)}</Message>}
          {rows === null ? <Loading />
            : rows.length === 0 ? <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>今日の営業日の会計済みの伝票はありません。</p>
            : (
              <div style={{ display: "grid", gap: 4 }}>
                {rows.map((r) => (
                  <div key={r.id} data-closed-check={r.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, borderBottom: "1px solid var(--line)", padding: "4px 0" }}>
                    <span style={{ fontWeight: 700, minWidth: 64 }}>{seatName(r.seat_id)}</span>
                    <span className="num" style={{ color: "var(--sub)" }}>{hm(r.started_at)}〜{hm(r.closed_at)}</span>
                    <span className="num" style={{ fontWeight: 800 }}>{yen(r.total)}</span>
                    {(issued[r.id] ?? 0) > 0 && <span style={{ fontSize: 11, color: "var(--sub)" }}>領収書 {yen(issued[r.id])}</span>}
                    <span style={{ flex: 1 }} />
                    <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={(issued[r.id] ?? 0) >= r.total} onClick={() => onReceipt(r.id, r.total)}>領収書</button>
                    {isManagerUp && <button type="button" style={{ ...t.btnGhost, ...t.btnSm, color: "var(--bad)" }} onClick={() => { setTarget(r); setReason(""); setMsg(null); }}>取消</button>}
                  </div>
                ))}
              </div>
            )}
          {msg && !target && <Message kind="error">{msg}</Message>}
        </div>
      )}
      {target && (
        <Modal onClose={() => { if (!busy) setTarget(null); }}>
          <h3 style={{ ...t.cardTitle, margin: "0 0 8px" }}>会計済みの伝票を取り消す</h3>
          <p style={{ fontSize: 13, margin: "0 0 8px", lineHeight: 1.7 }}>
            {seatName(target.seat_id)}・{hm(target.started_at)}〜{hm(target.closed_at)}・<b className="num">{yen(target.total)}</b><br />
            売上・入金・キャストのバックから外れます（日報の数からも外れます）。{(issuedCount[target.id] ?? 0) > 0 ? <b data-void-receipts={issuedCount[target.id]}>{receiptVoidNoticeOf(issuedCount[target.id])}。</b> : null}お客様へのお金の返し方はお店で決めてください。
          </p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="取消の理由（必須）" maxLength={200} style={{ ...t.input, width: "100%" }} aria-label="取消の理由" />
          {msg && <Message kind="error">{msg}</Message>}
          <div className="nox-actions" style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={t.btnGhost} disabled={busy} onClick={() => setTarget(null)}>やめる</button>
            <button type="button" style={{ ...t.btnGold, background: "var(--bad)", borderColor: "var(--bad)" }} disabled={busy || !reason.trim()} onClick={() => void doVoid()}>取り消す</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
