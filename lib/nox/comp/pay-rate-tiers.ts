// ★2026-11-17 夜（相談役 Y3b）: 待遇プランの「報酬率の段」の入力と保存の形（純関数・DB を知らない）。
//   保存は comp_plan_ext_set（owner）の p_patch { pay_rate_tiers, slide_streak_n }＝新しい RPC も mig も無い。
//   検査は DB の comp_plan_pay_rate_check と同じ（最大 10 段・境 at_pct は 0〜300 の昇順（同じ値は不可）・数は 0 以上・率は 100 まで）＝画面で先に止めて 'bad pay_rate_tiers' を出さない。
//   式（報酬率＝時給分 ÷ 売上小計）と段の当て方（canon.ts payRateTierOf／directionOf）は変えない。
import { directionOf, type PayRateTier, type SlideDirection } from "@/lib/nox/rules-0175/canon";

export const PAY_RATE_TIER_MAX = 10;
export const PAY_RATE_AT_MAX = 300;
export const PAY_RATE_STREAK_MIN = 1;
export const PAY_RATE_STREAK_MAX = 12;

/** 画面の 1 段（空欄＝その鍵を送らない）。境・UP 額・下げる額・バック率・総報酬の率 */
export type PayRateTierRow = { at: string; up: string; down: string; back: string; pay: string; rest?: Record<string, unknown> }; // rest＝画面に無い鍵（wage_cut_pct・days_min など）＝保存のときにそのまま戻す
export const emptyPayRateRow = (): PayRateTierRow => ({ at: "", up: "", down: "", back: "", pay: "" });

const num = (s: string): number | null => { const t = s.trim(); if (t === "") return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };

/** 保存済みの段 → 画面の行（画面に無い鍵は rest に残す） */
export function payRateRowsOf(tiers: readonly PayRateTier[] | null | undefined): PayRateTierRow[] {
  const list = Array.isArray(tiers) ? tiers : [];
  const s = (v: unknown) => (typeof v === "number" ? String(v) : "");
  return list.map((t) => { const { at_pct, up_amount, down_amount, back_mult, pay_pct, ...rest } = t as Record<string, unknown>;
    return { at: s(at_pct), up: s(up_amount), down: s(down_amount), back: s(back_mult), pay: s(pay_pct), ...(Object.keys(rest).length ? { rest } : {}) }; });
}

/** 画面の行 → 保存する段（null＝誤りあり）。誤りの文は payRateRowsErrOf */
export function payRateTiersOf(rows: readonly PayRateTierRow[]): PayRateTier[] | null {
  if (payRateRowsErrOf(rows)) return null;
  return rows.map((r) => {
    const t: Record<string, unknown> = { ...(r.rest ?? {}), at_pct: num(r.at) as number };
    const up = num(r.up), down = num(r.down), back = num(r.back), pay = num(r.pay);
    if (up !== null) t.up_amount = up;
    if (down !== null) t.down_amount = down;
    if (back !== null) t.back_mult = back;
    if (pay !== null) t.pay_pct = pay;
    return t as PayRateTier;
  });
}

/** DB の comp_plan_pay_rate_check と同じ条件の誤り（無ければ null） */
export function payRateRowsErrOf(rows: readonly PayRateTierRow[]): string | null {
  if (rows.length > PAY_RATE_TIER_MAX) return `段は ${PAY_RATE_TIER_MAX} 段までです`;
  let prev: number | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; const n = i + 1;
    const at = num(r.at);
    if (at === null) return `${n} 段目：境（報酬率 %）を入れてください`;
    if (Number.isNaN(at) || at < 0 || at > PAY_RATE_AT_MAX) return `${n} 段目：境は 0〜${PAY_RATE_AT_MAX}% です`;
    if (prev !== null && at <= prev) return `${n} 段目：境は上の段より大きくしてください（小さい順・同じ値は不可）`;
    prev = at;
    for (const [v, label, max] of [[r.up, "UP 額", null], [r.down, "下げる額", null], [r.back, "バック率", 100], [r.pay, "総報酬の率", 100]] as const) {
      const x = num(v);
      if (x === null) continue;
      if (Number.isNaN(x) || x < 0) return `${n} 段目：${label}は 0 以上の数です`;
      if (max !== null && x > max) return `${n} 段目：${label}は ${max}% までです`;
    }
  }
  return null;
}

export function payRateStreakErrOf(n: number): string | null {
  return Number.isInteger(n) && n >= PAY_RATE_STREAK_MIN && n <= PAY_RATE_STREAK_MAX ? null : `連続の期の数は ${PAY_RATE_STREAK_MIN}〜${PAY_RATE_STREAK_MAX} です`;
}

/** comp_plan_ext_set の p_patch（段と連続の期の数だけ＝軸・ほかの鍵は送らない） */
export function payRatePatchOf(rows: readonly PayRateTierRow[], streak: number): { pay_rate_tiers: PayRateTier[]; slide_streak_n: number } | null {
  const tiers = payRateTiersOf(rows);
  if (!tiers || payRateStreakErrOf(streak)) return null;
  return { pay_rate_tiers: tiers, slide_streak_n: streak };
}

/** ★2026-11-18（相談役 A-3）: 行の方向＝計算と同じ directionOf（UP／査定／据え置き）。数として読めない欄は無いものとして見る */
export function payRateRowDirectionOf(r: PayRateTierRow): SlideDirection {
  const t: Record<string, unknown> = { ...(r.rest ?? {}), at_pct: 0 };
  for (const [k, v] of [["up_amount", r.up], ["down_amount", r.down], ["back_mult", r.back], ["pay_pct", r.pay]] as const) { const n = num(v); if (n !== null && !Number.isNaN(n)) t[k] = n; }
  return directionOf(t as PayRateTier);
}
/** バック率を入れられる段＝UP か査定の段だけ（据え置きの段では計算で効かない＝canonOutcomeOf の backMult は UP／査定でだけ当たる） */
export const payRateRowBackEnabledOf = (r: PayRateTierRow): boolean => payRateRowDirectionOf(r) !== "hold";
export const PAY_RATE_BACK_HOLD_NOTE = "据え置きの段ではバック率は効きません（UP 額・総報酬の率・下げる額のどれかを入れた段で使えます）";
/** ★2026-11-18 夜（相談役 ⑥ C-5）: 下げる額は金額に効かない（計算は directionOf で「査定」の印にだけ使う＝canonOutcomeOf は額を引かない）＝欄の横と入れた段に注記 */
export const PAY_RATE_DOWN_NOTE = "下げる額は金額には効きません（入れた段を査定の扱いにする印です）";
export const payRateRowDownSetOf = (r: PayRateTierRow): boolean => String(r.down ?? "").trim() !== "";
