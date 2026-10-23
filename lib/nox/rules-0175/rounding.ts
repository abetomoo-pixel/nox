// ★便 SH-UI-c2 C2-16（裁定424 候補・0175 v2 ★29・2026-10-23）: 端数調整（丸め単位・丸め方）は開卓時に凍結しない＝会計時点の店設定を読む。
//   税率・サービス料・外税／内税・延長パターンの凍結は変えない。確定済み（closed）の伝票は確定時の額のまま。DB 側＝check_group_due が開いている伝票では stores の丸めを読む（★29）。
//   RULES_0175_APPLIED=false の間は従来どおり伝票の凍結値（DB と client が同じ値＝入金の検証がずれない）。
export type RoundLike = { round_unit: number; round_mode: string };
export type CheckLike = RoundLike & { status?: string | null } & Record<string, unknown>;
/** 丸めだけ店設定の現在値に差し替えた設定（開いている伝票・フラグ true・店設定が読めたとき）。それ以外は伝票の凍結値そのまま */
export function dueSettingsOf<T extends CheckLike>(check: T, store: RoundLike | null | undefined, on: boolean): T {
  if (!on || !store || (check.status ?? "open") !== "open") return check;
  if (check.round_unit === store.round_unit && check.round_mode === store.round_mode) return check;
  return { ...check, round_unit: store.round_unit, round_mode: store.round_mode };
}
/** 明細の「端数調整」行＝丸めが掛かるときだけ出す */
export const roundingRowShownOf = (rounding: number): boolean => rounding !== 0;
