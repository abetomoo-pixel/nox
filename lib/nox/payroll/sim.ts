// 報酬シミュレーター core（F2f・純関数・DB を知らない＝verify で直接叩ける）。
// 仮パラメータ→CastRaw→buildPayInput→payOf の純経路を再利用（確定と同じ payOf を共有＝二重実装なし・
//   verify-nox-payroll と同じ叩き方）。collect/computePayrollDraft（DB 層）は通さない。
// 天引き3種（arDeduct/advanceDeduct/okuriDeduct）は呼び出し側が渡す:
//   cast モード＝自分の open 残（adv/okuri をパターン1 で client 読取・ar は receivables パターン2 で読めず注記誘導）。
//   店モード＝天引きなし（仮 cast に履歴なし）＝全 0。
// #12 雇用係数は payOf 内（withholdingOf の taxMode 分岐）と simAddedPay（追加出勤の限界額）で既に実装済み
//   （委託 1−0.1021／雇用 1.0）。社労士回答は pay.ts の当該1箇所差替で自動追従。

import { payOf, type PayResult, type CompPlan, type PlanOverride, type TaxMode } from "../pay";
import { buildPayInput, type CastRaw, type StoreMasters } from "./assemble";

export type SimInput = {
  days: number; // 出勤日数
  hoursPerDay: number; // 1日あたり勤務時間
  sales: number; // 期間の総売上（円・per-day slide には days で均等割）
  hon: number; // 本指名 回数
  jonai: number; // 場内指名 回数
  dohan: number; // 同伴 回数
  productBack: { drink: number; champ: number; bottle: number }; // 商品バック（円・集計済み想定）
  pointProducts: number; // 本指名商品pt
  champCnt: number; // シャンパン本数（自由バック metrics 用）
  bottleCnt: number; // ボトル本数
  lateN: number; // 遅刻回数
  absentN: number; // 欠勤回数
  norm: { days: number; dohan: number }; // ノルマ目標
  plan: CompPlan; // 報酬プラン（cast=自分の割当・店=選択/編集）
  override?: PlanOverride;
  masters: StoreMasters; // 店共通マスタ（penalty/normConfig/deductions/customBackDefs）
  taxMode: TaxMode; // 委託/雇用
  arDeduct?: number; // 売掛天引き（既定 0・cast の ar は注記誘導ゆえ通常 0）
  advanceDeduct?: number; // 前借り天引き（cast の open 残・既定 0）
  okuriDeduct?: number; // 送り実費天引き（cast の open 残・既定 0）
};

// 仮パラメータから CastRaw を組み、buildPayInput→payOf を回す（DB 非依存の純経路）。
//   daily は「D 個の均等シフト（各 hours=hoursPerDay・sales=総売上/D）」に合成する。
//   wageDetail は per-day sales で slide（売上/pt/保証の時給階段）を判定するため、均等割で per-day 平均を当てる。
export function simulate(inp: SimInput): PayResult {
  const days = Math.max(0, Math.floor(inp.days));
  const perDaySales = days > 0 ? inp.sales / days : 0;
  const daily = Array.from({ length: days }, (_, i) => ({
    // bizDate は buildPayInput の dayNum(slice(8,10)) 用の妥当な 'YYYY-MM-DD'（d は表示用ラベルのみ・計算不使用）。
    bizDate: `2000-01-${String((i % 28) + 1).padStart(2, "0")}`,
    hours: inp.hoursPerDay,
    sales: perDaySales,
  }));
  const raw: CastRaw = {
    castId: "sim",
    castName: "シミュレーション",
    sales: inp.sales,
    hon: inp.hon,
    jonai: inp.jonai,
    dohan: inp.dohan,
    daily,
    productBack: inp.productBack,
    pointProducts: inp.pointProducts,
    champCnt: inp.champCnt,
    bottleCnt: inp.bottleCnt,
    days,
    lateN: inp.lateN,
    absentN: inp.absentN,
    anomalyCount: 0,
    plan: inp.plan,
    override: inp.override,
    norm: inp.norm,
    taxProfileMode: inp.taxMode,
  };
  return payOf(
    buildPayInput(raw, inp.taxMode, inp.masters, inp.arDeduct ?? 0, inp.advanceDeduct ?? 0, inp.okuriDeduct ?? 0),
  );
}
