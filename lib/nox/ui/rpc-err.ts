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
  [/permission denied/, "権限がありません"],
];

const JA = /[぀-ヿ一-龯]/;

/** ★夜間便 N4（2026-09-18）: RPC がまだ DB に無い（マイグレーション未適用）ときの PostgREST／Postgres の文言＝画面側は節ごと非表示にする */
export function isRpcMissingError(msg: string | null | undefined): boolean {
  const m = (msg ?? "").toLowerCase();
  return /could not find the function|does not exist|pgrst202|schema cache/.test(m);
}

/** 生の RPC 語→日本語。写像に無い英字コードは「処理できませんでした（コード: xxx）」。日本語が含まれる文言はそのまま */
export function rpcErrJa(msg: string | null | undefined): string {
  if (!msg) return "処理できませんでした";
  const m = msg.trim();
  if (JA.test(m)) return m;
  for (const [re, ja] of MAP) if (re.test(m)) return ja;
  return `処理できませんでした（コード: ${m.slice(0, 60)}）`;
}
