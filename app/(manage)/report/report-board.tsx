"use client";

import { useCallback, useEffect, useState } from "react";
import PageHead from "@/components/ui/page-head";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf, bizDateRange } from "@/lib/nox/biz-date";
import { roundYen } from "@/lib/nox/money";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import Modal from "@/components/ui/modal";
import MonthReport from "./month-report";

type Preview = {
  open: number; slips: number; guests: number; dohan: number;
  cash: number; card: number; cardTax: number; uri: number; other: number; drink: number;
  // E8-2 #1/#2/#6: 追加集計（すべて既存テーブルの client 集計＝権威は締め時のサーバ再集計）
  kindSums: { time: number; drink: number; champ: number; bottle: number; other: number }; // #1 カテゴリ5分類
  discount: number;        // #2 値引き（kind='discount' の合計・正値）
  hon: number;             // #2 本指名（nom_type='hon' の組数）
  newCust: number;         // #2 新規（過去伝票のない顧客 or 顧客未登録の組）
  repeatCust: number;      // #2 リピート（過去伝票のある顧客の組）
  avgStayMin: number | null; // #2 平均滞在（closed の closed_at−started_at 平均・分）
  bottlesOpened: number;   // #2 ボトル開栓（bottle_keeps.opened_at が営業日範囲）
  workedCasts: number;     // #2 出勤キャスト（attendance PRESENT）
  closedTotal: number;     // #6 決済一致の右辺（Σ closed checks.total）
  arCollectedToday: number; // #4 回収現金（当日 ar_collections・締め前のライブ値）
};
type Report = {
  id: string; biz_date: string; cash: number; card_gross: number; card_tax: number; uri: number; other: number;
  drink_sales: number; dohan_checks: number; slips: number; guests: number; open_checks_count: number;
  ar_collected: number; // B6（mig0055）: 回収現金（別掲・理論在高加算対象）
  expense: number; cash_payout: number; cash_float: number; counted_cash: number | null; diff: number | null;
  reclosed_count: number;
  closed_by: string | null; // E8-2 #8: 締め担当（users.name へ表示専用 join）
};
// B6 未回収売掛（open receivables・embedded で伝票日/席・客・cast を同伴）
type Recv = {
  id: string; amount: number; deducted_amount: number; cast_id: string | null; customer_id: string | null; deduct_from_cast: boolean;
  collected_amount: number; due: string | null; // E8-2（mig0092/0093）: 部分回収済み額・支払期日
  checks: { started_at: string; seats: { name: string } | null } | null;
  customers: { name: string } | null;
  casts: { name: string } | null;
};
// E8-2: 残額＝amount − deducted − collected（mig0092 の三者不変量・表示も同式）
const remainOf = (r: Recv) => r.amount - r.deducted_amount - r.collected_amount;

const yen = (n: number) => "¥" + n.toLocaleString();
// 段0R 第3陣: 器は共通クラス nox-panel・見出しは nox-panel > h3（白）へ統一＝card/secTitle は撤去。
const input: React.CSSProperties = { ...t.input, width: "auto" };
const btnDark: React.CSSProperties = t.btnGold;
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

// 段L2: 当日ヘッダの曜日表示（表示専用・保存や計算には触れない）
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const dowOf = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export default function ReportBoard({
  storeId, cutoff, cardTaxRate, isManagerUp, stores,
}: { storeId: string; cutoff: string; cardTaxRate: number; isManagerUp: boolean; stores: { id: string; name: string }[] }) {
  const supabase = createClient();
  const [tab, setTab] = useState<"day" | "month" | "ar">("day"); // A4: 日報/月報 タブ＋B6: 売掛タブ（案7-A・owner/manager のみ）
  const [bizDate, setBizDate] = useState(bizDateOf(new Date().toISOString(), cutoff));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [expense, setExpense] = useState(0);
  const [payout, setPayout] = useState(0);
  const [cashFloat, setCashFloat] = useState(50_000);
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);
  const [recvs, setRecvs] = useState<Recv[]>([]);                        // B6 未回収売掛（open）
  const [consent, setConsent] = useState<Record<string, boolean>>({});   // B6 本人同意チェック（行単位）
  // E8-2 #5: 金種カウンタ（9金種・合計→実査へ反映。DB は counted_cash 1列のまま＝モーダルは入力補助）
  const [denomOpen, setDenomOpen] = useState(false);
  const [denoms, setDenoms] = useState<Record<number, string>>({});
  // E8-2 #8: 締め担当（daily_reports.closed_by → users.name の表示専用 map）
  const [closerNames, setCloserNames] = useState<Record<string, string>>({});
  // E8-2 #12: due 設定モーダル（receivable_set_due・mig0093）＋期日ソート
  const [duePick, setDuePick] = useState<Recv | null>(null);
  const [dueVal, setDueVal] = useState("");
  const [arSort, setArSort] = useState<"created" | "due">("created");
  // E8-2 #13: 部分回収モーダル（receivable_collect p_amount 結線・空欄=全額）
  const [collectPick, setCollectPick] = useState<Recv | null>(null);
  const [collectAmt, setCollectAmt] = useState("");
  // E8-2 #12: 今月回収 KPI（ar_collections 当月合算・表示専用）
  const [arMonth, setArMonth] = useState(0);

  // プレビュー＝クライアント TS 集計（biz-date 純関数で範囲決定・権威は close 時のサーバ再集計）
  const loadPreview = useCallback(async (d: string) => {
    const { startIso, endIso } = bizDateRange(d, cutoff);
    const { data: checks } = await supabase
      .from("checks").select("id, status, people, nom_type, total, started_at, closed_at, customer_id")
      .eq("store_id", storeId).gte("started_at", startIso).lt("started_at", endIso);
    const closed = (checks ?? []).filter((c) => c.status === "closed");
    const ids = closed.map((c) => c.id as string);
    let cash = 0, cardSum = 0, uri = 0, other = 0, drink = 0, discount = 0;
    const kindSums = { time: 0, drink: 0, champ: 0, bottle: 0, other: 0 };
    if (ids.length) {
      const { data: pays } = await supabase.from("payments").select("method, amount, check_id").in("check_id", ids);
      for (const p of pays ?? []) {
        if (p.method === "cash") cash += p.amount;
        else if (p.method === "card") cardSum += p.amount;
        else if (p.method === "ar") uri += p.amount;
        else other += p.amount;
      }
      const { data: lines } = await supabase.from("check_lines").select("kind, line_total, check_id").in("check_id", ids);
      for (const l of lines ?? []) {
        if (l.kind === "drink" || l.kind === "champ") drink += l.line_total;
        // E8-2 #1: カテゴリ5分類（set は kind の実値・time=セット/延長・other=charge/custom 等）
        if (l.kind === "time" || l.kind === "set") kindSums.time += l.line_total;
        else if (l.kind === "drink") kindSums.drink += l.line_total;
        else if (l.kind === "champ") kindSums.champ += l.line_total;
        else if (l.kind === "bottle") kindSums.bottle += l.line_total;
        else if (l.kind === "discount") discount += Math.abs(l.line_total);
        else kindSums.other += l.line_total;
      }
    }
    // E8-2 #2: 営業サマリー材料（各1クエリ・表示専用）
    //   リピート判定＝当日 closed の customer_id に「範囲開始前の伝票」が1件でもあるか。
    const custIds = [...new Set(closed.map((c) => c.customer_id as string | null).filter(Boolean))] as string[];
    let repeatSet = new Set<string>();
    if (custIds.length) {
      const { data: prevChecks } = await supabase.from("checks").select("customer_id")
        .in("customer_id", custIds).lt("started_at", startIso).limit(1000);
      repeatSet = new Set((prevChecks ?? []).map((c) => c.customer_id as string));
    }
    const withCust = closed.filter((c) => c.customer_id);
    const repeatCust = withCust.filter((c) => repeatSet.has(c.customer_id as string)).length;
    const newCust = closed.length - repeatCust; // 新規＝顧客未登録の組も含む（初来店扱い）
    const stays = closed
      .filter((c) => c.closed_at)
      .map((c) => (new Date(c.closed_at as string).getTime() - new Date(c.started_at as string).getTime()) / 60000)
      .filter((m) => m >= 0);
    const avgStayMin = stays.length ? Math.round(stays.reduce((a, b) => a + b, 0) / stays.length) : null;
    const { count: bottlesOpened } = await supabase.from("bottle_keeps")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId).gte("opened_at", startIso).lt("opened_at", endIso);
    const { count: workedCasts } = await supabase.from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId).eq("date", d).in("status", ["shukkin", "dohan", "late"]);
    // #4 回収現金（締め前ライブ）＝当日 biz_date の ar_collections（締め済みは daily_reports.ar_collected が正）
    const { data: arRows } = await supabase.from("ar_collections")
      .select("amount").eq("store_id", storeId).eq("biz_date", d);
    const arCollectedToday = (arRows ?? []).reduce((a, r) => a + (r.amount as number), 0);
    setPreview({
      open: (checks ?? []).filter((c) => c.status === "open").length,
      slips: closed.length,
      guests: closed.reduce((a, c) => a + (c.people ?? 0), 0),
      dohan: closed.filter((c) => c.nom_type === "dohan").length,
      cash, card: cardSum, cardTax: roundYen((cardSum * cardTaxRate) / 100), uri, other, drink,
      kindSums, discount,
      hon: closed.filter((c) => c.nom_type === "hon").length,
      newCust, repeatCust, avgStayMin,
      bottlesOpened: bottlesOpened ?? 0, workedCasts: workedCasts ?? 0,
      closedTotal: closed.reduce((a, c) => a + ((c.total as number) ?? 0), 0),
      arCollectedToday,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, cutoff, cardTaxRate]);

  const loadReports = useCallback(async () => {
    const { data } = await supabase
      .from("daily_reports").select("*").order("biz_date", { ascending: false }).limit(14);
    const rows = (data ?? []) as (Report & { closed_by: string | null })[];
    setReports(rows as Report[]);
    // E8-2 #8: 締め担当名（closed_by → users.name・表示専用の1クエリ）
    const uids = [...new Set(rows.map((r) => r.closed_by).filter(Boolean))] as string[];
    if (uids.length) {
      const { data: us } = await supabase.from("users").select("id, name").in("id", uids);
      setCloserNames(Object.fromEntries(((us ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name])));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // B6 未回収売掛（open）＝receivables 直 SELECT（RLS で owner/manager/staff-can_register・cast 0行）。
  const loadRecvs = useCallback(async () => {
    const { data } = await supabase
      .from("receivables")
      .select("id, amount, deducted_amount, collected_amount, due, cast_id, customer_id, deduct_from_cast, checks(started_at, seats(name)), customers(name), casts(name)")
      .eq("store_id", storeId).eq("status", "open")
      .order("created_at", { ascending: false });
    setRecvs((data ?? []) as unknown as Recv[]);
    // E8-2 #12: 今月回収 KPI（ar_collections 当月 biz_date 合算・表示専用）
    const ym = new Date().toISOString().slice(0, 7);
    const { data: ar } = await supabase.from("ar_collections")
      .select("amount").eq("store_id", storeId)
      .gte("biz_date", `${ym}-01`).lte("biz_date", `${ym}-31`);
    setArMonth(((ar ?? []) as { amount: number }[]).reduce((a, r) => a + r.amount, 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => { void loadPreview(bizDate); }, [bizDate, loadPreview]);
  useEffect(() => { void loadReports(); }, [loadReports]);
  useEffect(() => { if (isManagerUp) void loadRecvs(); }, [isManagerUp, loadRecvs]);

  // 段L2: 表示中の営業日が締め済みか（既に取得済みの reports から引くだけ＝新規取得なし）
  const closedReport = reports.find((r) => r.biz_date === bizDate) ?? null;
  // 当日サマリの「売上（暫定）」＝現金＋カード＋売掛＋その他（締め済み日報の売上式と同じ組み立て）
  const previewSales = preview ? preview.cash + preview.card + preview.uri + preview.other : 0;

  async function closeDay() {
    setMsg(null);
    const { error } = await supabase.rpc("daily_report_close", {
      p_store_id: storeId, p_biz_date: bizDate,
      p_expense: expense, p_cash_payout: payout, p_cash_float: cashFloat,
      p_counted_cash: counted === "" ? null : Number(counted),
      p_note: note || null, p_force: force, p_idem_key: crypto.randomUUID(),
    });
    setMsg(error ? error.message : "締めを確定しました");
    await loadReports();
  }

  async function reclose(reportId: string) {
    setMsg(null);
    const { error } = await supabase.rpc("daily_report_reclose", { p_report_id: reportId, p_force: force });
    setMsg(error ? error.message : "再締めしました（凍結 cutoff/税率で再集計）");
    await loadReports();
  }

  // B6→E8-2 #13: 回収＝部分回収モーダル経由（receivable_collect p_amount 結線・空欄=残額全額・
  //   冪等キーは送信ごとに新規 UUID＝意図した複数回の部分回収を別 idem で通す）。回収日日報に別掲加算。
  async function submitCollect() {
    if (!collectPick) return;
    const r = collectPick;
    const remaining = remainOf(r);
    const amt = collectAmt === "" ? null : Number(collectAmt);
    if (amt !== null && (!Number.isInteger(amt) || amt <= 0 || amt > remaining)) {
      setMsg(`回収額は 1〜${remaining.toLocaleString()} 円の整数で入力してください（空欄＝全額）`);
      return;
    }
    setMsg(null);
    const { error } = await supabase.rpc("receivable_collect", {
      p_receivable_id: r.id, p_biz_date: bizDateOf(new Date().toISOString(), cutoff),
      p_method: "cash", p_note: null, p_idem_key: crypto.randomUUID(), p_amount: amt,
    });
    setMsg(error
      ? (error.message.includes("bad amount") ? "回収額が残額を超えています" : error.message)
      : `売掛 ${yen(amt ?? remaining)} を回収（現金へ振替・${amt !== null && amt < remaining ? "残額 " + yen(remaining - amt) : "完済"}）。`);
    setCollectPick(null);
    await loadRecvs();
    await loadReports();
    await loadPreview(bizDate);
  }

  // E8-2 #12（mig0093）: 支払期日の設定/クリア（receivable_set_due＝唯一の書込経路）
  async function submitDue() {
    if (!duePick) return;
    setMsg(null);
    const { error } = await supabase.rpc("receivable_set_due", {
      p_receivable_id: duePick.id, p_due: dueVal || null,
    });
    setMsg(error ? error.message : dueVal ? `支払期日を ${dueVal} に設定しました` : "支払期日をクリアしました");
    setDuePick(null);
    await loadRecvs();
  }

  // B6 給与天引き対象化＝receivable_mark_deduct（本人同意必須・実減算は次回 payroll_finalize＝UX 正直性の設計3 注記）。
  async function markDeductRecv(r: Recv) {
    setMsg(null);
    if (!consent[r.id]) { setMsg("本人同意が未取得のため天引きできません（労基法・全額払い）"); return; }
    const { error } = await supabase.rpc("receivable_mark_deduct", {
      p_receivable_id: r.id, p_consent: true, p_note: null,
    });
    setMsg(error ? error.message : `${r.casts?.name ?? "本人"} さんの売掛を次回給与で天引き予定にしました。`);
    await loadRecvs();
  }

  return (
    <div className="nox-mv1 nox-mv1-sm">
      {/* 段0R 第3陣: ヘッダを新シェルの nox-hero へ（他画面と同基準・表示のみ） */}
      <PageHead eyebrow="DAILY REPORT" title="日報・締め管理"
        desc="売上と現金を照合し、営業日の締め処理まで一つの画面で完了します。" />
      <Toast msg={msg} />

      {/* A4: 日報/月報 タブ（モックの segment のうち月報のみ実装・分析=C5/会計連携=C3/本部連結=C2 は A4 の外）。
          段0R 第3陣: カード包みの独自セグメントを canonical の nox-seg（nox-ctoolbar 内）へ載せ替え。
          ★キー・ラベル・isManagerUp の出し分け・setTab は1文字も変えていない。 */}
      <div className="nox-ctoolbar">
        <div className="nox-seg">
          {(isManagerUp ? (["day", "month", "ar"] as const) : (["day", "month"] as const)).map((k) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {k === "day" ? "日報" : k === "month" ? "月報" : "売掛"}
            </button>
          ))}
        </div>
      </div>

      {tab === "month" && <MonthReport stores={stores} defaultStoreId={storeId} isManagerUp={isManagerUp} />}

      {/* B6 売掛タブ（案7-A・owner/manager のみ・post-launch で C3 仕訳画面へ移設）。文言はモック現物（教訓D）。 */}
      {tab === "ar" && isManagerUp && (() => {
        // E8-2 #12: KPI＝残高（mig0092 残高式）/今月回収/期限超過/件数。期日ソートは due 昇順（null は末尾）。
        const today = new Date().toISOString().slice(0, 10);
        const balance = recvs.reduce((a, r) => a + remainOf(r), 0);
        const overdue = recvs.filter((r) => r.due && r.due < today).length;
        const shown = arSort === "due"
          ? [...recvs].sort((a, b) => (a.due ?? "9999-99-99").localeCompare(b.due ?? "9999-99-99"))
          : recvs;
        return (
        <section className="nox-panel">
          <h3>売掛（未回収）</h3>
          <div className="nox-repsum">
            <div className="nox-rs"><div className="l">未回収残高</div><div className="v num">{yen(balance)}</div></div>
            <div className="nox-rs"><div className="l">今月回収</div><div className="v num">{yen(arMonth)}</div></div>
            <div className="nox-rs"><div className="l">期限超過</div><div className="v num" style={overdue > 0 ? { color: "var(--bad)" } : undefined}>{overdue}件</div></div>
            <div className="nox-rs"><div className="l">未回収件数</div><div className="v num">{recvs.length}件</div></div>
          </div>
          <div className="nox-seg" style={{ marginBottom: 10, display: "inline-flex" }}>
            {([["created", "新しい順"], ["due", "期日順"]] as const).map(([k, label]) => (
              <button key={k} className={arSort === k ? "on" : ""} onClick={() => setArSort(k)}>{label}</button>
            ))}
          </div>
          {recvs.length === 0 ? (
            <p style={{ ...t.sub, margin: 0 }}>未回収の売掛はありません。</p>
          ) : (
            <div>
              {shown.map((r) => {
                const remaining = remainOf(r);
                const dt = r.checks?.started_at ? bizDateOf(r.checks.started_at, cutoff) : "—";
                const isOver = !!r.due && r.due < today;
                // E5c: 区切り線flex行の手組みを .nox-listrow（G5 部品）へ。wrap/gap8/padding9 はローカル上書き。
                return (
                  <div key={r.id} className="nox-listrow" style={{ flexWrap: "wrap", gap: 8, padding: "9px 0" }}>
                    <span style={{ fontSize: 13, color: "var(--ink)", flex: "1 1 260px" }}>
                      {dt}
                      {r.checks?.seats?.name ? ` ・ ${r.checks.seats.name}` : ""}
                      {" ・ "}{r.customers?.name ?? "フリー"}
                      {r.casts?.name ? ` ・ 指名 ${r.casts.name}` : ""}
                      <span style={{ ...t.num, color: "var(--champ)", marginLeft: 8 }}>{yen(remaining)}</span>
                      {r.collected_amount > 0 && (
                        <span style={{ ...t.sub, fontSize: 11, marginLeft: 6 }}>（一部回収済 {yen(r.collected_amount)}）</span>
                      )}
                      {/* E8-2 #12: 期日バッジ（超過は bad 色・タップで設定/変更モーダル） */}
                      <button type="button" style={{
                        ...btnLight, marginLeft: 8, padding: "2px 10px", fontSize: 11.5,
                        ...(isOver ? { borderColor: "var(--bad-bd)", color: "var(--bad)", background: "var(--bad-bg)" } : {}),
                      }}
                        onClick={() => { setDuePick(r); setDueVal(r.due ?? ""); }}>
                        {r.due ? `期日 ${r.due}${isOver ? "（超過）" : ""}` : "期日を設定"}
                      </button>
                    </span>
                    {r.deduct_from_cast ? (
                      <span style={{ ...t.sub, fontSize: 12 }}>次回給与で天引き予定</span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {r.cast_id && (
                          <label style={{ ...t.fieldLabel, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                            <input type="checkbox" checked={!!consent[r.id]}
                              onChange={(e) => setConsent((s) => ({ ...s, [r.id]: e.target.checked }))} />
                            本人同意
                          </label>
                        )}
                        {r.cast_id && (
                          <button style={btnLight} disabled={!consent[r.id]}
                            title={!consent[r.id] ? "本人同意が未取得のため天引きできません（労基法・全額払い）" : ""}
                            onClick={() => markDeductRecv(r)}>給与天引き</button>
                        )}
                        {/* E8-2 #13: 回収はモーダル経由（部分回収・空欄=全額） */}
                        <button style={btnLight} onClick={() => { setCollectPick(r); setCollectAmt(""); }}>回収</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p style={{ ...t.sub, fontSize: 12, marginTop: 8 }}>
            掛売は当日現金に計上せず売掛として分離。回収で現金へ振替えます（一部だけの回収も可）。
          </p>
        </section>
        );
      })()}

      {/* E8-2 #13: 部分回収モーダル（残額表示・金額入力・空欄=全額・現金固定＝現行経路） */}
      {collectPick && (
        <Modal onClose={() => setCollectPick(null)}>
          <h3 style={{ ...t.cardTitle, margin: "0 0 8px" }}>売掛の回収（現金）</h3>
          <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>
            {collectPick.customers?.name ?? "フリー"} ・ 残額 <b className="num" style={{ color: "var(--champ)" }}>{yen(remainOf(collectPick))}</b>
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ ...t.fieldLabel, fontSize: 12 }}>回収額{" "}
              <input type="number" min={1} max={remainOf(collectPick)} value={collectAmt}
                onChange={(e) => setCollectAmt(e.target.value)} placeholder={`空欄＝全額（${remainOf(collectPick).toLocaleString()}）`}
                style={{ ...input, width: 180 }} />
            </label>
            <button style={btnDark} onClick={() => void submitCollect()}>
              {collectAmt === "" ? "全額を回収" : `${yen(Number(collectAmt) || 0)} を回収`}
            </button>
            <button style={btnLight} onClick={() => setCollectPick(null)}>キャンセル</button>
          </div>
          <p style={{ ...t.sub, fontSize: 11, margin: "8px 0 0" }}>
            一部回収では売掛は未回収のまま残り、残額が減ります。全額に達すると回収済みになります。
          </p>
        </Modal>
      )}

      {/* E8-2 #12: 期日設定モーダル（receivable_set_due・空欄=クリア） */}
      {duePick && (
        <Modal onClose={() => setDuePick(null)}>
          <h3 style={{ ...t.cardTitle, margin: "0 0 8px" }}>支払期日の設定</h3>
          <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>
            {duePick.customers?.name ?? "フリー"} ・ 残額 {yen(remainOf(duePick))}
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="date" value={dueVal} onChange={(e) => setDueVal(e.target.value)} style={input} />
            <button style={btnDark} onClick={() => void submitDue()}>{dueVal ? "設定する" : "期日をクリア"}</button>
            <button style={btnLight} onClick={() => setDuePick(null)}>キャンセル</button>
          </div>
        </Modal>
      )}

      {tab === "day" && (<>
      <section className="nox-panel">
        {/* 段L2: 当日ヘッダ＝営業日＋状態バッジ＋open 伝票警告＋締めボタン（モック .repstate）。
            ★状態は「その営業日の daily_reports 行があるか」だけで判定（締め RPC も確定値も非改変）。
            締めボタンは下の「締め」節へスクロールさせるのではなく、同じ closeDay をそのまま呼ぶ＝
            送る引数も経路も現行と1文字も変えていない。 */}
        <div className="nox-repstate">
          <span className="num" style={{ fontSize: 15, fontWeight: 700, color: "var(--v2-text)" }}>
            {bizDate}（{DOW[dowOf(bizDate)]}）
          </span>
          <span className={`nox-stbadge ${closedReport ? "closed" : "open"}`}>
            {closedReport ? "締め済み" : "営業中（未締め）"}
          </span>
          {!closedReport && (preview?.open ?? 0) > 0 && (
            <span className="nox-repwarn">
              open 伝票 {preview?.open}件 — 締めるには全伝票の会計が必要（強行も可）
            </span>
          )}
          {closedReport && closedReport.reclosed_count > 0 && (
            <span style={{ fontSize: 11, color: "var(--v2-muted)" }}>再締め {closedReport.reclosed_count}回</span>
          )}
          {isManagerUp && !closedReport && (
            <button style={{ ...btnDark, marginLeft: "auto" }} onClick={closeDay}>日報を締める</button>
          )}
        </div>

        {/* 段L2 ★唯一の新設: 当日暫定サマリ4カード。値は既存 preview state の再形だけ＝新規 SELECT ゼロ。
            「暫定」＝クライアント集計であり、確定値は締め時のサーバ再集計が正（下の注記と同じ扱い）。 */}
        {preview && (() => {
          // E8-2 #3: 当日 KPI 5枚（E8-5 先行分＝前日比・客単価に単価系カードを追補して完成形へ）。
          //   値はすべて preview / reports（取得済み）の再形＝新規 SELECT ゼロ・権威は締め時のサーバ再集計。
          const d = new Date(bizDate + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() - 1);
          const prevDate = d.toISOString().slice(0, 10);
          const prev = reports.find((r) => r.biz_date === prevDate) ?? null;
          const prevSales = prev ? prev.cash + prev.card_gross + prev.uri + prev.other : null;
          const delta = prevSales != null && prevSales > 0
            ? Math.round(((previewSales - prevSales) / prevSales) * 100) : null;
          const perGuest = preview.guests > 0 ? Math.round(previewSales / preview.guests) : null;
          const perSlip = preview.slips > 0 ? Math.round(previewSales / preview.slips) : null;
          return (
          <div className="nox-repsum five">
            <div className="nox-rs">
              <div className="l">売上（暫定）</div><div className="v num">{yen(previewSales)}</div>
              {delta != null && (
                <div className="l" style={{ marginTop: 2, color: delta >= 0 ? "var(--ok)" : "var(--bad)" }}>
                  前日比 {delta >= 0 ? "+" : ""}{delta}%
                </div>
              )}
            </div>
            <div className="nox-rs">
              <div className="l">客単価</div><div className="v num">{perGuest != null ? yen(perGuest) : "—"}</div>
              {perSlip != null && <div className="l" style={{ marginTop: 2 }}>組単価 {yen(perSlip)}</div>}
            </div>
            <div className="nox-rs">
              <div className="l">組数</div><div className="v num">{preview.slips}組</div>
              <div className="l" style={{ marginTop: 2 }}>客数 {preview.guests}名</div>
            </div>
            <div className="nox-rs"><div className="l">現金</div><div className="v num">{yen(preview.cash)}</div></div>
            <div className="nox-rs"><div className="l">カード</div><div className="v num">{yen(preview.card)}</div></div>
          </div>
          );
        })()}

        {/* E8-2 #1: 売上内訳＝決済ドーナツ＋カテゴリ5バー（preview の再形のみ・表示専用） */}
        {preview && previewSales > 0 && (() => {
          const pays: Array<[string, number, string]> = [
            ["現金", preview.cash, "var(--gold)"], ["カード", preview.card, "var(--gold2)"],
            ["売掛", preview.uri, "var(--ok)"], ["その他", preview.other, "var(--sub)"],
          ];
          const paysTotal = pays.reduce((a, [, v]) => a + v, 0);
          // ドーナツ＝stroke-dasharray の区間塗り（r=15.9155 で円周≒100）
          let acc = 0;
          const segs = pays.filter(([, v]) => v > 0).map(([label, v, color]) => {
            const pct = (v / paysTotal) * 100;
            const seg = { label, v, color, pct, offset: acc };
            acc += pct;
            return seg;
          });
          const cats: Array<[string, number]> = [
            ["セット・延長", preview.kindSums.time], ["ドリンク", preview.kindSums.drink],
            ["シャンパン", preview.kindSums.champ], ["ボトル", preview.kindSums.bottle],
            ["指名・その他", preview.kindSums.other],
          ];
          const catMax = Math.max(...cats.map(([, v]) => v), 1);
          return (
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", margin: "4px 0 14px" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <svg width="96" height="96" viewBox="0 0 42 42" role="img" aria-label="決済構成">
                  <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--card2)" strokeWidth="6" />
                  {segs.map((s) => (
                    <circle key={s.label} cx="21" cy="21" r="15.9155" fill="none" stroke={s.color} strokeWidth="6"
                      strokeDasharray={`${s.pct} ${100 - s.pct}`} strokeDashoffset={25 - s.offset} />
                  ))}
                </svg>
                <div style={{ fontSize: 11.5, display: "grid", gap: 2 }}>
                  {segs.map((s) => (
                    <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
                      <span style={{ color: "var(--sub)" }}>{s.label}</span>
                      <b className="num" style={{ color: "var(--ink)" }}>{Math.round(s.pct)}%</b>
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ flex: "1 1 260px", minWidth: 240 }}>
                {cats.map(([label, v]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--sub)", width: 86 }}>{label}</span>
                    <div style={{ flex: 1, height: 10, background: "var(--card2)", borderRadius: 5, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round((v / catMax) * 100)}%`, height: "100%", background: "var(--gold)" }} />
                    </div>
                    <span className="num" style={{ fontSize: 11.5, width: 84, textAlign: "right", color: "var(--ink)" }}>{yen(v)}</span>
                  </div>
                ))}
                <p style={{ ...t.sub, fontSize: 10.5, margin: "2px 0 0" }}>カテゴリ別は明細（サ料前）・決済構成は入金額の比率です。</p>
              </div>
            </div>
          );
        })()}

        {/* E8-2 #2: 営業サマリー8指標（新規/リピート/本指名/同伴/ボトル開栓/平均滞在/出勤キャスト/値引き） */}
        {preview && (
          <div className="nox-inset" style={{ padding: "10px 14px", marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "6px 14px" }}>
            {([
              ["新規", `${preview.newCust}組`],
              ["リピート", `${preview.repeatCust}組`],
              ["本指名", `${preview.hon}組`],
              ["同伴", `${preview.dohan}組`],
              ["ボトル開栓", `${preview.bottlesOpened}本`],
              ["平均滞在", preview.avgStayMin != null ? `${preview.avgStayMin}分` : "—"],
              ["出勤キャスト", `${preview.workedCasts}名`],
              ["値引き", preview.discount > 0 ? `−${yen(preview.discount)}` : "—"],
            ] as const).map(([l, v]) => (
              <span key={l} style={{ fontSize: 12 }}>
                <span style={{ color: "var(--sub)", fontSize: 11 }}>{l}</span><br />
                <b className="num" style={{ color: "var(--ink)", fontSize: 13 }}>{v}</b>
              </span>
            ))}
            <p style={{ ...t.sub, fontSize: 10.5, gridColumn: "1 / -1", margin: 0 }}>
              ※新規＝顧客カルテ未登録の組を含む初来店・リピート＝この営業日より前に伝票のある登録顧客の組。
            </p>
          </div>
        )}

        <h3>
          プレビュー（クライアント集計・確定値は締め時のサーバ再集計が正）
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: "var(--v2-text)" }}>営業日</span>
          <input type="date" value={bizDate} onChange={(e) => setBizDate(e.target.value)} style={input} />
          <span style={{ ...t.sub, fontSize: 12 }}>区切り {cutoff}（範囲: 当日{cutoff}〜翌日{cutoff}）</span>
        </div>
        {preview && (
          <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              <tr>
                {[
                  ["伝票", preview.slips], ["組客数", preview.guests], ["同伴", preview.dohan], ["未会計", preview.open],
                  ["現金", yen(preview.cash)], ["カード", yen(preview.card)], ["カードTAX", yen(preview.cardTax)],
                  ["売掛", yen(preview.uri)], ["その他", yen(preview.other)], ["ドリンク/シャンパン売上", yen(preview.drink)],
                ].map(([label, v]) => (
                  <td key={label as string} style={{ padding: "4px 12px", borderRight: "1px solid var(--line)" }}>
                    <div style={{ ...t.sub, fontSize: 11 }}>{label}</div>
                    <div style={{ ...t.num, fontWeight: 700, color: "var(--ink)" }}>{v}</div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* 締めは manager 以上のみ（RPC 側も owner/manager 強制＝二重） */}
      {isManagerUp && (
        <>
        {/* ★B4-3（DP-R 監査の欠落解消）: モック nox-daily-report の「営業サマリー」カード。
            ★新規取得はゼロ＝すべて既存 Preview の再形（newCust/repeatCust/hon/dohan/bottlesOpened/
              avgStayMin/workedCasts/discount は E8-2 #2 で既に集計済み）。
            ★モックの「延長率」「新規キープ本数」「場内本数」は**この画面の集計に無い**＝出さない（教訓25）。 */}
        {preview && (
        <section className="nox-panel">
          <h3>営業サマリー</h3>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "-4px 0 10px" }}>店舗運営とキャスト実績（{bizDate}・締め前のライブ集計）</p>
          <div className="nox-repsum" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div className="nox-rs"><div className="l">新規客</div><div className="v num">{preview.newCust}<small>組</small></div></div>
            <div className="nox-rs"><div className="l">リピート客</div><div className="v num">{preview.repeatCust}<small>組</small></div></div>
            <div className="nox-rs"><div className="l">本指名</div><div className="v num">{preview.hon}<small>組</small></div></div>
            <div className="nox-rs"><div className="l">同伴</div><div className="v num">{preview.dohan}<small>組</small></div></div>
            <div className="nox-rs"><div className="l">ボトル開栓</div><div className="v num">{preview.bottlesOpened}<small>本</small></div></div>
            <div className="nox-rs">
              <div className="l">平均滞在</div>
              <div className="v num">{preview.avgStayMin == null ? "—" : `${preview.avgStayMin}`}<small>分</small></div>
            </div>
            <div className="nox-rs"><div className="l">出勤キャスト</div><div className="v num">{preview.workedCasts}<small>名</small></div></div>
            <div className="nox-rs">
              <div className="l">値引き</div>
              <div className="v num" style={preview.discount > 0 ? { color: "var(--bad)" } : undefined}>{yen(preview.discount)}</div>
            </div>
          </div>
          <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.7 }}>
            新規／リピートは<b>顧客登録のある組</b>で判定します（未登録の組は新規に数えます）。
            確定値は締め時のサーバ再集計が正です。
          </p>
        </section>
        )}

        {/* ★B4-3: モックの「現金照合」カード。★下の締めフォームと**同じ値の内訳表示**＝
            state も入力欄も増やさない（レジ内予定額の式は締めチェックと同一の1本）。 */}
        {preview && (
        <section className="nox-panel">
          <h3>現金照合</h3>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "-4px 0 10px" }}>レジ内の現金と帳簿残高を照合（金額は下の「締め」の入力に連動します）</p>
          {(() => {
            const expected = cashFloat + preview.cash + preview.arCollectedToday - expense - payout;
            const diffLive = counted === "" ? null : Number(counted) - expected;
            return (
              <>
                <div className="nox-listrow"><span style={{ flex: 1 }}>釣銭準備金</span><b className="num">{yen(cashFloat)}</b></div>
                <div className="nox-listrow"><span style={{ flex: 1 }}>現金売上</span><b className="num" style={{ color: "var(--ok)" }}>＋ {yen(preview.cash)}</b></div>
                <div className="nox-listrow"><span style={{ flex: 1 }}>売掛の回収（現金）</span><b className="num" style={{ color: "var(--ok)" }}>＋ {yen(preview.arCollectedToday)}</b></div>
                <div className="nox-listrow"><span style={{ flex: 1 }}>諸経費</span><b className="num" style={{ color: "var(--bad)" }}>− {yen(expense)}</b></div>
                <div className="nox-listrow"><span style={{ flex: 1 }}>現金支払（送り・日払い等）</span><b className="num" style={{ color: "var(--bad)" }}>− {yen(payout)}</b></div>
                <div className="nox-listrow" style={{ borderTop: "1px solid var(--line)" }}>
                  <span style={{ flex: 1, fontWeight: 800 }}>レジ内予定額</span><b className="num" style={{ fontSize: 15 }}>{yen(expected)}</b>
                </div>
                <div className="nox-listrow">
                  <span style={{ flex: 1 }}>実査現金（数えた現金）</span>
                  <b className="num">{counted === "" ? "未入力" : yen(Number(counted))}</b>
                </div>
                <div className="nox-listrow">
                  <span style={{ flex: 1, fontWeight: 800 }}>実査差</span>
                  <b className="num" style={{ fontSize: 15, color: diffLive == null ? "var(--sub)" : diffLive === 0 ? "var(--ok)" : "var(--bad)" }}>
                    {diffLive == null ? "—" : diffLive === 0 ? "±0" : `${diffLive > 0 ? "+" : "−"}${yen(Math.abs(diffLive))}`}
                  </b>
                </div>
              </>
            );
          })()}
        </section>
        )}

        {/* ★B4-3: モックの「売上ランキング（キャスト別）」。★この画面はキャスト別売上を**取得していない**
            （checks / payments / check_lines / bottle_keeps / attendance / ar_collections のみ）。
            器だけ置き、実データのある「分析」画面へ送る＝ここで新しい集計を作らない（教訓25）。 */}
        <section className="nox-panel">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>売上ランキング（キャスト別）</h3>
            <span className="nox-stpill" style={{ marginLeft: "auto" }}>準備中</span>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.8 }}>
            この画面ではキャスト別の売上を集計していません。
            <a href="/analytics" style={{ color: "var(--gold2)" }}>分析</a>の「売上貢献ランキング」でご確認ください。
          </p>
        </section>

        <section className="nox-panel">
          <h3>締め（{bizDate}）</h3>
          {/* E8-2 #6: 締めチェック縮小版3項目（既存データのみ・新規取得ゼロ・ボトル期限は後送り裁定どおり） */}
          {preview && (() => {
            const paysSum = preview.cash + preview.card + preview.uri + preview.other;
            const payMatch = paysSum === preview.closedTotal;
            const expected = cashFloat + preview.cash + preview.arCollectedToday - expense - payout;
            const diffLive = counted === "" ? null : Number(counted) - expected;
            const items: Array<[boolean | null, string]> = [
              [preview.open === 0, preview.open === 0 ? "未会計 0 件" : `未会計 ${preview.open} 件（全伝票の会計が必要・強行も可）`],
              [payMatch, payMatch ? "決済一致（入金合計＝伝票合計）" : `決済不一致（入金 ${yen(paysSum)} ≠ 伝票 ${yen(preview.closedTotal)}）`],
              [diffLive == null ? null : diffLive === 0,
                diffLive == null ? "実査 未入力（入力すると差をここに表示）"
                  : diffLive === 0 ? "実査差 ±0" : `実査差 ${diffLive > 0 ? "+" : "−"}${yen(Math.abs(diffLive))}`],
            ];
            return (
              <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
                {items.map(([ok, label], i) => (
                  <span key={i} style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10.5, fontWeight: 800,
                      background: ok === null ? "var(--card2)" : ok ? "rgba(119,186,131,.18)" : "var(--bad-bg)",
                      color: ok === null ? "var(--sub)" : ok ? "var(--ok)" : "var(--bad)",
                    }}>{ok === null ? "—" : ok ? "✓" : "!"}</span>
                    <span style={{ color: ok === false ? "var(--bad)" : "var(--ink)" }}>{label}</span>
                  </span>
                ))}
              </div>
            );
          })()}
          {/* E8-2 #4: 現金照合パネル＝レジ内予定額の内訳を締め前にライブ表示（式は確定側の実査差と同じ） */}
          {preview && (() => {
            const expected = cashFloat + preview.cash + preview.arCollectedToday - expense - payout;
            const diffLive = counted === "" ? null : Number(counted) - expected;
            return (
              <div className="nox-inset" style={{ padding: "10px 14px", marginBottom: 10, fontSize: 12.5 }}>
                <span style={{ fontSize: 11, color: "var(--sub)" }}>レジ内 現金予定額（ライブ）</span>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline", marginTop: 2 }}>
                  <b className="num" style={{ fontSize: 17, color: "var(--ink)" }}>{yen(expected)}</b>
                  <span style={{ color: "var(--sub)", fontSize: 11.5 }}>
                    ＝ 釣銭 {yen(cashFloat)} ＋ 現金売上 {yen(preview.cash)} ＋ 回収現金 {yen(preview.arCollectedToday)}
                    − 諸経費 {yen(expense)} − 現金支払 {yen(payout)}
                  </span>
                  {diffLive != null && (
                    <b className="num" style={{ color: diffLive === 0 ? "var(--ok)" : "var(--bad)" }}>
                      実査差 {diffLive === 0 ? "±0" : `${diffLive > 0 ? "+" : "−"}${yen(Math.abs(diffLive))}`}
                    </b>
                  )}
                </div>
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ ...t.fieldLabel, fontSize: 12 }}>諸経費 <input type="number" min={0} value={expense} onChange={(e) => setExpense(Number(e.target.value))} style={{ ...input, width: 90 }} /></label>
            <label style={{ ...t.fieldLabel, fontSize: 12 }}>現金支払（送り・日払い等） <input type="number" min={0} value={payout} onChange={(e) => setPayout(Number(e.target.value))} style={{ ...input, width: 90 }} /></label>
            <label style={{ ...t.fieldLabel, fontSize: 12 }}>釣銭準備金 <input type="number" min={0} value={cashFloat} onChange={(e) => setCashFloat(Number(e.target.value))} style={{ ...input, width: 90 }} /></label>
            <label style={{ ...t.fieldLabel, fontSize: 12 }}>実査（数えた現金） <input type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="未入力可" style={{ ...input, width: 110 }} /></label>
            {/* E8-2 #5: 金種カウンタ（合計を実査へ反映＝入力補助・DB は counted_cash 1列のまま） */}
            <button type="button" style={btnLight} onClick={() => setDenomOpen(true)}>金種で数える</button>
            <input placeholder="メモ" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...input, width: 160 }} />
            <label style={{ ...t.fieldLabel, fontSize: 12 }}>
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> 未会計があっても強行
            </label>
            <button style={btnDark} onClick={closeDay}>締め確定</button>
          </div>
        </section>
        </>
      )}

      {/* E8-2 #5: 金種カウンタ・モーダル（9金種＝2千円札は除外・合計→実査欄へ反映） */}
      {denomOpen && (() => {
        const DENOMS = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1];
        const total = DENOMS.reduce((a, d) => a + d * (Number(denoms[d]) || 0), 0);
        return (
          <Modal onClose={() => setDenomOpen(false)} scroll>
            <h3 style={{ ...t.cardTitle, margin: "0 0 8px" }}>金種カウンタ</h3>
            <div style={{ display: "grid", gap: 6 }}>
              {DENOMS.map((d) => (
                <label key={d} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span className="num" style={{ width: 74, textAlign: "right", color: "var(--sub)" }}>{yen(d)}</span>
                  <span style={{ color: "var(--sub)" }}>×</span>
                  <input type="number" min={0} value={denoms[d] ?? ""} placeholder="0"
                    onChange={(e) => setDenoms((s) => ({ ...s, [d]: e.target.value }))}
                    className="num" style={{ ...input, width: 84, textAlign: "right" }} />
                  <span className="num" style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink)" }}>
                    {yen(d * (Number(denoms[d]) || 0))}
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 12, color: "var(--sub)" }}>合計</span>
              <b className="num" style={{ fontSize: 20, color: "var(--champ)" }}>{yen(total)}</b>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
              <button style={btnLight} onClick={() => setDenoms({})}>クリア</button>
              <button style={btnDark} onClick={() => { setCounted(String(total)); setDenomOpen(false); }}>
                実査へ反映（{yen(total)}）
              </button>
            </div>
          </Modal>
        );
      })()}

      <section className="nox-panel">
        <h3>締め済み日報</h3>
        {/* 段L2: リッチ行（モック .histrow）＝直近7日を「日付・組数・現金/カード・売上」で読みやすく。
            ★下の全列テーブルはそのまま残す（実査差・再締め等の運用列を落とさない＝情報を減らさない）。 */}
        {/* E8-2 #8: 行クリックでその営業日を上のプレビューに表示＋締め担当を併記 */}
        {reports.slice(0, 7).map((r) => (
          <div key={`h-${r.id}`} className="nox-histrow" style={{ cursor: "pointer" }}
            title="クリックでこの営業日を表示"
            onClick={() => { setBizDate(r.biz_date); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <span className="d num">{r.biz_date.slice(5).replace("-", "/")}（{DOW[dowOf(r.biz_date)]}）</span>
            <span style={{ color: "var(--v2-muted)", fontSize: 12 }}>
              {r.slips}組・現金 {yen(r.cash)} / カード {yen(r.card_gross)}
              {r.uri > 0 ? ` / 売掛 ${yen(r.uri)}` : ""}
              {r.closed_by && closerNames[r.closed_by] ? ` ・ 締め ${closerNames[r.closed_by]}` : ""}
            </span>
            <span className="a num">{yen(r.cash + r.card_gross + r.uri + r.other)}</span>
          </div>
        ))}
        <p style={{ ...t.sub, fontSize: 11, margin: "10px 0 6px" }}>全列（実査差・再締め等）は下の表で確認できます。</p>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              {["営業日", "伝票", "客数", "現金", "回収現金", "カード", "TAX", "売掛", "ドリンク売上", "未会計", "諸経費", "現金支払", "実査差", "再締め回数", "締め担当", ""].map((h) => (
                <th key={h} style={t.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td style={{ ...t.td, ...t.num }}>{r.biz_date}</td>
                <td style={{ ...t.td, ...t.num }}>{r.slips}</td>
                <td style={{ ...t.td, ...t.num }}>{r.guests}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.cash)}</td>
                <td style={{ ...t.td, ...t.num, color: r.ar_collected > 0 ? "var(--champ)" : undefined }}>{yen(r.ar_collected)}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.card_gross)}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.card_tax)}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.uri)}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.drink_sales)}</td>
                <td style={{ ...t.td, ...t.num }}>{r.open_checks_count}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.expense)}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.cash_payout)}</td>
                <td style={{ ...t.td, ...t.num, color: (r.diff ?? 0) < 0 ? "var(--bad)" : undefined }}>
                  {r.diff == null ? "—" : yen(r.diff)}
                </td>
                <td style={{ ...t.td, ...t.num }}>{r.reclosed_count}</td>
                {/* E8-2 #8: 締め担当（closed_by → users.name・表示専用） */}
                <td style={t.td}>{r.closed_by ? closerNames[r.closed_by] ?? "—" : "—"}</td>
                <td style={t.td}>
                  {isManagerUp && <button style={btnLight} onClick={() => reclose(r.id)}>再締め</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ ...t.sub, fontSize: 11, marginTop: 8 }}>
          実査差 = 実査 −（釣銭準備金 + 現金売上 + 回収現金 − 諸経費 − 現金支払）。現金売上と回収現金は別掲（混ぜない）。
        </p>
      </section>
      </>)}
    </div>
  );
}
