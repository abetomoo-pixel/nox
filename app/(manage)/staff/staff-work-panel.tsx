"use client";

// ★0172（裁定356・便 P172・2026-10-16）: スタッフの勤怠・報酬（読取のみ）。器＝staff_contracts／staff_punches（authenticated＝SELECT のみ・RLS＝owner 全店／manager 自店／本人は自分の行）。
//   scope "store"＝/staff の「勤怠・報酬」タブ（owner／manager）・scope "me"＝本人画面（/staff/me＝自分の行だけ＝RLS が絞る）。
//   計算＝lib/nox/staff/pay.ts（雇用＝時給×実働＋固定手当・源泉 0＝税額表は器なし／委託＝時給×実働 or 日額×日数・源泉率は T11 待ち＝0）。
//   書込（契約の登録・打刻の修正・確定）は器のみ＝RPC は次便・staff_payroll_runs への確定ボタンは置くが無効（第 2 期の注記）。
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import ContractChip from "@/components/nox/contract-chip"; // ★便 D M-99
import Link from "next/link"; // ★便 M3 M-23 ②: 「日ごとの勤怠を開く」（給与 › 勤怠（スタッフ）へ）
import BottomSheet, { useNarrow } from "@/components/ui/bottom-sheet"; // ★便 M3 M-23 ③: 390px＝シート化（C2-7 と同型）
import KintaiRow, { KintaiHead } from "@/components/nox/kintai-row"; // ★便 M3 M-23 ①: キャストの勤怠と同じ部品
import { STAFF_DAY_STATUS_LABEL, isStaffDayStatus, staffDayPayOf, staffDayRowsOf, staffHmToIso, staffPayHeadOf, type StaffDayStatus } from "@/lib/nox/staff/kintai";
import SegSelect from "@/components/ui/seg-select";
import MoneyInput from "@/components/ui/money-input";
import Modal from "@/components/ui/modal"; // ★便 A M-67: 日の修正はモーダル（下部埋め込みをやめる）
import DatePicker from "@/components/ui/date-picker"; // ★便 A M-67: 営業日は共通のカレンダー
import TimePicker from "@/components/ui/time-picker"; // ★便 A M-67: 出勤・退勤は共通のピッカー（26:00 の手打ちは廃止）
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { ResponsiveTable } from "@/components/ui/responsive-kit";
import { Message } from "@/components/ui/toast";
import { attachStaffAllowances, staffContractLineOf, hmOf, staffHoursOf, staffMonthRangeOf, staffPayOf, type StaffAllowanceRow, type StaffContract, type StaffPunch } from "@/lib/nox/staff/pay"; // ★0195: attachStaffAllowances
import { mig0183On, mig0188On, mig0192On, mig0194On, mig0195On } from "@/lib/nox/rules-0175/flag"; // ★裁定432（0183 ★4）・★0192 ★1／M-38: スタッフ勤怠の修正・確定・退勤の取消 ★0194: 確定額の凍結
import { effectivePayKindOf } from "@/lib/nox/staff/work"; // ★M-90
import { staffLaborRowOf } from "@/lib/nox/staff/labor"; // ★0194（裁定445 ①②）: 月の確定と同時に送る確定額の行（内訳つき）
import Withholding432Panel from "@/components/nox/withholding-432-panel";
import { WITHHOLDING_ADVICE_NOTE, WITHHOLDING_KIND_LABEL, WITHHOLDING_KIND_SELECT_NOTE, WITHHOLDING_KIND_SHORT, PAYMENT_REPORT_NOTE, defaultWithholdingKindOf, withholdingKindChoices, withholdingKindOf, type EmployeeDeductionKind, type EmployeeDeductionRow } from "@/lib/nox/payroll/withholding-kind";
import { errJa } from "@/lib/nox/errors"; // ★裁定467（M-126）: 利用者向けの文言は辞書 1 本

type Mem = { id: string; user_id: string; store_id: string; role: string; is_active: boolean };
type UserRow = { id: string; name: string | null };
const yen = (n: number) => "¥" + n.toLocaleString();
const monthNow = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 7);
const monthShift = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); }; // ★便 M3 M-22

export default function StaffWorkPanel({ scope, stores, daily = false, initialMem = null }: { scope: "store" | "me"; stores: { id: string; name: string }[];
  /** ★便 M3 M-23: true＝給与 › 勤怠（スタッフ）＝行を押すと日ごとの勤怠（正本）。false＝スタッフ › 勤怠・報酬＝月次サマリ＋副ボタンで正本へ */
  daily?: boolean; initialMem?: string | null }) {
  const supabase = createClient();
  const narrow = useNarrow(1024);
  const [month, setMonth] = useState(monthNow());
  const [dailyMem, setDailyMem] = useState<string | null>(initialMem); // ★便 M3 M-23: 日ごとの勤怠を開いている人
  const [contractForm, setContractForm] = useState<{ mem: string; contract_kind: string; pay_kind: string; amount: string } | null>(null); // ★便 M3 M-21: 働き方の欄
  const [contractMsg, setContractMsg] = useState<string | null>(null);
  const [todayBiz, setTodayBiz] = useState<string>(() => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10));
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
  // ★0192 ★1: 店が付けた区分（membership|営業日→区分）・確定済みの店（この月）・日の編集フォーム（出退は 0〜47 域の HH:MM）
  const [dayStatus, setDayStatus] = useState<Record<string, StaffDayStatus>>({});
  const [lockedStores, setLockedStores] = useState<Set<string>>(new Set());
  const [frozen, setFrozen] = useState<Record<string, { amount: number; time_pay: number }>>({}); // ★0194（裁定445 ④）: 確定後は凍結額（staff_labor_confirmed）を表示して再計算しない
  const [dayEdit, setDayEdit] = useState<{ mem: string; date: string; punches: boolean; inHm: string; outHm: string; status: "" | StaffDayStatus; note: string } | null>(null);
  const [attMsg, setAttMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [attBusy, setAttBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const { from, to } = staffMonthRangeOf(month);
    const [mm, cc, pp] = await Promise.all([
      supabase.from("memberships").select("id, user_id, store_id, role, is_active").in("role", ["staff", "manager"]),
      mig0188On() ? supabase.from("staff_contracts").select("membership_id, contract_kind, hourly, fixed_allowance, tax_class, pay_kind, monthly, daily") : supabase.from("staff_contracts").select("membership_id, contract_kind, hourly, fixed_allowance, tax_class, withholding_rate"), // ★0188（裁定434）: withholding_rate を読まない（源泉は区分で）★便 M3 M-21: 給与の形（pay_kind／monthly／daily）
      supabase.from("staff_punches").select("membership_id, biz_date, kind, punched_at").gte("biz_date", from).lte("biz_date", to).order("punched_at"),
    ]);
    const e = mm.error ?? cc.error ?? pp.error;
    if (e) { setErr(`読み込みに失敗: ${errJa(e.message)}`); setLoaded(true); return; }
    let rows = (mm.data ?? []) as Mem[];
    if (scope === "me" && rows.length === 0) { // ★M-87（2026-11-05）: 本人（staff）は memberships を読めない（RLS は owner／manager だけ）＝RPC で自分の行を組む
      const [{ data: mid }, { data: role }, { data: sid }, { data: au }] = await Promise.all([supabase.rpc("auth_membership_id"), supabase.rpc("auth_role"), supabase.rpc("auth_store_id"), supabase.auth.getUser()]);
      const { data: me } = au?.user ? await supabase.from("users").select("id").eq("auth_user_id", au.user.id).maybeSingle() : { data: null };
      if (typeof mid === "string" && typeof role === "string" && typeof sid === "string" && me?.id) rows = [{ id: mid, user_id: me.id as string, store_id: sid, role, is_active: true } as Mem];
    }
    const ids = [...new Set(rows.map((m) => m.user_id))];
    const map: Record<string, UserRow> = {};
    if (ids.length) { const { data: us } = await supabase.from("users").select("id, name").in("id", ids); for (const u of (us ?? []) as UserRow[]) map[u.id] = u; }
    setMems(rows); setUsers(map);
    const { data: al } = mig0195On() ? await supabase.from("staff_allowances").select("membership_id, name, amount, sort").eq("is_active", true).order("sort") : { data: null }; // ★0195: 名称つきの固定手当＝見込み（staffPayOf）と確定（staffLaborRowOf の allowances）に
    setContracts(Object.fromEntries(attachStaffAllowances((cc.data ?? []) as StaffContract[], al as StaffAllowanceRow[] | null).map((c) => [c.membership_id, c])));
    setPunches((pp.data ?? []) as StaffPunch[]);
    if (scope === "store") { const { data: rr } = await supabase.from("staff_payroll_runs").select("status").eq("period", month).limit(1); setRun(((rr ?? []) as { status: string }[])[0] ?? null); }
    if (stores[0]?.id) { const { data: tb } = await supabase.rpc("biz_date_of", { p_store_id: stores[0].id, p_at: new Date().toISOString() }); if (typeof tb === "string") setTodayBiz(tb); } // ★便 M3 M-23: 営業日の今日（勤務中／退勤記録なしの判定）
    if (mig0192On() && scope === "store") { // ★0192 ★1: 区分と月の確定（RLS＝owner 全店／manager 自店）
      const [ds, ls] = await Promise.all([
        supabase.from("staff_attendance_days").select("membership_id, biz_date, status").gte("biz_date", from).lte("biz_date", to),
        supabase.from("staff_attendance_locks").select("store_id").eq("period", month),
      ]);
      setDayStatus(Object.fromEntries(((ds.data ?? []) as { membership_id: string; biz_date: string; status: string }[]).filter((r) => isStaffDayStatus(r.status)).map((r) => [`${r.membership_id}|${r.biz_date}`, r.status as StaffDayStatus])));
      setLockedStores(new Set(((ls.data ?? []) as { store_id: string }[]).map((r) => r.store_id)));
      if (mig0194On()) { const { data: fz } = await supabase.from("staff_labor_confirmed").select("membership_id, amount, time_pay").eq("period", month); setFrozen(Object.fromEntries(((fz ?? []) as { membership_id: string; amount: number; time_pay: number }[]).map((r) => [r.membership_id, { amount: r.amount, time_pay: r.time_pay }]))); } // ★0194
    }
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
  // ★便 M3 M-21: 働き方の欄＝雇用形態・給与の形・額＝staff_contract_set（0176・patch）。源泉区分は下の既存の欄（雇用形態から既定）
  const CONTRACT_KIND_OPTS = [["contractor", "業務委託"], ["parttime", "アルバイト・パート"], ["employee", "正社員"]] as const;
  const PAY_KIND_OPTS = [["hourly", "時給"], ["daily", "日給"], ["monthly", "月給"]] as const;
  function openContract(memId: string) {
    const c = contracts[memId] as (StaffContract & { pay_kind?: string | null; monthly?: number | null; daily?: number | null }) | undefined;
    const pk = effectivePayKindOf(c); // ★M-90: pay_kind 'hourly'（列の既定）＋時給 0・月額>0 は月給として開く
    const amt = pk === "monthly" ? (c?.monthly ?? c?.fixed_allowance ?? 0) : pk === "daily" ? (c?.daily ?? c?.fixed_allowance ?? 0) : (c?.hourly ?? 0);
    setContractForm({ mem: memId, contract_kind: c?.contract_kind ?? "parttime", pay_kind: pk, amount: amt ? String(amt) : "" }); setContractMsg(null);
  }
  async function saveContract() {
    if (!contractForm) return;
    const n = Number(String(contractForm.amount).replace(/[,，\s円¥]/g, ""));
    if (!Number.isInteger(n) || n < 0) { setContractMsg("額は 0 以上の整数で入力してください"); return; }
    const patchObj: Record<string, unknown> = { contract_kind: contractForm.contract_kind, pay_kind: contractForm.pay_kind, [contractForm.pay_kind]: n };
    const { error } = await supabase.rpc("staff_contract_set", { p_membership_id: contractForm.mem, p_patch: patchObj });
    if (error) { setContractMsg(`働き方の保存エラー: ${rpcErrJa(error.message)}`); return; }
    setContractMsg("働き方を保存しました"); setContractForm(null); await load();
  }
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
        <span className="nox-seg" style={{ display: "inline-flex", marginLeft: "auto" }} data-staff-month="1">{/* ★便 M3 M-22: 他の画面と同じ月の切替（手入力をやめる） */}
          <button type="button" onClick={() => setMonth(monthShift(month, -1))} aria-label="前の月">‹</button>
          <button type="button" className="on num" style={{ minWidth: 110 }} aria-label="対象月">{month.slice(0, 4)}年{Number(month.slice(5, 7))}月</button>
          <button type="button" onClick={() => setMonth(monthShift(month, 1))} aria-label="次の月">›</button>
        </span>
      </div>
      {err && <Message kind="error" style={{ margin: "0 0 10px" }}>{err}</Message>}
      {loaded && rows.length === 0 && <p style={{ ...t.sub, margin: 0 }}>対象のスタッフがいません。</p>}
      {rows.length > 0 && (
        <ResponsiveTable>
          <table className="nox-table" style={{ width: "100%" }}>
          <thead><tr><th>名前</th>{scope === "store" && <th>店</th>}<th>契約</th>{/* ★便 M5b M-54: 数値の列は見出しも右寄せ＝値（.num）と同じ位置 */}<th className="num" style={{ textAlign: "right" }}>出勤日数</th><th className="num" style={{ textAlign: "right" }}>実働</th><th className="num" style={{ textAlign: "right" }}>支給見込み</th><th className="num" style={{ textAlign: "right" }}>源泉</th><th className="num" style={{ textAlign: "right" }}>手取り見込み</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.m.id}><tr data-staff-work-row={r.m.id} onClick={daily ? () => setDailyMem((v) => (v === r.m.id ? null : r.m.id)) : scope === "store" ? () => setOpenMem((v) => (v === r.m.id ? null : r.m.id)) : undefined} style={daily || scope === "store" ? { cursor: "pointer", background: dailyMem === r.m.id ? "var(--card2)" : undefined } : undefined}>
                <td>{r.name}<span style={{ ...t.sub, marginLeft: 6 }}>{t.roleLabelJa(r.m.role)}</span></td>
                {scope === "store" && <td>{r.store}</td>}
                <td>{r.contract ? <ContractChip text={staffContractLineOf(r.contract)} dataKey="data-staff-work-contract" /> : <span style={t.sub}>契約未登録</span>}</td>{/* ★便 D M-99: 共通の契約チップ */}
                <td className="num">{r.days.length}</td>
                <td className="num">{hmOf(r.days.reduce((s, d) => s + d.minutes, 0))}{r.days.some((d) => d.open) && <span style={{ ...t.sub, marginLeft: 4 }}>（退勤待ち）</span>}</td>
                <td className="num">{frozen[r.m.id] ? <>{yen(frozen[r.m.id].amount)}<span className="nox-stpill" style={{ marginLeft: 6 }} data-staff-frozen={r.m.id}>確定額</span></> : r.pay ? yen(r.pay.gross) : "—"}</td>{/* ★0194（裁定445 ④）: 確定後は凍結額 */}
                <td className="num">{r.pay ? yen(r.pay.withholding) : "—"}{r.pay && <div style={{ ...t.sub, fontSize: 10.5 }}>{r.pay.withholdingNote}</div>}</td>
                <td className="num">{r.pay ? yen(r.pay.net) : "—"}</td>
              </tr>
              {openMem === r.m.id && scope === "store" && (/* ★裁定432: 行を押すと区分・額の指定・社員の控除 ／ ★便 A M-80 ②: 契約未登録でも開く（働き方を登録） */
                <tr key={`${r.m.id}-432`} data-staff-432={r.m.id}><td colSpan={scope === "store" ? 8 : 7}>
                  {/* ★便 M3 M-21: 働き方の欄（雇用形態・給与の形・額）＝staff_contract_set */}
                  <div data-staff-contract={r.m.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)" }}>働き方</span><span style={{ fontSize: 12.5 }}>{r.contract ? staffContractLineOf(r.contract) : "契約未登録"}</span>
                      {!contractForm && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => openContract(r.m.id)} data-staff-contract-edit="1">{r.contract ? "働き方を変更" : "働き方を登録"}</button>}</div>
                    {contractForm?.mem === r.m.id && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 6 }}>
                        <label style={t.fieldLabel}>雇用形態<br /><SegSelect value={contractForm.contract_kind} onChange={(v) => setContractForm({ ...contractForm, contract_kind: v })} options={CONTRACT_KIND_OPTS} ariaLabel="雇用形態" /></label>
                        <label style={t.fieldLabel}>給与の形<br /><SegSelect value={contractForm.pay_kind} onChange={(v) => setContractForm({ ...contractForm, pay_kind: v })} options={PAY_KIND_OPTS} ariaLabel="給与の形" /></label>
                        <label style={t.fieldLabel}>額<br /><MoneyInput value={contractForm.amount} onChange={(v) => setContractForm({ ...contractForm, amount: v })} width={140} ariaLabel="働き方の額" /></label>
                        <div className="nox-actions" style={{ width: "100%" }}><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setContractForm(null)}>やめる</button><button type="button" style={{ ...t.btnGold, ...t.btnSm }} onClick={() => void saveContract()} data-staff-contract-save="1">保存する</button></div>
                      </div>)}
                    {contractMsg && <Message kind={/エラー/.test(contractMsg) ? "error" : "success"} style={{ margin: "6px 0 0" }}>{contractMsg}</Message>}
                  </div>
                  {!daily && <div className="nox-actions" style={{ margin: "0 0 8px" }}><Link href={`/payroll?tab=attendance&who=staff&mem=${r.m.id}`} style={{ ...t.btnGhost, ...t.btnSm, textDecoration: "none", display: "inline-flex", alignItems: "center" }} data-staff-daily-link={r.m.id}>日ごとの勤怠を開く</Link></div>}{/* ★便 M3 M-23 ②: 正本（給与 › 勤怠（スタッフ））へ */}
                  {r.kind && r.pay && (<>{/* ★便 A M-80 ②: 源泉区分・控除は契約がある人だけ */}
                  <label style={{ ...t.fieldLabel, display: "block", marginBottom: 6 }}>源泉区分{" "}
                    <SegSelect value={w432.kind[r.m.id] ?? ""} onChange={(v) => void setKind(r.m.id, v)} options={[["", `既定（${WITHHOLDING_KIND_SHORT[defaultWithholdingKindOf({ subject: "staff", contractKind: r.contract?.contract_kind })]}）`] as const, ...withholdingKindChoices().map((k) => [k, WITHHOLDING_KIND_LABEL[k]] as const)]} ariaLabel="源泉区分" wrap />{/* ★M-82: 源泉区分＝ボタン群 ★0188（裁定434 ①）: none／hostess／other_204／manual */}
                  </label>
                  {mig0188On() && <p style={{ ...t.sub, margin: "0 0 6px" }} data-withholding-kind-note="1">{WITHHOLDING_KIND_SELECT_NOTE}{PAYMENT_REPORT_NOTE[r.kind] ? "・" + PAYMENT_REPORT_NOTE[r.kind] : ""}</p>}{/* ★0188（裁定434 ②③） */}
                  {kindMsg && <Message kind={kindMsg.includes("エラー") ? "error" : "success"} style={{ margin: "0 0 6px" }}>{kindMsg}</Message>}
                  <Withholding432Panel key={`${r.m.id}-${month}`} period={month} subjectKind="staff" subjectId={r.m.id} kind={r.kind}
                    auto={r.pay.withholdingAuto ?? r.pay.withholding} override={typeof r.pay.withholdingOverride === "number" ? r.pay.withholdingOverride : null}
                    deductions={w432.ded[r.m.id] ?? []} editable={!run || run.status === "open"} onSaved={async () => { await load(); }} />
                  </>)}
                </td></tr>
              )}</Fragment>
            ))}
          </tbody>
          </table>
        </ResponsiveTable>
      )}
      {daily && dailyMem && (() => { /* ★便 M3 M-23 ①③: 1 人 1 か月の日ごとの勤怠＝キャストと同じ部品（KintaiHead／KintaiRow・withPay なし）＋時給分／日計（時給制だけ）・月給は — */
        const r = rows.find((x) => x.m.id === dailyMem); if (!r) return null;
        const statusOfMem = Object.fromEntries(Object.entries(dayStatus).filter(([key]) => key.startsWith(`${r.m.id}|`)).map(([key, v]) => [key.slice(r.m.id.length + 1), v])); // ★0192 ★1
        const dayRows = staffDayRowsOf(punches.filter((p) => p.membership_id === r.m.id), todayBiz, statusOfMem);
        const att = mig0192On() && scope === "store"; // ★0192 ★1／M-38: 店の修正・確定・退勤の取消
        const monthLocked = lockedStores.has(r.m.store_id);
        const todayOutRow = dayRows.find((d) => d.bizDate === todayBiz && !!d.outHm) ?? null;
        const openDay = (d: { bizDate: string; inHm: string | null; outHm: string | null }) => setDayEdit({ mem: r.m.id, date: d.bizDate, punches: false, inHm: d.inHm ?? "", outHm: d.outHm ?? "", status: statusOfMem[d.bizDate] ?? "", note: "" });
        const saveDay = async () => {
          if (!dayEdit || attBusy) return;
          const inIso = dayEdit.punches && dayEdit.inHm.trim() ? staffHmToIso(dayEdit.date, dayEdit.inHm) : null;
          const outIso = dayEdit.punches && dayEdit.outHm.trim() ? staffHmToIso(dayEdit.date, dayEdit.outHm) : null;
          if (dayEdit.punches && ((dayEdit.inHm.trim() && !inIso) || (dayEdit.outHm.trim() && !outIso))) { setAttMsg({ kind: "error", text: "出勤・退勤の時刻を選んでください" }); return; } // ★便 A M-67: TimePicker の値
          setAttBusy(true); setAttMsg(null);
          const { error } = await supabase.rpc("staff_attendance_set", { p_membership_id: dayEdit.mem, p_biz_date: dayEdit.date, p_punches: dayEdit.punches === true, p_in: inIso, p_out: outIso, p_status: dayEdit.status || null, p_note: dayEdit.note });
          setAttBusy(false);
          if (error) { const m = error.message; setAttMsg({ kind: "error", text: m.includes("confirmed") ? "この月は確定済みです（解除は店長以上）" : m.includes("bad time") ? "時刻が営業日に合いません（退勤は出勤より後・24 時間以内）" : `保存に失敗: ${rpcErrJa(m)}` }); return; }
          setDayEdit(null); setAttMsg({ kind: "success", text: "勤怠を保存しました" }); await load();
        };
        const confirmMonth = async (lock: boolean) => {
          if (attBusy) return; setAttBusy(true); setAttMsg(null);
          // ★0194（裁定445 ①②）: 確定のときは店の全員分の確定額（内訳つき）を同じ RPC で送る＝同一トランザクションで凍結（時給制は RPC が再計算して一致を確認）。解除は従来どおり（額も消える）
          const p_labor = mig0194On() && lock ? rows.filter((x) => x.m.store_id === r.m.store_id && x.contract && x.pay).map((x) => staffLaborRowOf(x.m.id, x.contract!, x.pay!)) : null;
          const { error } = await supabase.rpc("staff_attendance_confirm", { p_store_id: r.m.store_id, p_period: month, p_lock: lock === true, ...(p_labor ? { p_labor } : {}) });
          setAttBusy(false);
          if (error) { setAttMsg({ kind: "error", text: error.message.includes("forbidden") ? (lock ? "権限がありません（自店の店長以上）" : "権限がありません（自店の店長以上）") : error.message.includes("labor mismatch") ? `確定額の再計算が合いません（画面を読み直してからもう一度）: ${error.message}` : `失敗: ${rpcErrJa(error.message)}` }); return; }
          setAttMsg({ kind: "success", text: lock ? `${month.replace("-", "/")} のスタッフ勤怠を確定しました` : "確定を解除しました" }); await load();
        };
        const cancelOut = async () => {
          if (attBusy || !window.confirm(`${r.name} の今日の退勤（${todayOutRow?.outHm ?? ""}）を取り消して勤務中に戻しますか`)) return;
          setAttBusy(true); setAttMsg(null);
          const { error } = await supabase.rpc("staff_punch_cancel_out", { p_membership_id: r.m.id });
          setAttBusy(false);
          if (error) { setAttMsg({ kind: "error", text: error.message.includes("not out") ? "今日の最後の打刻が退勤ではないため取り消せません" : error.message.includes("confirmed") ? "この月は確定済みです" : `取り消しに失敗: ${rpcErrJa(error.message)}` }); return; }
          setAttMsg({ kind: "success", text: `${r.name} の今日の退勤を取り消しました` }); await load();
        };
        const c = r.contract as (StaffContract & { pay_kind?: string | null; monthly?: number | null; daily?: number | null }) | null;
        const hourly = (c?.pay_kind ?? (c && c.hourly > 0 ? "hourly" : "monthly")) === "hourly";
        const timePay = dayRows.reduce((a, d) => a + (staffDayPayOf(c, d) ?? 0), 0);
        const title = <>{r.name} の勤怠（{r.store}・{month.replace("-", "/")}）<span className="nox-stpill" style={{ marginLeft: 6 }} data-staff-pay-head="1">{staffPayHeadOf(c)}</span></>;
        const table = (
          <div data-staff-daily={r.m.id}>
            <p className="num" style={{ ...t.sub, margin: "0 0 6px" }} data-staff-daily-total={`${r.days.length}:${r.days.reduce((a, d) => a + d.minutes, 0)}`}>出勤 {dayRows.filter((d) => d.inHm).length} 日・実働 {hmOf(r.days.reduce((a, d) => a + d.minutes, 0))}{hourly ? <>・時給分 {yen(timePay)}</> : <>・時給分 —（{staffPayHeadOf(c)}）</>}</p>
            <div className="nox-kintai-scroll" style={{ overflowX: "auto", maxWidth: "100%" }}><table className="nox-table nox-kintai-table" style={{ width: "100%" }}>
              <KintaiHead withPay={false} wageOnly={hourly} />{/* ★便 A M-68: 時給制だけ「時給分」列（キャストの金額列と同じ位置） */}
              <tbody>{dayRows.map((d) => <KintaiRow key={d.bizDate} r={d} withBy={false} withPay={false} wageCell={hourly ? staffDayPayOf(c, d) : undefined} onEdit={att && !monthLocked ? (row) => openDay(row) : null} onFix={null} onConfirmShift={null} />)}</tbody>
              <tfoot><tr><td colSpan={9} style={{ ...t.td, fontWeight: 800 }}>日計の合計（時給分）</td>{/* ★便 A M-68: 右の列＝「時給分」列の合計 */}<td className="num" style={{ ...t.td, textAlign: "right", fontWeight: 800 }} data-staff-daily-pay={hourly ? timePay : ""}>{hourly ? yen(timePay) : "—"}</td></tr></tfoot>
            </table></div>
            {att ? (/* ★0192 ★1／M-38 */
              <div data-staff-att="0192" style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <div className="nox-actions" data-staff-att-actions="1">{/* ★M-63（2026-11-04 Agoora 実機）: 「＋ 日を追加・修正」「この月を確定」は左右端ではなく 2 つ並べて中央（.nox-actions の既定＝裁定242／教訓122・間隔 gap 8 は既存のボタン群と同じ・marginLeft:auto を外す） */}
                  {monthLocked ? <span className="nox-stpill" data-staff-att-locked="1">この月は確定済み</span> : <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} data-staff-att-add="1" disabled={attBusy} onClick={() => openDay({ bizDate: todayBiz, inHm: null, outHm: null })}>＋ 日を追加・修正</button>}
                  {!monthLocked && todayOutRow && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} data-staff-cancel-out="1" disabled={attBusy} onClick={() => void cancelOut()}>今日の退勤を取り消す</button>}
                  {monthLocked
                    ? <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} data-staff-att-unlock="1" disabled={attBusy} onClick={() => void confirmMonth(false)}>確定を解除</button>
                    : <button type="button" style={{ ...t.btnGold, ...t.btnSm }} data-staff-att-lock="1" disabled={attBusy} onClick={() => { if (window.confirm(`${month.replace("-", "/")} のスタッフ勤怠を確定しますか（以後この月の修正・取消はできません）`)) void confirmMonth(true); }}>この月を確定</button>}
                </div>
                {dayEdit && dayEdit.mem === r.m.id && (/* ★便 A M-67: 日の修正はモーダル（キャストの勤怠の修正と同じ型＝営業日は DatePicker・出勤／退勤は TimePicker・区分はボタン群・キャンセル／保存は中央） */
                  <Modal onClose={() => { if (!attBusy) setDayEdit(null); }} maxWidth={460} scroll>
                  <div data-staff-day-edit={dayEdit.date || "new"} style={{ display: "grid", gap: 8, padding: "4px 2px" }}>
                    <h3 style={{ ...t.cardTitle, margin: 0 }}>{r.name}：{dayEdit.date ? `${Number(dayEdit.date.slice(5, 7))}/${Number(dayEdit.date.slice(8, 10))} の修正` : "日を追加・修正"}</h3>
                    <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>営業日</span><DatePicker value={dayEdit.date} onChange={(v) => setDayEdit({ ...dayEdit, date: v })} max={todayBiz} todayYmd={todayBiz} ariaLabel="営業日" width={220} testId="staff-day-date" /></label>
                    <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5 }}><input type="checkbox" checked={dayEdit.punches} onChange={(e) => setDayEdit({ ...dayEdit, punches: e.target.checked })} />打刻を差し替える（下の出勤・退勤で置き換え・空欄は打たない）</label>
                    {dayEdit.punches && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <label style={{ display: "grid", gap: 3 }} data-staff-day-in="1"><span style={t.fieldLabel}>出勤</span><TimePicker value={dayEdit.inHm} onChange={(v) => setDayEdit({ ...dayEdit, inHm: v })} step={15} maxHour={23} ariaLabel="出勤" width="100%" /></label>
                        <label style={{ display: "grid", gap: 3 }} data-staff-day-out="1"><span style={t.fieldLabel}>退勤</span><TimePicker value={dayEdit.outHm} onChange={(v) => setDayEdit({ ...dayEdit, outHm: v })} step={15} maxHour={47} after={dayEdit.inHm || null} ariaLabel="退勤" width="100%" /></label>
                      </div>
                    )}
                    <div style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>区分</span>
                      <SegSelect value={dayEdit.status} onChange={(v) => setDayEdit({ ...dayEdit, status: isStaffDayStatus(v) ? v : "" })} options={[["", "（なし）"], ...(Object.keys(STAFF_DAY_STATUS_LABEL) as StaffDayStatus[]).map((v) => [v, STAFF_DAY_STATUS_LABEL[v]] as const)]} ariaLabel="区分" wrap /></div>
                    <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>メモ（200 字まで・監査に残ります）</span><input value={dayEdit.note} maxLength={200} onChange={(e) => setDayEdit({ ...dayEdit, note: e.target.value })} style={t.input} /></label>
                    {attMsg && <Message kind={attMsg.kind} style={{ margin: 0 }}>{attMsg.text}</Message>}
                    <div className="nox-actions" data-staff-day-actions="1">
                      <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={attBusy} onClick={() => setDayEdit(null)}>キャンセル</button>
                      <button type="button" style={{ ...t.btnGold, ...t.btnSm }} data-staff-day-save="1" disabled={attBusy || !dayEdit.date} onClick={() => void saveDay()}>保存</button>
                    </div>
                  </div>
                  </Modal>
                )}
                {attMsg && <Message kind={attMsg.kind} style={{ margin: 0 }}>{attMsg.text}</Message>}
                <p style={{ ...t.sub, margin: 0 }}>日計＝時給×実働（時給制だけ・月給／日給は —）。日付を押すとその日を修正できます（打刻の差し替え・当欠／遅刻／早退）。月を確定すると以後の修正と退勤の取消はできません（解除は店長以上）。</p>
              </div>
            ) : <p style={{ ...t.sub, margin: "6px 0 0" }}>日計＝時給×実働（時給制だけ・月給／日給は —）。打刻の修正・シフト無し出勤の確定はスタッフの器が無いため 0190／0191 の後（キャストの勤怠と同じ部品）。</p>}
          </div>);
        return narrow
          ? <BottomSheet onClose={() => setDailyMem(null)} title={title} testId="staff-kintai">{table}</BottomSheet>
          : <section className="nox-cardtop" style={{ ...t.card, marginTop: 12 }}><div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}><h3 style={{ ...t.cardTitle, margin: 0 }}>{title}</h3><button type="button" style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto" }} onClick={() => setDailyMem(null)}>閉じる</button></div>{table}</section>;
      })()}
      {scope === "store" && (
        <div style={{ marginTop: 12 }}>
          {/* ★便 P174 T-7（356）: 確定（staff_payroll_runs）は書込 RPC が無い＝0175＝押せないボタンは置かず状況だけ（教訓25） */}
          {/* ★裁定449（2026-11-04・相談役）: スタッフ給与 run の作成の口は作らない＝run の状態は画面に出さず DB だけ残す（staff_payroll_runs の読取は Withholding432Panel の editable の判定に残す）。確定額 staff_labor_confirmed が実質の確定 */}
          <p style={{ ...t.sub, margin: "6px 0 0", lineHeight: 1.6 }}>打刻は店の端末（キオスク）から。支給見込みは雇用＝時給×実働（月給は月額）、委託＝{mig0188On() ? "源泉区分（既定は対象外＝源泉なし・ホステス等なら 10.21%）で計算した額" : "源泉 10.21% を引いた額"}です。{mig0183On() ? `行を押すと源泉区分・額の指定・社員の控除を入れられます。${WITHHOLDING_ADVICE_NOTE}` : ""}</p>
        </div>
      )}
    </section>
  );
}
