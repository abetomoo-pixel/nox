// ★0190 フラグ true 便 K-1（裁定437）: PIN ロックのお知らせ文（純関数・DB を知らない）。route（app/api/kiosk/lock-notice）と suite が共用。
const JST = "Asia/Tokyo";
const hm = (d: Date) => d.toLocaleTimeString("ja-JP", { timeZone: JST, hour: "2-digit", minute: "2-digit" });
/** JST の日付（YYYY-MM-DD）に n 日足す */
export function jstDatePlus(now: Date, days: number): string {
  const jst = new Date(now.getTime() + 9 * 3600_000 + days * 86_400_000);
  return jst.toISOString().slice(0, 10);
}
export function lockNoticeTextOf(a: { deviceLabel: string; operatorName: string | null; lockedUntil: string | null; now: Date }): { title: string; body: string; until: string } {
  const until = a.lockedUntil ? hm(new Date(a.lockedUntil)) : null;
  const who = a.operatorName ? `${a.operatorName}さん` : "操作担当";
  return {
    title: `端末「${a.deviceLabel}」で PIN の失敗が続きロックしました（${hm(a.now)}）`,
    body: `${who}の PIN が 5 回続けて違いました。${until ? `${until} 頃に自動で解除されます。` : "10 分後に自動で解除されます。"}心当たりがなければ、マスタ › 操作担当PIN で PIN を設定し直してください。`,
    until: jstDatePlus(a.now, 1),
  };
}
