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

export default function AuditBoard({ users, stores }: {
  users: { id: string; name: string }[]; stores: { id: string; name: string }[];
}) {
  const supabase = createClient();
  const [logs, setLogs] = useState<Log[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
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

        {logs.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>履歴はありません。</p>}
        {logs.map((l) => {
          const diffs = diffKeys(l.before_json, l.after_json);
          const isOpen = open === l.id;
          return (
            <div key={l.id} style={{ borderBottom: "1px solid var(--line)", padding: "7px 0", fontSize: 12.5 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}
                onClick={() => setOpen(isOpen ? null : l.id)}>
                <span style={{ ...t.num, color: "var(--sub)", width: 138 }}>{fmtAt(l.at)}</span>
                <span style={{ fontWeight: 700, width: 170 }}>{l.action}</span>
                <span style={{ color: "var(--sub)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.target}</span>
                <span style={{ width: 110 }}>{userName(l.actor_user_id)}</span>
                <span style={{ color: l.before_json === null ? "var(--ok)" : "var(--champ)", fontSize: 11.5, fontWeight: 700 }}>
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
