/* 打刻突合純関数（台帳 #20・F2a）。
 * 実装元: docs/NOX_payOf_精密仕様_モック抽出.md §4.1（モック vp/lx/ux の実測確定規則）
 *         ＋ §4.2（沈黙部 S1〜S8 の裁定・S3 status→final 対応表）。
 * 原則:
 *  - DB を知らない純関数（pay.ts と同じ案1）。出力 lateN/absentN が payOf の fine 入力。
 *  - 時刻は 'HH:MM' の 0-47 域（shift-time.ts の hm2min 域）・分粒度。
 *    punches（timestamptz）の営業日帰属（biz-date.ts）と分未満切り捨て（S6）、
 *    給与期間での絞り込み（S5）は呼び出し側の責務＝本関数は渡された日だけを裁く。
 *  - モックの tx/sx（デモ生成器）は翻訳対象外（§4.1・in の捏造フォールバックを持ち込まない）。
 *  - モックの Zu 翌非対応（深夜着が ok に化ける fail-open）は不採用（S4）＝0-47 域で比較。
 * 日次ペアへの解決（イベント列→{in,out}）:
 *  - in は最初（最早）の punch を採用・2つ目以降は無視して anomaly 'in_in'（S1・後打ちで遅刻を消せない）。
 *  - out は最後（最遅）の punch を採用。out は罰金非接続・表示専用（§4.1）のため複数 out に
 *    anomaly は付けない（訂正は F3 fix_requests＝台帳 #22 の管轄）。
 *  - out のみで in が無い日は absent のまま anomaly 'orphan_out'（S2・出勤の証拠と認めない）。
 * attendance（判断層）は raw/final 二段（S3）: raw＝shift×punch のみを常に算出し、
 * status がある日は対応表で final を決める。raw と final の type が異なる日は
 * anomaly 'attendance_conflict'（呼び出し側が audit 痕跡・UI 警告に使う）。
 * 閾値 10/30/90 は penalty_config の店設定化予定（S7・DB 化は F2a mig）＝ここでは既定値。 */

import { hm2min } from "./shift-time";

// ── 型（精密仕様 §4.2 配置・提示シグネチャ） ─────────────────────

export type PunchEvent = { kind: "in" | "out"; at: string }; // at: 'HH:MM' 0-47 域・分粒度

export type ShiftDay = { bizDate: string; start: string; end: string }; // 確定シフト

export type AttendanceStatus = "shukkin" | "dohan" | "late" | "off" | "absent"; // mig0008 と同域

export type AttendanceDay = { bizDate: string; status: AttendanceStatus };

export type InVerdict =
  | { type: "no_shift" } // 判定対象外（罰金不算入。モック vp の null）
  | { type: "absent" }
  | { type: "late"; min: number; act: string } // min は超過素値（grace を引かない）
  | { type: "ok"; act: string };

export type OutVerdict =
  | { type: "noout" }
  | { type: "early"; min: number; out: string } // close − out > earlyGraceMin（strict）
  | { type: "over"; min: number; out: string } // out − close > overGraceMin（strict）
  | { type: "ok"; out: string };

export type PunchAnomaly = "in_in" | "orphan_out" | "attendance_conflict";

export type DayResolution = {
  bizDate: string;
  raw: { in: InVerdict; out: OutVerdict }; // shift×punch のみ（モック忠実・監査用に常置）
  final: InVerdict; // S3 対応表適用後＝罰金カウントの正
  anomalies: PunchAnomaly[];
};

export type PunchMatchConfig = {
  close: string; // 店の閉店時刻（'HH:MM' 0-47 域。モック na.close '01:00' は '25:00' として渡す）
  lateGraceMin?: number; // 既定 10（in − start がこれを超えたら late）
  earlyGraceMin?: number; // 既定 30（close − out がこれを超えたら early）
  overGraceMin?: number; // 既定 90（out − close がこれを超えたら over）
};

export type PunchMatchResult = {
  lateN: number; // final 基準の遅刻回数（payOf の fine.lateN）
  absentN: number; // final 基準の当欠回数（payOf の fine.absentN）
  days: DayResolution[]; // bizDate 昇順
};

export const LATE_GRACE_MIN_DEFAULT = 10;
export const EARLY_GRACE_MIN_DEFAULT = 30;
export const OVER_GRACE_MIN_DEFAULT = 90;

// ── S3 status→final 対応表（§4.2・無条件適用＝shift の有無に依らない） ──
// late の min は punch 由来（in と start が揃えば max(0, in−start)・揃わなければ 0＝回数罰金のみ）。
function applyAttendance(status: AttendanceStatus, raw: InVerdict, punchMin: number | null): InVerdict {
  switch (status) {
    case "shukkin":
    case "dohan": {
      // punch の late を打ち消し。act は punch があればそれを保持
      const act = raw.type === "late" || raw.type === "ok" ? raw.act : "";
      return { type: "ok", act };
    }
    case "late": {
      const act = raw.type === "late" || raw.type === "ok" ? raw.act : "";
      return { type: "late", min: punchMin ?? 0, act };
    }
    case "absent":
      return { type: "absent" }; // punch があっても absent
    case "off":
      return { type: "no_shift" }; // 罰金不算入（店都合取り消し）
  }
}

export function matchPunches(input: {
  shifts: ShiftDay[];
  punches: Record<string /* bizDate */, PunchEvent[]>;
  attendance: AttendanceDay[];
  config: PunchMatchConfig;
}): PunchMatchResult {
  const lateGrace = input.config.lateGraceMin ?? LATE_GRACE_MIN_DEFAULT;
  const earlyGrace = input.config.earlyGraceMin ?? EARLY_GRACE_MIN_DEFAULT;
  const overGrace = input.config.overGraceMin ?? OVER_GRACE_MIN_DEFAULT;
  const closeMin = hm2min(input.config.close);

  // 同一 bizDate の重複 shift/attendance は最初の行を採用（スキーマは部分ユニークで重複しない前提）
  const shiftByDate = new Map<string, ShiftDay>();
  for (const s of input.shifts) if (!shiftByDate.has(s.bizDate)) shiftByDate.set(s.bizDate, s);
  const attByDate = new Map<string, AttendanceDay>();
  for (const a of input.attendance) if (!attByDate.has(a.bizDate)) attByDate.set(a.bizDate, a);

  // 判定対象日＝入力に現れる全営業日の和集合（shift 無し punch 有りの日も raw を返す＝UI 警告用）
  const dates = new Set<string>([
    ...shiftByDate.keys(),
    ...Object.keys(input.punches),
    ...attByDate.keys(),
  ]);

  const days: DayResolution[] = [];
  let lateN = 0;
  let absentN = 0;

  for (const bizDate of [...dates].sort()) {
    const shift = shiftByDate.get(bizDate) ?? null;
    const events = input.punches[bizDate] ?? [];
    const anomalies: PunchAnomaly[] = [];

    // イベント列→日次ペア（時刻昇順の安定ソート・S1: 最初の in／out は最後）
    const sorted = [...events].sort((a, b) => hm2min(a.at) - hm2min(b.at));
    const ins = sorted.filter((e) => e.kind === "in");
    const outs = sorted.filter((e) => e.kind === "out");
    const inAt = ins.length > 0 ? ins[0].at : null;
    const outAt = outs.length > 0 ? outs[outs.length - 1].at : null;
    if (ins.length > 1) anomalies.push("in_in");
    if (outs.length > 0 && ins.length === 0) anomalies.push("orphan_out");

    // raw.in（モック vp 忠実・比較は 0-47 域＝S4）
    let rawIn: InVerdict;
    let punchMin: number | null = null; // attendance='late' に渡す punch 由来分数
    if (!shift) {
      rawIn = { type: "no_shift" };
    } else if (inAt === null) {
      rawIn = { type: "absent" }; // out の有無は不問（S2）
    } else {
      const h = hm2min(inAt) - hm2min(shift.start);
      punchMin = Math.max(0, h);
      rawIn = h > lateGrace ? { type: "late", min: h, act: inAt } : { type: "ok", act: inAt };
    }

    // raw.out（モック ux 忠実・罰金非接続・表示専用）
    let rawOut: OutVerdict;
    if (outAt === null) {
      rawOut = { type: "noout" };
    } else {
      const g = hm2min(outAt) - closeMin;
      rawOut =
        g < -earlyGrace
          ? { type: "early", min: -g, out: outAt }
          : g > overGrace
            ? { type: "over", min: g, out: outAt }
            : { type: "ok", out: outAt };
    }

    // final（S3 対応表。status 無し＝raw のまま）
    const att = attByDate.get(bizDate) ?? null;
    const final = att ? applyAttendance(att.status, rawIn, punchMin) : rawIn;
    if (att && final.type !== rawIn.type) anomalies.push("attendance_conflict");

    if (final.type === "late") lateN++;
    else if (final.type === "absent") absentN++;

    days.push({ bizDate, raw: { in: rawIn, out: rawOut }, final, anomalies });
  }

  return { lateN, absentN, days };
}
