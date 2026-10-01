// ★裁定326-3（0160 cast_quotas・便 M2-1／M2-2・2026-10-01）: キャスト別・月別ノルマ 4 項目（本指名／場内／同伴／売上）の純関数（DB を知らない）。
//   cast 側＝/mine のノルマ進捗（実績／目標・達成率 %・未設定の項目は出さない・全項目未設定なら文言）。店側＝/casts 詳細「今月のノルマ」（月を選んで 4 項目を upsert＝set_cast_quota）。
//   目標 NULL＝未設定・0 も「目標なし」として進捗に出さない（仮決め）。実績の集計源は既存（get_cast_sales の月合算＝norm-progress route）。
import { nextPeriodOf } from "../payroll/attention";

export const QUOTA_KEYS = ["hon", "jonai", "dohan", "sales"] as const;
export type QuotaKey = (typeof QUOTA_KEYS)[number];
export type Quota = Record<QuotaKey, number | null>;
export type QuotaActual = Record<QuotaKey, number>;
export type QuotaAxis = { key: QuotaKey; label: string; actual: number; target: number; rate: number; pct: number; done: boolean };

export const QUOTA_LABEL: Record<QuotaKey, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", sales: "売上" };
export const QUOTA_UNIT: Record<QuotaKey, string> = { hon: "件", jonai: "件", dohan: "件", sales: "円" };
export const QUOTA_EMPTY_NOTE = "店で目標が設定されるとここに進捗が出ます";
export const QUOTA_PROGRESS_NOTE = "※進捗の目安表示です（当月の営業日集計・確定値は給与明細が正）";

export const quotaFmt = (key: QuotaKey, n: number): string => (key === "sales" ? "¥" + n.toLocaleString() : `${n}${QUOTA_UNIT[key]}`);

/** 目標が設定された項目だけ（NULL／0 は出さない）。rate＝達成率 %（切捨て・100 超も出す）・pct＝バー幅（100 で止める） */
export function quotaAxesOf(quota: Partial<Quota> | null | undefined, actual: QuotaActual): QuotaAxis[] {
  const out: QuotaAxis[] = [];
  for (const k of QUOTA_KEYS) {
    const target = quota?.[k];
    if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) continue;
    const a = actual[k] ?? 0;
    const rate = Math.floor((a / target) * 100);
    out.push({ key: k, label: QUOTA_LABEL[k], actual: a, target, rate, pct: Math.min(100, rate), done: a >= target });
  }
  return out;
}

/** 店側の月選択: 今月／翌月（'YYYY-MM' は営業日の月）。値＝set_cast_quota の p_month（月初の date） */
export function quotaMonthOptionsOf(period: string): ReadonlyArray<readonly [string, string]> {
  return [[`${period}-01`, `今月（${period}）`], [`${nextPeriodOf(period)}-01`, `翌月（${nextPeriodOf(period)}）`]];
}

export type QuotaForm = Record<QuotaKey, string>;
export const QUOTA_FORM_EMPTY: QuotaForm = { hon: "", jonai: "", dohan: "", sales: "" };

/** 行（NULL 可）→ 入力欄の文字列（NULL は空欄） */
export function quotaFormOf(row: Partial<Quota> | null | undefined): QuotaForm {
  const s = (v: number | null | undefined) => (typeof v === "number" ? String(v) : "");
  return { hon: s(row?.hon), jonai: s(row?.jonai), dohan: s(row?.dohan), sales: s(row?.sales) };
}

/** 入力欄 → RPC 引数（空欄＝NULL・0 以上の整数のみ・それ以外は err）。全欄空も可（＝全項目未設定に戻す） */
export function quotaArgsOf(form: QuotaForm): { ok: true; args: Record<`p_${QuotaKey}`, number | null> } | { ok: false; err: string } {
  const args = {} as Record<`p_${QuotaKey}`, number | null>;
  for (const k of QUOTA_KEYS) {
    const v = form[k].replace(/[,，]/g, "").trim();
    if (v === "") { args[`p_${k}`] = null; continue; }
    if (!/^\d{1,12}$/.test(v)) return { ok: false, err: `${QUOTA_LABEL[k]}は 0 以上の整数で入力してください（空欄＝目標なし）` };
    args[`p_${k}`] = Number(v);
  }
  return { ok: true, args };
}

/** 2 つの入力が同じか（保存ボタンの活性） */
export const quotaFormEquals = (a: QuotaForm, b: QuotaForm): boolean => QUOTA_KEYS.every((k) => a[k].trim() === b[k].trim());
