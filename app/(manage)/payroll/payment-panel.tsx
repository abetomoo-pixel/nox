"use client";

// 確定済み給与の支払記録（manager+）。1確定 run × cast に複数行可（部分支払い＝paid_amount の積上げ）。
//   金額上限（Σ paid_amount ≤ net）・run finalized ガード・冪等は payment_record_add（DB）で再計算＝
//   ここは表示と入力のみ。読取は RLS で manager+ が payslips/payment_records/casts を直読（パターン1・金額系）。
import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Line = { castId: string; castName: string; net: number; paid: number };

const th: React.CSSProperties = { border: "1px solid #ddd", padding: "6px 10px", textAlign: "left" };
const td: React.CSSProperties = { border: "1px solid #eee", padding: "6px 10px" };
const input: React.CSSProperties = { padding: 5, border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 13 };
const btn: React.CSSProperties = { padding: "8px 16px", background: "#2c3e50", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" };
const btnSm: React.CSSProperties = { padding: "3px 10px", background: "#16161a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 };

export default function PaymentPanel({ storeId, period }: { storeId: string; period: string }) {
  const supabase = createClient();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // 入力（cast 単位）
  const [amt, setAmt] = useState<Record<string, string>>({});
  const [pdate, setPdate] = useState<Record<string, string>>({});
  const [pmethod, setPmethod] = useState<Record<string, string>>({});
  // 冪等キー（cast 単位で保持）。サーバ応答を受け取るまで同一キーを再利用＝ネットワーク断のリトライで二重挿入を防ぐ。
  const [idemKeys, setIdemKeys] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setBusy(true);
    setMsg("");
    setLines(null);
    setRunId(null);
    try {
      const { data: run } = await supabase.from("payroll_runs").select("id, status").eq("store_id", storeId).eq("period", period).maybeSingle();
      if (!run) { setMsg("この店舗・期間の確定給与がありません（先に確定してください）。"); return; }
      if (run.status === "draft") { setMsg("この期間はまだ確定していません（draft）。"); return; }
      const rid = run.id as string;
      const { data: ps } = await supabase.from("payslips").select("cast_id, net").eq("run_id", rid);
      const rows = (ps ?? []) as { cast_id: string; net: number }[];
      const castIds = rows.map((r) => r.cast_id);
      const { data: cs } = await supabase.from("casts").select("id, name").in("id", castIds.length ? castIds : ["00000000-0000-0000-0000-000000000000"]);
      const nameOf = new Map((cs ?? []).map((c) => [c.id as string, c.name as string]));
      const { data: pr } = await supabase.from("payment_records").select("cast_id, paid_amount").eq("run_id", rid);
      const paidOf = new Map<string, number>();
      for (const p of (pr ?? []) as { cast_id: string; paid_amount: number }[]) {
        paidOf.set(p.cast_id, (paidOf.get(p.cast_id) ?? 0) + p.paid_amount);
      }
      setRunId(rid);
      setLines(rows.map((r) => ({ castId: r.cast_id, castName: nameOf.get(r.cast_id) ?? r.cast_id, net: r.net, paid: paidOf.get(r.cast_id) ?? 0 })));
    } catch (e) {
      setMsg(`読込エラー: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [storeId, period, supabase]);

  async function record(castId: string, remaining: number) {
    if (!runId) return;
    const raw = amt[castId] ?? String(remaining);
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount <= 0) { setMsg("支払額は正の整数で入力してください。"); return; }
    const paidAt = pdate[castId] || new Date().toISOString().slice(0, 10);
    // cast 単位の冪等キー。応答を受け取れるまで同一キーを再利用（応答喪失→再送でも DB 側 on conflict/replay で二重挿入なし）。
    // 応答（成功/4xx/5xx）を受け取れたら帰結確定＝キーを回転（意図的な同額の再記録を許容）。
    const idemKey = idemKeys[castId] ?? crypto.randomUUID();
    setIdemKeys((s) => (s[castId] ? s : { ...s, [castId]: idemKey }));
    const rotate = () => setIdemKeys((s) => { const n = { ...s }; delete n[castId]; return n; });
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/payment/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId, castId, amount, paidAt, method: pmethod[castId] || null, idemKey }),
      });
      const j = await res.json();
      if (!res.ok) {
        rotate(); // 応答受領＝サーバ処理の帰結確定（4xx/5xx は非コミット）→ 次回は新キー
        setMsg(res.status === 409 ? "支払額の合計が差引支給額(net)を超えます。" : `エラー(${res.status}): ${j.error ?? ""}`);
        return;
      }
      rotate(); // 成功＝挿入確定 → 次の別支払いは新キー
      setAmt((s) => ({ ...s, [castId]: "" }));
      await load();
    } catch (e) {
      // 応答なし（ネットワーク断）＝帰結不明 → キーは保持（再送すると同一キーで dedupe＝二重記録なし）
      setMsg(`通信エラー: ${(e as Error).message}（再実行しても二重記録されません）`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #eee" }}>
      <h2 style={{ fontSize: 17, margin: "0 0 8px" }}>支払記録（確定済み）</h2>
      <p style={{ fontSize: 12, color: "#777", margin: "0 0 10px" }}>
        選択中の店舗・期間（{period}）の確定給与に対して、実際の支払い（現金/振込）を記録します。部分支払い可・合計は net が上限。
      </p>
      <button onClick={load} disabled={busy || !storeId} style={btn}>支払状況を表示</button>
      {msg && <p style={{ color: msg.includes("エラー") || msg.includes("超え") ? "#c0392b" : "#555", fontSize: 13 }}>{msg}</p>}

      {lines && lines.length > 0 && (
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, marginTop: 10 }}>
          <thead>
            <tr style={{ background: "#f2f2f2" }}>
              <th style={th}>キャスト</th>
              <th style={{ ...th, textAlign: "right" }}>差引支給(net)</th>
              <th style={{ ...th, textAlign: "right" }}>支払済</th>
              <th style={{ ...th, textAlign: "right" }}>残</th>
              <th style={th}>支払記録</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const remaining = l.net - l.paid;
              const done = remaining <= 0;
              return (
                <tr key={l.castId}>
                  <td style={td}>{l.castName}</td>
                  <td style={{ ...td, textAlign: "right" }}>{l.net.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right" }}>{l.paid.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right", color: done ? "#1e824c" : "#c0392b" }}>{done ? "完了" : remaining.toLocaleString()}</td>
                  <td style={td}>
                    {done ? (
                      <span style={{ color: "#1e824c", fontSize: 12 }}>支払完了</span>
                    ) : (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          type="number"
                          value={amt[l.castId] ?? ""}
                          placeholder={String(remaining)}
                          onChange={(e) => setAmt((s) => ({ ...s, [l.castId]: e.target.value }))}
                          style={{ ...input, width: 90 }}
                        />
                        <input
                          type="date"
                          value={pdate[l.castId] ?? ""}
                          onChange={(e) => setPdate((s) => ({ ...s, [l.castId]: e.target.value }))}
                          style={{ ...input, width: 140 }}
                        />
                        <input
                          value={pmethod[l.castId] ?? ""}
                          placeholder="方法(振込等)"
                          onChange={(e) => setPmethod((s) => ({ ...s, [l.castId]: e.target.value }))}
                          style={{ ...input, width: 90 }}
                        />
                        <button onClick={() => record(l.castId, remaining)} disabled={busy} style={btnSm}>記録</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
