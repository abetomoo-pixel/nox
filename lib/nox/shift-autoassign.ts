/* シフト自動配置（SD v1）— 説明可能な貪欲法・たたき台止まり。
 *
 * 正本 = docs/tmp/NOX_SD設計書v1.md §4（sha 04621547…6796）。
 * 翻訳元 = BANZEN lib/shift-autoassign.ts（837行・読取のみ＝SD-3）を **2鍵へ縮退**（裁定④）:
 *   donor の5段（モードB優先度／社員最低日数／①最低月間時間未達／②公平／③金額）のうち
 *   ①②だけを残す。③「目標金額」は実体が「時給×見込時間の昇順」で targetYen 未参照だった
 *   （SD-5＝宣言≠実参照）＝落とす。position/帯tier/公休生成/2パスも対象外（裁定③・SD-6）。
 *
 * ★完全純関数（DB を見ない・入力は全て引数・Date.now() 等も不使用）＝決定性:
 *   走査順は 日付昇順 → 帯 fromMin 昇順、候補の同値タイブレークは入力 wishes の配列順
 *   （Array.sort は ES2019+ で stable）。同一入力→同一出力を verify が assert する。
 *
 * ルール（設計書 §4 逐語）:
 *  - need = 帯 required −（その日その帯に重なる既存 shifts 数）− 本実行の割当済み（SD-7 単層縮退）
 *  - 重なり＝半開区間 [hm2min(start), hm2min(end)) × [fromMin, toMin)。
 *    ★shift-board の bandStatsOf・RPC の overlap 判定と**同式**（ドリフト不能の単一規則）。
 *    シフト終了は 47:59 まで（30時間制）だがバンド上限 1440 との交差はそのまま成立する。
 *  - 候補 = その日に pending wish があり帯に重なる cast ∧ 同日未割当（SD-9・既存行も含めて1日1枠）
 *    ∧ max_consec_days 違反しない（★hard 除外＝donor の soft 配置とは違い、違反配置を作らない。
 *    たたき台に警告付きで置くより、置かずに unassigned へ落として店長に判断させる）
 *  - ソート2鍵: ① min_month_min 未達の cast を先に（rules が null／min_month_min が null なら鍵①スキップ）
 *              ② 見込分（当月既存 + 本実行割当）の昇順＝公平。同値は安定ソート。
 *  - 出力 = { assignWishIds, shortages(日×帯), unassignedWishes, warnings }。
 *    warnings は under_min_month_min の1種（donor の under_min_month_h の縮退＝月次未達の可視化。
 *    hard 除外の連勤・枠なしは unassignedWishes 側に現れる）。
 *
 * 連勤・見込分の入力契約（呼び出し側の責務・二重計上防止）:
 *  - existing は「期間内の既存 shifts 全 status」＝帯被覆・1日1枠・連勤の判定に使う。
 *    期間境界の外は見ない（v1 の割り切り＝境界連勤は店長が目視）。
 *  - monthMinutes は「castId → 当月の確定/計画の見込分（分）」＝鍵②の基準。
 *    ★existing の分も含めて呼び出し側が数える（本関数は existing を分に再計上しない）。
 */
import { hm2min, min2hm, spanMinutes } from "./shift-time";

export interface AutoWish {
  id: string;
  castId: string;
  date: string; // "YYYY-MM-DD"
  startHm: string; // "HH:MM"（00:00〜23:59）
  endHm: string; // "HH:MM"（00:00〜47:59・24h 超表記）
}
export interface AutoNeedBand {
  dow: number; // 0=日..6=土
  fromMin: number; // 0..1440
  toMin: number;
  required: number;
}
export interface AutoExistingShift {
  castId: string;
  date: string;
  startHm: string;
  endHm: string;
}
export interface AutoRules {
  maxConsecDays: number | null; // null=無制限
  minMonthMin: number | null; // null=鍵①スキップ
}
export interface AutoAssignInput {
  startDate: string; // 含む
  endDate: string; // 含む
  needs: AutoNeedBand[];
  wishes: AutoWish[]; // pending のみ（呼び出し側で絞る）
  existing: AutoExistingShift[]; // 期間内の既存 shifts（全 status）
  monthMinutes: Record<string, number>; // castId → 当月見込分（existing 込みで呼び出し側が算出）
  rules: AutoRules | null;
  isClosedDay: (date: string) => boolean; // 定休日（DB 非依存＝関数で受ける）
}
export interface AutoShortage {
  date: string;
  band: string; // "20:00〜24:00"（終日は "終日"）＝shift-board の bandLabel と同表記
  short: number;
}
export interface AutoUnassigned {
  wishId: string;
  castId: string;
  date: string;
}
export interface AutoWarning {
  castId: string;
  type: "under_min_month_min";
  detail: string; // 例 "最低月間100h に対し 82h"
}
export interface AutoAssignResult {
  assignWishIds: string[];
  shortages: AutoShortage[];
  unassignedWishes: AutoUnassigned[];
  warnings: AutoWarning[];
}

// 帯×時間窓の交差（半開区間・RPC overlap / shift-board bandStatsOf と同式）。
const overlaps = (startHm: string, endHm: string, fromMin: number, toMin: number): boolean =>
  hm2min(startHm) < toMin && fromMin < hm2min(endHm);

// 帯表示（shift-board の bandLabel と同表記＝UI と shortages が同じ語で並ぶ）。
const bandLabel = (fromMin: number, toMin: number): string =>
  fromMin === 0 && toMin === 1440 ? "終日" : `${min2hm(fromMin)}〜${min2hm(toMin)}`;

// 暦日ユーティリティ（TZ 非依存の純粋日算術＝shift-time addDay と同じ UTC 基準）。
const dayNum = (d: string): number => {
  const [y, m, dd] = d.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, dd) / 86400000);
};
const dowOf = (d: string): number => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
};
const eachDate = (start: string, end: string): string[] => {
  const out: string[] = [];
  for (let t = dayNum(start); t <= dayNum(end); t++) {
    const nd = new Date(t * 86400000);
    out.push(
      `${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, "0")}-${String(nd.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return out;
};

// date を足したときの連続勤務日数（前後に連なる既存勤務日を数える＝donor consecIfAdded の縮退）。
function consecIfAdded(worked: Set<number>, date: string): number {
  const d = dayNum(date);
  let len = 1;
  for (let x = d - 1; worked.has(x); x--) len++;
  for (let x = d + 1; worked.has(x); x++) len++;
  return len;
}

export function autoAssign(input: AutoAssignInput): AutoAssignResult {
  const maxConsec = input.rules?.maxConsecDays ?? null;
  const minMonth = input.rules?.minMonthMin ?? null;

  // 見込分（鍵②）: 入力の当月見込みを基準に、本実行の割当を加算していく。
  const proj = new Map<string, number>();
  const projOf = (castId: string): number => proj.get(castId) ?? input.monthMinutes[castId] ?? 0;

  // 勤務日集合（連勤・1日1枠）: existing 由来＋本実行の割当。
  const workedDays = new Map<string, Set<number>>(); // castId → dayNum 集合
  const workedOf = (castId: string): Set<number> => {
    let s = workedDays.get(castId);
    if (!s) { s = new Set(); workedDays.set(castId, s); }
    return s;
  };
  for (const e of input.existing) workedOf(e.castId).add(dayNum(e.date));

  const assignWishIds: string[] = [];
  const assignedWishes: AutoWish[] = []; // 帯被覆の算入用
  const assignedSet = new Set<string>();
  const shortages: AutoShortage[] = [];

  for (const date of eachDate(input.startDate, input.endDate)) {
    if (input.isClosedDay(date)) continue;
    const dow = dowOf(date);
    const dayBands = input.needs
      .filter((n) => n.dow === dow)
      .slice()
      .sort((a, b) => a.fromMin - b.fromMin); // fromMin 昇順＝決定性
    if (dayBands.length === 0) continue;

    const dayExisting = input.existing.filter((e) => e.date === date);

    for (const band of dayBands) {
      // need = required −（既存の交差）−（本実行で割当済みの交差）
      const covered =
        dayExisting.filter((e) => overlaps(e.startHm, e.endHm, band.fromMin, band.toMin)).length +
        assignedWishes.filter((w) => w.date === date && overlaps(w.startHm, w.endHm, band.fromMin, band.toMin)).length;
      let need = band.required - covered;
      if (need <= 0) continue;

      while (need > 0) {
        // 候補: pending wish（この日・この帯に重なる）∧ 未採用 ∧ 同日未割当（1日1枠・既存行含む）
        //       ∧ 連勤ガード（hard）。順序は入力 wishes の配列順＝安定。
        const cands = input.wishes.filter((w) => {
          if (w.date !== date) return false;
          if (assignedSet.has(w.id)) return false;
          if (!overlaps(w.startHm, w.endHm, band.fromMin, band.toMin)) return false;
          if (workedOf(w.castId).has(dayNum(date))) return false; // SD-9: 1日1枠（既存行・本実行とも）
          if (maxConsec != null && consecIfAdded(workedOf(w.castId), date) > maxConsec) return false;
          return true;
        });
        if (cands.length === 0) break;
        const sorted = cands.slice().sort((a, b) => {
          if (minMonth != null) {
            const aU = projOf(a.castId) < minMonth;
            const bU = projOf(b.castId) < minMonth;
            if (aU !== bU) return aU ? -1 : 1; // ① 未達を先に
          }
          return projOf(a.castId) - projOf(b.castId); // ② 公平＝見込分昇順（同値は stable）
        });
        const pick = sorted[0];
        assignWishIds.push(pick.id);
        assignedWishes.push(pick);
        assignedSet.add(pick.id);
        workedOf(pick.castId).add(dayNum(date));
        proj.set(pick.castId, projOf(pick.castId) + spanMinutes(pick.startHm, pick.endHm));
        need--;
      }
      if (need > 0) shortages.push({ date, band: bandLabel(band.fromMin, band.toMin), short: need });
    }
  }

  // 希望過多枠: 期間内の pending wish のうち採用されなかったもの（定休日・帯なし・枠なし・連勤・1日1枠負け）。
  const s0 = dayNum(input.startDate);
  const e0 = dayNum(input.endDate);
  const unassignedWishes: AutoUnassigned[] = input.wishes
    .filter((w) => { const d = dayNum(w.date); return d >= s0 && d <= e0 && !assignedSet.has(w.id); })
    .map((w) => ({ wishId: w.id, castId: w.castId, date: w.date }));

  // 月次警告（donor under_min_month_h の縮退）: 登場 cast のうち最終見込みが min 未達の人を可視化。
  const warnings: AutoWarning[] = [];
  if (minMonth != null) {
    const seen = new Set<string>();
    for (const w of input.wishes) {
      if (seen.has(w.castId)) continue;
      seen.add(w.castId);
      const m = projOf(w.castId);
      if (m < minMonth) {
        warnings.push({
          castId: w.castId,
          type: "under_min_month_min",
          detail: `最低月間${Math.round(minMonth / 60)}h に対し ${Math.round(m / 60)}h`,
        });
      }
    }
  }

  return { assignWishIds, shortages, unassignedWishes, warnings };
}
