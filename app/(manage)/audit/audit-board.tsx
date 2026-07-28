"use client";

// 監査ログのボード（A1）。モック log 画面の翻訳＝「操作履歴（不正防止）・変更前→変更後」。
// audit_logs は append-only（UPDATE/DELETE ポリシー無し＝G6）・ここは読取のみ。
// 差分表示＝before/after の jsonb からキー単位で「変更されたものだけ」を出す
// （全文 JSON を並べると金額1つの修正が読めないため。新規＝before null は「新規作成」表示）。
// ページングは at 降順の単純 range（監査は直近確認が主用途・全量エクスポートは対象外）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Log = {
  id: string; store_id: string | null; actor_user_id: string | null; action: string; target: string;
  before_json: Record<string, unknown> | null; after_json: Record<string, unknown> | null; at: string; ip: string | null;
};

const PAGE = 50;
const card: React.CSSProperties = t.card;
const secTitle: React.CSSProperties = t.cardTitle;

// 変更キーの抽出（値の JSON 表現が異なるキーのみ・順序は after 側→before 固有の順）
function diffKeys(before: Record<string, unknown> | null, after: Record<string, unknown> | null): Array<[string, string, string]> {
  if (!before || !after) return [];
  const keys = [...new Set([...Object.keys(after), ...Object.keys(before)])];
  const out: Array<[string, string, string]> = [];
  for (const k of keys) {
    const b = JSON.stringify(before[k] ?? null);
    const a = JSON.stringify(after[k] ?? null);
    if (b !== a) out.push([k, b, a]);
  }
  return out;
}

const fmtAt = (iso: string) => iso.replace("T", " ").slice(0, 19);

// 段L2: 「操作系統」＝action 名の接頭辞による client 側の分類だけ（DB にカテゴリ列は無い・作らない）。
//   どれにも当たらない action は「その他」に入る＝取りこぼしても行が消えないようにする。
const KIND_DEFS: Array<[string, string, RegExp]> = [
  ["check", "会計系", /^(check_|drink_claim|receivable_|reservation_)/],
  ["payroll", "給与系", /^(payroll_|payslip|advance_|transport_)/],
  ["master", "設定系", /^(set_|store_|product_|seat_|notice_|staff_|cast_|trial_|kiosk_|stock_)/],
];
const kindOf = (action: string): string => KIND_DEFS.find(([, , re]) => re.test(action))?.[0] ?? "other";

export default function AuditBoard({ users, stores }: {
  users: { id: string; name: string }[]; stores: { id: string; name: string }[];
}) {
  const supabase = createClient();
  const [logs, setLogs] = useState<Log[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  // 段L2: 読み取り専用ビューの絞り込み（モック .atool）。★すべて client 側の絞り込みで、
  //   取得クエリ（range / order / action eq）は現行のまま＝RLS も owner/manager ゲートも非改変。
  const [kindFilter, setKindFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [targetQ, setTargetQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (p: number, action: string) => {
    let q = supabase.from("audit_logs")
      .select("id, store_id, actor_user_id, action, target, before_json, after_json, at, ip")
      .order("at", { ascending: false })
      .range(p * PAGE, p * PAGE + PAGE); // 1件余分に取って次ページ有無を判定
    if (action) q = q.eq("action", action);
    const { data } = await q;
    const rows = (data ?? []) as Log[];
    setHasMore(rows.length > PAGE);
    setLogs(rows.slice(0, PAGE));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(page, actionFilter); }, [page, actionFilter, load]);

  const userName = (id: string | null) => (id && users.find((u) => u.id === id)?.name) ?? (id ? id.slice(0, 8) : "—");
  const storeName = (id: string | null) => (id && stores.find((s) => s.id === id)?.name) ?? "—";
  // フィルタ候補は表示中ページの action から（専用マスタを持たない＝軽く）
  const actions = [...new Set(logs.map((l) => l.action))].sort();
  // 段L2: 表示行の絞り込み（取得済み logs に対してのみ＝情報量は現行と同一・増えも減りもしない）
  const shown = logs.filter((l) =>
    (kindFilter === "" || kindOf(l.action) === kindFilter) &&
    (dateFilter === "" || l.at.slice(0, 10) === dateFilter) &&
    (targetQ.trim() === "" || (l.target ?? "").toLowerCase().includes(targetQ.trim().toLowerCase())),
  );

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={t.pheadH1}>操作履歴（不正防止）</h1>
      <p style={t.pheadP}>金額・杯数の承認/修正・締め・マスタ変更などの操作が記録されます（追記専用・編集不可）</p>

      <section className="nox-cardtop" style={{ ...card, marginTop: 13 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ ...secTitle, margin: 0 }}>履歴</h2>
          <select value={actionFilter} onChange={(e) => { setPage(0); setActionFilter(e.target.value); }}
            style={{ ...t.input, width: "auto", padding: "6px 9px", fontSize: 12, marginLeft: "auto" }}>
            <option value="">全 action</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {/* 段L2: 操作系統／日付／対象 の絞り込み（モック .atool）。★client 側のみ＝取得も権限も現行のまま。 */}
        <div className="nox-atool">
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}
            style={{ ...t.input, width: "auto", padding: "6px 9px", fontSize: 12 }}>
            <option value="">すべての操作</option>
            {KIND_DEFS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            <option value="other">その他</option>
          </select>
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
            aria-label="日付で絞り込み" style={{ ...t.input, width: "auto", padding: "6px 9px", fontSize: 12 }} />
          <input value={targetQ} onChange={(e) => setTargetQ(e.target.value)} placeholder="対象で絞り込み"
            style={{ ...t.input, width: 180, padding: "6px 9px", fontSize: 12 }} />
          {(kindFilter || dateFilter || targetQ) && (
            <button style={{ ...t.btnGhost, ...t.btnSm }}
              onClick={() => { setKindFilter(""); setDateFilter(""); setTargetQ(""); }}>絞り込み解除</button>
          )}
        </div>

        {logs.length === 0 && <p style={{ fontSize: 13, color: "var(--v2-muted)" }}>履歴はありません。</p>}
        {logs.length > 0 && shown.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--v2-muted)" }}>この絞り込みに該当する履歴はありません（このページ内）。</p>
        )}
        {/* 段L2: 行を .nox-arow へ整理。★出す情報は現行と完全に同一
            （日時・action・対象・操作者・新規/変更項目数、開くと 店舗/IP と before→after 差分）。 */}
        {shown.map((l) => {
          const diffs = diffKeys(l.before_json, l.after_json);
          const isOpen = open === l.id;
          return (
            <div key={l.id} style={{ borderBottom: "1px solid var(--v2-line)", padding: "7px 0", fontSize: 12.5 }}>
              <div className="nox-arow" style={{ cursor: "pointer", border: 0, padding: 0 }}
                onClick={() => setOpen(isOpen ? null : l.id)}>
                <span className="tm num">{fmtAt(l.at)}</span>
                <span className="act">{l.action}</span>
                <span className="tgt" style={{ flex: 1 }}>{l.target}</span>
                <span style={{ flex: "0 0 96px", color: "var(--v2-text)" }}>{userName(l.actor_user_id)}</span>
                <span style={{ color: l.before_json === null ? "var(--ok)" : "var(--gold2)", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {l.before_json === null ? "新規" : `変更 ${diffs.length}項目`}
                </span>
              </div>
              {isOpen && (
                <div style={{ margin: "4px 0 2px 148px", fontSize: 12 }}>
                  <div style={{ margin: "0 0 4px", color: "var(--sub)" }}>
                    店舗 {storeName(l.store_id)}{l.ip ? ` ・ IP ${l.ip}` : ""}
                  </div>
                  {l.before_json === null ? (
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--ink)", fontSize: 11.5, background: "var(--card2)", borderRadius: 8, padding: 8 }}>
                      {JSON.stringify(l.after_json, null, 1)}
                    </pre>
                  ) : diffs.length === 0 ? (
                    <p style={{ margin: 0, color: "var(--sub)" }}>値の変更なし（同値上書き）</p>
                  ) : (
                    diffs.map(([k, b, a]) => (
                      <div key={k} style={{ padding: "2px 0" }}>
                        <b>{k}</b>：<span style={{ color: "var(--bad)" }}>変更前: {b}</span>
                        <span style={{ color: "var(--sub)" }}> → </span>
                        <span style={{ color: "var(--ok)" }}>変更後: {a}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={{ ...t.btnGhost, ...t.btnSm }} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← 新しい方</button>
          <span style={{ fontSize: 12, color: "var(--sub)", alignSelf: "center" }}>ページ {page + 1}</span>
          <button style={{ ...t.btnGhost, ...t.btnSm }} disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>古い方 →</button>
        </div>
      </section>
    </div>
  );
}
