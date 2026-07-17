"use client";

// F3f 自己申告ドリンクの承認キュー（mig0037＋0047）。
// 一覧は drink_claims の RLS が自動で絞る（owner/manager=自店全件・staff は can_register=true のみ・
//   can_register=false は 0行）＝ここでロール判定を書かない（真の防御は RLS/RPC）。
// cast 源氏名・商品名・伝票の nom_type は client join（casts/products/checks とも staff 可視）。
// ★プレビュー額は drink_claim_decide の焼付式と同式の client 計算＝あくまで目安。
//   権威は DB 側の焼付（承認時点の products を直読みして back_amount を確定）。
//   マスタ改定と承認のタイミング差でズレうるため、確定額は承認後の値を表示する。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Claim = {
  id: string; qty: number; status: string; created_at: string; cast_id: string;
  casts: { name: string } | { name: string }[] | null;
  products: { name: string; price: number; back_mode: string; back_value: number | null; unit4_json: Record<string, number> | null }
    | { name: string; price: number; back_mode: string; back_value: number | null; unit4_json: Record<string, number> | null }[] | null;
  checks: { nom_type: string } | { nom_type: string }[] | null;
};

const yen = (n: number) => "¥" + n.toLocaleString();
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });

/** drink_claim_decide の焼付式と同式（unit4 → unit4_json[nom_type] / rate → round(price×back_value/100)）。表示は目安・権威は DB。 */
function previewBack(c: Claim, qty: number): number {
  const p = one(c.products);
  const nom = one(c.checks)?.nom_type ?? "free";
  if (!p) return 0;
  const unit = p.back_mode === "unit4"
    ? Number(p.unit4_json?.[nom] ?? 0)
    : Math.round((p.price * Number(p.back_value ?? 0)) / 100);
  return unit * qty;
}

export default function DrinkClaimQueue() {
  const supabase = createClient();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [qtyOv, setQtyOv] = useState<Record<string, string>>({}); // claim_id → 杯数訂正（空なら null 送信）
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("drink_claims")
      .select("id, qty, status, created_at, cast_id, casts(name), products(name, price, back_mode, back_value, unit4_json), checks(nom_type)")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setClaims((data ?? []) as Claim[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(c: Claim, approve: boolean) {
    if (busy) return;
    setBusy(true); setMsg(null);
    const raw = (qtyOv[c.id] ?? "").trim();
    const override = approve && raw !== "" ? Number(raw) : null;
    const { error } = await supabase.rpc("drink_claim_decide", {
      p_claim_id: c.id, p_approve: approve, p_qty_override: override,
    });
    if (error) {
      // 0047: void 伝票への事後 decide は check voided／競合承認は already decided
      setMsg(
        error.message.includes("check voided") ? "この伝票は取消済みのため承認できません（申告は自動で却下されています）"
        : error.message.includes("already decided") ? "この申告は既に処理済みです（他の端末で承認/却下された可能性があります）"
        : error.message.includes("bad qty") ? "杯数の指定を確認してください"
        : error.message.includes("forbidden") ? "権限がありません"
        : `処理に失敗しました: ${error.message}`,
      );
    } else {
      setMsg(approve ? "承認しました（バックを確定しました）" : "却下しました");
      setQtyOv((m) => ({ ...m, [c.id]: "" }));
    }
    setBusy(false);
    await load();
  }

  // pending 0 件なら出さない（fail-closed 表示＝can_register OFF の staff も RLS で 0行→非表示）。
  // ただし直前の処理結果（msg）が出ている間は残す＝最後の1件を捌いた瞬間に成功表示ごと消えないように。
  if (claims.length === 0 && !msg) return null;

  const card: React.CSSProperties = t.card;
  const inp: React.CSSProperties = { ...t.input, width: "auto", padding: "6px 8px", fontSize: 12 };
  const btnGold: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
  const btnGhost: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

  return (
    <section className="nox-cardtop" style={{ ...card, width: "100%" }}>
      <h2 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" }}>
        ドリンク申告（承認待ち {claims.length}件）
      </h2>
      {claims.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--sub)", margin: 0 }}>承認待ちの申告はありません。</p>
      )}
      {claims.length > 0 && (
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
              {["申告時刻", "キャスト", "商品", "杯数", "バック（目安）", "杯数訂正", "操作"].map((h) => (
                <th key={h} style={{ padding: 6, color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => {
              const raw = (qtyOv[c.id] ?? "").trim();
              const effQty = raw !== "" && Number(raw) > 0 ? Number(raw) : c.qty;
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: 6, ...t.num, whiteSpace: "nowrap" }}>{hhmm(c.created_at)}</td>
                  <td style={{ padding: 6, fontWeight: 700, whiteSpace: "nowrap" }}>{one(c.casts)?.name ?? "(不明)"}</td>
                  <td style={{ padding: 6 }}>{one(c.products)?.name ?? "(商品不明)"}</td>
                  <td style={{ padding: 6, ...t.num }}>{c.qty}</td>
                  <td style={{ padding: 6, ...t.num, color: "var(--champ)", whiteSpace: "nowrap" }}>{yen(previewBack(c, effQty))}</td>
                  <td style={{ padding: 6 }}>
                    <input type="number" min={1} placeholder={String(c.qty)} value={qtyOv[c.id] ?? ""}
                      onChange={(e) => setQtyOv((m) => ({ ...m, [c.id]: e.target.value }))}
                      style={{ ...inp, width: 60 }} />
                  </td>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                    <button style={btnGold} disabled={busy} onClick={() => void decide(c, true)}>承認</button>
                    <button style={{ ...btnGhost, marginLeft: 6 }} disabled={busy} onClick={() => void decide(c, false)}>却下</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      {claims.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "8px 0 0" }}>
          ※バックは目安です（確定額は承認時にサーバで計算されます）。杯数訂正を入れると、その杯数で承認します。
        </p>
      )}
      {msg && <p style={{ fontSize: 12, color: msg.startsWith("承認") || msg.startsWith("却下") ? "var(--ok)" : "var(--bad)", margin: "6px 0 0" }}>{msg}</p>}
    </section>
  );
}
