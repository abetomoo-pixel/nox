"use client";

// 監査ログのボード（A1）。モック log 画面の翻訳＝「操作履歴（不正防止）・変更前→変更後」。
// audit_logs は append-only（UPDATE/DELETE ポリシー無し＝G6）・ここは読取のみ。
// 差分表示＝before/after の jsonb からキー単位で「変更されたものだけ」を出す
// （全文 JSON を並べると金額1つの修正が読めないため。新規＝before null は「新規作成」表示）。
// ページングは at 降順の単純 range（監査は直近確認が主用途・全量エクスポートは対象外）。
import { useCallback, useEffect, useState } from "react";
import PageHead from "@/components/ui/page-head";
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
// ★DP-R 第4弾: 金額表示（負値も符号つきで出す＝実査差は負が意味を持つ）
const yen = (n: number) => (n < 0 ? "−¥" + Math.abs(n).toLocaleString() : "¥" + n.toLocaleString());

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

// ★DP-R 第4弾（教訓26＝構造照合）: モック nox-audit-management の**上位4タブ**。
//   モックは「操作履歴／会計・現金監査／権限・機微情報／出力・保管」の4面に12カードを配る。
//   ★既存の VIEW_DEFS（すべて／取消・巻き戻し／機微アクセス／権限・端末）は
//     **操作履歴タブの中のフィルタ**として据え置く＝取得クエリも action リストも1文字も変えない。
const PAGE_TABS: Array<[string, string]> = [
  ["logs", "操作履歴"], ["cash", "会計・現金監査"], ["perm", "権限・機微情報"], ["export", "出力・保管"],
];

// ★DP-R 第4弾: 日報・現金照合カードの行（mig0010 daily_reports の実列のみ）。
//   diff = counted_cash −（cash_float + cash − expense − cash_payout）＝DB が持つ確定値をそのまま出す
//   （画面側で数え直さない＝日報の正本は締め時のサーバ再集計）。
type DailyRow = {
  biz_date: string; cash: number; cash_float: number; expense: number; cash_payout: number;
  counted_cash: number | null; diff: number | null; closed_by: string; reclosed_count: number;
  uri: number; card_gross: number; other: number;
};

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
  // ★DP-R 第4弾: 上位4タブ（モック）。既存 view はこのうち「操作履歴」タブ内のフィルタ。
  const [ptab, setPTab] = useState("logs");
  // ★DP-R 第4弾: 日報・現金照合（daily_reports の直 SELECT・RLS は owner/manager 自店）。
  //   ★audit_logs の取得系（load / KPI の head クエリ）には一切触っていない＝別系統の読みを1本足しただけ。
  const [daily, setDaily] = useState<DailyRow[] | null>(null);
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

  // 会計・現金監査タブを最初に開いたときだけ読む（既定タブでは読まない＝無駄な往復を作らない）
  useEffect(() => {
    if (ptab !== "cash" || daily !== null) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("daily_reports")
        .select("biz_date, cash, cash_float, expense, cash_payout, counted_cash, diff, closed_by, reclosed_count, uri, card_gross, other")
        .order("biz_date", { ascending: false }).limit(14);
      if (alive) setDaily((data ?? []) as DailyRow[]);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptab]);

  // 実査差の集計（daily_reports の確定値の合計のみ＝画面で数え直さない）
  const diffAll = (daily ?? []).reduce((x, d) => x + (d.diff ?? 0), 0);
  const diff7 = daily === null ? null : (daily.slice(0, 7).reduce((x, d) => x + (d.diff ?? 0), 0));

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
      <PageHead eyebrow="AUDIT & COMPLIANCE" title="監査・操作履歴"
        desc="会計・権限・機微情報へのアクセスを、変更前後を含めて追跡します。" />

      {/* ★DP-R 第4弾: 改ざん防止バナー（モック冒頭）。**事実の表記のみ**＝audit_logs は
          INSERT/UPDATE/DELETE ポリシーを持たず、書込は audit_log_write（内部専用・4ロール revoke）
          だけ＝画面や API から編集・削除する経路が存在しない。
          ★モックの「完全性チェック済み 15:58」は**出さない**＝ハッシュチェーンは裁定で不採用確定
            （audit#3）＝存在しない検証を「済み」と表示しない。 */}
      <div className="nox-alert" style={{ lineHeight: 1.8 }}>
        <b>監査記録は編集・削除できません。</b>
        すべての操作は発生順に記録され、訂正も新しい記録として残ります
        （書き込み経路は内部関数のみ・画面からの更新・削除はできません）。
      </div>

      {/* ★DP-R 第4弾: KPI 帯（モックは5枚）。E8-5 audit#2 の4枚＋「現金実査差（直近7日）」。
          ★モックの「要確認」は**出さない**＝audit_logs に確認フラグの列が無い（＝未確認件数を数えられない）。
            代わりに実体のある5枚目として実査差を置く（daily_reports.diff の合計・会計・現金監査タブで内訳）。 */}
      {kpi && (
        <div className="nox-repsum five">
          <div className="nox-rs"><div className="l">本日の記録</div><div className="v num">{kpi.total}件</div></div>
          <div className="nox-rs"><div className="l">取消・巻き戻し</div><div className="v num" style={kpi.cancel > 0 ? { color: "var(--bad)" } : undefined}>{kpi.cancel}件</div></div>
          <div className="nox-rs"><div className="l">機微アクセス</div><div className="v num">{kpi.sensitive}件</div></div>
          <div className="nox-rs"><div className="l">権限・端末</div><div className="v num">{kpi.perm}件</div></div>
          <div className="nox-rs">
            <div className="l">現金実査差（直近7日）</div>
            <div className="v num" style={diff7 !== null && diff7 !== 0 ? { color: "var(--bad)" } : undefined}>
              {diff7 === null ? "—" : yen(diff7)}
            </div>
          </div>
        </div>
      )}

      {/* ★DP-R 第4弾: 上位4タブ（モック逐語）。中身のカードをこの4面に配る。 */}
      <div className="nox-seg" style={{ marginBottom: 12 }}>
        {PAGE_TABS.map(([k, label]) => (
          <button key={k} className={ptab === k ? "on" : ""} onClick={() => setPTab(k)}>{label}</button>
        ))}
      </div>

      {ptab === "logs" && (
      <>
      {/* ★DP-R 第4弾: モックの要確認アラート帯（高額伝票の取消・営業時間外の機微情報閲覧）。
          ★実体が無い＝audit_logs に「確認済み」フラグも金額しきい値の設定も無く、
            営業時間外かどうかを判定する保存値も持たない＝**件数も一覧も作れない**。
            器だけ置いて準備中と明記する（教訓25）。 */}
      <section className="nox-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>要確認のアラート</h3>
          <span className="nox-stpill" style={{ marginLeft: "auto" }}>準備中</span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.8 }}>
          高額伝票の取消や営業時間外の機微情報閲覧を自動で拾い上げる機能は<b>準備中</b>です
          （確認済みの印・金額のしきい値・営業時間外の判定を保存する場所がまだありません）。
          現在は下の一覧を「取消・巻き戻し」「機微アクセス」で絞って確認してください。
        </p>
      </section>
      {/* E8-5 audit#1/#5: 用途別ビュー（action 明示リストの server フィルタ・切替でページ先頭へ）＝
          モックの4タブとは別軸（こちらは履歴の絞り込み）。取得クエリも action リストも不変。 */}
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
            <div key={l.id} style={{ borderBottom: "1px solid var(--v2-line)", padding: "7px 0", fontSize: 12.5,
              /* ★DP-R: 詳細を別カードへ出すようにしたので、選択中の行がどれか分かるようにする */
              background: isOpen ? "var(--goldface2)" : undefined }}>
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
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={{ ...t.btnGhost, ...t.btnSm }} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← 新しい方</button>
          <span style={{ fontSize: 12, color: "var(--sub)", alignSelf: "center" }}>ページ {page + 1}</span>
          <button style={{ ...t.btnGhost, ...t.btnSm }} disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>古い方 →</button>
        </div>
      </section>

      {/* ★DP-R 第4弾: 記録の詳細（モックの独立カード）。従来は行内に展開していたが、
          モックは「操作履歴」と「記録の詳細」を別カードに分ける＝構造照合に合わせて分離した。
          ★出す情報は行内展開と同一（店舗・IP・変更前→変更後）＋モックにある実体のある項目
            （実行日時・実行者・対象・記録ID）。取得系は1文字も触っていない。 */}
      <section className="nox-panel">
        <h3>記録の詳細</h3>
        <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "-4px 0 10px" }}>選択した操作の完全な記録</p>
        {(() => {
          const l = logs.find((x) => x.id === open);
          if (!l) return <p style={{ fontSize: 13, color: "var(--sub)" }}>上の一覧から行をクリックすると、ここに詳細が出ます。</p>;
          const diffs = diffKeys(l.before_json, l.after_json);
          return (
            <>
              <div className="nox-listrow"><span style={{ flex: 1 }}>実行日時</span><b className="num">{fmtAt(l.at)}</b></div>
              <div className="nox-listrow"><span style={{ flex: 1 }}>実行者</span><b>{userName(l.actor_user_id)}</b></div>
              <div className="nox-listrow"><span style={{ flex: 1 }}>操作</span><b>{l.action}</b></div>
              <div className="nox-listrow"><span style={{ flex: 1 }}>対象</span><b>{l.target ?? "—"}</b></div>
              <div className="nox-listrow"><span style={{ flex: 1 }}>店舗 / IP</span><b>{storeName(l.store_id)}{l.ip ? ` ・ ${l.ip}` : ""}</b></div>
              <div style={{ margin: "10px 0 0" }}>
                <span style={{ fontSize: 11.5, color: "var(--sub)", fontWeight: 700 }}>変更内容</span>
                {l.before_json === null ? (
                  <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--ink)", fontSize: 11.5, background: "var(--card2)", borderRadius: 8, padding: 8 }}>
                    {JSON.stringify(l.after_json, null, 1)}
                  </pre>
                ) : diffs.length === 0 ? (
                  <p style={{ margin: "6px 0 0", color: "var(--sub)", fontSize: 12 }}>値の変更なし（同値上書き）</p>
                ) : (
                  diffs.map(([k, b2, a2]) => (
                    <div key={k} style={{ padding: "2px 0", fontSize: 12 }}>
                      <b>{k}</b>：<span style={{ color: "var(--bad)" }}>変更前: {b2}</span>
                      <span style={{ color: "var(--sub)" }}> → </span>
                      <span style={{ color: "var(--ok)" }}>変更後: {a2}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="nox-listrow" style={{ marginTop: 8 }}>
                <span style={{ flex: 1 }}>記録ID</span>
                <b className="num" style={{ fontSize: 11 }}>{l.id}</b>
              </div>
              <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.7 }}>
                ※モックの「操作理由」「端末」「要確認にする」は<b>準備中</b>です
                （audit_logs に理由・端末・確認フラグの列がありません）。
              </p>
            </>
          );
        })()}
      </section>
      </>
      )}

      {/* ══ タブ2: 会計・現金監査（モック「締め済み日報 KPI」＋「日報・現金照合」＋「取消・返金・値引き」）══ */}
      {ptab === "cash" && (
      <>
        {daily === null ? (
          <p style={{ fontSize: 13, color: "var(--sub)" }}>読み込み中…</p>
        ) : (
          <div className="nox-repsum">
            <div className="nox-rs"><div className="l">締め済み日報</div><div className="v num">{daily.length}<small>日分</small></div></div>
            <div className="nox-rs">
              <div className="l">実査差の合計</div>
              <div className="v num" style={diffAll !== 0 ? { color: "var(--bad)" } : undefined}>{yen(diffAll)}</div>
            </div>
            <div className="nox-rs">
              <div className="l">取消・巻き戻し</div>
              <div className="v num">{logs.filter((l) => (VIEW_DEFS[1].actions ?? []).includes(l.action)).length}<small>件</small></div>
            </div>
            <div className="nox-rs"><div className="l">再締め</div><div className="v num">{daily.reduce((x, d) => x + d.reclosed_count, 0)}<small>回</small></div></div>
          </div>
        )}

        <section className="nox-panel">
          <h3>日報・現金照合</h3>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "-4px 0 10px" }}>
            締め確定時の帳簿額と実査額（直近14日・締め時のサーバ再集計値をそのまま表示します）。
          </p>
          {daily === null ? <p style={{ fontSize: 13, color: "var(--sub)" }}>読み込み中…</p>
            : daily.length === 0 ? <p style={{ fontSize: 13, color: "var(--sub)" }}>締め済みの日報はありません。</p> : (
            <div className="nox-tablewrap">
              <table className="nox-table">
                <thead>
                  <tr><th>営業日</th><th>売上</th><th>予定現金</th><th>実査現金</th><th>実査差</th><th>締め担当</th><th>再締め</th><th>状態</th></tr>
                </thead>
                <tbody>
                  {daily.map((d) => {
                    const expected = d.cash_float + d.cash - d.expense - d.cash_payout;
                    const sales = d.cash + d.card_gross + d.uri + d.other;
                    const ok = d.diff === 0;
                    return (
                      <tr key={d.biz_date}>
                        <td className="num">{d.biz_date}</td>
                        <td className="num">{yen(sales)}</td>
                        <td className="num">{yen(expected)}</td>
                        <td className="num">{d.counted_cash === null ? "—" : yen(d.counted_cash)}</td>
                        <td className="num" style={d.diff !== null && d.diff !== 0 ? { color: "var(--bad)", fontWeight: 700 } : undefined}>
                          {d.diff === null ? "—" : yen(d.diff)}
                        </td>
                        <td>{userName(d.closed_by)}</td>
                        <td className="num">{d.reclosed_count}回</td>
                        <td>
                          <span className={`nox-stpill ${ok ? "ok" : ""}`}>
                            {d.counted_cash === null ? "実査なし" : ok ? "一致" : "差額あり"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.7 }}>
            予定現金＝釣銭準備金＋現金売上−諸経費−現金支払。実査差＝実査現金−予定現金（日報の確定値）。
            ※モックの「確認済み／要確認」の確認フラグは<b>準備中</b>です（列がないため、ここでは実査差の有無で表示しています）。
          </p>
        </section>

        <section className="nox-panel">
          <h3>取消・返金・値引き</h3>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "-4px 0 10px" }}>
            金額に影響した操作の記録（表示中のページの操作履歴から抽出）。
          </p>
          {(() => {
            const rows = logs.filter((l) => (VIEW_DEFS[1].actions ?? []).includes(l.action));
            if (rows.length === 0) return <p style={{ fontSize: 13, color: "var(--sub)" }}>該当する操作はありません（「操作履歴」タブで期間を送ると増えます）。</p>;
            return (
              <div className="nox-tablewrap">
                <table className="nox-table">
                  <thead><tr><th>日時</th><th>種別</th><th>対象</th><th>操作担当</th><th>承認者</th><th>理由</th></tr></thead>
                  <tbody>
                    {rows.map((l) => (
                      <tr key={l.id}>
                        <td className="num">{fmtAt(l.at)}</td>
                        <td>{l.action}</td>
                        <td>{l.target ?? "—"}</td>
                        <td>{userName(l.actor_user_id)}</td>
                        <td style={{ color: "var(--v2-muted)" }}>—</td>
                        <td style={{ color: "var(--v2-muted)" }}>—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
          <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.7 }}>
            ※「承認者」「理由」は<b>準備中</b>です（audit_logs に承認者・理由の列がないため「—」）。
            変更前後の値は「操作履歴」タブで行を開くと確認できます。
          </p>
        </section>
      </>
      )}

      {/* ══ タブ3: 権限・機微情報（モック「機微情報へのアクセス」＋「権限変更」）══ */}
      {ptab === "perm" && (
      <>
        <section className="nox-panel">
          <h3>機微情報へのアクセス</h3>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "-4px 0 10px" }}>
            本名・生年月日・マイナンバー・税務情報の閲覧記録（表示中のページから抽出）。
          </p>
          {(() => {
            const rows = logs.filter((l) => (VIEW_DEFS[2].actions ?? []).includes(l.action));
            if (rows.length === 0) return <p style={{ fontSize: 13, color: "var(--sub)" }}>該当する記録はありません。</p>;
            return rows.map((l) => (
              <div key={l.id} className="nox-listrow" style={{ fontSize: 12.5 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{l.action}</b>
                  <span style={{ display: "block", fontSize: 10.5, color: "var(--v2-muted)" }}>{l.target ?? "—"}</span>
                </span>
                <span>{userName(l.actor_user_id)}</span>
                <span className="num" style={{ fontSize: 11, color: "var(--v2-muted)" }}>{fmtAt(l.at)}</span>
              </div>
            ));
          })()}
          <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.7 }}>
            ※モックの「閲覧目的」は<b>準備中</b>です（目的を保存する列がありません）。営業時間外かどうかの判定も準備中です。
          </p>
        </section>

        <section className="nox-panel">
          <h3>権限変更</h3>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "-4px 0 10px" }}>直近の付与・削除（表示中のページから抽出）。</p>
          {(() => {
            const rows = logs.filter((l) => (VIEW_DEFS[3].actions ?? []).includes(l.action));
            if (rows.length === 0) return <p style={{ fontSize: 13, color: "var(--sub)" }}>該当する記録はありません。</p>;
            return rows.map((l) => (
              <div key={l.id} className="nox-listrow" style={{ fontSize: 12.5 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{l.action}</b>
                  <span style={{ display: "block", fontSize: 10.5, color: "var(--v2-muted)" }}>{l.target ?? "—"}</span>
                </span>
                <span style={{ fontSize: 11, color: "var(--v2-muted)" }}>{userName(l.actor_user_id)} が変更</span>
                <span className="num" style={{ fontSize: 11, color: "var(--v2-muted)" }}>{fmtAt(l.at)}</span>
              </div>
            ));
          })()}
        </section>
      </>
      )}

      {/* ══ タブ4: 出力・保管（モック「監査データの出力履歴」＋「保管・改ざん防止」）══ */}
      {ptab === "export" && (
      <>
        <section className="nox-panel">
          <h3>監査データの出力履歴</h3>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "-4px 0 10px" }}>出力操作自体も監査記録に保存されます。</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <button style={{ ...t.btnGold, ...t.btnSm, opacity: 0.45 }} disabled title="監査ログの出力は準備中です">新しく出力</button>
            <span className="nox-stpill">準備中</span>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--v2-muted)", margin: 0, lineHeight: 1.8 }}>
            監査ログのファイル出力（CSV / PDF・期間・利用目的・オーナーPIN）は<b>準備中</b>です。
            出力履歴を保存する仕組みもまだありません（出力を実装するときに同時に作ります）。
            現在は「操作履歴」タブで期間・種別・対象を絞って画面で確認してください。
          </p>
        </section>

        <section className="nox-panel">
          <h3>保管・改ざん防止</h3>
          <div className="nox-listrow">
            <span style={{ flex: 1 }}>記録方式</span><b>追記専用</b>
          </div>
          <div className="nox-listrow">
            <span style={{ flex: 1 }}>
              編集・削除
              <span style={{ display: "block", fontSize: 10.5, color: "var(--v2-muted)" }}>
                audit_logs に更新・削除のポリシーが無く、書き込みは内部専用関数だけに許可されています。
              </span>
            </span>
            <b>できません</b>
          </div>
          <div className="nox-listrow" style={{ opacity: 0.55 }}>
            <span style={{ flex: 1 }}>
              操作ログ保管期間
              <span style={{ display: "block", fontSize: 10.5, color: "var(--v2-muted)" }}>保管期間の設定は準備中です（現在は削除していません）。</span>
            </span>
            <span className="nox-stpill">準備中</span>
          </div>
          <div className="nox-listrow" style={{ opacity: 0.55 }}>
            <span style={{ flex: 1 }}>
              最終バックアップ
              <span style={{ display: "block", fontSize: 10.5, color: "var(--v2-muted)" }}>表示は準備中です。</span>
            </span>
            <span className="num">—</span>
          </div>
          <div className="nox-listrow">
            <span style={{ flex: 1 }}>
              完全性チェック（ハッシュ連鎖）
              <span style={{ display: "block", fontSize: 10.5, color: "var(--v2-muted)" }}>
                裁定により<b>採用していません</b>（準備中ではなく、作らない方針です）。改ざん防止は上の追記専用と権限で担保します。
              </span>
            </span>
            <span className="nox-stpill">非採用</span>
          </div>
        </section>
      </>
      )}
    </div>
  );
}
