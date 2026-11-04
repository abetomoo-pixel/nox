// ★便 A M-67（2026-11-04・教訓133 追記）: 時刻入力の共通部品＝TimePicker。本体は便 M5b M-51 の TimeInput（初期設定「営業終了」と同じ＝時・分の 2 列を押して選ぶ・翌日は「翌02:00」・after で翌日判定）。
//   名前だけ TimePicker にそろえる（1 つの部品を 2 つの名前で持たない＝再エクスポート）。26:00 の手打ちは小窓の中だけ（欄に直接は打たない）。
export { default } from "./time-input";
export { default as TimeInput } from "./time-input";
