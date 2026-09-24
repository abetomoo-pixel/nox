// ★便 AU3（2026-09-24・週末バックログ 3）: 確定シフトの月セルに出す名前＝先頭 max 名＋「他 n」（純関数・DB を知らない）。
//   時刻はセルに出さない（日詳細モーダルで見る）＝7 列をスマホ幅（≤899／≤430）に収めるため。
export function cellNamesOf(names: readonly string[], max = 3): { shown: string[]; rest: number; restLabel: string | null } {
  const m = Math.max(0, Math.floor(max));
  const shown = names.slice(0, m);
  const rest = Math.max(0, names.length - shown.length);
  return { shown, rest, restLabel: rest > 0 ? `他${rest}` : null };
}
