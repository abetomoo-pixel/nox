// ★0162 ★4（裁定326 追補7-6・便 M5-2・2026-10-01）: cast の契約確認（/mine 初回表示）の純関数（DB を知らない）。
//   店の contract_ack が ON（店設定・料金マスタで記録）かつ contract_ack_rev の記録が本人に無いとき＝cast_contract_ack_needed() が true のときだけ確認画面を出す。
//   「確認しました」＝cast_contract_ack_self()（冪等）→ 以後は出さない。店が OFF→ON をやり直すと rev が進み再表示（追補7-5 の手動再確認と整合）。
// ★便 M5 M-33（2026-10-30）: 枠の中身＝「基本の働き方の確認」＝本人の基本条件の要約（castTermsSummaryOf＝時給・契約区分・送り・ノルマ・バック）。
//   店向けの文（加盟店契約のカード手数料＝CONTRACT_ACK_STORE_TEXT）は /mine には出さない（料金マスタ pricing-board の注意文としてだけ残す＝定数は保つ）。
//   要約が 1 行も無い（時給も条件も無い）ときは枠そのものを出さない（contractAckGateOf の hasTerms）。
import { OKURI_MODE_LABEL, type OkuriMode } from "../shift/okuri-mode";

export const CONTRACT_ACK_TITLE = "基本の働き方の確認"; // ★便 M5 M-33: 旧「契約内容の確認」

/** 料金マスタ（pricing-board）の既存文面＝逐語。★便 M5 M-33: /mine の確認枠には出さない（pricing-board の注意文だけ） */
export const CONTRACT_ACK_STORE_TEXT = "加盟店契約でカード手数料の転嫁が禁止・制限されている場合があります。契約上の可否を確認してください";

/** 要約の下に出す締めの 1 行（★329 追補2 の相談役文面を保つ）。★便 M5 M-33: 店向け文（CONTRACT_ACK_STORE_TEXT）は外した */
export const CONTRACT_ACK_LINES: readonly string[] = [
  "上記の報酬条件を確認しました。条件が改定された場合は、この画面がもう一度表示されます。", // ★329 追補2（2026-10-01・相談役）: 文面差替え
];

export const CONTRACT_ACK_BUTTON = "確認しました";
export const CONTRACT_ACK_NOTE = "条件が入った／改定されたときにもう一度表示されます。"; // ★便 M5 M-33
export const CONTRACT_ACK_DONE = "確認を記録しました";

/** 確認画面を出すか＝店が ON（contract_ack）かつ RPC が「未記録」（needed=true）。RPC が読めない（null）ときは出さない（止めない）。
 *  ★便 M5 M-33: hasTerms＝要約が 1 行以上あるか（castTermsSummaryOf(...).length > 0）。false なら出さない（時給も条件も無い人に空の枠を見せない）。省略＝true（互換） */
export function contractAckGateOf(storeContractAck: boolean, needed: boolean | null | undefined, hasTerms: boolean = true): boolean {
  return storeContractAck === true && needed === true && hasTerms === true;
}

// ★便 M5 M-33（2026-10-30）: 本人の基本条件の要約（純関数・/mine page が既に読んでいる値だけを渡す＝新規 DB 読取 0）
export type CastTermsInput = {
  /** 今期の時給（mineCurrentWageOf.hourly）・無ければ時給の行は出ない */
  hourly?: number | null;
  /** 時給の根拠語（mineCurrentWageOf.basis＝「基本」「売上」「pt」「保証」「固定」）・無ければ括弧なし */
  wageBasis?: string | null;
  /** 期限付き保証時給の印（page の guaLabel＝「保証時給 ¥3,200（10/18 まで）」）・無ければ付かない */
  guaranteeLabel?: string | null;
  /** casts.employment（「雇用」／「委託」）・それ以外／null は契約区分の行を出さない */
  employment?: string | null;
  /** 店の送りの方式（okuriModeOf(settings)）・null／undefined は送りの行を出さない */
  okuriMode?: OkuriMode | null;
  /** 本人の距離区分の名前（店の okuri_flat_tiers から casts.okuri_tier の code を解いた name）・定額徴収のときだけ添える */
  okuriTierName?: string | null;
  /** 出勤ノルマ（当月の目標日数＝daysNormTargetsOf）・null／0 以下は出さない */
  normDaysTarget?: number | null;
  /** バック（本指名／場内／同伴の 1 本あたり円）・/mine では今日は渡さない（プランは cast の RLS で読めない＝将来の差替え点）。null／空は出さない */
  backs?: { hon?: number | null; jonai?: number | null; dohan?: number | null } | null;
};

const yen = (n: number): string => `¥${Math.trunc(n).toLocaleString()}`;

/** 要約の行（順＝時給→契約区分→送り→ノルマ→バック）。渡されない／空の項目は行を作らない＝0 行なら枠を出さない（hasTerms） */
export function castTermsSummaryOf(i: CastTermsInput): string[] {
  const out: string[] = [];
  if (typeof i.hourly === "number" && Number.isFinite(i.hourly) && i.hourly > 0) {
    const basis = i.wageBasis ? `（${i.wageBasis}）` : "";
    out.push(`時給 ${yen(i.hourly)}${basis}${i.guaranteeLabel ? `・${i.guaranteeLabel}` : ""}`);
  } else if (i.guaranteeLabel) {
    out.push(`時給 ${i.guaranteeLabel}`);
  }
  if (i.employment === "雇用" || i.employment === "委託") out.push(`契約区分 ${i.employment}`);
  if (i.okuriMode && i.okuriMode in OKURI_MODE_LABEL) {
    const tier = i.okuriMode === "flat" && i.okuriTierName ? `・区分 ${i.okuriTierName}` : "";
    out.push(`送り ${OKURI_MODE_LABEL[i.okuriMode]}${tier}`);
  }
  if (typeof i.normDaysTarget === "number" && Number.isFinite(i.normDaysTarget) && i.normDaysTarget > 0) out.push(`出勤ノルマ 月 ${Math.trunc(i.normDaysTarget)} 日`);
  if (i.backs) {
    const parts = ([["本指名", i.backs.hon], ["場内", i.backs.jonai], ["同伴", i.backs.dohan]] as [string, number | null | undefined][])
      .filter((p): p is [string, number] => typeof p[1] === "number" && Number.isFinite(p[1]) && p[1] > 0)
      .map(([k, v]) => `${k} ${yen(v)}`);
    if (parts.length > 0) out.push(`バック ${parts.join("／")}`);
  }
  return out;
}

/** RPC の拒否語 → 和文（rpc-err の写像と同じ語） */
export const CONTRACT_ACK_ERR_JA: Record<string, string> = {
  "not required": "この店では契約確認は不要です",
  "no cast for caller": "キャストの登録が見つかりません",
};
