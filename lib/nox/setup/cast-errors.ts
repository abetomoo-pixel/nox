// ★起票143（相談役 11/23 16:40 の ■1-c）: 初期設定の完了の画面のキャストの登録＝失敗したときの文を日本語に（英字の理由をそのまま出さない・DB を知らない純関数）。
//   段（cast_create → 契約区分 → 待遇プラン → PIN → 送りの距離）が出しうる語は、本番の関数の raise を全部読んで並べた（2026-11-23・20 語）。
//   写像に無い語は「理由を日本語で出せませんでした」＝英字は出さない。どの人のどの段で止まったかを 1 行にする（castStepFailTextOf）。

const BY_RPC: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  set_cast_employment: { "bad valid_from": "契約区分の開始日は給与期の初日（月の 1 日）だけです", "period finalized": "その月の給与は確定済みのため、契約区分を変えられません", "bad employment": "契約区分は「業務委託」か「雇用」です" },
  set_cast_plan: { "bad valid_from": "待遇プランの開始日が正しくありません", "plan inactive": "選んだ待遇プランが使われていません（マスタで有効にしてください）", "bad overrides": "待遇の設定値が正しくありません", "bad pay_rule for employment": "この報酬型は契約区分（雇用／業務委託）では選べません" },
  set_cast_pin: { "bad pin": "PIN は 4〜6 桁の数字です", "pin weak": "推測されやすい PIN は使えません（別の番号にしてください）", "pin taken": "この PIN はほかの人が使っています（別の番号にしてください）" },
  set_cast_okuri_tier: { "bad tier": "送りの距離区分が正しくありません" },
};
const COMMON: Readonly<Record<string, string>> = {
  forbidden: "権限がありません（オーナーか、この店の店長で登録してください）",
  "billing locked": "ご契約の状態により、いまは登録できません",
  "bad name": "源氏名が長すぎるか、使えない文字が含まれています",
  "bad real name": "本名が長すぎます（80 文字まで）",
  "bad birthday": "生年月日を入れてください",
  "under 18": "18 歳未満の方は登録できません",
  "bad kind": "在籍区分が正しくありません",
  "not found": "キャストが見つかりません",
  "inactive cast": "このキャストは在籍していません",
  "bad args": "入力が足りません",
};
export const CAST_STEP_UNKNOWN = "理由を日本語で出せませんでした（店舗の管理者に連絡してください）";

/** 段の rpc と生の語 → 日本語（英字を返さない） */
export function castStepErrJa(rpc: string | null | undefined, msg: string | null | undefined): string {
  const m = (msg ?? "").trim();
  if (/[ぁ-んァ-ヶ一-龠]/.test(m)) return m; // 日本語の文（route の語など）はそのまま
  return (rpc && BY_RPC[rpc]?.[m]) ?? COMMON[m] ?? CAST_STEP_UNKNOWN;
}

/** 1 行：だれの・どの段で止まったか・理由（日本語）。作れた段があれば「ここから続けられる」と添える */
export function castStepFailTextOf(name: string, stepLabel: string, rpc: string | null | undefined, msg: string | null | undefined, resumable: boolean): string {
  return `${name} の登録が「${stepLabel}」で止まりました：${castStepErrJa(rpc, msg)}${resumable ? "（直してもう一度押すと、この段から続けます）" : ""}`;
}

