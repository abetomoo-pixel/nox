"use client";

// ★便 D M-101（2026-11-05・相談役）: LINE の送信数カード＝店舗設定 › LINE 連携の「月の送信上限」「今月の送信数」「着地見込み」を 1 枚の部品にしてホームとお知らせ画面（一覧の上）に置く。
//   見た目＝TRACOS のダッシュボードと同型（見出し／小文字／大きな数／2 色の横バー／凡例／注記 1 行）。材料は LINE 連携タブと同じ＝stores.line_config・line_monthly_limit・line_push_month_summary（JST 暦月）。
//   LINE 未設定（通知不可）の店＝カードの代わりに「LINE 連携を設定する」の 1 行（店長以上）。90% 以上・上限超え・429 は注意色。読取だけ（RPC・DB 不変）。
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { lineConfiguredOf, lineLimitLabelOf, type LineConfig } from "@/lib/nox/line/liff-endpoint";
import { LINE_QUOTA_KINDS_NOTE, jstMonthOf, lineQuotaViewOf, lineStatusTextOf, type LineMonthRow } from "@/lib/nox/line/push-forecast";
import { LINE_PLAN_UPGRADE_NOTE } from "@/lib/nox/line/notify-kinds"; // ★M-114（裁定459）
import * as t from "@/lib/nox/ui/theme";

export default function LineQuotaCard({ storeId, compact = false }: { storeId: string | null; /** お知らせ画面＝余白を詰める */ compact?: boolean }) {
  const supabase = createClient();
  const [cfg, setCfg] = useState<LineConfig | null | undefined>(undefined);
  const [limit, setLimit] = useState(200);
  const [month, setMonth] = useState<LineMonthRow | null>(null);
  useEffect(() => {
    if (!storeId) { setCfg(null); return; }
    let alive = true;
    void (async () => {
      const { data: s } = await supabase.from("stores").select("line_config, line_monthly_limit").eq("id", storeId).maybeSingle();
      const { data: m } = await supabase.rpc("line_push_month_summary", { p_month: jstMonthOf(Date.now()).month });
      if (!alive) return;
      setCfg(((s?.line_config ?? {}) as LineConfig)); setLimit(Number(s?.line_monthly_limit ?? 200));
      setMonth((((m ?? []) as LineMonthRow[]).find((r) => r.store_id === storeId)) ?? null);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  if (cfg === undefined || !storeId) return null;
  const pad = compact ? "12px 14px" : "14px 16px";
  if (!lineConfiguredOf(cfg)) {
    return (
      <section className="nox-cardtop" style={{ ...t.card, padding: pad, marginBottom: compact ? 10 : 14 }} data-line-quota="unset">
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--sub)" }}>LINE の通知はまだ使えません。<Link href="/master/store-profile?tab=line" className="nox-link">LINE 連携を設定する</Link></p>
      </section>
    );
  }
  const jm = jstMonthOf(Date.now());
  const v = lineQuotaViewOf({ sent: month?.sent ?? 0, limit: month?.monthly_limit ?? limit, rejected429: month?.rejected_429 ?? 0, month: jm.month, dayOfMonth: jm.dayOfMonth, daysInMonth: jm.daysInMonth });
  const bar = v.warn ? "var(--bad)" : "var(--gold2)";
  const statusText = month ? lineStatusTextOf(v.status, month.monthly_limit, month.rejected_429) : "";
  return (
    <section className="nox-cardtop" style={{ ...t.card, padding: pad, marginBottom: compact ? 10 : 14 }} data-line-quota={v.warn ? "warn" : "ok"} data-line-quota-sent={month?.sent ?? 0} data-line-quota-forecast={v.forecast}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ ...t.cardTitle, margin: 0 }}>{v.title}</h3>
        <span style={{ fontSize: 11, color: "var(--sub)" }}>上限 {lineLimitLabelOf(month?.monthly_limit ?? limit)}</span>
      </div>
      <p style={{ margin: "2px 0 8px", fontSize: 11, color: "var(--sub)" }}>無料枠は月 200 通。こちらから送るメッセージ（プッシュ）だけが数えられます。</p>
      <p className="num" style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, letterSpacing: 0.2, color: v.warn ? "var(--bad)" : "var(--ink)" }} data-line-quota-big="1">{v.big}</p>
      <div aria-hidden style={{ position: "relative", height: 10, borderRadius: 999, background: "var(--card2)", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, width: `${v.forecastPct}%`, background: bar, opacity: 0.3 }} />
        <div style={{ position: "absolute", inset: 0, width: `${v.sentPct}%`, background: bar }} />
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--sub)" }} data-line-quota-legend="1">
        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: bar, verticalAlign: -1, marginRight: 4 }} />送信済み {(month?.sent ?? 0).toLocaleString()} 通
        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: bar, opacity: 0.3, verticalAlign: -1, margin: "0 4px 0 10px" }} />月末の着地見込み {v.forecast.toLocaleString()} 通
      </p>
      {statusText && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--bad)", fontWeight: 700 }}>{statusText}</p>}
      <p style={{ margin: "6px 0 0", fontSize: 10.5, color: "var(--v2-muted)" }}>{LINE_QUOTA_KINDS_NOTE}</p>
      <p style={{ margin: "4px 0 0", fontSize: 10.5, color: "var(--v2-muted)" }} data-line-quota-plan="1">{LINE_PLAN_UPGRADE_NOTE}</p>{/* ★M-114（裁定459）: 無料枠を超える店の案内 1 行 */}
    </section>
  );
}
