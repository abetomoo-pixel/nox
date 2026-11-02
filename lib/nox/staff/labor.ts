// ★便 M6（2026-11-02 夜・client のみ）: スタッフ給与のコスト計上の純関数（決定 11/02＝台帳の候補 439）。DB・ブラウザを知らない。
//   月給＝月額を「その月の営業日」で日割り（端数は最後の営業日へ＝合計は月額と一致）／時給＝実働×時給（0192 の日別勤怠の修正＝staff_punches の manual は打刻として読むだけで反映）／
//   日給＝出勤した日（打刻あり）に日額。当欠（staff_attendance_days.status absent）の日は時給・日給 0（月給は減らさない＝★相談役確認待ち）。
//   時給制の固定手当（fixed_allowance）は月給と同じく営業日で日割り。事業主負担の社会保険は載せない。
//   見込み／確定＝その月が staff_attendance_locks で確定済みなら「確定」・それ以外は「見込み」（確定額の凍結の表は 0194 候補＝それまでは確定後も今の契約で計算）。
//   営業日＝暦日のうち store_business_hours の定休曜日を除き、store_special_days の臨時休業を除き特別営業を足す（★相談役確認待ち：月報の「営業日数＝締め済み日報の件数」とは定義が違う）。
import { daysInMonthOf } from "../month";

export type StaffLaborContract = { pay_kind?: string | null; hourly: number; fixed_allowance: number; monthly?: number | null; daily?: number | null };
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
    for (const [d, v] of Object.entries(spreadOverDays(c.fixed_allowance, bizDays))) add(d, v);
  }
  return { byDay, total: Object.values(byDay).reduce((a, v) => a + v, 0) };
}
