// ★裁定414（2026-10-21・便 S S-4）: 送りの 4 方式（純関数・DB を知らない）。
//   実費 actual＝レジ現金が出る（日報の現金支払「送り立替」）＋同額を給与から控除／定額 flat＝現金は動かず給与から定額控除（現金支払には載せない）／
//   店負担 store＝日報の諸経費「送迎費（店負担）」に載せ控除なし／なし none＝送りの導線を出さない。
//   保存先＝stores.settings_json.okuri_mode（既定 'flat'＝DB の coalesce と同じ）・記録＝transport.mode（0177・既存行は 'actual'）。
//   'store'／'none' の値は 0177 適用（P）後に初めて現れる＝値が無い間は従来どおり（flat／actual）に動く。
export type OkuriMode = "actual" | "flat" | "store" | "none";
export const OKURI_MODES: readonly OkuriMode[] = ["actual", "flat", "store", "none"];
export const OKURI_MODE_LABEL: Record<OkuriMode, string> = { actual: "実費", flat: "定額", store: "店負担", none: "なし" };
export const OKURI_MODE_NOTE: Record<OkuriMode, string> = {
  actual: "送り代を立て替えて渡し、同額を給与から控除します（日報の現金支払「送り立替」に載ります）",
  flat: "現金は動かず、退勤ごとに定額を給与から控除します（日報の現金支払には載せません）",
  store: "店が送り代を負担します（日報の諸経費「送迎費（店負担）」に載り、控除はありません）",
  none: "送りの導線を出しません",
};

/** 店設定の値→方式。キー無し／空／不明＝'flat'（DB の coalesce(nullif(trim(…),''),'flat') と同じ読み方） */
export function okuriModeOf(settings: Record<string, unknown> | null | undefined): OkuriMode {
  const v = settings?.okuri_mode;
  return v === "actual" || v === "flat" || v === "store" || v === "none" ? v : "flat";
}
/** 送りの導線（退勤で聞く・今日タブ・/mine・kiosk・記録フォーム）を出すか＝'none' 以外 */
export const okuriAsks = (mode: OkuriMode): boolean => mode !== "none";
/** 日報の現金支払に載る（レジ現金が出る）＝実費だけ */
export const okuriCashOf = (mode: OkuriMode | string | null | undefined): boolean => (mode ?? "actual") === "actual";
/** 給与から控除する＝実費・定額（店負担は控除なし） */
export const okuriDeductOf = (mode: OkuriMode | string | null | undefined): boolean => { const m = mode ?? "actual"; return m === "actual" || m === "flat"; };
/** 日報の諸経費「送迎費（店負担）」に載る＝店負担だけ */
export const okuriExpenseOf = (mode: OkuriMode | string | null | undefined): boolean => (mode ?? "actual") === "store";

const yen = (n: number) => `¥${n.toLocaleString()}`;
/** 退勤ダイアログ・今日タブ・/mine・kiosk の方式の 1 文（裁定414 の文言・金額が未定なら金額なしの形） */
export function okuriOutTextOf(mode: OkuriMode, amount: number | null): string {
  const a = amount != null && amount > 0 ? ` ${yen(amount)}` : "";
  switch (mode) {
    case "actual": return `送り代${a} を立て替えて退勤（給与から控除）`;
    case "flat": return `送り${a} は給与から控除します（現金は動きません）`;
    case "store": return `送り代${a} を店が負担して退勤`;
    default: return "";
  }
}
/** 記録後の文言（「発行」は送りに使わない＝「記録」） */
export function okuriRecordedTextOf(mode: OkuriMode, amount: number): string {
  switch (mode) {
    case "actual": return `送り代 ${yen(amount)} を立て替えとして記録しました（給与から控除）`;
    case "flat": return `送り ${yen(amount)} を記録しました（給与から控除・現金は動きません）`;
    case "store": return `送り代 ${yen(amount)} を店負担で記録しました（控除なし）`;
    default: return `送り ${yen(amount)} を記録しました`;
  }
}
/** 日報の内訳の行名（裁定414）: 現金支払＝「送り立替」／諸経費＝「送迎費（店負担）」／明細の控除＝「送り立替」「送り（定額）」 */
export const OKURI_ROW_LABEL = { cash: "送り立替", expense: "送迎費（店負担）", deductActual: "送り立替", deductFlat: "送り（定額）" } as const;

/** transport 行（mode 列は 0177 後・無ければ 'actual'）を 3 か所に振り分ける＝現金支払／控除／諸経費（純関数・suite の正） */
export function okuriBucketsOf(rows: readonly { amount: number; mode?: string | null; status?: string | null }[]): { cash: number; deduct: number; expense: number; deductActual: number; deductFlat: number } {
  const out = { cash: 0, deduct: 0, expense: 0, deductActual: 0, deductFlat: 0 };
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    const m = r.mode ?? "actual";
    if (okuriCashOf(m)) out.cash += r.amount;
    if (okuriDeductOf(m)) { out.deduct += r.amount; if (m === "flat") out.deductFlat += r.amount; else out.deductActual += r.amount; }
    if (okuriExpenseOf(m)) out.expense += r.amount;
  }
  return out;
}
/** 設定画面の 4 択＝'store'／'none' は P（0177 適用）前は選べない（「適用後に選べます」） */
export const OKURI_MODE_PENDING_NOTE = "0177 の適用後に選べます";
export const okuriModeSelectableOf = (mode: OkuriMode, applied: boolean): boolean => applied || mode === "actual" || mode === "flat";
