"use client";

// ホームのボード（E5）。読取専用＝書込 RPC なし（承認操作は DrinkClaimQueue 内で完結）。
// KPI の材料はすべて既存可視面：attendance（staff も可視＝台帳#24）・daily_reports（締め済み実績）・
// get_cast_ranking（順位/件数のみ・金額列なし・staff 開放済み=mig0011）。
// 今月売上は「締め済み日報の積み上げ」＝現金+カードグロス+売掛+その他（モック日報の売上4分類と同型）。
// 未締め当日分は含まない（会計中の変動値を KPI に出さない＝日報が正）。
//
// ── UI刷新v2 段H2（ホーム刷新・正本 nox-home-redesign-mock-v2.html）── presentation-only 2026-07-28 ──
//   ★新規集計ゼロ＝既存テーブルの素の SELECT と、S-1 で確立済みの導出の流用のみ。
//     追加取得は shifts（当日）/ staffing_needs / notices（最新2件）の3本で、いずれも
//     他画面（shift-board / notices-board）と同じ列・同じ RLS を通る読取。
//   ★予想人件費（段S-2）はホームには出さない（モックにも無い＝店長は /shift で見る）。
//   ★cast ロールは page.tsx が /mine へ戻すため本ボードに到達しない（対象外）。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf } from "@/lib/nox/biz-date";
import { fmtWin } from "@/lib/nox/shift-time";
import * as t from "@/lib/nox/ui/theme";
import CastAvatar from "@/components/ui/cast-avatar";
import { resolveOrgId, signCastPhotos } from "@/lib/nox/cast-photo";
import DrinkClaimQueue from "../register/drink-claim-queue";

type Cast = { id: string; name: string; photo_updated_at: string | null };
type Att = { cast_id: string; status: string; eta: string | null };
type ReportRow = { biz_date: string; cash: number; card_gross: number; uri: number; other: number };
// get_cast_ranking の返り列に一致（hon_count/jonai_count/dohan_count・不一致だと NaN になっていた）
type RankRow = { rank: number; cast_id: string; cast_name: string; hon_count: number; jonai_count: number; dohan_count: number };
type Shift = { cast_id: string; start_hm: string; end_hm: string; status: string };
type Need = { dow: number; required: number };
type Notice = { id: string; title: string; created_at: string };

const yen = (n: number) => "¥" + n.toLocaleString();
const secTitle: React.CSSProperties = t.cardTitle;
// 出勤板（shift-board）と同じ語彙＝ATT_OPTIONS の表示側
const ATT_LABEL: Record<string, string> = { shukkin: "出勤", dohan: "同伴", late: "遅刻", off: "休み", absent: "当欠" };
const PRESENT = new Set(["shukkin", "dohan", "late"]);

// 段H2: 充足判定は S-1（shift-board）と同一規則を流用＝新しい判定を作らない（ガイド §1-4 の3色のみ）。
type Fill = "none" | "ok" | "warn" | "ng";
const fillOf = (assigned: number, required: number): Fill =>
  required <= 0 ? "none" : assigned >= required ? "ok" : required - assigned === 1 ? "warn" : "ng";
const FILL_LABEL: Record<Fill, string> = { none: "未設定", ok: "充足", warn: "やや不足", ng: "不足" };
/** 'YYYY-MM-DD' → 曜日（0=日）。ローカル TZ 非依存（S-1 の dowOf と同式）。 */
const dowOf = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const mdOf = (iso: string) =>
  new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });

export default function DashboardBoard({ storeId, storeName, cutoff, casts, shortcuts }: {
  storeId: string; storeName: string; cutoff: string; casts: Cast[];
  shortcuts: { href: string; label: string; icon: string }[];
}) {
  const supabase = createClient();
  const bizToday = bizDateOf(new Date().toISOString(), cutoff);
  const month = bizToday.slice(0, 7);
  const [atts, setAtts] = useState<Att[]>([]);
  const [monthSales, setMonthSales] = useState(0);
  const [reportDays, setReportDays] = useState(0);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  // 段H2 追加取得（いずれも既存テーブルの素の SELECT・RLS はそのまま）
  const [todayShifts, setTodayShifts] = useState<Shift[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    const { data: at } = await supabase.from("attendance")
      .select("cast_id, status, eta").eq("date", bizToday);
    const { data: rs } = await supabase.from("daily_reports")
      .select("biz_date, cash, card_gross, uri, other")
      .gte("biz_date", `${month}-01`).lte("biz_date", `${month}-31`);
    const { data: rk } = storeId
      ? await supabase.rpc("get_cast_ranking", { p_store_id: storeId, p_period: month })
      : { data: null };
    // 段H2: 当日シフト＋必要人数（曜日別）＝S-1 と同じ列・同じ導出。日別の必要人数は現スキーマに無い。
    const { data: sh } = await supabase.from("shifts")
      .select("cast_id, start_hm, end_hm, status").eq("date", bizToday);
    const { data: ns } = await supabase.from("staffing_needs").select("dow, required");
    // 段H2: お知らせ最新2件（notices-board と同じ並び＝pinned 優先→新しい順・RLS が可視範囲を保証）
    const { data: nt } = await supabase.from("notices")
      .select("id, title, created_at")
      .order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(2);
    const reports = (rs ?? []) as ReportRow[];
    setAtts((at ?? []) as Att[]);
    setMonthSales(reports.reduce((a, r) => a + r.cash + r.card_gross + r.uri + r.other, 0));
    setReportDays(reports.length);
    setRanking(((rk ?? []) as RankRow[]).slice(0, 5));
    setTodayShifts((sh ?? []) as Shift[]);
    setNeeds((ns ?? []) as Need[]);
    setNotices((nt ?? []) as Notice[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizToday, month, storeId]);

  useEffect(() => { void load(); }, [load]);

  // 段P: キャスト写真の署名 URL（写真ありの行だけ 1 リクエスト）。失敗しても頭文字に落ちるだけ。
  useEffect(() => {
    let alive = true;
    void (async () => {
      const orgId = await resolveOrgId(supabase);
      if (!orgId) return;
      const m = await signCastPhotos(supabase, orgId, casts);
      if (alive) setPhotoUrls(m);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casts]);

  const castName = (id: string) => casts.find((c) => c.id === id)?.name ?? "?";
  const present = atts.filter((a) => PRESENT.has(a.status));
  const dohanToday = atts.filter((a) => a.status === "dohan").length;
  const honMonth = ranking.reduce((a, r) => a + r.hon_count, 0);

  // 段H2: 今日のシフト概況＝S-1 と同一導出（確定数＋曜日別の必要人数＋3色の充足判定）。
  const confirmedToday = todayShifts.filter((s) => s.status === "confirmed").length;
  const requiredToday = needs.find((n) => n.dow === dowOf(bizToday))?.required ?? 0;
  const todayFill = fillOf(todayShifts.length, requiredToday);
  const shortageToday = Math.max(0, requiredToday - todayShifts.length);
  /** 出勤チップに出す開始時刻＝その cast の当日シフト（最も早い開始）。無ければ null。 */
  const startOf = (castId: string) => {
    const mine = todayShifts.filter((s) => s.cast_id === castId);
    if (mine.length === 0) return null;
    return mine.slice().sort((a, b) => a.start_hm.localeCompare(b.start_hm))[0];
  };

  return (
    <div>
      {/* 段0R 第1陣: モック .head を新シェルの nox-hero へ（ページ名＋店名＋営業日） */}
      <div className="nox-hero">
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 8px", fontWeight: 700 }}>ホーム</h1>
          <p style={{ margin: 0, color: "var(--sub)", fontSize: 14 }}>{storeName}</p>
        </div>
        <span className="num" style={{ fontSize: 13, color: "var(--sub)" }}>営業日 {bizToday}</span>
      </div>

      {/* 段H2: KPI 帯＝既存4KPI のまま（材料も式も不変）。S-1 の .nox-kpi2 へ寄せ、
          モック .cmp にあたる補足行を既存データから足しただけ（新規取得なし）。
          段0R 第1陣その2: モック v2 の並び（KPI 帯 → クイックアクション → 2カラム）へ移動。
          ★JSX の並び替えだけで、材料・式・4枚の内容は1文字も変えていない。 */}
      <div className="nox-kpis">
        <div className="nox-kpi">
          <div className="lbl">本日の出勤</div>
          <div className="val num">{present.length}<small>名</small></div>
          <div className="sub">確定シフト {confirmedToday}人</div>
        </div>
        <div className="nox-kpi">
          <div className="lbl">本日の同伴</div>
          <div className="val num">{dohanToday}<small>件</small></div>
          <div className="sub">出勤のうち同伴</div>
        </div>
        {/* money＝売上カードの意味づけ（モック .kpi.money と同じマーカー）。
            段0R 第1陣その2: 金の3役（選択・主ボタン・バッジ）に KPI 強調は含まれないため
            gold 枠は撤去し、枠は他カードと同一・数値は白（.val の var(--ink)）。 */}
        <div className="nox-kpi money">
          <div className="lbl">今月売上（締め済み日報）</div>
          <div className="val num">{yen(monthSales)}</div>
          <div className="sub">日報 {reportDays}日分</div>
        </div>
        <div className="nox-kpi">
          <div className="lbl">本指名（今月）</div>
          <div className="val num">{honMonth}<small>本</small></div>
          <div className="sub">ランキング上位5名の合計</div>
        </div>
      </div>

      {/* 段H: クイックアクション＝既存ルートへの純ナビ（役割ゲートは nav と同一・page で算出済み）。
          段H2: アイコンを追加（モック .qi の Unicode 字形・href/label/ゲートは段H から不変）。
          段0R 第1陣その2: KPI 帯の下へ移動（モック順）。上の marginTop は KPI 帯の
          margin-bottom 14px と二重になるため marginBottom 14 に付け替え＝14px 刻みで揃える。 */}
      {shortcuts.length > 0 && (
        <section style={{ marginBottom: 14 }}>
          <h2 style={{ ...t.cardTitle, margin: "0 0 9px" }}>クイックアクション</h2>
          <div className="nox-quickgrid">
            {shortcuts.map((s) => (
              <Link key={s.href} href={s.href} className="nox-quicktile">
                <span className="nox-quickicon" aria-hidden="true">{s.icon}</span>
                {s.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 段0R 第1陣: モック .cols＝左（今日のシフト＋承認待ち）／右（ランキング＋お知らせ）の2カラム。
          900+ で横並び・≤900 は縦積み（.nox-2col）。 */}
      <div className="nox-2col">
      <div>
      {/* 段H2: 今日のシフト概況＝S-1 の充足導出の流用＋出勤キャストの写真チップ＋シフトへの導線。
          ★必要人数は曜日別マスタ（staffing_needs は (store_id, dow) UNIQUE）＝日別・時間帯別の
            必要人数は現スキーマに無いので「◯◯帯が-1」のような時間帯単位の不足は出さない。 */}
      <section className="nox-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
          <h2 style={{ ...secTitle, margin: 0 }}>今日のシフト</h2>
          <Link href="/shift" className="nox-more">シフト管理へ ›</Link>
        </div>
        <div className="nox-hshift">
          <span className={`nox-stpill ${todayFill === "none" ? "" : todayFill}`}>{FILL_LABEL[todayFill]}</span>
          <span className="num">確定 {confirmedToday} / 予定 {todayShifts.length - confirmedToday}</span>
          <span style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>
            {requiredToday > 0
              ? `必要 ${requiredToday}人${shortageToday > 0 ? `・あと${shortageToday}人` : ""}`
              : "必要人数 未設定"}
          </span>
        </div>
        {present.length === 0 && (
          <p style={{ fontSize: 12.5, color: "var(--v2-muted)", margin: 0 }}>まだ出勤記録がありません</p>
        )}
        <div className="nox-avarow">
          {present.map((a) => {
            const s = startOf(a.cast_id);
            return (
              <span key={a.cast_id} className="nox-avachip">
                <CastAvatar name={castName(a.cast_id)} url={photoUrls.get(a.cast_id)} variant="flat" />
                {castName(a.cast_id)}
                <span className="tm num">
                  {s ? fmtWin(s.start_hm, s.end_hm) : ATT_LABEL[a.status] ?? a.status}
                  {a.eta ? `・見込み ${a.eta}` : ""}
                </span>
              </span>
            );
          })}
        </div>
      </section>

      {/* 承認待ちドリンク申告（既存部品の再掲載＝0件なら部品側が非表示にする） */}
      <DrinkClaimQueue />
      </div>
      <div>

      <section className="nox-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
          <h2 style={{ ...secTitle, margin: 0 }}>指名ランキング（{month}・件数）</h2>
          <Link href="/analytics" className="nox-more">分析へ ›</Link>
        </div>
        {ranking.length === 0 && <p style={{ fontSize: 12.5, color: "var(--v2-muted)", margin: 0 }}>データがありません</p>}
        {ranking.map((r) => (
          <div key={r.cast_id} className="nox-rk">
            {/* 段F の .nox-medal を再利用（1/2/3 は金銀銅・4位以降は neutral） */}
            <span className={`nox-medal ${r.rank === 1 ? "g1" : r.rank === 2 ? "g2" : r.rank === 3 ? "g3" : "gx"}`}>{r.rank}</span>
            <CastAvatar name={r.cast_name} url={photoUrls.get(r.cast_id)} variant="flat" />
            <span>{r.cast_name}</span>
            <span className="pt num">本指名 {r.hon_count}・場内 {r.jonai_count}・同伴 {r.dohan_count}</span>
          </div>
        ))}
      </section>

      {/* 段H2: お知らせ最新2件＋一覧への導線（notices-board と同じ並び・本文は出さず件名のみ） */}
      <section className="nox-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
          <h2 style={{ ...secTitle, margin: 0 }}>お知らせ</h2>
          <Link href="/notices" className="nox-more">すべて ›</Link>
        </div>
        {notices.length === 0 && <p style={{ fontSize: 12.5, color: "var(--v2-muted)", margin: 0 }}>お知らせはありません</p>}
        {notices.map((n) => (
          <div key={n.id} className="nox-hrow">
            <span className="num" style={{ color: "var(--v2-muted)", flexShrink: 0 }}>{mdOf(n.created_at)}</span>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
          </div>
        ))}
      </section>
      </div>
      </div>
    </div>
  );
}
