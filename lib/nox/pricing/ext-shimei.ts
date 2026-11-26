// ★0217（起票167・相談役 11/26 の便 L1）: 延長指名料（店で一律の 1 つ）＝料金マスタの「指名・同伴料金」の枠の中。
//   額は pricing_rules の fee_kind='ext_shimei' の行（set_ext_shimei_fee が条件なしの 1 行に揃える）。延長 1 回ごとに本指名 1 人につきこの額（check_extension_add）。
//   DB を知らない純関数（検査 verify:nox-ext-shimei が読む）。

export type ExtShimeiRule = { fee_kind: string; is_active: boolean; amount: number; priority: number; created_at?: string | null; id?: string };

/** 今の延長指名料の額（有効な ext_shimei の行の並びが一番上の行）。行が無い＝null（ON なら「金額が未設定です」） */
export function extShimeiAmountOf(rules: readonly ExtShimeiRule[]): number | null {
  const act = rules.filter((r) => r.fee_kind === "ext_shimei" && r.is_active)
    .sort((a, b) => a.priority - b.priority || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || String(a.id ?? "").localeCompare(String(b.id ?? "")));
  return act.length ? act[0].amount : null;
}

/** 欄の検査＝1 円以上の整数（0 と空は保存させない・相談役 11/26 の決め）。通るなら null */
export function extShimeiInputErrOf(digits: string): string | null {
  const n = digits === "" ? NaN : Number(digits);
  if (!Number.isInteger(n) || n < 1) return EXT_SHIMEI_EMPTY_JA;
  if (n > 999999) return "金額は 999,999 円までです";
  return null;
}

export const EXT_SHIMEI_EMPTY_JA = "金額を入れてください";
export const EXT_SHIMEI_UNSET_JA = "金額が未設定です";
export const EXT_SHIMEI_LABEL = "延長指名";
export const EXT_SHIMEI_DESC = "ONにすると、延長のたびに本指名 1 人につき下の金額を加算します（手動で延長を足す店）。OFF の店は延長時に指名料を加算しません";
export const EXT_SHIMEI_AUTO_NOTE = "自動で延長する店では、今は加算しません";

/** set_ext_shimei_fee の例外 → 日本語 */
export function extShimeiErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("bad amount")) return "金額は 1〜999,999 円の整数で入力してください";
  if (msg.includes("billing locked")) return "課金の状態により設定を変更できません";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}
