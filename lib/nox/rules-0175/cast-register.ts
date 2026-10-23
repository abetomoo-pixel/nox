// ★追補 2（裁定420・0175 v2 ★25）: キャストのレジ使用＝店設定 sys_cast_register（0 OFF／1 注文のみ／2 会計まで）。旧 cast_register_enabled（boolean）は互換＝true→1。
//   どの段階でも自分が着卓中／指名されている卓のみ・操作は audit に cast・端末の縛りは cast_register_device（own_phone／store_device）。
//   RULES_0175_APPLIED=false の間は従来（boolean の ON／OFF＝ON なら注文も会計も RPC 側の cast ゲートどおり）。
export type CastRegisterLevel = 0 | 1 | 2;
export const CAST_REGISTER_LEVEL_LABEL: Record<CastRegisterLevel, string> = { 0: "OFF", 1: "注文のみ", 2: "会計まで" };
export const CAST_REGISTER_LEVEL_DESC: Record<CastRegisterLevel, string> = {
  0: "キャストはレジを使えません",
  1: "注文の追加と伝票の閲覧（会計・入金・領収書は出しません）",
  2: "注文に加えて会計・入金・領収書の発行まで（伝票取消・割引・無料・手数料の「なし／指定」・確定の解除は店長以上）",
};
/** 段階＝sys_cast_register（0／1／2）が無ければ旧 boolean（true→1） */
export function castRegisterLevelOf(settings: Record<string, unknown> | null | undefined): CastRegisterLevel {
  const v = settings?.sys_cast_register;
  if (v === 0 || v === 1 || v === 2) return v;
  return settings?.cast_register_enabled === true ? 1 : 0;
}
/** /mine の下ナビに「レジ」を出すか＝段階 ≥1 ∧ 本人 can_register ∧ 端末の条件（own_phone か店端末が未登録） */
export const castRegisterNavOf = (i: { level: CastRegisterLevel; canRegister: boolean; device: "store_device" | "own_phone"; registerDevices: number }): boolean =>
  i.level >= 1 && i.canRegister && (i.device === "own_phone" || i.registerDevices === 0);
/** 会計系（会計・入金・領収書）を cast に出すか＝「会計まで」だけ */
export const castCanPayOf = (level: CastRegisterLevel): boolean => level >= 2;
/** 店長以上のまま＝伝票取消・割引・無料・手数料の「なし／指定」・確定の解除 */
export const CAST_NEVER = ["void", "discount", "free", "fee_cut", "reopen"] as const;
/** 日報の内訳「キャスト入金」＝payments.by_membership の role が cast の入金の合計 */
export function castPaymentsOf(pays: readonly { amount: number; by_membership?: string | null }[], castMembershipIds: ReadonlySet<string>): number {
  return pays.filter((p) => p.by_membership && castMembershipIds.has(p.by_membership)).reduce((a, p) => a + p.amount, 0);
}
