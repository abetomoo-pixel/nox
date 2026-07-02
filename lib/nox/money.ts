// お金の丸め集約（BANZEN payroll の roundYen 集約方針の翻訳）。
// pay.ts 内の丸めはすべてこの2関数を経由する。
// 税理士が floor 指定なら roundYen だけを差し替える（呼び出し側は不変）。

/** 円の丸め（現状 Math.round・モック忠実） */
export function roundYen(n: number): number {
  return Math.round(n);
}

/** 0.1 単位の丸め（日次pt按分・労働時間の集計に使用） */
export function roundPt1(n: number): number {
  return Math.round(n * 10) / 10;
}
