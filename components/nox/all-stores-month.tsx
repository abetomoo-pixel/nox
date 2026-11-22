"use client";

// ★0203（2 号店の段 2・相談役 21:40 の ■2-f）: 月報の「全店の合計」＝日報（daily_reports）の現金・カード・売掛・その他を店ごとと全店で足す（読むだけ・新しい関数なし・お金の式に触れない）。
//   2 店以上の owner だけ（出すかは呼び出し側）。owner の RLS は会社の全店が見える。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { monthLastDayOf } from "@/lib/nox/month";

type Sum = { cash: number; card: number; uri: number; other: number; days: number };
const zero = (): Sum => ({ cash: 0, card: 0, uri: 0, other: 0, days: 0 });
const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

export default function AllStoresMonth({ stores, period }: { stores: { id: string; name: string }[]; period: string }) {
  const [by, setBy] = useState<Map<string, Sum> | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return;
      const { data } = await createClient().from("daily_reports").select("store_id, cash, card_gross, uri, other").gte("biz_date", `${period}-01`).lte("biz_date", monthLastDayOf(period));
      const m = new Map<string, Sum>();
      for (const r of (data ?? []) as { store_id: string; cash: number | null; card_gross: number | null; uri: number | null; other: number | null }[]) {
        const s = m.get(r.store_id) ?? zero(); s.cash += r.cash ?? 0; s.card += r.card_gross ?? 0; s.uri += r.uri ?? 0; s.other += r.other ?? 0; s.days += 1; m.set(r.store_id, s);
      }
      if (alive) setBy(m);
    })();
    return () => { alive = false; };
  }, [period]);
  if (!by) return null;
  const all = stores.reduce((a, s) => { const x = by.get(s.id) ?? zero(); return { cash: a.cash + x.cash, card: a.card + x.card, uri: a.uri + x.uri, other: a.other + x.other, days: a.days + x.days }; }, zero());
  const row = (name: string, s: Sum, bold = false) => (
    <tr key={name} style={bold ? { fontWeight: 800 } : undefined}><td>{name}</td><td className="num">{yen(s.cash + s.card + s.uri + s.other)}</td><td className="num">{yen(s.cash)}</td><td className="num">{yen(s.card)}</td><td className="num">{yen(s.uri)}</td><td className="num">{s.days}</td></tr>);
  return (
    <div className="nox-inset" style={{ padding: "10px 12px", margin: "0 0 12px" }} data-all-stores-month={period}>
      <b style={{ fontSize: 13.5 }}>全店の合計（{period}・日報の合計）</b>
      <div className="nox-tablewrap"><table className="nox-table" style={{ width: "100%", fontSize: 12.5 }}>
        <thead><tr><th>店</th><th>売上</th><th>現金</th><th>カード</th><th>売掛</th><th>日報の日数</th></tr></thead>
        <tbody>{stores.map((s) => row(s.name, by.get(s.id) ?? zero()))}{row("全店", all, true)}</tbody>
      </table></div>
    </div>
  );
}
