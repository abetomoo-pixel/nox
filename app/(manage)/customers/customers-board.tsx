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

type Store = { id: string; name: string };
type Cast = { id: string; name: string; store_id: string; is_active: boolean };
type Row = {
  customer_id: string; name: string; furigana: string | null; cast_id: string | null;
  is_active: boolean; visits: number; last_visit: string | null; total_spend: number;
  active_bottles: number; open_receivable: number; days_since: number | null;
  churn_tier: "none" | "mid" | "high";
};
type Tier = "all" | "high" | "mid";

const yen = (n: number) => "¥" + n.toLocaleString();
const secTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };
const input: React.CSSProperties = { ...t.input, padding: "8px 10px", fontSize: 13 };
const segBtn = (on: boolean): React.CSSProperties => ({
  ...t.btnGhost, ...t.btnSm,
  ...(on ? { background: "linear-gradient(135deg,var(--gold2),#B8893A)", color: "#0B0B0F", border: 0, fontWeight: 800 } : {}),
});
// churn pill: high=赤 / mid=黄（gold2）/ none=pill なし（無印）
const churnPill = (tier: "mid" | "high"): React.CSSProperties => ({
  fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
  color: tier === "high" ? "var(--bad)" : "var(--gold2)",
  background: "#23232B", border: "1px solid var(--line2)", whiteSpace: "nowrap",
});
// 休眠 pill（詳細ヘッダの同型・B-3）
const dormantPill: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
  color: "var(--sub)", background: "#23232B", border: "1px solid var(--line2)", whiteSpace: "nowrap",
};

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

  const filtered = useMemo(() => {
    const needle = q.trim();
    return rows.filter((r) =>
      (tier === "all" || r.churn_tier === tier) &&
      (needle === "" || r.name.includes(needle) || (r.furigana ?? "").includes(needle)),
    );
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

        <div style={{ display: "flex", gap: 7, marginBottom: 10, flexWrap: "wrap" }}>
          <button style={segBtn(tier === "all")} onClick={() => setTier("all")}>全て</button>
          <button style={segBtn(tier === "high")} onClick={() => setTier("high")}>離反リスク高（{highCount}）</button>
          <button style={segBtn(tier === "mid")} onClick={() => setTier("mid")}>中（{midCount}）</button>
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
        {!err && display.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>該当する顧客がいません</p>}

        {display.map((r) => (
          <Link
            key={r.customer_id}
            href={`/customers/${r.customer_id}`}
            style={{ display: "block", textDecoration: "none", color: "inherit", padding: "9px 0", borderBottom: "1px solid var(--line)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</span>
              {r.furigana && <span style={{ fontSize: 11, color: "var(--sub)" }}>{r.furigana}</span>}
              <span style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
                {!r.is_active && <span style={dormantPill}>休眠</span>}
                {r.churn_tier === "high" && <span style={churnPill("high")}>離反リスク高</span>}
                {r.churn_tier === "mid" && <span style={churnPill("mid")}>離反リスク中</span>}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 3 }}>
              担当 {castName(r.cast_id)}・来店 <span style={t.num}>{r.visits}</span>回・
              {r.last_visit
                ? (r.churn_tier === "none"
                    ? <>最終 {fmtLastVisit(r.last_visit)}（<span style={t.num}>{r.days_since}</span>日前）</>
                    : <><span style={{ ...t.num, color: r.churn_tier === "high" ? "var(--bad)" : "var(--gold2)" }}>{r.days_since}</span>日未再来</>)
                : "来店なし"}
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 12.5, marginTop: 3, flexWrap: "wrap" }}>
              <span style={{ ...t.num, color: "var(--champ)", fontWeight: 700 }}>{yen(r.total_spend)}</span>
              {r.active_bottles > 0 && <span style={{ color: "var(--sub)" }}>ボトル <span style={t.num}>{r.active_bottles}</span></span>}
              {r.open_receivable > 0 && <span style={{ color: "var(--bad)" }}>売掛 <span style={t.num}>{yen(r.open_receivable)}</span></span>}
            </div>
          </Link>
        ))}

        <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>
          {display.length}件{tier !== "all" || q ? `（全${rows.length}件）` : ""}・
          {incDormant ? "休眠客を含めて表示中" : "休眠中の顧客は表示されません"}
        </p>
      </section>
    </div>
  );
}
