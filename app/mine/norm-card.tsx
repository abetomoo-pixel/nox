"use client";

// /mine ノルマ進捗カード（mig0042・表示のみ裁定）。
// データは /api/mine/norm-progress（cast 本人 self ガード・当月・payroll と同一の集計定義）。
// 出し分け: 店フラグ off の軸（売上/指名）は非表示・target=0 の軸も非表示・全軸非表示ならカード自体を出さない。
// 演出は進捗のみ（達成でゴールド強調・未達でも罰金文言や警告色は出さない＝罰金非接続の裁定）。
import { useEffect, useState } from "react";
import * as t from "@/lib/nox/ui/theme";

type NormProgress = {
  period: string;
  flags: { sales_norm_enabled: boolean; shimei_norm_enabled: boolean; shimei_norm_scope: "hon" | "hon_jonai" };
  targets: { days: number; dohan: number; sales: number; shimei: number };
  actual: { days: number; dohan: number; sales: number; shimei: number; hon: number; jonai: number };
};

const yen = (n: number) => "¥" + n.toLocaleString();

export default function NormCard() {
  const [data, setData] = useState<NormProgress | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/mine/norm-progress")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setData(j); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, []);

  if (!data) return null; // 読込中/取得失敗はカードごと出さない（進捗は補助情報）

  type Axis = { label: string; actual: number; target: number; fmt: (n: number) => string };
  const axes: Axis[] = [];
  const cnt = (n: number) => String(n);
  if (data.targets.days > 0) axes.push({ label: "出勤日数", actual: data.actual.days, target: data.targets.days, fmt: cnt });
  if (data.targets.dohan > 0) axes.push({ label: "同伴", actual: data.actual.dohan, target: data.targets.dohan, fmt: cnt });
  if (data.flags.sales_norm_enabled && data.targets.sales > 0)
    axes.push({ label: "売上", actual: data.actual.sales, target: data.targets.sales, fmt: yen });
  if (data.flags.shimei_norm_enabled && data.targets.shimei > 0)
    axes.push({
      label: data.flags.shimei_norm_scope === "hon_jonai" ? "指名（場内＋本指名）" : "指名（本指名）",
      actual: data.actual.shimei, target: data.targets.shimei, fmt: cnt,
    });

  if (axes.length === 0) return null;

  const title: React.CSSProperties = t.cardTitle;

  return (
    <section className="nox-cardtop" style={t.card}>
      <h2 style={title}>今月のノルマ進捗（{data.period}）</h2>
      {axes.map((a) => {
        const pct = Math.min(100, Math.floor((a.actual / a.target) * 100));
        const done = a.actual >= a.target;
        return (
          <div key={a.label} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>{a.label}</span>
              <span style={{ ...t.num, marginLeft: "auto" }}>
                {a.fmt(a.actual)} <span style={{ color: "var(--sub)" }}>/ {a.fmt(a.target)}</span>
              </span>
              {done && (
                <span style={{
                  fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
                  color: "#C9A24A", background: "#23232B", border: "1px solid var(--line2)", whiteSpace: "nowrap",
                }}>達成</span>
              )}
            </div>
            <div style={{ height: 6, borderRadius: 999, background: "var(--line2)", marginTop: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`, borderRadius: 999,
                background: "linear-gradient(135deg, var(--gold2), #B8893A)",
              }} />
            </div>
          </div>
        );
      })}
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "6px 0 0" }}>
        ※進捗の目安表示です（当月の営業日集計・確定値は給与明細が正）。
      </p>
    </section>
  );
}
