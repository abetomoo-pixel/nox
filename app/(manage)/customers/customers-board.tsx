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
import Modal from "@/components/ui/modal";

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
// E8-3 #7（mig0094）: 残量%・保管期限・棚番号（表示＋bottle_keep_update モーダル）
type Bottle = {
  id: string; product_id: string | null; status: string; opened_at: string | null; note: string | null;
  remaining_pct: number | null; expires_on: string | null; shelf_no: string | null;
};
// E8-3 #5/#6/#2: 右ペインのプロフィール材料（tel/prefs/grade を追加取得・表示専用）
//   E8-6（mig0096）: store_id を追加取得＝来店傾向 RPC（store_hourly_aggregate）の p_store_id 解決用
type CustRow = {
  id: string; name: string; furigana: string | null; birthday: string | null; memo: string | null;
  tel: string | null; prefs: string | null; grade: string | null; store_id: string;
};
// E8-3 #8（mig0094）: 顧客メモ履歴（customer_notes・is_removed 除外で取得）
type Note = { id: string; body: string; author_user_id: string | null; created_at: string };

const yen = (n: number) => "¥" + n.toLocaleString();
// 段0R 第2陣: 見出しは nox-panel > h3（白）と nox-hero h1 に寄せたので t.cardTitle 由来の secTitle は撤去。
const input: React.CSSProperties = { ...t.input, padding: "8px 10px", fontSize: 13 };
const segBtn = (on: boolean): React.CSSProperties => ({
  ...t.btnGhost, ...t.btnSm,
  ...(on ? { background: "linear-gradient(135deg,var(--gold2),var(--gold3))", color: "var(--on-gold)", border: 0, fontWeight: 800 } : {}),
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
  // E8-3 #3: 右詳細の4タブ（モック detail-tabs 準拠＝概要/来店/ボトル/メモ）
  const [dtab, setDtab] = useState<"info" | "visits" | "bottle" | "note">("info");
  // E8-3 #2: 一覧バッジ用の grade map（customers 直 select 1本・表示専用）
  const [gradeOf, setGradeOf] = useState<Record<string, string>>({});
  // E8-3 #8: メモ履歴（customer_notes）＋記入者名＋追記フォーム
  const [dNotes, setDNotes] = useState<Note[]>([]);
  // E8-6 customers#5: 来店傾向の要約文（owner/manager のみ取得・staff は null=「—」）
  const [dTrend, setDTrend] = useState<string | null>(null);
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});
  const [noteBody, setNoteBody] = useState("");
  // E8-3 #7: ボトル編集モーダル（bottle_keep_update・owner/manager）
  const [btlPick, setBtlPick] = useState<Bottle | null>(null);
  const [btlForm, setBtlForm] = useState({ remaining: "", expires: "", shelf: "", status: "active", note: "" });

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
  // E8-5 customers#10: 誕生日（列は既存・p_birthday null 固定の実質バグ是正＝入力欄を新設）
  const [aBirthday, setABirthday] = useState("");
  // E8-5 customers#1（T2）: 担当キャスト絞り込み（client のみ・""=全担当／"free"=フリー客）
  const [castFilter, setCastFilter] = useState("");

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
    // E8-3 #2: 一覧バッジ用 grade（customers 直 select・RLS スコープ内・表示専用）
    const { data: gs } = await supabase.from("customers").select("id, grade").not("grade", "is", null);
    setGradeOf(Object.fromEntries(((gs ?? []) as { id: string; grade: string }[]).map((g) => [g.id, g.grade])));
  }, [storeSel, incDormant]);

  useEffect(() => { void load(); }, [load]);

  // 段U2: 選択顧客の詳細（既存 RPC＋既存テーブルの素の SELECT・新規 RPC ゼロ）。
  //   来店履歴＝customer_visit_history（★席 seat_name と指名 nom_casts は元から返る＝現物実測で確認済み・
  //     現行の詳細ページでも既に描画している＝新情報ではない）。
  //   ボトルキープ＝bottle_keeps の直 SELECT（bottle-keep-panel と同じ経路）。★RLS は can_register 軸ゆえ
  //     can_crm だけの staff は 0行になりうる＝そのときは明細を出さず件数（RPC 集計 active_bottles）だけが残る。
  const loadDetail = useCallback(async (id: string) => {
    const supabase = createClient();
    setDTrend(null);
    const [cRes, vRes, bRes, nRes] = await Promise.all([
      supabase.from("customers").select("id, name, furigana, birthday, memo, tel, prefs, grade, store_id").eq("id", id).maybeSingle(),
      supabase.rpc("customer_visit_history", { p_customer_id: id }),
      supabase.from("bottle_keeps").select("id, product_id, status, opened_at, note, remaining_pct, expires_on, shelf_no").eq("customer_id", id).order("created_at", { ascending: false }),
      // E8-3 #8: メモ履歴（is_removed 除外・新しい順。RLS で cast は 0行＝段51(14) 実測済み）
      supabase.from("customer_notes").select("id, body, author_user_id, created_at")
        .eq("customer_id", id).eq("is_removed", false).order("created_at", { ascending: false }),
    ]);
    setDCust((cRes.data ?? null) as CustRow | null);
    setDVisits(((vRes.data ?? []) as Visit[]).slice(0, 5));
    const bs = (bRes.data ?? []) as Bottle[];
    setDBottles(bs);
    const notes = (nRes.data ?? []) as Note[];
    setDNotes(notes);
    const pids = [...new Set(bs.map((b) => b.product_id).filter(Boolean) as string[])];
    if (pids.length) {
      const { data: ps } = await supabase.from("products").select("id, name").in("id", pids);
      const m: Record<string, string> = {};
      for (const x of (ps ?? []) as { id: string; name: string }[]) m[x.id] = x.name;
      setProdName(m);
    }
    // E8-3 #8: 記入者名（users 1クエリ・表示専用）
    const uids = [...new Set(notes.map((n) => n.author_user_id).filter(Boolean) as string[])];
    if (uids.length) {
      const { data: us } = await supabase.from("users").select("id, name").in("id", uids);
      setAuthorNames(Object.fromEntries(((us ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name])));
    }
    // E8-6 customers#5（mig0096 結線）: 来店傾向＝store_hourly_aggregate の p_customer_id 絞込（直近92日）。
    //   RPC は owner/manager のみ＝staff（can_crm）は呼ばない（呼べば forbidden＝表示は「—」のまま）。
    const cRow = cRes.data as (CustRow & { store_id?: string }) | null;
    if (isManagerUp && cRow?.store_id) {
      const pad = (n: number) => String(n).padStart(2, "0");
      const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const to = new Date();
      const from = new Date(to.getTime() - 91 * 86_400_000); // RPC の 92日ガード内
      const { data: hr } = await supabase.rpc("store_hourly_aggregate", {
        p_store_id: cRow.store_id, p_from: ymd(from), p_to: ymd(to), p_customer_id: id,
      });
      const rows = (hr ?? []) as { dow: number; hour: number; check_count: number; stay_min_sum: number; stay_count: number }[];
      const n = rows.reduce((a, r) => a + r.check_count, 0);
      if (n === 0) setDTrend("直近3ヶ月の来店はありません");
      else {
        const DOWJ = ["日", "月", "火", "水", "木", "金", "土"];
        const byCell = new Map<string, number>();
        for (const r of rows) byCell.set(`${r.dow}-${r.hour}`, (byCell.get(`${r.dow}-${r.hour}`) ?? 0) + r.check_count);
        const top = [...byCell.entries()].sort((a, b) => b[1] - a[1])[0];
        const [d, h] = top[0].split("-").map(Number);
        const staySum = rows.reduce((a, r) => a + Number(r.stay_min_sum), 0);
        const stayCnt = rows.reduce((a, r) => a + r.stay_count, 0);
        const stay = stayCnt > 0 ? `・平均滞在 ${Math.round(staySum / stayCnt)}分` : "";
        setDTrend(`${DOWJ[d]}曜 ${h}時台が最多（直近3ヶ月 ${n}回中${top[1]}回）${stay}`);
      }
    }
  }, [isManagerUp]);
  useEffect(() => {
    if (!sel) { setDCust(null); setDVisits([]); setDBottles([]); setDNotes([]); return; }
    setDtab("info"); setNoteBody("");
    void loadDetail(sel);
  }, [sel, loadDetail]);

  // ── E8-3 書込アクション（mig0094 の RPC 結線・すべて owner/manager UI ガード＋RPC 二重防御）──
  async function setGrade(g: string | null) {
    if (!sel) return;
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("customer_set_grade", { p_id: sel, p_grade: g });
    setMsg(error
      ? (error.message.includes("bad grade") ? "ランクは VIP / VVIP のみです"
        : error.message.includes("forbidden") ? "権限がありません" : error.message)
      : g ? `ランクを ${g.toUpperCase()} にしました` : "ランクを解除しました");
    await loadDetail(sel);
    await load();
  }
  async function noteAdd() {
    if (!sel || !noteBody.trim()) return;
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("customer_note_add", { p_customer_id: sel, p_body: noteBody });
    setMsg(error
      ? (error.message.includes("bad body") ? "メモは1〜2000文字で入力してください" : error.message)
      : "メモを追記しました");
    if (!error) setNoteBody("");
    await loadDetail(sel);
  }
  async function noteRemove(id: string) {
    if (!sel) return;
    if (!confirm("このメモを削除しますか？（履歴からは非表示になります）")) return;
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("customer_note_remove", { p_note_id: id });
    setMsg(error ? error.message : "メモを削除しました");
    await loadDetail(sel);
  }
  function openBtl(b: Bottle) {
    setBtlPick(b);
    setBtlForm({
      remaining: b.remaining_pct != null ? String(b.remaining_pct) : "",
      expires: b.expires_on ?? "", shelf: b.shelf_no ?? "", status: b.status, note: b.note ?? "",
    });
  }
  async function btlSave() {
    if (!btlPick || !sel) return;
    setMsg(null);
    const supabase = createClient();
    // 規約7: 素通し送信（全値明示＝空欄は null）。RPC 側が bad remaining / bad status を権威判定。
    const { error } = await supabase.rpc("bottle_keep_update", {
      p_id: btlPick.id,
      p_remaining_pct: btlForm.remaining === "" ? null : Number(btlForm.remaining),
      p_expires_on: btlForm.expires || null,
      p_shelf_no: btlForm.shelf.trim() || null,
      p_status: btlForm.status,
      p_note: btlForm.note.trim() || null,
    });
    setMsg(error
      ? (error.message.includes("bad remaining") ? "残量は 0〜100 の整数で入力してください"
        : error.message.includes("bad status") ? "状態の指定が不正です" : error.message)
      : "ボトル情報を更新しました");
    if (!error) setBtlPick(null);
    await loadDetail(sel);
  }

  const filtered = useMemo(() => {
    const needle = q.trim();
    return rows.filter((r) => {
      // ★churn の判定は RPC が返す churn_tier をそのまま使う（アプリ側で再判定しない＝現行方針）。
      const okTier =
        tier === "all" ? true
        : tier === "risk" ? (r.churn_tier === "high" || r.churn_tier === "mid")
        : tier === "new" ? r.visits <= 1
        : r.visits > 1;
      // E8-5 customers#1（T2）: 担当キャストの AND 合成（"free"=担当なし）
      const okCast =
        castFilter === "" ? true
        : castFilter === "free" ? r.cast_id === null
        : r.cast_id === castFilter;
      return okTier && okCast && (needle === "" || r.name.includes(needle) || (r.furigana ?? "").includes(needle));
    });
  }, [rows, tier, q, castFilter]);

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
    setAName(""); setAFuri(""); setATel(""); setAPrefs(""); setAMemo(""); setABirthday("");
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
      // E8-5 customers#10: 実質バグ是正＝null 固定をやめ入力値を送る（空欄=null は従来同値）
      p_birthday: aBirthday || null,
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
      {/* 段0R 第2陣: モック .head を新シェルの nox-hero へ（/master・/home・/casts と同基準） */}
      <div className="nox-hero">
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 8px", fontWeight: 700 }}>顧客</h1>
          <p style={{ margin: 0, color: "var(--sub)", fontSize: 14 }}>
            来店状況と離反リスク（60日/30日）。行を選ぶと右に詳細（ボトルキープ・来店履歴・メモ）が開きます。
          </p>
        </div>
      </div>

      {/* 段U2: KPI 帯＝すべて customer_list_summary の再掲（新規集計ゼロ）。
          顧客数＝取得行数／今月来店＝last_visit が今月の人数／離反リスク高＝churn_tier='high'／
          ボトルキープ中＝active_bottles の合計（RPC の definer 集計値をそのまま足すだけ）。
          段0R 第2陣: S-1 由来の nox-kpirow/nox-kpi2 から aaa 基準の共通骨格 nox-kpis/nox-kpi へ
          載せ替え（lbl/val/sub のモック逐語構造）。★材料も式も4枚の内容も一切変えていない。 */}
      <div className="nox-kpis">
        <div className="nox-kpi">
          <div className="lbl">顧客数</div>
          <div className="val num">{rows.length}<small>人</small></div>
          <div className="sub">{incDormant ? "休眠を含む" : "休眠を除く"}</div>
        </div>
        <div className="nox-kpi">
          <div className="lbl">今月来店</div>
          <div className="val num">{monthVisited}<small>人</small></div>
          <div className="sub">最終来店が今月</div>
        </div>
        {/* モック .kpi.warn＝離反リスク高だけ数値を赤（--bad）。金は選択・主ボタン・バッジの3役のみ。 */}
        <div className="nox-kpi warn">
          <div className="lbl">離反リスク高（60日〜）</div>
          <div className="val num">{highCount}<small>人</small></div>
          <div className="sub">中（30日〜） {midCount}人</div>
        </div>
        <div className="nox-kpi">
          <div className="lbl">ボトルキープ中</div>
          <div className="val num">{bottleTotal}<small>本</small></div>
          <div className="sub">未開栓の合計</div>
        </div>
      </div>

      {/* 段0R 第2陣: モック .toolbar＝検索＋セグメント＋右端の顧客登録を1行に（/casts と同じ nox-ctoolbar）。
          ★従来は「顧客一覧」見出し行の追加ボタン／セグメント／検索が縦に散っていたのを並べ替えただけで、
            送る RPC も引数も出し分け条件も1文字も変えていない。 */}
      <div className="nox-ctoolbar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前・ふりがなで検索"
          aria-label="名前・ふりがなで検索"
          style={{ ...input, width: 220 }}
        />
        {/* 段U2: すべて/離反リスク/新規/リピート（モック .seg）。
            ★離反の判定は RPC の churn_tier をそのまま使う＝アプリ側で再判定しない（現行方針）。 */}
        <div className="nox-seg">
          {([["all", `すべて（${rows.length}）`], ["risk", `離反リスク（${highCount + midCount}）`],
             ["new", "新規"], ["repeat", "リピート"]] as const).map(([k, label]) => (
            <button key={k} className={tier === k ? "on" : ""} onClick={() => setTier(k)}>{label}</button>
          ))}
        </div>
        {isOwner && stores.length > 1 && (
          <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} aria-label="店舗" style={{ ...input, width: 150 }}>
            <option value="">全店</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <button
          style={{ ...(addOpen ? t.btnGhost : t.btnGold), ...t.btnSm, marginLeft: "auto" }}
          onClick={() => (addOpen ? setAddOpen(false) : openAdd())}
        >
          {addOpen ? "閉じる" : "＋ 顧客登録"}
        </button>
      </div>

      {/* E8-5 customers#1（T2）: 担当キャスト絞り込み＝チップ（プルダウン新設禁止の規律・client のみ） */}
      {casts.filter((c) => c.is_active && (!storeSel || c.store_id === storeSel)).length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 12px", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: "var(--sub)" }}>担当</span>
          {[["", "すべて"], ["free", "フリー"] as const,
            ...casts.filter((c) => c.is_active && (!storeSel || c.store_id === storeSel)).map((c) => [c.id, c.name] as const)]
            .map(([v, label]) => (
            <button key={v || "all"} type="button"
              style={{
                ...t.btnGhost, ...t.btnSm, padding: "4px 12px", fontSize: 12,
                ...(castFilter === v ? { borderColor: "var(--gold)", color: "var(--champ)", background: "#1F1B12" } : {}),
              }}
              onClick={() => setCastFilter(v as string)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* B-3: 休眠込み＋掘り起こし順＝モックには無いが現行機能なので残置（cast には出さない＝canDormant） */}
      {canDormant && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
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

      {msg && <p style={{ fontSize: 12.5, fontWeight: 700, color: msg.includes("失敗") ? "var(--bad)" : "var(--ok)", margin: "0 0 8px" }}>{msg}</p>}

      {/* 登録フォーム＝トグルで独立パネル（/casts と同型）。★送る RPC customer_register も引数も不変。 */}
      {addOpen && (
        <section className="nox-panel">
          <h3>顧客登録</h3>
          <div style={{ display: "grid", gap: 10 }}>
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
            {/* E8-5 customers#10: 誕生日入力（列は既存・任意） */}
            <div>
              <label style={t.fieldLabel}>誕生日（任意）</label>
              <input type="date" value={aBirthday} onChange={(e) => setABirthday(e.target.value)} style={{ ...input, marginTop: 4 }} />
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
        </section>
      )}

      {err && <p style={{ fontSize: 12.5, color: "var(--bad)", fontWeight: 700 }}>{err}</p>}

      {/* 段U2: リスト＋右詳細の2ペイン（>900）。≤900 は CSS で1カラム＝詳細はリストの下に続けて出る。
          ★行タップは「右詳細を開く」に変わったが、編集・担当割当は従来どおり /customers/[id]（導線を残す）。
          段0R 第2陣: モックどおり .list と .detail をそれぞれ独立カード（nox-panel）にし、
          2ペインを1枚の大カードの中に入れる従来の入れ子をやめた（器だけの変更）。 */}
      <div className="nox-2pane">
        <div className="nox-panel">
            {!err && display.length === 0 && <p style={{ fontSize: 13, color: "var(--v2-muted)", margin: 0 }}>該当する顧客がいません</p>}
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
                    {/* E8-3 #2: ランクバッジ（VVIP=gold・VIP=gold2・無印は出さない） */}
                    {gradeOf[r.customer_id] && (
                      <span style={{
                        ...t.tag, fontSize: 9.5, padding: "1px 7px", fontWeight: 800, marginLeft: 4,
                        color: gradeOf[r.customer_id] === "vvip" ? "var(--gold)" : "var(--gold2)",
                        borderColor: gradeOf[r.customer_id] === "vvip" ? "rgba(212,175,55,.5)" : "rgba(201,162,74,.45)",
                      }}>{gradeOf[r.customer_id].toUpperCase()}</span>
                    )}
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

          {/* 右詳細＝3stat／ボトルキープ／来店履歴／メモ（すべて既存データ・編集は [id] へ）。
              段0R 第2陣: 器を inline t.card から共通クラス nox-panel へ（背景だけ card2 を維持）。 */}
          {selRow && (
            <div className="nox-panel" style={{ marginBottom: 0, background: "var(--card2)" }}>
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

              {/* E8-3 #3: 詳細4タブ（モック detail-tabs 準拠＝概要/来店/ボトル/メモ・情報種別は現行と同一の再配置） */}
              <div className="nox-dtabs" style={{ marginTop: 10 }}>
                {([["info", "概要"], ["visits", "来店"], ["bottle", `ボトル（${selRow.active_bottles}）`], ["note", "メモ"]] as const).map(([k, label]) => (
                  <button key={k} type="button" className={dtab === k ? "on" : ""} onClick={() => setDtab(k)}>{label}</button>
                ))}
              </div>

              {dtab === "info" && (<>
              <div className="nox-dstats">
                <div className="nox-dstat"><div className="l">来店</div><div className="v num">{selRow.visits}回</div></div>
                <div className="nox-dstat"><div className="l">累計</div><div className="v num">{yen(selRow.total_spend)}</div></div>
                {/* E8-3 #9: 平均会計＝total_spend / visits（RPC 集計値の再形のみ） */}
                <div className="nox-dstat">
                  <div className="l">平均会計</div>
                  <div className="v num">{selRow.visits > 0 ? yen(Math.round(selRow.total_spend / selRow.visits)) : "—"}</div>
                </div>
              </div>
              {/* E8-3 #5: PROFILE グリッド（電話・誕生日・担当・来店傾向）。来店傾向は T4 従属＝E8-6 で実装 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginTop: 10, fontSize: 12 }}>
                {([
                  ["電話", dCust?.tel ?? "—"],
                  ["誕生日", dCust?.birthday ? fmtBirthday(dCust.birthday) : "—"],
                  ["担当", castName(selRow.cast_id)],
                  ["最終来店", selRow.last_visit ? fmtLastVisit(selRow.last_visit) : "—"],
                ] as const).map(([l, v]) => (
                  <span key={l}>
                    <span style={{ color: "var(--v2-muted)", fontSize: 11 }}>{l}</span><br />
                    <span style={{ color: "var(--v2-text)", fontWeight: 700 }}>{v}</span>
                  </span>
                ))}
                {/* E8-6 customers#5（mig0096 結線）: 直近92日の来店傾向（最多の曜日×時間帯＋平均滞在） */}
                <span style={{ gridColumn: "1 / -1" }}>
                  <span style={{ color: "var(--v2-muted)", fontSize: 11 }}>来店傾向（直近3ヶ月）</span><br />
                  <span style={{ color: dTrend ? "var(--v2-text)" : "var(--v2-muted)", fontWeight: dTrend ? 700 : 400 }}>
                    {dTrend ?? "—"}
                  </span>
                </span>
              </div>
              {/* E8-3 #6: 好み・接客チップ（prefs の表示形＝読点/カンマ/空白区切り。書込は現行どおり customer_update） */}
              {dCust?.prefs && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
                  {dCust.prefs.split(/[、,\s]+/).filter(Boolean).map((p, i) => (
                    <span key={i} style={{ ...t.tag, fontSize: 10.5, padding: "2px 9px", color: "var(--gold2)" }}>{p}</span>
                  ))}
                </div>
              )}
              {/* E8-3 #2: ランク設定（owner/manager のみ・customer_set_grade 結線） */}
              {isManagerUp && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 12 }}>
                  <span style={{ fontSize: 11, color: "var(--v2-muted)" }}>ランク</span>
                  {([[null, "無印"], ["vip", "VIP"], ["vvip", "VVIP"]] as const).map(([v, label]) => (
                    <button key={label} type="button"
                      style={{
                        ...t.btnGhost, ...t.btnSm, padding: "3px 12px", fontSize: 11.5,
                        ...((dCust?.grade ?? null) === v ? { borderColor: "var(--gold)", color: "var(--champ)", background: "#1B1710" } : {}),
                      }}
                      onClick={() => void setGrade(v)}>{label}</button>
                  ))}
                </div>
              )}
              </>)}

              {dtab === "visits" && (<>
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
              </>)}

              {dtab === "bottle" && (<>
              <div className="nox-sect">ボトルキープ（{selRow.active_bottles}本）</div>
              {dBottles.length === 0
                ? <p style={{ fontSize: 12, color: "var(--v2-muted)", margin: 0 }}>
                    {selRow.active_bottles > 0 ? "明細は表示できません（権限の範囲外）" : "キープなし"}
                  </p>
                : dBottles.map((b) => {
                    // E8-3 #7: 期限接近ハイライト（超過=bad・14日以内=gold2）
                    const today = new Date().toISOString().slice(0, 10);
                    const soon = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
                    const expTone = b.expires_on
                      ? (b.expires_on < today ? "var(--bad)" : b.expires_on <= soon ? "var(--gold2)" : "var(--v2-muted)")
                      : null;
                    return (
                    <div key={b.id} className="nox-btl" style={{ flexWrap: "wrap", gap: 6 }}>
                      <span>
                        {(b.product_id && prodName[b.product_id]) || b.note || "（銘柄不明）"}
                        {b.remaining_pct != null && (
                          <span className="num" style={{ marginLeft: 6, fontSize: 11, color: b.remaining_pct <= 20 ? "var(--bad)" : "var(--v2-muted)" }}>
                            残{b.remaining_pct}%
                          </span>
                        )}
                        {b.shelf_no && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--v2-muted)" }}>棚 {b.shelf_no}</span>}
                        {b.expires_on && (
                          <span className="num" style={{ marginLeft: 6, fontSize: 11, color: expTone ?? undefined, fontWeight: b.expires_on < today ? 800 : 400 }}>
                            期限 {b.expires_on}{b.expires_on < today ? "（超過）" : ""}
                          </span>
                        )}
                      </span>
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <span className={`st ${b.status === "active" ? "act" : "emp"}`}>
                          {b.status === "active" ? "キープ中" : b.status === "empty" ? "空" : "撤去"}
                          {b.opened_at ? `（${fmtLastVisit(b.opened_at)}）` : ""}
                        </span>
                        {isManagerUp && (
                          <button type="button" style={{ ...t.btnGhost, ...t.btnSm, padding: "2px 10px", fontSize: 11 }}
                            onClick={() => openBtl(b)}>編集</button>
                        )}
                      </span>
                    </div>
                    );
                  })}
              </>)}

              {dtab === "note" && (<>
              {/* E8-3 #8: メモ履歴（customer_notes・新しい順・記入者名）。旧 memo は読み取り専用で残置＝移行しない */}
              <div className="nox-sect">メモ履歴（{dNotes.length}件）</div>
              {isManagerUp || dNotes.length > 0 ? null : (
                <p style={{ fontSize: 12, color: "var(--v2-muted)", margin: 0 }}>メモはありません</p>
              )}
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} maxLength={2000}
                  placeholder="メモを追記（記入者・日時が残ります）" style={{ ...input, flex: 1 }} />
                <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={!noteBody.trim()}
                  onClick={() => void noteAdd()}>追記</button>
              </div>
              {dNotes.map((n) => (
                <div key={n.id} style={{ borderBottom: "1px solid var(--v2-line)", padding: "6px 0", fontSize: 12.5 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span className="num" style={{ fontSize: 11, color: "var(--v2-muted)" }}>
                      {new Date(n.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" })}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--v2-muted)" }}>
                      {n.author_user_id ? authorNames[n.author_user_id] ?? "—" : "—"}
                    </span>
                    {isManagerUp && (
                      <button type="button" style={{ ...t.btnGhost, ...t.btnSm, padding: "1px 8px", fontSize: 10.5, marginLeft: "auto", color: "var(--bad)" }}
                        onClick={() => void noteRemove(n.id)}>削除</button>
                    )}
                  </div>
                  <div style={{ color: "var(--v2-text)", whiteSpace: "pre-wrap" }}>{n.body}</div>
                </div>
              ))}
              {dCust?.memo && (
                <div style={{ marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: "var(--v2-muted)" }}>旧メモ（読み取り専用・移行はしません）</span>
                  <div className="nox-memo">{dCust.memo}</div>
                </div>
              )}
              </>)}

              <Link href={`/customers/${selRow.customer_id}`}
                style={{ ...t.btnGhost, ...t.btnSm, display: "inline-block", marginTop: 12, textDecoration: "none" }}>
                詳細・編集を開く ›
              </Link>
            </div>
          )}

          {/* E8-3 #7: ボトル編集モーダル（bottle_keep_update・素通し5値） */}
          {btlPick && (
            <Modal onClose={() => setBtlPick(null)}>
              <h3 style={{ ...t.cardTitle, margin: "0 0 8px" }}>ボトル情報の編集</h3>
              <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>
                {(btlPick.product_id && prodName[btlPick.product_id]) || "（銘柄不明）"}
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ ...t.fieldLabel, fontSize: 12 }}>残量（%・空欄可）{" "}
                  <input type="number" min={0} max={100} value={btlForm.remaining}
                    onChange={(e) => setBtlForm((f) => ({ ...f, remaining: e.target.value }))} style={{ ...input, width: 90 }} />
                </label>
                <label style={{ ...t.fieldLabel, fontSize: 12 }}>保管期限（空欄可）{" "}
                  <input type="date" value={btlForm.expires}
                    onChange={(e) => setBtlForm((f) => ({ ...f, expires: e.target.value }))} style={input} />
                </label>
                <label style={{ ...t.fieldLabel, fontSize: 12 }}>棚番号（空欄可）{" "}
                  <input value={btlForm.shelf} maxLength={20}
                    onChange={(e) => setBtlForm((f) => ({ ...f, shelf: e.target.value }))} style={{ ...input, width: 120 }} />
                </label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--sub)" }}>状態</span>
                  {([["active", "キープ中"], ["empty", "空"], ["removed", "撤去"]] as const).map(([v, label]) => (
                    <button key={v} type="button"
                      style={{
                        ...t.btnGhost, ...t.btnSm, padding: "3px 12px", fontSize: 11.5,
                        ...(btlForm.status === v ? { borderColor: "var(--gold)", color: "var(--champ)", background: "#1B1710" } : {}),
                      }}
                      onClick={() => setBtlForm((f) => ({ ...f, status: v }))}>{label}</button>
                  ))}
                </div>
                <label style={{ ...t.fieldLabel, fontSize: 12 }}>メモ{" "}
                  <input value={btlForm.note} maxLength={200}
                    onChange={(e) => setBtlForm((f) => ({ ...f, note: e.target.value }))} style={{ ...input, width: 240 }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setBtlPick(null)}>キャンセル</button>
                <button style={{ ...t.btnGold, ...t.btnSm }} onClick={() => void btlSave()}>保存する</button>
              </div>
            </Modal>
          )}
      </div>
    </div>
  );
}
