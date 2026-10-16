// ★0172（裁定356・便 P172・2026-10-16）: /staff のタブ（一覧／勤怠・報酬）＝page.tsx の ?tab を純関数で解決（page から export しない＝Next の Page export 検査）。
export type StaffTab = "list" | "work";
export const STAFF_TABS: ReadonlyArray<readonly [StaffTab, string, string]> = [["list", "一覧", "/staff"], ["work", "勤怠・報酬", "/staff?tab=work"]];
export const staffTabOf = (v: string | undefined | null): StaffTab => (v === "work" ? "work" : "list");
