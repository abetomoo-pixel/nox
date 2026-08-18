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
// 段0R 第3陣: 器は共通クラス nox-panel・見出しは nox-panel > h3（白）へ統一＝card/secTitle は撤去。

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

// E8-5 audit#1/#5: 用途別ビュー＝action の明示リスト（mig の audit_log_write 呼び出しを列挙して定義）。
//   ★DB に系統列は無い・作らない（audit#3 不採用と同じ理由＝現行 audit_logs で足りる）。
//   リスト外の新 action は「すべて」ビューには必ず出る＝取りこぼしで行が消えることはない。
const VIEW_DEFS: Array<{ key: string; label: string; actions: string[] | null }> = [
  { key: "all", label: "すべて", actions: null },
  {
    key: "cancel", label: "取消・巻き戻し",
    actions: [
      "check_void", "check_remove_line", "drink_claim_void", "drink_claim_void_by_line_delete",
      "drink_claim_reject", "adv_cancel", "transport_cancel", "incentive_cancel",
      "daily_report_reclose", "payroll_reopen", "shift_wish_withdraw", "trial_reject",
    ],
  },
  {
    key: "sensitive", label: "機微アクセス",
    actions: ["read_cast_sensitive", "read_cast_mynumber_masked", "cast_create_sensitive"],
  },
  {
    key: "perm", label: "権限・端末",
    actions: [
      "staff_change_role", "staff_create", "staff_deactivate", "staff_reactivate", "staff_transfer_store",
      "cast_invite", "kiosk_provision", "kiosk_deactivate", "set_store_cast_register",
    ],
  },
];

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
  // E8-5 audit#1/#5: 用途別ビュー（server 側 in フィルタ）＋ audit#2 KPI（当日 count）
  const [view, setView] = useState("all");
  const [kpi, setKpi] = useState<{ total: number; cancel: number; sensitive: number; perm: number } | null>(null);

  const load = useCallback(async (p: number, action: string, viewKey: string) => {
    let q = supabase.from("audit_logs")
      .select("id, store_id, actor_user_id, action, target, before_json, after_json, at, ip")
      .order("at", { ascending: false })
      .range(p * PAGE, p * PAGE + PAGE); // 1件余分に取って次ページ有無を判定
    if (action) q = q.eq("action", action);
    const v = VIEW_DEFS.find((x) => x.key === viewKey);
    if (v?.actions) q = q.in("action", v.actions);
    const { data } = await q;
    const rows = (data ?? []) as Log[];
    setHasMore(rows.length > PAGE);
    setLogs(rows.slice(0, PAGE));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(page, actionFilter, view); }, [page, actionFilter, view, load]);

  // E8-5 audit#2（T1）: 当日 KPI＝audit_logs の count のみ（JST の日付境界・head クエリ4本・表示専用）
  useEffect(() => {
    let alive = true;
    void (async () => {
      const jstDay = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
      const since = `${jstDay}T00:00:00+09:00`;
      const cnt = async (actions: string[] | null) => {
        let q = supabase.from("audit_logs").select("id", { count: "exact", head: true }).gte("at", since);
        if (actions) q = q.in("action", actions);
        const { count } = await q;
        return count ?? 0;
      };
      const [total, cancel, sensitive, perm] = await Promise.all([
        cnt(null),
        cnt(VIEW_DEFS[1].actions), cnt(VIEW_DEFS[2].actions), cnt(VIEW_DEFS[3].actions),
      ]);
      if (alive) setKpi({ total, cancel, sensitive, perm });
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div>
      {/* 段0R 第3陣: ヘッダを新シェルの nox-hero へ（他画面と同基準・表示のみ） */}
      <div className="nox-hero">
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 8px", fontWeight: 700 }}>操作履歴</h1>
          <p style={{ margin: 0, color: "var(--sub)", fontSize: 14 }}>
            金額・杯数の承認/修正・締め・マスタ変更などの操作が記録されます（追記専用・編集不可）。
          </p>
        </div>
      </div>

      {/* E8-5 audit#2（T1）: 当日 KPI 4枚（audit_logs count・表示専用） */}
      {kpi && (
        <div className="nox-repsum">
          <div className="nox-rs"><div className="l">本日の記録</div><div className="v num">{kpi.total}件</div></div>
          <div className="nox-rs"><div className="l">取消・巻き戻し</div><div className="v num" style={kpi.cancel > 0 ? { color: "var(--bad)" } : undefined}>{kpi.cancel}件</div></div>
          <div className="nox-rs"><div className="l">機微アクセス</div><div className="v num">{kpi.sensitive}件</div></div>
          <div className="nox-rs"><div className="l">権限・端末</div><div className="v num">{kpi.perm}件</div></div>
        </div>
      )}
      {/* E8-5 audit#1/#5: 用途別ビュータブ（action 明示リストの server フィルタ・切替でページ先頭へ） */}
      <div className="nox-seg" style={{ marginBottom: 12 }}>
        {VIEW_DEFS.map((v) => (
          <button key={v.key} className={view === v.key ? "on" : ""}
            onClick={() => { setView(v.key); setPage(0); setActionFilter(""); }}>{v.label}</button>
        ))}
      </div>

      <section className="nox-panel">
        <h3>
          履歴
          <select value={actionFilter} onChange={(e) => { setPage(0); setActionFilter(e.target.value); }}
            aria-label="action で絞り込み"
            style={{ ...t.input, width: "auto", padding: "6px 9px", fontSize: 12, marginLeft: "auto", fontWeight: 400 }}>
            {/* 段0R 第3陣: 文言のみ＝下の「操作系統」セレクトと役割を見分けられるようにする
                （こちらは取得クエリ側＝個別 action 名で DB から絞る。state も経路も不変）。 */}
            <option value="">action で絞り込み</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </h3>
        {/* 段L2: 操作系統／日付／対象 の絞り込み（モック .atool）。★client 側のみ＝取得も権限も現行のまま。 */}
        <div className="nox-atool">
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}
            style={{ ...t.input, width: "auto", padding: "6px 9px", fontSize: 12 }}>
            {/* 段0R 第3陣: 文言のみ＝上の action セレクトとの違い（適用範囲）を明記。
                こちらは取得済みページに対する client 側の系統絞り込み（判定も経路も不変）。 */}
            <option value="">操作系統（表示中のページ）</option>
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
