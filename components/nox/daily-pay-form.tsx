"use client";

// ★0156（裁定309-6／309 追補2 (c)・便 V-4）: 日払いの発行カード（owner／manager・キャスト固定）。
//   金額・営業日・idem＝crypto.randomUUID（押下ごと）→ daily_pay_issue。発行前に源泉と手取りを月次と同じ式（pay.ts withholdingOf・日数 1）でプレビュー。
//   雇用キャストは「源泉 0（税理士確認中＝T10）」の注記（RPC も 0＋warn 'T10 pending'）。発行済み一覧＝当月（biz_date の暦月）・cast 別（daily_pays 直 SELECT＝RLS owner／manager 自店）。
//   メッセージは裁定281 の型（Toast）。RPC 追加 0。
import { useCallback, useEffect, useState } from "react";
import MoneyInput from "@/components/ui/money-input"; // ★便 X-11-6: 金額欄の共通部品（数字のみ・3 桁区切り・右に「円」）
import SegSelect from "@/components/ui/seg-select";
import { DAILY_PAY_KIND_LABEL, dailyPayKindDeductsNow, type DailyPayKind } from "@/lib/nox/payroll/settlement-cycle"; // ★0172（裁定349・便 P172）: 日払いの種別
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { withholdingOf } from "@/lib/nox/pay";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { carriedNoteOf, dailyPayPeriodNoteOf, dailyPayOverNoteOf } from "@/lib/nox/payroll/advance-okuri";
import { Message } from "@/components/ui/toast";
import { monthRangeOf } from "@/lib/nox/month"; // ★便 X13-H H-9: 暦月の日付は 1 か所で（「-31」固定・翌月 0 日を撤去）
import { mig0188On, rules0175On } from "@/lib/nox/rules-0175/flag"; // ★便 P175-prep P-2 ★0188
import { autoWithholdingOf, defaultWithholdingKindOf, withholdingKindOf, WITHHOLDING_KIND_SHORT, type WithholdingKind } from "@/lib/nox/payroll/withholding-kind"; // ★0188（裁定434）: 区分で源泉
import { settlementCycleOf, type SettlementCycle } from "@/lib/nox/payroll/settlement-cycle"; // ★0188（裁定434 ④）: settlement は daily の店だけ
import { DAILY_PAY_KIND_LABEL as DAILY_PAY_KIND_LABEL_0175, activeRowsOf, cancelledLabelOf, isCancelledOf } from "@/lib/nox/rules-0175/cancelled"; // ★便 P175-prep P-2（裁定413 I-3）

type Paid = { id: string; biz_date: string; gross: number; withholding: number; net: number; withholding_category: string; kind: string | null; cancelled_at?: string | null; cancel_reason?: string | null }; // ★0172: +kind ★便 P175-prep P-2: +cancelled_at（0175 v2・フラグ true で読む）
const yen = (n: number) => "¥" + n.toLocaleString();

export default function DailyPayForm({ castId, castName, dateDefault, storeId, onIssued }: {
  castId: string; castName: string;
  /** ★便 L-3-2: 当期プレビュー（/api/payroll/preview）で見込み手取りを読むための店（無ければ過徴収 warn を出さない） */
  storeId?: string;
  /** 営業日の既定（YYYY-MM-DD・呼び出し側が決める） */
  dateDefault: string;
  /** ★便 X13-G W-24 ②: 発行の後（日報の内訳の読み直し） */
  onIssued?: () => void | Promise<void>;
}) {
  const supabase = createClient();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(dateDefault);
  const [kind, setKind] = useState<DailyPayKind>("advance"); // ★0172（裁定349・便 P172）: 既定 advance（前払＝控除なし・期の精算で控除）／settlement（日次精算＝1 日分控除・期間精算から除外）
  const [taxMode, setTaxMode] = useState<"委託" | "雇用" | null>(null); // cast_tax_profiles.mode（行なし＝委託＝RPC と同じ既定）
  const [whKindStored, setWhKindStored] = useState<string | null>(null); // ★0188（裁定434）: cast_tax_profiles.withholding_kind（null＝既定）
  const [cycle, setCycle] = useState<SettlementCycle>("monthly"); // ★0188（裁定434 ④）: 店の精算方式（daily 以外は前払だけ）
  const [paid, setPaid] = useState<Paid[] | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [expectedNet, setExpectedNet] = useState<number | null>(null); // ★便 L-3-2（仮決め）: 当期の差引支給見込み（日払い前＝preview の net＋dailyPaidGross） // ★起票93（裁定312・便 X-12-2）: 営業日の期の run 状態（paid＝翌月へ繰り下げ・finalized＝凍結明細に載らない）
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const month = date.slice(0, 7);
    const nextMonth = monthRangeOf(month).next; // ★便 X13-G live: 「-31」は 30 日の月で不正な日付（エラー→0 件）＝翌月 1 日の未満で
    const [{ data: tp }, { data: cs }, { data: dp }] = await Promise.all([ // ★便 X13-G live ㉓: 受け順を Promise の順（税区分→期の状態→日払い）に（逆で「発行済み」が常に空だった）
      (mig0188On() ? supabase.from("cast_tax_profiles").select("mode, withholding_kind") : supabase.from("cast_tax_profiles").select("mode")).eq("cast_id", castId).maybeSingle().then((r) => ({ data: (r.data ?? null) as { mode?: string | null; withholding_kind?: string | null } | null })), // ★0188: 区分も読む（select 文字列が条件式のため型を外す）
      supabase.from("casts").select("store_id").eq("id", castId).maybeSingle().then(async (c) => {
        if (!c.data?.store_id) return { data: null };
        if (mig0188On()) { const { data: st } = await supabase.from("stores").select("settings_json").eq("id", c.data.store_id as string).maybeSingle(); setCycle(settlementCycleOf((st?.settings_json ?? null) as Record<string, unknown> | null)); } // ★0188（裁定434 ④）
        return supabase.from("payroll_runs").select("status").eq("store_id", c.data.store_id as string).eq("period", month).maybeSingle();
      }),
      supabase.from("daily_pays").select(rules0175On() ? "id, biz_date, gross, withholding, net, withholding_category, kind, cancelled_at, cancel_reason" : "id, biz_date, gross, withholding, net, withholding_category, kind").eq("cast_id", castId) // ★便 P175-prep P-2: 取消列はフラグ true で
        .gte("biz_date", `${month}-01`).lt("biz_date", nextMonth).order("biz_date", { ascending: false }),
    ]);
    setTaxMode((tp?.mode as "委託" | "雇用" | undefined) ?? "委託");
    setWhKindStored(((tp as { withholding_kind?: string | null } | null)?.withholding_kind as string | null | undefined) ?? null); // ★0188
    setPaid((dp ?? []) as unknown as Paid[]); // ★便 P175-prep P-2: select 文字列が条件式のため型推論を外す
    setRunStatus((cs as { status?: string } | null)?.status ?? null);
  }, [supabase, castId, date]);
  useEffect(() => { void load(); }, [load]);
  // ★便 L-3-2: 当期プレビュー（参考値）を月ごとに 1 回読む。失敗・行なしは warn を出さない（発行は止めない）
  useEffect(() => {
    if (!storeId) { setExpectedNet(null); return; }
    let alive = true;
    const month = date.slice(0, 7);
    void (async () => {
      try {
        const res = await fetch("/api/payroll/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storeId, period: month }) });
        const j = (await res.json()) as { rows?: { castId: string; net: number; dailyPaidGross?: number }[] };
        const r = res.ok ? j.rows?.find((x) => x.castId === castId) : undefined;
        if (alive) setExpectedNet(r ? r.net + (r.dailyPaidGross ?? 0) : null);
      } catch { if (alive) setExpectedNet(null); }
    })();
    return () => { alive = false; };
  }, [storeId, castId, date.slice(0, 7)]); // eslint-disable-line react-hooks/exhaustive-deps

  const gross = /^\d+$/.test(amount) ? Number(amount) : null;
  const mode = taxMode ?? "委託";
  // ★月次 run と同じ式を日数 1 で（lib/nox/pay.ts withholdingOf＝委託 floor(max(0, gross−5000)×0.1021)・雇用 0）＝RPC daily_pay_issue と同値（double precision）
  // ★0188（裁定434）: 区分（withholding_kind・null＝既定＝委託 hostess／雇用 manual）で 1 日分＝RPC daily_pay_issue の withholding_calc と同値（hostess は従来と 1 円も違わない）
  const whKind: WithholdingKind = withholdingKindOf(whKindStored, defaultWithholdingKindOf({ subject: "cast", taxMode: mode }));
  const settlementAllowed = !mig0188On() || cycle === "daily"; // ★0188（裁定434 ④）: 日次精算は daily の店だけ
  const kindEff: DailyPayKind = settlementAllowed ? kind : "advance";
  const wh = gross != null ? (dailyPayKindDeductsNow(kindEff) ? (mig0188On() ? autoWithholdingOf(whKind, gross, 1, date) : withholdingOf(gross, 1, mode)) : 0) : null; // ★0172: advance は控除なし（RPC daily_pay_issue と同値）

  async function issue() {
    if (gross == null || gross <= 0 || busy) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("daily_pay_issue", { p_cast_id: castId, p_biz_date: date, p_gross: gross, p_idem_key: crypto.randomUUID(), p_kind: kindEff }); // ★0172: p_kind ★0188: daily 以外の店は advance だけ
    setBusy(false);
    if (error) { setMsg(`日払いの発行に失敗: ${/settlement not allowed/.test(error.message) ? "この店の精算方式では日次精算（日払い）は発行できません（前払だけ＝期の精算で源泉）" : rpcErrJa(error.message)}`); return; } // ★0188（裁定434 ④）
    const r = data as { net: number; withholding: number; warn: string | null; replay: boolean; carried_to?: string | null };
    const carried = carriedNoteOf(r.carried_to); // ★裁定312（便 AB-8）: 支払済みの期の営業日＝翌月の給与から控除
    setMsg(`${castName} に${DAILY_PAY_KIND_LABEL[kindEff]} ${yen(gross)} を発行しました（源泉 ${yen(r.withholding)}・手取り ${yen(r.net)}）${carried ? `・${carried}` : ""}${r.warn === "manual" ? "※区分が給与のため源泉 0（控除は月ごとに手入力）" : r.warn ? "※雇用のため源泉 0（税理士確認中）" : ""}`); // ★0188: warn 'manual'
    setAmount("");
    await load();
    await onIssued?.();
  }

  const periodNote = dailyPayPeriodNoteOf(runStatus, date.slice(0, 7));
  const overNote = dailyPayOverNoteOf((paid ?? []).reduce((s, p) => s + p.gross, 0), gross ?? 0, expectedNet); // ★便 L-3-2: 過徴収 warn（止めない） // ★起票93: 支払済みの期でも発行できる（裁定312＝翌月へ繰り下げ）＝発行欄は常に出す
  const live = activeRowsOf(paid ?? []); // ★便 P175-prep P-2: 合計は取消済みを除く（フラグ false＝cancelled_at 無し＝全件）
  const sumG = live.reduce((s, p) => s + p.gross, 0), sumW = live.reduce((s, p) => s + p.withholding, 0);
  // ★便 P175-prep P-2（裁定413 I-3・0175 v2 ★4 daily_pay_cancel）: 取消＝行を消さず印（理由必須・paid の期は RPC が 'paid period'）。フラグ false ではボタンを出さない
  async function cancelPaid(p: Paid) {
    if (busy) return;
    const reason = window.prompt(`${p.biz_date} の ${yen(p.gross)} を取り消します。理由（必須・200 字まで）`);
    if (reason === null) return;
    if (!reason.trim()) { setMsg("取消の理由を入れてください"); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("daily_pay_cancel", { p_id: p.id, p_reason: reason.trim().slice(0, 200) });
    setBusy(false);
    if (error) { setMsg(`取消に失敗: ${rpcErrJa(error.message)}`); return; }
    setMsg(`${p.biz_date} の日払いを取り消しました`); await load(); await onIssued?.();
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {/* ★0172（裁定349・便 P172）: 種別＝前払（既定・控除なし・期の精算で控除）／日払い（日次精算＝1 日分の源泉を引いて渡す・期間精算から除外） */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-daily-pay-kind={kindEff} data-daily-pay-cycle={mig0188On() ? cycle : undefined}>
        <span style={t.fieldLabel}>種別</span>
        {settlementAllowed ? (
          <SegSelect value={kindEff} onChange={(v) => setKind(v as DailyPayKind)} disabled={busy} ariaLabel="日払いの種別"
            options={[["advance", DAILY_PAY_KIND_LABEL.advance], ["settlement", DAILY_PAY_KIND_LABEL.settlement]] as const} />
        ) : (/* ★0188（裁定434 ④）: daily 以外の店は前払だけ（日次精算は選べない） */
          <span style={{ fontSize: 12.5 }} data-daily-pay-advance-only="1"><b>{DAILY_PAY_KIND_LABEL.advance}</b><span style={{ ...t.sub, marginLeft: 6 }}>この店の精算方式（{cycle === "monthly" ? "月次" : cycle === "half" ? "半月" : "週次"}）では日次精算は選べません＝源泉は期の精算で差し引きます</span></span>
        )}
      </div>
      <div className="nox-dailypay-row" data-dailypay-row="1">{/* ★便 X13-G W-8: ≤899＝1 行目 金額｜営業日（2 列）・2 行目 発行（全幅）／≥900＝横 1 行 */}
        <label style={t.fieldLabel} className="f">金額<br />
          <MoneyInput value={amount} onChange={setAmount} placeholder="例: 10,000" width="100%" style={{ marginTop: 3 }} disabled={busy} ariaLabel="日払いの金額" />
        </label>
        <label style={t.fieldLabel} className="f">営業日<br />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...t.input, marginTop: 3 }} disabled={busy} aria-label="日払いの営業日" />
        </label>
        <button type="button" onClick={() => void issue()} disabled={busy || gross == null || gross <= 0} className="go" style={{ ...t.btnGold, minHeight: 44, opacity: gross ? 1 : 0.6 }}>
          {busy ? "発行中…" : kind === "advance" ? "前払を発行" : "日払いを発行"}
        </button>
      </div>
      {/* プレビュー＝月次と同式（日数 1）。雇用は源泉 0＝T10 の注記 */}
      <p style={{ fontSize: 12, color: "var(--sub)", margin: 0, lineHeight: 1.7 }}>
        {gross != null && gross > 0 ? (
          <>源泉 <span className="num">{yen(wh ?? 0)}</span>・手取り <span className="num" style={{ color: "var(--v2-text)", fontWeight: 700 }}>{yen(gross - (wh ?? 0))}</span>（{kindEff === "advance" ? (mig0188On() ? "前払＝源泉 0（期の精算で差し引き）" : "前払＝控除なし・期の精算で控除") : mig0188On() ? `${WITHHOLDING_KIND_SHORT[whKind]}・計算期間 1 日＝税率表の式・期間精算から除外` : `${mode}・計算期間 1 日＝月次と同じ式・期間精算から除外`}）</>
        ) : "金額を入れると源泉と手取りをプレビューします（月次と同じ式・日数 1）。"}
        {mig0188On() ? (whKind === "manual" && <> ※区分が給与のため源泉 0 で渡します（控除は月ごとに手入力）。</>) : (mode === "雇用" && <> ※雇用キャストの日払いは源泉 0 で渡します（税理士に確認中）。</>)}
      </p>
      {overNote && <Message kind="warn">{overNote}</Message>}
      {periodNote && <Message kind={periodNote.kind}>{periodNote.text}</Message>}
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
                {rules0175On() && cancelledLabelOf(p, DAILY_PAY_KIND_LABEL_0175) && <span data-dp-cancelled="1" style={{ fontSize: 11, fontWeight: 800, color: "var(--bad)" }}>{cancelledLabelOf(p, DAILY_PAY_KIND_LABEL_0175)}</span>}{/* ★便 P175-prep P-2 */}
                {rules0175On() && !isCancelledOf(p) && <button type="button" style={{ ...t.btnGhost, ...t.btnSm, border: "1px solid var(--bad)", color: "var(--bad)" }} disabled={busy} onClick={() => void cancelPaid(p)}>取消</button>}
                <span style={{ fontSize: 11.5, color: "var(--sub)" }}>源泉 <span className="num">{yen(p.withholding)}</span>・手取り <span className="num">{yen(p.net)}</span>・{p.withholding_category}・{p.kind === "advance" ? "前払" : "日次精算"}</span>
              </div>
            ))}
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "4px 0 0" }}>合計 <span className="num">{yen(sumG)}</span>（源泉既徴収 <span className="num">{yen(sumW)}</span>・<span className="num">{paid.length}</span> 件）＝月次の給与では「日払い済み」として差し引かれます</p>
          </div>
        )}
      </div>
    </div>
  );
}
