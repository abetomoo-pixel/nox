// 予想人件費 純関数（UI刷新v2 段S-2・設計正本 NOX_S2_予想人件費_設計.md §1〜§2）。
//
// 定義（§1）: その日の（確定+予定）シフトの時間帯 × 各キャストの時給スライドの概算合計。
//   店長の「人を入れすぎ/足りない」の判断材料であり★支払額ではない。
//   含めない: バック（売上依存＝予定から計算不能）・控除・源泉・ボーナス・ノルマ罰。
//   UI 側は必ず注記を出す:「シフト時間×時給の概算です。バック・控除は含みません。実際の給与とは異なります。」
//
// ★時給解決＝pay.ts の既存 export を再利用（参照実装を書かない・pay.ts 側 diff ゼロ）:
//   - 日次の時給採用規則 max(売上スライド, ポイントスライド, 保証) と丸めの本体は wageDetail。
//     本関数はシフト1本を「sales=0・pts=0 の DailyRecord」として wageDetail に渡す＝
//     「その日の売上がまだ無い時点で payOf が採用する時給」がそのまま予測時給になる
//     （at=0 のスライド段があれば保証より高い値を正しく拾い、at>0 の段は予定段階では発火しない）。
//     採用規則が将来 F2 等で変わっても wageDetail 経由ゆえ自動追随＝参照実装のドリフトが構造的に無い。
//   - base の cast 別 override（cast_plan.overrides_json）は applyOverride を再利用。
//   - 設計§2「スライドが時間帯で変わる場合＝分割して加重」は現 CompPlan に時間帯スライドが
//     存在しないため空条件（スライドは日次売上/pt 起点）。シフト1本=1レコードで wageDetail に
//     渡す構造は payOf の実績計算（日次レコードの時給×時間の加重）と同一規則＝将来の変更も貫通する。
//
// 丸め（§2・payOf 側の規約が正）: 分は分のまま hours=分/60 で渡し、cast ごとに wageDetail が
//   timePay = roundYen(Σ 時給×hours) の1回丸め。日合計はその整数和＝
//   実際の給与も cast 単位で丸まるため、店合計を後から1回丸めるのではなく cast 丸めの和が payOf 規約。
//
// byBand は表示用の分解（同一 start/end のシフトを束ねて時間帯行にする）。各バンドで roundYen
//   1回のため、丸め端数の載り方が cast 単位と異なり Σ byBand.amount が total と数円ずれ得る。
//   ★正は total（byBand は日詳細の内訳表示のみに使い、合計表示に byBand を再集計しない）。
//
// DB 非依存・I/O なし（payOf と同じく入力は集計済み plain object）。

import { applyOverride, wageDetail, type CompPlan, type PlanOverride, type DailyRecord } from "./pay";
import { roundYen } from "./money";
import { hm2min, spanMinutes } from "./shift-time";

// ── 型 ────────────────────────────────────────────────────────

/** 対象日のシフト1本。status（planned/confirmed）は金額に影響しない＝両方含める（§2）ため受けない。 */
export type ForecastShift = { castId: string; startHm: string; endHm: string };

/** cast の待遇（cast_plans 相当）。override は cast_plan.overrides_json（base 上書きが時給に効く）。 */
export type ForecastComp = { plan: CompPlan; override?: PlanOverride };

/** 時間帯行（日詳細の moneyrow 用）。同一 start/end を束ねる。amount は表示用（正は DayForecast.total）。 */
export type ForecastBand = {
  startHm: string;
  endHm: string;
  minutes: number; // 1人あたりの分数（バンド定義から一意）
  heads: number; // 人数（時給未設定 cast も含む＝頭数は隠さない）
  amount: number; // このバンドの概算円（時給未設定 cast は 0 円で寄与）
};

export type DayForecast = {
  total: number; // 概算人件費（円・cast ごと roundYen の整数和＝payOf 丸め規約）
  totalMinutes: number; // Σ 全シフト分数（時給未設定 cast も含む）
  byBand: ForecastBand[]; // start 昇順→end 昇順（30h 表記は hm2min の数値順＝深夜帯が後ろ）
  unknownComp: number; // 時給未設定（comp 不明）の cast 人数（シフト本数ではなく人数・UI で注記）
};

// ── 本体 ──────────────────────────────────────────────────────

/**
 * 対象日の予想人件費。shifts は呼び手が対象日で絞った confirmed+planned 全件を渡す。
 * comps に無い castId は 0 円としてカウントし unknownComp に人数を返す（隠さない＝§2）。
 */
export function forecastDay(
  shifts: ForecastShift[],
  comps: Record<string, ForecastComp>,
): DayForecast {
  const minutesOf = shifts.map((s) => spanMinutes(s.startHm, s.endHm));

  // cast ごとに束ねて wageDetail を1回ずつ（eplan は cast 単位・丸めも cast 単位＝payOf 規約）
  const unknownCasts = new Set<string>();
  const byCast = new Map<string, { comp: ForecastComp; recs: DailyRecord[]; shiftIdx: number[] }>();
  shifts.forEach((s, i) => {
    const comp = comps[s.castId];
    if (!comp) {
      unknownCasts.add(s.castId);
      return;
    }
    let entry = byCast.get(s.castId);
    if (!entry) {
      entry = { comp, recs: [], shiftIdx: [] };
      byCast.set(s.castId, entry);
    }
    // sales=0・pts=0 の日次レコード＝「売上ゼロ時点で payOf が採用する時給」を wageDetail に解かせる
    entry.recs.push({ d: entry.recs.length + 1, hours: minutesOf[i] / 60, sales: 0 });
    entry.shiftIdx.push(i);
  });

  let total = 0;
  const hourlyByShift = new Array<number>(shifts.length).fill(0); // 未設定 cast は 0 のまま
  for (const entry of byCast.values()) {
    const { eplan } = applyOverride(entry.comp.plan, entry.comp.override);
    const wd = wageDetail(entry.recs, eplan, 0, 0);
    total += wd.timePay; // cast 単位で roundYen 済み
    wd.wdays.forEach((w, j) => {
      hourlyByShift[entry.shiftIdx[j]] = w.hourly;
    });
  }

  // byBand: 同一 (startHm, endHm) を束ねる（表示用・各バンド roundYen 1回）
  const bandMap = new Map<string, { startHm: string; endHm: string; minutes: number; heads: number; raw: number }>();
  shifts.forEach((s, i) => {
    const key = `${s.startHm}|${s.endHm}`;
    let b = bandMap.get(key);
    if (!b) {
      b = { startHm: s.startHm, endHm: s.endHm, minutes: minutesOf[i], heads: 0, raw: 0 };
      bandMap.set(key, b);
    }
    b.heads += 1;
    b.raw += (hourlyByShift[i] * minutesOf[i]) / 60;
  });
  const byBand: ForecastBand[] = [...bandMap.values()]
    .map(({ raw, ...b }) => ({ ...b, amount: roundYen(raw) }))
    .sort((a, b) => hm2min(a.startHm) - hm2min(b.startHm) || hm2min(a.endHm) - hm2min(b.endHm));

  return {
    total,
    totalMinutes: minutesOf.reduce((a, b) => a + b, 0),
    byBand,
    unknownComp: unknownCasts.size,
  };
}
