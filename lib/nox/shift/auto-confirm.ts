// ★0172（裁定380・便 P172・2026-10-16）: 送り返し（proposed）の自動確定＝店設定 settings_json.shift_auto_confirm_hours（整数 0〜168・0／欠損＝しない）。
//   実行器＝/api/cron/shift-auto-confirm（15 分間隔・pg_cron→pg_net・cron_setup.md §6）。純関数＝DB を知らない（suite p172 が pin）。

export const SHIFT_AUTO_CONFIRM_MAX_H = 168;
export const SHIFT_AUTO_CONFIRM_OPTIONS: ReadonlyArray<readonly [string, string]> = [["0", "自動確定しない"], ["24", "24 時間後"], ["48", "48 時間後"], ["72", "72 時間後"]];

/** 店設定 → 自動確定までの時間（整数 1〜168 のときだけ有効・それ以外は 0＝しない） */
export function autoConfirmHoursOf(settings: Record<string, unknown> | null | undefined): number {
  const v = settings?.shift_auto_confirm_hours;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : 0;
  if (!Number.isInteger(n) || n < 1 || n > SHIFT_AUTO_CONFIRM_MAX_H) return 0;
  return n;
}

/** 送り返してから hours 経った proposed を確定する境界（updated_at < この時刻）。hours 0 は null＝対象なし */
export function autoConfirmCutoffOf(now: Date, hours: number): string | null {
  if (hours <= 0) return null;
  return new Date(now.getTime() - hours * 3_600_000).toISOString();
}
