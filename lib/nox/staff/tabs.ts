// ★0172（裁定356・便 P172・2026-10-16）: /staff のタブ（一覧／勤怠・報酬）＝page.tsx の ?tab を純関数で解決（page から export しない＝Next の Page export 検査）。
// ★M-64（2026-11-04 Agoora 決定）: スタッフ › 勤怠・報酬 のタブは外した＝正本は 給与 › 勤怠（スタッフ）（STAFF_WORK_HREF）。古い ?tab=work は page が正本へ redirect（staffTabOf は "work" を返し続ける＝リンク切れにしない）。
export type StaffTab = "list" | "work";
export const STAFF_WORK_HREF = "/payroll?tab=attendance&who=staff";
export const STAFF_TABS: ReadonlyArray<readonly [StaffTab, string, string]> = [["list", "一覧", "/staff"]];
export const staffTabOf = (v: string | undefined | null): StaffTab => (v === "work" ? "work" : "list");
