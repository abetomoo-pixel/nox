// ★起票94（便 X-12-3・2026-09-30）: ヘッダー直下のポップオーバー（歯車＝設定の一覧・「登録名｜役割」＝自分の情報）の置き場（純関数・DOM を知らない）。
//   上端＝ヘッダー下端＋余白（上方向へは出さない）・高さの上限＝viewport − ヘッダー − 余白×2（超過は内部スクロール）。≤899px は既存のシート（Modal の ≤900 分岐）。
//   数値は globals.css の .nox-modal-top（padding-top 72px・max-height calc(100vh − 80px)）と同じ＝どちらかを変えるときは両方（verify:nox-messages ms(2-25) が同値を pin）。
export const HEADER_H = 64;   // .nox-tb の height
export const POP_GAP = 8;

export function popoverBoxOf(viewportH: number, headerH: number = HEADER_H): { top: number; maxHeight: number } {
  const top = headerH + POP_GAP;
  return { top, maxHeight: Math.max(120, Math.floor(viewportH) - headerH - POP_GAP * 2) };
}
