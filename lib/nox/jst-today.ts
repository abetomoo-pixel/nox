// ★起票145（相談役 11/23 23:10 の ■1）: 日本の「今日」「今月」を返す共通の部品。
//   画面とサーバで UTC の日付（new Date().toISOString().slice(0, 10)）を使うと、JST の 0:00〜9:00 は JST の昨日
//   （月の 1 日の朝は前の月の末日）になる。今日・今月を作るときはこれを使う。
//   検査 verify:nox-jst-today が、UTC の今日・今月の新しい使い方（app・components・lib）を赤にする。
//   ※暦の日付（0:00 区切り）。営業日（朝 6:00 区切り）が要る所は営業日の関数を使う（ここでは扱わない）。
const JST_MS = 9 * 3600_000;
const DAY_MS = 86_400_000;

/** JST の今日（YYYY-MM-DD） */
export const jstToday = (now: Date = new Date()): string => new Date(now.getTime() + JST_MS).toISOString().slice(0, 10);

/** JST の今月（YYYY-MM） */
export const jstThisMonth = (now: Date = new Date()): string => jstToday(now).slice(0, 7);

/** JST の今日から n 日後（YYYY-MM-DD・n は負でもよい） */
export const jstTodayPlus = (days: number, now: Date = new Date()): string => jstToday(new Date(now.getTime() + days * DAY_MS));
