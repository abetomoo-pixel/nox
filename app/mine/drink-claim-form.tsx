"use client";

// F3f 自己申告ドリンク（mig0037＋0047＋0048）: cast セルフの申告フォーム＋当月の申告一覧。
// 伝票選択は cast_open_checks()（mig0048・cast セルフ専用の最小開示＝席名/席種/開始時刻のみ。
//   checks/seats は cast 0行のため RLS 経由では選べない＝この RPC が唯一の導線）。
// 商品は products を client join（RLS: 自店 authenticated 可視）。drink/champ のみ＝
//   drink_claim_submit の対象条件（type in ('drink','champ')・自店・自 org）と同じ絞りを UI でも先出し。
// 一覧は drink_claims の RLS 自己行（cast は cast_id=auth_cast_id() の行のみ可視＝パターン1変形）。
// ★バックは承認後に給与明細へ合算される独立枠＝check_cast_backs には書かない（二重計上を作らない）。
//   /mine の「今月のバック」（check_cast_backs 由来）には出ない点を注記で明示する。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type OpenCheck = { check_id: string; seat_name: string; seat_kind: string | null; started_at: string };
type Product = { id: string; name: string; type: string };
type Claim = {
  id: string; qty: number; back_amount: number; status: string; created_at: string;
  products: { name: string } | { name: string }[] | null;
};

const yen = (n: number) => "¥" + n.toLocaleString();
const STATUS_LABEL: Record<string, string> = { pending: "審査中", approved: "承認済", rejected: "却下" };
const STATUS_COLOR: Record<string, string> = { pending: "var(--gold2)", approved: "var(--ok)", rejected: "var(--sub)" };

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
const prodName = (p: Claim["products"]): string => {
  const x = Array.isArray(p) ? p[0] : p;
  return x?.name ?? "(商品不明)";
};

export default function DrinkClaimForm({ month }: { month: string }) {
  const supabase = createClient();
  const [opens, setOpens] = useState<OpenCheck[]>([]);
  const [prods, setProds] = useState<Product[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [checkId, setCheckId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [oc, pr, cl] = await Promise.all([
      supabase.rpc("cast_open_checks"),
      supabase.from("products").select("id, name, type").in("type", ["drink", "champ"]).eq("is_active", true).order("name"),
      supabase.from("drink_claims")
        .select("id, qty, back_amount, status, created_at, products(name)")
        .gte("created_at", `${month}-01T00:00:00+09:00`)
        .order("created_at", { ascending: false }),
    ]);
    setOpens((oc.data ?? []) as OpenCheck[]);
    setProds((pr.data ?? []) as Product[]);
    setClaims((cl.data ?? []) as Claim[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (!checkId || !productId || busy) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("drink_claim_submit", {
      p_check_id: checkId, p_product_id: productId, p_qty: qty,
    });
    if (error) {
      setMsg(
        error.message.includes("not open") ? "この伝票は会計が済んでいます（選び直してください）"
        : error.message.includes("bad product") ? "この商品は申告できません"
        : error.message.includes("bad qty") ? "杯数を確認してください"
        : `申告に失敗しました: ${error.message}`,
      );
    } else {
      setMsg("申告しました（お店の確認後に承認されます）");
      setProductId(""); setQty(1);
    }
    setBusy(false);
    await load();
  }

  const title: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };
  const noneP: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };
  const noteP: React.CSSProperties = { fontSize: 12, color: "var(--sub)", margin: 0 };
  const inp: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };

  return (
    <section className="nox-cardtop" style={t.card}>
      <h2 style={title}>ドリンクの申告</h2>

      {opens.length === 0 ? (
        <p style={noneP}>いま開いている伝票がありません（お客様がご案内されると選べるようになります）。</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 3 }}>
            <span style={t.fieldLabel}>どの席の分ですか</span>
            <select value={checkId} onChange={(e) => setCheckId(e.target.value)} style={inp}>
              <option value="">席を選ぶ</option>
              {opens.map((o) => (
                <option key={o.check_id} value={o.check_id}>
                  {o.seat_name}{o.seat_kind ? `（${o.seat_kind}）` : ""}・{hhmm(o.started_at)}〜
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 3 }}>
            <span style={t.fieldLabel}>商品</span>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} style={inp}>
              <option value="">商品を選ぶ</option>
              {prods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 3 }}>
            <span style={t.fieldLabel}>杯数</span>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} style={{ ...inp, width: 90 }} />
          </label>
          <div>
            <button style={{ ...t.btnGold, padding: "10px 20px", fontSize: 14 }}
              disabled={busy || !checkId || !productId} onClick={() => void submit()}>
              {busy ? "送信中…" : "申告する"}
            </button>
          </div>
        </div>
      )}
      {msg && <p style={{ fontSize: 12.5, color: msg.startsWith("申告しました") ? "var(--ok)" : "var(--bad)", margin: "8px 0 0" }}>{msg}</p>}

      <h2 style={{ ...title, marginTop: 16 }}>今月の申告（{month}）</h2>
      {claims.length === 0 && <p style={noneP}>申告はまだありません</p>}
      {claims.map((c) => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
          <span style={{ ...t.num, color: "var(--sub)", fontSize: 12 }}>
            {new Date(c.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" })}
          </span>
          <span style={{ fontWeight: 700 }}>{prodName(c.products)}</span>
          <span style={{ ...t.num, color: "var(--sub)" }}>{c.qty}杯</span>
          {c.status === "approved" && <span style={{ ...t.num, color: "var(--champ)", fontWeight: 700 }}>{yen(c.back_amount)}</span>}
          <span style={{
            marginLeft: "auto", fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
            color: STATUS_COLOR[c.status] ?? "var(--sub)", background: "#23232B", border: "1px solid var(--line2)", whiteSpace: "nowrap",
          }}>{STATUS_LABEL[c.status] ?? c.status}</span>
        </div>
      ))}
      <p style={{ ...noteP, marginTop: 8 }}>
        ※申告ドリンクのバックは承認後、給与明細に合算されます（上の「今月のバック」とは別枠の集計です）。
      </p>
    </section>
  );
}
