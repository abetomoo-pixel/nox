// ★便 M6（2026-11-02 夜・client のみ）: スタッフ給与のコスト計上の純関数（決定 11/02＝台帳の候補 439）。DB・ブラウザを知らない。
//   月給＝月額を「その月の営業日」で日割り（端数は最後の営業日へ＝合計は月額と一致）／時給＝実働×時給（0192 の日別勤怠の修正＝staff_punches の manual は打刻として読むだけで反映）／
//   日給＝出勤した日（打刻あり）に日額。当欠（staff_attendance_days.status absent）の日は時給・日給 0（月給は減らさない＝★相談役確認待ち）。
//   時給制の固定手当（fixed_allowance）は月給と同じく営業日で日割り。事業主負担の社会保険は載せない。
//   見込み／確定＝その月が staff_attendance_locks で確定済みなら「確定」・それ以外は「見込み」（確定額の凍結の表は 0194 候補＝それまでは確定後も今の契約で計算）。
//   営業日＝暦日のうち store_business_hours の定休曜日を除き、store_special_days の臨時休業を除き特別営業を足す（★相談役確認待ち：月報の「営業日数＝締め済み日報の件数」とは定義が違う）。
import { daysInMonthOf } from "../month";
import { staffAllowanceSumOf, type StaffAllowance } from "./pay"; // ★0195（M-80 追記②）: 名称つきの固定手当
import { PAY_KIND_JA, staffAllowanceDropOf } from "./work"; // ★決め 3（2026-11-28）: 断られたときの文（月給・日給の検算）

export type StaffLaborContract = { pay_kind?: string | null; hourly: number; fixed_allowance: number; monthly?: number | null; daily?: number | null; allowances?: readonly StaffAllowance[] }; // ★0195: allowances（無ければ従来と同値）
export type StaffLaborDay = { bizDate: string; minutes: number };

/** その月（YYYY-MM）の営業日（昇順） */
export function bizDaysOfMonth(period: string, closedDows: ReadonlySet<number>, specialClosed: ReadonlySet<string> = new Set(), specialOpen: ReadonlySet<string> = new Set()): string[] {
  const [y, m] = period.split("-").map(Number);
  const dim = daysInMonthOf(period); // ★X-13-H H-9: 暦月の日数は lib/nox/month に寄せる
  const out: string[] = [];
  for (let d = 1; d <= dim; d++) {
    const ymd = `${period}-${String(d).padStart(2, "0")}`;
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if ((!closedDows.has(dow) && !specialClosed.has(ymd)) || specialOpen.has(ymd)) out.push(ymd);
  }
  return out;
}

/** 金額を営業日へ按分（円未満は切捨・端数は最後の営業日へ） */
export function spreadOverDays(amount: number, days: readonly string[]): Record<string, number> {
  if (amount <= 0 || days.length === 0) return {};
  const per = Math.floor(amount / days.length);
  const out: Record<string, number> = {};
  days.forEach((d, i) => { out[d] = i === days.length - 1 ? amount - per * (days.length - 1) : per; });
  return out;
}

/** 1 人 1 か月のコスト（日別・合計） */
export function staffLaborOf(c: StaffLaborContract | null, days: readonly StaffLaborDay[], absent: ReadonlySet<string>, bizDays: readonly string[]): { byDay: Record<string, number>; total: number } {
  const byDay: Record<string, number> = {};
  const add = (d: string, v: number) => { if (v > 0) byDay[d] = (byDay[d] ?? 0) + v; };
  if (!c) return { byDay, total: 0 };
  const kind = c.pay_kind ?? (c.hourly > 0 ? "hourly" : c.fixed_allowance > 0 ? "monthly" : "hourly");
  if (kind === "monthly" || kind === "monthly_fixed") {
    for (const [d, v] of Object.entries(spreadOverDays(c.monthly ?? c.fixed_allowance, bizDays))) add(d, v);
  } else if (kind === "daily") {
    for (const x of days) if (x.minutes > 0 && !absent.has(x.bizDate)) add(x.bizDate, c.daily ?? 0);
  } else {
    for (const x of days) if (!absent.has(x.bizDate)) add(x.bizDate, Math.floor((c.hourly * x.minutes) / 60));
    for (const [d, v] of Object.entries(spreadOverDays(c.fixed_allowance + staffAllowanceSumOf(c), bizDays))) add(d, v); // ★0195: 名称つきの行も営業日で日割り
  }
  return { byDay, total: Object.values(byDay).reduce((a, v) => a + v, 0) };
}

// ★0194（裁定445 ①・2026-11-04）: 月の確定（staff_attendance_confirm の p_labor）に送る 1 人分の行＝内訳つき。
//   時給制の行は RPC が 時給×実働÷60（端数＝店設定 labor_rounding・既定 down＝floorYen）を再計算して time_pay と amount（＝time_pay＋fixed）の一致を確認する＝staffPayOf（timePay＝floorYen・gross＝timePay＋fixed）と同じ式。
//   月給／日給の行は RPC では再計算しない（amount＝staffPayOf の gross をそのまま）。deductions＝社員の控除の内訳（412 の行）。calc_version＝計算の版（表示のため）。
export const STAFF_LABOR_CALC_VERSION = "staffPayOf 2026-11 (floorYen, allowances 0195, pay_kind+withholding 0237)"; // ★0237: 月給・日給の額と源泉の凍結を送る版 // ★0195（裁定450 の 6）: 内訳 allowances を送る版＝client で上げる
/** ★0195（裁定450 の 6）: 月の確定に送る固定手当の内訳＝契約の 1 本（「固定手当」）＋名称つきの行（0 円の行は送らない）。Σ＝fixed を RPC が検証する＝合わないときは fixed 1 行に畳む（RPC は client の合計を信用しない＝ここは同じ式の写し） */
export function staffLaborAllowancesOf(c: { fixed_allowance: number; allowances?: readonly StaffAllowance[] }, fixed: number): StaffAllowance[] {
  const rows: StaffAllowance[] = [...(c.fixed_allowance > 0 ? [{ name: "固定手当", amount: c.fixed_allowance }] : []), ...(c.allowances ?? []).filter((x) => x.amount > 0).map((x) => ({ name: x.name, amount: x.amount }))];
  const sum = rows.reduce((a, x) => a + x.amount, 0);
  if (sum === fixed) return rows;
  return fixed > 0 ? [{ name: "固定手当", amount: fixed }] : [];
}
export type StaffLaborRow = { membership_id: string; pay_kind: "hourly" | "daily" | "monthly"; hourly: number; minutes: number; time_pay: number; fixed: number; monthly: number; daily: number; days: number; amount: number; deductions: { kind: string; name?: string | null; amount: number }[]; calc_version: string; allowances: StaffAllowance[]; /** ★0237（#186）: 源泉の区分・額・手取り＝RPC が再計算して照合し凍結（区分を渡さない旧の呼び方はキーなし） */ withholding_kind?: string; withholding?: number; net?: number }; // ★0195: 固定手当の内訳（Σ＝fixed）
export function staffLaborRowOf(membershipId: string, c: { pay_kind?: string | null; hourly: number; fixed_allowance: number; monthly?: number | null; daily?: number | null; allowances?: readonly StaffAllowance[] }, pay: { minutes: number; timePay: number; fixed: number; gross: number; days: number; employeeDeductions?: readonly { kind: string; name?: string | null; amount: number }[]; withholdingKind?: string; withholding?: number; net?: number }): StaffLaborRow {
  const kind: StaffLaborRow["pay_kind"] = c.pay_kind === "daily" ? "daily" : c.pay_kind === "monthly" || c.pay_kind === "monthly_fixed" ? "monthly" : "hourly";
  return { membership_id: membershipId, pay_kind: kind, hourly: kind === "hourly" ? c.hourly : 0, minutes: pay.minutes, time_pay: kind === "hourly" ? pay.timePay : 0, fixed: kind === "hourly" ? pay.fixed : 0, monthly: kind === "monthly" ? (c.monthly ?? c.fixed_allowance) : c.monthly ?? 0, daily: kind === "daily" ? (c.daily ?? c.fixed_allowance) : c.daily ?? 0, days: pay.days, /* ★0237（#101）: 月給・日給の行は契約の額（RPC が契約と照合）＝旧データの fixed_allowance も */ amount: pay.gross, deductions: (pay.employeeDeductions ?? []).map((d) => ({ kind: d.kind, name: d.name ?? null, amount: d.amount })), calc_version: STAFF_LABOR_CALC_VERSION, allowances: kind === "hourly" ? staffLaborAllowancesOf(c, pay.fixed) : [], ...(pay.withholdingKind ? { withholding_kind: pay.withholdingKind, withholding: pay.withholding ?? 0, net: pay.net ?? pay.gross } : {}) }; // ★0237（#186） // ★0195: 時給制だけ内訳（他は fixed 0＝[]）
}

// ★決め 3（2026-11-28 Agoora）・0237（#101）: 月の確定が月給・日給の検算で断られたとき（'labor mismatch: monthly amount … <> contract …'／'labor mismatch: daily amount … <> … x days …'）、
//   例外の文には人の名前も id も無い＝送った行と読み直した契約に、0237 の staff_attendance_confirm と同じ検算（写し）を当てて「どの人の・何が合わないか」を出す。
//   検算＝月給・月額固定は monthly（無ければ fixed_allowance）・日給は daily（無ければ fixed_allowance）× days。行の time_pay と fixed は 0（月給・日給には固定手当を足さない）。
export type StaffLaborMismatch = { membership_id: string; pay: "monthly" | "daily"; payKind: string; reason: "kind" | "fixed" | "amount"; sent: number; base: number; days: number; fixed: number; /** 契約に残っている固定手当（1 本＋名称つきの行）＝働き方を保存し直すと外れる */ leftover: number };
export type StaffLaborMismatchContract = { pay_kind?: string | null; hourly: number; fixed_allowance: number; monthly?: number | null; daily?: number | null; allowances?: readonly StaffAllowance[] | null };
export const isStaffLaborPayMismatch = (msg: string | null | undefined): boolean => /labor mismatch: (monthly|daily) amount /.test(msg ?? "");
export function staffLaborMismatchesOf(rows: readonly StaffLaborRow[], contracts: Readonly<Record<string, StaffLaborMismatchContract | null | undefined>>): StaffLaborMismatch[] {
  const out: StaffLaborMismatch[] = [];
  for (const r of rows) {
    const c = contracts[r.membership_id];
    const pk = c?.pay_kind;
    if (!c || (pk !== "monthly" && pk !== "monthly_fixed" && pk !== "daily")) continue; // 契約が時給・契約なしの行は 0237 も契約と照合しない
    const pay = pk === "daily" ? "daily" : "monthly";
    const base = (pay === "daily" ? c.daily : c.monthly) ?? c.fixed_allowance ?? 0;
    const want = pay === "daily" ? base * r.days : base;
    if (r.pay_kind === pay && (pay === "daily" ? r.daily : r.monthly) === base && r.time_pay === 0 && r.fixed === 0 && r.amount === want) continue;
    out.push({ membership_id: r.membership_id, pay, payKind: pk, reason: r.pay_kind !== pay ? "kind" : r.fixed !== 0 ? "fixed" : "amount", sent: r.amount, base, days: r.days, fixed: r.fixed, leftover: staffAllowanceDropOf(c, pk) });
  }
  return out;
}
/** 断られたときの文（どの人の・何が合わないか・何をすればよいか）。月給・日給の検算の例外でなければ null＝呼び出し側の従来の文 */
export function staffLaborMismatchJa(msg: string, rows: readonly StaffLaborRow[], contracts: Readonly<Record<string, StaffLaborMismatchContract | null | undefined>>, nameOf: (membershipId: string) => string): string | null {
  if (!isStaffLaborPayMismatch(msg)) return null;
  const yen = (n: number) => "¥" + n.toLocaleString("ja-JP");
  const mm = /monthly amount (-?\d+) <> contract (-?\d+)/.exec(msg);
  const dd = /daily amount (-?\d+) <> (-?\d+) x days (-?\d+)/.exec(msg);
  const tail = "画面を読み直しました。額を確かめて、もう一度「この月を確定」を押してください。";
  const all = staffLaborMismatchesOf(rows, contracts);
  // 例外は最初に合わなかった 1 人の数字を持つ＝その数字に合う人を先に出す
  const hit = (x: StaffLaborMismatch) => (mm ? x.pay === "monthly" && x.sent === Number(mm[1]) && x.base === Number(mm[2]) : dd ? x.pay === "daily" && x.sent === Number(dd[1]) && x.base === Number(dd[2]) && x.days === Number(dd[3]) : false);
  const list = [...all.filter(hit), ...all.filter((x) => !hit(x))];
  if (list.length === 0) { // 読み直した契約では全員が合う（読み直す間に契約が戻った など）＝人は出せない・例外の数字だけ
    const what = mm ? `月給の人の確定額 ${yen(Number(mm[1]))} が契約の月額 ${yen(Number(mm[2]))} と合いません` : dd ? `日給の人の確定額 ${yen(Number(dd[1]))} が契約の日額 ${yen(Number(dd[2]))} × ${dd[3]} 日と合いません` : "確定額が契約と合いません";
    return `確定できませんでした。${what}。${tail}`;
  }
  const line = (x: StaffLaborMismatch) => {
    const payJa = PAY_KIND_JA[x.payKind] ?? "月給";
    const baseJa = x.pay === "daily" ? `日額 ${yen(x.base)} × ${x.days} 日＝${yen(x.base * x.days)}` : `月額 ${yen(x.base)}`;
    const head = x.reason === "kind" ? `契約の給与の形が${payJa}（${baseJa}）に変わっています（この画面は前の形の額 ${yen(x.sent)} で送りました）`
      : x.reason === "fixed" ? `${payJa}の人に固定手当 ${yen(x.fixed)} を足した額で送りました（${payJa}には固定手当を足しません・契約の${baseJa}）`
      : `この画面の額 ${yen(x.sent)} が契約の${baseJa} と合いません`;
    return `${nameOf(x.membership_id)} さん：${head}${x.leftover > 0 ? `（契約に固定手当 ${x.leftover.toLocaleString("ja-JP")}円が残っています。働き方を保存し直すと外れます）` : ""}`;
  };
  return `確定できませんでした。${list.slice(0, 3).map(line).join("／")}${list.length > 3 ? `／ほか ${list.length - 3} 人` : ""}。${tail}`;
}
