// ★0201f（裁定483・499-3）: マイナンバーの廃棄の候補の画面の言葉（言葉は「最後に報酬の支払いがあった年」＝Agoora 確定・「支払調書の対象になった年」は使わない）
export const MYNUMBER_LAST_PAY_YEAR_LABEL = "最後に報酬の支払いがあった年";
export const MYNUMBER_IN_SERVICE_LABEL = "在籍中・番号を使う予定が無いか確認してください";
export const MYNUMBER_DISCARD_NOTE_0201F =
  "退店した人、または在籍中で報酬の支払いが途絶えた人のうち、最後に報酬の支払いがあった年（無ければ番号を登録した年）の翌年 1 月 1 日から、店の設定の年数（お店の運用の目安）が過ぎ、マイナンバーの登録が残っているキャスト。廃棄するかはオーナーが判断します。";
/** 店の設定の年数（1〜20・既定 7） */
export const MYNUMBER_RETENTION_DEFAULT = 7;
export function mynumberRetentionValidOf(v: string): boolean { return /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 20; }
