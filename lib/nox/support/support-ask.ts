// ★0207（相談役 11/25 朝の便 M3・起票152 のベル）: 運営からのサポート許可の頼み＝純関数（DB を知らない）。
//   運営が /ops の会社の詳細で「サポート許可を頼む」（ひとこと 200 字まで・取り下げ）→ オーナーの要承認（🔔 の数と HOME のカード）に 1 行 →
//   押すとサポート許可の画面（直通の URL と同じ場所）。「今は出さない」で閉じる。押しただけで許可にはしない（日数を選んで出すのはオーナー）。
//   「開いている頼み」でも、頼みの後に許可が出ていれば済んだものとして出さない（読む側の判定＝0207 の設計）。

export const SUPPORT_ASK_MESSAGE_MAX = 200;
export type SupportAskRow = { id: string; requested_at: string; message: string | null };

/** 開いている頼み（closed_at が null）と、その会社の一番新しい許可の時刻 → 出す頼み（無ければ null） */
export function supportAskShownOf(open: SupportAskRow | null | undefined, latestGrantAt: string | null | undefined): SupportAskRow | null {
  if (!open) return null;
  if (latestGrantAt && new Date(latestGrantAt).getTime() >= new Date(open.requested_at).getTime()) return null; // 頼みの後に許可が出た＝済んだ頼み
  return open;
}

const jst = (iso: string): string => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/** オーナーの要承認の 1 行（見出しとひとこと） */
export function supportAskLineOf(r: SupportAskRow): { head: string; sub: string | null } {
  return { head: `運営がサポート許可を求めています（${jst(r.requested_at)}）`, sub: r.message ? `ひとこと：${r.message}` : null };
}

/** 運営の画面の「頼み済み」の 1 行 */
export const supportAskSentLineOf = (r: SupportAskRow): string => `頼み済み（${jst(r.requested_at)}）${r.message ? `・ひとこと：${r.message}` : ""}`;

/** ひとことの入力の確かめ（空は可＝ひとことなし） */
export function supportAskMessageErrOf(m: string): string | null {
  const v = m.trim();
  if (v.length > SUPPORT_ASK_MESSAGE_MAX) return `ひとことは ${SUPPORT_ASK_MESSAGE_MAX} 字までです`;
  return null;
}

/** ベルの数に足す数（出す頼みがあれば 1） */
export const supportAskCountOf = (r: SupportAskRow | null | undefined): number => (r ? 1 : 0);

/** RPC の英語の理由 → 日本語（運営の画面・オーナーの画面） */
export function supportAskErrJa(m: string | null | undefined): string {
  const s = String(m ?? "");
  if (s.includes("forbidden (demo)")) return "デモの会社には頼めません";
  if (s.includes("not needed")) return "今は頼まなくても代行できます（導入中か、サポート許可の間）";
  if (s.includes("bad message")) return `ひとことは ${SUPPORT_ASK_MESSAGE_MAX} 字までです`;
  if (s.includes("not found")) return "会社が見つかりません";
  if (s.includes("forbidden")) return "権限がありません";
  return "うまくいきませんでした。時間をおいてもう一度試してください";
}
