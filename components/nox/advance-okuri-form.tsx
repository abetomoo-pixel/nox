"use client";

// ★裁定300（2026-09-25）: 前借り／送り実費の発行フォーム（共通部品）＝3 入口で同じ部品・同じ route（既存 RPC adv_issue／transport_issue・新 RPC 0）。
//   300-1: キャスト選択は共通 picker（裁定259）・金額／日付／メモ／発行は 1 段のフォーム行（.nox-issue-row・≤899px は 1 列＝M5 の型）。
//   300-2: castId を渡すとキャスト固定（picker は出さない）・readOnly（確定後）は入口を出さず注記のみ。
//   メッセージは裁定281 の型（Message・同じカード内・×で消す）。
import { useEffect, useState } from "react";
import MoneyInput from "@/components/ui/money-input"; // ★便 X-11-6: 金額欄の共通部品（数字のみ・3 桁区切り・右に「円」）
import Picker from "@/components/nox/picker";
import { Message } from "@/components/ui/toast";
import * as t from "@/lib/nox/ui/theme";
import { ADVANCE_DAILY_STORE_NOTE, ISSUE_DATE_LABEL, ISSUE_LABEL, advanceHiddenForStoreOf, issueBodyOf, issueErrJa, loanErrJa, loanPinErrOf, okuriEnabledOf, carriedBulkNoteOf, type IssueKind } from "@/lib/nox/payroll/advance-okuri"; // ★裁定458 ⑤
import { createClient } from "@/lib/supabase/client";
import { mig0198On } from "@/lib/nox/rules-0175/flag"; // ★0198（2026-11-09 手貼り）: 貸付の本人確認（PIN）＝cast_loan_grant
import { LOAN_NOT_AGREED, LOAN_NOT_AGREED_NOTE, loanAgreedMapOf, loanAgreedOf, type CastPlanRow } from "@/lib/nox/payroll/loan-ledger"; // ★M-123（裁定464 付帯①）: 貸付伝票の「同意未」

export type IssueCast = { id: string; name: string };

export default function AdvanceOkuriForm({ storeId, casts, castId, castName, dateDefault, okuriMode, okuriBase = 0, readOnly = false, readOnlyNote, onIssued, only }: {
  storeId: string;
  /** picker の候補（castId 固定のときは未使用可） */
  casts: IssueCast[];
  /** 固定するキャスト（casts 詳細・給与明細）。未指定＝picker */
  castId?: string | null;
  castName?: string | null;
  /** 日付の既定（YYYY-MM-DD・呼び出し側が issueDateDefaultOf で決める） */
  dateDefault: string;
  /** 店の送り方式（'actual' のときだけ送り実費を有効化・未指定＝RPC に任せる） */
  okuriMode?: string | null;
  /** 送りベース額（プリフィル・0＝空） */
  okuriBase?: number;
  /** 確定後（finalized／paid）＝入口を出さない */
  readOnly?: boolean;
  readOnlyNote?: string;
  onIssued?: (kind: IssueKind, id: string) => void | Promise<void>;
  /** ★便 X13-G W-24 ②: 片方の行だけ（日報の内訳の ＋発行＝前借り） */
  only?: IssueKind;
}) {
  // ★裁定458 ⑤（夜便レーン 2）: 日払いの店（settlement_cycle='daily'）では前借り（貸付）の入口を出さない（送り実費は残す）＝店の設定を 1 回読む
  const [dailyStore, setDailyStore] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void createClient().from("stores").select("settings_json").eq("id", storeId).maybeSingle().then(({ data }) => { if (alive) setDailyStore(advanceHiddenForStoreOf((data?.settings_json ?? null) as Record<string, unknown> | null)); });
    return () => { alive = false; };
  }, [storeId]);
  if (readOnly) {
    return <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 0" }}>{readOnlyNote ?? "確定済みのため、前借り（貸付）／送り実費の発行はできません（読取のみ）。"}</p>;
  }
  const okuriOn = okuriEnabledOf(okuriMode);
  if (only === "advance" && dailyStore) return <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 0" }} data-advance-daily-hidden="1">{ADVANCE_DAILY_STORE_NOTE}</p>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {only !== "transport" && dailyStore && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }} data-advance-daily-hidden="1">{ADVANCE_DAILY_STORE_NOTE}</p>}
      {only !== "transport" && !dailyStore && <IssueRow kind="advance" storeId={storeId} casts={casts} castId={castId} castName={castName} dateDefault={dateDefault} disabled={false}
        hint="貸付です（源泉は引かず、5,000 円控除も適用しません）。給与の「貸付返済」で天引きされます（手取りが足りないときは翌月へ繰越）。残高は給与の貸付残高一覧で確認できます。" onIssued={onIssued} />}
      {only !== "advance" && <IssueRow kind="transport" storeId={storeId} casts={casts} castId={castId} castName={castName} dateDefault={dateDefault} disabled={!okuriOn} defaultAmount={okuriBase}
        hint={okuriOn ? "当月精算（繰越なし）。手取り不足で引き切れない残は再回収されません。" : "※送り方式が「実費」の店のみ発行できます（控除・送りで切替）。"} onIssued={onIssued} />}
    </div>
  );
}

function IssueRow({ kind, storeId, casts, castId, castName, dateDefault, disabled, hint, defaultAmount, onIssued }: {
  kind: IssueKind; storeId: string; casts: IssueCast[]; castId?: string | null; castName?: string | null; dateDefault: string;
  disabled: boolean; hint: string; defaultAmount?: number; onIssued?: (kind: IssueKind, id: string) => void | Promise<void>;
}) {
  const prefill = defaultAmount && defaultAmount > 0 ? String(defaultAmount) : "";
  const fixed = !!castId;
  const [pick, setPick] = useState<string | null>(castId ?? casts[0]?.id ?? null);
  const [amount, setAmount] = useState(prefill);
  const [date, setDate] = useState(dateDefault);
  const [note, setNote] = useState("");
  const [pin, setPin] = useState(""); // ★0198 ★3（裁定458 ③）: 貸付の本人確認（キャストの PIN・空＝店長の立会い）
  const loanPin = kind === "advance" && mig0198On();
  const [loanAgreed, setLoanAgreed] = useState<boolean | null>(null); // ★M-123: 対象キャストの現在のプランが同意済みか（null＝未読）
  const loanCast = fixed ? castId : pick;
  useEffect(() => {
    if (!loanPin || !loanCast) { setLoanAgreed(null); return; }
    let alive = true;
    (async () => {
      const sb = createClient();
      const { data: cp } = await sb.from("cast_plan").select("cast_id, plan_id, valid_from, valid_to").eq("cast_id", loanCast);
      const plans = (cp ?? []) as CastPlanRow[]; const ids = [...new Set(plans.map((p) => p.plan_id))];
      const { data: cps } = ids.length ? await sb.from("comp_plans").select("id, advance_loan_agreed").in("id", ids) : { data: [] };
      if (!alive) return;
      const map = loanAgreedMapOf(plans, Object.fromEntries(((cps ?? []) as { id: string; advance_loan_agreed: boolean | null }[]).map((p) => [p.id, p.advance_loan_agreed])), new Date().toISOString().slice(0, 10));
      setLoanAgreed(loanAgreedOf(map, loanCast));
    })();
    return () => { alive = false; };
  }, [loanPin, loanCast]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const label = ISSUE_LABEL[kind];

  async function submit() {
    if (busy || disabled) return;
    setMsg(null);
    const b = issueBodyOf({ kind, storeId, castId: fixed ? castId : pick, amount, date, note });
    if (!b.ok) { setMsg({ kind: "error", text: b.err }); return; }
    const pinErr = loanPin ? loanPinErrOf(pin) : null;
    if (pinErr) { setMsg({ kind: "error", text: pinErr }); return; }
    setBusy(true);
    try {
      let j: { id?: string; error?: string } = {};
      if (loanPin) {
        // ★0198 ★3: 貸付＝cast_loan_grant（adv_issue を呼んで ack＝pin／manager を刻む・PIN は RPC 側で cast_pin と照合）
        const { data, error } = await createClient().rpc("cast_loan_grant", { p_store_id: storeId, p_cast_id: b.body.castId, p_amount: b.body.amount, p_biz_date: date, p_note: b.body.note, p_pin: pin === "" ? null : pin });
        if (error) { setMsg({ kind: "error", text: loanErrJa(error.message) }); return; }
        j = { id: (data as string | null) ?? undefined };
      } else {
        const res = await fetch(b.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b.body) });
        j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok) { setMsg({ kind: "error", text: issueErrJa(res.status, j.error) }); return; }
      }
      const who = fixed ? (castName ?? "") : (casts.find((c) => c.id === pick)?.name ?? "");
      // ★裁定312（便 AB-8）: 前借りは発行後に advances を再読＝控除先が翌月へ繰り下がっていれば添える（送り実費は繰越なし）
      let carried = "";
      if (kind === "advance" && j.id) {
        const { data: adv } = await createClient().from("advances").select("deduct_period").eq("id", j.id).maybeSingle();
        carried = carriedBulkNoteOf(date, [(adv?.deduct_period as string | null | undefined) ?? null]);
      }
      setMsg({ kind: "success", text: `${who ? who + " の" : ""}${label} ${b.body.amount.toLocaleString("en-US")} 円を発行しました（${date}）${carried ? `・${carried}` : ""}` });
      setAmount(prefill); setNote(""); setPin("");
      if (j.id && onIssued) await onIssued(kind, j.id);
    } catch (e) {
      setMsg({ kind: "error", text: `通信エラー: ${(e as Error).message}` });
    } finally { setBusy(false); }
  }

  return (
    <section className="nox-cardtop" style={{ ...t.card, opacity: disabled ? 0.6 : 1, marginBottom: 0, paddingBottom: 16 }}>
      {/* ★301-4: 見出し→12→「キャスト」ラベル→6→picker→16→フォーム行→8→注記→カード下端 16（値は 4/8/12/16/24 のみ・ラベルと入力の間は全ラベル 6） */}
      <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 12px" }}>{label}の発行{fixed && castName ? `（${castName}）` : ""}</h3>
      {loanPin && loanAgreed === false && (/* ★M-123（裁定464 付帯①）: 貸付伝票の「同意未」＝発行は止めない（仮置き 5＝承認） */
        <p data-loan-agreed="0" style={{ fontSize: 12, color: "var(--warn, #e0a030)", margin: "0 0 8px" }}><span className="nox-stpill" style={{ marginRight: 6 }}>{LOAN_NOT_AGREED}</span>{LOAN_NOT_AGREED_NOTE}</p>
      )}
      {!fixed && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 6 }}>キャスト</div>
          <Picker fullList items={casts.map((c) => ({ id: c.id, label: c.name }))} value={pick} onPick={setPick} disabled={disabled} placeholder="キャストを検索" empty="（対象なし）" />{/* ★便 X13-H H-19: 日払い側と同じ全行表示 */}
        </div>
      )}
      <div className="nox-issue-row">
        <label style={{ fontSize: 12, color: "var(--sub)" }}><span style={{ display: "block", marginBottom: 6 }}>金額</span>
          <MoneyInput value={amount} onChange={setAmount} disabled={disabled} width="100%" ariaLabel="金額" style={{ padding: "8px 10px", fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 12, color: "var(--sub)" }}><span style={{ display: "block", marginBottom: 6 }}>{ISSUE_DATE_LABEL[kind]}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={disabled} style={{ ...t.input, width: "100%", padding: "8px 10px", fontSize: 13 }} />
        </label>
        <button type="button" className="nox-btn nox-issue-go" data-issue-go={kind} onClick={() => void submit()} disabled={busy || disabled}>{busy ? "発行中…" : `${label}を発行`}</button>{/* 実行＝青塗り（裁定242）・★便 X13-H H-19: 1 行目の右端（日払いと同じ組み） */}
        {loanPin && (<label data-loan-pin style={{ fontSize: 12, color: "var(--sub)" }}><span style={{ display: "block", marginBottom: 6 }}>本人確認 PIN（空＝立会い）</span>{/* ★0198 ★3: キャストが自分の PIN を入れる＝ack 'pin'・空なら店長の立会い＝ack 'manager' */}
          <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} disabled={disabled} maxLength={6} style={{ ...t.input, width: "100%", padding: "8px 10px", fontSize: 13 }} />
        </label>)}
        <label className="nox-issue-memo" style={{ fontSize: 12, color: "var(--sub)" }}><span style={{ display: "block", marginBottom: 6 }}>メモ</span>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} disabled={disabled} maxLength={200} style={{ ...t.input, width: "100%", padding: "8px 10px", fontSize: 13 }} />
        </label>
      </div>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "8px 0 0" }}>{hint}</p>
      {msg && <Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message>}
    </section>
  );
}
