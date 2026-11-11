// ★M-169（2026-11-11・外部レビュー 4）: 見られない役割が URL を直接開いたとき＝レジ（/register）ではなくホームへ戻し、理由を 1 行（ホームが ?denied= を読んで出す）。
//   リンクは見られる役割にだけ出す（ホームの「分析へ」ほか）。どの画面かは 1 か所の表で決める。
export const DENIED_PAGES = {
  analytics: "分析",
  casts: "キャスト",
  customers: "顧客",
  payroll: "給与",
  receipts: "領収書",
  staff: "スタッフ",
} as const;
export type DeniedPage = keyof typeof DENIED_PAGES;

export const deniedHrefOf = (page: DeniedPage): string => `/dashboard?denied=${page}`;

/** ホームに出す 1 行（知らない値は null） */
export function deniedNoteOf(v: string | null | undefined): string | null {
  if (!v || !(v in DENIED_PAGES)) return null;
  return `「${DENIED_PAGES[v as DeniedPage]}」の画面は、この役割では開けません（店長・オーナーに確認してください）`;
}
