// ★起票145（相談役 11/23 23:10 の ■1）: 日本の「今日」「今月」を返す共通の部品。
//   画面とサーバで UTC の日付（new Date().toISOString().slice(0, 10)）を使うと、JST の 0:00〜9:00 は JST の昨日
//   （月の 1 日の朝は前の月の末日）になる。今日・今月を作るときはこれを使う。
//   検査 verify:nox-jst-today が、UTC の今日・今月の新しい使い方（app・components・lib）を赤にする。
//   ※暦の日付（0:00 区切り）。勤務と給与期に関わる所は下の bizToday（営業日）を使う。
import { bizDateOf } from "./biz-date";

const JST_MS = 9 * 3600_000;
const DAY_MS = 86_400_000;

/** JST の今日（YYYY-MM-DD） */
export const jstToday = (now: Date = new Date()): string => new Date(now.getTime() + JST_MS).toISOString().slice(0, 10);

/** JST の今月（YYYY-MM） */
export const jstThisMonth = (now: Date = new Date()): string => jstToday(now).slice(0, 7);

/** JST の今日から n 日後（YYYY-MM-DD・n は負でもよい） */
export const jstTodayPlus = (days: number, now: Date = new Date()): string => jstToday(new Date(now.getTime() + days * DAY_MS));

// ★起票145 の訂正（相談役 11/24 2:20）: 勤務と給与期に関わる「今日」は営業日（店の締めの時刻で切り替わる日）。
//   数え方は今ある部品 bizDateOf（lib/nox/biz-date.ts＝DB の biz_date_of と同じ式）をそのまま使う。新しい数え方は作らない。
//   締めの時刻は stores.settings_json.biz_cutoff_hm（既定 06:00）＝lib/nox/payroll/window.ts と同じ読み方。
/** 店の設定（stores.settings_json）から締めの時刻（HH:MM・既定 06:00） */
export const cutoffHmOf = (settingsJson: unknown): string => {
  const v = (settingsJson && typeof settingsJson === "object" ? (settingsJson as Record<string, unknown>).biz_cutoff_hm : undefined);
  return typeof v === "string" && v ? v : "06:00"; // window.ts と同じ（空・無しは 06:00）
};

/** 営業日の今日（YYYY-MM-DD）＝bizDateOf(今, 締めの時刻) */
export const bizToday = (cutoffHm: string, now: Date = new Date()): string => bizDateOf(now.toISOString(), cutoffHm);
