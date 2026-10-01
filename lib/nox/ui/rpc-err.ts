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
  // ★0159（裁定324＋追補2・便 P-4）: payroll_shortfall_sync／set_store_pay_time_basis の raise 語（'bad cast' は 0156 の既存行＝所属していません）
  [/^bad row$/, "不就労控除の行の形が正しくありません（もう一度プレビューしてください）"],
  [/^bad shift$/, "確定シフトと営業日が一致しない行が含まれています（シフトを確認してください）"],
  [/^runs exist$/, "この店には給与の計算期間があるため「いま」は指定できません（「次の期から」を選んでください）"],
  [/^bad pay_time_basis$/, "勤務時間の計算基準は「実打刻」か「確定シフトどおり」から選んでください（他の値は設定できません）"],
  [/^bad apply$/, "切替の時期は「次の期から」か「いま」から選んでください（他の値は設定できません）"],
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
  // ★0155（裁定309／追補1・2026-09-28・便 S）: 売掛の店設定・マイナンバー廃棄・顧客匿名化
  [/^ar disabled$/, "この店では売掛を使えません"],
  [/^no mynumber$/, "マイナンバーは登録されていません（廃棄する対象がありません）"],
  [/^already anonymized$/, "この顧客はすでに匿名化されています"],
  // ★0156（裁定309-6〜9・便 V）: 日払い・控除上書き・送り一括
  [/^paid period$/, "その営業日を含む給与は支払済みのため登録できません"],
  [/^period not ended$/, "期間がまだ終わっていないため確定できません（期間終了の翌日から確定できます）"], // 日付つきの文言（期間終了（M/D）の翌日から…）は finalize-guard の notEndedMessageOf＝期末を知っている側が作る（便 AB-9） // ★裁定316（便 X-8-13）
  [/^bad enabled$/, "控除の ON／OFF を指定してください"],
  [/^bad deduction$/, "この店の固定控除ではありません（この控除は上書きできません）"],
  [/^bad cast$/, "このキャストはこの店に所属していません（登録できません）"],
  [/^okuri not actual$/, "この店の送りは定額方式です（実費の発行はできません）"],
  [/^duplicate cast$/, "同じキャストが 2 回以上含まれています（重複を除いてください）"],
  // ★0161（裁定327＋追補1・2026-09-30・便 M1）: 打刻の順序検査（punch_self／punch_proxy／kiosk_punch 共通・端末にも同じ和文）
  [/^already in$/, "すでに出勤打刻があります"],
  [/^already out$/, "本日は退勤済みです"],
  [/^no open punch$/, "出勤打刻がありません"],
  // ★0160（裁定326-3・便 M2-2）: set_cast_quota（'bad cast' は 0156 の既存行）
  [/^bad quota$/, "目標は 0 以上の整数で入力してください（空欄＝目標なし）"],
  [/^bad month$/, "月の指定が正しくありません（月初の日付で指定してください）"],
  // ★0160（裁定326-4／追補1-5・便 M3）: 予約申請 reservation_request／決裁 reservation_decide／承認前の伝票化
  [/^bad customer$/, "担当客の中から選んでください"],
  [/^bad reserved_at$/, "来店日時を入力してください"],
  [/^bad decision$/, "決裁の種別が正しくありません"],
  [/^not bookable$/, "承認前の申請は予約として扱えません（先に承認してください）"],
  // ★0160（裁定326-7／追補2-1・便 M4-1）: 休み希望（kind 'off'）はシフト案にならない（shift_wish_decide accept／shift_auto_apply）
  [/^off wish/, "休み希望はシフト案にできません（却下のみできます）"],
  // ★0162（裁定329／326 追補7-6・便 M5）: スタッフ写真 set_user_photo_updated_at／clear_user_photo・契約確認 cast_contract_ack_self
  [/^bad user$/, "スタッフの指定が正しくありません"],
  [/^not required$/, "この店では契約確認は不要です"],
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
