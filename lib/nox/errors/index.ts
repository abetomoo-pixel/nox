// ★裁定467（M-126・2026-11-09）: 利用者向けの警告・エラー文は日本語＝client の辞書 1 本。
//   RPC の英字（raise exception 'bad name' 等）はコードとして不変（DB・verify・f0 の pin は触らない）＝ここで日本語に写す。
//   辞書に無いコードは「処理できませんでした（bad xxx）」（英字を裸で出さない・コードは括弧で残す＝問い合わせの手がかり）。
//   日本語が既に入っている文言（各画面の写像済み）はそのまま返す。入力不足は RPC の前に止める（各画面＝ボタンを押せない＋欄の下に 1 行）。
//   既存の lib/nox/ui/rpc-err.ts（rpcErrJa）はこの辞書に委ねる＝写像の置き場は 1 か所。画面ごとの *ErrJa は専用の文言を先に当て、残りをここへ渡す。

/** コード → 日本語（先に一致したものが勝つ・正規表現は ^…$ で完全一致） */
export const ERR_DICT: ReadonlyArray<readonly [RegExp, string]> = [
  // 共通（権限・契約・存在）
  [/^forbidden$/, "権限がありません"],
  [/^permission denied( for .*)?$/i, "権限がありません"],
  [/^billing locked$/, "ご契約の状態により、この操作は現在できません"],
  [/^not found$|^not_found$/, "対象が見つかりません"],
  [/^invalid_input$/, "入力内容が正しくありません"],
  [/^bad args$/, "入力内容が正しくありません"],
  [/^bad patch$/, "変更内容がありません"],
  [/^bad key$/, "設定できない項目が含まれています"],
  [/^duplicate$|^duplicate name$/, "同じ名前がすでにあります"],
  [/^overlap$/, "他の期間と重なっています"],
  [/^idem required$|^bad idem$/, "もう一度やり直してください"],
  [/^feature_disabled(:\w+)?$/, "この機能は現在オフになっています"],
  // 入力
  [/^bad name$/, "名称を入力してください（50 字以内）"],
  [/^bad amount$/, "金額が正しくありません"],
  [/^bad qty$/, "数量が正しくありません"],
  [/^bad price$/, "単価が正しくありません"],
  [/^bad date$|^bad biz_date$/, "日付が正しくありません"],
  [/^bad time$/, "時刻の形式が正しくありません"],
  [/^bad reason$|^reason_required$/, "理由を入力してください"],
  [/^reason required$/, "確定済みの取消には理由が必要です"],
  [/^bad memo$/, "メモは 200 字以内で入力してください"],
  // PIN・端末
  [/^bad pin$|^wrong_pin$/, "PIN が違います"],
  [/^bad_pin$/, "PIN は 4〜6 桁の数字です"],
  [/^locked$/, "失敗が続いたためロック中です（しばらくしてから）"],
  [/^no_pin$/, "PIN が設定されていません（店に確認してください）"],
  [/^device bound$/, "この端末は別の端末として固定されています（店のオーナーに固定の解除を依頼してください）"],
  [/^not bound$/, "この端末はまだ固定されていません（端末でログインし直してください）"],
  [/^no session$/, "端末のロックを解除してから操作してください"],
  // 会計
  [/^off duty$/, "出勤してからレジを開けます（店の端末で出勤の打刻をしてください）"],
  [/^not open$/, "この伝票は会計済みか取消済みです"],
  [/^has payments$/, "入金後は変更できません（入金を取り消してから操作してください）"],
  [/^exceeds balance$/, "入金額が残額を超えています"],
  [/^day closed$/, "この営業日は締め済みです"],
  [/^empty check$/, "明細がありません"],
  [/^balance remaining$/, "残額があります（入金を済ませてください）"],
  // 打刻・勤怠・給与
  [/^already in$/, "すでに出勤打刻があります"],
  [/^already out$/, "本日は退勤済みです"],
  [/^no open punch$|^not in$/, "出勤打刻がありません（先に出勤を打刻してください）"],
  [/^paid period$/, "支払済みの期間には発行できません"],
  [/^finalized$|^period finalized$/, "確定済みの月は変更できません"],
  [/^not today$/, "今日の分だけ変更できます"],
  [/^bad day deductions$/, "今日の控除は出勤のときだけ付けられます"],
  [/^bad deduction$/, "控除の項目が正しくありません"],
  [/^not day rule$/, "日ごとの控除ではありません"],
  [/^advance settled$/, "この前借り（貸付）は返済済みか取消済みです"],
  // 店舗設定
  [/^bad line_notify$/, "LINE 通知の設定が正しくありません"],
];

const JA = /[぀-ヿ一-龯]/;

/** 生のコード → 日本語。日本語を含む文言はそのまま・辞書に無いコードは「処理できませんでした（bad xxx）」 */
export function errJa(msg: string | null | undefined): string {
  if (!msg) return "処理できませんでした";
  const m = msg.trim();
  if (JA.test(m)) return m;
  for (const [re, ja] of ERR_DICT) if (re.test(m)) return ja;
  return errUnknownOf(m);
}
/** 辞書に無いコードの文言（括弧の中は英字のコード＝問い合わせの手がかり） */
export const errUnknownOf = (code: string): string => `処理できませんでした（${code.trim().slice(0, 60)}）`;
/** 辞書にあるか（各画面の *ErrJa が「専用の文言 → 辞書 → 不明」の順に当てるとき使う） */
export const errKnownOf = (msg: string | null | undefined): string | null => {
  const m = (msg ?? "").trim();
  for (const [re, ja] of ERR_DICT) if (re.test(m)) return ja;
  return null;
};

/** 入力不足の前置き（RPC の前に止める）＝必須の文字列が空なら欄の下に出す 1 行。空でなければ null */
export const requiredNoteOf = (value: string | null | undefined, label: string): string | null => ((value ?? "").trim() === "" ? `${label}を入力してください` : null);
