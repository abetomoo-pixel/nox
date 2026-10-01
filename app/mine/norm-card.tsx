"use client";

// /mine ノルマ進捗カード（mig0042→★0160 cast_quotas・裁定326-3・便 M2-1・2026-10-01）。
//   データは /api/mine/norm-progress（cast 本人 self ガード・当月・quota＝cast_quotas の当月行・actual＝get_cast_sales の月合算）。
//   cast 本人の「目標を設定」は廃止（set_cast_norm_self は 0160 で drop）＝店が /casts で設定する。未設定＝文言のみ。
//   項目ごとに「実績／目標・達成率 %」・達成でゴールド強調（減額文言や警告色は出さない＝報酬非接続）。
//   店の sys_norms OFF は /mine 側の isSectionOn("mineNormCard") で本カードごと非マウント（裁定269-4・据え置き）。
import { useEffect, useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import { QUOTA_EMPTY_NOTE, QUOTA_PROGRESS_NOTE, quotaAxesOf, quotaFmt, type Quota, type QuotaActual } from "@/lib/nox/mine/quota";

type NormProgress = { period: string; quota: Partial<Quota> | null; actual: QuotaActual };

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
  const axes = quotaAxesOf(data.quota, data.actual);

  return (
    <section className="nox-panel">
      <h3>今月のノルマ進捗（{data.period}）</h3>
      {axes.length === 0 && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "6px 0 0" }}>{QUOTA_EMPTY_NOTE}</p>}
      {axes.map((a) => (
        <div key={a.key} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 700 }}>{a.label}</span>
            <span style={{ ...t.num, marginLeft: "auto" }}>
              {quotaFmt(a.key, a.actual)} <span style={{ color: "var(--sub)" }}>/ {quotaFmt(a.key, a.target)}</span>
              <span style={{ marginLeft: 8, fontWeight: 700, color: a.done ? "var(--gold)" : "var(--ink)" }}>{a.rate}%</span>
            </span>
            {a.done && (
              <span style={{
                fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
                color: "var(--gold)", background: "var(--card2)", border: "1px solid var(--line2)", whiteSpace: "nowrap",
              }}>達成</span>
            )}
          </div>
          <div style={{ height: 6, borderRadius: 999, background: "var(--line2)", marginTop: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${a.pct}%`, borderRadius: 999, background: "linear-gradient(135deg, var(--gold2), var(--gold3))" }} />
          </div>
        </div>
      ))}
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "6px 0 0" }}>{QUOTA_PROGRESS_NOTE}</p>
    </section>
  );
}
