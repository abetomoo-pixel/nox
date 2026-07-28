"use client";

// 顧客一覧ボード（F3b-A 塊1＋B-3 休眠込み）。一覧＝customer_list_summary RPC（可視スコープ・churn 判定とも
// RPC 内確定＝アプリ側で再判定しない）。絞り込み（churn/検索）はクライアント側・店絞りは owner のみ p_store_id 再取得。
// 行タップ＝顧客詳細（塊2）への遷移構造。書込ボタンなし（登録/編集/担当割当は塊2）。
// B-3（mig0030）: 「休眠客を含む」トグル＝p_include_dormant を常に明示 boolean で送る（規約7 同列）。
// 既定 OFF=従来・状態は画面ローカル（永続化しない）。休眠行は詳細ヘッダと同型の休眠 pill。
// 掘り起こし＝休眠込み時のみ「来店が古い順」ソート（クライアント側 sort・RPC の既定順は触らない。
// 来店なし（last_visit null）は掘り起こし対象外に近いため末尾に置く）。可視スコープは RPC CTE が担保＝
// cast は RPC 側で true でも休眠不可視（段23-3 実測）・UI でもトグルを出さない（canDormant 一次ガード）。
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import CastAvatar from "@/components/ui/cast-avatar";

type Store = { id: string; name: string };
type Cast = { id: string; name: string; store_id: string; is_active: boolean };
type Row = {
  customer_id: string; name: string; furigana: string | null; cast_id: string | null;
  is_active: boolean; visits: number; last_visit: string | null; total_spend: number;
  active_bottles: number; open_receivable: number; days_since: number | null;
  churn_tier: "none" | "mid" | "high";
};
// 段U2: セグメントに「新規/リピート」を追加。churn は RPC 側の判定（churn_tier）をそのまま使い、
//   new/repeat は既存 visits の閾値だけで出し分ける（★新しい離反判定は作らない・相談役メモ①の「新規 visits≤1」）。
type Tier = "all" | "risk" | "new" | "repeat";
// 段U2: 詳細ペインで使う既存 RPC の返り（席・指名は customer_visit_history に元から含まれる＝実測済み）
type Visit = {
  check_id: string; visited_at: string; total: number;
  seat_name: string | null; nom_casts: string[] | null; status: string;
};
type Bottle = { id: string; product_id: string | null; status: string; opened_at: string | null; note: string | null };
type CustRow = { id: string; name: string; furigana: string | null; birthday: string | null; memo: string | null };

const yen = (n: number) => "¥" + n.toLocaleString();
const secTitle: React.CSSProperties = t.cardTitle;
const input: React.CSSProperties = { ...t.input, padding: "8px 10px", fontSize: 13 };
const segBtn = (on: boolean): React.CSSProperties => ({
  ...t.btnGhost, ...t.btnSm,
  ...(on ? { background: "linear-gradient(135deg,var(--gold2),#B8893A)", color: "#0B0B0F", border: 0, fontWeight: 800 } : {}),
});
// 段U2: churn pill / 休眠 pill の inline style は .nox-risk（mid=金・hi=赤・off=neutral）へ移した
//   ＝色の意味（high=赤 / mid=金 / 休眠=neutral）は現行と同一・判定は引き続き RPC の churn_tier のみ。

function fmtBirthday(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

function fmtLastVisit(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
}

export default function CustomersBoard({
  isOwner, isManagerUp, stores, casts, myStoreId, canDormant,
}: {
  isOwner: boolean; isManagerUp: boolean; stores: Store[]; casts: Cast[]; myStoreId: string; canDormant: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [storeSel, setStoreSel] = useState(""); // owner のみ・'' = 全店（p_store_id null）
  const [tier, setTier] = useState<Tier>("all");
  const [q, setQ] = useState("");
  const [incDormant, setIncDormant] = useState(false);  // B-3: 休眠込み（既定 OFF=従来・画面ローカル）
  const [sortOldest, setSortOldest] = useState(false);  // B-3: 掘り起こし順（休眠込み時のみ有効）
  // ── 段U2: 右詳細ペイン（正本 nox-customers-redesign-mock-v1.html）──
  //   ★編集・担当割当は現行どおり /customers/[id] のまま＝ここは読取と導線だけ（機能/RPC 不変）。
  const [sel, setSel] = useState<string | null>(null);
  const [dCust, setDCust] = useState<CustRow | null>(null);
  const [dVisits, setDVisits] = useState<Visit[]>([]);
  const [dBottles, setDBottles] = useState<Bottle[]>([]);
  const [prodName, setProdName] = useState<Record<string, string>>({});

  // 客追加フォーム（customer_register）。担当 cast は owner/manager のみ表示
  // （staff は RPC 側で p_cast_id が null 化される既存仕様＝出さない）。
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [aName, setAName] = useState("");
  const [aFuri, setAFuri] = useState("");
  const [aTel, setATel] = useState("");
  const [aPrefs, setAPrefs] = useState("");
  const [aMemo, setAMemo] = useState("");
  const [aStore, setAStore] = useState(myStoreId || stores[0]?.id || "");
  const [aCast, setACast] = useState("");

  const castName = useMemo(() => {
    const m = new Map(casts.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "フリー");
  }, [casts]);

  const load = useCallback(async () => {
    const supabase = createClient();
    setErr(null);
    // p_include_dormant は常に明示 boolean（規約7 同列・省略に頼らない）
    const { data, error } = await supabase.rpc("customer_list_summary", {
      p_store_id: storeSel || null, p_include_dormant: incDormant,
    });
    if (error) { setErr(`読み込みに失敗: ${error.message}`); setRows([]); return; }
    setRows((data ?? []) as Row[]);
  }, [storeSel, incDormant]);

  useEffect(() => { void load(); }, [load]);

  // 段U2: 選択顧客の詳細（既存 RPC＋既存テーブルの素の SELECT・新規 RPC ゼロ）。
  //   来店履歴＝customer_visit_history（★席 seat_name と指名 nom_casts は元から返る＝現物実測で確認済み・
  //     現行の詳細ページでも既に描画している＝新情報ではない）。
  //   ボトルキープ＝bottle_keeps の直 SELECT（bottle-keep-panel と同じ経路）。★RLS は can_register 軸ゆえ
  //     can_crm だけの staff は 0行になりうる＝そのときは明細を出さず件数（RPC 集計 active_bottles）だけが残る。
  const loadDetail = useCallback(async (id: string) => {
    const supabase = createClient();
    const [cRes, vRes, bRes] = await Promise.all([
      supabase.from("customers").select("id, name, furigana, birthday, memo").eq("id", id).maybeSingle(),
      supabase.rpc("customer_visit_history", { p_customer_id: id }),
      supabase.from("bottle_keeps").select("id, product_id, status, opened_at, note").eq("customer_id", id).order("created_at", { ascending: false }),
    ]);
    setDCust((cRes.data ?? null) as CustRow | null);
    setDVisits(((vRes.data ?? []) as Visit[]).slice(0, 5));
    const bs = (bRes.data ?? []) as Bottle[];
    setDBottles(bs);
    const pids = [...new Set(bs.map((b) => b.product_id).filter(Boolean) as string[])];
    if (pids.length) {
      const { data: ps } = await supabase.from("products").select("id, name").in("id", pids);
      const m: Record<string, string> = {};
      for (const x of (ps ?? []) as { id: string; name: string }[]) m[x.id] = x.name;
      setProdName(m);
    }
  }, []);
  useEffect(() => {
    if (!sel) { setDCust(null); setDVisits([]); setDBottles([]); return; }
    void loadDetail(sel);
  }, [sel, loadDetail]);

  const filtered = useMemo(() => {
    const needle = q.trim();
    return rows.filter((r) => {
      // ★churn の判定は RPC が返す churn_tier をそのまま使う（アプリ側で再判定しない＝現行方針）。
      const okTier =
        tier === "all" ? true
        : tier === "risk" ? (r.churn_tier === "high" || r.churn_tier === "mid")
        : tier === "new" ? r.visits <= 1
        : r.visits > 1;
      return okTier && (needle === "" || r.name.includes(needle) || (r.furigana ?? "").includes(needle));
    });
  }, [rows, tier, q]);

  // 掘り起こし順（休眠込み時のみ）: 最終来店が古い順・来店なし（null）は末尾＝掘り起こし対象外に近い扱い。
  // OFF 時は RPC の既定順（last_visit desc nulls last）をそのまま維持＝再ソートしない。
  const display = useMemo(() => {
    if (!(incDormant && sortOldest)) return filtered;
    const visited = filtered.filter((r) => r.last_visit !== null)
      .sort((a, b) => new Date(a.last_visit!).getTime() - new Date(b.last_visit!).getTime());
    return [...visited, ...filtered.filter((r) => r.last_visit === null)];
  }, [filtered, incDormant, sortOldest]);

  const highCount = rows.filter((r) => r.churn_tier === "high").length;
  const midCount = rows.filter((r) => r.churn_tier === "mid").length;
  // 段U2 KPI: いずれも rows（customer_list_summary の返り）からの再掲＝新規取得も新規集計もしない。
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthVisited = rows.filter((r) => r.last_visit && r.last_visit.slice(0, 7) === thisMonth).length;
  const bottleTotal = rows.reduce((a, r) => a + (r.active_bottles ?? 0), 0);
  const selRow = sel ? rows.find((r) => r.customer_id === sel) ?? null : null;

  function openAdd() {
    setAName(""); setAFuri(""); setATel(""); setAPrefs(""); setAMemo("");
    setAStore(isOwner ? (storeSel || myStoreId || stores[0]?.id || "") : myStoreId);
    setACast(""); setMsg(null); setAddOpen(true);
  }

  async function submitAdd() {
    setBusy(true); setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("customer_register", {
      p_store_id: aStore,
      p_name: aName.trim(),
      p_furigana: aFuri.trim() || null,
      p_birthday: null,
      p_tel: aTel.trim() || null,
      p_prefs: aPrefs.trim() || null,
      p_memo: aMemo.trim() || null,
      p_cast_id: isManagerUp ? (aCast || null) : null, // staff は RPC 側でも null 化（二重）
    });
    setBusy(false);
    if (error) { setMsg(`登録に失敗: ${error.message}`); return; }
    setMsg("登録しました");
    setAddOpen(false);
    await load();
  }

  const addCastOptions = casts.filter((c) => c.store_id === aStore && c.is_active);

  return (
    <div>
      <div style={{ margin: "2px 0 14px" }}>
        <h1 style={t.pheadH1}>顧客</h1>
        <p style={t.pheadP}>来店状況と離反リスク（60日/30日）</p>
      </div>

      {/* 段U2: KPI 帯＝すべて customer_list_summary の再掲（新規集計ゼロ）。
          顧客数＝取得行数／今月来店＝last_visit が今月の人数／離反リスク高＝churn_tier='high'／
          ボトルキープ中＝active_bottles の合計（RPC の definer 集計値をそのまま足すだけ）。 */}
      <div className="nox-kpirow">
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">顧客数</div>
          <div className="nox-kpi2-v num">{rows.length}<small>人</small></div>
          <div className="nox-kpi2-s">{incDormant ? "休眠を含む" : "休眠を除く"}</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">今月来店</div>
          <div className="nox-kpi2-v num">{monthVisited}<small>人</small></div>
          <div className="nox-kpi2-s">最終来店が今月</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">離反リスク高（60日〜）</div>
          <div className="nox-kpi2-v num">{highCount}<small>人</small></div>
          <div className="nox-kpi2-s">中（30日〜） {midCount}人</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">ボトルキープ中</div>
          <div className="nox-kpi2-v num">{bottleTotal}<small>本</small></div>
          <div className="nox-kpi2-s">未開栓の合計</div>
        </div>
      </div>

      <section className="nox-cardtop" style={t.card}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 11 }}>
          <h2 style={{ ...secTitle, margin: 0 }}>顧客一覧</h2>
          <button
            style={{ ...(addOpen ? t.btnGhost : t.btnGold), ...t.btnSm, marginLeft: "auto" }}
            onClick={() => (addOpen ? setAddOpen(false) : openAdd())}
          >
            {addOpen ? "閉じる" : "＋客を追加"}
          </button>
        </div>
        {msg && <p style={{ fontSize: 12.5, fontWeight: 700, color: msg.includes("失敗") ? "var(--bad)" : "var(--ok)", margin: "0 0 8px" }}>{msg}</p>}

        {addOpen && (
          <div style={{ display: "grid", gap: 10, marginBottom: 14, padding: "11px 12px", background: "var(--bg2)", borderRadius: 12, border: "1px solid var(--line2)" }}>
            {isOwner && stores.length > 1 && (
              <div>
                <label style={t.fieldLabel}>店舗</label>
                <select value={aStore} onChange={(e) => { setAStore(e.target.value); setACast(""); }} style={{ ...input, width: "100%", marginTop: 4 }}>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={t.fieldLabel}>名前（必須）</label>
              <input value={aName} onChange={(e) => setAName(e.target.value)} style={{ ...input, width: "100%", marginTop: 4 }} />
            </div>
            <div>
              <label style={t.fieldLabel}>ふりがな</label>
              <input value={aFuri} onChange={(e) => setAFuri(e.target.value)} style={{ ...input, width: "100%", marginTop: 4 }} />
            </div>
            <div>
              <label style={t.fieldLabel}>電話</label>
              <input value={aTel} onChange={(e) => setATel(e.target.value)} style={{ ...input, width: "100%", marginTop: 4 }} />
            </div>
            <div>
              <label style={t.fieldLabel}>好み</label>
              <input value={aPrefs} onChange={(e) => setAPrefs(e.target.value)} style={{ ...input, width: "100%", marginTop: 4 }} />
            </div>
            <div>
              <label style={t.fieldLabel}>備考</label>
              <input value={aMemo} onChange={(e) => setAMemo(e.target.value)} style={{ ...input, width: "100%", marginTop: 4 }} />
            </div>
            {isManagerUp && (
              <div>
                <label style={t.fieldLabel}>初期担当キャスト（任意）</label>
                <select value={aCast} onChange={(e) => setACast(e.target.value)} style={{ ...input, width: "100%", marginTop: 4 }}>
                  <option value="">担当なし（フリー客）</option>
                  {addCastOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <button style={{ ...t.btnGold, opacity: busy || !aName.trim() ? 0.6 : 1 }} disabled={busy || !aName.trim()} onClick={() => void submitAdd()}>
              {busy ? "登録中…" : "登録する"}
            </button>
          </div>
        )}

        {isOwner && stores.length > 1 && (
          <div style={{ marginBottom: 10 }}>
            <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} style={{ ...input, width: "100%" }}>
              <option value="">全店</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {/* 段U2: すべて/離反リスク/新規/リピート（モック .seg）。
            ★離反の判定は RPC の churn_tier をそのまま使う＝アプリ側で再判定しない（現行方針）。 */}
        <div className="nox-seg" style={{ marginBottom: 10, width: "fit-content" }}>
          {([["all", `すべて（${rows.length}）`], ["risk", `離反リスク（${highCount + midCount}）`],
             ["new", "新規"], ["repeat", "リピート"]] as const).map(([k, label]) => (
            <button key={k} className={tier === k ? "on" : ""} onClick={() => setTier(k)}>{label}</button>
          ))}
        </div>
        {canDormant && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={incDormant} onChange={(e) => setIncDormant(e.target.checked)} />
              休眠客を含む
            </label>
            {incDormant && (
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <button style={segBtn(!sortOldest)} onClick={() => setSortOldest(false)}>新しい順</button>
                <button style={segBtn(sortOldest)} onClick={() => setSortOldest(true)}>掘り起こし順（来店が古い順）</button>
              </div>
            )}
          </div>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前・ふりがなで検索"
          style={{ ...input, width: "100%", marginBottom: 4 }}
        />

        {err && <p style={{ fontSize: 12.5, color: "var(--bad)", fontWeight: 700 }}>{err}</p>}
        {!err && display.length === 0 && <p style={{ fontSize: 13, color: "var(--v2-muted)" }}>該当する顧客がいません</p>}

        {/* 段U2: リスト＋右詳細の2ペイン（>900）。≤900 は CSS で1カラム＝詳細はリストの下に続けて出る。
            ★行タップは「右詳細を開く」に変わったが、編集・担当割当は従来どおり /customers/[id]（導線を残す）。 */}
        <div className="nox-2pane">
          <div>
            {display.map((r) => (
              <button
                key={r.customer_id}
                className={`nox-crow2 ${sel === r.customer_id ? "sel" : ""}`}
                onClick={() => setSel(sel === r.customer_id ? null : r.customer_id)}
              >
                {/* 段E: 頭文字アバター（既存 name のみ由来・新情報なし・装飾）＝顧客は写真を持たない */}
                <CastAvatar name={r.name} size={38} />
                <div className="cinfo">
                  <div className="nm">
                    {r.name}
                    {!r.is_active && <span className="nox-risk off">休眠</span>}
                    {r.churn_tier === "high" && <span className="nox-risk hi">60日〜</span>}
                    {r.churn_tier === "mid" && <span className="nox-risk mid">30日〜</span>}
                    {r.visits <= 1 && r.churn_tier === "none" && <span className="nox-risk new">新規</span>}
                  </div>
                  <div className="sub">
                    担当：{castName(r.cast_id)}{r.furigana ? `・${r.furigana}` : ""}
                    {r.open_receivable > 0 && <span style={{ color: "var(--bad)" }}>・売掛 {yen(r.open_receivable)}</span>}
                  </div>
                </div>
                <div className="stats">
                  {/* 累計金額＝読む情報ゆえ白（金3役の原則・可視性は RPC の返却仕様のまま） */}
                  <div className="spend num">{yen(r.total_spend)}</div>
                  <div className="visits num">
                    来店{r.visits}回{r.last_visit ? `・最終 ${fmtLastVisit(r.last_visit)}` : "・来店なし"}
                  </div>
                </div>
              </button>
            ))}
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
              {display.length}件{tier !== "all" || q ? `（全${rows.length}件）` : ""}・
              {incDormant ? "休眠客を含めて表示中" : "休眠中の顧客は表示されません"}
            </p>
          </div>

          {/* 右詳細＝3stat／ボトルキープ／来店履歴／メモ（すべて既存データ・編集は [id] へ） */}
          {selRow && (
            <div style={{ ...t.card, marginBottom: 0, background: "var(--card2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <CastAvatar name={selRow.name} size={44} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--v2-text)" }}>{selRow.name}</div>
                  <div style={{ fontSize: 11, color: "var(--v2-muted)" }}>
                    {[dCust?.furigana, `担当：${castName(selRow.cast_id)}`,
                      dCust?.birthday ? `誕生日 ${fmtBirthday(dCust.birthday)}` : null]
                      .filter(Boolean).join(" / ")}
                  </div>
                </div>
                <button style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto" }} onClick={() => setSel(null)}>閉じる</button>
              </div>

              <div className="nox-dstats">
                <div className="nox-dstat"><div className="l">来店</div><div className="v num">{selRow.visits}回</div></div>
                <div className="nox-dstat"><div className="l">累計</div><div className="v num">{yen(selRow.total_spend)}</div></div>
                <div className="nox-dstat">
                  <div className="l">最終来店</div>
                  <div className="v num">{selRow.last_visit ? fmtLastVisit(selRow.last_visit) : "—"}</div>
                </div>
              </div>

              <div className="nox-sect">ボトルキープ（{selRow.active_bottles}本）</div>
              {dBottles.length === 0
                ? <p style={{ fontSize: 12, color: "var(--v2-muted)", margin: 0 }}>
                    {selRow.active_bottles > 0 ? "明細は表示できません（権限の範囲外）" : "キープなし"}
                  </p>
                : dBottles.map((b) => (
                    <div key={b.id} className="nox-btl">
                      <span>{(b.product_id && prodName[b.product_id]) || b.note || "（銘柄不明）"}</span>
                      <span className={`st ${b.status === "active" ? "act" : "emp"}`}>
                        {b.status === "active" ? "キープ中" : "空"}
                        {b.opened_at ? `（${fmtLastVisit(b.opened_at)}）` : ""}
                      </span>
                    </div>
                  ))}

              <div className="nox-sect">来店履歴（直近5件）</div>
              {dVisits.length === 0
                ? <p style={{ fontSize: 12, color: "var(--v2-muted)", margin: 0 }}>来店履歴なし</p>
                : dVisits.map((v) => (
                    <div key={v.check_id} className="nox-visit">
                      <span className="d num">{fmtLastVisit(v.visited_at)}</span>
                      {/* ★席・指名は customer_visit_history が元から返す列（現行の詳細ページでも描画済み） */}
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[v.seat_name, v.nom_casts?.length ? v.nom_casts.join("、") : null].filter(Boolean).join("・") || "—"}
                      </span>
                      <span className="a num">{yen(v.total)}</span>
                    </div>
                  ))}

              <div className="nox-sect">メモ</div>
              {dCust?.memo
                ? <div className="nox-memo">{dCust.memo}</div>
                : <p style={{ fontSize: 12, color: "var(--v2-muted)", margin: 0 }}>メモなし</p>}

              <Link href={`/customers/${selRow.customer_id}`}
                style={{ ...t.btnGhost, ...t.btnSm, display: "inline-block", marginTop: 12, textDecoration: "none" }}>
                詳細・編集を開く ›
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
