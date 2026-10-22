// ★便 SH-UI-c C-1／C-2（2026-10-22）: 勤怠一覧（純関数・DB を知らない）。
//   実働 h は給与と**同じ関数**で出す＝loadPunch（collect.ts）と同じ経路 buildMatchInput（punch-io）→ matchPunches（punch-match）→ dayWorkedHours（punch-io）。
//   計算基準 'shift'（確定シフトどおり）の店は pay.ts wageDetail の前段（payOf 613 行）と同じ置換＝実打刻 h>0 の日だけ確定シフトの時間に置き換える。
//   丸め＝roundPt1（小数 1 桁）＝pay.ts の wHours と同じ。日数＝punchCountsUpToOf（final ok／late・営業日の今日まで）＝給与の days。
//   遅刻／当欠＝final（S3 対応表の後）・早退＝raw.out 'early'（罰金非接続・表示だけ）。連絡＝attendance.source 'self' の updated_at。
//   店の修正＝punch_corrections（approved）＝修正者・時刻・元の値（audit_logs は owner 限定の RLS のため読まない）。
//   送り＝transport（当日 biz_date・cancelled 除外・mode は 0177 後＝無ければ actual）。
import { roundPt1 } from "../money";
import { buildMatchInput, dayWorkedHours, type AttendanceRow, type PunchRow, type ShiftRow } from "../punch-io";
import { matchPunches, type DayResolution } from "../punch-match";
import { punchCountsUpToOf } from "./anomaly";
import { hm2min, min2hm } from "../shift-time";
import { OKURI_MODE_LABEL, type OkuriMode } from "../shift/okuri-mode";

export type SheetPunch = PunchRow & { id?: string; source?: string | null; okuri?: boolean | null };
export type SheetAttendance = AttendanceRow & { eta?: string | null; reason?: string | null; source?: string | null; updated_at?: string | null };
export type SheetCorrection = { punch_id?: string | null; biz_date: string; kind: "in" | "out"; before_at: string | null; after_at: string | null; reason: string; decided_by_name?: string | null; decided_at?: string | null; decision: string };
export type SheetTransport = { biz_date: string; amount: number; mode?: string | null; status?: string | null };
export type SheetFine = { biz_date?: string | null; reason?: string | null; amount: number };

export type AttendanceDayRow = {
  bizDate: string;
  /** 確定シフト（0-47 域 HH:MM）。無ければ null */
  shift: { start: string; end: string } | null;
  /** 実打刻 出／退（0-47 域 HH:MM・翌表記は hm47Ja で） */
  inHm: string | null; outHm: string | null;
  /** 店の修正（approved の punch_corrections） */
  corrections: { kind: "in" | "out"; by: string | null; at: string | null; before: string | null; after: string | null; reason: string }[];
  /** 遅刻／当欠／早退（final 遅刻・final 当欠・raw.out 早退） */
  late: boolean; absent: boolean; early: boolean;
  /** 連絡（attendance.source 'self'）＝「連絡あり HH:MM」の時刻（JST）・無ければ null */
  contactAt: string | null;
  /** 実働 h（丸め後・基準適用後）＋基準の印 */
  hours: number; basis: "punch" | "shift";
  /** 送り（当日の transport・cancelled 除外） */
  okuri: { n: number; modes: string[] };
  /** 備考＝連絡の本文・罰金の有無 */
  note: string;
  /** 退勤記録なし（in あり・out なし＝給与の不整合と同じ） */
  missingOut: boolean;
  /** 営業日の今日より後（未来日＝合計に数えない） */
  future: boolean;
  /** 判定（final＝S3 対応表の後）＝日数の定義（ok／late を数える＝給与の days と同じ） */
  final: "ok" | "late" | "absent" | "no_shift" | null;
};
export type AttendanceSummary = { days: number; hours: number; lateN: number; absentN: number; earlyN: number; okuriN: number; missingOutN: number };

/** 0-47 域の HH:MM → 「翌01:30」表記（24:00 以上）。null は — */
export function hm47Ja(hm: string | null | undefined): string {
  if (!hm) return "—";
  const m = hm2min(hm);
  return m >= 1440 ? `翌${min2hm(m % 1440)}` : hm;
}
/** ISO → JST HH:MM（表示用） */
export function jstHm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" });
}
/** ISO → JST M/D HH:MM（修正の時刻） */
export function jstMdHm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return null;
  const s = d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" });
  return s.replace(/\s+/, " ");
}

export type AttendanceSheetInput = {
  punches: SheetPunch[]; shifts: ShiftRow[]; attendance: SheetAttendance[];
  corrections?: SheetCorrection[]; transports?: SheetTransport[]; fines?: SheetFine[];
  cutoffHm: string; closeHm: string;
  grace?: { lateGrace?: number; earlyGrace?: number; overGrace?: number };
  /** 店の計算基準（'shift'＝確定シフトどおり・既定 'punch'） */
  payTimeBasis?: "punch" | "shift";
  /** 営業日の今日（未来日は合計に数えない＝裁定342） */
  todayBiz: string;
  /** 期間（YYYY-MM-DD・両端含む）。渡せば期間の全日を行にする（打刻の無い日も）・無ければ打刻／シフトのある日だけ */
  periodStart?: string; periodEnd?: string;
};

const ymdAdd = (ymd: string, n: number): string => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** 1 人 1 か月の行（日付昇順）。hours は給与と同じ関数（dayWorkedHours＋'shift' 置換）・丸めは行ごと roundPt1 */
export function attendanceDayRowsOf(input: AttendanceSheetInput): AttendanceDayRow[] {
  const built = buildMatchInput({ punches: input.punches, shifts: input.shifts, attendance: input.attendance.map((a) => ({ date: a.date, status: a.status })), cutoffHm: input.cutoffHm });
  const m = matchPunches({ ...built, config: { close: input.closeHm, lateGraceMin: input.grace?.lateGrace, earlyGraceMin: input.grace?.earlyGrace, overGraceMin: input.grace?.overGrace } });
  const byDate = new Map<string, DayResolution>(m.days.map((d) => [d.bizDate, d]));
  const shiftByDate = new Map(input.shifts.map((s) => [s.date, s]));
  const attByDate = new Map(input.attendance.map((a) => [a.date, a]));
  const shiftHours: Record<string, number> = {};
  for (const s of input.shifts) shiftHours[s.date] = (shiftHours[s.date] ?? 0) + Math.max(0, (hm2min(s.end_hm) - hm2min(s.start_hm)) / 60);
  const dates = new Set<string>();
  if (input.periodStart && input.periodEnd) { for (let d = input.periodStart; d <= input.periodEnd; d = ymdAdd(d, 1)) dates.add(d); }
  else { for (const d of byDate.keys()) dates.add(d); for (const s of input.shifts) dates.add(s.date); }
  const rows: AttendanceDayRow[] = [];
  for (const bizDate of [...dates].sort()) {
    const d = byDate.get(bizDate);
    const ev = built.punches[bizDate] ?? [];
    const sorted = [...ev].sort((a, b) => hm2min(a.at) - hm2min(b.at));
    const ins = sorted.filter((e) => e.kind === "in"), outs = sorted.filter((e) => e.kind === "out");
    const inHm = ins[0]?.at ?? null, outHm = outs.length > 0 ? outs[outs.length - 1].at : null;
    const rawHours = d ? dayWorkedHours(d) : 0;
    const basis: "punch" | "shift" = input.payTimeBasis === "shift" && rawHours > 0 && shiftHours[bizDate] !== undefined ? "shift" : "punch";
    const hours = roundPt1(basis === "shift" ? shiftHours[bizDate] : rawHours); // pay.ts 613 と同じ置換
    const sh = shiftByDate.get(bizDate) ?? null;
    const att = attByDate.get(bizDate);
    const corr = (input.corrections ?? []).filter((c) => c.biz_date === bizDate && c.decision === "approved").map((c) => ({ kind: c.kind, by: c.decided_by_name ?? null, at: jstMdHm(c.decided_at), before: jstHm(c.before_at), after: jstHm(c.after_at), reason: c.reason }));
    const trs = (input.transports ?? []).filter((t) => t.biz_date === bizDate && t.status !== "cancelled");
    const fines = (input.fines ?? []).filter((f) => f.biz_date === bizDate);
    const future = bizDate > input.todayBiz;
    const noteParts: string[] = [];
    if (att?.reason) noteParts.push(att.reason);
    if (fines.length > 0) noteParts.push(`罰金 ${fines.map((f) => `¥${f.amount.toLocaleString()}`).join("・")}`);
    rows.push({
      bizDate, shift: sh ? { start: sh.start_hm, end: sh.end_hm } : null, inHm, outHm, corrections: corr,
      late: !!d && d.final.type === "late" && !future, absent: !!d && d.final.type === "absent" && !future, early: !!d && d.raw.out.type === "early" && !future,
      contactAt: att && att.source === "self" && (att.status === "late" || att.status === "absent") ? jstHm(att.updated_at) : null,
      hours, basis, okuri: { n: trs.length, modes: [...new Set(trs.map((t) => OKURI_MODE_LABEL[((t.mode ?? "actual") as OkuriMode)] ?? String(t.mode)))] },
      note: noteParts.join("・"), missingOut: !!d && !future && d.raw.in.type !== "no_shift" && d.raw.in.type !== "absent" && d.raw.out.type === "noout" && !!inHm, future,
      final: d ? d.final.type : null,
    });
  }
  return rows;
}

/** 合計表の 1 行（給与の同じ数字と一致する定義＝days は final ok／late の今日まで・hours は行の和を roundPt1） */
export function attendanceSummaryOf(rows: readonly AttendanceDayRow[], todayBiz: string): AttendanceSummary {
  const { days, lateN, absentN } = punchCountsUpToOf(rows.filter((r) => r.final !== null).map((r) => ({ bizDate: r.bizDate, finalType: r.final as string })), todayBiz);
  return {
    days, lateN, absentN,
    hours: roundPt1(rows.filter((r) => !r.future).reduce((a, r) => a + r.hours, 0)),
    earlyN: rows.filter((r) => r.early).length,
    okuriN: rows.reduce((a, r) => a + r.okuri.n, 0),
    missingOutN: rows.filter((r) => r.missingOut).length,
  };
}

export const BASIS_MARK: Record<"punch" | "shift", string> = { punch: "実打刻", shift: "確定シフト" };
export const flagsTextOf = (r: Pick<AttendanceDayRow, "late" | "absent" | "early" | "contactAt">): string =>
  [r.late ? "遅刻" : null, r.absent ? "当欠" : null, r.early ? "早退" : null].filter(Boolean).join("・") + (r.contactAt ? `（連絡あり ${r.contactAt}）` : "");
export const correctionTextOf = (c: AttendanceDayRow["corrections"][number], withBy = true): string =>
  `${c.kind === "in" ? "出勤" : "退勤"} ${c.before ?? "（なし）"}→${c.after ?? "（削除）"}${withBy && c.by ? `・${c.by}` : ""}${c.at ? `・${c.at}` : ""}・${c.reason}`;

/** ②の列（CSV と印刷で同じ順） */
export const SHEET_COLUMNS = ["日付", "確定シフト", "出勤", "退勤", "店の修正", "遅刻・当欠・早退", "実働h", "基準", "送り", "備考"] as const;
export function sheetRowCellsOf(r: AttendanceDayRow, opts: { withBy?: boolean } = {}): string[] {
  return [
    r.bizDate,
    r.shift ? `${r.shift.start}–${hm47Ja(r.shift.end)}` : "",
    hm47Ja(r.inHm), r.missingOut ? "退勤記録なし" : hm47Ja(r.outHm),
    r.corrections.map((c) => correctionTextOf(c, opts.withBy ?? true)).join(" / "),
    flagsTextOf(r),
    r.hours > 0 ? String(r.hours) : "",
    r.hours > 0 ? BASIS_MARK[r.basis] : "",
    r.okuri.n > 0 ? `${r.okuri.n}${r.okuri.modes.length ? `（${r.okuri.modes.join("・")}）` : ""}` : "",
    r.note,
  ];
}
/** CSV（UTF-8 BOM・CRLF・②の列・見出し行＝店名・期間・氏名・出力日時） */
export function attendanceCsvOf(meta: { storeName: string; period: string; castName: string; exportedAt: string }, rows: readonly AttendanceDayRow[]): string {
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [
    `# ${meta.storeName} 勤怠 ${meta.period} ${meta.castName} 出力 ${meta.exportedAt}`,
    SHEET_COLUMNS.join(","),
    ...rows.map((r) => sheetRowCellsOf(r).map(esc).join(",")),
  ];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
export const attendanceCsvFileNameOf = (storeName: string, period: string, castName: string): string => `kintai_${storeName}_${period}_${castName}.csv`.replace(/[\\/:*?"<>|\s]/g, "_");
