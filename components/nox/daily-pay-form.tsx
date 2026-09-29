"use client";

// ★0156（裁定309-6／309 追補2 (c)・便 V-4）: 日払いの発行カード（owner／manager・キャスト固定）。
//   金額・営業日・idem＝crypto.randomUUID（押下ごと）→ daily_pay_issue。発行前に源泉と手取りを月次と同じ式（pay.ts withholdingOf・日数 1）でプレビュー。
//   雇用キャストは「源泉 0（税理士確認中＝T10）」の注記（RPC も 0＋warn 'T10 pending'）。発行済み一覧＝当月（biz_date の暦月）・cast 別（daily_pays 直 SELECT＝RLS owner／manager 自店）。
//   メッセージは裁定281 の型（Toast）。RPC 追加 0。
import { useCallback, useEffect, useState } from "react";
import MoneyInput from "@/components/ui/money-input"; // ★便 X-11-6: 金額欄の共通部品（数字のみ・3 桁区切り・右に「円」）
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { withholdingOf } from "@/lib/nox/pay";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";

type Paid = { id: string; biz_date: string; gross: number; withholding: number; net: number; withholding_category: string };
const yen = (n: number) => "¥" + n.toLocaleString();

export default function DailyPayForm({ castId, castName, dateDefault, readOnly = false }: {
  castId: string; castName: string;
  /** 営業日の既定（YYYY-MM-DD・呼び出し側が決める） */
  dateDefault: string;
  readOnly?: boolean;
}) {
  const supabase = createClient();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(dateDefault);
  const [taxMode, setTaxMode] = useState<"委託" | "雇用" | null>(null); // cast_tax_profiles.mode（行なし＝委託＝RPC と同じ既定）
  const [paid, setPaid] = useState<Paid[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const month = date.slice(0, 7);
    const [{ data: tp }, { data: dp }] = await Promise.all([
      supabase.from("cast_tax_profiles").select("mode").eq("cast_id", castId).maybeSingle(),
      supabase.from("daily_pays").select("id, biz_date, gross, withholding, net, withholding_category").eq("cast_id", castId)
        .gte("biz_date", `${month}-01`).lte("biz_date", `${month}-31`).order("biz_date", { ascending: false }),
    ]);
    setTaxMode((tp?.mode as "委託" | "雇用" | undefined) ?? "委託");
    setPaid((dp ?? []) as Paid[]);
  }, [supabase, castId, date]);
  useEffect(() => { void load(); }, [load]);

  const gross = /^\d+$/.test(amount) ? Number(amount) : null;
  const mode = taxMode ?? "委託";
  // ★月次 run と同じ式を日数 1 で（lib/nox/pay.ts withholdingOf＝委託 floor(max(0, gross−5000)×0.1021)・雇用 0）＝RPC daily_pay_issue と同値（double precision）
  const wh = gross != null ? withholdingOf(gross, 1, mode) : null;

  async function issue() {
    if (gross == null || gross <= 0 || busy) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("daily_pay_issue", { p_cast_id: castId, p_biz_date: date, p_gross: gross, p_idem_key: crypto.randomUUID() });
    setBusy(false);
    if (error) { setMsg(`日払いの発行に失敗: ${rpcErrJa(error.message)}`); return; }
    const r = data as { net: number; withholding: number; warn: string | null; replay: boolean };
    setMsg(`${castName} に日払い ${yen(gross)} を発行しました（源泉 ${yen(r.withholding)}・手取り ${yen(r.net)}）${r.warn ? "※雇用のため源泉 0（税理士確認中）" : ""}`);
    setAmount("");
    await load();
  }

  if (readOnly) return <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 0" }}>確定済みのため、日払いの発行はできません（読取のみ）。</p>;
  const sumG = (paid ?? []).reduce((s, p) => s + p.gross, 0), sumW = (paid ?? []).reduce((s, p) => s + p.withholding, 0);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="nox-issue-row" style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={t.fieldLabel}>金額<br />
          <MoneyInput value={amount} onChange={setAmount} placeholder="例: 10,000" width={150} style={{ marginTop: 3 }} disabled={busy} ariaLabel="日払いの金額" />
        </label>
        <label style={t.fieldLabel}>営業日<br />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...t.input, marginTop: 3 }} disabled={busy} aria-label="日払いの営業日" />
        </label>
        <button type="button" onClick={() => void issue()} disabled={busy || gross == null || gross <= 0} style={{ ...t.btnGold, ...t.btnSm, opacity: gross ? 1 : 0.6 }}>
          {busy ? "発行中…" : "日払いを発行"}
        </button>
      </div>
      {/* プレビュー＝月次と同式（日数 1）。雇用は源泉 0＝T10 の注記 */}
      <p style={{ fontSize: 12, color: "var(--sub)", margin: 0, lineHeight: 1.7 }}>
        {gross != null && gross > 0 ? (
          <>源泉 <span className="num">{yen(wh ?? 0)}</span>・手取り <span className="num" style={{ color: "var(--v2-text)", fontWeight: 700 }}>{yen(gross - (wh ?? 0))}</span>（{mode}・計算期間 1 日＝月次と同じ式）</>
        ) : "金額を入れると源泉と手取りをプレビューします（月次と同じ式・日数 1）。"}
        {mode === "雇用" && <> ※雇用キャストの日払いは源泉 0 で渡します（税理士確認中・T10）。</>}
      </p>
      {msg && <Toast msg={msg} />}
      <div>
        <p style={{ fontSize: 11.5, fontWeight: 800, color: "var(--champ)", margin: "4px 0 2px" }}>発行済み（{date.slice(0, 7)}）</p>
        {paid === null ? (
          <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>読み込み中…</p>
        ) : paid.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>この月の日払いはありません。</p>
        ) : (
          <div style={{ display: "grid", gap: 2 }}>
            {paid.map((p) => (
              <div key={p.id} style={{ display: "flex", gap: 10, fontSize: 12.5, alignItems: "baseline" }}>
                <span className="num" style={{ color: "var(--sub)" }}>{p.biz_date}</span>
                <span className="num">{yen(p.gross)}</span>
                <span style={{ fontSize: 11.5, color: "var(--sub)" }}>源泉 <span className="num">{yen(p.withholding)}</span>・手取り <span className="num">{yen(p.net)}</span>・{p.withholding_category}</span>
              </div>
            ))}
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "4px 0 0" }}>合計 <span className="num">{yen(sumG)}</span>（源泉既徴収 <span className="num">{yen(sumW)}</span>・<span className="num">{paid.length}</span> 件）＝月次の給与では「日払い済み」として差し引かれます</p>
          </div>
        )}
      </div>
    </div>
  );
}
