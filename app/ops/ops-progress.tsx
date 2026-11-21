// ★2026-11-21 夜（相談役 18:40 の 2c）: 導入の状況の札（済・途中・未）。詳細の一番上（次にすること＋項目ごとの札）と一覧（会社ごとの札の列）で同じ判定（lib/nox/ops/labels の opsProgressOf）。
import * as t from "@/lib/nox/ui/theme";
import { fmtJst, OPS_STEP_STATE_LABEL, opsNextStepOf, opsProgressOf, type OpsOrgRow, type OpsStepState } from "@/lib/nox/ops/labels";

const pillClass = (s: OpsStepState) => (s === "done" ? "nox-stpill ok" : s === "doing" ? "nox-stpill warn" : "nox-stpill");

export function OpsStepPill({ state }: { state: OpsStepState }) {
  return <span className={pillClass(state)} data-ops-step-state={state}>{OPS_STEP_STATE_LABEL[state]}</span>;
}

/** 詳細の一番上のカード */
export function OpsProgressCard({ row, now }: { row: OpsOrgRow; now: Date }) {
  const items = opsProgressOf(row, now);
  return (
    <section style={{ ...t.card, marginBottom: 12 }} aria-label="導入の状況" data-ops-progress="1">
      <h2 style={{ ...t.cardTitle, margin: "0 0 8px" }}>導入の状況</h2>
      <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--ink)", lineHeight: 1.6 }} data-ops-next="1">次にすること：{opsNextStepOf(items)}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
        {items.map((it) => (
          <li key={it.key} data-ops-step={it.key} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px", alignItems: "baseline" }}>
            <OpsStepPill state={it.state} />
            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>{it.name}{it.ago && <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--sub)", marginLeft: 8 }} data-ops-step-ago="1">{it.ago}</span>}</span>
            <span />
            <span style={{ fontSize: 12.5, color: "var(--sub)", lineHeight: 1.6, overflowWrap: "anywhere" }}>{it.detail}</span>
          </li>
        ))}
      </ul>
      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 12px", margin: "12px 0 0", fontSize: 13 }}>
        <dt style={t.sub}>店の数</dt><dd style={{ margin: 0 }}>{row.store_count}</dd>
        <dt style={t.sub}>最後に使われた時刻</dt><dd style={{ margin: 0 }}>{fmtLast(row.last_used_at)}</dd>
        <dt style={t.sub}>お試しの期限</dt><dd style={{ margin: 0 }}>{row.kind === "tester" ? "期限なし" : row.kind === "trial" ? fmtDay(row.trial_ends_at) : "—"}</dd>
      </dl>
    </section>
  );
}

/** 一覧の会社ごとの札（項目の短い名前＋札） */
export function OpsProgressPills({ row }: { row: OpsOrgRow }) {
  const items = opsProgressOf(row, new Date(0)); // 一覧は「何日前」を出さない＝今の時刻を使わない（描画のずれを作らない）
  const short: Record<string, string> = { owner: "受諾", setup: "初期設定", line: "LINE", people: "キャスト", onboarding: "導入" };
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px 8px" }} data-ops-pills={row.org_id}>
      {items.map((it) => (
        <span key={it.key} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--ink)", whiteSpace: "nowrap" }} data-ops-pill={it.key}>
          {short[it.key]}<OpsStepPill state={it.state} />
        </span>
      ))}
    </span>
  );
}

const fmtLast = (iso: string | null) => fmtJst(iso);
const fmtDay = (iso: string | null) => fmtJst(iso, false);
