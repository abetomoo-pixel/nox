"use client";

// ★K client 第 2 便（2026-11-02 夜・教訓126＝写しを置かず本体の包み）: キオスクのシフト／日報タイルの中身（操作担当の解除のあとに描く＝読取は 0190 の RLS kiosk 腕）。
//   シフト＝今日の営業日の確定シフト（shifts）×打刻（punches）×連絡（attendance）＝出勤・未出勤・退勤を一覧（読取だけ）。
//   日報＝直近の日報（daily_reports）の数字を読むだけ（締めは本店の「日報」＝書込 RPC の kiosk 腕が無い＝DDL の下書きで止める）。
//   在庫＝在庫数は stock_logs の集計＝kiosk 腕が無い（読取 RPC が要る＝DDL）＝案内を残す。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { hmLabelOf } from "@/lib/nox/time/hhmm";
import { bizDateOf } from "@/lib/nox/biz-date";
import { Message } from "@/components/ui/toast"; // 裁定281: メッセージは共通部品

type ShiftRow = { cast_id: string; start_hm: string; end_hm: string; status: string };
type Punch = { cast_id: string; type: string; punched_at: string };
type Att = { cast_id: string; status: string; eta: string | null };

export function KioskShiftView({ storeId, cutoff = "06:00" }: { storeId: string; cutoff?: string }) {
  const [rows, setRows] = useState<{ id: string; name: string; start: string; end: string; state: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const bd = bizDateOf(new Date().toISOString(), cutoff);
      const [s, c, p, a] = await Promise.all([
        supabase.from("shifts").select("cast_id, start_hm, end_hm, status").eq("store_id", storeId).eq("date", bd).eq("status", "confirmed"),
        supabase.from("casts").select("id, name").eq("store_id", storeId).eq("is_active", true),
        supabase.from("punches").select("cast_id, type, punched_at").eq("store_id", storeId).gte("punched_at", new Date(Date.parse(`${bd}T${cutoff}:00+09:00`)).toISOString()).order("punched_at"),
        supabase.from("attendance").select("cast_id, status, eta").eq("store_id", storeId).eq("date", bd),
      ]);
      const e = s.error ?? c.error ?? p.error ?? a.error;
      if (e) { setErr("読み込めませんでした（操作担当を選び直してください）"); setRows([]); return; }
      const name = new Map(((c.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
      const last = new Map<string, string>(); for (const x of (p.data ?? []) as Punch[]) last.set(x.cast_id, x.type);
      const att = new Map(((a.data ?? []) as Att[]).map((x) => [x.cast_id, x]));
      setRows(((s.data ?? []) as ShiftRow[]).map((x) => {
        const l = last.get(x.cast_id); const at = att.get(x.cast_id);
        const state = l === "in" ? "出勤中" : l === "out" ? "退勤" : at?.status === "absent" ? "当欠" : at?.status === "late" ? `遅刻連絡${at.eta ? `（${hmLabelOf(at.eta)} 見込み）` : ""}` : "未出勤";
        return { id: x.cast_id, name: name.get(x.cast_id) ?? "—", start: hmLabelOf(x.start_hm), end: hmLabelOf(x.end_hm), state };
      }).sort((x, y) => x.start.localeCompare(y.start)));
    })();
  }, [storeId, cutoff]);
  return (
    <section className="nox-cardtop" style={{ ...t.card }} data-kiosk-shift-view="1">
      <h3 style={{ ...t.cardTitle, margin: "0 0 8px" }}>今日のシフト（確定）</h3>
      {err && <Message kind="error" style={{ margin: "0 0 8px" }}>{err}</Message>}
      {rows === null ? <p style={t.sub}>読み込み中…</p> : rows.length === 0 ? <p style={t.sub}>今日の確定シフトはありません。</p> : (
        <table className="nox-table" style={{ width: "100%" }}>
          <thead><tr><th>キャスト</th><th>時間</th><th>状態</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} data-kiosk-shift-row={r.id}><td>{r.name}</td><td className="num">{r.start}〜{r.end}</td><td>{r.state}</td></tr>)}</tbody>
        </table>
      )}
      <p style={{ ...t.sub, margin: "8px 0 0" }}>シフトの変更・追加は本店の「シフト」で行います（この端末は表示だけ）。</p>
    </section>
  );
}

export function KioskReportView({ storeId }: { storeId: string }) {
  const [row, setRow] = useState<Record<string, unknown> | null | undefined>(undefined);
  useEffect(() => {
    (async () => {
      const { data } = await createClient().from("daily_reports").select("biz_date, uri, slips, guests, closed_at").eq("store_id", storeId).order("biz_date", { ascending: false }).limit(1).maybeSingle();
      setRow((data ?? null) as Record<string, unknown> | null);
    })();
  }, [storeId]);
  const yen = (v: unknown) => (typeof v === "number" ? `¥${v.toLocaleString("ja-JP")}` : "—");
  return (
    <section className="nox-cardtop" style={{ ...t.card }} data-kiosk-report-view="1">
      <h3 style={{ ...t.cardTitle, margin: "0 0 8px" }}>直近の日報</h3>
      {row === undefined ? <p style={t.sub}>読み込み中…</p> : row === null ? <p style={t.sub}>日報はまだありません。</p> : (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={t.bdRow}><span style={t.bdKey}>営業日</span><span style={t.bdVal}>{String(row.biz_date ?? "—")}（{row.closed_at ? "締め済み" : "未締め"}）</span></div>
          <div style={t.bdRow}><span style={t.bdKey}>売上</span><span style={t.bdVal} className="num">{yen(row.uri)}</span></div>
          <div style={t.bdRow}><span style={t.bdKey}>組数・人数</span><span style={t.bdVal} className="num">{String(row.slips ?? "—")} 組・{String(row.guests ?? "—")} 名</span></div>
        </div>
      )}
      <p style={{ ...t.sub, margin: "8px 0 0" }}>締めは本店の「日報」で行います（この端末は表示だけ）。</p>
    </section>
  );
}
