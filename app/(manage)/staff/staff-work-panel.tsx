"use client";

// ★0172（裁定356・便 P172・2026-10-16）: スタッフの勤怠・報酬（読取のみ）。器＝staff_contracts／staff_punches（authenticated＝SELECT のみ・RLS＝owner 全店／manager 自店／本人は自分の行）。
//   scope "store"＝/staff の「勤怠・報酬」タブ（owner／manager）・scope "me"＝本人画面（/staff/me＝自分の行だけ＝RLS が絞る）。
//   計算＝lib/nox/staff/pay.ts（雇用＝時給×実働＋固定手当・源泉 0＝税額表は器なし／委託＝時給×実働 or 日額×日数・源泉率は T11 待ち＝0）。
//   書込（契約の登録・打刻の修正・確定）は器のみ＝RPC は次便・staff_payroll_runs への確定ボタンは置くが無効（第 2 期の注記）。
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { ResponsiveTable } from "@/components/ui/responsive-kit";
import { Message } from "@/components/ui/toast";
import { staffContractLineOf, hmOf, staffHoursOf, staffMonthRangeOf, staffPayOf, type StaffContract, type StaffPunch } from "@/lib/nox/staff/pay";
import { mig0183On } from "@/lib/nox/rules-0175/flag"; // ★裁定432（0183 ★4）
import Withholding432Panel from "@/components/nox/withholding-432-panel";
import { WITHHOLDING_ADVICE_NOTE, WITHHOLDING_KINDS, WITHHOLDING_KIND_LABEL, WITHHOLDING_KIND_SHORT, defaultWithholdingKindOf, withholdingKindOf, type EmployeeDeductionKind, type EmployeeDeductionRow } from "@/lib/nox/payroll/withholding-kind";

type Mem = { id: string; user_id: string; store_id: string; role: string; is_active: boolean };
type UserRow = { id: string; name: string | null };
const yen = (n: number) => "¥" + n.toLocaleString();
const monthNow = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 7);

export default function StaffWorkPanel({ scope, stores }: { scope: "store" | "me"; stores: { id: string; name: string }[] }) {
  const supabase = createClient();
  const [month, setMonth] = useState(monthNow());
  const [mems, setMems] = useState<Mem[]>([]);
  const [users, setUsers] = useState<Record<string, UserRow>>({});
  const [contracts, setContracts] = useState<Record<string, StaffContract>>({});
  const [punches, setPunches] = useState<StaffPunch[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [run, setRun] = useState<{ status: string } | null>(null);
  // ★裁定432: 区分の保存値（null＝既定）・その期の指定額・社員の控除（フラグ true のときだけ読む）
  const [w432, setW432] = useState<{ kind: Record<string, string | null>; ov: Record<string, number>; ded: Record<string, EmployeeDeductionRow[]> }>({ kind: {}, ov: {}, ded: {} });
  const [openMem, setOpenMem] = useState<string | null>(null);
  const [kindMsg, setKindMsg] = useState<string | null>(null); // ★便 P174 T-7: staff_payroll_runs（読取のみ・owner／manager）

  const load = useCallback(async () => {
    setErr(null);
    const { from, to } = staffMonthRangeOf(month);
    const [mm, cc, pp] = await Promise.all([
      supabase.from("memberships").select("id, user_id, store_id, role, is_active").in("role", ["staff", "manager"]),
      supabase.from("staff_contracts").select("membership_id, contract_kind, hourly, fixed_allowance, tax_class, withholding_rate"),
      supabase.from("staff_punches").select("membership_id, biz_date, kind, punched_at").gte("biz_date", from).lte("biz_date", to).order("punched_at"),
    ]);
    const e = mm.error ?? cc.error ?? pp.error;
    if (e) { setErr(`読み込みに失敗: ${e.message}`); setLoaded(true); return; }
    const rows = (mm.data ?? []) as Mem[];
    const ids = [...new Set(rows.map((m) => m.user_id))];
    const map: Record<string, UserRow> = {};
    if (ids.length) { const { data: us } = await supabase.from("users").select("id, name").in("id", ids); for (const u of (us ?? []) as UserRow[]) map[u.id] = u; }
    setMems(rows); setUsers(map);
    setContracts(Object.fromEntries(((cc.data ?? []) as StaffContract[]).map((c) => [c.membership_id, c])));
    setPunches((pp.data ?? []) as StaffPunch[]);
    if (scope === "store") { const { data: rr } = await supabase.from("staff_payroll_runs").select("status").eq("period", month).limit(1); setRun(((rr ?? []) as { status: string }[])[0] ?? null); }
    if (mig0183On()) { // ★裁定432
      const [kk, oo, dd] = await Promise.all([
        supabase.from("staff_contracts").select("membership_id, withholding_kind"),
        supabase.from("payroll_withholding_overrides").select("subject_id, amount").eq("period", month).eq("subject_kind", "staff"),
        supabase.from("payroll_employee_deductions").select("subject_id, kind, name, amount, sort").eq("period", month).eq("subject_kind", "staff").order("sort"),
      ]);
      const ded: Record<string, EmployeeDeductionRow[]> = {};
      for (const r of (dd.data ?? []) as { subject_id: string; kind: EmployeeDeductionKind; name: string | null; amount: number }[]) (ded[r.subject_id] ??= []).push({ kind: r.kind, name: r.name, amount: r.amount });
      setW432({ kind: Object.fromEntries(((kk.data ?? []) as { membership_id: string; withholding_kind: string | null }[]).map((r) => [r.membership_id, r.withholding_kind])), ov: Object.fromEntries(((oo.data ?? []) as { subject_id: string; amount: number }[]).map((r) => [r.subject_id, r.amount])), ded });
    }
    setLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const byMem = new Map<string, StaffPunch[]>();
    for (const p of punches) (byMem.get(p.membership_id) ?? byMem.set(p.membership_id, []).get(p.membership_id)!).push(p);
    // 本人画面＝RLS で自分の membership 行だけが読める（memberships_select）＝scope "me" は読めた行をそのまま使う
    return mems.filter((m) => m.is_active).map((m) => {
      const c = contracts[m.id] ?? null;
      const days = staffHoursOf(byMem.get(m.id) ?? []);
      const kind = c && mig0183On() ? withholdingKindOf(w432.kind[m.id] ?? null, defaultWithholdingKindOf({ subject: "staff", contractKind: c.contract_kind })) : null; // ★裁定432
      return { m, name: users[m.user_id]?.name ?? "—", store: stores.find((s) => s.id === m.store_id)?.name ?? "—", contract: c, days, kind,
        pay: c ? staffPayOf(c, days, kind ? { kind, override: w432.ov[m.id] ?? null, deductions: w432.ded[m.id] ?? [] } : undefined) : null };
    }).sort((a, b) => a.store.localeCompare(b.store) || a.name.localeCompare(b.name));
  }, [mems, users, contracts, punches, stores, w432]);
  async function setKind(memId: string, v: string) { // ★裁定432 ①: 区分の変更（店長以上・契約の行がある人だけ）
    setKindMsg(null);
    const { error } = await supabase.rpc("set_withholding_kind", { p_subject_kind: "staff", p_subject_id: memId, p_kind: v === "" ? null : v });
    setKindMsg(error ? `源泉区分の保存エラー: ${error.message}` : "源泉区分を保存しました");
    await load();
  }

  return (
    <section className="nox-panel" data-staff-work="1">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{scope === "me" ? "自分の勤怠・報酬" : "勤怠・報酬"}</h3>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...t.input, width: "auto", marginLeft: "auto" }} aria-label="対象月" />
      </div>
      {err && <Message kind="error" style={{ margin: "0 0 10px" }}>{err}</Message>}
      {loaded && rows.length === 0 && <p style={{ ...t.sub, margin: 0 }}>対象のスタッフがいません。</p>}
      {rows.length > 0 && (
        <ResponsiveTable>
          <table className="nox-table" style={{ width: "100%" }}>
          <thead><tr><th>名前</th>{scope === "store" && <th>店</th>}<th>契約</th><th>出勤日数</th><th>実働</th><th>支給見込み</th><th>源泉</th><th>手取り見込み</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.m.id}><tr data-staff-work-row={r.m.id} onClick={scope === "store" && r.kind ? () => setOpenMem((v) => (v === r.m.id ? null : r.m.id)) : undefined} style={scope === "store" && r.kind ? { cursor: "pointer" } : undefined}>
                <td>{r.name}<span style={{ ...t.sub, marginLeft: 6 }}>{t.roleLabelJa(r.m.role)}</span></td>
                {scope === "store" && <td>{r.store}</td>}
                <td>{r.contract ? staffContractLineOf(r.contract) : <span style={t.sub}>契約未登録</span>}</td>
                <td className="num">{r.days.length}</td>
                <td className="num">{hmOf(r.days.reduce((s, d) => s + d.minutes, 0))}{r.days.some((d) => d.open) && <span style={{ ...t.sub, marginLeft: 4 }}>（退勤待ち）</span>}</td>
                <td className="num">{r.pay ? yen(r.pay.gross) : "—"}</td>
                <td className="num">{r.pay ? yen(r.pay.withholding) : "—"}{r.pay && <div style={{ ...t.sub, fontSize: 10.5 }}>{r.pay.withholdingNote}</div>}</td>
                <td className="num">{r.pay ? yen(r.pay.net) : "—"}</td>
              </tr>
              {openMem === r.m.id && r.kind && r.pay && (/* ★裁定432: 行を押すと区分・額の指定・社員の控除 */
                <tr key={`${r.m.id}-432`} data-staff-432={r.m.id}><td colSpan={scope === "store" ? 8 : 7}>
                  <label style={{ ...t.fieldLabel, display: "block", marginBottom: 6 }}>源泉区分{" "}
                    <select value={w432.kind[r.m.id] ?? ""} onChange={(e) => void setKind(r.m.id, e.target.value)} style={{ ...t.input, width: "auto", minHeight: 40 }} aria-label="源泉区分">
                      <option value="">既定（{WITHHOLDING_KIND_SHORT[defaultWithholdingKindOf({ subject: "staff", contractKind: r.contract?.contract_kind })]}）</option>
                      {WITHHOLDING_KINDS.map((k) => <option key={k} value={k}>{WITHHOLDING_KIND_LABEL[k]}</option>)}
                    </select>
                  </label>
                  {kindMsg && <Message kind={kindMsg.includes("エラー") ? "error" : "success"} style={{ margin: "0 0 6px" }}>{kindMsg}</Message>}
                  <Withholding432Panel key={`${r.m.id}-${month}`} period={month} subjectKind="staff" subjectId={r.m.id} kind={r.kind}
                    auto={r.pay.withholdingAuto ?? r.pay.withholding} override={typeof r.pay.withholdingOverride === "number" ? r.pay.withholdingOverride : null}
                    deductions={w432.ded[r.m.id] ?? []} editable={!run || run.status === "open"} onSaved={async () => { await load(); }} />
                </td></tr>
              )}</Fragment>
            ))}
          </tbody>
          </table>
        </ResponsiveTable>
      )}
      {scope === "store" && (
        <div style={{ marginTop: 12 }}>
          {/* ★便 P174 T-7（356）: 確定（staff_payroll_runs）は書込 RPC が無い＝0175＝押せないボタンは置かず状況だけ（教訓25） */}
          <p style={{ fontSize: 12.5, margin: "0 0 4px" }} data-staff-pay-run={run ? run.status : "none"}>この月の確定: <b>{run ? (run.status === "finalized" ? "確定済み" : run.status === "paid" ? "支払済み" : run.status) : "未確定（見込み）"}</b></p>
          <p style={{ ...t.sub, margin: "6px 0 0", lineHeight: 1.6 }}>打刻は店の端末（キオスク）から。支給見込みは雇用＝時給×実働（月給は月額）、委託＝源泉 10.21% を引いた額です。{mig0183On() ? `行を押すと源泉区分・額の指定・社員の控除を入れられます。${WITHHOLDING_ADVICE_NOTE}` : ""}</p>
        </div>
      )}
    </section>
  );
}
