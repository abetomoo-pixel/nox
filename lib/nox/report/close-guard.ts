// ★2026-11-18 夜 2（相談役 ①）: 日報の「締め確定」で締められないときの窓（中央）の文言＝純関数。
//   理由は押した時点の未会計の件数（daily_report_close の 'open checks remain' と同じ open の伝票）と実査（数えた現金）の未入力。
//   強行（p_force）は窓の「未会計のまま締める」だけ＝店長・オーナー（旧「未会計があっても強行」のチェックは外した）。
export type CloseGuard = { openN: number; countedMissing: boolean };

// ★2026-11-20 夕（相談役 ⑧B）: 強行できる人（店長・オーナー）には「未会計の伝票があります」・できない人は「まだ締められません」のまま
export const closeGuardTitleOf = (g: CloseGuard, canForce = false): string => (g.openN > 0 ? (canForce ? "未会計の伝票があります" : "まだ締められません") : "実査が未入力です");

export function closeGuardReasonsOf(g: CloseGuard): string[] {
  return [
    ...(g.openN > 0 ? [`未会計の伝票が ${g.openN} 件あります`] : []),
    ...(g.countedMissing ? ["実査（数えた現金）が未入力です"] : []),   // ★相談役 ⑧B: 問いの文を混ぜない（問いはボタンで）
  ];
}

/** ★相談役 ⑧B: 「未会計のまま締める」を押したときの確かめ（1 回） */
export const closeGuardForceConfirmOf = (openN: number): string => `未会計 ${openN} 件を残して締めます。よろしいですか`;

/** ボタンのすぐ上の 1 行（押す前から） */
export const closeBlockedLineOf = (openN: number): string => `未会計 ${openN} 件のため、このままでは締められません`;

// ★0201v（夜便 2026-11-20 N1・相談役）: 締めの前の「今日の送り」の窓の出し分け＝純関数（サーバの判定は 0201u／0201v のまま・画面は出し分けだけ）
//   record＝記録できる人（オーナー・店長・シフトの許可があるスタッフ）＝今のとおり金額を入れて記録して締める
//   noRecord＝一覧は読めるが記録できない人（締めの許可だけのスタッフ）＝金額の欄を出さず「記録しないで締める」
//   noRead＝一覧を読めない人（締めの許可があるキャスト＝okuri_today_summary が forbidden）＝「このまま締める」
//   error＝通信などほかのエラー＝今のまま止める（窓を出さない）
export type OkuriWindowMode = "record" | "noRecord" | "noRead" | "error";
export function okuriWindowModeOf(o: { flagOn: boolean; errMsg: string | null; canRecord: boolean }): OkuriWindowMode {
  if (o.errMsg != null) return o.flagOn && /forbidden/.test(o.errMsg) ? "noRead" : "error";
  return o.flagOn && !o.canRecord ? "noRecord" : "record";
}
/** 記録できる人（transport_issue_bulk の 0201u の判定と同じ＝UI は利便・真の防御は RPC） */
export const okuriCanRecordOf = (o: { isManagerUp: boolean; staffCanShift: boolean; mig0201uOn: boolean }): boolean => o.isManagerUp || (o.mig0201uOn && o.staffCanShift);
export const okuriNoRecordLineOf = (n: number): string => `未記録の送りが ${n} 件あります。送りを記録できるのは、オーナー・店長・シフトの許可があるスタッフです。`;
export const OKURI_NO_READ_LINE = "送りの一覧を見る許可がありません。未記録の送りが残っていないか、店長に確かめてください。";
