// ★裁定344（便 N1013b fix）: デモ利用の規約 5 項（裁定293-7）の正本＝server／client 両方から import できる純データ。
//   components/ui/demo-terms.tsx（"use client"）は再 export し、app/lp/page.tsx（server component）はここから読む
//   （"use client" モジュールの非コンポーネント export は server component から値として読めない＝client reference になり build 失敗）。
export const DEMO_TERMS: readonly string[] = [
  "実在の人物の個人情報（氏名・連絡先・写真など）を入力しません。",
  "本番の店舗運営には利用しません（デモは体験用です）。",
  "入力したデータは他の閲覧者にも見え、毎日 06:05 に初期化されます。",
  "デモの計算結果を実際の給与・報酬・税務に利用しません。",
  "不正利用（大量の入力・自動化・他者になりすます操作など）を行いません。",
];
