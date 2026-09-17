// lib/nox/shift/late.ts — 裁定268（2026-09-17）: 遅刻分数の純関数（DB を知らない・shift-time の hm2min のみ）。
//
//  lateMinutesOf(startHm, inPunchHm, graceMin)
//   = 打刻 in − 確定開始 が猶予 graceMin を**超える**ときだけ、その差（分・開始からの素値＝punch-match.ts の
//     `{ type: "late", min: h }` の h と同じ「grace を引かない」値）を返す。猶予以内（ちょうども含む）・打刻なし・開始なしは null。
//   閾値の式は shift-board の KPI 未着判定（旧 825 行 `now ≥ start + late_grace_min`）と punch-match の遅刻判定
//   （`h > lateGrace`・147 行）を 1 箇所に寄せたもの＝**KPI 側も本関数を呼ぶ**（式を 2 箇所に持たない・裁定268）。
//   ★境界: punch-match と同じく「猶予ちょうど」は遅刻でない（`>`）。旧 825 行は `>=` だったため、未着の判定は
//     猶予ちょうどの 1 分だけ遅刻側と揃う方向へ動く（同じ閾値＝裁定268 本文）。
//   日跨ぎ: start_hm は 30 時間制（25:30 等）・打刻 HH:MM は 24 時間表示（01:35 等）のことがあるため、
//     差が −12 時間より小さいときは +24h して読む（25:30 に対する 01:40 → +10）。
import { hm2min } from "@/lib/nox/shift-time";

const HM_RE = /^\d{1,2}:\d{2}$/;

export function lateMinutesOf(startHm: string | null | undefined, inPunchHm: string | null | undefined, graceMin: number): number | null {
  if (!startHm || !inPunchHm || !HM_RE.test(startHm) || !HM_RE.test(inPunchHm)) return null;
  const grace = Number.isFinite(graceMin) && graceMin >= 0 ? graceMin : 0;
  let diff = hm2min(inPunchHm) - hm2min(startHm);
  if (diff < -720) diff += 1440; // 日跨ぎ（30 時間制の開始 vs 24 時間表示の打刻）
  return diff > grace ? diff : null;
}
