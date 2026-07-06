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

/**
 * 手取りの下限（F2e-1 売掛天引きの budget 計算に使用）。
 * 暫定 0（＝手取り0まで天引き可）。★社労士ゲート TODO: 最低手取り保証額に差し替え可能な1箇所
 * （roundYen と同型の集約点＝呼び出し側 core.ts は不変で下限だけ差替）。
 */
export function takeHomeFloor(): number {
  return 0;
}
