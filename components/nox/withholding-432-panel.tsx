"use client";

// ★裁定432（2026-10-26 確定・Agoora）: 給与画面の源泉と控除の入れ方（0183 ★4＝フラグ MIG_0183_APPLIED の間だけ mount）。
//   委託（hostess／other_fee）＝自動額を表示し、横の「額を指定」でその期だけ上書き（理由任意・税理士確認済みの印・audit に元額と指定額＝payroll_withholding_override_set）。
//   社員（manual）＝NOX は税額を計算しない。控除＝社会保険料／源泉所得税／住民税／その他（名前付きで複数行）を月ごとに手入力（payroll_employee_deductions_set）・既定は空欄＝0・「前月と同じ」。
//   キャスト（給与画面の右パネル）とスタッフ（スタッフの勤怠・報酬）で同じ部品。注記「区分と額は顧問税理士・社労士にご確認ください」。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import {
  EMPLOYEE_DEDUCTION_LABEL, OTHER_FEE_PROVISIONAL_NOTE, WITHHOLDING_ADVICE_NOTE, WITHHOLDING_KIND_SHORT, copyPrevDeductionsOf, employeeDeductionFormOf, employeeDeductionRowsOfForm,
  overrideLineOf, prevPeriodOf, type EmployeeDeductionKind, type EmployeeDeductionRow, type WithholdingKind,
} from "@/lib/nox/payroll/withholding-kind";

type FormRow = { kind: EmployeeDeductionKind; name: string; amount: string };
const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;

export function rpcErr432Ja(msg: string): string {
  if (/period finalized/.test(msg)) return "確定済み・支払済みの期は変えられません";
  if (/forbidden/.test(msg)) return "権限がありません（店長・オーナーのみ）";
  if (/bad amount|bad rows/.test(msg)) return "金額は 0 以上の整数で入力してください";
  if (/not found/.test(msg)) return "対象が見つかりません（画面を再読込してください）";
  return msg;
}

export default function Withholding432Panel({ period, subjectKind, subjectId, kind, auto, override, overrideConfirmed, deductions, editable, onSaved }: {
  period: string; subjectKind: "cast" | "staff"; subjectId: string;
  kind: WithholdingKind; auto: number; override: number | null; overrideConfirmed?: boolean | null;
  deductions: readonly EmployeeDeductionRow[]; editable: boolean;
  onSaved: (msg: string) => void | Promise<void>;
}) {
  const [ovOpen, setOvOpen] = useState(false);
  const [ovAmount, setOvAmount] = useState(override !== null ? String(override) : String(auto));
  const [ovReason, setOvReason] = useState("");
  const [ovConfirmed, setOvConfirmed] = useState(!!overrideConfirmed);
  const [form, setForm] = useState<FormRow[]>(() => employeeDeductionFormOf(deductions));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [conf, setConf] = useState<boolean | null>(overrideConfirmed ?? null);
  // 指定額があるときは「税理士確認済み」と理由を読む（RLS＝店長以上・本人）
  useEffect(() => {
    if (override === null || overrideConfirmed != null) return;
    let alive = true;
    void createClient().from("payroll_withholding_overrides").select("tax_accountant_confirmed, reason").eq("period", period).eq("subject_kind", subjectKind).eq("subject_id", subjectId).maybeSingle()
      .then(({ data }) => { if (!alive || !data) return; setConf(!!data.tax_accountant_confirmed); setOvConfirmed(!!data.tax_accountant_confirmed); setOvReason((data.reason as string | null) ?? ""); });
    return () => { alive = false; };
  }, [override, overrideConfirmed, period, subjectKind, subjectId]);

  async function saveOverride(clear: boolean) {
    setErr(null);
    const v = ovAmount.replace(/[,，\s円¥]/g, "");
    if (!clear && !/^[0-9]{1,9}$/.test(v)) { setErr("指定額は 0 以上の整数で入力してください"); return; }
    setBusy(true);
    const { error } = await createClient().rpc("payroll_withholding_override_set", { p_period: period, p_subject_kind: subjectKind, p_subject_id: subjectId, p_auto_amount: auto, p_amount: clear ? null : Number(v), p_reason: ovReason.trim() || null, p_confirmed: ovConfirmed });
    setBusy(false);
    if (error) { setErr(rpcErr432Ja(error.message)); return; }
    setOvOpen(false);
    await onSaved(clear ? "源泉の指定を外しました（自動額に戻します）" : `源泉を ${yen(Number(v))} に指定しました（この期だけ）`);
  }
  async function saveDeductions() {
    setErr(null);
    const { rows, error: e } = employeeDeductionRowsOfForm(form);
    if (e) { setErr(e); return; }
    setBusy(true);
    const { error } = await createClient().rpc("payroll_employee_deductions_set", { p_period: period, p_subject_kind: subjectKind, p_subject_id: subjectId, p_rows: rows });
    setBusy(false);
    if (error) { setErr(rpcErr432Ja(error.message)); return; }
    await onSaved(rows.length ? `控除 ${rows.length} 項目を保存しました` : "控除を空にしました（差し引きなし）");
  }
  async function copyPrev() {
    setErr(null); setInfo(null);
    const prev = prevPeriodOf(period);
    const { data, error } = await createClient().from("payroll_employee_deductions").select("kind, name, amount, sort").eq("period", prev).eq("subject_kind", subjectKind).eq("subject_id", subjectId).order("sort");
    if (error) { setErr(rpcErr432Ja(error.message)); return; }
    const rows = copyPrevDeductionsOf((data ?? []) as EmployeeDeductionRow[]);
    if (rows.length === 0) { setInfo(`前月（${prev}）の控除は入力されていません`); return; }
    setForm(employeeDeductionFormOf(rows));
    setInfo(`前月（${prev}）の ${rows.length} 項目を入れました。「控除を保存」で確定します`);
  }

  const auto0 = kind === "hostess" || kind === "other_fee";
  return (
    <div data-withholding-432={kind} style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--line2)" }}>
      <p style={{ fontSize: 11.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 4px" }}>源泉と控除（{WITHHOLDING_KIND_SHORT[kind]}）</p>
      {auto0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
            <span>自動 <span className="num">{yen(auto)}</span>{override !== null && <> → 指定 <b className="num">{yen(override)}</b>{conf ? "（税理士確認済み）" : ""}</>}</span>
            {editable && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} data-wh-override-open="1" onClick={() => { setOvOpen((v) => !v); setErr(null); }}>額を指定</button>}
          </div>
          {kind === "other_fee" && <p style={{ ...t.sub, margin: "2px 0 0" }}>{OTHER_FEE_PROVISIONAL_NOTE}</p>}
          {ovOpen && editable && (
            <div style={{ display: "grid", gap: 6, marginTop: 6 }} data-wh-override-form="1">
              <label style={t.fieldLabel}>指定額（この期だけ）<input value={ovAmount} onChange={(e) => setOvAmount(e.target.value)} inputMode="numeric" style={t.input} aria-label="指定額" /></label>
              <label style={t.fieldLabel}>理由（任意）<input value={ovReason} onChange={(e) => setOvReason(e.target.value)} maxLength={200} style={t.input} aria-label="指定の理由" /></label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, minHeight: 40 }}><input type="checkbox" checked={ovConfirmed} onChange={(e) => setOvConfirmed(e.target.checked)} data-wh-confirmed="1" />税理士確認済み</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" disabled={busy} style={{ ...t.btnGold, minHeight: 40 }} onClick={() => void saveOverride(false)} data-wh-override-save="1">指定する</button>
                {override !== null && <button type="button" disabled={busy} style={{ ...t.btnGhost, minHeight: 40 }} onClick={() => void saveOverride(true)}>指定を外す</button>}
              </div>
              {overrideLineOf(auto, override, conf) && <span style={t.sub}>{overrideLineOf(auto, override, conf)}</span>}
            </div>
          )}
        </>
      )}
      {kind === "manual" && (
        <div data-employee-deductions="1">
          <p style={{ ...t.sub, margin: "0 0 6px" }}>NOX は税額を計算しません。この月に差し引く額を入れてください（空欄＝0・入れた分だけ差し引きます）</p>
          <div style={{ display: "grid", gap: 6 }}>
            {form.map((f, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: f.kind === "other" ? "1fr 1fr auto" : "1fr 1fr", gap: 6, alignItems: "center" }}>
                {f.kind === "other"
                  ? <input value={f.name} placeholder="その他（名前）" maxLength={40} disabled={!editable} onChange={(e) => setForm((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} style={t.input} aria-label="その他の名前" data-emp-ded-name={i} />
                  : <span style={{ fontSize: 12.5 }}>{EMPLOYEE_DEDUCTION_LABEL[f.kind]}</span>}
                <input value={f.amount} placeholder="0" inputMode="numeric" disabled={!editable} onChange={(e) => setForm((xs) => xs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} style={t.input} aria-label={`${f.kind === "other" ? f.name || "その他" : EMPLOYEE_DEDUCTION_LABEL[f.kind]}の金額`} data-emp-ded-amount={f.kind} />
                {f.kind === "other" && editable && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setForm((xs) => xs.filter((_, j) => j !== i))} aria-label="この行を消す">消す</button>}
              </div>
            ))}
          </div>
          {editable && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setForm((xs) => [...xs, { kind: "other", name: "", amount: "" }])}>＋ その他を追加</button>
              <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => void copyPrev()} data-emp-ded-copy="1">前月と同じ</button>
              <button type="button" disabled={busy} style={{ ...t.btnGold, ...t.btnSm }} onClick={() => void saveDeductions()} data-emp-ded-save="1">控除を保存</button>
            </div>
          )}
        </div>
      )}
      {kind === "none" && <p style={{ fontSize: 12.5, margin: 0 }}>源泉なし（この人の区分）</p>}
      {info && <div style={{ marginTop: 6 }}><Message kind="info">{info}</Message></div>}
      {err && <div style={{ marginTop: 6 }}><Message kind="error">{err}</Message></div>}
      <p style={{ ...t.sub, margin: "6px 0 0" }} data-withholding-advice="1">{WITHHOLDING_ADVICE_NOTE}</p>
    </div>
  );
}
