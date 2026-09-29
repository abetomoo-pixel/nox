"use client";

// 確定済み給与の支払記録（manager+）。1確定 run × cast に複数行可（部分支払い＝paid_amount の積上げ）。
//   金額上限（Σ paid_amount ≤ net）・run finalized ガード・冪等は payment_record_add（DB）で再計算＝
//   ここは表示と入力のみ。読取は RLS で manager+ が payslips/payment_records/casts を直読（パターン1・金額系）。
// ★裁定311（2026-09-28・便 Y-2／Y-3）: 方法は選択式（現金 cash／振込 transfer／その他 other・列は text のまま・既存 null は「その他」表示）。
//   「支払状況を表示」の下に履歴一覧（当期間の payment_records・日付降順・cast 名・金額・方法・メモ・記録者＝users.name）。
//   行の「支払済」数字を押すとその cast の履歴だけに絞る（もう一度押すと全員）。
//   Y-5: この部品は /payroll（page.tsx が owner／manager 以外を redirect）にだけ載る＝cast／staff は未描画。
import { useCallback, useState } from "react";
import MoneyInput from "@/components/ui/money-input"; // ★便 X-11-6: 金額欄の共通部品（数字のみ・3 桁区切り・右に「円」）
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { PAYMENT_METHODS, paymentMethodLabelOf, type PaymentMethod } from "@/lib/nox/payroll/payment-method";

import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
type Line = { castId: string; castName: string; net: number; paid: number };
type Hist = { id: string; castId: string; castName: string; amount: number; paidAt: string; method: string | null; note: string | null; by: string; createdAt: string };

export default function PaymentPanel({ storeId, period }: { storeId: string; period: string }) {
  const supabase = createClient();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [hist, setHist] = useState<Hist[] | null>(null);
  const [histCast, setHistCast] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // 入力（cast 単位）
  const [amt, setAmt] = useState<Record<string, string>>({});
  const [pdate, setPdate] = useState<Record<string, string>>({});
  const [pmethod, setPmethod] = useState<Record<string, PaymentMethod>>({});
  // E8-5 payroll#8: 管理メモ（route/RPC は p_note を既に受ける＝入力欄の欠落だけを埋める）
  const [pnote, setPnote] = useState<Record<string, string>>({});
  // 冪等キー（cast 単位で保持）。サーバ応答を受け取るまで同一キーを再利用＝ネットワーク断のリトライで二重挿入を防ぐ。
  const [idemKeys, setIdemKeys] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setBusy(true);
    setMsg("");
    setLines(null);
    setHist(null);
    setRunId(null);
    try {
      const { data: run } = await supabase.from("payroll_runs").select("id, status").eq("store_id", storeId).eq("period", period).maybeSingle();
      if (!run) { setMsg("この店舗・期間の確定給与がありません（先に確定してください）。"); return; }
      if (run.status === "draft") { setMsg("この期間はまだ確定していません。"); return; }
      const rid = run.id as string;
      const { data: ps } = await supabase.from("payslips").select("cast_id, net").eq("run_id", rid);
      const rows = (ps ?? []) as { cast_id: string; net: number }[];
      const castIds = rows.map((r) => r.cast_id);
      const { data: cs } = await supabase.from("casts").select("id, name").in("id", castIds.length ? castIds : ["00000000-0000-0000-0000-000000000000"]);
      const nameOf = new Map((cs ?? []).map((c) => [c.id as string, c.name as string]));
      // ★311-③: 履歴に使う列も一度に読む（日付降順・同日は記録順）
      const { data: pr } = await supabase.from("payment_records").select("id, cast_id, paid_amount, paid_at, method, note, created_by, created_at").eq("run_id", rid)
        .order("paid_at", { ascending: false }).order("created_at", { ascending: false });
      const prs = (pr ?? []) as { id: string; cast_id: string; paid_amount: number; paid_at: string; method: string | null; note: string | null; created_by: string; created_at: string }[];
      const paidOf = new Map<string, number>();
      for (const p of prs) paidOf.set(p.cast_id, (paidOf.get(p.cast_id) ?? 0) + p.paid_amount);
      // 記録者名（users.name・RLS＝owner 全員／manager は自店の会員）。届かない id はメール等を出さず「—」
      const byIds = [...new Set(prs.map((p) => p.created_by))];
      const { data: us } = byIds.length ? await supabase.from("users").select("id, name").in("id", byIds) : { data: [] };
      const byOf = new Map(((us ?? []) as { id: string; name: string | null }[]).map((u) => [u.id, u.name ?? "—"]));
      setRunId(rid);
      setLines(rows.map((r) => ({ castId: r.cast_id, castName: nameOf.get(r.cast_id) ?? r.cast_id, net: r.net, paid: paidOf.get(r.cast_id) ?? 0 })));
      setHist(prs.map((p) => ({ id: p.id, castId: p.cast_id, castName: nameOf.get(p.cast_id) ?? p.cast_id, amount: p.paid_amount, paidAt: p.paid_at, method: p.method, note: p.note, by: byOf.get(p.created_by) ?? "—", createdAt: p.created_at })));
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
        body: JSON.stringify({ runId, castId, amount, paidAt, method: pmethod[castId] ?? "cash", note: pnote[castId] || null, idemKey }),
      });
      const j = await res.json();
      if (!res.ok) {
        rotate(); // 応答受領＝サーバ処理の帰結確定（4xx/5xx は非コミット）→ 次回は新キー
        setMsg(res.status === 409 ? "支払額の合計が差引支給額を超えます。" : `エラー(${res.status}): ${j.error ?? ""}`);
        return;
      }
      rotate(); // 成功＝挿入確定 → 次の別支払いは新キー
      setAmt((s) => ({ ...s, [castId]: "" }));
      setPnote((s) => ({ ...s, [castId]: "" }));
      await load();
    } catch (e) {
      // 応答なし（ネットワーク断）＝帰結不明 → キーは保持（再送すると同一キーで dedupe＝二重記録なし）
      setMsg(`通信エラー: ${(e as Error).message}（再実行しても二重記録されません）`);
    } finally {
      setBusy(false);
    }
  }

  const histShown = (hist ?? []).filter((h) => !histCast || h.castId === histCast);
  const histCastName = histCast ? lines?.find((l) => l.castId === histCast)?.castName ?? "" : "";

  return (
    <section className="nox-cardtop" style={{ ...t.card, marginTop: 24 }}>
      {/* E5b: t.cardTitle の再発明（13.5/800/champ）を本定数へ。margin のみローカル上書き＝算出値は不変 */}
      <h2 style={{ ...t.cardTitle, margin: "0 0 8px" }}>支払記録（確定済み）</h2>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>
        選択中の店舗・期間（{period}）の確定給与に対して、実際の支払い（現金／振込／その他）を記録します。部分支払い可・合計は net が上限。
      </p>
      <div className="nox-actions">{/* ★裁定244: 節直下の実行＝中央 */}
        <button onClick={load} disabled={busy || !storeId} style={t.btnGold}>支払状況を表示</button>
      </div>
      {msg && <Toast msg={msg} />}

      {lines && lines.length > 0 && (
        <div className="nox-tablewrap plain">{/* ★M1 第 2 レーン（裁定251・2026-09-18）: 横スクロール容器 */}
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, marginTop: 10 }}>
          <thead>
            <tr>
              <th style={t.th}>キャスト</th>
              <th style={{ ...t.th, textAlign: "right" }}>差引支給</th>
              <th style={{ ...t.th, textAlign: "right" }}>支払済</th>
              <th style={{ ...t.th, textAlign: "right" }}>残</th>
              <th style={t.th}>支払記録</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const remaining = l.net - l.paid;
              const done = remaining <= 0;
              return (
                <tr key={l.castId}>
                  <td style={t.td}>{l.castName}</td>
                  <td style={{ ...t.td, ...t.num, textAlign: "right" }}>{l.net.toLocaleString()}</td>
                  <td style={{ ...t.td, ...t.num, textAlign: "right" }}>
                    {/* ★311-③: 押すとこの cast の履歴だけに絞る（再押下で全員） */}
                    <button type="button" className="nox-link num" style={{ fontWeight: histCast === l.castId ? 800 : 400 }}
                      title="この人の支払履歴だけを表示" aria-pressed={histCast === l.castId}
                      onClick={() => setHistCast((c) => (c === l.castId ? null : l.castId))}>{l.paid.toLocaleString()}</button>
                  </td>
                  <td style={{ ...t.td, ...t.num, textAlign: "right", color: done ? "var(--champ)" : "var(--bad)" }}>{done ? "完了" : remaining.toLocaleString()}</td>
                  <td style={t.td}>
                    {done ? (
                      <span style={{ color: "var(--champ)", fontSize: 12 }}>支払完了</span>
                    ) : (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <MoneyInput value={amt[l.castId] ?? ""} placeholder={remaining.toLocaleString()} ariaLabel={`${l.castName} の支払額`}
                          onChange={(v) => setAmt((s) => ({ ...s, [l.castId]: v }))} width={130} />
                        <input
                          type="date"
                          value={pdate[l.castId] ?? ""}
                          onChange={(e) => setPdate((s) => ({ ...s, [l.castId]: e.target.value }))}
                          style={{ ...t.input, width: 140 }}
                        />
                        {/* ★311-①: 方法は選択式（既定＝現金） */}
                        <select value={pmethod[l.castId] ?? "cash"} aria-label="支払方法"
                          onChange={(e) => setPmethod((s) => ({ ...s, [l.castId]: e.target.value as PaymentMethod }))}
                          style={{ ...t.input, width: 90 }}>
                          {PAYMENT_METHODS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                        </select>
                        <input
                          value={pnote[l.castId] ?? ""}
                          placeholder="メモ（任意）"
                          maxLength={200}
                          onChange={(e) => setPnote((s) => ({ ...s, [l.castId]: e.target.value }))}
                          style={{ ...t.input, width: 130 }}
                        />
                        <button onClick={() => record(l.castId, remaining)} disabled={busy} style={{ ...t.btnGold, ...t.btnSm }}>記録</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {/* ★311-③: 支払履歴（当期間・日付降順） */}
      {hist && lines && lines.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ ...t.cardTitle, fontSize: 12.5, margin: 0 }}>支払履歴（{period}）</h3>
            {histCast ? (
              <span style={{ fontSize: 12, color: "var(--sub)" }}>
                {histCastName} のみ・<button type="button" className="nox-link" style={{ fontSize: 12 }} onClick={() => setHistCast(null)}>全員に戻す</button>
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "var(--sub)" }}><span className="num">{hist.length}</span> 件（上の「支払済」の数字を押すとその人だけに絞れます）</span>
            )}
          </div>
          {histShown.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "6px 0 0" }}>支払記録はまだありません。</p>
          ) : (
            <div className="nox-tablewrap plain">
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, marginTop: 6 }}>
              <thead>
                <tr>
                  <th style={t.th}>日付</th>
                  <th style={t.th}>キャスト</th>
                  <th style={{ ...t.th, textAlign: "right" }}>金額</th>
                  <th style={t.th}>方法</th>
                  <th style={t.th}>メモ</th>
                  <th style={t.th}>記録者</th>
                </tr>
              </thead>
              <tbody>
                {histShown.map((h) => (
                  <tr key={h.id}>
                    <td style={{ ...t.td, ...t.num, whiteSpace: "nowrap" }}>{h.paidAt}</td>
                    <td style={t.td}>{h.castName}</td>
                    <td style={{ ...t.td, ...t.num, textAlign: "right" }}>{h.amount.toLocaleString()}</td>
                    <td style={{ ...t.td, whiteSpace: "nowrap" }}>{paymentMethodLabelOf(h.method)}</td>
                    <td style={{ ...t.td, color: h.note ? undefined : "var(--sub)" }}>{h.note ?? "—"}</td>
                    <td style={{ ...t.td, whiteSpace: "nowrap" }}>{h.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
