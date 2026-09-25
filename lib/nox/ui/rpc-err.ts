// ★夜間便 N2-2（2026-09-18・裁定281 の周辺）: 生の RPC 語（'bad name'／'exceeds balance'…）を利用者向けの日本語に写す共通写像（純関数・DB を知らない）。
//   各画面の rpcErrJa（時間帯・シフト・レジ等の専用写像）はそのまま。ここは「写像を持たない画面が error.message をそのまま出していた 28 箇所」の受け皿。
//   写像に無い語＝「処理できませんでした（コード: xxx）」の形（生の語を裸で出さない）。日本語が既に来ている文言（写像済み）はそのまま返す。
const MAP: Array<[RegExp, string]> = [
  [/^bad name$/, "名前が長すぎるか、使えない文字が含まれています"],
  [/^exceeds balance$/, "入金額が残額を超えています"],
  [/^not open$/, "この伝票は会計済みか取消済みです"],
  [/^has payments$/, "入金後は変更できません（入金を取り消してから操作してください）"],
  [/^forbidden$/, "権限がありません"],
  [/^billing locked$/, "ご契約の状態により、この操作は現在できません"],
  [/^bad amount$/, "金額が正しくありません"],
  [/^bad qty$/, "数量が正しくありません"],
  [/^bad price$/, "単価が正しくありません"],
  [/^bad delta$/, "増減が 0 です"],
  [/^bad item$/, "商品が正しくありません"],
  [/^inactive item$/, "この商品は無効化されています"],
  [/^not found$/, "対象が見つかりません"],
  [/^not_found$/, "対象が見つかりません"],
  [/^bad reason$/, "理由を入力してください"],
  [/^reason required$/, "確定済みの取消には理由が必要です"],
  [/^reason_required$/, "理由を入力してください"],
  [/^biz_date_past$/, "過去の営業日は変更できません"],
  [/^guarantee exists$/, "この期間には既に保証時給が設定されています"],
  [/^bad valid_from$/, "開始日が正しくありません（今日以降で、現在の設定より後の日付にしてください）"],
  [/^bad valid_to$/, "終了日は開始日以降にしてください"],
  [/^no plan$/, "先に報酬プランを設定してください"], // ★裁定289-3
  [/^period_not_open$/, "この日は募集期間外です"],
  [/^duplicate wish$/, "この日の希望はすでに提出済みです"],
  [/^bad date$/, "日付が正しくありません"],
  [/^bad time$/, "時刻の形式が正しくありません（開始 00:00〜23:59・終了 00:00〜47:59）"],
  [/^closed day$/, "定休日です"],
  [/^day closed$/, "この営業日は締め済みです"],
  [/^empty check$/, "明細がありません"],
  [/^balance remaining$/, "残額があります（入金を済ませてください）"],
  [/^bad key$/, "設定できない項目が含まれています"],
  [/^bad patch$/, "変更内容がありません"],
  [/^bad slide_apply$/, "スライドの適用月の指定が正しくありません"],
  [/^duplicate$/, "すでに登録があります"],
  [/^overlap$/, "他の期間と重なっています"],
  [/^invalid_input$/, "入力内容が正しくありません"],
  [/^idem required$/, "再試行してください（識別子が欠けています）"],
  [/^feature_disabled:(\w+)$/, "この機能は現在オフになっています"],
  [/^merge_conflict:(\w+)$/, "この伝票は合算できません"],
  // ★0154（裁定294／295・2026-09-24）: 打刻の修正申請・報酬型・精算調整／懲戒減給・雇用区分・計算期間
  // ★0152（裁定298／299・2026-09-25）: 紹介（referrers／check_referrals／referral_payouts）
  [/^no people$/, "人数を先に入力してください"],
  [/^exists$/, "この伝票には既に紹介が付いています（外してから付け直してください）"],
  [/^bad referrer$/, "その紹介者は選べません（自店の紹介者か確認してください）"],
  [/^inactive referrer$/, "その紹介者は無効化されています"],
  [/^frozen$/, "会計確定後は変更できません"],
  [/^referral on from$/, "統合元の伝票に紹介が付いています（先に外してください）"],
  [/^already paid$/, "この紹介料は支払済みです"],
  [/^voided$/, "この紹介料は取消済みです"],
  [/^bad paid_via$/, "支払方法が正しくありません"],
  [/^bad kind$/, "区分が正しくありません"],
  [/^bad membership$/, "スタッフの選択が正しくありません（スタッフは所属を、外部は空にしてください）"],
  [/^bad withholding_category$/, "源泉区分が正しくありません"],
  [/^bad method$/, "計算方法が正しくありません"],
  [/^bad value$/, "率または金額が正しくありません（率は 0〜100%）"],
  [/^bad burden$/, "負担区分が正しくありません"],
  [/^bad memo$/, "メモは 200 字以内で入力してください"],
  [/^bad contact$/, "連絡先は 200 字以内で入力してください"],
  [/^bad ids$/, "支払う紹介料を選んでください"],
  [/^bad idem$/, "もう一度やり直してください"],
  [/^period finalized$/, "この日を含む給与は確定済みのため変更できません"],
  [/^out of biz window$/, "時刻がその営業日の範囲外です"],
  [/^punch not found$/, "対象の打刻が見つかりません"],
  [/^not pending$/, "この申請はすでに決裁済みです"],
  [/^not decided$/, "まだ決裁されていません"],
  [/^not approved$/, "承認されていない申請です"],
  [/^bad ack$/, "確認の種別が正しくありません"],
  [/^inactive cast$/, "無効化されたキャストです"],
  [/^no cast for caller$/, "キャストとしてログインしてください"],
  [/^bad pay_rule for employment$/, "この報酬型は契約区分（雇用／委託）では選べません"],
  [/^bad overrides$/, "待遇の設定値が正しくありません"],
  [/^bad source$/, "調整の種類が正しくありません"],
  [/^basis required$/, "根拠（契約条項・就業規則）を入力してください"],
  [/^bad source for employment$/, "この調整は契約区分（雇用／委託）では登録できません"],
  [/^shift not found$/, "対象のシフトが見つかりません"],
  [/^no basis for average wage$/, "確定済みの給与が無いため平均賃金を計算できません（懲戒減給は登録できません）"],
  [/^sanction cap$/, "上限を超えています（1 件は平均賃金の半額・当期合計は賃金総額の 1/10 まで）"],
  [/^bad employment$/, "契約区分は「委託」か「雇用」です"],
  [/^bad calc period$/, "計算期間が給与の期間の範囲外です"],
  [/^run not draft$/, "この給与は確定済みのため変更できません"],
  [/^bad mode$/, "調整の方式が正しくありません"],
  [/permission denied/, "権限がありません"],
];

const JA = /[぀-ヿ一-龯]/;

/** ★夜間便 N4（2026-09-18）→ 便 X2-1（2026-09-24）: RPC がまだ DB に無い（マイグレーション未適用）ときの PostgREST の文言（"Could not find the function … in the schema cache"／PGRST202）
 *  だけを true にする。RPC 自身の raise（'not_found'／'invalid_input'／'forbidden' 等）は「RPC あり」＝false。probe（引数 null で raise・書込なし）の判定に使う。 */
export function isRpcMissingError(msg: string | null | undefined): boolean {
  const m = (msg ?? "").toLowerCase();
  return /could not find the function|pgrst202|schema cache/.test(m);
}

/** 生の RPC 語→日本語。写像に無い英字コードは「処理できませんでした（コード: xxx）」。日本語が含まれる文言はそのまま */
export function rpcErrJa(msg: string | null | undefined): string {
  if (!msg) return "処理できませんでした";
  const m = msg.trim();
  if (JA.test(m)) return m;
  for (const [re, ja] of MAP) if (re.test(m)) return ja;
  return `処理できませんでした（コード: ${m.slice(0, 60)}）`;
}
