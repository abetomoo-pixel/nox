/* 売上カテゴリ5分類の写像（E8-6 分類純関数・DB を知らない）。
 *
 * 正本の写像＝E8-2 日報（report-board.tsx の kindSums）で出荷済みの5分類と同値:
 *   セット・延長 = kind 'time' | 'set'／ドリンク = 'drink'／シャンパン = 'champ'／
 *   ボトル = 'bottle'／指名・その他 = 残り（'charge'・'custom'・未知 kind の fail-safe）。
 *   'discount' は5分類の外（正値化して別掲＝E8-2 と同じ扱い）。
 * fee_kind（mig0084 凍結列）は補助情報:
 *   - 'set'/'extension' を持つ行は kind によらずセット・延長へ（live 実測では kind='time' にのみ
 *     載っており、この規則は E8-2 写像と全行同値。kind 側が読めない出力形への将来耐性のみ）。
 *   - 'hon_shimei'/'jonai_shimei'/'dohan' は「指名・その他」内の指名料内訳（nomFee）として別掲。
 * 入力 = { kind, fee_kind, amount }[]＝T4 集計 RPC（mig0096 予定）の出力行をそのまま渡せる形。
 *   amount は line_total 想定（CHECK で >= 0 だが、負値が来ても discount は絶対値・他は加算のまま
 *   素通し＝ここで丸めや符号の発明をしない）。
 */

export type CategoryKey = "time" | "drink" | "champ" | "bottle" | "other";

export const CATEGORY_ORDER: readonly CategoryKey[] = ["time", "drink", "champ", "bottle", "other"];

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  time: "セット・延長",
  drink: "ドリンク",
  champ: "シャンパン",
  bottle: "ボトル",
  other: "指名・その他",
};

export type CategoryLine = { kind: string; fee_kind?: string | null; amount: number };

export type CategorySums = {
  cats: Record<CategoryKey, number>;
  /** kind='discount' の合計（正値・5分類の外＝E8-2 と同じ別掲） */
  discount: number;
  /** 「指名・その他」のうち指名料の内訳（fee_kind 凍結値ベース・表示補助） */
  nomFee: { hon: number; jonai: number; dohan: number };
  /** 5分類の合計（discount を含まない・サ料前＝明細行の総和） */
  total: number;
};

/** 1行の帰属先。'discount' は5分類の外を示す。 */
export function categoryOf(kind: string, feeKind?: string | null): CategoryKey | "discount" {
  if (kind === "discount") return "discount";
  if (kind === "time" || kind === "set") return "time";
  if (kind === "drink") return "drink";
  if (kind === "champ") return "champ";
  if (kind === "bottle") return "bottle";
  // charge / custom / 未知 kind: fee_kind がセット系なら time（将来耐性・live では全行同値）
  if (feeKind === "set" || feeKind === "extension") return "time";
  return "other";
}

export function sumCategories(lines: readonly CategoryLine[]): CategorySums {
  const cats: Record<CategoryKey, number> = { time: 0, drink: 0, champ: 0, bottle: 0, other: 0 };
  const nomFee = { hon: 0, jonai: 0, dohan: 0 };
  let discount = 0;
  for (const l of lines) {
    const c = categoryOf(l.kind, l.fee_kind);
    if (c === "discount") {
      discount += Math.abs(l.amount);
      continue;
    }
    cats[c] += l.amount;
    if (c === "other") {
      if (l.fee_kind === "hon_shimei") nomFee.hon += l.amount;
      else if (l.fee_kind === "jonai_shimei") nomFee.jonai += l.amount;
      else if (l.fee_kind === "dohan") nomFee.dohan += l.amount;
    }
  }
  const total = cats.time + cats.drink + cats.champ + cats.bottle + cats.other;
  return { cats, discount, nomFee, total };
}
