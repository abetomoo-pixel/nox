"use client";

// ホームのボード（E5）。読取専用＝書込 RPC なし（承認操作は DrinkClaimQueue 内で完結）。
// KPI の材料はすべて既存可視面：attendance（staff も可視＝台帳#24）・daily_reports（締め済み実績）・
// get_cast_ranking（順位/件数のみ・金額列なし・staff 開放済み=mig0011）。
// 今月売上は「締め済み日報の積み上げ」＝現金+カードグロス+売掛+その他（モック日報の売上4分類と同型）。
// 未締め当日分は含まない（会計中の変動値を KPI に出さない＝日報が正）。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf } from "@/lib/nox/biz-date";
import * as t from "@/lib/nox/ui/theme";
import DrinkClaimQueue from "../register/drink-claim-queue";

type Cast = { id: string; name: string };
type Att = { cast_id: string; status: string; eta: string | null };
type ReportRow = { biz_date: string; cash: number; card_gross: number; uri: number; other: number };
// get_cast_ranking の返り列に一致（hon_count/jonai_count/dohan_count・不一致だと NaN になっていた）
type RankRow = { rank: number; cast_id: string; cast_name: string; hon_count: number; jonai_count: number; dohan_count: number };

const yen = (n: number) => "¥" + n.toLocaleString();
const card: React.CSSProperties = t.card;
const secTitle: React.CSSProperties = t.cardTitle;
// 出勤板（shift-board）と同じ語彙＝ATT_OPTIONS の表示側
const ATT_LABEL: Record<string, string> = { shukkin: "出勤", dohan: "同伴", late: "遅刻", off: "休み", absent: "当欠" };
const PRESENT = new Set(["shukkin", "dohan", "late"]);

export default function DashboardBoard({ storeId, storeName, cutoff, casts, shortcuts }: {
  storeId: string; storeName: string; cutoff: string; casts: Cast[];
  shortcuts: { href: string; label: string }[];
}) {
  const supabase = createClient();
  const bizToday = bizDateOf(new Date().toISOString(), cutoff);
  const month = bizToday.slice(0, 7);
  const [atts, setAtts] = useState<Att[]>([]);
  const [monthSales, setMonthSales] = useState(0);
  const [ranking, setRanking] = useState<RankRow[]>([]);

  const load = useCallback(async () => {
    const { data: at } = await supabase.from("attendance")
      .select("cast_id, status, eta").eq("date", bizToday);
    const { data: rs } = await supabase.from("daily_reports")
      .select("biz_date, cash, card_gross, uri, other")
      .gte("biz_date", `${month}-01`).lte("biz_date", `${month}-31`);
    const { data: rk } = storeId
      ? await supabase.rpc("get_cast_ranking", { p_store_id: storeId, p_period: month })
      : { data: null };
    setAtts((at ?? []) as Att[]);
    setMonthSales(((rs ?? []) as ReportRow[]).reduce((a, r) => a + r.cash + r.card_gross + r.uri + r.other, 0));
    setRanking(((rk ?? []) as RankRow[]).slice(0, 5));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizToday, month, storeId]);

  useEffect(() => { void load(); }, [load]);

  const castName = (id: string) => casts.find((c) => c.id === id)?.name ?? "?";
  const present = atts.filter((a) => PRESENT.has(a.status));
  const dohanToday = atts.filter((a) => a.status === "dohan").length;
  const honMonth = ranking.reduce((a, r) => a + r.hon_count, 0);

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={t.pheadH1}>ホーム</h1>
      <p style={t.pheadP}>{storeName}・営業日 {bizToday}</p>

      {/* 段H: クイックアクション＝既存ルートへの純ナビ（役割ゲートは nav と同一・page で算出済み）。 */}
      {shortcuts.length > 0 && (
        <section style={{ marginTop: 14 }}>
          <h2 style={{ ...t.cardTitle, margin: "0 0 9px" }}>クイックアクション</h2>
          <div className="nox-quickgrid">
            {shortcuts.map((s) => (
              <Link key={s.href} href={s.href} className="nox-quicktile">{s.label}</Link>
            ))}
          </div>
        </section>
      )}

      <div style={{ ...t.kpiGrid, marginTop: 13 }}>
        <div style={t.kpi}>
          <div style={t.kpiLabel}>本日の出勤</div>
          <div style={t.kpiVal}>{present.length} <span style={{ fontSize: 13 }}>名</span></div>
        </div>
        <div style={t.kpi}>
          <div style={t.kpiLabel}>本日の同伴</div>
          <div style={t.kpiVal}>{dohanToday} <span style={{ fontSize: 13 }}>件</span></div>
        </div>
        <div style={t.kpi}>
          <div style={t.kpiLabel}>今月売上（締め済み日報）</div>
          <div style={t.kpiValGold}>{yen(monthSales)}</div>
        </div>
        <div style={t.kpi}>
          <div style={t.kpiLabel}>本指名（今月）</div>
          <div style={t.kpiVal}>{honMonth} <span style={{ fontSize: 13 }}>本</span></div>
        </div>
      </div>

      {/* 承認待ちドリンク申告（既存部品の再掲載＝0件なら部品側が非表示にする） */}
      <DrinkClaimQueue />

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>本日の出勤キャスト</h2>
        {present.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>まだ出勤記録がありません</p>}
        {present.map((a) => (
          <div key={a.cast_id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
            <span style={{ width: 140 }}>{castName(a.cast_id)}</span>
            <span style={{ color: a.status === "dohan" ? "var(--champ)" : "var(--ok)" }}>{ATT_LABEL[a.status] ?? a.status}</span>
            {a.eta && <span style={{ ...t.num, color: "var(--sub)" }}>見込み {a.eta}</span>}
          </div>
        ))}
      </section>

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>指名ランキング（{month}・件数）</h2>
        {ranking.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>データがありません</p>}
        {ranking.map((r) => (
          <div key={r.cast_id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
            <span style={{ ...t.num, width: 26, color: r.rank <= 3 ? "var(--champ)" : "var(--sub)", fontWeight: 700 }}>{r.rank}</span>
            <span style={{ width: 140 }}>{r.cast_name}</span>
            <span style={{ ...t.num, color: "var(--sub)" }}>本指名 {r.hon_count} ・ 場内 {r.jonai_count} ・ 同伴 {r.dohan_count}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
