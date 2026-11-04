"use client";

// ★便 A M-80（2026-11-04 Agoora）: /staff の編集モーダルの「働き方」の節＝雇用形態／給与の形／額／固定手当（月額）／源泉区分（既定は雇用形態から）／控除（月ごと）。
//   保存先は 給与 › 勤怠（スタッフ）と同じ（双方向）＝働き方 staff_contract_set（0176・patch）・源泉区分 set_withholding_kind（0183）・控除 payroll_employee_deductions_set（0183＝Withholding432Panel をそのまま使う）。
//   固定手当＝staff_contracts.fixed_allowance（1 本の月額）。名称つきの複数行は保存先が無い＝0195 に同乗（表 staff_allowances 候補・月の確定で凍結）＝docs/tmp/0195_plan.md §9。
//   契約未登録の人＝「働き方を登録」（M-80 ②）。一覧の契約チップから開いたときは入力を開いた状態（initialOpen）。
import { useEffect, useRef, useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import MoneyInput from "@/components/ui/money-input";
import Withholding432Panel from "@/components/nox/withholding-432-panel";
import { Message } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { mig0183On, mig0188On } from "@/lib/nox/rules-0175/flag";
import { staffContractLineOf, type StaffContract } from "@/lib/nox/staff/pay";
import {
  WITHHOLDING_KIND_LABEL, WITHHOLDING_KIND_SELECT_NOTE, WITHHOLDING_KIND_SHORT, defaultWithholdingKindOf, withholdingKindChoices, withholdingKindOf,
  type EmployeeDeductionKind, type EmployeeDeductionRow,
} from "@/lib/nox/payroll/withholding-kind";
import { CONTRACT_KIND_OPTS, monthOfToday, monthShiftOf, payAmountKeyOf, payKindOptsOf } from "@/lib/nox/staff/work"; // 純関数（verify と共有）

export type StaffWorkContract = StaffContract & { pay_kind?: string | null; monthly?: number | null; daily?: number | null; withholding_kind?: string | null };

type Form = { contract_kind: string; pay_kind: string; amount: string; fixed: string };
const formOf = (c: StaffWorkContract | null): Form => {
  const ck = c?.contract_kind ?? "parttime";
  const pk0 = c?.pay_kind ?? (c && c.hourly === 0 && c.fixed_allowance > 0 ? "monthly" : "hourly");
  const pk = payKindOptsOf(ck).some(([v]) => v === pk0) ? pk0 : payKindOptsOf(ck)[0][0];
  const key = payAmountKeyOf(pk);
  const amt = key === "hourly" ? (c?.hourly ?? 0) : key === "daily" ? (c?.daily ?? c?.fixed_allowance ?? 0) : (c?.monthly ?? c?.fixed_allowance ?? 0);
  return { contract_kind: ck, pay_kind: pk, amount: amt ? String(amt) : "", fixed: c?.fixed_allowance && pk === "hourly" ? String(c.fixed_allowance) : "" };
};

export default function StaffWorkSection({ memId, contract, canEdit, initialOpen = false, onSaved }: {
  memId: string; contract: StaffWorkContract | null; canEdit: boolean; initialOpen?: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const supabase = createClient();
  const ref = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState<Form | null>(() => (initialOpen ? formOf(contract) : null));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [period, setPeriod] = useState<string>(monthOfToday());
  const [ded, setDed] = useState<EmployeeDeductionRow[]>([]);
  const [tick, setTick] = useState(0); // 保存後に控除を読み直す
  const kind = contract && mig0183On() ? withholdingKindOf(contract.withholding_kind ?? null, defaultWithholdingKindOf({ subject: "staff", contractKind: contract.contract_kind })) : null;

  useEffect(() => { if (initialOpen) ref.current?.scrollIntoView({ block: "nearest" }); }, [initialOpen]);
  // 控除（社員＝manual のときだけ）＝payroll_employee_deductions を月ごとに読む（RLS＝店長以上）
  useEffect(() => {
    if (kind !== "manual") { setDed([]); return; }
    let alive = true;
    void supabase.from("payroll_employee_deductions").select("kind, name, amount, sort").eq("period", period).eq("subject_kind", "staff").eq("subject_id", memId).order("sort")
      .then(({ data }) => { if (alive) setDed(((data ?? []) as { kind: EmployeeDeductionKind; name: string | null; amount: number }[]).map((r) => ({ kind: r.kind, name: r.name, amount: r.amount }))); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, period, memId, tick]);

  async function save() {
    if (!form || busy) return;
    const n = Number(String(form.amount).replace(/[,，\s円¥]/g, ""));
    if (!Number.isInteger(n) || n < 0) { setMsg({ kind: "error", text: "額は 0 以上の整数で入力してください" }); return; }
    const f = form.fixed.trim() === "" ? 0 : Number(String(form.fixed).replace(/[,，\s円¥]/g, ""));
    if (!Number.isInteger(f) || f < 0) { setMsg({ kind: "error", text: "固定手当は 0 以上の整数で入力してください（空欄＝なし）" }); return; }
    setBusy(true); setMsg(null);
    const patch: Record<string, unknown> = { contract_kind: form.contract_kind, pay_kind: form.pay_kind, [payAmountKeyOf(form.pay_kind)]: n, fixed_allowance: form.pay_kind === "hourly" ? f : 0 };
    const { error } = await supabase.rpc("staff_contract_set", { p_membership_id: memId, p_patch: patch });
    setBusy(false);
    if (error) { setMsg({ kind: "error", text: `働き方の保存エラー: ${rpcErrJa(error.message)}` }); return; }
    setForm(null); setMsg({ kind: "success", text: contract ? "働き方を保存しました" : "働き方を登録しました" }); await onSaved();
  }
  async function setKind(v: string) { // ★裁定432 ①: 区分の変更（店長以上・契約の行がある人だけ）
    if (busy) return; setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("set_withholding_kind", { p_subject_kind: "staff", p_subject_id: memId, p_kind: v === "" ? null : v });
    setBusy(false);
    setMsg(error ? { kind: "error", text: `源泉区分の保存エラー: ${rpcErrJa(error.message)}` } : { kind: "success", text: "源泉区分を保存しました" });
    if (!error) await onSaved();
  }

  const kindOpts: ReadonlyArray<readonly [string, string]> = [
    ["", `既定（${WITHHOLDING_KIND_SHORT[defaultWithholdingKindOf({ subject: "staff", contractKind: contract?.contract_kind })]}）`],
    ...withholdingKindChoices().map((k) => [k, WITHHOLDING_KIND_LABEL[k]] as const),
  ];
  return (
    <div ref={ref} data-staff-edit-work={contract ? "set" : "none"} style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--line2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)" }}>働き方</span>
        <span style={{ fontSize: 12.5 }}>{contract ? staffContractLineOf(contract) : <span style={t.sub}>契約未登録</span>}</span>
        {canEdit && !form && (
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => { setForm(formOf(contract)); setMsg(null); }} data-staff-work-edit={contract ? "edit" : "register"}>
            {contract ? "働き方を変更" : "働き方を登録"}
          </button>
        )}
      </div>
      {form && (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }} data-staff-work-form="1">
          <label style={t.fieldLabel}>雇用形態<br /><SegSelect value={form.contract_kind} onChange={(v) => setForm({ ...form, contract_kind: v, pay_kind: payKindOptsOf(v).some(([k]) => k === form.pay_kind) ? form.pay_kind : payKindOptsOf(v)[0][0] })} options={CONTRACT_KIND_OPTS} ariaLabel="雇用形態" wrap /></label>
          <label style={t.fieldLabel}>給与の形<br /><SegSelect value={form.pay_kind} onChange={(v) => setForm({ ...form, pay_kind: v })} options={payKindOptsOf(form.contract_kind)} ariaLabel="給与の形" /></label>
          <label style={t.fieldLabel}>額（{payKindOptsOf(form.contract_kind).find(([v]) => v === form.pay_kind)?.[1] ?? "額"}）<br /><MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} width={160} ariaLabel="働き方の額" /></label>
          {form.pay_kind === "hourly" && (
            <label style={t.fieldLabel}>固定手当（月額・任意）<br /><MoneyInput value={form.fixed} onChange={(v) => setForm({ ...form, fixed: v })} width={160} ariaLabel="固定手当（月額）" />
              <span style={{ ...t.sub, display: "block", marginTop: 2 }} data-staff-fixed-note="1">時給分に加えて月ごとに支給します（名称つきの複数行は後の版で）。</span></label>
          )}
          <div className="nox-actions" data-staff-work-actions="1">
            <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => { setForm(null); setMsg(null); }}>やめる</button>
            <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy} onClick={() => void save()} data-staff-work-save="1">{contract ? "働き方を保存" : "働き方を登録"}</button>
          </div>
        </div>
      )}
      {mig0183On() && contract && (
        <div style={{ marginTop: 10 }} data-staff-edit-withholding={kind ?? ""}>
          <label style={{ ...t.fieldLabel, display: "block" }}>源泉区分<br />
            <SegSelect value={contract.withholding_kind ?? ""} onChange={(v) => void setKind(v)} options={kindOpts} ariaLabel="源泉区分" disabled={!canEdit || busy} wrap />{/* ★教訓27: 選択肢 5＝ボタン群 */}
          </label>
          {mig0188On() && <p style={{ ...t.sub, margin: "2px 0 0" }}>{WITHHOLDING_KIND_SELECT_NOTE}</p>}
          {kind === "manual" ? (
            <div data-staff-edit-deductions={period}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)" }}>控除（月ごと）</span>
                <span className="nox-seg" style={{ display: "inline-flex" }} data-staff-edit-ded-month="1">
                  <button type="button" onClick={() => setPeriod(monthShiftOf(period, -1))} aria-label="前の月">‹</button>
                  <button type="button" className="on num" style={{ minWidth: 100 }} aria-label="対象月">{period.slice(0, 4)}年{Number(period.slice(5, 7))}月</button>
                  <button type="button" onClick={() => setPeriod(monthShiftOf(period, 1))} aria-label="次の月">›</button>
                </span>
              </div>
              <Withholding432Panel key={`${memId}-${period}-${ded.length}`} period={period} subjectKind="staff" subjectId={memId} kind="manual" auto={0} override={null}
                deductions={ded} editable={canEdit} onSaved={async (m) => { setMsg({ kind: "success", text: m }); await onSaved(); setTick((n) => n + 1); }} />
            </div>
          ) : kind ? (
            <p style={{ ...t.sub, margin: "6px 0 0" }} data-staff-edit-ded-note={kind}>この区分（{WITHHOLDING_KIND_SHORT[kind]}）の源泉は 給与 › 勤怠（スタッフ）で自動計算します。控除の手入力は区分が「給与」のときです。</p>
          ) : null}
        </div>
      )}
      {mig0183On() && !contract && <p style={{ ...t.sub, margin: "6px 0 0" }} data-staff-edit-withholding="none">源泉区分と控除は働き方を登録すると選べます。</p>}
      {msg && <Message kind={msg.kind} style={{ margin: "6px 0 0" }}>{msg.text}</Message>}
    </div>
  );
}
