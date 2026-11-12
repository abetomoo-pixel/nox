// ★M-177（2026-11-11 Agoora 確定・夜便レーン 1）: スタッフ（と店長）本人が「自分の情報」を編集する範囲の純関数。
//   本人が編集できる＝連絡先（電話・連絡用メール＝set_my_contact／住所・緊急連絡先＝member_profile_self_save）・写真・PIN（パスワードは再設定の画面＝demo-guard の決まり）。
//   店長・オーナーだけ＝氏名・生年月日・振込先の口座（本人の画面は表示だけ＋「変更は店長にお伝えください」）。
//   店の端末（キオスクの本人セッション）＝PIN の変更だけ（相談役 ★3・柵は画面だけ）。サーバ側の書込は既存の RPC（本人の行・許した項目だけ）。

export type SelfProfileForm = { address: string; emergency_name: string; emergency_relation: string; emergency_phone: string };
export type SelfProfileRow = { address?: string | null; emergency_name?: string | null; emergency_relation?: string | null; emergency_phone?: string | null } | null;

export const SELF_PROFILE_LABEL: Record<keyof SelfProfileForm, string> = {
  address: "住所", emergency_name: "緊急連絡先（お名前）", emergency_relation: "続柄", emergency_phone: "緊急連絡先（電話）",
};
export const SELF_PROFILE_MAXLEN: Record<keyof SelfProfileForm, number> = { address: 200, emergency_name: 60, emergency_relation: 20, emergency_phone: 20 };
export const SELF_PROFILE_STORE_ONLY_NOTE = "氏名・生年月日・振込先の口座は管理者と店長が登録します。変更は店長にお伝えください。";
/** ★■N-5（2026-11-12）: 役割ごとの注記（「オーナー」は「管理者」・管理者と店長には「店長に伝えて」を出さない） */
export function selfProfileStoreOnlyNoteOf(role: string | null | undefined): string {
  if (role === "owner" || role === "admin") return "氏名・生年月日・振込先の口座は、管理者と店長がスタッフの画面で登録します。";
  if (role === "manager") return "氏名・生年月日・振込先の口座は管理者と店長が登録します。ご自身の分の変更は管理者にお伝えください。";
  return SELF_PROFILE_STORE_ONLY_NOTE;
}
export const SELF_PROFILE_KIOSK_NOTE = "店の端末では PIN の変更だけできます。連絡先・写真・パスワードは、ご自身のスマホなどからログインして変更してください。";
export const SELF_PROFILE_DEMO_NOTE = "デモでは連絡先・住所・パスワードの変更はできません（表示だけ）。";

export const selfProfileFormOf = (row: SelfProfileRow): SelfProfileForm => ({
  address: row?.address ?? "", emergency_name: row?.emergency_name ?? "", emergency_relation: row?.emergency_relation ?? "", emergency_phone: row?.emergency_phone ?? "",
});

/** 先回りの検査（RPC と同じ形＝緊急連絡先の電話は数字と + - ( ) 空白の 6〜20 文字） */
export function selfProfileErrorOf(f: SelfProfileForm): string | null {
  for (const k of Object.keys(SELF_PROFILE_MAXLEN) as (keyof SelfProfileForm)[]) if (f[k].trim().length > SELF_PROFILE_MAXLEN[k]) return `${SELF_PROFILE_LABEL[k]}は ${SELF_PROFILE_MAXLEN[k]} 文字までです`;
  const p = f.emergency_phone.trim();
  if (p && !/^[0-9+\-() ]{6,20}$/.test(p)) return "緊急連絡先の電話は数字（6〜20 文字）で入力してください";
  return null;
}

/** 変わった項目だけ（空文字は null で消す＝RPC が nullif する） */
export function selfProfilePatchOf(f: SelfProfileForm, before: SelfProfileRow): Record<string, string | null> | null {
  const b = selfProfileFormOf(before);
  const out: Record<string, string | null> = {};
  for (const k of Object.keys(SELF_PROFILE_LABEL) as (keyof SelfProfileForm)[]) if (f[k].trim() !== b[k].trim()) out[k] = f[k].trim() === "" ? null : f[k].trim();
  return Object.keys(out).length ? out : null;
}

export function selfProfileErrJa(m: string): string {
  if (/bad emergency_phone/.test(m)) return "緊急連絡先の電話の形が正しくありません";
  if (/forbidden/.test(m)) return "この操作はできません（デモ・権限）";
  return `保存できませんでした（${m}）`;
}
